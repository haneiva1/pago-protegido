// POST /api/plazos/procesar: el cron de GitHub (cada 5 minutos) libera y devuelve los pedidos vencidos sin que nadie
// abra la app. Reutiliza el barrido de sweepOverdue con tope de 20, enfriamiento de 60 s e idempotencia.
// `npm run test:api` (la red es el stub de test/api/stubs: ningún test toca testnet).
import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { nuevoLink, src } from "./entorno.mjs";

const { orders } = await import(src("lib/server/db.ts"));
const { procesarPlazos, PLAZOS_TOPE, PLAZOS_ENFRIAMIENTO_MS } = await import(src("lib/server/orders.ts"));
const { POST } = await import(src("app/api/plazos/procesar/route.ts"));
const { cadena } = await import(new URL("./stubs/escrow.mjs", import.meta.url).href);

const HORA = 3_600_000;
const comprador = Keypair.random();
let n = 0;

/** Pedido pagado sin envío y con el despacho vencido (lo devuelve el barrido). */
function sinDespachar() {
  const l = nuevoLink();
  orders.update(l.slug, {
    status: "pagado",
    buyer_pubkey: comprador.publicKey(),
    escrow_id: `CNODESP${++n}`,
    escrow_json: "{}",
    funded_at: Date.now() - 50 * HORA,
    ship_deadline: Date.now() - HORA,
  });
  return l.slug;
}

/** Pedido enviado con la revisión vencida (lo libera el barrido). */
function revisionVencida() {
  const l = nuevoLink();
  orders.update(l.slug, {
    status: "enviado",
    buyer_pubkey: comprador.publicKey(),
    escrow_id: `CVENC${++n}`,
    escrow_json: "{}",
    funded_at: Date.now() - 100 * HORA,
    ship_deadline: Date.now() - 60 * HORA,
    shipped_at: Date.now() - 80 * HORA,
    deadline: Date.now() - HORA,
  });
  return l.slug;
}

/** Corre el reloj de la app (Date.now) `ms` hacia adelante, para pasar el enfriamiento sin esperar. */
let corrido = 0;
const realNow = Date.now.bind(Date);
Date.now = () => realNow() + corrido;
const adelantar = (ms) => (corrido += ms);

const llamar = async () => {
  const r = await POST(new Request("http://localhost/api/plazos/procesar", { method: "POST" }));
  return { status: r.status, body: await r.json() };
};

test("el barrido procesa como mucho 20 por llamada, respeta el enfriamiento y repetirlo no hace nada", async () => {
  const devolver = Array.from({ length: 5 }, sinDespachar);
  const liberar = Array.from({ length: 20 }, revisionVencida);

  const r1 = await procesarPlazos();
  assert.equal(PLAZOS_TOPE, 20);
  assert.deepEqual(r1, { omitido: false, devueltos: 5, liberados: 15, errores: 0, quedan: 5 });
  assert.equal(cadena.devueltos.length, 5);
  assert.equal(cadena.liberados.length, 15);

  // Antes de los 60 s no toca la red.
  const r2 = await procesarPlazos();
  assert.equal(r2.omitido, true);
  assert.ok(r2.reintentarEnSegundos > 0 && r2.reintentarEnSegundos <= 60);
  assert.equal(cadena.liberados.length, 15);

  adelantar(PLAZOS_ENFRIAMIENTO_MS + 1000);
  const r3 = await procesarPlazos();
  assert.deepEqual(r3, { omitido: false, devueltos: 0, liberados: 5, errores: 0, quedan: 0 });

  // Idempotente: sin vencidos nuevos, otra pasada no manda nada a la red.
  adelantar(PLAZOS_ENFRIAMIENTO_MS + 1000);
  const r4 = await procesarPlazos();
  assert.deepEqual(r4, { omitido: false, devueltos: 0, liberados: 0, errores: 0, quedan: 0 });
  assert.equal(cadena.devueltos.length, 5);
  assert.equal(cadena.liberados.length, 20);
  for (const s of devolver) assert.equal(orders.get(s).status, "devuelto");
  for (const s of liberar) assert.equal(orders.get(s).status, "liberado");
});

test("la ruta es pública, responde JSON sin slugs y la segunda llamada seguida queda omitida", async () => {
  adelantar(PLAZOS_ENFRIAMIENTO_MS + 1000);
  const slug = revisionVencida();
  const a = await llamar();
  assert.equal(a.status, 200);
  assert.deepEqual(a.body, { omitido: false, devueltos: 0, liberados: 1, errores: 0, quedan: 0 });
  assert.ok(!JSON.stringify(a.body).includes(slug));
  assert.equal(orders.get(slug).status, "liberado");

  const b = await llamar();
  assert.equal(b.status, 200);
  assert.equal(b.body.omitido, true);
  assert.equal(cadena.liberados.length, 21);
});
