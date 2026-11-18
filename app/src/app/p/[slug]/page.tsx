import type { Metadata } from "next";
import { fmtBs } from "@/lib/format";
import { TAGLINE } from "@/lib/og";
import { orders, sellers } from "@/lib/server/db";
import PaginaDePago from "./PaginaDePago";

export const dynamic = "force-dynamic";

/** Vista previa del link en WhatsApp/redes: producto, precio en Bs, tienda y la promesa de protección. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const o = orders.get(slug);
  if (!o) return { title: "Link de pago · Pago Protegido" };
  const store = sellers.get(o.seller_pubkey)?.store_name ?? "La tienda";
  const title = `${o.product} · ${fmtBs(o.price_bs_cents)} | Pago Protegido`;
  const description = `${store} te envió un link de pago protegido. ${TAGLINE}.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", siteName: "Pago Protegido", locale: "es_BO" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function Page() {
  return <PaginaDePago />;
}
