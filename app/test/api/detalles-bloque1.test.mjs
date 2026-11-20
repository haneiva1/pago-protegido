// Arreglos chicos que un revisor encuentra rápido. `npm run test:api`.
// - Un producto de nombre largo daba un slug con "--", y el verificador del bot decía que el link genuino no era de Trato.
// - La clave del revisor (reparte la plata en disputa) se comparaba con !== y sin límite de intentos.
// - El criterio público "sin video de desempaque, gana el vendedor" no decía que rige desde Bs 300.
// - La plantilla de despliegue traía los contratos v1, retirados.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

process.env.ARBITRO_PANEL_KEY = "clave-del-revisor-de-prueba-larga";
const { llamar, nuevoLink, src } = await import("./entorno.mjs");
const { reiniciarLimites } = await import(src("lib/server/limite.ts"));
const { CRITERIOS } = await import(src("lib/revisor.ts"));
const { VIDEO_OBLIGATORIO_DESDE_BS_CENTS } = await import(src("lib/comprador.ts"));
const { DEPLOYED, RETIRED_V1 } = await import(src("lib/server/config.ts"));

// Mismo patrón que bot/src/engine/links.ts (SLUG_RE): hasta 4 palabras y el sufijo de 6 hex, sin guiones dobles.
const SLUG_DEL_BOT = /^(?=[a-z0-9-]{1,32}-[0-9a-f]{6}$)[a-z0-9]+(?:-[a-z0-9]+){0,3}-[0-9a-f]{6}$/;

test("un producto de nombre largo da un slug que el verificador del bot acepta", () => {
  for (const product of ["Chamarra impermeable montañismo talla M", "Celular Samsung Galaxy A35 128 GB", "Audífonos inalámbricos originales sellados"]) {
    const { slug } = nuevoLink({ product });
    assert.ok(!slug.includes("--"), `${product} → ${slug}`);
    assert.match(slug, SLUG_DEL_BOT, `${product} → ${slug}`);
  }
});

const panel = (clave) =>
  llamar("arbitro", { method: "GET", path: "/api/arbitro", headers: clave === undefined ? {} : { "x-arbitro-key": clave } });

test("la clave del revisor: la correcta entra, una equivocada da 401", async () => {
  reiniciarLimites();
  assert.equal((await panel(process.env.ARBITRO_PANEL_KEY)).status, 200);
  assert.equal((await panel("otra-clave")).status, 401);
  assert.equal((await panel("x")).status, 401, "una clave de otro largo no lanza");
  assert.equal((await panel(undefined)).status, 401);
});

test("después de 10 claves equivocadas en un minuto, la ruta del revisor responde 429", async () => {
  reiniciarLimites();
  for (let i = 0; i < 10; i++) assert.equal((await panel(`mala-${i}`)).status, 401);
  assert.equal((await panel("mala-11")).status, 429);
  // Los intentos correctos no se cuentan: el panel que se actualiza solo no se traba.
  reiniciarLimites();
  for (let i = 0; i < 20; i++) assert.equal((await panel(process.env.ARBITRO_PANEL_KEY)).status, 200);
});

test("el criterio público del video de desempaque dice desde cuánto rige", () => {
  assert.equal(VIDEO_OBLIGATORIO_DESDE_BS_CENTS, 30000);
  assert.match(CRITERIOS[2], /desde Bs 300/);
  for (const pagina of ["app/como-funciona/page.tsx", "app/revisor/page.tsx"]) {
    const texto = readFileSync(new URL(`../../src/${pagina}`, import.meta.url), "utf8");
    assert.match(texto, /sin video de desempaque \(desde Bs 300\), gana el vendedor/, pagina);
  }
});

test("la plantilla de despliegue apunta a los contratos actuales (v2), no a los retirados", () => {
  const env = readFileSync(new URL("../../../deploy/app.env.example", import.meta.url), "utf8");
  assert.match(env, new RegExp(`^PP_GUARDIAN_ID=${DEPLOYED.guardian}$`, "m"));
  assert.match(env, new RegExp(`^PP_ARBITER_ID=${DEPLOYED.arbiter}$`, "m"));
  assert.ok(!env.includes(RETIRED_V1.guardian) && !env.includes(RETIRED_V1.arbiter));
});
