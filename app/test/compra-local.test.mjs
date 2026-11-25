import assert from "node:assert/strict";
import { test } from "node:test";
import { VIGENCIA_MS, intentoDePago, leerCompraDeTexto } from "../src/lib/compra-local.ts";
import { mensajeDeError } from "../src/lib/comprador.ts";
import { LINK_VACIO, resumenLink } from "../src/lib/vendedor.ts";
import { waText } from "../src/lib/whatsapp.ts";

const AHORA = 1_800_000_000_000;

test("pago a medias: mientras no se sabe qué cuenta hay en el navegador, nunca es de otro", () => {
  assert.equal(intentoDePago({ comprador: null, yo: undefined, ahora: AHORA }), "libre");
  assert.equal(intentoDePago({ comprador: "GA", yo: undefined, hasta: AHORA + 1, ahora: AHORA }), "cargando");
  // La cuenta guardada al empezar alcanza para reconocerlo, sin cargar el módulo de la cuenta.
  assert.equal(intentoDePago({ comprador: "GA", yo: undefined, guardada: "GA", hasta: AHORA + 1, ahora: AHORA }), "mio");
  assert.equal(intentoDePago({ comprador: "GA", yo: "GA", hasta: AHORA + 1, ahora: AHORA }), "mio");
  assert.equal(intentoDePago({ comprador: "GA", yo: "GB", hasta: AHORA + 1, ahora: AHORA }), "ajeno");
  assert.equal(intentoDePago({ comprador: "GA", yo: null, hasta: AHORA + 1, ahora: AHORA }), "ajeno");
  // Vencida la reserva, el link queda libre aunque la vista todavía traiga al comprador anterior.
  assert.equal(intentoDePago({ comprador: "GA", yo: "GB", hasta: AHORA, ahora: AHORA }), "libre");
});

test("pago a medias: se retoma con los datos guardados, hasta un día después", () => {
  const texto = JSON.stringify({ datos: { recipient: "Ana Pérez", city: "La Paz" }, cuenta: "GA", t: AHORA });
  assert.deepEqual(leerCompraDeTexto(texto, AHORA + 1000), { datos: { recipient: "Ana Pérez", city: "La Paz", agency: "" }, cuenta: "GA", t: AHORA });
  assert.equal(leerCompraDeTexto(texto, AHORA + VIGENCIA_MS + 1), null);
  for (const malo of [null, "", "{", "null", "{}", JSON.stringify({ datos: { recipient: "Ana" }, t: AHORA })]) assert.equal(leerCompraDeTexto(malo, AHORA), null);
});

test("errores: sin jerga de la red ni inglés, y sin decir que lo paga otra persona", () => {
  for (const crudo of ["Error del servidor: fetch failed", "Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."])
    assert.equal(mensajeDeError(new Error(crudo)), "No pudimos conectarnos. Revisa tu internet y toca de nuevo.");
  assert.equal(
    mensajeDeError(new Error("Otra persona está pagando este link. Si no termina, se libera a las 14:32.")),
    "Ya hay un pago empezado en este link. Si no termina, se libera a las 14:32.",
  );
  assert.equal(mensajeDeError(new Error("Elige la ciudad de destino")), "Elige la ciudad de destino");
});

test("crear link: la línea de resumen dice los valores por defecto y los cambiados", () => {
  assert.equal(resumenLink(LINK_VACIO), "Despachas en 3 días · flete a acordar · tu cliente paga la protección");
  assert.equal(
    resumenLink({ ...LINK_VACIO, deliveryDays: "1", flete: "aparte", fleteBs: "25", feePayer: "vendedor" }),
    "Despachas en 1 día · flete aparte, Bs 25 · tú pagas la protección",
  );
  assert.match(resumenLink({ ...LINK_VACIO, flete: "por_pagar", category: "Celular" }), /flete por pagar al recoger · tu cliente paga la protección · Celular$/);
});

test("mensaje para el cliente: corto, con el link y sin el nombre viejo", () => {
  const t = waText("link", { product: "Zapatillas", price: "Bs 450,00", url: "https://x/p/zapatillas-a1b2c3", store: "Tienda Sofi", flete: "Flete por pagar al recoger" });
  assert.equal(t, "¡Hola! 👋 Paga *Zapatillas* (Bs 450,00) aquí:\nhttps://x/p/zapatillas-a1b2c3\n🚚 Flete por pagar al recoger.\n\nCon Trato, yo cobro recién cuando confirmes que te llegó.");
  for (const ev of ["link", "pagado", "despacho", "enviado", "liberado", "disputa", "resuelto"])
    assert.doesNotMatch(waText(ev, { product: "X", price: "Bs 1,00", url: "u" }), /protegid/i);
});
