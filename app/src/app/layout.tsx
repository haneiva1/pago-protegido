import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { WalletRuntime } from "@/components/WalletRuntime";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pago Protegido",
  description: "Links de pago protegidos para vender por redes sociales. Versión de prueba en Stellar testnet.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#059669" };

function Shield() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" className="fill-brand-600" />
      <path d="m8.5 12 2.5 2.5 4.5-5" className="stroke-white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <div className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
          Versión de prueba en Stellar testnet: se usan USD de prueba, no plata real.
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
          Pago Protegido · prueba en Stellar testnet · escrow de Trustless Work ·{" "}
          <Link href="/arbitro" className="underline">
            Panel del árbitro
          </Link>
        </footer>
      </body>
    </html>
  );
}
