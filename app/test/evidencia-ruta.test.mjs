// Tests de la ruta POST /api/evidencia contra una base SQLite temporal: tope de tamaño leyendo por partes.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-evidencia-"));
process.env.PP_DB_PATH = path.join(dir, "pp.db");
const carpeta = path.join(dir, "evidencia");

const { orders, sellers } = await import("../src/lib/server/db.ts");
const { POST } = await import("../src/app/api/evidencia/route.ts");
const { Keypair } = await import("@stellar/stellar-sdk");

const MB = 1024 * 1024;
const vendedor = Keypair.random().publicKey();
sellers.upsert({ pubkey: vendedor, store_name: "Tienda Test", whatsapp: "59170000000", city: "La Paz", pilot: false });

let n = 0;
/** Un pedido nuevo, ya pagado (recibe evidencia). */
function pedido() {
  const slug = `zapatos-${++n}${randomBytes(3).toString("hex")}`;
  orders.insert({ slug, seller_pubkey: vendedor, product: "Zapatos", description: "", photo_url: "", price_bs_cents: 45000,
    amount_units: "650000000", fx: 6.96, delivery_days: 3, window_secs: null, code: `PP-${slug}`, category: null,
    fee_payer: "comprador", price_units: "646551724", platform_bps: 100, ship_secs: null, inspect_secs: null });
  orders.update(slug, { status: "pagado", buyer_pubkey: Keypair.random().publicKey() });
  return slug;
}

let ipN = 0;
/** Una IP distinta por test, para que el límite por IP no se mezcle entre tests. */
const otraIp = () => `10.0.${Math.floor(++ipN / 250)}.${ipN % 250}`;

const jpeg = (bytes) => { const b = randomBytes(bytes); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return b; };
const mp4 = (bytes) => { const b = randomBytes(bytes); b.write("\0\0\0\x18ftypisom", 0, "latin1"); return b; };

function subir(slug, body, { largo = body.length, ip = otraIp(), headers = {} } = {}) {
  const h = { "x-forwarded-for": `203.0.113.9, ${ip}`, ...headers };
  if (largo != null) h["content-length"] = String(largo);
  return POST(new Request(`http://localhost:3000/api/evidencia?pedido=${slug}`, { method: "POST", body, headers: h, duplex: "half" }));
}

/** Un cuerpo por partes de 1 MB que cuenta cuánto leyó el servidor. `cabeza` son los primeros bytes. */
function flujo(total, cabeza, { fallaEn } = {}) {
  const s = { leidos: 0 };
  s.stream = new ReadableStream({
    pull(c) {
      if (fallaEn != null && s.leidos >= fallaEn) return c.error(new Error("se cortó la conexión"));
      if (s.leidos >= total) return c.close();
      const chunk = Buffer.alloc(MB);
      if (s.leidos === 0) cabeza.copy(chunk);
      s.leidos += chunk.length;
      c.enqueue(new Uint8Array(chunk));
    },
  });
  return s;
}

const temporales = () => (fs.existsSync(carpeta) ? fs.readdirSync(carpeta).filter((f) => f.endsWith(".tmp")) : []);

test("sin Content-Length (chunked): 411 y no lee el cuerpo", async () => {
  const f = flujo(120 * MB, mp4(16));
  const res = await subir(pedido(), f.stream, { largo: null });
  assert.equal(res.status, 411, `respondió ${res.status} después de leer ${f.leidos / MB} MB`);
  assert.ok(f.leidos <= 2 * MB, `leyó ${f.leidos / MB} MB`);
});

test("Content-Length mayor que 40 MB: 413 sin leer el cuerpo", async () => {
  const f = flujo(50 * MB, mp4(16));
  const res = await subir(pedido(), f.stream, { largo: 50 * MB });
  assert.equal(res.status, 413);
  assert.ok(f.leidos <= 2 * MB, `leyó ${f.leidos / MB} MB`);
});

test("Content-Length que miente (dice 1 KB, manda 120 MB): 413 apenas pasa los 40 MB", async () => {
  const f = flujo(120 * MB, mp4(16));
  const res = await subir(pedido(), f.stream, { largo: 1024 });
  assert.equal(res.status, 413, `respondió ${res.status}`);
  assert.ok(f.leidos <= 42 * MB, `leyó ${f.leidos / MB} MB antes de cortar`);
  assert.deepEqual(temporales(), []);
});

test("una foto corta en su tope (8 MB), no en el del video", async () => {
  const f = flujo(30 * MB, jpeg(16));
  const res = await subir(pedido(), f.stream, { largo: 1024 });
  assert.equal(res.status, 413);
  assert.match((await res.json()).error, /8 MB/);
  assert.ok(f.leidos <= 10 * MB, `leyó ${f.leidos / MB} MB antes de cortar`);
  assert.deepEqual(temporales(), []);
});

test("un cuerpo que se corta a la mitad: 400 y no deja el .tmp", async () => {
  const f = flujo(10 * MB, jpeg(16), { fallaEn: 3 * MB });
  const res = await subir(pedido(), f.stream, { largo: 10 * MB });
  assert.equal(res.status, 400);
  assert.deepEqual(temporales(), []);
});

test("subida normal: 200, la huella es el SHA-256 de lo que llegó y queda en disco", async () => {
  const foto = jpeg(300 * 1024);
  const sha = createHash("sha256").update(foto).digest("hex");
  const res = await subir(pedido(), foto, { headers: { "x-sha256": sha } });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.sha256, sha);
  assert.equal(j.bytes, foto.length);
  assert.ok(j.url.endsWith(`/api/evidencia/${sha}.jpg`));
  assert.deepEqual(fs.readFileSync(path.join(carpeta, `${sha}.jpg`)), foto);
  assert.deepEqual(temporales(), []);
});

test("x-sha256 que no coincide: 400 y no guarda nada", async () => {
  const foto = jpeg(1024);
  const sha = createHash("sha256").update(foto).digest("hex");
  const res = await subir(pedido(), foto, { headers: { "x-sha256": "0".repeat(64) } });
  assert.equal(res.status, 400);
  assert.equal(fs.existsSync(path.join(carpeta, `${sha}.jpg`)), false);
  assert.deepEqual(temporales(), []);
});
