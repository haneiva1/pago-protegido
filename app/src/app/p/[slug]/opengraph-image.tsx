import { ImageResponse } from "next/og";
import { fmtBs, fmtUsd } from "@/lib/format";
import { BRAND, FUENTE, LogoOg, NudoIcono, OG_SIZE, TAGLINE, iniciales } from "@/lib/og";
import { ogFonts } from "@/lib/og-fonts";
import { orders, sellers } from "@/lib/server/db";

export const alt = "Link de pago protegido";
export const size = OG_SIZE;
export const contentType = "image/png";

/**
 * Tarjeta que ve el comprador cuando el vendedor pega el link en WhatsApp: producto, precio en Bs,
 * tienda, el logo de Trato y la promesa. Solo datos públicos del link.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const o = orders.get(slug);
  const s = o ? sellers.get(o.seller_pubkey) : undefined;
  const product = o?.product ?? "Link de pago protegido";
  const price = o ? fmtBs(o.price_bs_cents) : "";
  const usd = o ? `aprox. ${fmtUsd(o.amount_units)} USD de prueba` : "";
  const store = s?.store_name ?? "Trato";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BRAND.sal, color: BRAND.monte, fontFamily: FUENTE.sans }}>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "52px 64px 44px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div
                style={{
                  display: "flex",
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  background: BRAND.monte,
                  color: BRAND.sal,
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: FUENTE.display,
                  fontSize: 30,
                  fontWeight: 800,
                }}
              >
                {iniciales(store)}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 34, fontWeight: 600 }}>{store}</div>
                <div style={{ display: "flex", fontSize: 22, color: BRAND.tinta }}>te envió un link de pago</div>
              </div>
            </div>
            <LogoOg sobre="claro" height={44} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: BRAND.musgo, marginBottom: 6 }}>
              {o?.code ? `Compra protegida · ${o.code}` : "Compra protegida"}
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: FUENTE.display,
                fontSize: product.length > 34 ? 50 : 62,
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: -1,
                maxWidth: 1060,
              }}
            >
              {product}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
              <div style={{ display: "flex", fontFamily: FUENTE.display, fontSize: 96, fontWeight: 800, letterSpacing: -3 }}>{price}</div>
              <div style={{ display: "flex", fontSize: 26, color: BRAND.tinta }}>{usd}</div>
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "26px 64px",
            background: BRAND.monte,
            color: BRAND.sal,
            fontSize: 32,
            fontWeight: 600,
          }}
        >
          <NudoIcono size={56} />
          {TAGLINE}.
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
