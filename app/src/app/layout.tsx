import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { WalletRuntime } from "@/components/WalletRuntime";
import "./globals.css";

const OG_TITLE = "Pago Protegido: vende a otras ciudades sin que desconfíen de ti";
const OG_DESC = "Pago contra confirmación de entrega: tu cliente paga por adelantado y su plata queda guardada hasta que recibe. También entre ciudades.";

/** WhatsApp y las redes necesitan URLs absolutas: se arman con el host del request (sirve también detrás de un túnel). */
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return {
    metadataBase: new URL(`${proto}://${host}`),
    title: "Pago Protegido",
    description: "Pago contra confirmación de entrega para ventas entre ciudades por encomienda. Modo práctica.",
    openGraph: { title: OG_TITLE, description: OG_DESC, type: "website", siteName: "Pago Protegido", locale: "es_BO" },
    twitter: { card: "summary_large_image", title: OG_TITLE, description: OG_DESC },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#059669" };

function Shield() {
  return (
    <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
      <path d="M32 4 9 12.5v17.2C9 45 18.8 56.3 32 60c13.2-3.7 23-15 23-30.3V12.5L32 4Z" fill="#059669" />
      <path d="M32 4 9 12.5v17.2C9 45 18.8 56.3 32 60V4Z" fill="#047857" />
      <path d="m21 32.5 7.6 7.6L43.5 25" fill="none" stroke="#fff" strokeWidth="5.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <div className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
          Modo práctica: no se mueve dinero real.
        </div>
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <Shield />
              Pago Protegido
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
        <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
          Pago Protegido · modo práctica ·{" "}
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
