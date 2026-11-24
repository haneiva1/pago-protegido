// El flujo real de punta a punta, con la API de Meta simulada a nivel HTTP: se levanta el bot como en producción
// (`tsx src/main.ts --whatsapp`, en su propio proceso), se le mandan webhooks firmados como los de Meta y se mira qué
// pide a la Graph API. Lo único de mentira son los dos servidores: Meta y la app.
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_BUYER_PHONE, DEMO_SELLER, startMockApp, type MockApp } from "../src/mock/app-mock.ts";

const BOT = resolve(import.meta.dirname, "..");
const PHONE_ID = "106540352242922";
const TOKEN = "credencial-de-prueba";
const APP_SECRET = "secreto-de-prueba";
const BOT_KEY = "clave-de-prueba";
const PUBLIC = "https://trato.test";
const OTRO = "59170000009";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Llamada {
  method: string;
  path: string;
  auth: string;
  body: Json;
}

/** Meta: acepta mensajes y rechaza a quien no está en la lista de 5 números de prueba, con la forma real del error. */
async function graphDeMentira(permitidos: Set<string>) {
  const llamadas: Llamada[] = [];
  let n = 0;
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}") as Json;
    const responder = (status: number, b: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(b));
    };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return responder(401, { error: { message: "Error validating access token", type: "OAuthException", code: 190 } });
    if (req.method === "GET") return responder(200, { display_phone_number: "+1 555-010-0000", verified_name: "Test Number", id: PHONE_ID });
    llamadas.push({ method: req.method!, path: req.url!, auth: req.headers.authorization, body });
    if (!permitidos.has(body.to)) {
      return responder(400, { error: { message: "(#131030) Recipient phone number not in allowed list", type: "OAuthException", code: 131030, error_data: { messaging_product: "whatsapp", details: "Recipient phone number not in allowed list" } } });
    }
    responder(200, { messaging_product: "whatsapp", contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: `wamid.OUT${++n}` }] });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://localhost:${(server.address() as AddressInfo).port}`, llamadas, close: () => new Promise<void>((r) => server.close(() => r())) };
}

/** Corre el bot con solo estas variables (más PATH), en una carpeta vacía: ningún .env del equipo se cuela. */
function correr(env: Record<string, string>, args = ["--whatsapp"]) {
  const p = spawn(join(BOT, "node_modules/.bin/tsx"), [join(BOT, "src/main.ts"), ...args], {
    cwd: mkdtempSync(join(tmpdir(), "bot-wa-")),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const salida = { texto: "" };
  p.stdout!.on("data", (d) => (salida.texto += d));
  p.stderr!.on("data", (d) => (salida.texto += d));
  return { p, salida, fin: new Promise<number | null>((r) => p.on("exit", (c) => r(c))) };
}

async function hasta<T>(f: () => T | undefined | false | null, que: string, ms = 8000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = f();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`No pasó a tiempo: ${que}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function puertoLibre(): Promise<number> {
  const s = http.createServer();
  await new Promise<void>((r) => s.listen(0, r));
  const { port } = s.address() as AddressInfo;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

describe("arranque en modo WhatsApp", () => {
  const todas = (appUrl: string) => ({
    WA_TOKEN: TOKEN, WA_PHONE_NUMBER_ID: PHONE_ID, WA_VERIFY_TOKEN: "vt", WA_APP_SECRET: APP_SECRET,
    PP_APP_URL: appUrl, PP_PUBLIC_URL: PUBLIC, PP_BOT_KEY: BOT_KEY, BOT_STATE_FILE: "", REPORTS_FILE: "", PORT: "0",
  });

  it("sin las variables no arranca y dice cuáles faltan", async () => {
    const { fin, salida } = correr({});
    expect(await fin).toBe(1);
    for (const v of ["WA_TOKEN", "WA_PHONE_NUMBER_ID", "WA_VERIFY_TOKEN", "WA_APP_SECRET", "PP_APP_URL", "PP_BOT_KEY"]) expect(salida.texto).toContain(`Falta ${v}`);
  });

  it("rechaza links sin https, el número en lugar de su ID, la app de mentira y una Graph API que no es Meta", async () => {
    const { fin, salida } = correr({ ...todas("http://localhost:1"), PP_PUBLIC_URL: "http://localhost:3000", WA_PHONE_NUMBER_ID: "+15550100000", WA_GRAPH_URL: "https://graph.facebook.com.evil.test" }, ["--whatsapp", "--mock"]);
    expect(await fin).toBe(1);
    expect(salida.texto).toContain("https");
    expect(salida.texto).toContain("WA_PHONE_NUMBER_ID es el identificador largo");
    expect(salida.texto).toContain("WA_GRAPH_URL es solo para pruebas");
    expect(salida.texto).toContain("--mock es del simulador");
  });

  it("si la app es de otra red o no acepta la clave del bot, no arranca", async () => {
    const mainnet = await startMockApp({ botKey: BOT_KEY, red: "mainnet" });
    const testnet = await startMockApp({ botKey: BOT_KEY });
    try {
      const casos = [
        correr(todas(mainnet.url)),
        correr({ ...todas(testnet.url), STELLAR_NETWORK: "mainnet" }),
        correr({ ...todas(testnet.url), PP_BOT_KEY: "otra" }),
        correr({ ...todas(testnet.url), STELLAR_NETWORK: "manet" }),
      ];
      expect(await Promise.all(casos.map((c) => c.fin))).toEqual([1, 1, 1, 1]);
      expect(casos[0].salida.texto).toContain("corre en mainnet y el bot tiene STELLAR_NETWORK=testnet");
      expect(casos[1].salida.texto).toContain("corre en testnet y el bot tiene STELLAR_NETWORK=mainnet");
      expect(casos[2].salida.texto).toContain("no acepta PP_BOT_KEY");
      expect(casos[3].salida.texto).toContain('STELLAR_NETWORK tiene que ser "testnet" o "mainnet"');
    } finally {
      await mainnet.close();
      await testnet.close();
    }
  }, 20_000);
});

describe.each([
  { red: "testnet" as const, plantilla: "" },
  { red: "mainnet" as const, plantilla: "trato_aviso" },
])("flujo real ($red, plantilla: '$plantilla')", ({ red, plantilla }) => {
  let app: MockApp;
  let graph: Awaited<ReturnType<typeof graphDeMentira>>;
  let proc: ChildProcess;
  let salida: { texto: string };
  let base: string;
  let seq = 0;

  /** Webhook de Meta con la forma real, firmado con el app secret. */
  const firmar = (raw: string) => "sha256=" + createHmac("sha256", APP_SECRET).update(raw).digest("hex");
  const enviar = (value: Json, firma?: string) => {
    const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "102290129340398", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "15550100000", phone_number_id: PHONE_ID }, ...value } }] }] });
    return fetch(`${base}/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": firma ?? firmar(raw) }, body: raw });
  };
  const escribir = (from: string, text: string, extra: Json = {}) =>
    enviar({ contacts: [{ wa_id: from, profile: { name: "Persona" } }], messages: [{ from, id: `wamid.IN${++seq}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text }, ...extra }] });
  const textos = (to: string) => graph.llamadas.filter((l) => l.body.to === to).map((l) => l.body.text?.body ?? l.body.interactive?.body.text ?? `[plantilla ${l.body.template?.name}]`);
  const recibe = (to: string, re: RegExp) => hasta(() => textos(to).find((t) => re.test(t)), `${to} recibe ${re}\n${textos(to).join("\n---\n")}\n${salida.texto}`);

  beforeAll(async () => {
    app = await startMockApp({ botKey: BOT_KEY, ...(red === "mainnet" ? { red } : {}) });
    graph = await graphDeMentira(new Set([DEMO_SELLER.whatsapp, DEMO_BUYER_PHONE]));
    const port = await puertoLibre();
    base = `http://localhost:${port}`;
    ({ p: proc, salida } = correr({
      WA_TOKEN: TOKEN, WA_PHONE_NUMBER_ID: PHONE_ID, WA_VERIFY_TOKEN: "vt", WA_APP_SECRET: APP_SECRET, WA_GRAPH_URL: graph.url,
      PP_APP_URL: app.url, PP_PUBLIC_URL: PUBLIC, PP_BOT_KEY: BOT_KEY, STELLAR_NETWORK: red, WA_TEMPLATE_AVISO: plantilla,
      PORT: String(port), POLL_INTERVAL_MS: "150", BOT_STATE_FILE: "estado.json", REPORTS_FILE: "",
    }));
    await hasta(() => /webhook en el puerto/.test(salida.texto), `arranque\n${salida.texto}`);
    await hasta(() => /Número de WhatsApp: \+1 555-010-0000/.test(salida.texto), `número\n${salida.texto}`);
  }, 20_000);

  afterAll(async () => {
    proc?.kill("SIGKILL");
    await graph?.close();
    await app?.close();
  });

  it("verificación del webhook, como la hace Meta", async () => {
    const q = (t: string) => fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=1158201444`);
    const ok = await q("vt");
    expect([ok.status, await ok.text()]).toEqual([200, "1158201444"]);
    expect((await q("otro")).status).toBe(403);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it("sin la firma de Meta no se atiende a nadie", async () => {
    expect((await enviar({ messages: [{ from: DEMO_SELLER.whatsapp, id: "wamid.falso", type: "text", text: { body: "vendo polera 100 bs entrega 1 día" } }] }, "sha256=00")).status).toBe(401);
    await new Promise((r) => setTimeout(r, 200));
    expect(graph.llamadas).toEqual([]);
    expect(app.orders.size).toBe(0);
  });

  it("la tienda escribe desde su celular y recibe su link, por la Graph API", async () => {
    expect((await escribir(DEMO_SELLER.whatsapp, "vendo zapatillas nike 40 a 90 bs entrega 3 días")).status).toBe(200);
    const link = await recibe(DEMO_SELLER.whatsapp, /Tu link de pago protegido/);
    const slug = [...app.orders.keys()][0];
    expect(link).toContain(`${PUBLIC}/p/${slug}`);
    await recibe(DEMO_SELLER.whatsapp, /Te paso el link de pago protegido/);
    for (const l of graph.llamadas) {
      expect(l).toMatchObject({ method: "POST", path: `/v23.0/${PHONE_ID}/messages`, auth: `Bearer ${TOKEN}` });
      expect(l.body).toMatchObject({ messaging_product: "whatsapp", recipient_type: "individual", to: DEMO_SELLER.whatsapp });
    }
    const primero = graph.llamadas.find((l) => /Tu link/.test(l.body.interactive?.body.text ?? ""))!;
    expect(primero.body.interactive.action.buttons.map((b: Json) => b.reply.title)).toEqual(["La paga mi cliente", "Yo la regalo", "🛍️ Vender otro"]);
    // La bienvenida explica la ventana de 24 horas, y la moneda es la de la instancia configurada.
    expect(textos(DEMO_SELLER.whatsapp)[0]).toContain("WhatsApp me deja escribirte hasta 24 horas");
    if (red === "mainnet") {
      expect(link).toContain("USDC");
      expect(link).not.toContain("USD de prueba");
      expect(link).toContain("Prueba real en mainnet: plata real, montos chicos");
    } else {
      expect(link).toContain("USD de prueba");
      expect(link).not.toContain("mainnet");
    }
  });

  it("toca un botón del mensaje y el cambio llega a la app", async () => {
    const slug = [...app.orders.keys()][0];
    await escribir(DEMO_SELLER.whatsapp, "", { type: "interactive", interactive: { type: "button_reply", button_reply: { id: `regalo ${slug}`, title: "Yo la regalo" } } });
    await recibe(DEMO_SELLER.whatsapp, /la regalas tú/);
    expect(app.orders.get(slug)!.proteccion).toBe("vendedor");
  });

  it("el cliente paga: la tienda recibe el aviso; el comprador, que todavía no escribió, no recibe texto libre", async () => {
    const slug = [...app.orders.keys()][0];
    app.advance(slug, "pagar");
    await recibe(DEMO_SELLER.whatsapp, /tu cliente pagó .* el pago está GUARDADO/);
    if (plantilla) await recibe(DEMO_BUYER_PHONE, /\[plantilla trato_aviso\]/);
    await new Promise((r) => setTimeout(r, 400));
    const alComprador = graph.llamadas.filter((l) => l.body.to === DEMO_BUYER_PHONE);
    expect(alComprador.map((l) => l.body.type)).toEqual(plantilla ? ["template"] : []);
    if (plantilla) {
      expect(alComprador[0].body.template).toEqual({
        name: "trato_aviso",
        language: { code: "es" },
        components: [{ type: "body", parameters: [{ type: "text", text: app.orders.get(slug)!.code }, { type: "text", text: "tu pago está guardado" }] }],
      });
    }
  });

  it("el comprador escribe (o toca el botón de la plantilla) y le llega el aviso que esperaba", async () => {
    const slug = [...app.orders.keys()][0];
    if (plantilla) await escribir(DEMO_BUYER_PHONE, "", { type: "button", button: { payload: "Ver el aviso", text: "Ver el aviso" } });
    else await escribir(DEMO_BUYER_PHONE, `avisos ${app.orders.get(slug)!.code}`);
    await recibe(DEMO_BUYER_PHONE, /aviso guardado para ti/);
    await recibe(DEMO_BUYER_PHONE, /tu pago de .* está guardado/);
    // Ya con la ventana abierta, el envío le llega como texto normal.
    app.advance(slug, "enviar");
    await recibe(DEMO_BUYER_PHONE, /¿Te llegó\?/);
  });

  it("Meta rechaza después (131047 por el webhook de estados): el aviso se guarda y sale cuando vuelve a escribir", async () => {
    const slug = [...app.orders.keys()][0];
    const i = graph.llamadas.filter((l) => /Te llegó/.test(l.body.text?.body ?? "")).length;
    expect(i).toBe(1);
    const ok = graph.llamadas.filter((l) => l.body.to === DEMO_SELLER.whatsapp || l.body.to === DEMO_BUYER_PHONE);
    const id = `wamid.OUT${ok.findIndex((l) => /Te llegó/.test(l.body.text?.body ?? "")) + 1}`;
    await enviar({ statuses: [{ id, status: "failed", timestamp: "1800000000", recipient_id: DEMO_BUYER_PHONE, errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "More than 24 hours have passed" } }] }] });
    await hasta(() => /\(131047\)/.test(salida.texto), `registro del error\n${salida.texto}`);
    await escribir(DEMO_BUYER_PHONE, "hola");
    await hasta(() => textos(DEMO_BUYER_PHONE).filter((t) => /¿Te llegó\?/.test(t)).length === 2, "el aviso se repite");
    expect(textos(DEMO_BUYER_PHONE).some((t) => /Te aviso por aquí de tu compra/.test(t))).toBe(true);
    expect(app.orders.get(slug)!.status).toBe("enviado");
  });

  it("un teléfono fuera de la lista de 5: Meta lo rechaza, queda en el registro con qué hacer y el bot sigue", async () => {
    await escribir(OTRO, "hola");
    await hasta(() => /no está en la lista de destinatarios/.test(salida.texto), `pista\n${salida.texto}`);
    expect(salida.texto).not.toContain(OTRO); // el número completo no va al registro
    await escribir(DEMO_SELLER.whatsapp, "", { type: "audio", audio: { id: "x" } });
    await recibe(DEMO_SELLER.whatsapp, /solo leo mensajes de texto/);
  });

  it("no escribe secretos en el registro", () => {
    for (const s of [TOKEN, APP_SECRET, BOT_KEY]) expect(salida.texto).not.toContain(s);
  });
});
