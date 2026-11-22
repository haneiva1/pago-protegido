// Piezas compartidas de las imágenes Open Graph (next/og, 1200x630). Sin dependencias de Node.

export const OG_SIZE = { width: 1200, height: 630 };
export const BRAND = { green: "#50DE50", dark: "#0F6E3D", deep: "#0A2A1B", ink: "#0A2A1B", mint: "#D9F4D4", sal: "#F5F7F1" };

/** El ícono de la marca: el Nudo en Monte sobre Yungas (mismo dibujo que src/app/icon.png). */
export function ShieldLogo({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 152 152">
      <rect width="152" height="152" rx="34" fill="#50DE50" />
      <path transform="translate(35.19 38) scale(0.7037)" d="M0 0 L58 47.5 L116 0 V108 L58 60.5 L0 108 Z" fill="#0A2A1B" />
    </svg>
  );
}

export const TAGLINE = "Tu plata queda guardada hasta que confirmes que te llegó";
