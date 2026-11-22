import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatComprador } from "@/components/chat/ChatComprador";
import { probarActivo } from "@/lib/server/orders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chat del comprador · prueba de Trato", robots: { index: false } };

/** El chat del comprador dentro del celular de /probar. Recibe el pedido por ?slug= o lo descubre por el registro. */
export default async function Page({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  if (!probarActivo()) notFound();
  const { slug } = await searchParams;
  return <ChatComprador slugInicial={typeof slug === "string" && /^[a-z0-9-]+$/.test(slug) ? slug : null} />;
}
