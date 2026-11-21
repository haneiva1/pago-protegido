// Tests unitarios de la lógica pura del comprador: `npm run test:unit` (node --test, sin dependencias).
import assert from "node:assert/strict";
import { test } from "node:test";
import { evidenciaPedida, fmtPlazo, linkAbrirEnChrome, motivosReclamo, navegadorInterno, plataforma, plazosDelPedido } from "../src/lib/comprador.ts";

test("registro público: 'bloqueado' solo mientras la plata sigue en el contrato, según el rol", async () => {
  const { textoRegistroPublico: t } = await import("../src/lib/comprador.ts");
  assert.match(t("pagado"), /Pago bloqueado.*volver a ti/);
  assert.match(t("enviado", "vendedor"), /Pago bloqueado.*ir a ti o volver al comprador/);
  assert.match(t("en_disputa"), /congelado por el reclamo/);
  assert.match(t("liberado"), /Pago liberado al vendedor/);
  assert.match(t("liberado", "vendedor"), /Pago liberado a ti/);
  assert.match(t("devuelto"), /Te devolvimos el pago/);
  assert.match(t("resuelto"), /repartió el pago/);
  for (const s of ["liberado", "devuelto", "resuelto"]) for (const r of ["comprador", "vendedor"]) assert.doesNotMatch(t(s, r), /bloqueado/);
});

test("flete: incluido, por pagar o aparte con monto; no cambia el pago", async () => {
  const { parseFlete, fmtFlete } = await import("../src/lib/comprador.ts");
  assert.equal(parseFlete("incluido"), "incluido");
  assert.equal(parseFlete("por_pagar"), "por_pagar");
  assert.equal(parseFlete("aparte", "25,5"), "aparte:25.5");
  assert.equal(parseFlete("aparte", ""), null);
  assert.equal(parseFlete("aparte", "-3"), null);
  assert.equal(parseFlete("gratis"), null);
  assert.equal(fmtFlete("por_pagar"), "Flete por pagar al recoger");
  assert.match(fmtFlete("aparte:25.5"), /más Bs 25,5, fuera de este pago/);
  assert.equal(fmtFlete(null), null);
});

test("flete final: el que fijó el vendedor en el link se conserva; si no fijó ninguno, queda el del comprador", async () => {
  const { fleteFinal } = await import("../src/lib/comprador.ts");
  assert.equal(typeof fleteFinal, "function");
  assert.equal(fleteFinal("incluido", "aparte:30"), "incluido");
  assert.equal(fleteFinal("aparte:25", "por_pagar"), "aparte:25");
  assert.equal(fleteFinal("por_pagar", null), "por_pagar");
  assert.equal(fleteFinal(null, "aparte:30"), "aparte:30");
  assert.equal(fleteFinal(undefined, "por_pagar"), "por_pagar");
  assert.equal(fleteFinal("", "incluido"), "incluido");
  assert.equal(fleteFinal(null, null), null);
});

test("reclamo guiado: motivos según el estado del pedido", () => {
  assert.deepEqual(motivosReclamo("pagado"), ["No envió"]);
  assert.deepEqual(motivosReclamo("enviado"), ["No llegó", "Llegó vacío o con otro producto", "Dañado o distinto a lo descrito"]);
  assert.deepEqual(motivosReclamo("liberado"), []);
  assert.deepEqual(motivosReclamo("en_disputa"), []);
});

test("reclamo guiado: evidencia pedida por motivo y precio (video obligatorio desde Bs 300, como el servidor)", () => {
  assert.equal(evidenciaPedida("No envió", 100000).video, "no");
  assert.equal(evidenciaPedida("No llegó", 100000).foto, "opcional");
  assert.equal(evidenciaPedida("Llegó vacío o con otro producto", 30000).video, "obligatorio");
  assert.equal(evidenciaPedida("Dañado o distinto a lo descrito", 29999).video, "opcional");
  assert.equal(evidenciaPedida("Dañado o distinto a lo descrito", 45000).foto, "pedida");
});

test("plazos: despacho y revisión del pedido (v2), con los valores por defecto", () => {
  assert.deepEqual(plazosDelPedido({ ship_secs: 120, inspect_secs: 120, delivery_days: 1 }), { despacho: 120, revision: 120 });
  assert.deepEqual(plazosDelPedido({ delivery_days: 3 }), { despacho: 3 * 86400, revision: 6 * 86400 });
  assert.deepEqual(plazosDelPedido({ window_secs: 600, delivery_days: 3 }), { despacho: 600, revision: 600 });
});

test("fmtPlazo: días y minutos en palabras", () => {
  assert.equal(fmtPlazo(86400), "1 día");
  assert.equal(fmtPlazo(6 * 86400), "6 días");
  assert.equal(fmtPlazo(120), "2 minutos");
  assert.equal(fmtPlazo(30), "1 minuto");
});

const UA = {
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; es_BO; es)",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0 Mobile Safari/537.36 Instagram 332.0.0.38.90 Android",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 12; moto g(30); wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/462.0.0.36.106;]",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/455.0.0.37.106;FBBV/1;FBDV/iPhone12,1;FBMD/iPhone;FBSN/iOS;FBSV/16.6]",
  messengerIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/450.0.0.38.109;FBBV/1]",
  messengerAndroid:
    "Mozilla/5.0 (Linux; Android 11; RMX2189; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/440.0.0.31.105;]",
  tiktokAndroid:
    "Mozilla/5.0 (Linux; Android 12; 22011119TI; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0 Mobile Safari/537.36 trill_340302 JsSdk/1.0 NetType/WIFI AppName/musical_ly app_version/34.3.2 ByteLocale/es",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 13; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  safariIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  whatsapp: "WhatsApp/2.24.20.80 A",
};

test("navegadorInterno: Facebook, Messenger, Instagram y TikTok; Chrome y Safari no", () => {
  assert.equal(navegadorInterno(UA.instagramIos), "Instagram");
  assert.equal(navegadorInterno(UA.instagramAndroid), "Instagram");
  assert.equal(navegadorInterno(UA.facebookAndroid), "Facebook");
  assert.equal(navegadorInterno(UA.facebookIos), "Facebook");
  assert.equal(navegadorInterno(UA.messengerIos), "Messenger");
  assert.equal(navegadorInterno(UA.messengerAndroid), "Messenger");
  assert.equal(navegadorInterno(UA.tiktokAndroid), "TikTok");
  assert.equal(navegadorInterno(UA.chromeAndroid), null);
  assert.equal(navegadorInterno(UA.safariIos), null);
  assert.equal(navegadorInterno(UA.whatsapp), null);
});

test("plataforma y link para abrir en Chrome (Android)", () => {
  assert.equal(plataforma(UA.facebookAndroid), "android");
  assert.equal(plataforma(UA.safariIos), "ios");
  assert.equal(plataforma("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)"), "otro");
  assert.equal(linkAbrirEnChrome("https://trato.example/p/zapatillas-ab12"), "intent://trato.example/p/zapatillas-ab12#Intent;scheme=https;package=com.android.chrome;end");
  assert.equal(linkAbrirEnChrome("http://localhost:3100/p/x"), "intent://localhost:3100/p/x#Intent;scheme=http;package=com.android.chrome;end");
  assert.equal(linkAbrirEnChrome("no-es-un-link"), null);
});

test("cuenta del comprador: si la carga del módulo falla, no queda guardada y se puede reintentar", async () => {
  const { cargaUnaVez, NO_CARGO_CUENTA } = await import("../src/lib/comprador.ts");
  assert.equal(NO_CARGO_CUENTA, "No pudimos cargar tu cuenta. Recarga la página.");
  let llamadas = 0;
  const cargar = cargaUnaVez(async () => {
    if (++llamadas === 1) throw new Error("Loading chunk 123 failed");
    return { ok: true };
  });
  await assert.rejects(cargar(), /Loading chunk/);
  assert.deepEqual(await cargar(), { ok: true });
  assert.deepEqual(await cargar(), { ok: true });
  assert.equal(llamadas, 2, "reintenta una vez después del error y después recuerda el módulo");
  // Dos pedidos a la vez comparten la misma carga.
  let n = 0;
  const otra = cargaUnaVez(async () => ++n);
  assert.deepEqual(await Promise.all([otra(), otra()]), [1, 1]);
});
