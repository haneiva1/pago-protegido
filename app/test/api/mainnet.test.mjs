// La app con STELLAR_NETWORK=mainnet, sin red real: los módulos de red son los de stubs/ y las llaves son al azar
// (docs/MAINNET.md). `npm run test:api` (cada archivo corre en su propio proceso, así que la red no se filtra a los demás).
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { Account, Keypair, Networks, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";

const plataforma = Keypair.random();
const contrato = () => StrKey.encodeContract(randomBytes(32));
Object.assign(process.env, {
  STELLAR_NETWORK: "mainnet",
  PP_GUARDIAN_ID: contrato(),
  PP_ARBITER_ID: contrato(),
  PLATAFORMA_SECRET: plataforma.secret(),
  ARBITRO_SECRET: Keypair.random().secret(),
  PP_PROBAR: "1", // aunque alguien la deje puesta, en mainnet no existe
  MAINNET_MAX_CUENTAS: "2",
  PP_DEPLOY_LEDGER: "65700000",
});
delete process.env.MAINNET_MAX_USD;
delete process.env.PP_DEVOLUCION_COMPLETA;
// El fondeo y el retiro piden la secuencia al RPC: cuenta de mentira. Cualquier otra llamada de red revienta el test.
globalThis.__ppRpc = { getAccount: async (pk) => new Account(pk, "7") };
globalThis.fetch = async (u) => {
  throw new Error(`Este test no puede usar la red: ${u}`);
};

const { ctx, firma, llamar, nuevoLink, otra, src, tienda } = await import("./entorno.mjs");
const { db, kv, orders } = await import(src("lib/server/db.ts"));
const { info, probarActivo } = await import(src("lib/server/orders.ts"));
const { reiniciarLimites } = await import(src("lib/server/limite.ts"));
const { comprasDeGrupo, isGrupo, metricasSnapshot } = await import(src("lib/server/kpis.ts"));
const { DEPLOY_LEDGER, paresIndexador, reglasIndexador } = await import(src("lib/server/metrics.ts"));
const { NETWORK_PASSPHRASE, USDC_MAINNET } = await import(src("lib/server/config.ts"));
const { EXPLORER } = await import(src("lib/format.ts"));
const { TEXTO } = await import(src("lib/red.ts"));
const { escrows } = await import(new URL("./stubs/escrow.mjs", import.meta.url).href);
const { red } = await import(new URL("./stubs/stellar.mjs", import.meta.url).href);

beforeEach(() => {
  reiniciarLimites();
  red.conTrustline = true;
  red.cuentas = null;
  red.saldo = 0n;
  red.rampas.length = 0;
});

const barato = (extra = {}) => nuevoLink({ priceBs: 35, ...extra }); // unos USD 3,42 con la protección
const pagar = async (kp, slug) =>
  llamar("orders/[slug]/pay", {
    path: `/api/orders/${slug}/pay`,
    params: { slug },
    body: { recipient: "Ana Pérez", city: "Cochabamba" },
    firma: await firma(kp, "POST", `/api/orders/${slug}/pay`),
  });
const activar = (kp) => llamar("wallet/activate", { path: "/api/wallet/activate", body: { pubkey: kp.publicKey() } });
const retirar = async (kp, body) =>
  llamar("wallet/retirar", { path: "/api/wallet/retirar", body, firma: await firma(kp, "POST", "/api/wallet/retirar") });

test("la red es mainnet: passphrase, explorador y aviso visible", async () => {
  assert.equal(NETWORK_PASSPHRASE, Networks.PUBLIC);
  assert.equal(EXPLORER, "https://stellar.expert/explorer/public");
  assert.match(TEXTO.aviso, /^Prueba real en mainnet: plata real, montos chicos/);
  const i = await info().catch(() => null); // el escrow de los tests no lista contratos
  if (i) assert.equal(i.red, "mainnet");
});

test("tope por compra: USD 10 por defecto, con la protección incluida", () => {
  const { slug } = nuevoLink({ priceBs: 112 }); // 112 + 5 de protección = Bs 117 = USD 10
  assert.equal(orders.get(slug).amount_units, "100000000");
  assert.throws(() => nuevoLink({ priceBs: 112.2 }), /máximo por compra es USD 10/);
  assert.throws(() => nuevoLink({ priceBs: 450 }), /máximo por compra/);
  // Si la regala el vendedor no hay protección que sumar: entra hasta Bs 117.
  assert.ok(nuevoLink({ priceBs: 117, feePayer: "vendedor" }).slug);
  assert.throws(() => nuevoLink({ priceBs: 118, feePayer: "vendedor" }), /máximo por compra/);
});

test("el tope es configurable y también frena un link viejo al momento de pagar", async () => {
  const { slug } = barato();
  process.env.MAINNET_MAX_USD = "1";
  try {
    red.saldo = 10n ** 9n;
    const r = await pagar(Keypair.random(), slug);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /máximo por compra es USD 1 /);
  } finally {
    delete process.env.MAINNET_MAX_USD;
  }
});

test("sin el USDC en su cuenta no se crea el contrato, no se emite nada y el link queda libre", async () => {
  const { slug } = barato();
  const total = BigInt(orders.get(slug).amount_units);
  red.saldo = total - 1n;
  const antes = escrows.length;
  const r = await pagar(Keypair.random(), slug);
  assert.equal(r.status, 402);
  assert.match(r.body.error, /faltan 0\.0000001 USDC/);
  assert.equal(escrows.length, antes);
  assert.equal(red.rampas.length, 0);
  assert.equal(orders.get(slug).buyer_pubkey, null);
});

test("no se paga si la tienda o la plataforma no aceptan USDC: después no se podría liberar", async () => {
  const { slug } = barato();
  red.saldo = BigInt(orders.get(slug).amount_units);
  const antes = escrows.length;
  for (const [cuenta, status] of [[tienda.publicKey(), 409], [plataforma.publicKey(), 503]]) {
    red.sinTrustline = new Set([cuenta]);
    assert.equal((await pagar(Keypair.random(), slug)).status, status);
  }
  red.sinTrustline = null;
  assert.equal(escrows.length, antes);
});

test("con el USDC en su cuenta: contrato en USDC, sin rampa, y el fondeo va firmado para mainnet", async () => {
  const { slug } = barato();
  red.saldo = BigInt(orders.get(slug).amount_units);
  const kp = Keypair.random();
  const r = await pagar(kp, slug);
  assert.equal(r.status, 200, r.body.error);
  assert.equal(red.rampas.length, 0);
  assert.equal(orders.get(slug).ramp_hash, null);
  assert.equal(escrows.at(-1).trustline.address, USDC_MAINNET.sac);
  assert.equal(escrows.at(-1).amount, orders.get(slug).amount_units);
  // El hash registrado es el de la red pública: una firma para testnet no sirve.
  const tx = TransactionBuilder.fromXDR(r.body.xdr, Networks.PUBLIC);
  assert.equal(Buffer.from(tx.hash()).toString("hex"), r.body.hash);
  tx.sign(kp);
  const s = await llamar("tx/submit", { path: "/api/tx/submit", body: { signedXdr: tx.toXDR() } });
  assert.equal(s.status, 200, s.body.error);
  assert.equal(orders.get(slug).status, "pagado");
});

test("cuentas nuevas: la plataforma activa hasta MAINNET_MAX_CUENTAS y repetir la misma no gasta cupo", async () => {
  red.cuentas = new Set();
  const [a, b, c] = [Keypair.random(), Keypair.random(), Keypair.random()];
  assert.equal((await activar(a)).status, 200);
  assert.equal((await activar(a)).status, 200);
  assert.equal((await activar(b)).status, 200);
  const r = await activar(c);
  assert.equal(r.status, 429);
  assert.match(r.body.error, /cupos/);
  // Una cuenta que ya existe en la red no gasta cupo.
  red.cuentas.add(c.publicKey());
  assert.equal((await activar(c)).status, 200);
  assert.deepEqual(JSON.parse(kv.get("mainnet:cuentas")), [a.publicKey(), b.publicKey()]);
});

test("la activación es un createAccount de 1,5 XLM firmado por la plataforma para mainnet, sin friendbot", async () => {
  const real = await import(`${src("lib/server/stellar.ts")}?real`);
  const nueva = Keypair.random().publicKey();
  const enviadas = [];
  const rpcDeAntes = globalThis.__ppRpc;
  const fetchDeAntes = globalThis.fetch;
  const pedidas = [];
  globalThis.__ppRpc = {
    getAccount: async (pk) => new Account(pk, "7"),
    sendTransaction: async (tx) => (enviadas.push(tx), { status: "PENDING" }),
    getTransaction: async () => ({ status: "SUCCESS" }),
  };
  globalThis.fetch = async (u) => {
    pedidas.push(String(u));
    return enviadas.length ? { status: 200, ok: true, json: async () => ({ balances: [] }) } : { status: 404, ok: false };
  };
  try {
    await real.ensureFunded(nueva);
    await assert.rejects(() => real.mintLabusd(nueva, 1n), /no hay rampa simulada/);
  } finally {
    globalThis.__ppRpc = rpcDeAntes;
    globalThis.fetch = fetchDeAntes;
  }
  assert.equal(enviadas.length, 1);
  const [tx] = enviadas;
  assert.equal(tx.networkPassphrase, Networks.PUBLIC);
  assert.equal(tx.source, plataforma.publicKey());
  assert.equal(tx.operations.length, 1);
  assert.equal(tx.operations[0].type, "createAccount");
  assert.equal(tx.operations[0].destination, nueva);
  assert.equal(Number(tx.operations[0].startingBalance), 1.5);
  assert.ok(plataforma.verify(tx.hash(), tx.signatures[0].signature ?? tx.signatures[0].signature()));
  for (const u of pedidas) assert.match(u, /^https:\/\/horizon\.stellar\.org\/accounts\//);
});

test("retiro: pide la firma de la cuenta, revisa el destino y arma un pago de todo el USDC", async () => {
  const kp = Keypair.random();
  const destino = Keypair.random().publicKey();
  const sinFirma = await llamar("wallet/retirar", { path: "/api/wallet/retirar", body: { destino } });
  assert.equal(sinFirma.status, 401);
  assert.equal((await retirar(kp, { destino })).status, 409); // sin saldo
  red.saldo = 30_000_000n;
  assert.equal((await retirar(kp, { destino: "GABC" })).status, 400);
  assert.equal((await retirar(kp, { destino: kp.publicKey() })).status, 400);
  assert.equal((await retirar(kp, { destino, memo: "x".repeat(29) })).status, 400);
  red.conTrustline = false;
  assert.match((await retirar(kp, { destino })).body.error, /no acepta USDC/);
  red.conTrustline = true;
  const r = await retirar(kp, { destino, memo: "12345" });
  assert.equal(r.status, 200, r.body.error);
  const tx = TransactionBuilder.fromXDR(r.body.xdr, Networks.PUBLIC);
  assert.equal(tx.source, kp.publicKey());
  assert.equal(Buffer.from(tx.memo.value).toString("utf8"), "12345");
  const [op] = tx.operations;
  assert.equal(op.type, "payment");
  assert.equal(op.destination, destino);
  assert.equal(Number(op.amount), 3);
  assert.equal(op.asset.getIssuer(), USDC_MAINNET.issuer);
  // Solo vale con la firma de su dueño.
  assert.equal((await llamar("tx/submit", { path: "/api/tx/submit", body: { signedXdr: tx.toXDR() } })).status, 400);
  const r2 = await retirar(kp, { destino });
  const tx2 = TransactionBuilder.fromXDR(r2.body.xdr, Networks.PUBLIC);
  tx2.sign(kp);
  assert.equal((await llamar("tx/submit", { path: "/api/tx/submit", body: { signedXdr: tx2.toXDR() } })).status, 200);
});

test("saldo: devuelve el USDC de la cuenta para esperar el depósito", async () => {
  red.saldo = 25_000_000n;
  const cuenta = Keypair.random().publicKey();
  const r = await llamar("wallet/saldo", { method: "GET", path: `/api/wallet/saldo?cuenta=${cuenta}` });
  assert.deepEqual(r.body, { cuenta, saldo: "25000000", moneda: "USDC", emisor: USDC_MAINNET.issuer });
  assert.equal((await llamar("wallet/saldo", { method: "GET", path: "/api/wallet/saldo?cuenta=x" })).status, 400);
});

test("/probar (rampa simulada) no existe en mainnet aunque PP_PROBAR=1", () => {
  assert.equal(process.env.PP_PROBAR, "1");
  assert.equal(probarActivo(), false);
});

test("antes de pedir la firma se revisa que los contratos corran el WASM publicado de mainnet", async () => {
  const { revisarWasm } = await import(src("lib/server/escrow/tw.ts"));
  const { MAINNET_PUBLICO } = await import(src("lib/server/config.ts"));
  const tw = readFileSync(new URL("../../../contracts/wasm/escrow-mainnet.wasm", import.meta.url));
  const deTestnet = readFileSync(new URL("../../../contracts/wasm/escrow.wasm", import.meta.url));
  assert.equal(revisarWasm("escrow", tw, MAINNET_PUBLICO.twWasmHash).ok, true);
  assert.equal(revisarWasm("escrow", deTestnet, MAINNET_PUBLICO.twWasmHash).ok, false);
  assert.equal(revisarWasm("pp_guardian", tw, MAINNET_PUBLICO.guardianWasmHash).ok, false);
});

test("métricas: mainnet es su propio grupo, aparte del piloto, y no lee los contratos de testnet", async () => {
  const pares = paresIndexador();
  assert.deepEqual(pares, [{ guardian: process.env.PP_GUARDIAN_ID, arbiter: process.env.PP_ARBITER_ID }]);
  assert.equal(DEPLOY_LEDGER, 65_700_000);
  const reglas = reglasIndexador();
  assert.equal(reglas.labusdSac, USDC_MAINNET.sac); // aunque LABUSD_SAC esté puesta con la de testnet
  assert.equal(reglas.platform, plataforma.publicKey());

  db().prepare(`UPDATE sellers SET pilot = 1 WHERE pubkey = ?`).run(tienda.publicKey());
  const compras = [{ seller: tienda.publicKey() }, { seller: otra.publicKey() }];
  assert.deepEqual(comprasDeGrupo("piloto", compras), [compras[0]]);
  assert.deepEqual(comprasDeGrupo("mainnet", compras), [compras[1]]);
  assert.deepEqual(comprasDeGrupo("equipo", compras), []); // "equipo" es solo de testnet
  assert.equal(isGrupo("mainnet"), true);
  assert.equal(isGrupo("equipo"), false);
  const m = await metricasSnapshot();
  assert.equal(m.red, "mainnet");
  assert.equal(m.mainnet.kpis.compras, 0);
});

test("una base es de una sola red: la de mainnet queda marcada y una con pedidos de testnet se rechaza", () => {
  assert.equal(kv.get("red"), "mainnet");
  const g = globalThis;
  const abierta = g.__ppDb;
  try {
    kv.set("red", ""); // como una base de testnet con pedidos
    g.__ppDb = undefined;
    assert.throws(() => db(), /base es de testnet/);
    g.__ppDb = undefined;
    process.env.PP_DB_PATH = join(mkdtempSync(join(tmpdir(), "trato-mainnet-")), "nueva.db");
    assert.equal(db().prepare(`SELECT v FROM kv WHERE k = 'red'`).get().v, "mainnet");
  } finally {
    process.env.PP_DB_PATH = ctx.db;
    g.__ppDb = abierta;
  }
});
