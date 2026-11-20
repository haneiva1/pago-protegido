import path from "node:path";

/** Carpeta de evidencias: junto a la base de datos (PP_DB_PATH o data/pp.db), en evidencia/. */
export function carpetaEvidencia(): string {
  const db = process.env.PP_DB_PATH
    ? path.resolve(/* turbopackIgnore: true */ process.env.PP_DB_PATH)
    : path.join(/* turbopackIgnore: true */ process.cwd(), "data", "pp.db");
  return path.join(path.dirname(db), "evidencia");
}
