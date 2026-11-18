#!/usr/bin/env node
// npm run piloto:csv: exporta la lista de espera del piloto (/piloto) a CSV.
// Escribe data/piloto.csv y también lo imprime. Base: PP_DB_PATH o data/pp.db.
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DB = resolve(APP, process.env.PP_DB_PATH || join("data", "pp.db"));
const OUT = resolve(APP, process.env.PILOTO_CSV || join("data", "piloto.csv"));
if (!existsSync(DB)) {
  console.error(`No existe la base ${DB}.`);
  process.exit(1);
}
const Database = createRequire(import.meta.url)("better-sqlite3");
const d = new Database(DB, { readonly: true });
const has = d.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='pilot_waitlist'`).get();
const rows = has ? d.prepare(`SELECT * FROM pilot_waitlist ORDER BY created_at ASC`).all() : [];
const cols = ["created_at", "name", "store", "city", "sells", "ships_to", "avg_ticket", "whatsapp", "consent", "seller_pubkey"];
const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [
  cols.join(","),
  ...rows.map((r) => cols.map((c) => cell(c === "created_at" ? new Date(r[c]).toISOString() : r[c])).join(",")),
].join("\n");
writeFileSync(OUT, csv + "\n");
console.log(csv);
console.error(`\n${rows.length} registros → ${OUT}`);
