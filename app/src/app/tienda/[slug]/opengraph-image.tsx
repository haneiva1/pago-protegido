import { insigniaImage } from "@/lib/insignia";
import { OG_SIZE } from "@/lib/og";
import { perfilTienda } from "@/lib/server/kpis";

export const alt = "Vende con Pago Protegido";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Vista previa del perfil al pegar el link en Instagram, TikTok o WhatsApp. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return insigniaImage(await perfilTienda(slug));
}
