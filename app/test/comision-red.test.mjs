// Comisión del fee bump bajo congestión: si la red rechaza el registro con `txInsufficientFee`, la plataforma lo reenvía
// en silencio con una comisión mayor (hasta 3 veces); un `txTooLate` de sus propias invocaciones se rearma y reenvía.
// Sin red ni llaves reales: RPC falso y llaves al azar.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Account, Asset, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const plataforma = Keypair.random();
process.env.PLATAFORMA_SECRET = plataforma.secret();
const { ChainError, COMISION_RED, feeBumpAndSend, reintentarRechazo } = await import("../src/lib/server/stellar.ts");
const { NETWORK_PASSPHRASE } = await import("../src/lib/server/config.ts");

/** RPC falso: rechaza con `rechazos` (en orden) y después acepta y confirma. Anota cada transacción enviada. */
function rpcQueRechaza(rechazos) {
  const enviadas = [];
  return {
    enviadas,
    async sendTransaction(tx) {
      enviadas.push(tx);
      const code = rechazos[enviadas.length - 1];
      if (code) return { status: "ERROR", hash: "x", errorResult: { result: { type: code } } };
      return { status: "PENDING", hash: "x" };
    },
    async getTransaction() {
      return { status: "SUCCESS", returnValue: undefined };
    },
  };
}

function interna() {
  const usuario = Keypair.random();
  const tx = new TransactionBuilder(new Account(usuario.publicKey(), "1"), { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset: new Asset("LABUSD", Keypair.random().publicKey()) }))
    .setTimeout(300)
    .build();
  tx.sign(usuario);
  return tx;
}

test("fee bump: dos txInsufficientFee y pasa al tercero, con comisión creciente y la misma transacción adentro", async () => {
  const rpc = rpcQueRechaza(["txInsufficientFee", "txInsufficientFee"]);
  globalThis.__ppRpc = rpc;
  const inner = interna();
  const sent = await feeBumpAndSend(inner);
  delete globalThis.__ppRpc;

  assert.equal(rpc.enviadas.length, 3);
  assert.equal(sent.hash, Buffer.from(rpc.enviadas[2].hash()).toString("hex"));
  const fees = rpc.enviadas.map((fb) => Number(fb.fee));
  assert.deepEqual(fees, [1, 2, 4].map((k) => COMISION_RED * k * 2), "comisión holgada y el doble en cada reintento");
  for (const fb of rpc.enviadas) {
    assert.equal(fb.feeSource, plataforma.publicKey(), "la comisión la paga la plataforma");
    assert.equal(Buffer.from(fb.innerTransaction.hash()).toString("hex"), Buffer.from(inner.hash()).toString("hex"));
  }
});

test("fee bump: se rinde tras 3 reintentos y no reintenta otros rechazos", async () => {
  let rpc = rpcQueRechaza(Array(5).fill("txInsufficientFee"));
  globalThis.__ppRpc = rpc;
  await assert.rejects(feeBumpAndSend(interna()), (e) => e instanceof ChainError && e.rechazo === "txInsufficientFee");
  assert.equal(rpc.enviadas.length, 4, "1 envío + 3 reintentos");

  rpc = rpcQueRechaza(["txBadSeq"]);
  globalThis.__ppRpc = rpc;
  await assert.rejects(feeBumpAndSend(interna()), /txBadSeq/);
  assert.equal(rpc.enviadas.length, 1);
  delete globalThis.__ppRpc;
});

test("reintentarRechazo: txTooLate se rearma con espera creciente; errores de contrato salen al primero", async () => {
  const rechazo = (code) => Object.assign(new ChainError(`La red rechazó la transacción (${code})`), { rechazo: code });
  const intentos = [];
  const t0 = Date.now();
  const r = await reintentarRechazo(async (i) => {
    intentos.push(Date.now() - t0);
    if (i < 2) throw rechazo("txTooLate");
    return "ok";
  }, undefined, 20);
  assert.equal(r, "ok");
  assert.equal(intentos.length, 3);
  assert.ok(intentos[2] - intentos[1] > intentos[1] - intentos[0], "la espera crece");

  let n = 0;
  await assert.rejects(
    reintentarRechazo(async () => {
      n++;
      throw new ChainError("El contrato rechazó la operación (código #1)", 1);
    }, undefined, 1),
    /código #1/,
  );
  assert.equal(n, 1);
});
