/**
 * En qué red de Stellar corre esta instancia: STELLAR_NETWORK=testnet|mainnet (docs/MAINNET.md). Sin la variable es
 * testnet, como siempre. Lo usan el servidor y el navegador, así que no depende de nada.
 *
 * La red queda fija al construir (next.config.ts copia STELLAR_NETWORK a NEXT_PUBLIC_STELLAR_NETWORK): el navegador firma
 * con la misma red que usa el servidor. `cfg()` se niega a arrancar si el servidor corre con otra.
 */
export type Red = "testnet" | "mainnet";

/** Vacío = testnet. Cualquier otro valor es un error: nunca se adivina la red. */
export function leerRed(v: string | null | undefined): Red {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "" || s === "testnet") return "testnet";
  if (s === "mainnet") return "mainnet";
  throw new Error(`STELLAR_NETWORK tiene que ser "testnet" o "mainnet" (vino "${s}")`);
}

export const RED: Red = leerRed(process.env.NEXT_PUBLIC_STELLAR_NETWORK || process.env.STELLAR_NETWORK);
export const ES_MAINNET = RED === "mainnet";

/** Las passphrases son públicas y fijas; van acá para que el navegador no cargue nada del servidor. */
export const PASSPHRASE: Record<Red, string> = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
};

const EXPLORADOR: Record<Red, string> = {
  testnet: "https://stellar.expert/explorer/testnet",
  mainnet: "https://stellar.expert/explorer/public",
};
export const explorador = (red: Red = RED) => EXPLORADOR[red];

export const AVISO_MAINNET = "Prueba real en mainnet: plata real, montos chicos";

/** Los textos de pantalla que dependen de la red. Los de testnet son los de siempre. */
export const TEXTOS = {
  testnet: {
    aviso: "Modo práctica: no se mueve dinero real.",
    modo: "modo práctica",
    dolares: "USD de prueba",
    dolaresLargo: "dólares de prueba",
    redPublica: "red de prueba",
    monedaContrato: "Moneda de prueba (USD de prueba, LABUSD)",
    grupoPropio: "Pruebas del equipo en testnet (incluye reclamos forzados)",
    grupoPropioCorto: "Pruebas del equipo en testnet",
    notaGrupoPropio: "Compras hechas por el equipo y por las pruebas automáticas, con reclamos y devoluciones forzados a propósito para probar cada camino.",
    notaPiloto: "Solo compras de tiendas que entraron por el piloto. Nunca se suman con las pruebas del equipo.",
    notaDolares: "Se guarda en dólares digitales (en producción, USDC, 1 a 1 con el dólar; en esta práctica, dólares de prueba).",
    tiendaPropia: "Datos de práctica en la red de prueba: esta tienda es de las pruebas del equipo, no del piloto.",
  },
  mainnet: {
    aviso: `${AVISO_MAINNET}.`,
    modo: "prueba real en mainnet",
    dolares: "USDC",
    dolaresLargo: "USDC",
    redPublica: "red principal de Stellar",
    monedaContrato: "Moneda (USDC de Circle)",
    grupoPropio: "Prueba real en mainnet (plata real, montos chicos)",
    grupoPropioCorto: "Prueba real en mainnet",
    notaGrupoPropio: "Compras con USDC real entre personas conocidas del equipo, con un monto máximo por compra. No se suman con las de testnet ni con las del piloto.",
    notaPiloto: "Solo compras de tiendas que entraron por el piloto. Nunca se suman con la prueba en mainnet entre conocidos.",
    notaDolares: "Se guarda en USDC (dólares digitales de Circle, 1 a 1 con el dólar).",
    tiendaPropia: "Prueba real en mainnet entre personas conocidas del equipo: esta tienda no es del piloto.",
  },
} as const;

export const TEXTO = TEXTOS[RED];
