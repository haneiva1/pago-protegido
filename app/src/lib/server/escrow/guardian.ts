import { cfg } from "../config";
import { ChainError, addr, invokeAs, prepareInvoke, simulate } from "../stellar";
import {
  contractSpec,
  createEscrowTx,
  distributionsScVal,
  propsToNative,
  prepareShip,
  readEscrowState,
  tokenBalance,
} from "./tw";
import type { EscrowCtx, EscrowProps, EscrowService, ProbeResult, Roles, UserAction } from "./types";

/**
 * Modo guardián (PP_MODE=guardian). Interfaz de SPEC.md §3:
 *   pp_guardian.fund(escrow, buyer, expected_escrow, amount, window_secs)
 *   pp_guardian.confirm(escrow, buyer)         -> approve_milestone + release_funds en la misma invocación
 *   pp_guardian.dispute(escrow, caller)
 *   pp_guardian.auto_release(escrow)
 *   pp_arbiter.resolve(escrow, buyer_bps)      -> firmado por el admin del árbitro
 * Los argumentos se convierten con el Spec que se lee de la red (equivale a los bindings de
 * pago-protegido/contracts/bindings). Si los nombres reales cambian, se ajustan en ARGS.
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
  auto_release: (ctx: EscrowCtx) => ({ escrow: ctx.escrowId }),
  resolve: (ctx: EscrowCtx, buyerBps: number) => ({ escrow: ctx.escrowId, buyer_bps: buyerBps }),
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

  private async guardianArgs(fn: string, args: object) {
    const spec = await contractSpec(this.guardian);
    return spec.funcArgsToScVals(fn, args);
  }

  async prepareStep(action: UserAction, step: string, ctx: EscrowCtx, signer: string, params: { evidence?: string }) {
    switch (step) {
      case "fund":
        return prepareInvoke(signer, this.guardian, "fund", await this.guardianArgs("fund", ARGS.fund(ctx, signer)));
      case "ship":
        return prepareShip(ctx.escrowId, signer, params.evidence ?? "");
      case "confirm":
        return prepareInvoke(signer, this.guardian, "confirm", await this.guardianArgs("confirm", ARGS.confirm(ctx, signer)));
      case "dispute":
        return prepareInvoke(signer, this.guardian, "dispute", await this.guardianArgs("dispute", ARGS.dispute(ctx, signer)));
      default:
        throw new ChainError(`Paso desconocido: ${action}/${step}`);
    }
  }

  async resolve(ctx: EscrowCtx, buyerBps: number) {
    const spec = await contractSpec(this.arbiter);
    const sent = await invokeAs(cfg().arbitro, this.arbiter, "resolve", spec.funcArgsToScVals("resolve", ARGS.resolve(ctx, buyerBps)));
    return { hash: sent.hash };
  }

  async probeForeignDestination(ctx: EscrowCtx, foreign: string): Promise<ProbeResult> {
    // 1) pp_arbiter no tiene ninguna función que reciba destinos: lo verificamos en su Spec.
    const spec = await contractSpec(this.arbiter);
    const withDest = spec
      .funcs()
      .filter((f) => f.inputs.some((i) => /dest|recipient|distribution|^to$/i.test(i.name.toString())))
      .map((f) => f.name.toString());
    // 2) Ir directo al escrow con la llave del árbitro y un destino ajeno: el escrow exige a pp_arbiter.
    const balance = await tokenBalance(ctx.escrowId);
    const a = cfg().arbitro;
    try {
      await simulate(ctx.escrowId, "resolve_dispute", [
        addr(a.publicKey()),
        addr(cfg().twfee),
        distributionsScVal([{ address: foreign, amount: balance }]),
      ]);
      return { rejected: false, by: "contrato", detail: "La simulación no falló: revisar roles del escrow." };
    } catch (e) {
      const extra = withDest.length
        ? ` Atención: pp_arbiter expone funciones con destinos: ${withDest.join(", ")}.`
        : " pp_arbiter no tiene ninguna función que acepte una cuenta de destino.";
      return { rejected: true, by: "contrato", detail: `${(e as Error).message}.${extra}` };
    }
  }

  async autoRelease(ctx: EscrowCtx) {
    const args = await this.guardianArgs("auto_release", ARGS.auto_release(ctx));
    const sent = await invokeAs(cfg().plataforma, this.guardian, "auto_release", args);
    return { hash: sent.hash };
  }

  readState(escrowId: string) {
    return readEscrowState(escrowId);
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
