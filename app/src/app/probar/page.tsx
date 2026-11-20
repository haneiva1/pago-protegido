import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { probarActivo } from "@/lib/server/orders";
import { plazosProbar } from "@/lib/server/probar";
import Probar from "./Probar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prueba Trato de punta a punta",
  description: "El vendedor y el comprador en dos celulares, cada transacción en el registro público y un intento real de desviar la plata.",
};

/** Detrás de PP_PROBAR=1 (apagado por defecto): sin la variable, /probar no existe. */
export default function Page() {
  if (!probarActivo()) notFound();
  return <Probar plazos={plazosProbar()} />;
}
