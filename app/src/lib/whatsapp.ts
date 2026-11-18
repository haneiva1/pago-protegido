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
  amount?: string; // "37,58 USD de prueba"
}

export function waText(ev: WaEvent, d: WaData): string {
  switch (ev) {
    case "link":
      return `¡Hola! 👋 Te paso el link de pago protegido de ${d.store ?? "mi tienda"} para *${d.product}* (${d.price}).\n\nTu plata queda guardada en un contrato y solo me llega cuando confirmas que recibiste. Si hay un problema, decide un árbitro.\n\n👉 ${d.url}`;
    case "pagado":
      return `Hola ${d.store ?? ""} 👋 Ya pagué *${d.product}* (${d.price}) con Pago Protegido. La plata está guardada hasta que reciba. ¿Me avisas cuando lo despaches?\n\n${d.url}`;
    case "despacho":
      return `¡Gracias por tu compra! 🙌 Recibí tu pago protegido por *${d.product}*. Te aviso apenas lo despache.\n\nSeguimiento: ${d.url}`;
    case "enviado":
      return `📦 Tu pedido *${d.product}* ya fue enviado.\nCódigo de encomienda / evidencia: ${d.evidence ?? "-"}\n\nCuando lo recibas, entra aquí y toca "Recibí conforme" para liberar el pago:\n${d.url}`;
    case "liberado":
      return `✅ Recibí *${d.product}* conforme. Ya se liberó tu pago${d.amount ? ` (${d.amount})` : ""}. ¡Gracias!\n\n${d.url}`;
    case "disputa":
      return `Hola, abrí un reclamo por *${d.product}*: ${d.reason ?? "tuve un problema"}. La plata queda congelada y un árbitro va a revisar el caso.\n\n${d.url}`;
    case "resuelto": {
      const b = d.buyerPct ?? 0;
      return `⚖️ El árbitro resolvió el reclamo de *${d.product}*: ${b}% para el comprador y ${100 - b}% para el vendedor. El contrato ya hizo los pagos.\n\n${d.url}`;
    }
  }
}

export function waLink(text: string, phone?: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
