// Textos listos para copiar en cada evento. El bot real de WhatsApp viene después.

export type WaEvent = "link" | "pagado" | "despacho" | "enviado" | "liberado" | "disputa" | "resuelto";

export interface WaData {
  product: string;
  price: string; // "Bs 450,00"
  url: string;
  store?: string;
  evidence?: string | null;
  reason?: string | null;
  buyerPct?: number;
  amount?: string; // "Bs 450,04"
}

/**
 * Envío legible para el cliente: "Bolívar (encomiendas) · guía SRV-2026-120033 · 0,6 kg".
 * La app guarda el envío compacto ("empresa|guía|pesokg|huella de la foto"); la huella no se muestra.
 * Si no viene compacto (una guía o un link sueltos), se devuelve tal cual.
 */
export function fmtEnvio(ev?: string | null): string {
  const s = (ev ?? "").trim();
  if (!s.includes("|")) return s;
  const [empresa = "", guia = "", peso = ""] = s.split("|").map((x) => x.trim());
  const kg = peso.replace(/\s*kg$/i, "");
  return [empresa !== "-" && empresa, guia && guia !== "-" && `guía ${guia}`, kg && kg !== "-" && `${kg.replace(".", ",")} kg`]
    .filter(Boolean)
    .join(" · ");
}

/** "70% para el comprador y 30% para el vendedor"; si el reparto es total, "todo para el comprador" o "todo para el vendedor". */
export function fmtReparto(buyerPct: number): string {
  if (buyerPct >= 100) return "todo para el comprador";
  if (buyerPct <= 0) return "todo para el vendedor";
  const pct = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString("es-BO")}%`;
  return `${pct(buyerPct)} para el comprador y ${pct(100 - buyerPct)} para el vendedor`;
}

export function waText(ev: WaEvent, d: WaData): string {
  switch (ev) {
    case "link":
      return `¡Hola! 👋 Te paso el link de pago protegido de ${d.store ?? "mi tienda"} para *${d.product}* (${d.price}).\n\nTu plata queda guardada en un contrato y solo me llega cuando confirmas que recibiste. Si hay un problema, un tercero revisa el reclamo.\n\n👉 ${d.url}`;
    case "pagado":
      return `Hola ${d.store ?? ""} 👋 Ya pagué *${d.product}* (${d.price}) con Trato. La plata está guardada hasta que reciba. ¿Me avisas cuando lo despaches?\n\n${d.url}`;
    case "despacho":
      return `¡Gracias por tu compra! 🙌 Recibí tu pago protegido por *${d.product}*. Te aviso apenas lo despache.\n\nSeguimiento: ${d.url}`;
    case "enviado":
      return `📦 Tu pedido *${d.product}* ya fue enviado.\nEnvío: ${fmtEnvio(d.evidence) || "-"}\n\nCuando lo tengas en tus manos y lo revises, entra aquí para pagarme:\n${d.url}`;
    case "liberado":
      return `✅ Recibí *${d.product}* conforme. Ya se liberó tu pago${d.amount ? ` (${d.amount})` : ""}. ¡Gracias!\n\n${d.url}`;
    case "disputa":
      return `Hola, abrí un reclamo por *${d.product}*: ${d.reason ?? "tuve un problema"}. La plata queda congelada y un revisor va a ver el caso.\n\n${d.url}`;
    case "resuelto":
      return `⚖️ El revisor resolvió el reclamo de *${d.product}*: ${fmtReparto(d.buyerPct ?? 0)}. El contrato ya pagó a cada parte.\n\n${d.url}`;
  }
}

export function waLink(text: string, phone?: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
