import { readFile } from "node:fs/promises";
import path from "node:path";

// Inter (400/700/800) desde @fontsource/inter, local: las imágenes OG no dependen de la red.
// La fuente por defecto de next/og solo trae el peso regular.
type OgFont = { name: string; data: Buffer; weight: 400 | 700 | 800; style: "normal" };
let cache: Promise<OgFont[]> | null = null;

export function ogFonts(): Promise<OgFont[]> {
  const dir = path.join(process.cwd(), "node_modules", "@fontsource", "inter", "files");
  cache ??= Promise.all(
    ([400, 700, 800] as const).map(async (weight) => ({
      name: "Inter",
      data: await readFile(path.join(dir, `inter-latin-${weight}-normal.woff`)),
      weight,
      style: "normal" as const,
    })),
  );
  return cache;
}
