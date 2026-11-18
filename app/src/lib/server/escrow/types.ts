import type { Transaction } from "@stellar/stellar-sdk";
import type { Mode } from "../config";

/** Propiedades del escrow single-release de Trustless Work (struct `Escrow`), con amount como string. */
export interface EscrowProps {
  engagement_id: string;
  title: string;
  roles: Roles;
  description: string;
  amount: string;
  platform_fee: number;
  milestones: { description: string; status: string; evidence: string; approved: boolean }[];
  flags: { disputed: boolean; released: boolean; resolved: boolean };
  trustline: { address: string };
  receiver_memo: number;
}

export interface Roles {
  approver: string;
  service_provider: string;
  platform: string;
  release_signer: string;
  dispute_resolver: string;
  receiver: string;
}

export interface EscrowCtx {
  escrowId: string;
  props: EscrowProps;
  buyer: string;
  seller: string;
  windowSecs: number;
}

export type UserAction = "fund" | "ship" | "confirm" | "dispute";

export interface OnchainState {
  balance: string;
  flags: { disputed: boolean; released: boolean; resolved: boolean };
  milestone: { status: string; evidence: string; approved: boolean } | null;
  roles: Roles | null;
}

export interface ProbeResult {
  rejected: boolean;
  by: "contrato" | "servidor";
  detail: string;
}

/**
 * Todo lo que la app necesita del escrow. Dos implementaciones:
 * - DirectEscrowService (PP_MODE=direct): approver = release_signer = comprador, dispute_resolver = cuenta arbitro.
 * - GuardianEscrowService (PP_MODE=guardian): approver = release_signer = pp_guardian, dispute_resolver = pp_arbiter.
 * Las transacciones de usuario se devuelven armadas y simuladas; las firma el navegador y la plataforma
 * paga la comisión con un fee bump.
 */
export interface EscrowService {
  readonly mode: Mode;
  /** Roles con los que se despliega el escrow de cada compra. */
  roles(buyer: string, seller: string): Roles;
  /** Despliega e inicializa la instancia en UNA transacción (tw_new_single_release_escrow), firmada por la plataforma. */
  createEscrow(props: EscrowProps): Promise<{ escrowId: string; hash: string }>;
  /** Pasos (transacciones) que firma el usuario para cada acción, en orden. */
  steps(action: UserAction): string[];
  /** Arma la transacción de un paso, con `signer` como cuenta de origen. */
  prepareStep(action: UserAction, step: string, ctx: EscrowCtx, signer: string, params: { evidence?: string }): Promise<Transaction>;
  /** Reparto del árbitro: `buyerBps` para el comprador y el resto para el vendedor. Firmado en el servidor. */
  resolve(ctx: EscrowCtx, buyerBps: number): Promise<{ hash: string }>;
  /** Intenta mandar la plata a una tercera cuenta y devuelve quién lo rechaza. No envía nada. */
  probeForeignDestination(ctx: EscrowCtx, foreign: string): Promise<ProbeResult>;
  /** Liberación por plazo vencido (solo modo guardián). */
  autoRelease(ctx: EscrowCtx): Promise<{ hash: string }>;
  readState(escrowId: string): Promise<OnchainState>;
  /** Contratos a mostrar en /como-funciona. */
  contracts(): { label: string; id: string; kind: "contract" | "account" }[];
}
