import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La red queda fija al construir, también en el navegador (src/lib/red.ts). Vacía = testnet.
  env: { NEXT_PUBLIC_STELLAR_NETWORK: process.env.STELLAR_NETWORK || "testnet" },
  serverExternalPackages: ["better-sqlite3"],
  // El e2e corre `next start` en otro puerto con otra base de datos.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Las imágenes para compartir leen las fuentes Funnel de src/lib/fonts con readFile: el build standalone (Railway) las tiene que incluir.
  outputFileTracingIncludes: { "/**/opengraph-image": ["./src/lib/fonts/*"], "/tienda/[slug]/insignia": ["./src/lib/fonts/*"] },
};

export default nextConfig;
