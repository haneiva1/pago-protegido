// lib/server/escrow sin red: un escrow de mentira por pedido y transacciones armadas de verdad (sin enviarlas).
import { Account, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

export const escrows = [];

/**
 * Lo que "dice la red" de cada escrow en los tests: `compras` es lo que devolvería pp_guardian.purchase (escrowId →
 * compra registrada) y, con `caida`, la consulta falla como cuando el RPC no responde.
 */
export const cadena = { compras: new Map(), estados: new Map(), caida: false, consultas: 0 };

const fake = {
  mode: "guardian",
  roles: (buyer, seller) => ({ approver: buyer, service_provider: seller }),
  async createEscrow(props) {
    escrows.push(props);
    return { escrowId: `CESCROW${escrows.length}`, hash: `escrow-${escrows.length}` };
  },
  async verify() {
    return { ok: true, checks: [] };
  },
  async prepareStep(action, step, ctx, signer) {
    return new TransactionBuilder(new Account(signer, String(escrows.length * 10 + 1)), { fee: "100", networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.manageData({ name: `${action}:${step}`, value: ctx.escrowId }))
      .setTimeout(300)
      .build();
  },
  steps: (action) => (action === "confirm" ? ["approve", "release"] : [action]),
  async readState(escrowId) {
    return cadena.estados.get(escrowId) ?? null;
  },
  async purchase(escrowId) {
    cadena.consultas++;
    if (cadena.caida) throw new Error("La red tardó demasiado");
    return cadena.compras.get(escrowId) ?? null;
  },
};

export function escrowService() {
  return fake;
}
