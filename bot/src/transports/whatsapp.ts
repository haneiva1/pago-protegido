// Transporte WhatsApp Cloud API: webhook (GET de verificación y POST de mensajes) y envío por la Graph API.
// El bot nunca tiene llaves de billeteras: solo el token de WhatsApp para mandar mensajes.

import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";
import type { OutMsg } from "../engine/messages.ts";
import { esBsuid } from "../engine/parse.ts";

export interface Incoming {
  id: string;
  /** Teléfono (wa_id) o, si WhatsApp no lo comparte, el ID de la persona para este negocio (BSUID: "BO.1234…"). */
  from: string;
  text: string;
  name?: string;
  /** Cuándo lo mandó la persona (ms): desde ahí corre la ventana de 24 horas. */
  at?: number;
  /** Audio, sticker, foto sin texto…: el bot no lo lee y contesta que solo entiende texto. */
  noLegible?: boolean;
}

/** Estado de un mensaje que mandó el bot (webhook `statuses`). Los errores de Meta pueden llegar recién por acá. */
export interface EstadoEnvio {
  id: string;
  status: string;
  to?: string;
  code?: number;
  detalle?: string;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MEDIOS = new Set(["audio", "image", "video", "document", "sticker", "location", "contacts", "order"]);

function valores(body: Json, phoneNumberId?: string): Json[] {
  const out: Json[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      if (!v) continue;
      // La misma cuenta de WhatsApp puede tener otros números: se atiende solo el de este bot.
      const id = v.metadata?.phone_number_id;
      if (phoneNumberId && id && String(id) !== phoneNumberId) continue;
      out.push(v);
    }
  }
  return out;
}

/** Mensajes de un POST del webhook: texto, botones y pies de foto. Ignora estados, reacciones y avisos del sistema. */
export function parseWebhook(body: Json, phoneNumberId?: string): Incoming[] {
  const out: Incoming[] = [];
  for (const v of valores(body, phoneNumberId)) {
    if (!Array.isArray(v.messages)) continue;
    const contactos: Json[] = Array.isArray(v.contacts) ? v.contacts : [];
    for (const m of v.messages) {
      let text: string | undefined;
      if (m.type === "text") text = m.text?.body;
      else if (m.type === "interactive") text = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id;
      else if (m.type === "button") text = m.button?.payload ?? m.button?.text;
      else if (MEDIOS.has(m.type)) text = m[m.type]?.caption ?? "";
      if (typeof text !== "string") continue;
      const contacto =
        contactos.find((c) => (m.from && c.wa_id === m.from) || (m.from_user_id && c.user_id === m.from_user_id)) ??
        (contactos.length === 1 ? contactos[0] : undefined);
      const from = m.from ?? contacto?.wa_id ?? m.from_user_id ?? contacto?.user_id;
      if (!from) continue;
      const noLegible = !text.trim() && MEDIOS.has(m.type);
      if (!text.trim() && !noLegible) continue;
      const seg = Number(m.timestamp);
      out.push({
        id: m.id,
        from: String(from),
        text,
        name: contacto?.profile?.name,
        ...(seg > 0 ? { at: seg * 1000 } : {}),
        ...(noLegible ? { noLegible } : {}),
      });
    }
  }
  return out;
}

/** Estados de envío de un POST del webhook. */
export function parseStatuses(body: Json, phoneNumberId?: string): EstadoEnvio[] {
  const out: EstadoEnvio[] = [];
  for (const v of valores(body, phoneNumberId)) {
    for (const s of Array.isArray(v.statuses) ? v.statuses : []) {
      if (!s?.id) continue;
      const e = s.errors?.[0];
      out.push({ id: s.id, status: s.status, to: s.recipient_id, ...(e ? { code: Number(e.code), detalle: e.error_data?.details ?? e.title } : {}) });
    }
  }
  return out;
}

/** GET de verificación de Meta: devuelve hub.challenge si el token coincide. */
export function verifyChallenge(q: URLSearchParams, verifyToken: string): { status: number; body: string } {
  if (verifyToken && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === verifyToken) {
    return { status: 200, body: q.get("hub.challenge") ?? "" };
  }
  return { status: 403, body: "Forbidden" };
}

/** X-Hub-Signature-256 = "sha256=" + HMAC(app secret, cuerpo crudo). Sin app secret, nada es válido. */
export function validSignature(raw: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(raw).digest();
  const got = Buffer.from(header.slice(7), "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** A quién: teléfono en `to` o, si WhatsApp no lo comparte, el BSUID en `recipient`. */
const destino = (to: string) => ({ messaging_product: "whatsapp", recipient_type: "individual", ...(esBsuid(to) ? { recipient: to } : { to }) });

/** Cuerpo de POST /{phone-number-id}/messages: texto, o botones de respuesta (máx. 3, título ≤ 20). */
export function graphPayload(to: string, m: OutMsg): Json {
  const base = destino(to);
  if (m.buttons?.length) {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: m.text.slice(0, 1024) },
        action: {
          buttons: m.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })),
        },
      },
    };
  }
  return { ...base, type: "text", text: { body: m.text.slice(0, 4096), preview_url: true } };
}

export interface Plantilla {
  name: string;
  lang: string;
}

/** Plantilla aprobada, con sus parámetros en orden en el cuerpo. Los parámetros no llevan saltos de línea. */
export function plantillaPayload(to: string, p: Plantilla, params: string[]): Json {
  return {
    ...destino(to),
    type: "template",
    template: {
      name: p.name,
      language: { code: p.lang },
      components: [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t.replace(/\s+/g, " ").trim().slice(0, 200) || "-" })) }],
    },
  };
}

/** Error de la Graph API con su código (131047, 190, …), o del intermediario con su motivo ("insufficient_credits"). */
export class GraphError extends Error {
  readonly motivo?: string;
  constructor(
    readonly status: number,
    readonly code: number | undefined,
    detalle: string,
    o: { api?: string; motivo?: string } = {},
  ) {
    const cual = code || o.motivo;
    super(`${o.api ?? "Graph API"} ${status}${cual ? ` (${cual})` : ""}: ${detalle.slice(0, 300)}`);
    this.motivo = o.motivo;
  }
}

/** Lo que cambia al mandar si hay un proveedor entre el bot y Meta (Kapso). */
export interface Intermediario {
  /** Su credencial, en lugar de `Authorization: Bearer`. */
  cabeceras: Record<string, string>;
  error(status: number, data: Json, texto: string): GraphError;
  /** Errores propios que vale la pena reintentar, además de los de Meta. */
  reintentar(e: GraphError): boolean;
}

/** Fuera de la ventana de 24 horas: solo se pueden mandar plantillas. */
export const FUERA_DE_VENTANA = 131047;
/** Insistir no sirve: el número no está en la lista de prueba, no tiene WhatsApp o no acepta el mensaje. */
const PERMANENTES = new Set([131030, 131026, 131050, 131051]);
/** Vale la pena reintentar enseguida: límite de ritmo o falla pasajera de Meta. */
const PASAJEROS = new Set([1, 2, 4, 80007, 130429, 131000, 131016, 131056]);

export const esPermanente = (code?: number) => code != null && PERMANENTES.has(code);

/** Qué hacer ante un error, para el registro del servicio. */
export function pista(code?: number): string {
  switch (code) {
    case 190:
      return "la credencial de Meta venció o no sirve: genera otra (docs/WHATSAPP.md)";
    case 131030:
      return "ese teléfono no está en la lista de destinatarios del número de prueba (docs/WHATSAPP.md)";
    case FUERA_DE_VENTANA:
      return "pasaron más de 24 horas desde su último mensaje: el aviso queda guardado hasta que escriba";
    case 131026:
      return "WhatsApp no lo puede entregar (sin WhatsApp, versión vieja o términos sin aceptar)";
    case 132000:
    case 132001:
      return "la plantilla no existe, no está aprobada en ese idioma o tiene otra cantidad de variables";
    default:
      return "";
  }
}

export interface GraphConfig {
  token: string;
  phoneNumberId: string;
  version?: string;
  baseUrl?: string;
  /** Sin esto, la Graph API de Meta directa. */
  intermediario?: Intermediario;
  fetchFn?: typeof fetch;
  /** Espera antes de cada reintento (ms). [] = sin reintentos. */
  reintentosMs?: number[];
}

export class GraphSender {
  constructor(private readonly c: GraphConfig) {}

  /** Manda texto o botones y devuelve el ID del mensaje (wamid). */
  send(to: string, m: OutMsg): Promise<string | undefined> {
    return this.post(graphPayload(to, m));
  }

  template(to: string, p: Plantilla, params: string[]): Promise<string | undefined> {
    return this.post(plantillaPayload(to, p, params));
  }

  /** El número que atiende, para el registro de arranque: comprueba que la credencial y el ID van juntos. */
  async numero(): Promise<string> {
    const d = await this.pedir(`${this.c.phoneNumberId}?fields=display_phone_number,verified_name`, { method: "GET" });
    return [d.display_phone_number, d.verified_name && `(${d.verified_name})`].filter(Boolean).join(" ");
  }

  private async post(payload: Json): Promise<string | undefined> {
    const esperas = this.c.reintentosMs ?? [500, 2000];
    for (let i = 0; ; i++) {
      try {
        const d = await this.pedir(`${this.c.phoneNumberId}/messages`, { method: "POST", body: JSON.stringify(payload) });
        return d.messages?.[0]?.id;
      } catch (e) {
        // Un corte por tiempo no se reintenta: Meta puede haberlo recibido y la persona vería el mensaje dos veces.
        const pasajero = e instanceof GraphError ? e.status === 429 || e.status >= 500 || (e.code != null && PASAJEROS.has(e.code)) || !!this.c.intermediario?.reintentar(e) : e instanceof TypeError;
        if (!pasajero || i >= esperas.length) throw e;
        await new Promise((r) => setTimeout(r, esperas[i]));
      }
    }
  }

  private async pedir(ruta: string, init: RequestInit): Promise<Json> {
    const url = `${this.c.baseUrl ?? "https://graph.facebook.com"}/${this.c.version ?? "v23.0"}/${ruta}`;
    const inter = this.c.intermediario;
    const res = await (this.c.fetchFn ?? fetch)(url, {
      ...init,
      headers: { ...(inter ? inter.cabeceras : { authorization: `Bearer ${this.c.token}` }), "content-type": "application/json" },
      // fetch quita `authorization` al seguir una redirección a otro dominio, pero no las demás cabeceras: no se sigue.
      ...(inter ? { redirect: "manual" as const } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const texto = await res.text();
    let data: Json = {};
    try {
      data = JSON.parse(texto);
    } catch {
      /* respuesta sin JSON */
    }
    if (!res.ok && inter) throw inter.error(res.status, data ?? {}, texto);
    if (!res.ok) throw new GraphError(res.status, data.error?.code, data.error?.error_data?.details ?? data.error?.message ?? texto);
    return data;
  }
}

/** Cómo se comprueba y se lee el webhook si no llega directo de Meta (Kapso). */
export interface LectorWebhook {
  firmaValida(raw: Buffer, headers: http.IncomingHttpHeaders): boolean;
  mensajes(body: Json): Incoming[];
  estados(body: Json): EstadoEnvio[];
}

export interface WebhookDeps {
  handle: (from: string, text: string) => Promise<OutMsg[]>;
  send: (to: string, m: OutMsg) => Promise<unknown>;
  verifyToken: string;
  /** Se exige X-Hub-Signature-256 válida: sin la firma de Meta, cualquiera podría hablar en nombre de una tienda. */
  appSecret: string;
  /** Si está, se ignoran los mensajes a otros números de la misma cuenta. */
  phoneNumberId?: string;
  /** Reemplaza la firma y el formato de Meta. Sin esto, el webhook es el de Meta. */
  lector?: LectorWebhook;
  path?: string;
  /** Antes de atender: abre la ventana de 24 horas. */
  onInbound?: (m: Incoming) => void;
  /** Después de contestar: salen los avisos que esperaban a que la persona escribiera. */
  onHandled?: (from: string) => Promise<void>;
  onStatus?: (s: EstadoEnvio) => Promise<void>;
  /** Qué contestar a un audio, un sticker o una foto sin texto. */
  noLegible?: () => OutMsg[];
}

const MAX_CUERPO = 3_000_000; // Meta manda hasta 3 MB por notificación.

/** "59171234567" → "…4567": en los registros no va el número completo. */
export const corto = (tel: string) => `…${tel.slice(-4)}`;

/** Servidor HTTP del webhook. Responde 200 al instante y procesa después (Meta reintenta si tarda). */
export function createWebhookServer(d: WebhookDeps): http.Server {
  const path = d.path ?? "/webhook";
  const lector: LectorWebhook = d.lector ?? {
    firmaValida: (raw, headers) => validSignature(raw, headers["x-hub-signature-256"] as string | undefined, d.appSecret),
    mensajes: (body) => parseWebhook(body, d.phoneNumberId),
    estados: (body) => parseStatuses(body, d.phoneNumberId),
  };
  const seen = new Set<string>();
  const colas = new Map<string, Promise<void>>();

  async function uno(m: Incoming) {
    try {
      const replies = m.noLegible ? (d.noLegible?.() ?? []) : await d.handle(m.from, m.text);
      for (const r of replies) await d.send(m.from, r);
      await d.onHandled?.(m.from);
    } catch (e) {
      const code = e instanceof GraphError ? e.code : undefined;
      console.error(`[whatsapp] respuesta a ${corto(m.from)}:`, e instanceof Error ? e.message : e, pista(code));
    }
  }

  /** Los mensajes de una misma persona se atienden en orden, uno por vez. */
  function procesar(msgs: Incoming[]) {
    for (const m of msgs) {
      if (seen.has(m.id)) continue; // Meta puede reenviar el mismo mensaje.
      seen.add(m.id);
      if (seen.size > 5000) seen.delete(seen.values().next().value!);
      d.onInbound?.(m);
      const cola = (colas.get(m.from) ?? Promise.resolve()).then(() => uno(m));
      colas.set(m.from, cola);
      void cola.then(() => colas.get(m.from) === cola && colas.delete(m.from));
    }
  }

  async function estados(list: EstadoEnvio[]) {
    for (const s of list) {
      try {
        await d.onStatus?.(s);
      } catch (e) {
        console.error("[whatsapp] estado de envío:", e instanceof Error ? e.message : e);
      }
    }
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") return void res.end("ok");
      if (url.pathname !== path) {
        res.statusCode = 404;
        return void res.end("Not found");
      }
      if (req.method === "GET") {
        const r = verifyChallenge(url.searchParams, d.verifyToken);
        res.writeHead(r.status, { "content-type": "text/plain; charset=utf-8" });
        return void res.end(r.body);
      }
      if (req.method !== "POST") {
        res.statusCode = 405;
        return void res.end();
      }
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const c of req) {
        total += (c as Buffer).length;
        if (total > MAX_CUERPO) {
          res.writeHead(413, { connection: "close" });
          return void res.end();
        }
        chunks.push(c as Buffer);
      }
      const raw = Buffer.concat(chunks);
      if (!lector.firmaValida(raw, req.headers)) {
        res.statusCode = 401;
        return void res.end("Bad signature");
      }
      let body: Json = {};
      try {
        body = JSON.parse(raw.toString("utf8")) ?? {};
      } catch {
        /* cuerpo inválido: se responde 200 igual para que Meta no reintente */
      }
      res.statusCode = 200;
      res.end("EVENT_RECEIVED");
      procesar(lector.mensajes(body));
      void estados(lector.estados(body));
    } catch (e) {
      console.error("[whatsapp] webhook:", e instanceof Error ? e.message : e);
      if (!res.headersSent) res.statusCode = 400;
      res.end();
    }
  });
}
