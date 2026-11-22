import { readFile } from "node:fs/promises";
import path from "node:path";

// Funnel Display 800 y Funnel Sans 400/600 (woff estáticos de Google Fonts, guardados en src/lib/fonts): las imágenes OG
// no dependen de la red y usan la misma letra que el sitio. Satori acepta TTF, OTF y WOFF (no WOFF2).
type OgFont = { name: string; data: Buffer; weight: 400 | 600 | 800; style: "normal" };
let cache: Promise<OgFont[]> | null = null;

export function ogFonts(): Promise<OgFont[]> {
  const dir = path.join(process.cwd(), "src", "lib", "fonts");
  cache ??= Promise.all([
    readFile(path.join(dir, "funnel-display-800.woff")).then((data) => ({ name: "Funnel Display", data, weight: 800 as const, style: "normal" as const })),
    readFile(path.join(dir, "funnel-sans-400.woff")).then((data) => ({ name: "Funnel Sans", data, weight: 400 as const, style: "normal" as const })),
    readFile(path.join(dir, "funnel-sans-600.woff")).then((data) => ({ name: "Funnel Sans", data, weight: 600 as const, style: "normal" as const })),
  ]);
  return cache;
}
