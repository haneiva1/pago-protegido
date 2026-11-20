// lib/server/metrics.ts sin red: no lee eventos del RPC (la base de los tests no tiene compras on-chain).
export * from "../../../src/lib/server/metrics.ts?real";

export async function ingestEvents() {}
