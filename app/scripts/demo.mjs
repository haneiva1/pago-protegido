#!/usr/bin/env node
// npm run demo: deja todo listo para la presentación (SOLO TESTNET).
//   - App web en http://localhost:3020 (billetera Pollar si .env.local la tiene; Pollar acepta ese origen).
//   - Simulador del bot de WhatsApp en http://localhost:3030, conectado a la app real (x-bot-key).
// Ctrl+C apaga los dos.
// Variables opcionales: DEMO_APP_PORT, DEMO_SIM_PORT, DEMO_SELLER_PHONE, DEMO_BUYER_PHONE.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BOT = join(APP, "..", "bot");
const APP_PORT = process.env.DEMO_APP_PORT || "3020";
const SIM_PORT = process.env.DEMO_SIM_PORT || "3030";
const SELLER = process.env.DEMO_SELLER_PHONE || "59171234567";
const BUYER = process.env.DEMO_BUYER_PHONE || "59176543210";
const appUrl = `http://localhost:${APP_PORT}`;
const simUrl = `http://localhost:${SIM_PORT}`;

const envFile = join(APP, ".env.local");
if (!existsSync(envFile)) execFileSync("node", [join(APP, "scripts", "setup-env.mjs")], { stdio: "inherit" });
const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
if (!env.PP_BOT_KEY) {
  console.error("Falta PP_BOT_KEY en .env.local: corre `npm run setup -- --force`.");
  process.exit(1);
}
if (!existsSync(join(BOT, "node_modules"))) {
  console.log("Instalando dependencias del bot…");
  execFileSync("npm", ["install"], { cwd: BOT, stdio: "inherit" });
}

const children = [];
function start(name, cmd, args, opts) {
  const child = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
  const tag = (line) => line && process.stdout.write(`[${name}] ${line}\n`);
  for (const s of [child.stdout, child.stderr]) s.on("data", (d) => String(d).split("\n").forEach(tag));
  child.on("exit", (code) => {
    console.log(`[${name}] terminó (${code}). Apagando la demo.`);
    stop(code ?? 1);
  });
  children.push(child);
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

start("app", "npx", ["next", "dev", "-p", APP_PORT], { cwd: APP, env: { ...process.env, PORT: APP_PORT, PP_DEMO: process.env.PP_DEMO ?? "1" } });
start("bot", "npm", ["run", "sim"], {
  cwd: BOT,
  env: {
    ...process.env,
    PP_APP_URL: appUrl,
    PP_PUBLIC_URL: appUrl,
    PP_BOT_KEY: env.PP_BOT_KEY,
    SIM_PORT,
    SIM_SELLER_PHONE: SELLER,
    SIM_BUYER_PHONE: BUYER,
    POLL_INTERVAL_MS: "3000",
  },
});

async function ready(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* todavía no */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const [okApp, okSim] = await Promise.all([ready(`${appUrl}/api/info`), ready(simUrl)]);
const wallet = env.NEXT_PUBLIC_WALLET === "pollar" ? "Pollar (Google o email)" : "local (llave en el navegador)";
console.log(`
──────────────── Pago Protegido: demo lista (testnet) ────────────────
 App web          ${appUrl}${okApp ? "" : "   (no respondió todavía)"}
   Billetera      ${wallet} · modo ${env.PP_MODE || "guardian"}
   Vendedor       ${appUrl}/vender?wa=${SELLER}   (crea la tienda con el número del simulador)
   Árbitro        ${appUrl}/arbitro   clave: ${env.ARBITRO_PANEL_KEY}
   Demo plazo     ${appUrl}/panel?demo=1   (liberación automática a los 2 minutos)
 Bot (simulador)  ${simUrl}${okSim ? "" : "   (no respondió todavía)"}
   Vendedor +${SELLER} · Comprador +${BUYER}
   Prueba: "vendo zapatillas nike 40 a 450 bs entrega 3 días"
 Ctrl+C para apagar todo.
───────────────────────────────────────────────────────────────────────
`);
