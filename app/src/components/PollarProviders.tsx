"use client";

import { PollarClient } from "@pollar/core";
import { PollarProvider, usePollar } from "@pollar/react";
import { useEffect } from "react";
import { setPollarState } from "@/lib/wallet/pollar";

// Un solo cliente por pestaña: Pollar advierte si hay varios con la misma API key
// (comparten sesión y rotan el refresh token cada uno por su lado).
const g = globalThis as unknown as { __ppPollar?: PollarClient };
const client = (g.__ppPollar ??= new PollarClient({
  apiKey: process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY!,
  stellarNetwork: "testnet",
}));

/** Copia el estado de usePollar() al módulo de billetera (PollarWallet). */
function PollarBridge() {
  const { isAuthenticated, wallet, openLoginModal, logout } = usePollar();
  const address = (wallet as { address?: string } | null)?.address ?? null;
  useEffect(() => {
    setPollarState({
      isAuthenticated,
      address,
      openLoginModal,
      logout,
      signTx: (xdr: string) => client.signTx(xdr, { skipSponsorship: true }),
    });
  }, [isAuthenticated, address, openLoginModal, logout]);
  useEffect(() => () => setPollarState(null), []);
  return null;
}

/** Se monta junto a la app (no envuelve las páginas): solo aporta el modal de login y la firma. */
export default function PollarProviders() {
  return (
    <PollarProvider client={client}>
      <PollarBridge />
    </PollarProvider>
  );
}
