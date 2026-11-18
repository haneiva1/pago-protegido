// Transporte WhatsApp Cloud API: webhook (GET de verificación y POST de mensajes) y envío por la Graph API.
// El bot nunca tiene llaves de billeteras: solo el token de WhatsApp para mandar mensajes.

import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";
import type { OutMsg } from "../engine/messages.ts";

export interface Incoming {
  id: string;
  from: string;
  text: string;
  name?: string;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Mensajes de texto y respuestas de botones de un POST del webhook. Ignora estados (sent/delivered/read). */
export function parseWebhook(body: Json): Incoming[] {
  const out: Incoming[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      if (!Array.isArray(v?.messages)) continue;
      const names = new Map<string, string>((v.contacts ?? []).map((c: Json) => [c.wa_id, c.profile?.name]));
      for (const m of v.messages) {
        let text: string | undefined;
        if (m.type === "text") text = m.text?.body;
        else if (m.type === "interactive") text = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id;
        else if (m.type === "button") text = m.button?.payload ?? m.button?.text;
        if (typeof text === "string" && text.trim() && m.from) out.push({ id: m.id, from: m.from, text, name: names.get(m.from) });
      }
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

/** X-Hub-Signature-256 = "sha256=" + HMAC(app secret, cuerpo crudo). */
export function validSignature(raw: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(raw).digest();
  const got = Buffer.from(header.slice(7), "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Cuerpo de POST /{phone-number-id}/messages: texto, o botones de respuesta (máx. 3, título ≤ 20). */
export function graphPayload(to: string, m: OutMsg): Json {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
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

export interface GraphConfig {
  token: string;
  phoneNumberId: string;
  version?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class GraphSender {
  constructor(private readonly c: GraphConfig) {}

  async send(to: string, m: OutMsg): Promise<void> {
    const url = `${this.c.baseUrl ?? "https://graph.facebook.com"}/${this.c.version ?? "v23.0"}/${this.c.phoneNumberId}/messages`;
    const res = await (this.c.fetchFn ?? fetch)(url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.c.token}`, "content-type": "application/json" },
      body: JSON.stringify(graphPayload(to, m)),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Graph API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

export interface WebhookDeps {
  handle: (from: string, text: string) => Promise<OutMsg[]>;
  send: (to: string, m: OutMsg) => Promise<void>;
  verifyToken: string;
  /** Si está, se exige X-Hub-Signature-256 válida. */
  appSecret?: string;
  path?: string;
}

/** Servidor HTTP del webhook. Responde 200 al instante y procesa después (Meta reintenta si tarda). */
export function createWebhookServer(d: WebhookDeps): http.Server {
  const path = d.path ?? "/webhook";
  const seen = new Set<string>();

  async function process(msgs: Incoming[]) {
    for (const m of msgs) {
      if (seen.has(m.id)) continue; // Meta puede reenviar el mismo mensaje.
      seen.add(m.id);
      if (seen.size > 5000) seen.delete(seen.values().next().value!);
      try {
        for (const r of await d.handle(m.from, m.text)) await d.send(m.from, r);
      } catch (e) {
        console.error("[whatsapp]", e instanceof Error ? e.message : e);
      }
    }
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") return void res.end("ok");
    if (url.pathname !== path) {
      res.statusCode = 404;
      return void res.end("Not found");
    }
    if (req.method === "GET") {
      const r = verifyChallenge(url.searchParams, d.verifyToken);
      res.statusCode = r.status;
      return void res.end(r.body);
    }
    if (req.method !== "POST") {
      res.statusCode = 405;
      return void res.end();
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks);
    if (d.appSecret && !validSignature(raw, req.headers["x-hub-signature-256"] as string | undefined, d.appSecret)) {
      res.statusCode = 401;
      return void res.end("Bad signature");
    }
    let body: Json = {};
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      /* cuerpo inválido: se responde 200 igual para que Meta no reintente */
    }
    res.statusCode = 200;
    res.end("EVENT_RECEIVED");
    void process(parseWebhook(body));
  });
}
