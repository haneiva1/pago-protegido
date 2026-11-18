// Punto de entrada.
//   npm run sim        simulador web (http://localhost:3030) contra PP_APP_URL
//   npm run sim:demo   simulador + app de mentira (sin la app ni testnet)
//   npm start          webhook de WhatsApp Cloud API (PORT, por defecto 3040)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { HttpAppClient } from "./app/client.ts";
import { Bot } from "./bot.ts";
import { loadConfig } from "./config.ts";
import type { OutMsg } from "./engine/messages.ts";
import { DEMO_BUYER_PHONE, DEMO_SELLER, startMockApp, type DemoAction } from "./mock/app-mock.ts";
import { Poller, type PollerState } from "./notify/poller.ts";
import { ReportStore } from "./reports.ts";
import { createSimulator } from "./transports/simulator.ts";
import { GraphSender, createWebhookServer } from "./transports/whatsapp.ts";

interface Saved {
  poller?: PollerState;
  phoneLinks?: Record<string, string>;
  greeted?: string[];
}

const args = new Set(process.argv.slice(2));
const cfg = loadConfig();
const useMock = args.has("--mock");
const useSim = args.has("--sim") || !args.has("--whatsapp");

let apiUrl = cfg.appUrl;
let publicUrl = cfg.publicUrl;
let mock: Awaited<ReturnType<typeof startMockApp>> | undefined;
// Modo demo: una "hora" de los recordatorios dura un minuto.
const unitMs = cfg.demoMinutes ? 60_000 : 3_600_000;
if (useMock) {
  mock = await startMockApp({
    port: cfg.mockPort,
    botKey: cfg.botKey || undefined,
    // En modo demo, el plazo de la app de mentira también se escala: (días + 3) × 24 minutos.
    windowMs: cfg.demoMinutes ? (d) => (d + 3) * 24 * unitMs : undefined,
  });
  apiUrl = publicUrl = mock.url;
  console.log(`App de mentira en ${mock.url} (tienda "${DEMO_SELLER.store_name}", WhatsApp +${DEMO_SELLER.whatsapp})`);
}

// Estado persistente (avisos ya enviados y números vinculados). Con la app de mentira o BOT_STATE_FILE="", solo en memoria.
const persistOn = !useMock && !!cfg.stateFile;
const saved: Saved = persistOn && existsSync(cfg.stateFile) ? JSON.parse(readFileSync(cfg.stateFile, "utf8")) : {};
const persist = () => {
  if (!persistOn) return;
  mkdirSync(dirname(cfg.stateFile), { recursive: true });
  writeFileSync(cfg.stateFile, JSON.stringify({ poller: poller.state, phoneLinks: Object.fromEntries(bot.phoneLinks), greeted: [...bot.greeted] }, null, 2));
};

const client = new HttpAppClient(apiUrl, cfg.botKey);
let send: (to: string, m: OutMsg) => Promise<void>;

const poller = new Poller({
  client,
  appUrl: publicUrl,
  send: (to, m) => send(to, m),
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
  const missing = (["token", "phoneNumberId", "verifyToken"] as const).filter((k) => !cfg.wa[k]);
  if (missing.length) {
    console.error("Faltan variables: WA_TOKEN, WA_PHONE_NUMBER_ID y WA_VERIFY_TOKEN (ver README).");
    process.exit(1);
  }
  const graph = new GraphSender(cfg.wa);
  send = (to, m) => graph.send(to, m);
  createWebhookServer({ handle, send, verifyToken: cfg.wa.verifyToken, appSecret: cfg.wa.appSecret || undefined }).listen(cfg.port, () =>
    console.log(`Webhook de WhatsApp en http://localhost:${cfg.port}/webhook (app: ${apiUrl})`),
  );
}

poller.start(cfg.pollMs);
console.log(`Avisos: revisando la app cada ${cfg.pollMs / 1000} s`);
