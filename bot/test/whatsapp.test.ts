import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import type { OutMsg } from "../src/engine/messages.ts";
import { GraphSender, createWebhookServer, graphPayload, parseWebhook, validSignature, verifyChallenge } from "../src/transports/whatsapp.ts";

const hook = (messages: object[]) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", contacts: [{ wa_id: "59171234567", profile: { name: "Doña Rosa" } }], messages } }] }],
});

describe("WhatsApp Cloud API", () => {
  it("GET de verificación: devuelve el challenge solo con el token correcto", () => {
    const q = (t: string) => new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": t, "hub.challenge": "1158201444" });
    expect(verifyChallenge(q("mi-token"), "mi-token")).toEqual({ status: 200, body: "1158201444" });
    expect(verifyChallenge(q("otro"), "mi-token").status).toBe(403);
    expect(verifyChallenge(q(""), "").status).toBe(403);
  });

  it("lee texto, botones interactivos y botones de plantilla; ignora estados", () => {
    const body = hook([
      { from: "59171234567", id: "wamid.1", type: "text", text: { body: "vendo polera 120 bs" } },
      { from: "59171234567", id: "wamid.2", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "3 días", title: "3 días" } } },
      { from: "59171234567", id: "wamid.3", type: "button", button: { payload: "mis ventas", text: "Mis ventas" } },
      { from: "59171234567", id: "wamid.4", type: "image", image: { id: "x" } },
    ]);
    expect(parseWebhook(body)).toEqual([
      { id: "wamid.1", from: "59171234567", text: "vendo polera 120 bs", name: "Doña Rosa" },
      { id: "wamid.2", from: "59171234567", text: "3 días", name: "Doña Rosa" },
      { id: "wamid.3", from: "59171234567", text: "mis ventas", name: "Doña Rosa" },
    ]);
    expect(parseWebhook({ entry: [{ changes: [{ value: { statuses: [{ status: "read" }] } }] }] })).toEqual([]);
  });

  it("valida la firma X-Hub-Signature-256", () => {
    const raw = Buffer.from('{"a":1}');
    const sig = "sha256=" + createHmac("sha256", "app-secret").update(raw).digest("hex");
    expect(validSignature(raw, sig, "app-secret")).toBe(true);
    expect(validSignature(raw, sig, "otro-secret")).toBe(false);
    expect(validSignature(raw, undefined, "app-secret")).toBe(false);
  });

  it("arma texto y botones interactivos dentro de los límites de WhatsApp", () => {
    expect(graphPayload("591", { text: "hola" })).toEqual({ messaging_product: "whatsapp", recipient_type: "individual", to: "591", type: "text", text: { body: "hola", preview_url: true } });
    const m: OutMsg = { text: "¿Días?", buttons: [1, 2, 3, 4].map((i) => ({ id: `${i} días`, title: `Un título largo de más ${i}` })) };
    const p = graphPayload("591", m);
    expect(p.type).toBe("interactive");
    expect(p.interactive.action.buttons).toHaveLength(3);
    expect(p.interactive.action.buttons[0]).toEqual({ type: "reply", reply: { id: "1 días", title: "Un título largo de m" } });
  });

  it("webhook end-to-end: responde 200, procesa una vez y contesta por la Graph API", async () => {
    const graphCalls: { url: string; auth: string; body: Record<string, unknown> }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      graphCalls.push({ url, auth: (init.headers as Record<string, string>).authorization, body: JSON.parse(String(init.body)) });
      return new Response('{"messages":[{"id":"wamid.out"}]}', { status: 200 });
    }) as unknown as typeof fetch;
    const graph = new GraphSender({ token: "TOKEN_DE_PRUEBA", phoneNumberId: "1234567890", version: "v23.0", fetchFn: fakeFetch });
    const server = createWebhookServer({
      verifyToken: "vt",
      appSecret: "s3",
      handle: async (_from, text) => [{ text: `eco: ${text}` }],
      send: (to, m) => graph.send(to, m),
    });
    await new Promise<void>((r) => server.listen(0, r));
    const base = `http://localhost:${(server.address() as AddressInfo).port}/webhook`;
    try {
      expect(await (await fetch(`${base}?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=42`)).text()).toBe("42");
      const raw = JSON.stringify(hook([{ from: "59171234567", id: "wamid.9", type: "text", text: { body: "hola" } }]));
      const sig = "sha256=" + createHmac("sha256", "s3").update(raw).digest("hex");
      const post = (s: string) => fetch(base, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": s }, body: raw });
      expect((await post("sha256=00")).status).toBe(401);
      expect((await post(sig)).status).toBe(200);
      expect((await post(sig)).status).toBe(200); // reintento de Meta: mismo wamid
      await new Promise((r) => setTimeout(r, 50));
      expect(graphCalls).toHaveLength(1);
      expect(graphCalls[0]).toMatchObject({
        url: "https://graph.facebook.com/v23.0/1234567890/messages",
        auth: "Bearer TOKEN_DE_PRUEBA",
        body: { to: "59171234567", type: "text", text: { body: "eco: hola", preview_url: true } },
      });
    } finally {
      server.close();
    }
  });
});
