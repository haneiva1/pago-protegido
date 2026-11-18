import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // El e2e corre `next start` en otro puerto con otra base de datos.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
