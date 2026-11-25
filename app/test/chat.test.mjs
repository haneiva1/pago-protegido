import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO, cuentaAtras, mensajesComprador, mensajesVendedor, pasoDemo } from "../src/lib/chat.ts";

const PROHIBIDAS = [/garant[ií]a/i, /\bseguro\b/i, /custodia/i, /arbitraje/i, /árbitro/i, /100\s?%/, /cripto/i, /\btoken/i, /stablecoin/i, /\bwallet\b/i, /\bllaves?\b/i, /blockchain/i, /stellar/i, /sofi/i];
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
  url: "https://trato.example/p/zapatillas-nike-talla-40-abc123",
  imagen: "/p/zapatillas-nike-talla-40-abc123/opengraph-image",
  ...extra,
});
const textos = (ms) => ms.map((m) => `${m.texto ?? ""} ${m.botones?.map((b) => b.texto).join(" ") ?? ""} ${m.tarjeta ? `${m.tarjeta.titulo} ${m.tarjeta.dominio}` : ""}`).join("\n");
const botones = (ms) => ms.flatMap((m) => m.botones ?? []);
const lineas = (t) => t.split("\n").length;

test("tienda: el registro mínimo es Hola → Crear mi cuenta → creando; después una sola acción por momento", () => {
  const base = { t0: T0, ahora: T0 + 500_000, tienda: null, creandoLink: false, pedido: null, reenviado: false, enviando: false, host: "trato.example" };
  assert.deepEqual(botones(mensajesVendedor({ ...base, alta: {} })).map((b) => b.id), ["hola"]);
  assert.deepEqual(botones(mensajesVendedor({ ...base, alta: { hola: true } })).map((b) => b.id), ["crear-cuenta"]);
  const creando = mensajesVendedor({ ...base, alta: { hola: true, creando: true } });
  assert.equal(creando.at(-1).enCurso, true);
  assert.equal(botones(creando).length, 0);
  const con = { ...base, tienda: DEMO.tienda };
  assert.deepEqual(botones(mensajesVendedor(con)).map((b) => b.id), ["vender"]);
  const conLink = mensajesVendedor({ ...con, pedido: pedido("esperando_pago") });
  assert.deepEqual(botones(conLink).map((b) => b.id), ["mandar"]);
  assert.ok(conLink.some((m) => m.tarjeta?.titulo === "Zapatillas Nike talla 40 · Bs 450,00" && m.tarjeta.dominio === "trato.example"));
  // Camino feliz: con la plata guardada, lo único tocable es "Ya lo envié" (el estafador ya no está en la demo principal).
  const pagado = mensajesVendedor({ ...con, pedido: pedido("pagado"), reenviado: true });
  assert.doesNotMatch(textos(pagado), /robar/);
  assert.deepEqual(botones(pagado).map((b) => b.id), ["enviado"]);
  assert.match(textos(pagado), /Bs 450 \+ Bs 6,75 de protección/);
  assert.match(textos(pagado), /Tu cliente pagó Bs 456,75/);
  const enviado = mensajesVendedor({ ...con, pedido: pedido("enviado"), reenviado: true });
  assert.equal(botones(enviado).length, 0);
  assert.match(textos(enviado), /Ya lo envié/);
  assert.match(textos(mensajesVendedor({ ...con, pedido: pedido("liberado"), reenviado: true })), /Cobraste Bs 450\. Ya está en tu cuenta/);
});

test("comprador: nada hasta que la tienda manda el link; pagar, el estafador bloqueado y 'Sí, me llegó' con cuenta atrás", () => {
  const base = { ahora: T0 + 200_000, tienda: DEMO.tienda, estafa: null, confirmando: false, host: "trato.example" };
  assert.equal(mensajesComprador({ ...base, pedido: pedido("esperando_pago"), reenviado: false }).length, 0);
  const link = mensajesComprador({ ...base, pedido: pedido("esperando_pago"), reenviado: true });
  assert.deepEqual(botones(link).map((b) => b.id), ["pagar"]);
  assert.match(textos(link), /Zapatería te mandó un link de pago\./);
  const estafa = mensajesComprador({ ...base, pedido: pedido("pagado"), reenviado: true, estafa: { at: T0 + 150_000, rechazado: true, error: "Error(Contract, #12)", detalle: "" } });
  assert.match(textos(estafa), /Soy del banco/);
  assert.match(textos(estafa), /Bloqueado: la plata solo puede ir a la Zapatería o volver a ti/);
  assert.doesNotMatch(textos(estafa), /Error\(Contract/);
  assert.equal(estafa.find((m) => m.id === "estafa").de, "desconocido");
  const antes = botones(mensajesComprador({ ...base, pedido: pedido("enviado"), reenviado: true }));
  assert.deepEqual(antes.map((x) => [x.id, Boolean(x.deshabilitado)]), [["me-llego", true], ["problema", false]]);
  assert.equal(antes[0].texto, "Sí, me llegó y está bien · 0:40");
  const despues = botones(mensajesComprador({ ...base, ahora: T0 + 300_000, pedido: pedido("enviado"), reenviado: true }));
  assert.deepEqual([despues[0].texto, despues[0].deshabilitado], ["Sí, me llegó y está bien", false]);
  const fin = mensajesComprador({ ...base, ahora: T0 + 400_000, pedido: pedido("liberado"), reenviado: true });
  assert.match(textos(fin), /Pagaste a Zapatería/);
  assert.equal(botones(fin).length, 0);
});

test("mensajes cortos: ninguno pasa de 2 líneas (3 en el saludo) y ninguno usa palabras prohibidas ni 'Sofi'", () => {
  const todos = [
    ...["esperando_pago", "pagado", "enviado", "liberado", "devuelto", "en_disputa", "resuelto"].flatMap((s) => [
      ...mensajesVendedor({ t0: T0, ahora: T0 + 500_000, alta: {}, tienda: DEMO.tienda, creandoLink: false, pedido: pedido(s), reenviado: true, enviando: false, host: "x" }),
      ...mensajesComprador({ ahora: T0 + 500_000, tienda: DEMO.tienda, pedido: pedido(s), reenviado: true, estafa: { at: T0, rechazado: true, error: "Error(Contract, #12)", detalle: "" }, confirmando: false, host: "x" }),
    ]),
    ...mensajesVendedor({ t0: T0, ahora: T0, alta: { hola: true, creando: true }, tienda: null, creandoLink: false, pedido: null, reenviado: false, enviando: false, host: "x" }),
  ];
  for (const m of todos) if (m.texto) assert.ok(lineas(m.texto) <= 3 && m.texto.length <= 150, `largo: ${m.texto}`);
  const t = textos(todos);
  for (const re of PROHIBIDAS) assert.doesNotMatch(t, re);
});

test("los 4 pasos: título de 6 palabras o menos y línea de 10 o menos; camino feliz sin estafador", () => {
  const palabras = (s) => s.replace(/^\d\.\s*/, "").split(/\s+/).filter(Boolean).length;
  const casos = [
    [{ tienda: false, status: null }, 1, "vendedor"],
    [{ tienda: true, status: null }, 2, "vendedor"],
    [{ tienda: true, status: "esperando_pago" }, 2, "vendedor"],
    [{ tienda: true, status: "esperando_pago", mandado: true }, 3, "comprador"],
    [{ tienda: true, status: "esperando_pago", mandado: true, sub: "qr" }, 3, "comprador"],
    [{ tienda: true, status: "pagado" }, 3, "vendedor"],
    [{ tienda: true, status: "enviado" }, 4, "comprador"],
    [{ tienda: true, status: "liberado" }, 4, "vendedor"],
  ];
  for (const [p, n, quien] of casos) {
    const r = pasoDemo(p);
    assert.equal(r.n, n);
    assert.equal(r.quien, quien);
    assert.ok(palabras(r.titulo) <= 6, r.titulo);
    assert.ok(palabras(r.linea) <= 10, r.linea);
  }
  assert.equal(pasoDemo({ tienda: true, status: "pagado" }).titulo, "3. La Zapatería despacha");
  assert.equal(pasoDemo({ tienda: true, status: "pagado" }).linea, "Toca Ya lo envié");
  assert.equal(pasoDemo({ tienda: true, status: "esperando_pago", mandado: true, sub: "qr" }).linea, "Toca Escanear con mi banco");
  assert.equal(pasoDemo({ tienda: false, status: null, sub: "hoja-cuenta" }).linea, "Revisa el nombre y toca Listo");
  assert.equal(pasoDemo({ tienda: true, status: "liberado" }).terminado, true);
  assert.equal(cuentaAtras(T0 + 61_000, T0), "1:01");
});
