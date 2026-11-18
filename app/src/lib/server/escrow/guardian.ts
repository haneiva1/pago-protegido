import { scValToNative } from "@stellar/stellar-sdk";
import { cfg } from "../config";
import { ChainError, addr, invokeAs, prepareInvoke, remapError, simulate } from "../stellar";
import {
  contractSpec,
  createEscrowTx,
  distributionsScVal,
  propsToNative,
  readEscrowState,
  tokenBalance,
  verifyEscrowInstance,
} from "./tw";
import type { EscrowCtx, EscrowProps, EscrowService, ProbeResult, PurchaseInfo, Quote, Roles, UserAction } from "./types";

/**
 * Modo guardián (por defecto) con los contratos v2 de pago-protegido/contracts (deployments/testnet.json,
 * interfaz en contracts/DECISIONES.md §"INTERFAZ v2"):
 *   pp_guardian.fund(escrow, buyer, expected_escrow, amount, ship_secs, inspect_secs) -> Purchase
 *   pp_guardian.mark_shipped(escrow, seller, evidence) -> Purchase   (una vez, antes de ship_deadline; fija release_at)
 *   pp_guardian.confirm(escrow, buyer)          -> exige envío; aprueba todos los hitos y libera
 *   pp_guardian.extend(escrow, buyer) -> Purchase (una vez, antes de release_at y sin disputa: suma inspect_secs)
 *   pp_guardian.dispute(escrow, caller)
 *   pp_guardian.auto_release(escrow)            -> sin auth; envío registrado, now ≥ release_at y sin disputa
 *   pp_guardian.purchase(escrow) -> Option<Purchase>
 *   pp_arbiter.quote(escrow, buyer_bps) -> Split  (solo lectura: vista previa del slider)
 *   pp_arbiter.resolve(escrow, buyer_bps) -> Split (firmado por el admin del revisor)
 *   pp_arbiter.refund_unshipped(escrow) -> Split  (sin auth; con disputa, sin envío y vencido el despacho)
 * Los argumentos se convierten con el Spec leído de la red (equivale a los bindings de contracts/bindings).
 */
const ARGS = {
  fund: (ctx: EscrowCtx, buyer: string) => ({
    escrow: ctx.escrowId,
    buyer,
    expected_escrow: propsToNative(ctx.props),
    amount: BigInt(ctx.props.amount),
    ship_secs: BigInt(ctx.shipSecs),
    inspect_secs: BigInt(ctx.inspectSecs),
  }),
  markShipped: (ctx: EscrowCtx, seller: string, evidence: string) => ({ escrow: ctx.escrowId, seller, evidence }),
  extend: (ctx: EscrowCtx, buyer: string) => ({ escrow: ctx.escrowId, buyer }),
  confirm: (ctx: EscrowCtx, buyer: string) => ({ escrow: ctx.escrowId, buyer }),
  dispute: (ctx: EscrowCtx, caller: string) => ({ escrow: ctx.escrowId, caller }),
  escrow: (escrowId: string) => ({ escrow: escrowId }),
  bps: (ctx: EscrowCtx, buyerBps: number) => ({ escrow: ctx.escrowId, buyer_bps: buyerBps }),
};

// Errores propios (DECISIONES.md de contracts, secciones ⚠ INTERFAZ y ⚠ INTERFAZ v2).
const GUARDIAN_ERRORS: Record<number, string> = {
  4: "El plazo de despacho está fuera del rango permitido",
  5: "Este pedido ya fue pagado",
  7: "Solo el comprador de este pedido puede hacerlo",
  8: "Solo el comprador o el vendedor pueden abrir un reclamo",
  9: "El contrato del pedido no tiene los roles del modo guardián",
  10: "El contrato del pedido no tiene los roles del modo guardián",
  11: "El contrato del pedido no tiene los roles del modo guardián",
  16: "El contrato no coincide con el que viste",
  19: "Todavía no venció el plazo de liberación automática",
  20: "Hay un reclamo abierto: decide el revisor",
  21: "El pago ya fue liberado",
  22: "El reclamo ya fue resuelto",
  23: "El vendedor todavía no marcó el envío",
  24: "Solo el vendedor de este pedido puede registrar el envío",
  25: "El envío ya estaba registrado",
  26: "Venció el plazo de despacho: ya no se puede registrar el envío",
  27: "Ya pediste más tiempo una vez",
  28: "La revisión ya terminó",
  29: "El pedido tiene un paso sin estado: decide el revisor",
  30: "La ventana de revisión está fuera del rango permitido",
  31: "La evidencia del envío no es válida (1 a 256 caracteres)",
};
const ARBITER_ERRORS: Record<number, string> = {
  1: "El porcentaje no es válido",
  2: "El pago no está en disputa",
  5: "El contrato no tiene saldo",
  7: "Todavía no venció el plazo de despacho",
  8: "El vendedor ya marcó el envío",
};

/** Evidencia on-chain: entre 1 y 256 bytes (MAX_EVIDENCE_LEN de pp_guardian v2). */
function clampEvidence(e: string): string {
  let out = e.trim() || "enviado";
  while (Buffer.byteLength(out, "utf8") > 256) out = out.slice(0, -1);
  return out;
}

const ms = (v: bigint | number | null | undefined) => (v == null ? null : Number(v) * 1000);

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
          // v2: el envío se registra en pp_guardian (evidencia inmutable, D-17) y fija release_at.
          return await prepareInvoke(signer, g, "mark_shipped", await this.args(g, "mark_shipped", ARGS.markShipped(ctx, signer, clampEvidence(params.evidence ?? ""))));
        case "extend":
          return await prepareInvoke(signer, g, "extend", await this.args(g, "extend", ARGS.extend(ctx, signer)));
        case "confirm":
          return await prepareInvoke(signer, g, "confirm", await this.args(g, "confirm", ARGS.confirm(ctx, signer)));
        case "dispute":
          return await prepareInvoke(signer, g, "dispute", await this.args(g, "dispute", ARGS.dispute(ctx, signer)));
        default:
          throw new ChainError(`Paso desconocido: ${action}/${step}`);
      }
    } catch (e) {
      return remapError(e, GUARDIAN_ERRORS, "pp_guardian");
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

  async purchase(escrowId: string): Promise<PurchaseInfo | null> {
    const v = await simulate(this.guardian, "purchase", await this.args(this.guardian, "purchase", ARGS.escrow(escrowId)));
    const p = scValToNative(v) as
      | { funded_at: bigint; ship_deadline: bigint; shipped_at?: bigint | null; release_at?: bigint | null; extended: boolean; evidence?: string | null }
      | null
      | undefined;
    if (!p) return null;
    return {
      fundedAt: ms(p.funded_at)!,
      shipDeadline: ms(p.ship_deadline)!,
      shippedAt: ms(p.shipped_at),
      releaseAt: ms(p.release_at),
      extended: Boolean(p.extended),
      evidence: p.evidence ?? null,
    };
  }

  async refundUnshipped(ctx: EscrowCtx) {
    const p = await this.purchase(ctx.escrowId);
    if (!p) throw new ChainError("El contrato no tiene registrada esta compra");
    if (p.shippedAt) throw new ChainError("El vendedor ya registró el envío");
    const st = await readEscrowState(ctx.escrowId);
    let disputeHash: string | null = null;
    if (!st.flags.disputed) {
      // TW-1/H-6: la plataforma tiene rol `platform` en el escrow y puede abrir la disputa directo.
      // Solo congela los fondos: el reparto lo hace pp_arbiter, que paga al comprador o al vendedor.
      const plat = cfg().plataforma;
      try {
        disputeHash = (await invokeAs(plat, ctx.escrowId, "dispute_escrow", [addr(plat.publicKey())])).hash;
      } catch (e) {
        return remapError(e, {}, "escrow");
      }
    }
    try {
      const args = await this.args(this.arbiter, "refund_unshipped", ARGS.escrow(ctx.escrowId));
      const sent = await invokeAs(cfg().plataforma, this.arbiter, "refund_unshipped", args);
      return { disputeHash, hash: sent.hash };
    } catch (e) {
      return remapError(e, ARBITER_ERRORS, "pp_arbiter");
    }
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
    const call = `escrow.resolve_dispute(dispute_resolver = cuenta del revisor, distribuciones = { tercera cuenta: todo el saldo })`;
    try {
      await simulate(ctx.escrowId, "resolve_dispute", [addr(a.publicKey()), addr(cfg().twfee), distributionsScVal([{ address: foreign, amount: balance }])]);
      return { rejected: false, by: "contrato", call, detail: "La simulación no falló: revisar roles del escrow." };
    } catch (e) {
      const err = e as ChainError;
      const extra = withDest.length
        ? ` Atención: pp_arbiter expone funciones con destinos: ${withDest.join(", ")}.`
        : " Y pp_arbiter, el único revisor del contrato, no tiene ninguna función que reciba una cuenta de destino.";
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
      { label: "pp_guardian v2 (plazos de despacho y revisión, envío, confirmación y liberación)", id: this.guardian, kind: "contract" as const },
      { label: "pp_arbiter v2 (solo reparte entre comprador y vendedor; devuelve si no se despachó)", id: this.arbiter, kind: "contract" as const },
      { label: "Moneda de prueba (USD de prueba, LABUSD)", id: c.labusdSac, kind: "contract" as const },
      { label: "Plataforma (patrocina comisiones)", id: c.plataforma.publicKey(), kind: "account" as const },
    ];
  }
}
