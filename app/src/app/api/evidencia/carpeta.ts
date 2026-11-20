import fs from "node:fs";
import path from "node:path";

/** Carpeta de evidencias: junto a la base de datos (PP_DB_PATH o data/pp.db), en evidencia/. */
export function carpetaEvidencia(): string {
  const db = process.env.PP_DB_PATH
    ? path.resolve(/* turbopackIgnore: true */ process.env.PP_DB_PATH)
    : path.join(/* turbopackIgnore: true */ process.cwd(), "data", "pp.db");
  return path.join(path.dirname(db), "evidencia");
}

/**
 * ¿Queda lugar para `bytes` más sin bajar del mínimo libre? La carpeta vive en el mismo disco que pp.db: si se
 * llena, la base deja de escribir. El mínimo es PP_EVIDENCIA_MIN_LIBRE_MB (por defecto 1024, 1 GB).
 */
export function hayEspacio(dir: string, bytes: number): boolean {
  const mb = process.env.PP_EVIDENCIA_MIN_LIBRE_MB ? Number(process.env.PP_EVIDENCIA_MIN_LIBRE_MB) : NaN;
  const minimo = (Number.isFinite(mb) && mb >= 0 ? mb : 1024) * 1024 * 1024;
  const s = fs.statfsSync(dir);
  return s.bavail * s.bsize - bytes >= minimo;
}
