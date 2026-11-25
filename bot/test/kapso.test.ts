// WA_PROVIDER=kapso: firma, formatos del webhook, filtro por número, envío y errores, con los payloads de la
// documentación de Kapso (kapso-payloads.ts). Al final, el bot en su propio proceso contra un Kapso de mentira.
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerProveedor, loadConfig, problemasWhatsapp } from "../src/config.ts";
import { DEMO_BUYER_PHONE, DEMO_SELLER, startMockApp, type MockApp } from "../src/mock/app-mock.ts";
import { KAPSO_URL, KAPSO_VERSION, apiKapso, errorKapso, firmaKapsoValida, lectorKapso } from "../src/transports/kapso.ts";
import { GraphError, GraphSender, createWebhookServer, type EstadoEnvio, type Incoming } from "../src/transports/whatsapp.ts";
import * as ej from "./kapso-payloads.ts";

const SECRETO = "secreto-del-webhook-de-prueba";
const CLAVE = "clave-kapso-de-prueba";
const APP_SECRET = "secreto-de-meta-de-prueba";
const BOT_KEY = "clave-del-bot-de-prueba";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const firmar = (raw: string | Buffer, secreto = SECRETO) => createHmac("sha256", secreto).update(raw).digest("hex");
const lector = lectorKapso({ secreto: SECRETO, phoneNumberId: ej.PHONE_ID });
const con = (extra: Json, base: Json = ej.recibido) => ({ ...base, message: { ...base.message, ...extra } });
/** Webhook crudo de Meta, como lo reenvía Kapso (kind: "meta"). */
const crudo = (value: Json, field = "messages", phoneId: string | null = ej.PHONE_ID) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "1", changes: [{ field, value: { messaging_product: "whatsapp", ...(phoneId ? { metadata: { display_phone_number: "15550100000", phone_number_id: phoneId } } : {}), ...value } }] }],
});
const hola = { contacts: [{ wa_id: "59171234567", profile: { name: "Doña Rosa" } }], messages: [{ from: "59171234567", id: "wamid.M1", timestamp: "1730092800", type: "text", text: { body: "hola" } }] };

describe("Kapso: configuración", () => {
  const env = (extra: Record<string, string>) => ({ PP_APP_URL: "https://app.test", PP_BOT_KEY: BOT_KEY, WA_PHONE_NUMBER_ID: ej.PHONE_ID, ...extra }) as NodeJS.ProcessEnv;

  it("WA_PROVIDER: vacío es meta; cualquier otro valor es un error", () => {
    expect([undefined, "", "meta", " META "].map(leerProveedor)).toEqual(["meta", "meta", "meta", "meta"]);
    expect(leerProveedor(" Kapso ")).toBe("kapso");
    expect(() => leerProveedor("twilio")).toThrow('WA_PROVIDER tiene que ser "meta" o "kapso" (vino "twilio")');
  });

  it("sin WA_PROVIDER no cambia nada: Meta directo, con sus cuatro variables", () => {
    const c = loadConfig(env({ KAPSO_API_KEY: CLAVE, KAPSO_WEBHOOK_SECRET: SECRETO }));
    expect(c.wa).toMatchObject({ proveedor: "meta", baseUrl: "https://graph.facebook.com", version: "v23.0" });
    expect(problemasWhatsapp(c)).toEqual(["Falta WA_TOKEN", "Falta WA_VERIFY_TOKEN", "Falta WA_APP_SECRET"]);
  });

  it("con kapso pide sus tres variables y no las de Meta", () => {
    const vacia = loadConfig(env({ WA_PROVIDER: "kapso", WA_PHONE_NUMBER_ID: "" }));
    expect(problemasWhatsapp(vacia)).toEqual(["Falta KAPSO_API_KEY", "Falta KAPSO_WEBHOOK_SECRET", "Falta WA_PHONE_NUMBER_ID"]);
    const c = loadConfig(env({ WA_PROVIDER: "kapso", KAPSO_API_KEY: CLAVE, KAPSO_WEBHOOK_SECRET: SECRETO }));
    expect(problemasWhatsapp(c)).toEqual([]);
    expect(c.wa).toMatchObject({ baseUrl: KAPSO_URL, version: KAPSO_VERSION, kapso: { apiKey: CLAVE, webhookSecret: SECRETO } });
  });

  it("la clave de Kapso sale solo hacia Kapso (o a localhost, en los tests)", () => {
    const c = (url: string) => problemasWhatsapp(loadConfig(env({ WA_PROVIDER: "kapso", KAPSO_API_KEY: CLAVE, KAPSO_WEBHOOK_SECRET: SECRETO, WA_GRAPH_URL: url })));
    expect(c("https://graph.facebook.com")).toHaveLength(1);
    expect(c("https://api.kapso.ai.evil.test")).toHaveLength(1);
    expect(c("http://localhost:1234")).toEqual([]);
  });
});

describe("Kapso: firma X-Webhook-Signature", () => {
  const raw = Buffer.from(JSON.stringify(ej.recibido));

  it("es HMAC-SHA256 en hex del cuerpo crudo, sin prefijo", () => {
    expect(firmaKapsoValida(raw, firmar(raw), SECRETO)).toBe(true);
    expect(firmaKapsoValida(raw, firmar(raw).toUpperCase(), SECRETO)).toBe(true);
  });

  it("rechaza otra clave, otro cuerpo, formas raras y un secreto vacío", () => {
    expect(firmaKapsoValida(raw, firmar(raw, "otra"), SECRETO)).toBe(false);
    expect(firmaKapsoValida(Buffer.concat([raw, Buffer.from(" ")]), firmar(raw), SECRETO)).toBe(false);
    for (const mala of [undefined, "", "00", "sha256=" + firmar(raw), firmar(raw) + "00", "z".repeat(64), [firmar(raw)]]) expect(firmaKapsoValida(raw, mala, SECRETO)).toBe(false);
    expect(firmaKapsoValida(raw, createHmac("sha256", "").update(raw).digest("hex"), "")).toBe(false);
  });
});

describe("Kapso: mensajes", () => {
  it("formato de Kapso: texto, con teléfono, nombre y hora", () => {
    expect(lector.mensajes(ej.recibido)).toEqual([{ id: "wamid.123", from: "16315551181", text: "Hello", name: "John Doe", at: 1_730_092_800_000 }]);
    expect(lector.estados(ej.recibido)).toEqual([]);
  });

  it("formato de Kapso: botón, pie de foto y audio", () => {
    expect(lector.mensajes(con(ej.boton))[0].text).toBe("btn_1");
    expect(lector.mensajes(con({ type: "image", text: undefined, image: { caption: "Photo description", id: "media_id_123" } }))[0].text).toBe("Photo description");
    expect(lector.mensajes(con(ej.audio))[0]).toMatchObject({ text: "", noLegible: true });
    expect(lector.mensajes(con({ type: "reaction", text: undefined, reaction: { message_id: "wamid.x", emoji: "👍" } }))).toEqual([]);
  });

  it("lote (buffering): todos los mensajes, con el teléfono de la conversación sin el '+'", () => {
    expect(lector.mensajes(ej.lote)).toEqual([
      { id: "wamid.111", from: "15551234567", text: "First in batch", at: 1_730_092_801_000 },
      { id: "wamid.112", from: "15551234567", text: "Second in batch", at: 1_730_092_802_000 },
    ]);
  });

  it("sin teléfono (nombre de usuario): usa el ID de la persona", () => {
    const sinTel = { ...con({ from: undefined }), conversation: { ...ej.recibido.conversation, phone_number: null } };
    expect(lector.mensajes(sinTel)).toMatchObject([{ from: "US.13491208655302741918", text: "Hello" }]);
  });

  it("webhook crudo de Meta reenviado por Kapso", () => {
    expect(lector.mensajes(crudo(hola))).toEqual([{ id: "wamid.M1", from: "59171234567", text: "hola", name: "Doña Rosa", at: 1_730_092_800_000 }]);
  });

  it("solo atiende este número: ni otro, ni uno que no se sabe cuál es", () => {
    const otro = lectorKapso({ secreto: SECRETO, phoneNumberId: "999999999999999" });
    for (const b of [ej.recibido, ej.lote, crudo(hola)]) expect(otro.mensajes(b)).toEqual([]);
    for (const b of [ej.entregado, ej.fallido]) expect(otro.estados(b)).toEqual([]);
    const mezcla = { ...ej.lote, data: [ej.lote.data[0], { ...ej.lote.data[1], phone_number_id: "999999999999999" }] };
    expect(lector.mensajes(mezcla).map((m) => m.id)).toEqual(["wamid.111"]);
    const sinNumero = { ...ej.recibido, phone_number_id: undefined, conversation: { ...ej.recibido.conversation, phone_number_id: undefined } };
    expect(lector.mensajes(sinNumero)).toEqual([]);
    expect(lector.mensajes(crudo(hola, "messages", null))).toEqual([]);
    expect(lectorKapso({ secreto: SECRETO, phoneNumberId: "" }).mensajes(sinNumero)).toEqual([]);
  });

  it("no contesta lo propio, lo que atiende otra app, el historial ni los eventos sin mensaje", () => {
    const kapso = (extra: Json) => con({ kapso: { ...ej.recibido.message.kapso, ...extra } });
    const nada = [ej.standby, ej.entregado, ej.terminada, kapso({ passive: true }), kapso({ direction: undefined }), ...["history_sync", "business_app", "other_app", "meta_business_agent"].map((origin) => kapso({ origin }))];
    for (const b of nada) expect(lector.mensajes(b)).toEqual([]);
    for (const campo of ["standby", "history", "smb_message_echoes", "calls"]) expect(lector.mensajes(crudo(hola, campo))).toEqual([]);
    for (const raro of [{}, [], "x", 3, { batch: true }, { batch: true, data: [null, 1] }, { entry: [null, { changes: null }] }, { message: null }]) expect(lector.mensajes(raro as Json)).toEqual([]);
  });
});

describe("Kapso: estados de envío", () => {
  it("entregado y fallido, con el código de Meta", () => {
    expect(lector.estados(ej.entregado)).toEqual([{ id: "wamid.456", status: "delivered", to: "15551234567" }]);
    expect(lector.estados(ej.fallido)).toEqual([{ id: "wamid.789", status: "failed", to: "15551234567", code: 131047, detalle: "Re-engagement message" }]);
    expect(lector.mensajes(ej.fallido)).toEqual([]);
  });

  it("sin historia de estados usa el del mensaje", () => {
    const sin = con({ kapso: { ...ej.entregado.message.kapso, statuses: undefined } }, ej.entregado);
    expect(lector.estados(sin)).toEqual([{ id: "wamid.456", status: "delivered", to: "15551234567" }]);
  });

  it("en el webhook crudo de Meta", () => {
    const b = crudo({ statuses: [{ id: "w2", status: "failed", recipient_id: "591", errors: [{ code: 131047, title: "t", error_data: { details: "24 h" } }] }] });
    expect(lector.estados(b)).toEqual([{ id: "w2", status: "failed", to: "591", code: 131047, detalle: "24 h" }]);
  });
});

describe("Kapso: envío", () => {
  const enviador = (respuestas: Response[], llamadas: { url: string; init: RequestInit }[] = []) =>
    new GraphSender({
      token: "no-se-usa",
      phoneNumberId: ej.PHONE_ID,
      version: KAPSO_VERSION,
      baseUrl: KAPSO_URL,
      intermediario: apiKapso(CLAVE),
      reintentosMs: [1, 1],
      fetchFn: (async (url: string, init: RequestInit) => {
        llamadas.push({ url, init });
        return respuestas[llamadas.length - 1];
      }) as unknown as typeof fetch,
    });
  const ok = () => new Response('{"messaging_product":"whatsapp","messages":[{"id":"wamid.HBgN"}]}');
  const err = (status: number, b: unknown) => new Response(JSON.stringify(b), { status });

  it("a su proxy, con X-API-Key, sin Authorization y con el mismo cuerpo que a Meta", async () => {
    const llamadas: { url: string; init: RequestInit }[] = [];
    expect(await enviador([ok()], llamadas).send("59171234567", { text: "hola", buttons: [{ id: "a", title: "A" }] })).toBe("wamid.HBgN");
    expect(llamadas[0].url).toBe(`https://api.kapso.ai/meta/whatsapp/v24.0/${ej.PHONE_ID}/messages`);
    expect(llamadas[0].init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(llamadas[0].init.headers).toEqual({ "x-api-key": CLAVE, "content-type": "application/json" });
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "59171234567",
      type: "interactive",
      interactive: { type: "button", body: { text: "hola" }, action: { buttons: [{ type: "reply", reply: { id: "a", title: "A" } }] } },
    });
  });

  it("no sigue redirecciones: la clave no sale a otro dominio", async () => {
    const llamadas: { url: string; init: RequestInit }[] = [];
    const e = await enviador([new Response(null, { status: 302, headers: { location: "https://evil.test" } })], llamadas).send("591", { text: "x" }).catch((e: unknown) => e);
    expect(e).toBeInstanceOf(GraphError);
    expect(llamadas).toHaveLength(1);
  });

  it("reintenta lo que se arregla esperando y no insiste con lo demás", async () => {
    const probar = async (...rs: Response[]) => {
      const llamadas: { url: string; init: RequestInit }[] = [];
      const r = await enviador(rs, llamadas).send("591", { text: "x" }).catch((e: unknown) => e);
      return { n: llamadas.length, r };
    };
    expect(await probar(err(409, ej.errorEnVuelo), err(429, ej.errorRitmo), ok())).toEqual({ n: 3, r: "wamid.HBgN" });
    expect((await probar(err(409, ej.errorChatAjeno))).n).toBe(1);
    expect((await probar(err(402, ej.errorSaldo))).n).toBe(1);
    expect((await probar(err(401, { error: "Unauthorized" }))).n).toBe(1);
    const ventana = await probar(err(422, ej.errorVentana));
    expect(ventana.n).toBe(1);
    expect((ventana.r as GraphError).code).toBe(131047); // el aviso queda guardado, como con Meta
  });

  it("los errores dicen qué pasó y qué hacer, sin la clave", () => {
    const m = (status: number, b: Json) => errorKapso(status, b, JSON.stringify(b)).message;
    expect(m(402, ej.errorSaldo)).toBe("Kapso 402 (insufficient_credits): Your Kapso balance doesn't cover Meta's fee for this message. → Kapso no puede cobrar el mensaje: revisa el saldo del proyecto");
    expect(m(409, ej.errorChatAjeno)).toContain("otra app atiende ese chat");
    expect(m(401, { error: "Unauthorized" })).toContain("KAPSO_API_KEY no sirve");
    expect(m(401, { error: { message: "Invalid API key", type: "x", code: 401 } })).toContain("KAPSO_API_KEY no sirve");
    expect(m(401, { error: { message: "Error validating access token", code: 190 } })).toContain("vuelve a conectarlo en Kapso");
    expect(m(404, { error: { message: "Phone number not found", type: "x", code: 404 } })).toContain("WA_PHONE_NUMBER_ID no es de ese proyecto");
    expect(m(422, ej.errorVentana)).toBe("Kapso 422 (131047): Cannot send non-template messages outside the 24-hour window.");
    expect(m(400, ej.errorFormaMeta)).toBe("Kapso 400 (400): Invalid phone number format");
    expect(m(502, {})).toBe("Kapso 502: {}");
    expect(new GraphError(401, 190, "x").message).toBe("Graph API 401 (190): x"); // Meta, igual que siempre
  });
});

describe("Kapso: webhook", () => {
  it("exige la firma de Kapso; la de Meta y la verificación GET no abren nada; y no atiende dos veces el mismo mensaje", async () => {
    const entran: Incoming[] = [];
    const estados: EstadoEnvio[] = [];
    const server = createWebhookServer({ verifyToken: "", appSecret: "", lector, handle: async () => [], send: async () => undefined, onInbound: (m) => void entran.push(m), onStatus: async (s) => void estados.push(s) });
    await new Promise<void>((r) => server.listen(0, r));
    const url = `http://localhost:${(server.address() as AddressInfo).port}/webhook`;
    const post = (raw: string, headers: Record<string, string>) => fetch(url, { method: "POST", headers, body: raw }).then((r) => r.status);
    const raw = JSON.stringify(ej.recibido);
    try {
      expect(await post(raw, {})).toBe(401);
      expect(await post(raw, { "x-webhook-signature": firmar(raw, "otro") })).toBe(401);
      expect(await post(raw, { "x-hub-signature-256": "sha256=" + createHmac("sha256", "").update(raw).digest("hex") })).toBe(401);
      expect((await fetch(`${url}?hub.mode=subscribe&hub.verify_token=&hub.challenge=1`)).status).toBe(403);
      expect(entran).toEqual([]);
      const cabeceras = { "x-webhook-event": "whatsapp.message.received", "x-webhook-signature": firmar(raw), "x-idempotency-key": "k1", "x-webhook-payload-version": "v2" };
      expect(await post(raw, cabeceras)).toBe(200);
      expect(await post(raw, cabeceras)).toBe(200); // Kapso reintenta a los 10 y a los 40 segundos
      const deMeta = JSON.stringify(crudo({ messages: [{ from: "16315551181", id: "wamid.123", type: "text", text: { body: "Hello" } }] }));
      expect(await post(deMeta, { "x-webhook-signature": firmar(deMeta) })).toBe(200); // el mismo, por el otro formato
      const f = JSON.stringify(ej.fallido);
      expect(await post(f, { "x-webhook-signature": firmar(f) })).toBe(200);
      expect(entran.map((m) => m.id)).toEqual(["wamid.123"]);
      expect(estados).toMatchObject([{ id: "wamid.789", status: "failed", code: 131047 }]);
    } finally {
      server.close();
    }
  });
});

/** Corre el bot con solo estas variables (más PATH), en una carpeta vacía: ningún .env del equipo se cuela. */
function correr(env: Record<string, string>) {
  const bot = resolve(import.meta.dirname, "..");
  const p = spawn(join(bot, "node_modules/.bin/tsx"), [join(bot, "src/main.ts"), "--whatsapp"], {
    cwd: mkdtempSync(join(tmpdir(), "bot-kapso-")),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const salida = { texto: "" };
  p.stdout!.on("data", (d) => (salida.texto += d));
  p.stderr!.on("data", (d) => (salida.texto += d));
  return { p, salida, fin: new Promise<number | null>((r) => p.on("exit", (c) => r(c))) };
}

async function hasta<T>(f: () => T | undefined | false | null, que: () => string, ms = 8000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = f();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`No pasó a tiempo: ${que()}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("Kapso: arranque", () => {
  it("dice qué variables faltan, y no las de Meta", async () => {
    const { fin, salida } = correr({ WA_PROVIDER: "kapso" });
    expect(await fin).toBe(1);
    for (const v of ["KAPSO_API_KEY", "KAPSO_WEBHOOK_SECRET", "WA_PHONE_NUMBER_ID", "PP_APP_URL", "PP_BOT_KEY"]) expect(salida.texto).toContain(`Falta ${v}`);
    expect(salida.texto).not.toMatch(/WA_TOKEN|WA_VERIFY_TOKEN|WA_APP_SECRET/);
  });

  it("con un proveedor desconocido no arranca", async () => {
    const { fin, salida } = correr({ WA_PROVIDER: "kapzo" });
    expect(await fin).toBe(1);
    expect(salida.texto).toContain('WA_PROVIDER tiene que ser "meta" o "kapso"');
  });
});

// Lo único de mentira son los dos servidores: Kapso y la app.
describe.each(["meta", "kapso"] as const)("Kapso: flujo real, webhook en formato %s", (formato) => {
  let app: MockApp;
  let proc: ChildProcess;
  let salida: { texto: string };
  let base: string;
  let kapso: http.Server;
  let seq = 0;
  let trabado = true;
  const llamadas: { path: string; headers: http.IncomingHttpHeaders; body: Json }[] = [];

  const enviar = (cuerpo: Json, firma?: string) => {
    const raw = JSON.stringify(cuerpo);
    return fetch(`${base}/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-webhook-signature": firma ?? firmar(raw) }, body: raw });
  };
  const evento = (from: string, extra: Json, phoneId = ej.PHONE_ID) => {
    const m = { id: `wamid.K${++seq}`, timestamp: String(Math.floor(Date.now() / 1000)), from, ...extra };
    if (formato === "meta") return crudo({ contacts: [{ wa_id: from, profile: { name: "Persona" } }], messages: [m] }, "messages", phoneId);
    return { message: { ...m, kapso: ej.recibido.message.kapso }, conversation: { ...ej.recibido.conversation, phone_number: `+${from}`, phone_number_id: phoneId }, is_new_conversation: false, phone_number_id: phoneId };
  };
  const texto = (body: string) => ({ type: "text", text: { body } });
  const textos = (to: string) => llamadas.filter((l) => l.body.to === to).map((l) => l.body.text?.body ?? l.body.interactive?.body.text);
  const recibe = (to: string, re: RegExp) => hasta(() => textos(to).find((t) => re.test(t)), () => `${to} recibe ${re}\n${textos(to).join("\n---\n")}\n${salida.texto}`);

  beforeAll(async () => {
    app = await startMockApp({ botKey: BOT_KEY });
    kapso = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const responder = (status: number, b: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(b));
      };
      if (req.headers["x-api-key"] !== CLAVE) return responder(401, { error: "Unauthorized" });
      if (req.method === "GET") return responder(200, { id: ej.PHONE_ID, display_phone_number: "+1 555-010-0000", verified_name: "Trato" });
      // El primer mensaje encuentra otro en camino: hay que esperar y repetir.
      if (trabado) {
        trabado = false;
        return responder(409, ej.errorEnVuelo);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString()) as Json;
      llamadas.push({ path: req.url!, headers: req.headers, body });
      responder(200, { messaging_product: "whatsapp", contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: `wamid.OUT${llamadas.length}` }] });
    });
    await new Promise<void>((r) => kapso.listen(0, "127.0.0.1", r));
    const libre = http.createServer();
    await new Promise<void>((r) => libre.listen(0, r));
    const { port } = libre.address() as AddressInfo;
    await new Promise<void>((r) => libre.close(() => r()));
    base = `http://localhost:${port}`;
    ({ p: proc, salida } = correr({
      WA_PROVIDER: "kapso", KAPSO_API_KEY: CLAVE, KAPSO_WEBHOOK_SECRET: SECRETO, WA_PHONE_NUMBER_ID: ej.PHONE_ID,
      // Lo que quedó de Meta en el servicio no se usa.
      WA_TOKEN: "token-viejo-de-meta", WA_VERIFY_TOKEN: "vt", WA_APP_SECRET: APP_SECRET,
      WA_GRAPH_URL: `http://localhost:${(kapso.address() as AddressInfo).port}`,
      PP_APP_URL: app.url, PP_PUBLIC_URL: "https://trato.test", PP_BOT_KEY: BOT_KEY,
      PORT: String(port), POLL_INTERVAL_MS: "150", BOT_STATE_FILE: "estado.json", REPORTS_FILE: "",
    }));
    await hasta(() => /Proveedor: Kapso/.test(salida.texto), () => `arranque\n${salida.texto}`);
    await hasta(() => /Número de WhatsApp: \+1 555-010-0000 \(Trato\)/.test(salida.texto), () => `número\n${salida.texto}`);
  }, 20_000);

  afterAll(async () => {
    proc?.kill("SIGKILL");
    kapso?.close();
    await app?.close();
  });

  it("sin la firma de Kapso, o para otro número, no se atiende a nadie", async () => {
    const vende = texto("vendo polera 100 bs entrega 1 día");
    const raw = JSON.stringify(evento(DEMO_SELLER.whatsapp, vende));
    expect((await enviar(JSON.parse(raw) as Json, "00")).status).toBe(401);
    const firmaDeMeta = await fetch(`${base}/webhook`, { method: "POST", headers: { "x-hub-signature-256": "sha256=" + firmar(raw, APP_SECRET) }, body: raw });
    expect(firmaDeMeta.status).toBe(401);
    expect((await enviar(evento(DEMO_SELLER.whatsapp, vende, "999999999999999"))).status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(llamadas).toEqual([]);
    expect(app.orders.size).toBe(0);
  });

  it("la tienda escribe y recibe su link por el proxy de Kapso, aunque el primer envío encuentre otro en camino", async () => {
    expect((await enviar(evento(DEMO_SELLER.whatsapp, texto("vendo zapatillas nike 40 a 90 bs entrega 3 días")))).status).toBe(200);
    const link = await recibe(DEMO_SELLER.whatsapp, /Tu link de pago protegido/);
    expect(link).toContain(`https://trato.test/p/${[...app.orders.keys()][0]}`);
    await recibe(DEMO_SELLER.whatsapp, /Te paso el link de pago protegido/);
    expect(trabado).toBe(false);
    for (const l of llamadas) {
      expect(l.path).toBe(`/v24.0/${ej.PHONE_ID}/messages`);
      expect(l.headers.authorization).toBeUndefined();
    }
  });

  it("toca un botón, el cliente paga y los avisos salen", async () => {
    const slug = [...app.orders.keys()][0];
    await enviar(evento(DEMO_SELLER.whatsapp, { type: "interactive", interactive: { type: "button_reply", button_reply: { id: `regalo ${slug}`, title: "Yo la regalo" } } }));
    await recibe(DEMO_SELLER.whatsapp, /la regalas tú/);
    app.advance(slug, "pagar");
    await recibe(DEMO_SELLER.whatsapp, /tu cliente pagó .* el pago está GUARDADO/);
    await enviar(evento(DEMO_BUYER_PHONE, texto(`avisos ${app.orders.get(slug)!.code}`)));
    await recibe(DEMO_BUYER_PHONE, /tu pago de .* está guardado/);
  });

  it("no escribe secretos en el registro", () => {
    for (const s of [CLAVE, SECRETO, APP_SECRET, BOT_KEY, "token-viejo-de-meta"]) expect(salida.texto).not.toContain(s);
  });
});
