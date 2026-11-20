// Firma de los scripts (demo-reset, smoke): lo mismo que hace lib/api-firmada.ts en el navegador.
// Pide un desafío de un solo uso para esa ruta, lo firma con SEP-53 y devuelve el header `x-trato-firma`.
import { createHash } from "node:crypto";

export async function headerFirma(base, kp, metodo, ruta) {
  const r = await fetch(`${base}/api/firma/desafio`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cuenta: kp.publicKey(), metodo, ruta: ruta.split("?")[0] }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${ruta}: ${d.error ?? `HTTP ${r.status}`}`);
  const h = createHash("sha256").update(`Stellar Signed Message:\n${d.mensaje}`, "utf8").digest();
  return { "x-trato-firma": `${kp.publicKey()}.${d.nonce}.${Buffer.from(kp.sign(h)).toString("base64")}` };
}
