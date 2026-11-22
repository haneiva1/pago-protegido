"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { PedidoChat } from "@/lib/chat";
import { fmtBs, fmtBsUnits, fmtKg } from "@/lib/format";
import type { OrderView } from "@/lib/types";

/** Canal entre los dos celulares y /probar (mismo origen): "link reenviado", "estafa" y su resultado. */
export const CANAL_CHAT = "pp.probar.chat";

export function canal(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CANAL_CHAT);
  } catch {
    return null;
  }
}

const envioTexto = (o: OrderView["order"]) => {
  const partes = [o.ship_company, o.ship_tracking ? `guía ${o.ship_tracking}` : null, o.ship_weight ? fmtKg(`${o.ship_weight} kg`) : null].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
};

export function aPedidoChat(v: OrderView): PedidoChat {
  const o = v.order;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return {
    slug: o.slug,
    code: o.code,
    product: o.product,
    total: fmtBsUnits(o.amount_units, o.fx),
    precio: fmtBs(o.price_bs_cents),
    status: o.status,
    created_at: o.created_at,
    paid_at: o.funded_at,
    shipped_at: o.shipped_at,
    released_at: o.released_at,
    ship_deadline: o.ship_deadline,
    deadline: o.deadline,
    confirm_after: o.confirm_after,
    envio: envioTexto(o),
    recibido: v.breakdown ? fmtBsUnits(v.breakdown.seller, o.fx) : null,
    confirmDelay: v.confirmDelay ?? null,
    url: `${origin}/p/${o.slug}`,
    imagen: `/p/${o.slug}/opengraph-image`,
  };
}

/** El pedido del chat, consultado cada 3 s mientras la pestaña se ve. */
export function usePedidoChat(slug: string | null, cadaMs = 3000) {
  const [pedido, setPedido] = useState<PedidoChat | null>(null);
  const [tienda, setTienda] = useState<string>("la tienda");
  const gen = useRef(0);
  const cargar = useCallback(async () => {
    if (!slug) return;
    const g = gen.current;
    try {
      const v = await api<OrderView>(`/api/orders/${slug}`);
      if (g !== gen.current) return;
      setPedido(aPedidoChat(v));
      setTienda(v.seller.store_name);
    } catch {
      // Un corte de red no borra lo que ya se ve: el próximo ciclo vuelve a intentar.
    }
  }, [slug]);
  useEffect(() => {
    gen.current += 1;
    setPedido(null);
    if (!slug) return;
    void cargar();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, cadaMs);
    return () => clearInterval(t);
  }, [slug, cargar, cadaMs]);
  return { pedido, tienda, recargar: cargar };
}

/** Reloj de 1 s para las cuentas regresivas. */
export function useAhora(activo = true) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activo]);
  return ahora;
}

/** Dentro de un marco de /probar o con ?marco=1: sin encabezado ni pie del sitio. */
export function useMarco() {
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).has("marco")) document.documentElement.setAttribute("data-marco", "probar");
    } catch {}
  }, []);
}

export const sesion = {
  get(k: string): string | null {
    try {
      return window.sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      window.sessionStorage.setItem(k, v);
    } catch {}
  },
};

/**
 * Reintenta una llamada a la red de prueba (hasta 3 veces, con 2,5 s entre intentos) antes de rendirse: en testnet
 * un `txInsufficientFee` o un tiempo de espera suelen pasar al segundo intento. `onReintento` avisa para mostrar
 * "La red de prueba está lenta…" en lugar del error crudo.
 */
export async function conReintentos<T>(fn: () => Promise<T>, onReintento?: (intento: number) => void, intentos = 3, esperaMs = 2500): Promise<T> {
  let ultimo: unknown;
  for (let i = 1; i <= intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      if (i < intentos) {
        onReintento?.(i);
        await new Promise((r) => setTimeout(r, esperaMs));
      }
    }
  }
  throw ultimo;
}
