import { ImageResponse } from "next/og";
import { fmtBs, fmtUsd } from "@/lib/format";
import { BRAND, OG_SIZE, ShieldLogo, TAGLINE } from "@/lib/og";
import { ogFonts } from "@/lib/og-fonts";
import { orders, sellers } from "@/lib/server/db";

export const alt = "Link de pago protegido";
export const size = OG_SIZE;
export const contentType = "image/png";

/**
 * Tarjeta que ve el comprador cuando el vendedor pega el link en WhatsApp: producto, precio en Bs,
 * tienda, el escudo "Pago protegido" y la promesa. Solo datos públicos del link.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const o = orders.get(slug);
  const s = o ? sellers.get(o.seller_pubkey) : undefined;
  const product = o?.product ?? "Link de pago protegido";
  const price = o ? fmtBs(o.price_bs_cents) : "";
  const usd = o ? `aprox. ${fmtUsd(o.amount_units)} USD de prueba` : "";
  const store = s?.store_name ?? "Pago Protegido";
  const initials = store
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f6f7f9", color: BRAND.ink, fontFamily: "Inter" }}>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "52px 64px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div
                style={{
                  display: "flex",
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  background: BRAND.green,
                  color: "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 30,
                  fontWeight: 800,
                }}
              >
                {initials}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>{store}</div>
                <div style={{ display: "flex", fontSize: 22, color: "#64748b" }}>te envió un link de pago</div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 22px 10px 14px",
                borderRadius: 999,
                background: BRAND.mint,
                color: BRAND.deep,
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              <ShieldLogo size={46} />
              Pago protegido
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontSize: product.length > 34 ? 52 : 64, fontWeight: 800, lineHeight: 1.1, maxWidth: 1060 }}>{product}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
              <div style={{ display: "flex", fontSize: 92, fontWeight: 900, letterSpacing: -2 }}>{price}</div>
              <div style={{ display: "flex", fontSize: 28, color: "#64748b" }}>{usd}</div>
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "26px 64px",
            background: BRAND.green,
            color: "#fff",
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          <div style={{ display: "flex", width: 60, height: 60, borderRadius: 30, background: "#fff", alignItems: "center", justifyContent: "center" }}>
            <ShieldLogo size={44} />
          </div>
          {TAGLINE}
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
