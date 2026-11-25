import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtBs } from "@/lib/format";
import { TAGLINE } from "@/lib/og";
import { orders, sellers } from "@/lib/server/db";
import PaginaDePago from "./PaginaDePago";

export const dynamic = "force-dynamic";

/** Vista previa del link en WhatsApp/redes: producto, precio en Bs, tienda y la promesa de protección. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const o = orders.get(slug);
  if (!o) return { title: "Link de pago · Trato" };
  const store = sellers.get(o.seller_pubkey)?.store_name ?? "La tienda";
  const title = `${o.product} · ${fmtBs(o.price_bs_cents)} | Trato`;
  const description = `${store} te envió un link de pago. ${TAGLINE}.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", siteName: "Trato", locale: "es_BO" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  // Un link que no existe responde 404 con el aviso de que puede ser falso (not-found.tsx).
  if (!orders.get((await params).slug)) notFound();
  return <PaginaDePago />;
}
