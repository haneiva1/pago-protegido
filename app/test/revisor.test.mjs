// Tests unitarios del panel del revisor (M10): regla que aplica, plazos y evidencia de cada parte.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CRITERIOS, evidenciaDeLasPartes, plazosDelReclamo, reglaDelReclamo } from "../src/lib/revisor.ts";

const hora = 3600_000;
const ahora = Date.UTC(2026, 10, 20, 14);
const enviado = {
  status: "en_disputa",
  dispute_by: "comprador",
  disputed_at: ahora - hora,
  shipped_at: ahora - 30 * hora,
  ship_company: "Bolívar (encomiendas)",
  ship_tracking: "OLVA-55821",
  ship_weight: "0.4",
  ship_city: "Oruro",
  dest_city: "Oruro",
};

test("regla: sin prueba de envío gana el comprador", () => {
  const r = reglaDelReclamo({ status: "en_disputa", dispute_reason: "No envió", dispute_by: "comprador", disputed_at: ahora - hora }, ahora);
  assert.equal(r.criterio, 0);
  assert.equal(r.titulo, CRITERIOS[0]);
  assert.equal(r.gana, "comprador");
});

test("regla: dirección distinta a la del link gana el comprador", () => {
  const r = reglaDelReclamo({ ...enviado, dispute_reason: "No llegó", ship_city: "Potosí" }, ahora);
  assert.equal(r.criterio, 1);
  assert.equal(r.gana, "comprador");
  assert.match(r.detalle, /pedía el envío a Oruro .* a Potosí/);
});

test("regla: desde Bs 300, vacío o dañado sin video del desempaque gana el vendedor; con video, se compara el peso", () => {
  const sin = reglaDelReclamo({ ...enviado, dispute_reason: "Llegó vacío o con otro producto", price_bs_cents: 45000 }, ahora);
  assert.equal(sin.criterio, 2);
  assert.equal(sin.gana, "vendedor");
  const con = reglaDelReclamo({ ...enviado, dispute_reason: "Dañado o distinto a lo descrito", dispute_video: "https://x/v.mp4" }, ahora);
  assert.equal(con.criterio, 3);
  assert.equal(con.gana, null);
  assert.match(con.detalle, /0\.4 kg/);
});

test("regla: bajo Bs 300 el video es opcional, así que sin video no gana nadie todavía; desde Bs 300, el vendedor", async () => {
  const { evidenciaPedida, VIDEO_OBLIGATORIO_DESDE_BS_CENTS } = await import("../src/lib/comprador.ts");
  const motivo = "Llegó vacío o con otro producto";
  // Bs 299: la app le dijo al comprador que el video era opcional.
  assert.equal(evidenciaPedida(motivo, 29900).video, "opcional");
  const bajo = reglaDelReclamo({ ...enviado, dispute_reason: motivo, price_bs_cents: 29900 }, ahora);
  assert.equal(bajo.gana, null);
  assert.equal(bajo.criterio, 2);
  assert.match(bajo.detalle, /Bajo Bs 300 el video es opcional/);
  assert.match(bajo.detalle, /decide con la foto del paquete cerrado, el peso \(0\.4 kg\) y la respuesta del vendedor/);
  // Bs 300: el video era obligatorio; sin video, gana el vendedor.
  assert.equal(evidenciaPedida(motivo, 30000).video, "obligatorio");
  assert.equal(reglaDelReclamo({ ...enviado, dispute_reason: motivo, price_bs_cents: 30000 }, ahora).gana, "vendedor");
  // Un solo umbral para el comprador, el servidor y el revisor.
  assert.equal(VIDEO_OBLIGATORIO_DESDE_BS_CENTS, 30000);
});

test("regla: no llegó y presión para confirmar piden comprobar la guía con la empresa", () => {
  for (const motivo of ["No llegó", "Presión para confirmar"]) {
    const r = reglaDelReclamo({ ...enviado, dispute_reason: motivo }, ahora);
    assert.equal(r.criterio, 1);
    assert.equal(r.gana, null);
    assert.match(r.detalle, /Bolívar \(encomiendas\), guía OLVA-55821/);
  }
  assert.match(reglaDelReclamo({ ...enviado, dispute_reason: "Presión para confirmar" }, ahora).detalle, /le pidieron confirmar/);
});

test("regla: si el vendedor no responde en 48 h, el comprador recupera todo su pago", () => {
  const tarde = { ...enviado, dispute_reason: "Llegó vacío o con otro producto", disputed_at: ahora - 49 * hora };
  const r = reglaDelReclamo(tarde, ahora);
  assert.equal(r.criterio, null);
  assert.equal(r.gana, "comprador");
  // Respondió a tiempo: vuelve a los criterios.
  assert.equal(reglaDelReclamo({ ...tarde, seller_reply: "Adjunto la guía" }, ahora).criterio, 2);
  // Si el reclamo lo abrió el vendedor, no corre contra él.
  assert.equal(reglaDelReclamo({ ...tarde, dispute_by: "vendedor" }, ahora).criterio, 2);
});

test("plazos: 48 h para responder y agregar evidencia, 72 h para decidir", () => {
  const p = plazosDelReclamo({ ...enviado, disputed_at: ahora - 50 * hora, seller_reply: null, dispute_photo: "https://x/f.jpg" }, ahora);
  assert.deepEqual(
    p.map((x) => [x.clave, x.hasta - (ahora - 50 * hora), x.hecho, x.vencido]),
    [
      ["vendedor", 48 * hora, false, true],
      ["comprador", 48 * hora, true, false],
      ["revisor", 72 * hora, false, false],
    ],
  );
  assert.equal(p[0].texto, "El vendedor responde");
  assert.equal(plazosDelReclamo({ ...enviado, dispute_by: "vendedor" }, ahora)[0].texto, "El comprador responde");
  assert.deepEqual(plazosDelReclamo({ status: "en_disputa" }, ahora), []);
});

test("evidencia de las partes: guía y paquete del vendedor, foto y video del comprador, sin repetir", () => {
  const h = "a".repeat(64);
  const rows = [
    { id: 1, actor: "vendedor", kind: "envio", created_at: 1, data_json: JSON.stringify({ photo: `http://x/api/evidencia/${h}.jpg`, photoGuia: "http://x/api/evidencia/g.jpg" }) },
    { id: 2, actor: "comprador", kind: "reclamo", created_at: 2, data_json: JSON.stringify({ photo: "https://x/f.png", video: "https://x/v.mp4" }) },
    { id: 3, actor: "comprador", kind: "reclamo", created_at: 3, data_json: JSON.stringify({ photo: "https://x/f.png", video: "" }) },
    { id: 4, actor: "vendedor", kind: "respuesta", created_at: 4, data_json: JSON.stringify({ text: "hola" }) },
    { id: 5, actor: "vendedor", kind: "envio", created_at: 5, data_json: "no es json" },
  ];
  const e = evidenciaDeLasPartes(rows);
  assert.deepEqual(
    e.vendedor.map((a) => [a.etiqueta, a.tipo]),
    [
      ["Foto de la guía", "foto"],
      ["Foto del paquete", "foto"],
    ],
  );
  assert.deepEqual(
    e.comprador.map((a) => [a.etiqueta, a.url]),
    [
      ["Foto del paquete", "https://x/f.png"],
      ["Video del desempaque", "https://x/v.mp4"],
    ],
  );
});
