"use client";

import dynamic from "next/dynamic";
import { WALLET_KIND } from "@/lib/wallet";

// Pollar solo se carga en el navegador y solo si NEXT_PUBLIC_WALLET=pollar.
const PollarProviders = dynamic(() => import("./PollarProviders"), { ssr: false });

export function WalletRuntime() {
  return WALLET_KIND === "pollar" ? <PollarProviders /> : null;
}
