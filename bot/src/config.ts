// Configuración por variables de entorno. Lee `.env` si existe (Node 22: process.loadEnvFile).

import { existsSync } from "node:fs";

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && existsSync(".env")) process.loadEnvFile(".env");
  const appUrl = (env.PP_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return {
    /** API de la app web. */
    appUrl,
    /** URL que ven las personas en los links (si la app está detrás de un túnel). Por defecto, PP_APP_URL. */
    publicUrl: (env.PP_PUBLIC_URL ?? appUrl).replace(/\/+$/, ""),
    /** Clave compartida con la app para /api/bot/* (APP-ENDPOINTS.md). */
    botKey: env.PP_BOT_KEY ?? "",
    wa: {
      token: env.WA_TOKEN ?? "",
      phoneNumberId: env.WA_PHONE_NUMBER_ID ?? "",
      verifyToken: env.WA_VERIFY_TOKEN ?? "",
      appSecret: env.WA_APP_SECRET ?? "",
      version: env.WA_GRAPH_VERSION ?? "v23.0",
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
