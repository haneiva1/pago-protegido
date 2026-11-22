import { api } from "@/lib/api";
import { apiFirmada } from "@/lib/api-firmada";
import { DEMO } from "@/lib/chat";
import { hayPlataGuardada } from "@/lib/probar";
import type { PreparedTx, WalletProvider, WalletRole } from "@/lib/wallet/types";
import type { Registro } from "../tipos";

/**
 * El pedido "con plata adentro" que usa el caso en vivo. Primero mira el pedido de la demo principal; si no tiene plata
 * guardada, usa (o prepara en segundo plano) uno propio, con dos cuentas de prueba aparte: así no se mezcla con los
 * celulares de la demo. Las mismas rutas y firmas que el chat: alta de la tienda, link y pago del comprador.
 */

export interface PedidoConPlata {
  slug: string;
  escrowId: string | null;
  total: string;
  /** Hash del pago que dejó la plata en el contrato, si el registro lo tiene. */
  pagoHash: string | null;
}

const CLAVE = (r: "tienda" | "comprador") => `pp.probar.casos.${r}`;
const CLAVE_SLUG = "pp.probar.casos.slug";

function leer(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function guardar(k: string, v: string) {
  try {
    window.localStorage.setItem(k, v);
  } catch {}
}

/** Cuenta local de prueba con su propia clave en este navegador (la secreta nunca sale de aquí, como LocalWallet). */
async function cuenta(r: "tienda" | "comprador"): Promise<WalletProvider> {
  const { Keypair, Networks, TransactionBuilder } = await import("@stellar/stellar-sdk");
  const { firmarSep53 } = await import("@/lib/sep53");
  let s = leer(CLAVE(r));
  if (!s) {
    s = Keypair.random().secret();
    guardar(CLAVE(r), s);
  }
  const kp = Keypair.fromSecret(s);
  const role: WalletRole = r === "tienda" ? "vendedor" : "comprador";
  return {
    kind: "local",
    role,
    publicKey: () => kp.publicKey(),
    connect: async () => kp.publicKey(),
    signTransaction: async (xdr: string) => {
      const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
      tx.sign(kp);
      return tx.toXDR();
    },
    signMessage: async (m: string) => firmarSep53(kp, m),
    disconnect: async () => {},
  } as WalletProvider;
}

async function registro(vendedor: string | null): Promise<Registro | null> {
  if (!vendedor) return null;
  try {
    return await api<Registro>(`/api/probar/registro?vendedor=${encodeURIComponent(vendedor)}`);
  } catch {
    return null;
  }
}

function conPlata(r: Registro | null): PedidoConPlata | null {
  const p = r?.pedido;
  if (!p || !hayPlataGuardada(p.status)) return null;
  const pago = r!.movimientos.filter((m) => m.hash && m.kind === "fondeo").pop();
  return { slug: p.slug, escrowId: p.escrow_id, total: p.total, pagoHash: pago?.hash ?? null };
}

/** La cuenta de la tienda de la demo principal (la del chat), si este navegador ya la tiene. */
async function tiendaDeLaDemo(): Promise<string | null> {
  try {
    const w = await import("@/lib/wallet");
    return w.getWallet("vendedor").publicKey();
  } catch {
    return null;
  }
}

/** ¿Hay ya un pedido con plata adentro? El de la demo principal o el propio del caso. Solo lecturas. */
export async function buscarPedidoConPlata(): Promise<PedidoConPlata | null> {
  const demo = conPlata(await registro(await tiendaDeLaDemo()));
  if (demo) return demo;
  if (!leer(CLAVE("tienda"))) return null;
  return conPlata(await registro((await cuenta("tienda")).publicKey()));
}

async function reintentar<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= intentos) throw e;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
}

/** Prepara un pedido propio y lo paga: tienda nueva, link y pago del comprador, todo en la red de prueba. */
export async function prepararPedidoConPlata(): Promise<PedidoConPlata> {
  const w = await import("@/lib/wallet");
  const tienda = await cuenta("tienda");
  const comprador = await cuenta("comprador");
  const pkT = tienda.publicKey()!;
  const pkC = comprador.publicKey()!;

  let r = await registro(pkT);
  const ya = conPlata(r);
  if (ya) return ya;

  if (!r?.tienda) {
    await reintentar(() => w.activateWallet(tienda));
    await reintentar(() => apiFirmada(tienda, "/api/sellers", { pubkey: pkT, storeName: DEMO.tienda, whatsapp: DEMO.whatsapp, city: DEMO.ciudad, pilotId: null }));
  }

  let slug = r?.pedido?.status === "esperando_pago" ? r.pedido.slug : null;
  if (!slug) {
    const o = await reintentar(() =>
      apiFirmada<{ slug: string }>(tienda, "/api/links", {
        sellerPubkey: pkT,
        product: DEMO.producto,
        priceBs: DEMO.precioBs,
        deliveryDays: DEMO.dias,
        category: DEMO.categoria,
        feePayer: "comprador",
      }),
    );
    slug = o.slug;
    guardar(CLAVE_SLUG, slug);
  }

  await reintentar(() => w.activateWallet(comprador));
  const prepared = await reintentar(() =>
    apiFirmada<PreparedTx>(comprador, `/api/orders/${slug}/pay`, { buyer: pkC, recipient: "Ana Pérez", city: "La Paz", agency: "" }),
  );
  await w.signAndSubmit(comprador, prepared);

  // El registro tarda un momento en ver el pago: se espera hasta que la plata figure adentro.
  for (let i = 0; i < 20; i++) {
    r = await registro(pkT);
    const listo = conPlata(r);
    if (listo) return listo;
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error("El pago tardó más de lo esperado");
}
