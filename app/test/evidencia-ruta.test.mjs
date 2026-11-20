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

const { db, orders, sellers } = await import("../src/lib/server/db.ts");
const { POST } = await import("../src/app/api/evidencia/route.ts");
const { Keypair } = await import("@stellar/stellar-sdk");

const MB = 1024 * 1024;
const huella = (b) => createHash("sha256").update(b).digest("hex");
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

test("una foto HEIC (ftypheic) no se guarda como video: 415 «Sube la foto en JPG»", async () => {
  for (const marca of ["heic", "mif1", "avif"]) {
    const foto = randomBytes(4096);
    foto.write(`\0\0\0\x18ftyp${marca}`, 0, "latin1");
    const res = await subir(pedido(), foto);
    assert.equal(res.status, 415, marca);
    assert.equal((await res.json()).error, "Sube la foto en JPG");
    assert.equal(fs.existsSync(path.join(carpeta, `${huella(foto)}.mp4`)), false);
  }
  assert.deepEqual(temporales(), []);
});

// Cupo por pedido, límite por IP y espacio libre: la ruta no pide firma (llega con el PR #6), así que se acota.

test("cupo por pedido: 8 archivos distintos; el 9.º es 429 con un mensaje claro", async () => {
  const slug = pedido();
  const ip = otraIp();
  for (let i = 0; i < 8; i++) assert.equal((await subir(slug, jpeg(64 * 1024), { ip })).status, 200, `archivo ${i + 1}`);
  const res = await subir(slug, jpeg(64 * 1024), { ip });
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /ya tiene 8 archivos/);
  // Otro pedido tiene su propio cupo.
  assert.equal((await subir(pedido(), jpeg(1024), { ip })).status, 200);
});

test("cupo por pedido: re-subir el mismo archivo no consume cupo, ni siquiera con el cupo lleno", async () => {
  const slug = pedido();
  const ip = otraIp();
  const foto = jpeg(32 * 1024);
  for (let i = 0; i < 5; i++) assert.equal((await subir(slug, foto, { ip })).status, 200);
  for (let i = 0; i < 7; i++) assert.equal((await subir(slug, jpeg(1024), { ip })).status, 200, `archivo nuevo ${i + 1}`);
  // Con el cupo lleno, el repetido pasa si trae su huella en x-sha256 (EvidenciaInput siempre la manda). Sin ella no
  // hay cómo saber que es repetido antes de leerlo, y con el cupo lleno no se lee.
  assert.equal((await subir(slug, foto, { ip, headers: { "x-sha256": huella(foto) } })).status, 200);
  assert.equal((await subir(slug, foto, { ip })).status, 429);
  assert.equal((await subir(slug, jpeg(1024), { ip })).status, 429);
  const filas = db().prepare("SELECT COUNT(*) AS n FROM evidencias WHERE order_slug = ?").get(slug);
  assert.equal(filas.n, 8);
});

test("cupo por pedido: 150 MB en total, aunque sean pocos archivos", async () => {
  const slug = pedido();
  const ip = otraIp();
  for (let i = 0; i < 3; i++) assert.equal((await subir(slug, mp4(38 * MB), { ip })).status, 200, `video ${i + 1}`);
  // Con el Content-Length verdadero se rechaza antes de leer; si miente, se rechaza al terminar y no queda nada.
  const f = flujo(38 * MB, mp4(16));
  const res = await subir(slug, f.stream, { ip, largo: 38 * MB });
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /150 MB/);
  assert.ok(f.leidos <= 2 * MB, `leyó ${f.leidos / MB} MB`);
  const miente = await subir(slug, mp4(38 * MB), { ip, largo: 1024 });
  assert.equal(miente.status, 429);
  assert.deepEqual(temporales(), []);
});

test("tabla evidencias: una fila por archivo y pedido, con bytes y hora", async () => {
  const slug = pedido();
  const foto = jpeg(2048);
  const antes = Date.now();
  assert.equal((await subir(slug, foto)).status, 200);
  const fila = db().prepare("SELECT * FROM evidencias WHERE order_slug = ?").get(slug);
  assert.equal(fila?.sha256, huella(foto));
  assert.equal(fila.bytes, 2048);
  assert.ok(fila.created_at >= antes);
});

test("tabla evidencias: se crea en caliente sobre una base que no la tiene", async () => {
  const Database = (await import("better-sqlite3")).default;
  const vieja = path.join(dir, "vieja.db");
  const d = new Database(vieja);
  d.exec("CREATE TABLE sellers (pubkey TEXT PRIMARY KEY, store_name TEXT NOT NULL, whatsapp TEXT NOT NULL, created_at INTEGER NOT NULL)");
  d.close();
  const g = globalThis;
  const actual = g.__ppDb;
  const ruta = process.env.PP_DB_PATH;
  try {
    g.__ppDb = undefined;
    process.env.PP_DB_PATH = vieja;
    const tablas = db().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
    db().close();
    assert.ok(tablas.includes("evidencias"), `tablas: ${tablas.join(", ")}`);
  } finally {
    g.__ppDb = actual;
    process.env.PP_DB_PATH = ruta;
  }
});

test("límite por IP: 20 por minuto, por la última entrada de x-forwarded-for", async () => {
  const ip = otraIp();
  for (let i = 0; i < 20; i++) assert.equal((await subir(pedido(), jpeg(512), { ip })).status, 200, `subida ${i + 1}`);
  const res = await subir(pedido(), jpeg(512), { ip });
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /Espera un minuto/);
  // Cambiar la primera entrada (la que puede inventar el cliente) no sirve; otra conexión sí sube.
  const req = (xff) => POST(new Request(`http://x/api/evidencia?pedido=${pedido()}`, {
    method: "POST", body: jpeg(512), headers: { "content-length": "512", "x-forwarded-for": xff } }));
  assert.equal((await req(`198.51.100.7, ${ip}`)).status, 429);
  assert.equal((await req(`${ip}, ${otraIp()}`)).status, 200);
});

test("limitePorVentana: la ventana de 1 minuto se renueva; la IP es la última de x-forwarded-for", async () => {
  const { limitePorVentana, ipDeReenvio } = await import("../src/lib/evidencia.ts");
  let ahora = 0;
  const ok = limitePorVentana(2, 60_000, () => ahora);
  assert.deepEqual([ok("a"), ok("a"), ok("a"), ok("b")], [true, true, false, true]);
  ahora = 59_999;
  assert.equal(ok("a"), false);
  ahora = 60_000;
  assert.equal(ok("a"), true);
  assert.equal(ipDeReenvio("203.0.113.1, 10.0.0.2"), "10.0.0.2");
  assert.equal(ipDeReenvio(" 10.0.0.3 "), "10.0.0.3");
  assert.equal(ipDeReenvio(null), "sin-ip");
});

test("espacio libre: con menos del mínimo (PP_EVIDENCIA_MIN_LIBRE_MB) responde 507 sin escribir", async () => {
  const slug = pedido();
  const foto = jpeg(4096);
  process.env.PP_EVIDENCIA_MIN_LIBRE_MB = String(1e12);
  try {
    const f = flujo(4 * MB, jpeg(16));
    const res = await subir(slug, f.stream, { largo: 4 * MB });
    assert.equal(res.status, 507);
    assert.ok(f.leidos <= 2 * MB, `leyó ${f.leidos / MB} MB`);
    assert.equal((await subir(slug, foto)).status, 507);
    assert.equal(fs.existsSync(path.join(carpeta, `${huella(foto)}.jpg`)), false);
    assert.deepEqual(temporales(), []);
  } finally {
    delete process.env.PP_EVIDENCIA_MIN_LIBRE_MB;
  }
  assert.equal((await subir(slug, foto)).status, 200);
});
