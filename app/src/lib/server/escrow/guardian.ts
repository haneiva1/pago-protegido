import { scValToNative } from "@stellar/stellar-sdk";
import { cfg } from "../config";
import { ChainError, addr, invokeAs, prepareInvoke, remapError, simulate } from "../stellar";
import {
  contractSpec,
  createEscrowTx,
  distributionsScVal,
  propsToNative,
  prepareShip,
  readEscrowState,
  tokenBalance,
  verifyEscrowInstance,
} from "./tw";
import type { EscrowCtx, EscrowProps, EscrowService, ProbeResult, Quote, Roles, UserAction } from "./types";

/**
 * Modo guardián (por defecto). Contratos de pago-protegido/contracts (deployments/testnet.json):
 *   pp_guardian.fund(escrow, buyer, expected_escrow, amount, window_secs) -> Purchase
 *   pp_guardian.confirm(escrow, buyer)         -> approve_milestone + release_funds en la misma invocación
 *   pp_guardian.dispute(escrow, caller)
 *   pp_guardian.auto_release(escrow)           -> sin auth, pasado el plazo y con el hito en "enviado"
 *   pp_guardian.purchase(escrow) -> Option<Purchase>
 *   pp_arbiter.quote(escrow, buyer_bps) -> Split  (solo lectura: vista previa del slider)
 *   pp_arbiter.resolve(escrow, buyer_bps) -> Split (firmado por el admin del árbitro)
 * Los argumentos se convierten con el Spec leído de la red (equivale a los bindings de contracts/bindings).
 */
const ARGS = {
  fund: (ctx: EscrowCtx, buyer: string) => ({
    escrow: ctx.escrowId,
    buyer,
    expected_escrow: propsToNative(ctx.props),
    amount: BigInt(ctx.props.amount),
    window_secs: BigInt(ctx.windowSecs),
  }),
  confirm: (ctx: EscrowCtx, buyer: string) => ({ escrow: ctx.escrowId, buyer }),
  dispute: (ctx: EscrowCtx, caller: string) => ({ escrow: ctx.escrowId, caller }),
  escrow: (escrowId: string) => ({ escrow: escrowId }),
  bps: (ctx: EscrowCtx, buyerBps: number) => ({ escrow: ctx.escrowId, buyer_bps: buyerBps }),
};

// Errores propios (DECISIONES.md de contracts, sección ⚠ INTERFAZ).
const GUARDIAN_ERRORS: Record<number, string> = {
  4: "El plazo de liberación está fuera del rango permitido",
  5: "Este pedido ya fue pagado",
  7: "Solo el comprador de este pedido puede hacerlo",
  8: "Solo el comprador o el vendedor pueden abrir un reclamo",
  9: "El contrato del pedido no tiene los roles del modo guardián",
  10: "El contrato del pedido no tiene los roles del modo guardián",
  11: "El contrato del pedido no tiene los roles del modo guardián",
  16: "El contrato no coincide con el que viste",
  19: "Todavía no venció el plazo de liberación automática",
  20: "Hay un reclamo abierto: decide el árbitro",
  21: "El pago ya fue liberado",
  22: "El reclamo ya fue resuelto",
  23: "El vendedor todavía no marcó el envío",
};
const ARBITER_ERRORS: Record<number, string> = {
  1: "El porcentaje no es válido",
  2: "El pago no está en disputa",
  5: "El contrato no tiene saldo",
  7: "Todavía no venció el plazo",
  8: "El vendedor ya marcó el envío",
};

export class GuardianEscrowService implements EscrowService {
  readonly mode = "guardian" as const;

  private get guardian(): string {
    return cfg().guardianId!;
  }
  private get arbiter(): string {
    return cfg().arbiterId!;
  }

  roles(_buyer: string, seller: string): Roles {
    return {
      approver: this.guardian,
      service_provider: seller,
      platform: cfg().plataforma.publicKey(),
      release_signer: this.guardian,
      dispute_resolver: this.arbiter,
      receiver: seller,
    };
  }

  createEscrow(props: EscrowProps) {
    return createEscrowTx(props);
  }

  steps(action: UserAction): string[] {
    return [action];
  }

  private async args(contract: string, fn: string, args: object) {
    const spec = await contractSpec(contract);
    return spec.funcArgsToScVals(fn, args);
  }

  async prepareStep(action: UserAction, step: string, ctx: EscrowCtx, signer: string, params: { evidence?: string }) {
    const g = this.guardian;
    try {
      switch (step) {
        case "fund":
          return await prepareInvoke(signer, g, "fund", await this.args(g, "fund", ARGS.fund(ctx, signer)));
        case "ship":
          return await prepareShip(ctx.escrowId, signer, params.evidence ?? "");
        case "confirm":
          return await prepareInvoke(signer, g, "confirm", await this.args(g, "confirm", ARGS.confirm(ctx, signer)));
        case "dispute":
          return await prepareInvoke(signer, g, "dispute", await this.args(g, "dispute", ARGS.dispute(ctx, signer)));
        default:
          throw new ChainError(`Paso desconocido: ${action}/${step}`);
      }
    } catch (e) {
      return step === "ship" ? Promise.reject(e) : remapError(e, GUARDIAN_ERRORS, "pp_guardian");
    }
  }

  async resolve(ctx: EscrowCtx, buyerBps: number) {
    try {
      const sent = await invokeAs(cfg().arbitro, this.arbiter, "resolve", await this.args(this.arbiter, "resolve", ARGS.bps(ctx, buyerBps)));
      return { hash: sent.hash };
    } catch (e) {
      return remapError(e, ARBITER_ERRORS, "pp_arbiter");
    }
  }

  async quote(ctx: EscrowCtx, buyerBps: number): Promise<Quote> {
    try {
      const v = await simulate(this.arbiter, "quote", await this.args(this.arbiter, "quote", ARGS.bps(ctx, buyerBps)));
      const s = scValToNative(v) as { balance: bigint; buyer_amount: bigint; seller_amount: bigint };
      return { balance: String(s.balance), buyer_amount: String(s.buyer_amount), seller_amount: String(s.seller_amount), source: "pp_arbiter.quote" };
    } catch (e) {
      return remapError(e, ARBITER_ERRORS, "pp_arbiter");
    }
  }

  async purchase(escrowId: string) {
    const v = await simulate(this.guardian, "purchase", await this.args(this.guardian, "purchase", ARGS.escrow(escrowId)));
    const p = scValToNative(v) as { funded_at: bigint; deadline: bigint } | null | undefined;
    return p ? { fundedAt: Number(p.funded_at) * 1000, deadline: Number(p.deadline) * 1000 } : null;
  }

  /**
   * Demo "intento de desvío": la llave `arbitro` llama directo a escrow.resolve_dispute mandando todo el
   * saldo a una tercera cuenta. Se SIMULA (no se envía nada) y se muestra el rechazo del contrato.
   */
  async probeForeignDestination(ctx: EscrowCtx, foreign: string): Promise<ProbeResult> {
    const spec = await contractSpec(this.arbiter);
    const withDest = spec
      .funcs()
      .filter((f) => f.inputs.some((i) => /dest|recipient|distribution|^to$/i.test(i.name.toString())))
      .map((f) => f.name.toString());
    const balance = await tokenBalance(ctx.escrowId);
    const a = cfg().arbitro;
    const call = `escrow.resolve_dispute(dispute_resolver = cuenta árbitro, distribuciones = { tercera cuenta: 100% })`;
    try {
      await simulate(ctx.escrowId, "resolve_dispute", [addr(a.publicKey()), addr(cfg().twfee), distributionsScVal([{ address: foreign, amount: balance }])]);
      return { rejected: false, by: "contrato", call, detail: "La simulación no falló: revisar roles del escrow." };
    } catch (e) {
      const err = e as ChainError;
      const extra = withDest.length
        ? ` Atención: pp_arbiter expone funciones con destinos: ${withDest.join(", ")}.`
        : " Y pp_arbiter, el único árbitro del contrato, no tiene ninguna función que reciba una cuenta de destino.";
      return {
        rejected: true,
        by: "contrato",
        call,
        code: err.code,
        raw: err.raw,
        detail: `El escrow solo acepta repartos de pp_arbiter: ${err.message}.${extra}`,
      };
    }
  }

  async autoRelease(ctx: EscrowCtx) {
    try {
      const args = await this.args(this.guardian, "auto_release", ARGS.escrow(ctx.escrowId));
      const sent = await invokeAs(cfg().plataforma, this.guardian, "auto_release", args);
      return { hash: sent.hash };
    } catch (e) {
      return remapError(e, GUARDIAN_ERRORS, "pp_guardian");
    }
  }

  readState(escrowId: string) {
    return readEscrowState(escrowId);
  }

  verify(ctx: EscrowCtx) {
    return verifyEscrowInstance(ctx.escrowId, this.roles(ctx.buyer, ctx.seller), { approver: "pp_guardian", resolver: "pp_arbiter" });
  }

  contracts() {
    const c = cfg();
    return [
      { label: "pp_guardian (confirma y libera en una sola operación)", id: this.guardian, kind: "contract" as const },
      { label: "pp_arbiter (solo reparte entre comprador y vendedor)", id: this.arbiter, kind: "contract" as const },
      { label: "Moneda de prueba (USD de prueba, LABUSD)", id: c.labusdSac, kind: "contract" as const },
      { label: "Plataforma (patrocina comisiones)", id: c.plataforma.publicKey(), kind: "account" as const },
    ];
  }
}
