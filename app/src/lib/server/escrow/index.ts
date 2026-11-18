import { cfg } from "../config";
import { DirectEscrowService } from "./direct";
import { GuardianEscrowService } from "./guardian";
import type { EscrowService } from "./types";

let svc: EscrowService | null = null;

/** Elige la implementación con PP_MODE=direct|guardian. */
export function escrowService(): EscrowService {
  if (svc) return svc;
  svc = cfg().mode === "guardian" ? new GuardianEscrowService() : new DirectEscrowService();
  return svc;
}

export type * from "./types";
