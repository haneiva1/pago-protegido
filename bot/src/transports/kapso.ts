// Kapso (kapso.ai) entre el bot y Meta: WA_PROVIDER=kapso. Ver docs/WHATSAPP.md, "Con Kapso".
//
// - Envío: su proxy de la Cloud API recibe y devuelve lo mismo que la Graph API; cambian la URL y la credencial.
// - Webhook: acepta los dos formatos de Kapso, el crudo de Meta ("meta", el recomendado) y el propio ("kapso", v2).
//   Los dos llegan firmados con X-Webhook-Signature. Todo se lee como si viniera de Meta: un solo lector de mensajes.

import { createHmac, timingSafeEqual } from "node:crypto";
import { GraphError, parseStatuses, parseWebhook, type Intermediario, type LectorWebhook } from "./whatsapp.ts";

export const KAPSO_URL = "https://api.kapso.ai/meta/whatsapp";
export const KAPSO_VERSION = "v24.0";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** X-Webhook-Signature = HMAC-SHA256 en hex del cuerpo crudo, sin prefijo. Sin secreto, nada es válido. */
export function firmaKapsoValida(raw: Buffer, header: string | string[] | undefined, secreto: string): boolean {
  if (!secreto || typeof header !== "string" || !/^[a-f0-9]{64}$/i.test(header)) return false;
  return timingSafeEqual(createHmac("sha256", secreto).update(raw).digest(), Buffer.from(header, "hex"));
}

/** Mensajes que no le tocan al bot: historial importado, o escritos y atendidos por otra app del mismo número. */
const AJENOS = new Set(["history_sync", "business_app", "other_app", "meta_business_agent"]);

const digitos = (v: unknown) => (typeof v === "string" && v.replace(/\D/g, "")) || undefined;

/** Un evento del formato propio de Kapso, como el `change` de Meta que lo originó. */
function aCambio(ev: Json): Json[] {
  const m = ev?.message;
  const k = m?.kapso;
  if (!m?.id || !k || ev.standby || k.passive === true || AJENOS.has(k.origin)) return [];
  const conv: Json = ev.conversation ?? {};
  const metadata = { phone_number_id: ev.phone_number_id ?? conv.phone_number_id };
  if (k.direction === "inbound") {
    // El lote de la documentación no trae `from`: el teléfono está en la conversación, con "+".
    const from = digitos(m.from) ?? digitos(conv.phone_number);
    const usuario = m.from_user_id ?? conv.business_scoped_user_id ?? undefined;
    const contacto = { wa_id: from, user_id: usuario, profile: { name: conv.contact_name ?? undefined } };
    return [{ field: "messages", value: { metadata, contacts: [contacto], messages: [{ ...m, from, from_user_id: usuario }] } }];
  }
  if (k.direction === "outbound") {
    // `statuses` es la historia completa de estados de Meta: importa el de este evento.
    const historia: Json[] = Array.isArray(k.statuses) ? k.statuses : [];
    const estado = [...historia].reverse().find((s) => s?.status === k.status) ?? { status: k.status, recipient_id: m.to };
    return [{ field: "messages", value: { metadata, statuses: [{ ...estado, id: estado.id ?? m.id }] } }];
  }
  return [];
}

/** El cuerpo como lo manda Meta, y solo lo de este número: lo que no diga a qué número llegó, se ignora. */
function deEsteNumero(body: Json, phoneNumberId: string): Json {
  const cambios: Json[] = Array.isArray(body?.entry)
    ? body.entry.flatMap((e: Json) => (Array.isArray(e?.changes) ? e.changes : []))
    : (body?.batch === true && Array.isArray(body.data) ? body.data : [body]).flatMap(aCambio);
  return {
    // Kapso reenvía todos los campos de Meta (historial, ecos, chats de otra app…): se atiende solo `messages`.
    entry: [{ changes: cambios.filter((c) => c?.field === "messages" && !!phoneNumberId && String(c.value?.metadata?.phone_number_id ?? "") === phoneNumberId) }],
  };
}

export function lectorKapso(c: { secreto: string; phoneNumberId: string }): LectorWebhook {
  return {
    firmaValida: (raw, headers) => firmaKapsoValida(raw, headers["x-webhook-signature"], c.secreto),
    mensajes: (body) => parseWebhook(deEsteNumero(body, c.phoneNumberId)),
    estados: (body) => parseStatuses(deEsteNumero(body, c.phoneNumberId)),
  };
}

const CHAT_AJENO = new Set(["thread_not_owner", "thread_ownership_unknown", "meta_business_agent_control"]);

function pistaKapso(status: number, motivo?: string): string {
  if (motivo && CHAT_AJENO.has(motivo)) return "otra app atiende ese chat: desconéctala del número en Meta";
  switch (status) {
    case 401:
      return "KAPSO_API_KEY no sirve: genera otra en Kapso";
    case 402:
      return "Kapso no puede cobrar el mensaje: revisa el saldo del proyecto";
    case 404:
      return "WA_PHONE_NUMBER_ID no es de ese proyecto de Kapso";
    case 423:
      return "Kapso pausó los envíos mientras revisa la cuenta";
    case 429:
      return "se pasó el límite de pedidos por minuto del plan de Kapso";
    default:
      return "";
  }
}

const unir = (detalle: string, pista: string) => detalle.slice(0, 200) + (pista && ` → ${pista}`);

/** Kapso devuelve los errores de Meta como Meta, y los suyos como {"error": "texto", "code": "motivo"}. */
export function errorKapso(status: number, data: Json, texto: string): GraphError {
  if (data.error && typeof data.error === "object") {
    const e: Json = data.error;
    const code = Number(e.code) || undefined;
    // Meta también contesta 401 (190): ahí la credencial vencida es la que Kapso guarda del número, no la nuestra.
    const pista = code === 190 ? "Kapso perdió el permiso sobre el número: vuelve a conectarlo en Kapso" : code && code !== status ? "" : pistaKapso(status);
    return new GraphError(status, code, unir(String(e.error_data?.details ?? e.message ?? texto), pista), { api: "Kapso" });
  }
  const motivo = typeof data.code === "string" ? data.code : undefined;
  return new GraphError(status, undefined, unir(typeof data.error === "string" ? data.error : texto, pistaKapso(status, motivo)), { api: "Kapso", motivo });
}

export function apiKapso(apiKey: string): Intermediario {
  return {
    cabeceras: { "x-api-key": apiKey },
    error: errorKapso,
    // 409 sin motivo: todavía está saliendo otro mensaje para esa persona; hay que esperar y repetir. Con motivo
    // (otra app tiene el chat), insistir no sirve.
    reintentar: (e) => e.status === 409 && e.motivo == null && e.code == null,
  };
}
