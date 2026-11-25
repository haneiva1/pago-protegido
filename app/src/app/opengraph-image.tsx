import { ES_MAINNET, TEXTO } from "@/lib/red";
import { ImageResponse } from "next/og";
import { BRAND, FUENTE, LogoOg, OG_SIZE, TAGLINE } from "@/lib/og";
import { ogFonts } from "@/lib/og-fonts";

export const alt = "Trato: vende a otras ciudades sin que desconfíen de ti";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Imagen genérica de la marca (inicio y páginas sin imagen propia): Monte, logo y la promesa. */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: BRAND.monte,
          color: BRAND.sal,
          fontFamily: FUENTE.sans,
        }}
      >
        <LogoOg sobre="oscuro" height={56} />
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", fontFamily: FUENTE.display, fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5, maxWidth: 1000 }}>
            Vende a otras ciudades sin que desconfíen de ti.
          </div>
          <div style={{ display: "flex", fontSize: 32, lineHeight: 1.3, color: "rgba(245,247,241,0.75)", maxWidth: 980 }}>{TAGLINE}.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 24, color: "rgba(245,247,241,0.6)" }}>
          <div style={{ display: "flex" }}>Compra y vende por redes · Bolivia</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", width: 10, height: 10, borderRadius: 5, background: BRAND.yungas }} />
            {ES_MAINNET ? TEXTO.modo : "Modo práctica"}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
