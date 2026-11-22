// Piezas compartidas de las imágenes Open Graph (next/og, 1200x630). Sin dependencias de Node.
// Satori no entiende clases ni oklch: colores en hex y estilos en línea.
import { PALABRA_PATH, SIMBOLO_PATH } from "@/components/TratoLogo";

export const OG_SIZE = { width: 1200, height: 630 };

/** Marca Trato en hex (manual del 21-nov-2026) y neutros "tinta". */
export const BRAND = {
  yungas: "#50DE50",
  monte: "#0A2A1B",
  sal: "#F5F7F1",
  musgo: "#0F6E3D",
  tinta: "#5F7066",
  tintaClaro: "#D7E1DA",
  exito: "#E9FDEC",
  blanco: "#FFFFFF",
};

export const FUENTE = { display: "Funnel Display", sans: "Funnel Sans" };

export const TAGLINE = "La plata espera entre los dos hasta que confirmes que te llegó";

/** El ícono de la marca: el Nudo en Monte sobre un cuadrado Yungas (mismo dibujo que src/app/icon.svg). */
export function NudoIcono({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 152 152">
      <rect width="152" height="152" rx="34" fill={BRAND.yungas} />
      <path transform="translate(35.19 38) scale(0.7037)" d={SIMBOLO_PATH} fill={BRAND.monte} />
    </svg>
  );
}

/** Logo completo. sobre="claro": todo en Monte. sobre="oscuro": símbolo en Yungas y palabra en Sal. */
export function LogoOg({ sobre = "claro", height = 44 }: { sobre?: "claro" | "oscuro"; height?: number }) {
  const simbolo = sobre === "oscuro" ? BRAND.yungas : BRAND.monte;
  const palabra = sobre === "oscuro" ? BRAND.sal : BRAND.monte;
  return (
    <svg width={Math.round((588.63 / 134.5) * height)} height={height} viewBox="0 0 588.63 134.5">
      <path fill={simbolo} transform="translate(0 31.5) scale(0.9537)" d={SIMBOLO_PATH} />
      <path fill={palabra} transform="translate(174.63 0)" d={PALABRA_PATH} />
    </svg>
  );
}

/** Iniciales de la tienda (hasta dos palabras). */
export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
