import { ImageResponse } from "next/og";
import { fmtDuracion, fmtProporcion, nf } from "@/lib/kpi-format";
import { BRAND, OG_SIZE, ShieldLogo } from "@/lib/og";
import { ogFonts } from "@/lib/og-fonts";
import type { PerfilTienda } from "@/lib/types";

/**
 * Insignia "Vende con Trato" para la bio de Instagram o TikTok: es la imagen OG de /tienda/<slug>
 * y la que se descarga desde el perfil. Solo nombre, ciudad y números del registro público (sin teléfono).
 */
export async function insigniaImage(p: PerfilTienda | null) {
  const store = p?.store_name ?? "Trato";
  const k = p?.kpis;
  const stats: [string, string][] = k
    ? [
        [nf(k.pagadas_al_vendedor), k.pagadas_al_vendedor === 1 ? "venta protegida" : "ventas protegidas"],
        [fmtProporcion(k.ventas_sin_reclamo, k.cerradas), "sin reclamo"],
        [fmtDuracion(k.despacho_promedio_s), "despacho promedio"],
      ]
    : [];
  const initials = store
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BRAND.sal, color: BRAND.ink, fontFamily: "Inter" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "26px 64px", background: BRAND.green, color: BRAND.deep, fontSize: 40, fontWeight: 800 }}>
          <div style={{ display: "flex", width: 64, height: 64, borderRadius: 32, background: "#fff", alignItems: "center", justifyContent: "center" }}>
            <ShieldLogo size={46} />
          </div>
          Vende con Trato
        </div>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "40px 64px 44px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div
              style={{
                display: "flex",
                width: 92,
                height: 92,
                borderRadius: 46,
                background: BRAND.dark,
                color: "#fff",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 38,
                fontWeight: 800,
              }}
            >
              {initials}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: store.length > 24 ? 50 : 62, fontWeight: 800, lineHeight: 1.05 }}>{store}</div>
              <div style={{ display: "flex", fontSize: 26, color: "#64748b" }}>{p?.city ? `${p.city} · historial verificable` : "Historial verificable"}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            {stats.map(([v, l]) => (
              <div key={l} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "18px 24px", borderRadius: 24, background: "#fff", border: `3px solid ${BRAND.mint}` }}>
                <div style={{ display: "flex", fontSize: 58, fontWeight: 800, color: BRAND.deep }}>{v}</div>
                <div style={{ display: "flex", fontSize: 26, color: "#475569" }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#64748b" }}>
            Números del registro público de cada compra. Verificación de identidad: pendiente.
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}
