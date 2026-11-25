// Configuración por variables de entorno. Lee `.env` si existe (Node 22: process.loadEnvFile).

import { existsSync } from "node:fs";
import type { Red } from "./engine/messages.ts";
import { KAPSO_URL, KAPSO_VERSION } from "./transports/kapso.ts";

/** STELLAR_NETWORK, igual que en la app: vacío = testnet. Cualquier otro valor es un error: la red no se adivina. */
export function leerRed(v: string | undefined): Red {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "" || s === "testnet") return "testnet";
  if (s === "mainnet") return "mainnet";
  throw new Error(`STELLAR_NETWORK tiene que ser "testnet" o "mainnet" (vino "${s}")`);
}

/** Quién conecta el bot con WhatsApp: Meta directo (por defecto) o Kapso. Cualquier otro valor es un error. */
export type Proveedor = "meta" | "kapso";
export function leerProveedor(v: string | undefined): Proveedor {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "" || s === "meta") return "meta";
  if (s === "kapso") return "kapso";
  throw new Error(`WA_PROVIDER tiene que ser "meta" o "kapso" (vino "${s}")`);
}

const API: Record<Proveedor, { url: string; version: string }> = {
  meta: { url: "https://graph.facebook.com", version: "v23.0" },
  kapso: { url: KAPSO_URL, version: KAPSO_VERSION },
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && existsSync(".env")) process.loadEnvFile(".env");
  const proveedor = leerProveedor(env.WA_PROVIDER);
  const appUrl = (env.PP_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return {
    /** API de la app web: elige la instancia (la demo de testnet o la de mainnet). */
    appUrl,
    appUrlExplicita: !!env.PP_APP_URL,
    /** Red de esa instancia. En modo WhatsApp se comprueba contra GET /api/info antes de arrancar. */
    red: leerRed(env.STELLAR_NETWORK),
    /** URL que ven las personas en los links (si la app está detrás de un túnel). Por defecto, PP_APP_URL. */
    publicUrl: (env.PP_PUBLIC_URL ?? appUrl).replace(/\/+$/, ""),
    /** Clave compartida con la app para /api/bot/* (APP-ENDPOINTS.md). */
    botKey: env.PP_BOT_KEY ?? "",
    wa: {
      proveedor,
      token: env.WA_TOKEN ?? "",
      phoneNumberId: env.WA_PHONE_NUMBER_ID ?? "",
      verifyToken: env.WA_VERIFY_TOKEN ?? "",
      appSecret: env.WA_APP_SECRET ?? "",
      version: env.WA_GRAPH_VERSION || API[proveedor].version,
      /** Solo para los tests: la API de Meta (o de Kapso) simulada en localhost. */
      baseUrl: (env.WA_GRAPH_URL || API[proveedor].url).replace(/\/+$/, ""),
      /** Solo con WA_PROVIDER=kapso: reemplazan a WA_TOKEN, WA_VERIFY_TOKEN y WA_APP_SECRET. */
      kapso: { apiKey: env.KAPSO_API_KEY ?? "", webhookSecret: env.KAPSO_WEBHOOK_SECRET ?? "" },
      /** Plantilla aprobada para avisar fuera de la ventana de 24 horas. Vacía = los avisos esperan a que la persona escriba. */
      plantilla: env.WA_TEMPLATE_AVISO ?? "",
      plantillaLang: env.WA_TEMPLATE_LANG || "es",
    },
    port: Number(env.PORT ?? 3040),
    simPort: Number(env.SIM_PORT ?? 3030),
    mockPort: Number(env.MOCK_PORT ?? 3031),
    pollMs: Number(env.POLL_INTERVAL_MS ?? 10_000),
    /** Recordatorios al comprador: horas antes de la liberación automática ("48,24,2"). */
    reminderHours: (env.REMINDER_HOURS ?? "48,24,2").split(",").map(Number).filter((n) => n > 0),
    /** Modo demo: las horas de los recordatorios (y el plazo de la app de mentira) se cuentan en minutos. */
    demoMinutes: env.DEMO_MINUTES === "1" || env.DEMO_MINUTES === "true",
    /** Reportes de links ("reportar <link>"), una línea JSON por reporte. "" = solo en memoria. */
    reportsFile: env.REPORTS_FILE ?? "data/reportes.jsonl",
    stateFile: env.BOT_STATE_FILE ?? "data/bot-state.json",
    simSellerPhone: env.SIM_SELLER_PHONE ?? "59171234567",
    simBuyerPhone: env.SIM_BUYER_PHONE ?? "59176543210",
  };
}

export type Config = ReturnType<typeof loadConfig>;

const esLocal = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url);

/** Qué falta para atender WhatsApp real. Vacío = puede arrancar. Con algo mal puesto no arranca: mejor un error que un bot a medias. */
export function problemasWhatsapp(c: Config, opts: { mock?: boolean } = {}): string[] {
  const out: string[] = [];
  const obligatorias = {
    ...(c.wa.proveedor === "kapso"
      ? { KAPSO_API_KEY: c.wa.kapso.apiKey, KAPSO_WEBHOOK_SECRET: c.wa.kapso.webhookSecret, WA_PHONE_NUMBER_ID: c.wa.phoneNumberId }
      : { WA_TOKEN: c.wa.token, WA_PHONE_NUMBER_ID: c.wa.phoneNumberId, WA_VERIFY_TOKEN: c.wa.verifyToken, WA_APP_SECRET: c.wa.appSecret }),
    PP_APP_URL: c.appUrlExplicita,
    PP_BOT_KEY: c.botKey,
  };
  for (const [k, v] of Object.entries(obligatorias)) if (!v) out.push(`Falta ${k}`);
  if (c.wa.phoneNumberId && !/^\d{10,20}$/.test(c.wa.phoneNumberId)) out.push("WA_PHONE_NUMBER_ID es el identificador largo que da Meta (solo dígitos), no el número de teléfono");
  if (c.appUrlExplicita && !/^https:\/\//i.test(c.publicUrl)) out.push("PP_PUBLIC_URL (o PP_APP_URL) tiene que empezar con https: los links se abren desde otros celulares");
  if (c.wa.baseUrl !== API[c.wa.proveedor].url && !esLocal(c.wa.baseUrl)) out.push("WA_GRAPH_URL es solo para pruebas en localhost: quítala");
  if (opts.mock) out.push("--mock es del simulador: el WhatsApp real habla con la app real");
  return out;
}
