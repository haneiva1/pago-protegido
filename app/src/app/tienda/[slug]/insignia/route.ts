import { insigniaImage } from "@/lib/insignia";
import { perfilTienda } from "@/lib/server/kpis";

export const dynamic = "force-dynamic";

/** La insignia en PNG para descargar desde el perfil (la misma imagen que la vista previa OG). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await perfilTienda(slug);
  if (!p) return new Response("Tienda no encontrada", { status: 404 });
  const img = await insigniaImage(p);
  img.headers.set("Cache-Control", "public, max-age=60");
  return img;
}
