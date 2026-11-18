import { ImageResponse } from "next/og";
import { BRAND, OG_SIZE, ShieldLogo, TAGLINE } from "@/lib/og";
import { ogFonts } from "@/lib/og-fonts";

export const alt = "Pago Protegido: vende a otras ciudades sin que desconfíen de ti";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Imagen genérica de la marca (landing y páginas sin imagen propia). */
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
          background: `linear-gradient(135deg, ${BRAND.deep} 0%, ${BRAND.ink} 100%)`,
          color: "#fff",
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <ShieldLogo size={104} />
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>Pago Protegido</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 58, fontWeight: 800, lineHeight: 1.1, maxWidth: 980 }}>Vende a otras ciudades sin que desconfíen de ti.</div>
          <div style={{ display: "flex", fontSize: 32, color: BRAND.mint }}>{TAGLINE}.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "rgba(255,255,255,.7)" }}>
          <div style={{ display: "flex" }}>Links de pago protegidos · Bolivia</div>
          <div style={{ display: "flex" }}>Escrow en Stellar · Trustless Work</div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
