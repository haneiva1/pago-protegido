// Reportes de links sospechosos ("reportar <link>"): una línea JSON por reporte en un archivo local
// (REPORTS_FILE, por defecto data/reportes.jsonl). Con "" quedan solo en memoria (tests, e2e).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { FakeReason } from "./engine/links.ts";

export interface Report {
  /** ISO 8601. */
  at: string;
  /** WhatsApp de quien reporta (solo dígitos). */
  from: string;
  link: string;
  host: string;
  /** Qué dijo el verificador del link: "autentico" o el motivo por el que es falso. */
  verdict: "autentico" | FakeReason;
  /** El mensaje completo, recortado a 500 caracteres. */
  note: string;
}

export class ReportStore {
  private readonly memory: Report[] = [];

  constructor(readonly file = "") {}

  add(r: Report): void {
    if (!this.file) {
      this.memory.push(r);
      return;
    }
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, `${JSON.stringify(r)}\n`);
  }

  all(): Report[] {
    if (!this.file) return [...this.memory];
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Report);
  }
}
