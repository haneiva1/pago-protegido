import { Keypair, Networks } from "@stellar/stellar-sdk";

// SOLO TESTNET: la red está fija y no se puede cambiar por configuración.
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const RPC_URL = "https://soroban-testnet.stellar.org";
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const FRIENDBOT_URL = "https://friendbot.stellar.org";

export type Mode = "direct" | "guardian";

/** IDs v2 en testnet (pago-protegido/contracts/deployments/testnet.json, `version: "v2"`). */
export const DEPLOYED = {
  guardian: "CDKYF7OAJTACP4JNJSGGXDRA3DHE442R26CT5ZE5DJHNSHH7XJUOATOT",
  arbiter: "CDTEA424AWSIIHEQ4FIQHFQOTWS3XAVLQHX7FI3MU6JZP4OPMTEVU5UA",
};

/**
 * v1 está retirado para compras nuevas (contracts/DEPLOYED.md): su `fund` no tiene plazo de despacho ni
 * `mark_shipped`/`extend`. Si una `.env.local` vieja todavía apunta a v1, se ignora y se usa v2.
 * Sus eventos se siguen leyendo en /transparencia (historial).
 */
export const RETIRED_V1 = {
  guardian: "CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU",
  arbiter: "CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU",
};

/**
 * Valores públicos de testnet (contracts/DEPLOYED.md) para las reglas del indexador (H-9, docs/METRICAS.md).
 * No dependen de .env.local: cualquiera puede repetir la verificación con estos mismos valores.
 */
export const TESTNET_PUBLICO = {
  /** sha256 del WASM del escrow single-release de Trustless Work (commit f0b706e). */
  twWasmHash: "1b367bc8476cf80b89f6396e2aa07b602b78361dd829b5ce9b64ada365196660",
  labusdSac: "CC65P6TQQ646YDXVS3PM6YVZASXW6WM5B67YKI46JH4EG65LJPOGBD4S",
  /** Cuenta `plataforma` (2% de cada escrow). */
  plataforma: "GDDJTZ7LNW33A46DYIYWQY5YDBZPPHLIAQHOAHTIM5ZIQALDVVTCPKDZ",
};

function contractId(envName: string, retired: string, v2: string): string {
  const v = process.env[envName];
  if (!v) return v2;
  if (v === retired) {
    console.warn(`[config] ${envName} apunta a v1 (retirado para compras nuevas): se usa v2 ${v2}`);
    return v2;
  }
  return v;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env.local (corre \`npm run setup\`)`);
  return v;
}

export interface Config {
  mode: Mode;
  plataforma: Keypair;
  arbitro: Keypair;
  lab: Keypair;
  twfee: string;
  labusdCode: string;
  labusdSac: string;
  wasmHash: string;
  platformFeeBps: number;
  fx: number;
  arbitroPanelKey: string;
  guardianId: string | null;
  arbiterId: string | null;
  /** Días extra sobre los días de entrega para la ventana de revisión (contada desde el envío). */
  extraWindowDays: number;
}

let cached: Config | null = null;

const once = <T>(f: () => T) => {
  let v: T | undefined;
  return () => (v ??= f());
};

export function cfg(): Config {
  if (cached) return cached;
  // Modo guardián por defecto (contratos de pago-protegido/contracts/deployments/testnet.json).
  const mode: Mode = process.env.PP_MODE === "direct" ? "direct" : "guardian";
  // Las claves y los IDs del servidor se leen al usarlos: las páginas públicas de solo lectura (/metricas, /tienda,
  // la vista del pedido) no las necesitan. Si falta una, el error es el mismo de siempre, en la primera firma.
  const plataforma = once(() => Keypair.fromSecret(req("PLATAFORMA_SECRET")));
  const arbitro = once(() => Keypair.fromSecret(req("ARBITRO_SECRET")));
  const lab = once(() => Keypair.fromSecret(req("LAB_SECRET")));
  const c: Config = {
    mode,
    get plataforma() {
      return plataforma();
    },
    get arbitro() {
      return arbitro();
    },
    get lab() {
      return lab();
    },
    get twfee() {
      return req("TWFEE_ADDRESS");
    },
    labusdCode: process.env.LABUSD_CODE || "LABUSD",
    get labusdSac() {
      return req("LABUSD_SAC");
    },
    get wasmHash() {
      return req("ESCROW_WASM_HASH");
    },
    platformFeeBps: Number(process.env.PLATFORM_FEE_BPS || 200),
    fx: Number(process.env.FX_BS_PER_USD || 11.7),
    arbitroPanelKey: process.env.ARBITRO_PANEL_KEY || "",
    guardianId: contractId("PP_GUARDIAN_ID", RETIRED_V1.guardian, DEPLOYED.guardian),
    arbiterId: contractId("PP_ARBITER_ID", RETIRED_V1.arbiter, DEPLOYED.arbiter),
    extraWindowDays: 3,
  };
  if (mode === "guardian" && (!c.guardianId || !c.arbiterId)) {
    throw new Error("PP_MODE=guardian necesita PP_GUARDIAN_ID y PP_ARBITER_ID en .env.local");
  }
  cached = c;
  return c;
}
