// Configuración por red (STELLAR_NETWORK=testnet|mainnet, docs/MAINNET.md), sin tocar ninguna red. `npm run test:unit`.
// Este archivo corre sin STELLAR_NETWORK: comprueba que testnet es el valor por defecto y que no cambió nada. Lo que hace
// la app con STELLAR_NETWORK=mainnet se prueba en test/api/mainnet.test.mjs.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Asset, Keypair, Networks, StrKey } from "@stellar/stellar-sdk";

delete process.env.STELLAR_NETWORK;
delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
const red = await import("../src/lib/red.ts");
const config = await import("../src/lib/server/config.ts");
const { EXPLORER, DOLLAR_NOTE } = await import("../src/lib/format.ts");

const CIRCLE = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const contrato = () => StrKey.encodeContract(randomBytes(32));
const entorno = (extra = {}) => ({
  STELLAR_NETWORK: "mainnet",
  PP_GUARDIAN_ID: contrato(),
  PP_ARBITER_ID: contrato(),
  PLATAFORMA_SECRET: Keypair.random().secret(),
  ARBITRO_SECRET: Keypair.random().secret(),
  ...extra,
});

test("STELLAR_NETWORK: vacío es testnet, solo existen testnet y mainnet y nunca se adivina", () => {
  for (const v of [undefined, null, "", "  ", "testnet", "TESTNET"]) assert.equal(red.leerRed(v), "testnet");
  for (const v of ["mainnet", " Mainnet "]) assert.equal(red.leerRed(v), "mainnet");
  for (const v of ["public", "pubnet", "main", "futurenet", "mainet"]) assert.throws(() => red.leerRed(v), /testnet.*mainnet/);
});

test("sin STELLAR_NETWORK todo es lo de siempre: URLs, passphrase, explorador y textos de testnet", () => {
  assert.equal(red.RED, "testnet");
  assert.equal(red.ES_MAINNET, false);
  assert.equal(config.NETWORK_PASSPHRASE, Networks.TESTNET);
  assert.equal(config.RPC_URL, "https://soroban-testnet.stellar.org");
  assert.equal(config.HORIZON_URL, "https://horizon-testnet.stellar.org");
  assert.equal(config.FRIENDBOT_URL, "https://friendbot.stellar.org");
  assert.equal(EXPLORER, "https://stellar.expert/explorer/testnet");
  assert.equal(red.TEXTO.aviso, "Modo práctica: no se mueve dinero real.");
  assert.match(DOLLAR_NOTE, /dólares de prueba/);
});

test("testnet ignora las variables de mainnet", () => {
  const t = config.redes("testnet", { STELLAR_RPC_URL: "https://otro.example", STELLAR_HORIZON_URL: "https://otro.example" });
  assert.deepEqual(t, { passphrase: Networks.TESTNET, rpc: "https://soroban-testnet.stellar.org", horizon: "https://horizon-testnet.stellar.org", friendbot: "https://friendbot.stellar.org" });
});

test("mainnet: passphrase pública, RPC y Horizon de mainnet (cambiables) y sin friendbot", () => {
  const m = config.redes("mainnet", {});
  assert.equal(m.passphrase, Networks.PUBLIC);
  assert.equal(m.rpc, "https://rpc.lightsail.network");
  assert.equal(m.horizon, "https://horizon.stellar.org");
  assert.equal(m.friendbot, null);
  const otro = config.redes("mainnet", { STELLAR_RPC_URL: "https://rpc.example", STELLAR_HORIZON_URL: "https://h.example/" });
  assert.equal(otro.rpc, "https://rpc.example");
  assert.equal(otro.horizon, "https://h.example");
  for (const u of Object.values(m)) assert.doesNotMatch(String(u), /testnet|friendbot/i);
  assert.equal(red.explorador("mainnet"), "https://stellar.expert/explorer/public");
});

test("la moneda de mainnet es el USDC de Circle y su contrato se deriva del emisor", () => {
  assert.equal(config.USDC_MAINNET.code, "USDC");
  assert.equal(config.USDC_MAINNET.issuer, CIRCLE);
  assert.equal(config.USDC_MAINNET.sac, new Asset("USDC", CIRCLE).contractId(Networks.PUBLIC));
  assert.equal(config.USDC_MAINNET.sac, "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75");
  // Ninguna variable puede apuntar a otra moneda.
  const c = config.cfgMainnet(entorno({ LABUSD_CODE: "LABUSD", LABUSD_SAC: contrato() }));
  assert.equal(c.labusdCode, "USDC");
  assert.equal(c.emisor, CIRCLE);
  assert.equal(c.labusdSac, config.USDC_MAINNET.sac);
});

test("mainnet no arranca con contratos que faltan, mal escritos, repetidos o de testnet", () => {
  for (const k of ["PP_GUARDIAN_ID", "PP_ARBITER_ID"]) {
    assert.throws(() => config.cfgMainnet(entorno({ [k]: "" })), new RegExp(`Falta ${k}`));
    assert.throws(() => config.cfgMainnet(entorno({ [k]: "CABC" })), /no es un contrato/);
  }
  for (const p of config.PARES_HISTORICOS) {
    assert.throws(() => config.cfgMainnet(entorno({ PP_GUARDIAN_ID: p.guardian })), /testnet/);
    assert.throws(() => config.cfgMainnet(entorno({ PP_ARBITER_ID: p.arbiter })), /testnet/);
  }
  const mismo = contrato();
  assert.throws(() => config.cfgMainnet(entorno({ PP_GUARDIAN_ID: mismo, PP_ARBITER_ID: mismo })), /mismo contrato/);
  assert.throws(() => config.cfgMainnet(entorno({ PP_MODE: "direct" })), /direct/);
});

test("mainnet: las llaves son obligatorias y no hay emisor de prueba", () => {
  const c = config.cfgMainnet(entorno());
  assert.equal(c.mode, "guardian");
  assert.ok(c.plataforma.publicKey().startsWith("G"));
  assert.throws(() => c.lab, /emisor/);
  assert.throws(() => config.cfgMainnet(entorno({ PLATAFORMA_SECRET: "" })).plataforma, /Falta PLATAFORMA_SECRET/);
  assert.throws(() => config.cfgMainnet(entorno({ ARBITRO_SECRET: undefined })).arbitro, /Falta ARBITRO_SECRET/);
});

test("mainnet: el escrow es el de Trustless Work en mainnet, con su cuenta del 0,3 %, y ninguna variable lo cambia", () => {
  const c = config.cfgMainnet(entorno({ ESCROW_WASM_HASH: config.TESTNET_PUBLICO.twWasmHash, TWFEE_ADDRESS: Keypair.random().publicKey() }));
  assert.equal(c.wasmHash, "96d51751f924c938a081deb740056dc1c5cc60c6e645672062531f82957ed2fe");
  assert.equal(c.twfee, "GBWWSOATPLIC72ZBOIM7WJCT7VCAHNWW4QUBZ2H4FORMCCIUM5ZVKSZN");
  assert.notEqual(c.wasmHash, config.TESTNET_PUBLICO.twWasmHash);
});

test("los WASM de mainnet de la app son los de contracts/wasm/mainnet.sha256 y el de TW es el del repo", () => {
  const dir = new URL("../../contracts/wasm/", import.meta.url);
  const sumas = Object.fromEntries(
    readFileSync(new URL("mainnet.sha256", dir), "utf8").trim().split("\n").map((l) => l.split(/\s+/).reverse()),
  );
  const m = config.MAINNET_PUBLICO;
  assert.equal(sumas["pp_guardian.wasm"], m.guardianWasmHash);
  assert.equal(sumas["pp_arbiter.wasm"], m.arbiterWasmHash);
  assert.equal(sumas["escrow-mainnet.wasm"], m.twWasmHash);
  assert.equal(createHash("sha256").update(readFileSync(new URL("escrow-mainnet.wasm", dir))).digest("hex"), m.twWasmHash);
});

test("topes: USD 10 y 20 cuentas por defecto; un valor inválido no abre el tope", () => {
  assert.deepEqual(config.topesMainnet({}), { maxUsd: 10, maxCuentas: 20 });
  assert.deepEqual(config.topesMainnet({ MAINNET_MAX_USD: "5", MAINNET_MAX_CUENTAS: "4" }), { maxUsd: 5, maxCuentas: 4 });
  for (const v of ["", " ", "0", "-1", "abc", "Infinity", "NaN"]) assert.equal(config.topesMainnet({ MAINNET_MAX_USD: v }).maxUsd, 10);
});

test("si el servidor corre con otra red que la del build, no arranca", () => {
  process.env.STELLAR_NETWORK = "mainnet";
  try {
    assert.throws(() => config.cfg(), /se construyó para testnet/);
  } finally {
    delete process.env.STELLAR_NETWORK;
  }
});
