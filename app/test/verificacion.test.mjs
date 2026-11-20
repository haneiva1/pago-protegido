// Tests unitarios del indexador verificado (H-9): `npm test`.
// Usan un fondeo REAL de testnet (fixtures/fondeo-real.json, eventos XDR de la tx 0933303d…) y escrows
// falsos armados como en la PoC del jurado (contracts/integration-tests/tests/hallazgos_jurado.rs).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { xdr } from "@stellar/stellar-sdk";
import { REGLAS, evaluar, firmaReglas, transferenciasDe, transferenciasDeEfectos, transferenciasDeXdr } from "../src/lib/server/verificacion.ts";

const real = JSON.parse(readFileSync(new URL("./fixtures/fondeo-real.json", import.meta.url), "utf8"));
const compra = real.compra;
const eventosReales = real.contractEventsXdr.map((b) => xdr.ContractEvent.fromXDR(b, "base64"));

const TW_WASM = "1b367bc8476cf80b89f6396e2aa07b602b78361dd829b5ce9b64ada365196660";
const LABUSD = "CC65P6TQQ646YDXVS3PM6YVZASXW6WM5B67YKI46JH4EG65LJPOGBD4S";
const PLATAFORMA = "GDDJTZ7LNW33A46DYIYWQY5YDBZPPHLIAQHOAHTIM5ZIQALDVVTCPKDZ";
const V2 = { guardian: "CDKYF7OAJTACP4JNJSGGXDRA3DHE442R26CT5ZE5DJHNSHH7XJUOATOT", arbiter: "CDTEA424AWSIIHEQ4FIQHFQOTWS3XAVLQHX7FI3MU6JZP4OPMTEVU5UA" };
const V1 = { guardian: "CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU", arbiter: "CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU" };
const reglas = { wasmHash: TW_WASM, labusdSac: LABUSD, platform: PLATAFORMA, pares: [V2, V1] };

const OTRO_WASM = "ab".repeat(32);
const TOKEN_PROPIO = "CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K";
const TERCERO = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

/** Roles del "modo guardián" con el pago de la fixture (v1: ledger 5790841). */
const rolesTrato = (pares = V1) => ({
  approver: pares.guardian,
  release_signer: pares.guardian,
  dispute_resolver: pares.arbiter,
  platform: PLATAFORMA,
  receiver: compra.seller,
  service_provider: compra.seller,
});
const hechosReales = () => ({ creadoPorTrato: true, wasmHash: TW_WASM, roles: rolesTrato(), token: LABUSD, monto: compra.amount, transferencias: transferenciasDeXdr(eventosReales) });

test("un fondeo real de testnet trae la transferencia del SAC del comprador al escrow", () => {
  const t = transferenciasDeXdr(eventosReales);
  assert.deepEqual(t, [{ token: LABUSD, from: compra.buyer, to: compra.escrow, amount: compra.amount }]);
});

test("escrow verdadero: cumple las cinco reglas y cuenta", () => {
  assert.deepEqual(evaluar(compra, hechosReales(), reglas), { ok: true, fallas: [] });
});

test("5.ª regla: el mismo escrow genuino de TW, si no es de un pedido de Trato → descartada por origen", () => {
  // initialize_escrow no pide la firma de la plataforma ni del vendedor: cualquiera arma un escrow así con 1 stroop.
  assert.deepEqual(evaluar(compra, { ...hechosReales(), creadoPorTrato: false }, reglas), { ok: false, fallas: ["origen"] });
});

test("escrow verdadero de v2 también cuenta (pares guardián/árbitro v1 y v2)", () => {
  assert.equal(evaluar(compra, { ...hechosReales(), roles: rolesTrato(V2) }, reglas).ok, true);
});

test("PoC (a): escrow falso que imita a TW, venta de USD 5.000 sin mover plata → descartada", () => {
  const falso = { escrow: "CBFAKE".padEnd(56, "A"), buyer: TERCERO, seller: compra.seller, amount: "50000000000", tx_fondeo: "ff".repeat(32) };
  // El contrato falso devuelve los roles que quiera, con la moneda real, pero su `fund_escrow` no transfiere nada.
  const h = { creadoPorTrato: false, wasmHash: OTRO_WASM, roles: { ...rolesTrato(V2), platform: TERCERO }, token: LABUSD, monto: falso.amount, transferencias: [] };
  const r = evaluar(falso, h, reglas);
  assert.equal(r.ok, false);
  assert.deepEqual(r.fallas, ["wasm", "roles", "fondeo", "origen"]);
});

test("PoC (b): reclamo plantado a un vendedor honesto con 1 unidad de polvo → descartada", () => {
  const falso = { ...compra, escrow: "CBFAKE".padEnd(56, "B"), buyer: TERCERO, amount: "15000000000" };
  const polvo = [{ token: LABUSD, from: TERCERO, to: falso.escrow, amount: "1" }];
  const h = { creadoPorTrato: false, wasmHash: OTRO_WASM, roles: rolesTrato(V2), token: LABUSD, monto: falso.amount, transferencias: polvo };
  assert.deepEqual(evaluar(falso, h, reglas).fallas, ["wasm", "fondeo", "origen"]);
});

test("WASM real de TW con un token propio (100 ventas, 0 reclamos) → descartada por moneda y fondeo", () => {
  const propio = transferenciasDeXdr(eventosReales).map((t) => ({ ...t, token: TOKEN_PROPIO }));
  const r = evaluar(compra, { ...hechosReales(), token: TOKEN_PROPIO, transferencias: propio }, reglas);
  assert.deepEqual(r.fallas, ["moneda", "fondeo"]);
});

test("roles: otra plataforma, otro árbitro o el cobro a otra cuenta → descartada", () => {
  for (const cambio of [{ platform: TERCERO }, { dispute_resolver: V2.arbiter }, { receiver: TERCERO }, { approver: TERCERO }]) {
    assert.deepEqual(evaluar(compra, { ...hechosReales(), roles: { ...rolesTrato(), ...cambio } }, reglas).fallas, ["roles"], JSON.stringify(cambio));
  }
});

test("fondeo: monto distinto, otro pagador u otro destino → descartada", () => {
  const base = transferenciasDeXdr(eventosReales)[0];
  for (const t of [{ ...base, amount: "1" }, { ...base, from: TERCERO }, { ...base, to: TERCERO }]) {
    assert.deepEqual(evaluar(compra, { ...hechosReales(), transferencias: [t] }, reglas).fallas, ["fondeo"]);
  }
  assert.deepEqual(evaluar(compra, { ...hechosReales(), monto: "1" }, reglas).fallas, ["fondeo"]);
});

test("sin datos no hay prueba: instancia o transacción no encontradas → descartada", () => {
  const r = evaluar(compra, { creadoPorTrato: true, wasmHash: null, roles: null, token: null, monto: null, transferencias: null }, reglas);
  assert.deepEqual(r.fallas, ["wasm", "roles", "moneda", "fondeo"]);
});

test("transferenciasDe: acepta el monto como i128 o como mapa (CAP-67) e ignora otros eventos", () => {
  const ev = (topics, data, contractId = LABUSD) => ({ type: "contract", contractId, topics, data });
  const t = transferenciasDe([
    ev(["transfer", compra.buyer, compra.escrow, "LABUSD:G…"], 5n),
    ev(["transfer", compra.buyer, compra.escrow], { amount: 7n, to_muxed_id: 1n }),
    ev(["mint", compra.buyer, compra.escrow], 9n),
    ev(["transfer", compra.buyer], 9n),
    { type: "diagnostic", contractId: LABUSD, topics: ["transfer", compra.buyer, compra.escrow], data: 9n },
  ]);
  assert.deepEqual(
    t.map((x) => x.amount),
    ["5", "7"],
  );
});

test("Horizon (pagos fuera de la ventana del RPC): account_debited + contract_credited = transferencia del SAC", () => {
  const efectos = [
    { type: "account_debited", account: compra.buyer, asset_type: "credit_alphanum12", asset_code: "LABUSD", asset_issuer: "GBT2SEWEU7JK7HBOKMTED3WIUC6FX56CPAJWQCGF6XMUBAAZ7GKHD2O3", amount: "150.0000000" },
    { type: "contract_credited", contract: compra.escrow, asset_type: "credit_alphanum12", asset_code: "LABUSD", asset_issuer: "GBT2SEWEU7JK7HBOKMTED3WIUC6FX56CPAJWQCGF6XMUBAAZ7GKHD2O3", amount: "150.0000000" },
  ];
  const t = transferenciasDeEfectos(efectos, "Test SDF Network ; September 2015");
  assert.deepEqual(t, [{ token: LABUSD, from: compra.buyer, to: compra.escrow, amount: compra.amount }]);
  assert.equal(evaluar(compra, { ...hechosReales(), transferencias: t }, reglas).ok, true);
});

test("la huella de las reglas cambia si cambia un valor esperado; hay un texto público por regla", () => {
  assert.notEqual(firmaReglas(reglas), firmaReglas({ ...reglas, labusdSac: TOKEN_PROPIO }));
  assert.equal(firmaReglas(reglas), firmaReglas({ ...reglas }));
  assert.deepEqual(
    REGLAS.map((r) => r.regla),
    ["wasm", "roles", "moneda", "fondeo", "origen"],
  );
});
