// Tests unitarios de /probar: límite por IP, registro en vivo y textos (`npm run test:unit`, sin dependencias).
import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITES, Limitador, ipDe, minutosDe } from "../src/lib/probar-limite.ts";
import { PASOS, enProbar, errorDelContrato, filasRegistro, hayPlataGuardada, probarStorageKey, siguientePaso } from "../src/lib/probar.ts";

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
