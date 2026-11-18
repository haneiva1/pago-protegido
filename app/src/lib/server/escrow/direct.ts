import { cfg } from "../config";
import { ChainError, addr, invokeAs, prepareInvoke, simulate, u32 } from "../stellar";
import {
  createEscrowTx,
  distributionsScVal,
  escrowScVal,
  prepareShip,
  readEscrowState,
  tokenBalance,
} from "./tw";
import { i128 } from "../stellar";
import { splitPreview } from "@/lib/format";
import { verifyEscrowInstance } from "./tw";
import type { EscrowCtx, EscrowProps, EscrowService, ProbeResult, Quote, Roles, UserAction } from "./types";

/**
 * Modo directo (temporal, hasta que existan pp_guardian y pp_arbiter):
 * approver = release_signer = comprador; dispute_resolver = cuenta `arbitro`.
 */
export class DirectEscrowService implements EscrowService {
  readonly mode = "direct" as const;

  roles(buyer: string, seller: string): Roles {
    const c = cfg();
    return {
      approver: buyer,
      service_provider: seller,
      platform: c.plataforma.publicKey(),
      release_signer: buyer,
      dispute_resolver: c.arbitro.publicKey(),
      receiver: seller,
    };
  }

  createEscrow(props: EscrowProps) {
    return createEscrowTx(props);
  }

  steps(action: UserAction): string[] {
    // Confirmar son dos transacciones: aprobar el hito y liberar. En modo guardián es una sola.
    return action === "confirm" ? ["approve", "release"] : [action];
  }

  async prepareStep(action: UserAction, step: string, ctx: EscrowCtx, signer: string, params: { evidence?: string }) {
    switch (step) {
      case "fund":
        return prepareInvoke(signer, ctx.escrowId, "fund_escrow", [
          addr(signer),
          await escrowScVal(ctx.props),
          i128(BigInt(ctx.props.amount)),
        ]);
      case "ship":
        return prepareShip(ctx.escrowId, signer, params.evidence ?? "");
      case "approve":
        return prepareInvoke(signer, ctx.escrowId, "approve_milestone", [u32(0), addr(signer)]);
      case "release":
        return prepareInvoke(signer, ctx.escrowId, "release_funds", [addr(signer), addr(cfg().twfee)]);
      case "dispute":
        return prepareInvoke(signer, ctx.escrowId, "dispute_escrow", [addr(signer)]);
      default:
        throw new ChainError(`Paso desconocido: ${action}/${step}`);
    }
  }

  async resolve(ctx: EscrowCtx, buyerBps: number) {
    // El servidor solo arma repartos entre comprador y vendedor, sobre el saldo real del contrato.
    const balance = await tokenBalance(ctx.escrowId);
    const buyerAmount = balance - (balance * BigInt(10000 - buyerBps)) / 10000n;
    const dist = distributionsScVal([
      { address: ctx.buyer, amount: buyerAmount },
      { address: ctx.seller, amount: balance - buyerAmount },
    ]);
    const a = cfg().arbitro;
    const sent = await invokeAs(a, ctx.escrowId, "resolve_dispute", [addr(a.publicKey()), addr(cfg().twfee), dist]);
    return { hash: sent.hash };
  }

  async probeForeignDestination(ctx: EscrowCtx, foreign: string): Promise<ProbeResult> {
    const balance = await tokenBalance(ctx.escrowId);
    const a = cfg().arbitro;
    try {
      await simulate(ctx.escrowId, "resolve_dispute", [
        addr(a.publicKey()),
        addr(cfg().twfee),
        distributionsScVal([{ address: foreign, amount: balance }]),
      ]);
      return {
        rejected: true,
        by: "servidor",
        detail:
          "Modo directo (temporal): el servidor no tiene ninguna función para elegir otra cuenta y rechaza el intento. " +
          "El escrow de Trustless Work por sí solo lo aceptaría; con PP_MODE=guardian lo rechaza el contrato pp_arbiter.",
      };
    } catch (e) {
      return { rejected: true, by: "contrato", detail: (e as Error).message };
    }
  }

  async autoRelease(): Promise<{ hash: string }> {
    throw new ChainError("La liberación automática por plazo solo existe en modo guardián (contrato pp_guardian)");
  }

  readState(escrowId: string) {
    return readEscrowState(escrowId);
  }

  verify(ctx: EscrowCtx) {
    return verifyEscrowInstance(ctx.escrowId, this.roles(ctx.buyer, ctx.seller), { approver: "el comprador", resolver: "la cuenta del revisor" });
  }

  async quote(ctx: EscrowCtx, buyerBps: number): Promise<Quote> {
    const balance = await tokenBalance(ctx.escrowId);
    const s = splitPreview(balance, buyerBps, cfg().platformFeeBps);
    return { balance: balance.toString(), buyer_amount: s.buyer.gross.toString(), seller_amount: s.seller.gross.toString(), source: "servidor" };
  }

  async purchase() {
    return null;
  }

  contracts() {
    const c = cfg();
    return [
      { label: "Moneda de prueba (USD de prueba, LABUSD)", id: c.labusdSac, kind: "contract" as const },
      { label: "Revisor (cuenta, modo directo)", id: c.arbitro.publicKey(), kind: "account" as const },
      { label: "Plataforma (patrocina comisiones)", id: c.plataforma.publicKey(), kind: "account" as const },
    ];
  }
}
