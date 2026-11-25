// Punto de entrada.
//   npm run sim        simulador web (http://localhost:3030) contra PP_APP_URL
//   npm run sim:demo   simulador + app de mentira (sin la app ni testnet)
//   npm start          WhatsApp real: webhook de WhatsApp Cloud API (PORT, por defecto 3040). Ver docs/WHATSAPP.md

import { HttpAppClient } from "./app/client.ts";
import { comprobarApp } from "./app/comprobar.ts";
import { Bot } from "./bot.ts";
import { loadConfig, problemasWhatsapp } from "./config.ts";
import { msg, usarRed, type OutMsg } from "./engine/messages.ts";
import { DEMO_BUYER_PHONE, DEMO_SELLER, startMockApp, type DemoAction } from "./mock/app-mock.ts";
import { Outbox, type AvisoMeta } from "./notify/outbox.ts";
import { Poller } from "./notify/poller.ts";
import { ReportStore } from "./reports.ts";
import { estadoDe, guardarEstado, leerEstado, type Saved } from "./state.ts";
import { apiKapso, lectorKapso } from "./transports/kapso.ts";
import { createSimulator } from "./transports/simulator.ts";
import { GraphError, GraphSender, createWebhookServer, pista } from "./transports/whatsapp.ts";

const args = new Set(process.argv.slice(2));
const cfg = loadConfig();
const useMock = args.has("--mock");
const useSim = args.has("--sim") || !args.has("--whatsapp");

usarRed(cfg.red);
if (!useSim) {
  const problemas = problemasWhatsapp(cfg, { mock: useMock });
  if (problemas.length) {
    console.error("El bot de WhatsApp no puede arrancar (docs/WHATSAPP.md):");
    for (const p of problemas) console.error(`  - ${p}`);
    process.exit(1);
  }
}

let apiUrl = cfg.appUrl;
let publicUrl = cfg.publicUrl;
let mock: Awaited<ReturnType<typeof startMockApp>> | undefined;
// Modo demo: una "hora" de los recordatorios dura un minuto.
const unitMs = cfg.demoMinutes ? 60_000 : 3_600_000;
if (useMock) {
  mock = await startMockApp({
    port: cfg.mockPort,
    botKey: cfg.botKey || undefined,
    // En modo demo, los plazos de la app de mentira también se escalan: despacho = días × 24 minutos,
    // revisión desde el envío = (días + 3) × 24 minutos.
    shipMs: cfg.demoMinutes ? (d) => d * 24 * unitMs : undefined,
    inspectMs: cfg.demoMinutes ? (d) => (d + 3) * 24 * unitMs : undefined,
  });
  apiUrl = publicUrl = mock.url;
  console.log(`App de mentira en ${mock.url} (tienda "${DEMO_SELLER.store_name}", WhatsApp +${DEMO_SELLER.whatsapp})`);
}

const client = new HttpAppClient(apiUrl, cfg.botKey);
if (!useSim) {
  try {
    await comprobarApp(client, cfg.red);
  } catch (e) {
    console.error(`El bot de WhatsApp no puede arrancar (docs/WHATSAPP.md): ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

// Estado persistente (avisos, ventanas de 24 horas y números vinculados). Con la app de mentira o BOT_STATE_FILE="", solo en memoria.
const stateFile = useMock ? "" : cfg.stateFile;
const instancia = `${cfg.red}|${publicUrl}`;
const saved: Saved = estadoDe(leerEstado(stateFile), instancia);
const persist = () =>
  guardarEstado(stateFile, {
    instancia,
    poller: poller.state,
    phoneLinks: Object.fromEntries(bot.phoneLinks),
    greeted: [...bot.greeted],
    outbox: outbox ? outbox.state : saved.outbox,
  });

let outbox: Outbox | undefined;
let send: (to: string, m: OutMsg, meta: AvisoMeta) => Promise<void>;

const poller = new Poller({
  client,
  appUrl: publicUrl,
  send: (to, m, meta) => send(to, m, meta),
  reminderHours: cfg.reminderHours,
  reminderUnitMs: unitMs,
  state: saved.poller,
  save: persist,
});

const bot = new Bot({
  client,
  appUrl: publicUrl,
  phoneLinks: new Map(Object.entries(saved.phoneLinks ?? {})),
  onPhoneLinked: persist,
  onOrderSeen: (o, phone) => poller.track(o, phone),
  // Auténticos: los links al dominio exacto de la app (API y pública, que puede ser un túnel).
  canonicalHosts: [apiUrl, publicUrl],
  reports: new ReportStore(cfg.reportsFile),
  greeted: new Set(saved.greeted ?? []),
  onGreeted: persist,
  ...(useSim
    ? {}
    : {
        ventana24h: true,
        pendientes: (phone: string) => outbox?.pendientesDe(phone) ?? 0,
        compras: (phone: string) => poller.comprasDe(phone),
        refrescar: () => poller.tick(),
      }),
});
const handle = (from: string, text: string) => bot.handle(from, text);

if (useSim) {
  const sim = createSimulator({
    handle,
    appUrl: publicUrl,
    sellerPhone: useMock ? DEMO_SELLER.whatsapp : cfg.simSellerPhone,
    buyerPhone: useMock ? DEMO_BUYER_PHONE : cfg.simBuyerPhone,
    demo: mock
      ? async (action, sellerPhone) => {
          const o = mock!.latestOf(sellerPhone);
          if (!o) throw new Error("Primero crea un link en el chat");
          let deadline: number | undefined;
          if (action === "recordar") {
            // Adelanta el reloj al próximo recordatorio (48 → 24 → 2 h, o minutos en modo demo).
            const left = (o.deadline ?? Infinity) - Date.now();
            const next = [...cfg.reminderHours].sort((a, b) => b - a).find((h) => h * unitMs < left - 1000);
            if (next == null) throw new Error("Ya no quedan recordatorios para este pedido");
            deadline = Date.now() + next * unitMs - 1000;
          }
          mock!.advance(o.slug, action as DemoAction, { deadline });
          await poller.tick(); // aviso inmediato, sin esperar la próxima vuelta
          return o.slug;
        }
      : undefined,
  });
  send = sim.send;
  sim.server.listen(cfg.simPort, () => console.log(`Simulador en http://localhost:${cfg.simPort} (app: ${publicUrl})`));
} else {
  const kapso = cfg.wa.proveedor === "kapso";
  const graph = new GraphSender(kapso ? { ...cfg.wa, token: "", intermediario: apiKapso(cfg.wa.kapso.apiKey), reintentosMs: [500, 2000, 5000] } : cfg.wa);
  const plantilla = cfg.wa.plantilla ? { name: cfg.wa.plantilla, lang: cfg.wa.plantillaLang } : null;
  const bandeja = (outbox = new Outbox({
    send: (to, m) => graph.send(to, m),
    anunciar: plantilla ? (to, params) => graph.template(to, plantilla, params) : undefined,
    state: saved.outbox,
    save: persist,
  }));
  send = (to, m, meta) => bandeja.avisar(to, m, meta);
  const server = createWebhookServer({
    handle,
    send: (to, m) => graph.send(to, m),
    // Kapso no hace la verificación GET ni firma con la clave de Meta: con Kapso, esas dos puertas quedan cerradas.
    verifyToken: kapso ? "" : cfg.wa.verifyToken,
    appSecret: kapso ? "" : cfg.wa.appSecret,
    phoneNumberId: cfg.wa.phoneNumberId,
    ...(kapso ? { lector: lectorKapso({ secreto: cfg.wa.kapso.webhookSecret, phoneNumberId: cfg.wa.phoneNumberId }) } : {}),
    onInbound: (m) => bandeja.entrante(m.from, m.at),
    onHandled: (from) => bandeja.entregar(from),
    onStatus: (s) => bandeja.estado(s),
    noLegible: () => [msg.soloTexto()],
  });
  server.listen(cfg.port, () => {
    console.log(`WhatsApp real: webhook en el puerto ${cfg.port}, ruta /webhook (${cfg.red}, app: ${publicUrl})`);
    if (kapso) console.log("Proveedor: Kapso (WA_PROVIDER=kapso)");
    console.log(plantilla ? `Fuera de las 24 horas: plantilla "${plantilla.name}" (${plantilla.lang})` : "Fuera de las 24 horas: los avisos esperan a que la persona escriba");
  });
  // Solo informa: si Meta no responde, el webhook igual tiene que estar arriba.
  graph
    .numero()
    .then((n) => console.log(`Número de WhatsApp: ${n}`))
    .catch((e) => console.error(`[whatsapp] ${kapso ? "Kapso" : "Meta"} no confirmó el número:`, e instanceof Error ? e.message : e, pista(e instanceof GraphError ? e.code : undefined)));

  const reloj = setInterval(() => void bandeja.vuelta().catch((e) => console.error("[avisos]", e)), cfg.pollMs);
  const cerrar = () => {
    clearInterval(reloj);
    poller.stop();
    persist();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.once("SIGTERM", cerrar);
  process.once("SIGINT", cerrar);
}

poller.start(cfg.pollMs);
console.log(`Avisos: revisando la app cada ${cfg.pollMs / 1000} s`);
