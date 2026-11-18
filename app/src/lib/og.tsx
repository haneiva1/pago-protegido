// Piezas compartidas de las imágenes Open Graph (next/og, 1200x630). Sin dependencias de Node.

export const OG_SIZE = { width: 1200, height: 630 };
export const BRAND = { green: "#059669", dark: "#047857", deep: "#064e3b", ink: "#0f172a", mint: "#d1fae5" };

/** El logo: escudo con check (mismo dibujo que src/app/icon.svg). */
export function ShieldLogo({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <path d="M32 4 9 12.5v17.2C9 45 18.8 56.3 32 60c13.2-3.7 23-15 23-30.3V12.5L32 4Z" fill={BRAND.green} />
      <path d="M32 4 9 12.5v17.2C9 45 18.8 56.3 32 60V4Z" fill={BRAND.dark} />
      <path d="m21 32.5 7.6 7.6L43.5 25" fill="none" stroke="#fff" strokeWidth="5.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const TAGLINE = "Tu plata queda guardada hasta que confirmes que te llegó";
