// Tests unitarios de la devolución completa (H-4): `npm run test:unit` (node --test, sin testnet).
// La red es falsa pero estricta: cada sobre lleva un número de secuencia y vence; la red aplica un sobre solo si su
// secuencia es la siguiente de la cuenta y no venció, igual que Stellar. Así se puede probar que, con cualquier falla,
// el comprador recibe el reintegro una sola vez.
import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { splitPreview } from "../src/lib/format.ts";
import { MARGEN_VENCE_MS, VENTANA_HISTORIAL_MS, calcularReintegro, pagarReintegro, reintegros } from "../src/lib/server/reintegro.ts";

const U = 10_000_000n; // 7 decimales
const BUYER = "GCOMPRADOR";

function reloj(t0 = 1_800_000_000_000) {
  let t = t0;
  return { now: () => t, avanzar: (ms) => (t += ms) };
}

/** Red falsa con una cuenta de plataforma (secuencia) y una cola de fallas para los próximos envíos. */
function redFalsa(now) {
  const st = { seq: 100, sobres: new Map(), aplicados: new Map(), pagos: [], armados: 0, envios: [], fallas: [], caida: false };
  let cola = Promise.resolve();
  const red = {
    async consultar(hash) {
      if (st.caida) throw new Error("la red no responde");
      return st.aplicados.get(hash) ?? "no_encontrada";
    },
    async armar(buyer, monto) {
      if (st.caida) throw new Error("la red no responde");
      st.armados++;
      const hash = `sobre-${st.armados}`;
      const s = { hash, seq: st.seq + 1, buyer, monto: monto.toString(), vence: now() + 180_000 };
      st.sobres.set(hash, s);
      return { hash, xdr: JSON.stringify(s), vence: s.vence };
    },
    async enviar(xdr) {
      const s = JSON.parse(xdr);
      st.envios.push(s.hash);
      const falla = st.fallas.shift();
      if (falla === "antes" || st.caida) throw new Error("timeout: no llegó a la red");
      if (now() > s.vence) throw new Error("tx_too_late");
      if (s.seq !== st.seq + 1) throw new Error("tx_bad_seq");
      st.seq++;
      if (falla === "falla_al_aplicar") {
        st.aplicados.set(s.hash, "fallida");
        throw new Error("op_underfunded");
      }
      st.aplicados.set(s.hash, "confirmada");
      st.pagos.push({ hash: s.hash, buyer: s.buyer, monto: BigInt(s.monto) });
      if (falla === "despues") throw new Error("La red tardó demasiado en confirmar");
    },
    // Mutex de la cuenta de la plataforma (como withLock en stellar.ts).
    serializar(fn) {
      const r = cola.then(fn);
      cola = r.catch(() => {});
      return r;
    },
  };
  /** Otra transacción de la plataforma (p. ej. el deploy de un escrow) consume la secuencia. */
  const otraTransaccion = () => st.seq++;
  /**
   * Un sobre viejo entra tarde (reloj del servidor adelantado, mempool lenta): la red lo aplica aunque el servidor
   * lo crea vencido, siempre que su secuencia sea la siguiente. Devuelve true si se aplicó.
   */
  const entraTarde = (hash) => {
    const s = st.sobres.get(hash);
    if (!s || st.aplicados.has(hash) || s.seq !== st.seq + 1) return false;
    st.seq++;
    st.aplicados.set(hash, "confirmada");
    st.pagos.push({ hash, buyer: s.buyer, monto: BigInt(s.monto) });
    return true;
  };
  return { st, red, otraTransaccion, entraTarde };
}

function base(pagado = 150n * U, platformBps = 200) {
  const db = new Database(":memory:");
  const c = reloj();
  reintegros.registrar(db, { slug: "pedido-1", buyer: BUYER, pagado, platformBps, devolucionHash: "devolucion-1" }, c.now());
  return { db, c, ...redFalsa(c.now) };
}

// ---------- Cálculo ----------

test("cálculo: H-4, el comprador pagó 150 y el contrato le devolvió 146,55; el reintegro es 3,45", () => {
  const r = calcularReintegro(150n * U, 200);
  assert.equal(r.recibido, 14655n * (U / 100n));
  assert.equal(r.monto, 345n * (U / 100n));
  assert.equal(r.tw, 45n * (U / 100n));
  assert.equal(r.plataforma, 3n * U);
  assert.equal(r.recibido + r.monto, r.pagado);
});

test("cálculo: igual que splitPreview(…, todo para el comprador) para montos chicos, grandes y con redondeo", () => {
  const montos = [1n, 3n, 7n, 333n, 999n, 10_001n, 1_000_000_007n, 38_461_5385n, 456_750_0001n, 99_999_999_999n];
  for (const bps of [0, 150, 200, 230]) {
    for (const pagado of montos) {
      const r = calcularReintegro(pagado, bps);
      const s = splitPreview(pagado, 10000, bps);
      assert.equal(r.recibido, s.buyer.net, `recibido ${pagado} @ ${bps}`);
      assert.equal(r.monto, s.buyer.tw + s.buyer.platform, `monto ${pagado} @ ${bps}`);
      assert.equal(s.seller.gross, 0n);
      assert.ok(r.monto >= 0n && r.recibido + r.monto === pagado);
    }
  }
});

test("cálculo: rechaza montos no positivos, comisiones inválidas y reintegros fuera del tope", () => {
  assert.throws(() => calcularReintegro(0n, 200), /positivo/);
  assert.throws(() => calcularReintegro(-5n, 200), /positivo/);
  assert.throws(() => calcularReintegro(100n * U, -1), /inválida/);
  assert.throws(() => calcularReintegro(100n * U, 1.5), /inválida/);
  assert.throws(() => calcularReintegro(100n * U, 2000), /fuera de rango/);
  assert.doesNotThrow(() => calcularReintegro(100n * U, 470));
});

// ---------- Registro: clave única por pedido ----------

test("registro: un pedido tiene un solo reintegro aunque se registre dos veces", () => {
  const { db, c } = base();
  assert.equal(reintegros.registrar(db, { slug: "pedido-1", buyer: "GOTRO", pagado: 999n * U, platformBps: 200, devolucionHash: "x" }, c.now()), false);
  const f = reintegros.get(db, "pedido-1");
  assert.equal(f.buyer, BUYER);
  assert.equal(f.monto_units, (345n * (U / 100n)).toString());
  assert.equal(f.estado, "pendiente");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reintegros").get().n, 1);
});

// ---------- Pago sin duplicar ----------

test("pago: arma, guarda el sobre, envía y confirma una vez; las llamadas siguientes no tocan la red", async () => {
  const { db, c, st, red } = base();
  const confirmados = [];
  const r1 = await pagarReintegro(db, "pedido-1", red, { now: c.now, alConfirmar: (f) => confirmados.push(f.tx_hash) });
  assert.equal(r1.recienConfirmado, true);
  assert.equal(r1.fila.estado, "confirmado");
  assert.equal(st.pagos.length, 1);
  assert.equal(st.pagos[0].monto, 345n * (U / 100n));
  assert.equal(st.pagos[0].buyer, BUYER);
  const r2 = await pagarReintegro(db, "pedido-1", red, { now: c.now, alConfirmar: (f) => confirmados.push(f.tx_hash) });
  assert.equal(r2.recienConfirmado, false);
  assert.deepEqual(confirmados, ["sobre-1"]);
  assert.equal(st.armados, 1);
  assert.equal(st.envios.length, 1);
});

test("pago: sin fila (interruptor apagado o devolución parcial) no hace nada", async () => {
  const { db, c, st, red } = base();
  const r = await pagarReintegro(db, "otro-pedido", red, { now: c.now });
  assert.equal(r.fila, undefined);
  assert.equal(st.armados + st.envios.length, 0);
});

test("falla de red DESPUÉS de aplicar: el reintento ve que entró y no paga otra vez", async () => {
  const { db, c, st, red } = base();
  st.fallas.push("despues");
  await assert.rejects(pagarReintegro(db, "pedido-1", red, { now: c.now }), /tardó demasiado/);
  assert.equal(reintegros.get(db, "pedido-1").estado, "enviado");
  assert.match(reintegros.get(db, "pedido-1").error, /tardó demasiado/);
  c.avanzar(15_000);
  const r = await pagarReintegro(db, "pedido-1", red, { now: c.now });
  assert.equal(r.recienConfirmado, true);
  assert.equal(r.fila.tx_hash, "sobre-1");
  assert.equal(r.fila.error, null);
  assert.equal(st.pagos.length, 1);
  assert.equal(st.armados, 1);
});

test("falla de red ANTES de llegar: reenvía el MISMO sobre mientras no venza", async () => {
  const { db, c, st, red } = base();
  st.fallas.push("antes");
  await assert.rejects(pagarReintegro(db, "pedido-1", red, { now: c.now }), /no llegó/);
  c.avanzar(30_000);
  const r = await pagarReintegro(db, "pedido-1", red, { now: c.now });
  assert.equal(r.fila.estado, "confirmado");
  assert.deepEqual(st.envios, ["sobre-1", "sobre-1"]);
  assert.equal(st.armados, 1);
  assert.equal(st.pagos.length, 1);
});

test("sobre perdido y secuencia consumida por otra transacción: espera a que venza y recién arma otro", async () => {
  const { db, c, st, red, otraTransaccion } = base();
  st.fallas.push("antes");
  await assert.rejects(pagarReintegro(db, "pedido-1", red, { now: c.now }));
  otraTransaccion();
  c.avanzar(20_000);
  // Todavía no venció: reenvía el mismo sobre, la red lo rechaza por secuencia y NO arma otro.
  await assert.rejects(pagarReintegro(db, "pedido-1", red, { now: c.now }), /bad_seq/);
  assert.equal(st.armados, 1);
  // Venció (más el margen): ya nunca puede entrar, así que arma uno nuevo.
  c.avanzar(180_000 + MARGEN_VENCE_MS);
  const r = await pagarReintegro(db, "pedido-1", red, { now: c.now });
  assert.equal(r.fila.estado, "confirmado");
  assert.equal(r.fila.tx_hash, "sobre-2");
  assert.equal(r.fila.intentos, 2);
  assert.equal(st.pagos.length, 1);
});

test("un sobre viejo que entra tarde (después de armar otro) cuenta como el reintegro: no se paga otra vez", async () => {
  const { db, c, st, red, entraTarde } = base();
  st.fallas.push("antes");
  await assert.rejects(pagarReintegro(db, "pedido-1", red, { now: c.now }));
  c.avanzar(180_000 + MARGEN_VENCE_MS + 1);
  st.fallas.push("antes"); // el segundo sobre (misma secuencia) tampoco llega
  await assert.rejects(pagarReintegro(db, "pedido-1", red, { now: c.now }));
  assert.equal(reintegros.get(db, "pedido-1").tx_hash, "sobre-2");
  assert.deepEqual(JSON.parse(reintegros.get(db, "pedido-1").historial), ["sobre-1"]);
  assert.equal(entraTarde("sobre-1"), true); // el primero entra tarde y paga
  c.avanzar(180_000 + MARGEN_VENCE_MS + 1);
  const r = await pagarReintegro(db, "pedido-1", red, { now: c.now });
  assert.equal(r.fila.estado, "confirmado");
  assert.equal(r.fila.tx_hash, "sobre-1");
  assert.equal(st.armados, 2);
  assert.equal(st.pagos.length, 1);
});

test("el sobre falló al aplicarse (sin mover plata): arma otro y paga una vez", async () => {
  const { db, c, st, red } = base();
  st.fallas.push("falla_al_aplicar");
  await assert.rejects(pagarReintegro(db, "pedido-1", red, { now: c.now }), /underfunded/);
  const r = await pagarReintegro(db, "pedido-1", red, { now: c.now });
  assert.equal(r.fila.tx_hash, "sobre-2");
  assert.equal(st.pagos.length, 1);
});

test("si la red no responde al consultar, no arma nada y deja todo como estaba", async () => {
  const { db, c, st, red } = base();
  st.fallas.push("antes");
  await assert.rejects(pagarReintegro(db, "pedido-1", red, { now: c.now }));
  st.caida = true;
  c.avanzar(10 * 60_000); // ya venció, pero sin saber qué pasó no se arma otro
  await assert.rejects(pagarReintegro(db, "pedido-1", red, { now: c.now }), /no responde/);
  assert.equal(st.armados, 1);
  assert.equal(reintegros.get(db, "pedido-1").tx_hash, "sobre-1");
  st.caida = false;
  const r = await pagarReintegro(db, "pedido-1", red, { now: c.now });
  assert.equal(r.fila.estado, "confirmado");
  assert.equal(st.pagos.length, 1);
});

test("si pasó demasiado tiempo y la red no encuentra el sobre, queda para revisar a mano y no se paga solo", async () => {
  const { db, c, st, red } = base();
  st.fallas.push("antes");
  await assert.rejects(pagarReintegro(db, "pedido-1", red, { now: c.now }));
  c.avanzar(180_000 + VENTANA_HISTORIAL_MS + 1);
  const r = await pagarReintegro(db, "pedido-1", red, { now: c.now });
  assert.equal(r.fila.estado, "revisar");
  assert.match(r.fila.error, /revisar a mano/);
  await pagarReintegro(db, "pedido-1", red, { now: c.now });
  assert.equal(st.armados, 1);
  assert.equal(st.pagos.length, 0);
  assert.equal(reintegros.pendientes(db).length, 0);
});

test("dos intentos a la vez (dos procesos) pagan una sola vez", async () => {
  const { db, c, st, red } = base();
  const res = await Promise.allSettled([1, 2, 3].map(() => pagarReintegro(db, "pedido-1", red, { now: c.now })));
  assert.equal(st.pagos.length, 1);
  assert.equal(res.filter((x) => x.status === "fulfilled" && x.value.recienConfirmado).length, 1);
  for (const x of res) if (x.status === "rejected") assert.match(x.reason.message, /Otro proceso/);
  assert.equal(reintegros.get(db, "pedido-1").estado, "confirmado");
});

test("fallas al azar durante muchos reintentos: nunca hay dos pagos y al final hay exactamente uno", async () => {
  const opciones = ["antes", "despues", "falla_al_aplicar", undefined, undefined];
  let semilla = 7;
  const azar = (n) => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31), semilla % n);
  for (let corrida = 0; corrida < 200; corrida++) {
    const { db, c, st, red, otraTransaccion, entraTarde } = base(BigInt(1 + azar(10_000)) * U, [150, 200][azar(2)]);
    for (let i = 0; i < 12; i++) {
      st.fallas = [opciones[azar(opciones.length)]];
      st.caida = azar(6) === 0;
      if (azar(3) === 0) otraTransaccion();
      if (st.armados && azar(4) === 0) entraTarde(`sobre-${1 + azar(st.armados)}`);
      await pagarReintegro(db, "pedido-1", red, { now: c.now }).catch(() => {});
      assert.ok(st.pagos.length <= 1, `corrida ${corrida}: ${st.pagos.length} pagos`);
      c.avanzar(azar(4) * 90_000);
    }
    // Se arregla la red: termina de pagar.
    st.fallas = [];
    st.caida = false;
    for (let i = 0; i < 5 && reintegros.get(db, "pedido-1").estado !== "confirmado"; i++) {
      await pagarReintegro(db, "pedido-1", red, { now: c.now }).catch(() => {});
      c.avanzar(180_000 + MARGEN_VENCE_MS + 1);
    }
    const f = reintegros.get(db, "pedido-1");
    assert.equal(f.estado, "confirmado", `corrida ${corrida}`);
    assert.equal(st.pagos.length, 1, `corrida ${corrida}`);
    assert.equal(st.pagos[0].hash, f.tx_hash);
    assert.equal(st.pagos[0].monto.toString(), f.monto_units);
  }
});
