import { Asset, Keypair, StrKey } from "@stellar/stellar-sdk";
import { PASSPHRASE, RED, leerRed, type Red } from "@/lib/red";

type Entorno = Record<string, string | undefined>;

/**
 * RPC público de mainnet sin clave: getHealth y getNetwork respondieron el 24-nov-2026 (docs/MAINNET.md, con las
 * alternativas para STELLAR_RPC_URL).
 */
export const RPC_MAINNET = "https://rpc.lightsail.network";

/**
 * Direcciones de cada red. testnet (por defecto) está fija: no lee ninguna variable, como siempre. En mainnet se puede
 * cambiar el RPC y Horizon (STELLAR_RPC_URL, STELLAR_HORIZON_URL) por si el público falla, y no hay friendbot.
 */
export function redes(red: Red, env: Entorno = process.env) {
  return red === "mainnet"
    ? {
        passphrase: PASSPHRASE.mainnet,
        rpc: env.STELLAR_RPC_URL || RPC_MAINNET,
        horizon: (env.STELLAR_HORIZON_URL || "https://horizon.stellar.org").replace(/\/+$/, ""),
        friendbot: null,
      }
    : {
        passphrase: PASSPHRASE.testnet,
        rpc: "https://soroban-testnet.stellar.org",
        horizon: "https://horizon-testnet.stellar.org",
        friendbot: "https://friendbot.stellar.org",
      };
}

const URLS = redes(RED);
export const NETWORK_PASSPHRASE = URLS.passphrase;
export const RPC_URL = URLS.rpc;
export const HORIZON_URL = URLS.horizon;
export const FRIENDBOT_URL = URLS.friendbot;

/** USDC de Circle en mainnet. El contrato (SAC) se deriva del emisor: no hay variable que pueda apuntar a otra moneda. */
export const USDC_MAINNET = {
  code: "USDC",
  issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  get sac() {
    return new Asset(this.code, this.issuer).contractId(PASSPHRASE.mainnet);
  },
};

/**
 * Trustless Work en mainnet (contracts/wasm/README.md): el WASM que instancian sus escrows, con la cuenta del 0,3 % fija
 * adentro, y los WASM de pp_guardian y pp_arbiter compilados para él (contracts/wasm/mainnet.sha256). Van juntos: con los
 * de testnet el fondeo entraría, pero la liberación fallaría. Por eso no hay variable para cambiarlos.
 */
export const MAINNET_PUBLICO = {
  twWasmHash: "96d51751f924c938a081deb740056dc1c5cc60c6e645672062531f82957ed2fe",
  twFee: "GBWWSOATPLIC72ZBOIM7WJCT7VCAHNWW4QUBZ2H4FORMCCIUM5ZVKSZN",
  guardianWasmHash: "46e96842b9c71e3930ef6c554d181153672afce9b971d214ecc20f9810309d94",
  arbiterWasmHash: "a23fde5c8abd3f9ae76834b3136c836769b0906834d48986f9c1ee3060e0263c",
};

/** Topes de la prueba en mainnet. Un valor inválido no abre el tope: se usa el de siempre. */
export function topesMainnet(env: Entorno = process.env) {
  const n = (v: string | undefined, def: number) => {
    const x = Number(v);
    return v !== undefined && v.trim() !== "" && Number.isFinite(x) && x > 0 ? x : def;
  };
  return {
    /** Monto máximo por compra, en USDC, con la protección incluida. */
    maxUsd: n(env.MAINNET_MAX_USD, 10),
    /** Cuentas que la plataforma activa (1,5 XLM cada una): sin tope, cualquiera la podría vaciar. */
    maxCuentas: Math.floor(n(env.MAINNET_MAX_CUENTAS, 20)),
  };
}

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
 * Pares guardián/árbitro de cada despliegue de Trato en testnet (contracts/deployments/testnet.json, DEPLOYED.md), para
 * el indexador: sus compras siguen contando y sus eventos se siguen leyendo aunque la config apunte a otra versión.
 * Lista fija: al desplegar una versión nueva, se agrega acá la que deja de ser la actual.
 */
export const PARES_HISTORICOS: readonly { guardian: string; arbiter: string }[] = [
  { guardian: DEPLOYED.guardian, arbiter: DEPLOYED.arbiter }, // v2
  { guardian: RETIRED_V1.guardian, arbiter: RETIRED_V1.arbiter }, // v1
];

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

/** Admin de los contratos de testnet (contracts/DEPLOYED.md): su llave no se reutiliza en mainnet. */
const ARBITRO_TESTNET = "GBCSZ6TJSQD5FCOPGDQGTGWLLICPKE3DTHRMRVLYSDA4RQDOQMAUDRJT";

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
  /** Emisor de la moneda de los escrows: `lab` (LABUSD) en testnet, Circle (USDC) en mainnet. */
  emisor: string;
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

/**
 * Config de mainnet: solo modo guardián, contratos propios obligatorios (sin los de testnet por defecto), USDC de Circle
 * y llaves que no sean las de testnet. Con algo mal puesto no arranca: mejor un error que plata en el contrato equivocado.
 */
export function cfgMainnet(env: Entorno = process.env): Config {
  const falta = (nombre: string) => {
    const v = env[nombre]?.trim();
    if (!v) throw new Error(`Falta ${nombre} para mainnet (docs/MAINNET.md)`);
    return v;
  };
  if (env.PP_MODE === "direct") throw new Error("PP_MODE=direct no existe en mainnet: solo el modo guardián");
  const contrato = (nombre: string) => {
    const v = falta(nombre);
    if (!StrKey.isValidContract(v)) throw new Error(`${nombre} no es un contrato (C…)`);
    if (PARES_HISTORICOS.some((p) => p.guardian === v || p.arbiter === v)) throw new Error(`${nombre} es un contrato de testnet`);
    return v;
  };
  const llave = (nombre: string, deTestnet: string) =>
    once(() => {
      const kp = Keypair.fromSecret(falta(nombre));
      if (kp.publicKey() === deTestnet) throw new Error(`${nombre} es la llave de testnet: en mainnet va una nueva`);
      return kp;
    });
  const plataforma = llave("PLATAFORMA_SECRET", TESTNET_PUBLICO.plataforma);
  const arbitro = llave("ARBITRO_SECRET", ARBITRO_TESTNET);
  const guardianId = contrato("PP_GUARDIAN_ID");
  const arbiterId = contrato("PP_ARBITER_ID");
  if (guardianId === arbiterId) throw new Error("PP_GUARDIAN_ID y PP_ARBITER_ID son el mismo contrato");
  return {
    mode: "guardian",
    get plataforma() {
      return plataforma();
    },
    get arbitro() {
      return arbitro();
    },
    get lab(): Keypair {
      throw new Error("En mainnet no hay emisor de dólares de prueba");
    },
    twfee: MAINNET_PUBLICO.twFee,
    labusdCode: USDC_MAINNET.code,
    labusdSac: USDC_MAINNET.sac,
    emisor: USDC_MAINNET.issuer,
    wasmHash: MAINNET_PUBLICO.twWasmHash,
    platformFeeBps: Number(env.PLATFORM_FEE_BPS || 200),
    fx: Number(env.FX_BS_PER_USD || 11.7),
    arbitroPanelKey: env.ARBITRO_PANEL_KEY || "",
    guardianId,
    arbiterId,
    extraWindowDays: 3,
  };
}

export function cfg(): Config {
  if (cached) return cached;
  // La red se fija al construir (lib/red.ts). Si el servidor corre con otra, no se sigue: el navegador firmaría para otra red.
  const corre = leerRed(process.env.STELLAR_NETWORK);
  if (corre !== RED) throw new Error(`La app se construyó para ${RED} y el servidor corre con STELLAR_NETWORK=${corre}`);
  if (RED === "mainnet") return (cached = cfgMainnet());
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
    get emisor() {
      return lab().publicKey();
    },
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
