// Simulador web: un chat que se ve como WhatsApp en un celular y usa el mismo motor que el bot real.
// Las respuestas y los avisos del poller llegan al navegador por Server-Sent Events.

import { readFileSync } from "node:fs";
import http from "node:http";
import type { OutMsg } from "../engine/messages.ts";
import { normPhone } from "../engine/parse.ts";

export interface ChatItem {
  id: number;
  phone: string;
  from: "yo" | "bot";
  text: string;
  buttons?: OutMsg["buttons"];
  at: number;
}

export interface SimulatorDeps {
  handle: (from: string, text: string) => Promise<OutMsg[]>;
  appUrl: string;
  sellerPhone: string;
  buyerPhone: string;
  /** Solo con la app de mentira (--mock): botones para simular lo que hace el comprador. */
  demo?: (action: string, sellerPhone: string) => Promise<string>;
}

const PAGE = readFileSync(new URL("./sim.html", import.meta.url), "utf8");

export function createSimulator(d: SimulatorDeps) {
  const history: ChatItem[] = [];
  const clients = new Set<http.ServerResponse>();
  let seq = 0;

  function push(phone: string, from: ChatItem["from"], m: OutMsg): ChatItem {
    const item: ChatItem = { id: ++seq, phone: normPhone(phone), from, text: m.text, buttons: m.buttons, at: Date.now() };
    history.push(item);
    if (history.length > 1000) history.shift();
    for (const c of clients) c.write(`data: ${JSON.stringify(item)}\n\n`);
    return item;
  }

  async function readJson(req: http.IncomingMessage): Promise<Record<string, string>> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return {};
    }
  }

  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return void res.end(PAGE);
    }
    if (req.method === "GET" && url.pathname === "/api/config") {
      return json(res, 200, { appUrl: d.appUrl, sellerPhone: normPhone(d.sellerPhone), buyerPhone: normPhone(d.buyerPhone), demo: !!d.demo });
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      for (const item of history) res.write(`data: ${JSON.stringify(item)}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/send") {
      const { phone, text } = await readJson(req);
      if (!phone || !text?.trim()) return json(res, 400, { error: "Falta el número o el texto" });
      push(phone, "yo", { text: text.trim() });
      const replies = await d.handle(phone, text.trim());
      for (const r of replies) push(phone, "bot", r);
      return json(res, 200, { replies });
    }
    if (req.method === "POST" && url.pathname === "/api/demo" && d.demo) {
      const { action } = await readJson(req);
      try {
        return json(res, 200, { ok: true, result: await d.demo(action, d.sellerPhone) });
      } catch (e) {
        return json(res, 400, { error: e instanceof Error ? e.message : String(e) });
      }
    }
    res.statusCode = 404;
    res.end("Not found");
  });

  return {
    server,
    history,
    /** Transporte de avisos: el poller manda por aquí. */
    send: async (to: string, m: OutMsg) => void push(to, "bot", m),
  };
}
