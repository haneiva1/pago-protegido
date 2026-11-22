import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO, cuentaAtras, mensajesComprador, mensajesVendedor, tituloPaso } from "../src/lib/chat.ts";

const PROHIBIDAS = [/garant[ií]a/i, /\bseguro\b/i, /custodia/i, /arbitraje/i, /árbitro/i, /100\s?%/, /cripto/i, /\btoken/i, /stablecoin/i, /\bwallet\b/i, /\bllaves?\b/i, /blockchain/i, /stellar/i];
const T0 = Date.UTC(2026, 10, 22, 4, 0, 0);
const pedido = (status, extra = {}) => ({
  slug: "zapatillas-nike-talla-40-abc123",
  code: "PP-7KM4Q9TX",
  product: "Zapatillas Nike talla 40",
  total: "Bs 456,75",
  precio: "Bs 450,00",
  status,
  created_at: T0 + 60_000,
  paid_at: status === "esperando_pago" ? null : T0 + 120_000,
  shipped_at: ["enviado", "liberado"].includes(status) ? T0 + 180_000 : null,
  released_at: status === "liberado" ? T0 + 300_000 : null,
  ship_deadline: T0 + 240_000,
  deadline: T0 + 360_000,
  confirm_after: T0 + 240_000,
  envio: "Trans Copacabana (encomiendas) · guía SRV-2026-118734 · 1,2 kg",
  recibido: status === "liberado" ? "Bs 450,04" : null,
  url: "http://localhost:3160/p/zapatillas-nike-talla-40-abc123",
  imagen: "/p/zapatillas-nike-talla-40-abc123/opengraph-image",
  ...extra,
});
const textos = (ms) => ms.map((m) => `${m.texto ?? ""} ${m.botones?.map((b) => b.texto).join(" ") ?? ""} ${m.tarjeta ? `${m.tarjeta.titulo} ${m.tarjeta.descripcion}` : ""}`).join("\n");
const botones = (ms) => ms.flatMap((m) => m.botones ?? []);

test("tienda: el alta pide nombre, ciudad y WhatsApp, de a una respuesta sugerida", () => {
  const base = { t0: T0, ahora: T0, tienda: null, creandoLink: false, pedido: null, reenviado: false, enviando: false, host: "localhost" };
  let ms = mensajesVendedor({ ...base, alta: {} });
  assert.deepEqual(
    botones(ms).map((b) => b.id),
    ["nombre"],
  );
  ms = mensajesVendedor({ ...base, alta: { nombre: DEMO.tienda } });
  assert.deepEqual(botones(ms).map((b) => b.id), ["ciudad"]);
  ms = mensajesVendedor({ ...base, alta: { nombre: DEMO.tienda, ciudad: DEMO.ciudad } });
  assert.deepEqual(botones(ms).map((b) => b.id), ["whatsapp"]);
  ms = mensajesVendedor({ ...base, alta: { nombre: DEMO.tienda, ciudad: DEMO.ciudad, whatsapp: DEMO.whatsappBonito, creando: true } });
  assert.equal(ms.at(-1).enCurso, true);
  assert.equal(botones(ms).length, 0);
});

test("tienda: con la tienda creada hay una sola acción por momento: vender, reenviar, 'Ya lo envié'", () => {
  const base = { t0: T0, ahora: T0 + 500_000, alta: {}, tienda: DEMO.tienda, creandoLink: false, reenviado: false, enviando: false, host: "localhost" };
  assert.deepEqual(botones(mensajesVendedor({ ...base, pedido: null })).map((b) => b.id), ["vender"]);
  const conLink = mensajesVendedor({ ...base, pedido: pedido("esperando_pago") });
  assert.deepEqual(botones(conLink).map((b) => b.id), ["reenviar"]);
  assert.ok(conLink.some((m) => m.tarjeta?.titulo.includes("Zapatillas Nike talla 40 · Bs 450,00")));
  assert.match(textos(conLink), /PP-7KM4Q9TX/);
  const pagado = mensajesVendedor({ ...base, pedido: pedido("pagado"), reenviado: true });
  assert.deepEqual(botones(pagado).map((b) => b.id), ["enviado"]);
  assert.match(textos(pagado), /tu cliente pagó Bs 456,75 .* GUARDADO/);
  const enviado = mensajesVendedor({ ...base, pedido: pedido("enviado"), reenviado: true });
  assert.equal(botones(enviado).length, 0);
  assert.match(textos(enviado), /figura como enviado/);
  const cobrado = mensajesVendedor({ ...base, pedido: pedido("liberado"), reenviado: true });
  assert.match(textos(cobrado), /Te llegaron \*Bs 450,04\*/);
});

test("comprador: nada hasta que la tienda reenvía; después pagar, el estafador bloqueado y 'Sí, me llegó' cuando corre el plazo", () => {
  const base = { ahora: T0 + 200_000, tienda: DEMO.tienda, estafa: null, confirmando: false, host: "localhost" };
  assert.equal(mensajesComprador({ ...base, pedido: pedido("esperando_pago"), reenviado: false }).length, 0);
  const link = mensajesComprador({ ...base, pedido: pedido("esperando_pago"), reenviado: true });
  assert.deepEqual(botones(link).map((b) => b.id), ["pagar"]);
  assert.match(textos(link), /La plata espera entre los dos hasta que confirmes que te llegó/);
  const estafa = mensajesComprador({ ...base, pedido: pedido("pagado"), reenviado: true, estafa: { at: T0 + 150_000, rechazado: true, error: "Error(Contract, #12)", detalle: "" } });
  assert.match(textos(estafa), /soy del banco/);
  assert.match(textos(estafa), /Bloqueado.*Error\(Contract, #12\)/);
  assert.equal(estafa.find((m) => m.id === "estafa").de, "desconocido");
  const antes = mensajesComprador({ ...base, pedido: pedido("enviado"), reenviado: true });
  const b = botones(antes);
  assert.deepEqual(b.map((x) => [x.id, Boolean(x.deshabilitado)]), [["me-llego", true], ["problema", false]]);
  assert.match(textos(antes), /Puedes pagarle en 0:40/);
  const despues = mensajesComprador({ ...base, ahora: T0 + 300_000, pedido: pedido("enviado"), reenviado: true });
  assert.equal(botones(despues).find((x) => x.id === "me-llego").deshabilitado, false);
  const fin = mensajesComprador({ ...base, ahora: T0 + 400_000, pedido: pedido("liberado"), reenviado: true });
  assert.match(textos(fin), /recibió Bs 450,04/);
  assert.equal(botones(fin).length, 0);
});

test("ningún texto del chat usa palabras prohibidas", () => {
  const todo = [
    ...["esperando_pago", "pagado", "enviado", "liberado", "devuelto", "en_disputa", "resuelto"].flatMap((s) => [
      ...mensajesVendedor({ t0: T0, ahora: T0 + 500_000, alta: {}, tienda: DEMO.tienda, creandoLink: false, pedido: pedido(s), reenviado: true, enviando: false, host: "x" }),
      ...mensajesComprador({ ahora: T0 + 500_000, tienda: DEMO.tienda, pedido: pedido(s), reenviado: true, estafa: { at: T0, rechazado: true, error: "Error(Contract, #12)", detalle: "" }, confirmando: false, host: "x" }),
    ]),
    ...mensajesVendedor({ t0: T0, ahora: T0, alta: { nombre: "a", ciudad: "b", whatsapp: "c", creando: true }, tienda: null, creandoLink: false, pedido: null, reenviado: false, enviando: false, host: "x" }),
  ];
  const t = textos(todo);
  for (const re of PROHIBIDAS) assert.doesNotMatch(t, re);
});

test("cuenta atrás y títulos de los pasos", () => {
  assert.equal(cuentaAtras(T0 + 61_000, T0), "1:01");
  assert.equal(cuentaAtras(T0, T0 + 5000), "0:00");
  assert.equal(tituloPaso({ tienda: false, status: null, estafa: false }).n, 1);
  assert.equal(tituloPaso({ tienda: true, status: "esperando_pago", estafa: false }).quien, "comprador");
  assert.equal(tituloPaso({ tienda: true, status: "pagado", estafa: true }).quien, "vendedor");
  assert.equal(tituloPaso({ tienda: true, status: "liberado", estafa: true }).titulo, "La tienda cobró");
});
