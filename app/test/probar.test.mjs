// Tests unitarios de /probar: límite por IP, registro en vivo y textos (`npm run test:unit`, sin dependencias).
import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITES, Limitador, ipDe, minutosDe } from "../src/lib/probar-limite.ts";
import {
  ETAPAS,
  PASOS,
  PASOS_PAGO,
  cuentaRegresiva,
  duracion,
  enProbar,
  errorDelContrato,
  etapaActual,
  etapas,
  filasRegistro,
  hayPlataGuardada,
  probarStorageKey,
  progresoPago,
  resumenRed,
  siguientePaso,
  turnoDe,
} from "../src/lib/probar.ts";

const PROHIBIDAS = [/garant[ií]a/i, /\bseguro\b/i, /custodia/i, /arbitraje/i, /árbitro/i, /100\s?%/, /cripto/i, /\btoken/i, /\bwallet\b/i, /\bllaves?\b/i, /blockchain/i];

test("límite por IP: deja pasar hasta el máximo, después avisa cuánto falta y la ventana se desliza", () => {
  const l = new Limitador({ inicio: { max: 2, ventanaMs: 1000 }, rampa: { max: 1, ventanaMs: 1000 }, desvio: { max: 1, ventanaMs: 1000 } });
  assert.equal(l.intentar("inicio", "1.1.1.1", 0), null);
  assert.equal(l.intentar("inicio", "1.1.1.1", 100), null);
  assert.equal(l.intentar("inicio", "1.1.1.1", 200), 800); // libera el primero a los 1000 ms
  assert.equal(l.intentar("inicio", "2.2.2.2", 200), null, "otra IP tiene su propio cupo");
  assert.equal(l.intentar("rampa", "1.1.1.1", 200), null, "cada tipo tiene su propio cupo");
  assert.equal(l.intentar("inicio", "1.1.1.1", 1000), null, "pasada la ventana, vuelve a dejar pasar");
  assert.equal(l.intentar("inicio", "1.1.1.1", 1050), 50);
});

test("límites de /probar: pocas pruebas por hora para no gastar la rampa", () => {
  assert.ok(LIMITES.inicio.max <= 10 && LIMITES.rampa.max <= 10);
  for (const k of Object.keys(LIMITES)) assert.equal(LIMITES[k].ventanaMs, 3600_000);
  assert.equal(minutosDe(1), 1);
  assert.equal(minutosDe(61_000), 2);
});

test("IP de quien llama: primera de X-Forwarded-For, después X-Real-IP, si no 'local'", () => {
  const h = (o) => ({ get: (k) => o[k] ?? null });
  assert.equal(ipDe(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(ipDe(h({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(ipDe(h({})), "local");
});

test("cuentas de /probar separadas de las de la app; fuera del navegador no es /probar", () => {
  assert.equal(probarStorageKey("vendedor"), "pp.probar.vendedor");
  assert.equal(probarStorageKey("comprador"), "pp.probar.comprador");
  assert.equal(enProbar(), false);
});

test("registro en vivo: cada movimiento va a su paso; la activación se reparte según de quién es la cuenta", () => {
  const V = "GVENDEDOR";
  const filas = filasRegistro(
    [
      { kind: "liberacion", actor: "comprador", hash: "f", created_at: 6 },
      { kind: "trustline", actor: V, hash: "a", created_at: 1 },
      { kind: "trustline", actor: "GCOMPRADOR", hash: "b", created_at: 2 },
      { kind: "rampa", actor: "rampa", hash: "c", created_at: 3 },
      { kind: "escrow", actor: "plataforma", hash: "d", created_at: 3 },
      { kind: "fondeo", actor: "comprador", hash: "e", created_at: 4 },
      { kind: "envio", actor: "vendedor", hash: "g", created_at: 5 },
      { kind: "algo-nuevo", actor: "x", hash: null, created_at: 7 },
    ],
    V,
  );
  assert.deepEqual(
    filas.map((f) => [f.paso, f.hash]),
    [
      ["link", "a"],
      ["pago", "b"],
      ["pago", "c"],
      ["pago", "d"],
      ["pago", "e"],
      ["envio", "g"],
      ["cobro", "f"],
      ["otro", null],
    ],
  );
  assert.deepEqual(
    PASOS.map((p) => p.titulo),
    ["Crear el link", "Pagar", "Registrar el envío", "Pagar al vendedor"],
  );
});

test("intento de desvío: el error del contrato sale del texto crudo o del código", () => {
  assert.equal(errorDelContrato("HostError: Error(Contract, #12)\n\nEvent log (newest first): …"), "Error(Contract, #12)");
  assert.equal(errorDelContrato(undefined, 12), "Error(Contract, #12)");
  assert.equal(errorDelContrato("otra cosa"), null);
  assert.equal(hayPlataGuardada("pagado"), true);
  assert.equal(hayPlataGuardada("enviado"), true);
  assert.equal(hayPlataGuardada("en_disputa"), true);
  for (const s of ["esperando_pago", "liberado", "resuelto", "devuelto", null]) assert.equal(hayPlataGuardada(s), false);
});

test("textos de /probar sin palabras prohibidas", () => {
  const estados = [null, "esperando_pago", "pagado", "enviado", "liberado", "devuelto", "en_disputa", "resuelto", "otro"];
  const textos = [
    siguientePaso({ tienda: false, status: null }),
    ...estados.map((status) => siguientePaso({ tienda: true, status })),
    ...filasRegistro(
      ["trustline", "rampa", "escrow", "fondeo", "envio", "aprobacion", "liberacion", "extension", "disputa", "resolucion", "devolucion"].map((kind, i) => ({
        kind,
        actor: i ? "x" : "V",
        hash: null,
        created_at: i,
      })),
      "V",
    ).map((f) => f.texto),
  ];
  for (const t of textos) for (const re of PROHIBIDAS) assert.doesNotMatch(t, re, `${re} en "${t}"`);
});

test("la historia en 5 etapas: una sola 'ahora', el desvío se puede saltar y la devolución salta el envío", () => {
  const ids = ETAPAS.map((e) => e.id);
  assert.deepEqual(ids, ["link", "pago", "desvio", "envio", "cobro"]);
  const sinNada = etapas({ pedido: false, status: null, desvios: 0, envio: false });
  assert.equal(sinNada.link, "ahora");
  assert.deepEqual(etapaActual(sinNada), { numero: 1, terminada: false });
  const esperando = etapas({ pedido: true, status: "esperando_pago", desvios: 0, envio: false });
  assert.deepEqual([esperando.link, esperando.pago, esperando.desvio], ["hecha", "ahora", "pendiente"]);
  const pagado = etapas({ pedido: true, status: "pagado", desvios: 0, envio: false });
  assert.deepEqual([pagado.pago, pagado.desvio, pagado.envio], ["hecha", "ahora", "pendiente"], "con la plata adentro toca intentar el desvío");
  const desviado = etapas({ pedido: true, status: "pagado", desvios: 1, envio: false });
  assert.deepEqual([desviado.desvio, desviado.envio], ["hecha", "ahora"]);
  const enviadoSinDesvio = etapas({ pedido: true, status: "enviado", desvios: 0, envio: true });
  assert.deepEqual([enviadoSinDesvio.desvio, enviadoSinDesvio.envio, enviadoSinDesvio.cobro], ["omitida", "hecha", "ahora"]);
  assert.deepEqual(etapaActual(enviadoSinDesvio), { numero: 5, terminada: false });
  const liberado = etapas({ pedido: true, status: "liberado", desvios: 1, envio: true });
  assert.ok(Object.values(liberado).every((v) => v === "hecha"));
  assert.deepEqual(etapaActual(liberado), { numero: 5, terminada: true });
  const devuelto = etapas({ pedido: true, status: "devuelto", desvios: 0, envio: false });
  assert.deepEqual([devuelto.pago, devuelto.desvio, devuelto.envio, devuelto.cobro], ["hecha", "omitida", "omitida", "omitida"]);
  for (const e of [sinNada, esperando, pagado, desviado, enviadoSinDesvio, liberado, devuelto]) assert.ok(Object.values(e).filter((v) => v === "ahora").length <= 1);
});

test("a quién le toca: el vendedor crea y despacha, el comprador paga y confirma", () => {
  assert.equal(turnoDe({ tienda: false, status: null }), "vendedor");
  assert.equal(turnoDe({ tienda: true, status: null }), "vendedor");
  assert.equal(turnoDe({ tienda: true, status: "esperando_pago" }), "comprador");
  assert.equal(turnoDe({ tienda: true, status: "pagado" }), "vendedor");
  assert.equal(turnoDe({ tienda: true, status: "enviado" }), "comprador");
  assert.equal(turnoDe({ tienda: true, status: "liberado" }), null);
});

test("esperas explicadas: avance del pago en 4 movimientos, cuenta regresiva y duración legibles", () => {
  const filas = filasRegistro(
    [
      { kind: "trustline", actor: "GCOMPRADOR", hash: "b", created_at: 2 },
      { kind: "rampa", actor: "rampa", hash: "c", created_at: 3 },
    ],
    "V",
  );
  assert.deepEqual(progresoPago([]), { hechos: 0, total: 4, haciendo: PASOS_PAGO[0].haciendo });
  assert.deepEqual(progresoPago(filas), { hechos: 2, total: 4, haciendo: "Creando el contrato de este pedido" });
  const todo = filasRegistro(
    ["trustline", "rampa", "escrow", "fondeo"].map((kind, i) => ({ kind, actor: "GCOMPRADOR", hash: String(i), created_at: i })),
    "V",
  );
  assert.deepEqual(progresoPago(todo), { hechos: 4, total: 4, haciendo: null });
  assert.equal(cuentaRegresiva(61_000, 0), "1:01");
  assert.equal(cuentaRegresiva(500, 0), "0:01");
  assert.equal(cuentaRegresiva(0, 5_000), "0:00", "nunca negativa");
  assert.equal(duracion(48_000), "48 s");
  assert.equal(duracion(134_000), "2 min 14 s");
  assert.equal(duracion(120_000), "2 min");
  const r = resumenRed(
    [
      { kind: "trustline", paso: "link", texto: "", hash: "a", at: 1_000 },
      { kind: "liberacion", paso: "cobro", texto: "", hash: "f", at: 90_000 },
      { kind: "x", paso: "otro", texto: "", hash: null, at: 95_000 },
    ],
    0,
  );
  assert.deepEqual(r, { transacciones: 2, duracionMs: 90_000 });
});

test("textos nuevos de /probar sin palabras prohibidas", () => {
  const textos = [...ETAPAS.map((e) => e.titulo), ...ETAPAS.map((e) => e.corto), ...PASOS_PAGO.map((p) => p.haciendo)];
  for (const t of textos) for (const re of PROHIBIDAS) assert.doesNotMatch(t, re, `${re} en "${t}"`);
});

test("la presentación: un título grande por momento, sin palabras prohibidas", async () => {
  const { tituloEtapa } = await import("../src/lib/probar.ts");
  assert.equal(tituloEtapa({ pedido: false, status: null, desvios: 0 }), "La tienda crea el link");
  assert.equal(tituloEtapa({ pedido: true, status: "esperando_pago", desvios: 0 }), "El comprador paga");
  assert.equal(tituloEtapa({ pedido: true, status: "pagado", desvios: 0 }), "La plata espera entre los dos");
  assert.equal(tituloEtapa({ pedido: true, status: "pagado", desvios: 1 }), "Nadie puede desviarla");
  assert.equal(tituloEtapa({ pedido: true, status: "enviado", desvios: 1 }), "La tienda despachó");
  assert.equal(tituloEtapa({ pedido: true, status: "liberado", desvios: 1 }), "La tienda cobró");
  for (const s of ["esperando_pago", "pagado", "enviado", "liberado", "devuelto", "en_disputa", "resuelto"])
    for (const re of PROHIBIDAS) assert.doesNotMatch(tituloEtapa({ pedido: true, status: s, desvios: 1 }), re);
});
