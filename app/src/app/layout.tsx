import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { TratoLogo } from "@/components/TratoLogo";
import { WalletRuntime } from "@/components/WalletRuntime";
import { SCRIPT_MARCO } from "@/lib/probar";
import { ES_MAINNET, TEXTO } from "@/lib/red";
import "./globals.css";

const OG_TITLE = "Trato: vende a otras ciudades sin que desconfíen de ti";
const OG_DESC = "Pago contra confirmación de entrega: tu cliente paga por adelantado y su plata espera entre los dos hasta que recibe. También entre ciudades.";

/** WhatsApp y las redes necesitan URLs absolutas: se arman con el host del request (sirve también detrás de un túnel). */
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return {
    metadataBase: new URL(`${proto}://${host}`),
    title: "Trato · pago protegido para ventas por redes",
    description: "Pago contra confirmación de entrega para ventas entre ciudades por encomienda. " + (ES_MAINNET ? TEXTO.aviso : "Modo práctica."),
    openGraph: { title: OG_TITLE, description: OG_DESC, type: "website", siteName: "Trato", locale: "es_BO" },
    twitter: { card: "summary_large_image", title: OG_TITLE, description: OG_DESC },
  };
}

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0A2A1B" };

const PIE = [
  { href: "/verificar", texto: "Verificar un link" },
  { href: "/piloto", texto: "Únete al piloto" },
  { href: "/pedir", texto: "Pide compra protegida" },
  { href: "/revisor", texto: "Panel del revisor" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-marco lo pone SCRIPT_MARCO en el navegador (dentro de /probar): por eso el aviso de hidratación se ignora.
    <html lang="es" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable}`}>
      <body className="flex min-h-screen flex-col">
        {/* Modo embebido de /probar: corre antes de pintar, así el encabezado nunca aparece dentro del marco. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_MARCO }} />
        <div data-chrome className={ES_MAINNET ? "bg-yungas px-4 py-2 text-center text-sm font-semibold text-monte" : "bg-monte px-4 py-1.5 text-center text-xs font-medium text-sal/85"}>
          <span aria-hidden className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${ES_MAINNET ? "bg-monte" : "bg-yungas"}`} />
          <span data-testid="franja-red">{TEXTO.aviso}</span>
        </div>
        <header data-chrome className="sticky top-0 z-20 border-b border-tinta-200/70 bg-sal/90 backdrop-blur">
          <nav aria-label="Principal" className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
            <Link href="/" aria-label="Trato" className="flex shrink-0 items-center">
              <TratoLogo sobre="claro" className="h-6 w-auto" />
            </Link>
            <div className="flex items-center gap-4 text-sm font-medium text-tinta-600 sm:gap-5">
              <Link href="/como-funciona" className="transition-colors hover:text-monte">
                Cómo funciona
              </Link>
              <Link href="/transparencia" className="transition-colors hover:text-monte">
                Transparencia
              </Link>
              <Link href="/panel" className="hidden transition-colors hover:text-monte sm:inline">
                Mi panel
              </Link>
              <Link href="/vender" className="btn-oscuro btn-sm hidden md:inline-flex">
                Crear mi link
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6">{children}</main>
        <WalletRuntime />
        <footer data-chrome className="border-t border-tinta-200 bg-sal">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <TratoLogo sobre="claro" className="h-5 w-auto" />
              <span className="text-xs text-tinta-500">Pago protegido para ventas por redes · {TEXTO.modo}</span>
            </div>
            <nav aria-label="Más de Trato" className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-medium text-tinta-600 sm:flex sm:flex-wrap">
              {PIE.map((l) => (
                <Link key={l.href} href={l.href} className="transition-colors hover:text-monte">
                  {l.texto}
                </Link>
              ))}
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
