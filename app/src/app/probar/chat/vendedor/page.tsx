import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatVendedor } from "@/components/chat/ChatVendedor";
import { probarActivo } from "@/lib/server/orders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chat de la tienda · prueba de Trato", robots: { index: false } };

/** El chat de la tienda dentro del celular de /probar. Sin PP_PROBAR=1 no existe. */
export default function Page() {
  if (!probarActivo()) notFound();
  return <ChatVendedor />;
}
