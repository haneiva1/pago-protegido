import { ImageResponse } from "next/og";
import { COMPRAS_INTERNAS, fmtDuracion, fmtProporcion, nf, rotuloVentas } from "@/lib/kpi-format";
import { BRAND, FUENTE, LogoOg, OG_SIZE, iniciales } from "@/lib/og";
import { ogFonts } from "@/lib/og-fonts";
import { ES_MAINNET } from "@/lib/red";
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
        [nf(k.pagadas_al_vendedor), rotuloVentas(k.pagadas_al_vendedor, p.pilot)],
        [fmtProporcion(k.ventas_sin_reclamo, k.cerradas), "sin reclamo"],
        [fmtDuracion(k.despacho_promedio_s), "despacho promedio"],
      ]
    : [];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BRAND.sal, color: BRAND.monte, fontFamily: FUENTE.sans }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "24px 64px", background: BRAND.monte, color: BRAND.sal }}>
          <LogoOg sobre="oscuro" height={44} />
          <div style={{ display: "flex", width: 2, height: 36, background: "rgba(245,247,241,0.25)" }} />
          <div style={{ display: "flex", fontSize: 32, fontWeight: 600 }}>Vende con Trato</div>
        </div>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "44px 64px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div
              style={{
                display: "flex",
                width: 92,
                height: 92,
                borderRadius: 46,
                background: BRAND.yungas,
                color: BRAND.monte,
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FUENTE.display,
                fontSize: 38,
                fontWeight: 800,
              }}
            >
              {iniciales(store)}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontFamily: FUENTE.display, fontSize: store.length > 24 ? 50 : 62, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>{store}</div>
              <div style={{ display: "flex", fontSize: 26, color: BRAND.tinta }}>{p?.city ? `${p.city} · historial verificable` : "Historial verificable"}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            {stats.map(([v, l]) => (
              <div key={l} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "20px 26px", borderRadius: 24, background: BRAND.blanco, border: `2px solid ${BRAND.tintaClaro}` }}>
                <div style={{ display: "flex", fontFamily: FUENTE.display, fontSize: 58, fontWeight: 800, color: BRAND.monte, letterSpacing: -1 }}>{v}</div>
                <div style={{ display: "flex", fontSize: 26, color: BRAND.tinta }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: BRAND.tinta }}>{`${p && !p.pilot && !ES_MAINNET ? COMPRAS_INTERNAS : "Números del registro público de cada compra"}. Verificación de identidad: pendiente.`}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}
