// Tests unitarios de la lógica pura del vendedor: `npm run test:unit` (node --test, sin dependencias).
import assert from "node:assert/strict";
import { test } from "node:test";
import { duplicarLink, fleteAFormulario, pendientes } from "../src/lib/vendedor.ts";

test("pendientes de hoy: despachar lo pagado y responder reclamos del comprador, primero lo vencido", () => {
  const ahora = Date.UTC(2026, 10, 20, 14); // 20-nov 10:00 en Bolivia
  const hora = 3600_000;
  const lista = pendientes(
    [
      { slug: "a", code: "PP-1", product: "Polera", status: "pagado", ship_deadline: ahora + 3 * 24 * hora },
      { slug: "b", code: "PP-2", product: "Celular", status: "pagado", ship_deadline: ahora + 6 * hora }, // hoy 16:00
      { slug: "c", code: "PP-3", product: "Zapatillas", status: "en_disputa", dispute_by: "comprador", disputed_at: ahora - 50 * hora },
      { slug: "d", product: "Mochila", status: "en_disputa", dispute_by: "comprador", disputed_at: ahora - hora, seller_reply: "Ya respondí" },
      { slug: "e", product: "Gorra", status: "en_disputa", dispute_by: "vendedor", disputed_at: ahora - hora },
      { slug: "f", product: "Reloj", status: "enviado" },
      { slug: "g", product: "Lentes", status: "esperando_pago" },
    ],
    ahora,
  );
  assert.deepEqual(
    lista.map((p) => [p.slug, p.tipo, p.cuando]),
    [
      ["c", "responder", "vencido"],
      ["b", "despachar", "hoy"],
      ["a", "despachar", "despues"],
    ],
  );
  assert.equal(lista[0].vence, ahora - 2 * hora);
  // 23:30 de Bolivia ya es otro día en UTC: "hoy" se cuenta con el día de Bolivia.
  const noche = Date.UTC(2026, 10, 21, 3, 30);
  assert.equal(pendientes([{ slug: "x", product: "x", status: "pagado", ship_deadline: Date.UTC(2026, 10, 20, 15) }], Date.UTC(2026, 10, 20, 12))[0].cuando, "hoy");
  assert.equal(pendientes([{ slug: "x", product: "x", status: "pagado", ship_deadline: noche }], Date.UTC(2026, 10, 20, 12))[0].cuando, "hoy");
  assert.equal(pendientes([{ slug: "x", product: "x", status: "pagado", ship_deadline: null }], ahora)[0].cuando, "despues");
});

test("Duplicar: el link rápido con los datos de un link anterior, flete incluido", () => {
  assert.deepEqual(
    duplicarLink({ product: "Polera Adidas", price_bs_cents: 30000, delivery_days: 5, flete: "aparte:25.5", category: "Ropa y calzado", description: "Negra", photo_url: "", fee_payer: "vendedor" }),
    { product: "Polera Adidas", priceBs: "300", deliveryDays: "5", flete: "aparte", fleteBs: "25,5", category: "Ropa y calzado", description: "Negra", photoUrl: "", feePayer: "vendedor" },
  );
  const d = duplicarLink({ product: "Gorra", price_bs_cents: 4550, delivery_days: 2 });
  assert.equal(d.priceBs, "45,50");
  assert.equal(d.flete, "");
  assert.equal(d.category, "Otro");
  assert.equal(d.feePayer, "comprador");
  assert.deepEqual(fleteAFormulario("por_pagar"), { tipo: "por_pagar", bs: "" });
  assert.deepEqual(fleteAFormulario("incluido"), { tipo: "incluido", bs: "" });
  assert.deepEqual(fleteAFormulario("otra cosa"), { tipo: "", bs: "" });
});
