#!/usr/bin/env node
// Crea .env.local con las llaves de TESTNET de las identidades del Stellar CLI
// (plataforma, arbitro, lab) y la dirección de twfee. SOLO TESTNET.
// Uso: npm run setup            (no pisa un .env.local existente)
//      npm run setup -- --force (lo regenera)
// Si existe docs-pp/.env.pollar (o la ruta en POLLAR_ENV_FILE), copia también las variables de Pollar.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(APP, ".env.local");
const HORIZON = "https://horizon-testnet.stellar.org";
const force = process.argv.includes("--force");

if (existsSync(OUT) && !force) {
  console.log(".env.local ya existe; usa `npm run setup -- --force` para regenerarlo.");
  process.exit(0);
}

const stellar = (...args) => execFileSync("stellar", args, { encoding: "utf8" }).trim();
const secret = (id) => stellar("keys", "show", id);
const address = (id) => stellar("keys", "address", id);

const ids = { plataforma: secret("plataforma"), arbitro: secret("arbitro"), lab: secret("lab") };
for (const [k, v] of Object.entries(ids)) {
  if (!/^S[A-Z2-7]{55}$/.test(v)) throw new Error(`La llave de ${k} no parece una secret key de Stellar`);
}

// Comprobación de red: las tres cuentas tienen que existir en TESTNET.
for (const id of ["plataforma", "arbitro", "lab", "twfee"]) {
  const res = await fetch(`${HORIZON}/accounts/${address(id)}`);
  if (!res.ok) throw new Error(`La cuenta ${id} no existe en testnet (${res.status}). ¿Corriste el spike?`);
}

const lines = [
  "# Generado por `npm run setup`. SOLO TESTNET. No se versiona.",
  // Modo guardián por defecto (contratos de ../contracts/deployments/testnet.json). PP_MODE=direct sigue disponible.
  "PP_MODE=guardian",
  "PP_GUARDIAN_ID=CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU",
  "PP_ARBITER_ID=CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU",
  "NEXT_PUBLIC_WALLET=local",
  `PLATAFORMA_SECRET=${ids.plataforma}`,
  `ARBITRO_SECRET=${ids.arbitro}`,
  `LAB_SECRET=${ids.lab}`,
  `TWFEE_ADDRESS=${address("twfee")}`,
  "LABUSD_CODE=LABUSD",
  "LABUSD_SAC=CC65P6TQQ646YDXVS3PM6YVZASXW6WM5B67YKI46JH4EG65LJPOGBD4S",
  "ESCROW_WASM_HASH=1b367bc8476cf80b89f6396e2aa07b602b78361dd829b5ce9b64ada365196660",
  "PLATFORM_FEE_BPS=200",
  "FX_BS_PER_USD=11.70",
  `ARBITRO_PANEL_KEY=${randomBytes(9).toString("base64url")}`,
  // Clave compartida con el bot de WhatsApp (pago-protegido/bot, header x-bot-key).
  `PP_BOT_KEY=${randomBytes(18).toString("base64url")}`,
];

const pollarFile = process.env.POLLAR_ENV_FILE ?? join(APP, "..", "..", "docs-pp", ".env.pollar");
if (existsSync(pollarFile)) {
  // Con Pollar configurado, es la billetera principal; el e2e fuerza NEXT_PUBLIC_WALLET=local.
  lines[lines.indexOf("NEXT_PUBLIC_WALLET=local")] = "NEXT_PUBLIC_WALLET=pollar";
  lines.push("# Pollar (testnet), copiado de " + pollarFile);
  for (const l of readFileSync(pollarFile, "utf8").split("\n")) {
    if (/^\s*[A-Z0-9_]+=/.test(l)) lines.push(l.trim());
  }
}

writeFileSync(OUT, lines.join("\n") + "\n", { mode: 0o600 });
console.log(`Listo: ${OUT}`);
