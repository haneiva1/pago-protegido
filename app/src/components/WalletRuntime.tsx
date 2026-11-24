"use client";

import dynamic from "next/dynamic";
import { ES_MAINNET } from "@/lib/red";

// Pollar solo se carga en el navegador y solo si NEXT_PUBLIC_WALLET=pollar (con su publishable key, igual que
// WALLET_KIND en @/lib/wallet). No importa @/lib/wallet: así el layout no carga el SDK de la red en cada página.
const PollarProviders = dynamic(() => import("./PollarProviders"), { ssr: false });
const POLLAR = !ES_MAINNET && process.env.NEXT_PUBLIC_WALLET === "pollar" && Boolean(process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY);

export function WalletRuntime() {
  return POLLAR ? <PollarProviders /> : null;
}
