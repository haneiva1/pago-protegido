import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Funnel_Display, Funnel_Sans } from "next/font/google";
import { TratoLogo } from "@/components/TratoLogo";
import { WalletRuntime } from "@/components/WalletRuntime";
import { SCRIPT_MARCO } from "@/lib/probar";
import "./globals.css";

const OG_TITLE = "Trato: vende a otras ciudades sin que desconfíen de ti";
const OG_DESC = "Pago contra confirmación de entrega: tu cliente paga por adelantado y su plata queda guardada hasta que recibe. También entre ciudades.";

/** WhatsApp y las redes necesitan URLs absolutas: se arman con el host del request (sirve también detrás de un túnel). */
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return {
    metadataBase: new URL(`${proto}://${host}`),
    title: "Trato · pago protegido para ventas por redes",
    description: "Pago contra confirmación de entrega para ventas entre ciudades por encomienda. Modo práctica.",
    openGraph: { title: OG_TITLE, description: OG_DESC, type: "website", siteName: "Trato", locale: "es_BO" },
    twitter: { card: "summary_large_image", title: OG_TITLE, description: OG_DESC },
  };
}

const funnelDisplay = Funnel_Display({ subsets: ["latin"], weight: "800", variable: "--font-funnel-display", display: "swap" });
const funnelSans = Funnel_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-funnel-sans", display: "swap" });

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0A2A1B" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-marco lo pone SCRIPT_MARCO en el navegador (dentro de /probar): por eso el aviso de hidratación se ignora.
    <html lang="es" suppressHydrationWarning className={`${funnelDisplay.variable} ${funnelSans.variable}`}>
      <body className="min-h-screen">
        {/* Modo embebido de /probar: corre antes de pintar, así el encabezado nunca aparece dentro del marco. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_MARCO }} />
        <div data-chrome className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
          Modo práctica: no se mueve dinero real.
        </div>
        <header data-chrome className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" aria-label="Trato" className="flex items-center">
              <TratoLogo sobre="claro" className="h-6 w-auto" />
            </Link>
            <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
              <Link href="/como-funciona" className="hover:text-slate-900">
                Cómo funciona
              </Link>
              <Link href="/transparencia" className="hover:text-slate-900">
                Transparencia
              </Link>
              <Link href="/panel" className="hidden hover:text-slate-900 sm:inline">
                Mi panel
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">{children}</main>
        <WalletRuntime />
        <footer data-chrome className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
          Trato · pago protegido · modo práctica ·{" "}
          <Link href="/verificar" className="underline">
            Verificar un link
          </Link>{" "}
          ·{" "}
          <Link href="/piloto" className="underline">
            Únete al piloto
          </Link>{" "}
          ·{" "}
          <Link href="/pedir" className="underline">
            Pide compra protegida
          </Link>{" "}
          ·{" "}
          <Link href="/revisor" className="underline">
            Panel del revisor
          </Link>
        </footer>
      </body>
    </html>
  );
}
