import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import type { OutMsg } from "../src/engine/messages.ts";
import { GraphError, GraphSender, createWebhookServer, graphPayload, parseStatuses, parseWebhook, validSignature, verifyChallenge } from "../src/transports/whatsapp.ts";

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
      { from: "59171234567", id: "wamid.5", type: "image", image: { id: "x", caption: "vendo polera 120 bs" }, timestamp: "1800000000" },
      { from: "59171234567", id: "wamid.6", type: "reaction", reaction: { emoji: "👍" } },
    ]);
    expect(parseWebhook(body)).toEqual([
      { id: "wamid.1", from: "59171234567", text: "vendo polera 120 bs", name: "Doña Rosa" },
      { id: "wamid.2", from: "59171234567", text: "3 días", name: "Doña Rosa" },
      { id: "wamid.3", from: "59171234567", text: "mis ventas", name: "Doña Rosa" },
      { id: "wamid.4", from: "59171234567", text: "", name: "Doña Rosa", noLegible: true },
      { id: "wamid.5", from: "59171234567", text: "vendo polera 120 bs", name: "Doña Rosa", at: 1_800_000_000_000 },
    ]);
    expect(parseWebhook({ entry: [{ changes: [{ value: { statuses: [{ status: "read" }] } }] }] })).toEqual([]);
  });

  it("ignora los mensajes a otros números de la misma cuenta", () => {
    const body = hook([{ from: "59171234567", id: "wamid.1", type: "text", text: { body: "hola" } }]);
    (body.entry[0].changes[0].value as Record<string, unknown>).metadata = { phone_number_id: "222" };
    expect(parseWebhook(body, "111")).toEqual([]);
    expect(parseWebhook(body, "222")).toHaveLength(1);
  });

  it("sin teléfono (nombre de usuario): usa el ID de la persona y le contesta por `recipient`", () => {
    const body = { entry: [{ changes: [{ value: { contacts: [{ user_id: "BO.13491208655302741918", profile: { name: "Rosa", username: "rosa" } }], messages: [{ from_user_id: "BO.13491208655302741918", id: "w1", type: "text", text: { body: "hola" } }] } }] }] };
    expect(parseWebhook(body)).toEqual([{ id: "w1", from: "BO.13491208655302741918", text: "hola", name: "Rosa" }]);
    expect(graphPayload("BO.13491208655302741918", { text: "x" })).toEqual({ messaging_product: "whatsapp", recipient_type: "individual", recipient: "BO.13491208655302741918", type: "text", text: { body: "x", preview_url: true } });
  });

  it("lee los estados de envío con su error", () => {
    const body = { entry: [{ changes: [{ value: { statuses: [{ id: "w1", status: "delivered", recipient_id: "591" }, { id: "w2", status: "failed", recipient_id: "591", errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "24 h" } }] }] } }] }] };
    expect(parseStatuses(body)).toEqual([
      { id: "w1", status: "delivered", to: "591" },
      { id: "w2", status: "failed", to: "591", code: 131047, detalle: "24 h" },
    ]);
  });

  it("reintenta lo pasajero y no insiste con lo permanente", async () => {
    const probar = async (respuestas: (Response | Error)[]) => {
      let n = 0;
      const fetchFn = (async () => {
        const r = respuestas[n++];
        if (r instanceof Error) throw r;
        return r;
      }) as unknown as typeof fetch;
      const g = new GraphSender({ token: "t", phoneNumberId: "1", fetchFn, reintentosMs: [1, 1] });
      const r = await g.send("591", { text: "x" }).catch((e: unknown) => e);
      return { n, r };
    };
    const err = (status: number, code: number) => new Response(JSON.stringify({ error: { code, message: "m", error_data: { details: "d" } } }), { status });
    const ok = () => new Response('{"messages":[{"id":"wamid.ok"}]}');
    expect(await probar([err(503, 2), new TypeError("fetch failed"), ok()])).toEqual({ n: 3, r: "wamid.ok" });
    expect((await probar([err(400, 130429), ok()])).n).toBe(2);
    const p = await probar([err(400, 131030)]);
    expect(p.n).toBe(1);
    expect(p.r).toBeInstanceOf(GraphError);
    expect((p.r as GraphError).code).toBe(131030);
    expect((await probar([err(401, 190)])).n).toBe(1);
    expect((await probar([new DOMException("timeout", "TimeoutError")])).n).toBe(1); // Meta puede haberlo recibido
  });

  it("valida la firma X-Hub-Signature-256", () => {
    const raw = Buffer.from('{"a":1}');
    const sig = "sha256=" + createHmac("sha256", "app-secret").update(raw).digest("hex");
    expect(validSignature(raw, sig, "app-secret")).toBe(true);
    expect(validSignature(raw, sig, "otro-secret")).toBe(false);
    expect(validSignature(raw, undefined, "app-secret")).toBe(false);
    const sinClave = "sha256=" + createHmac("sha256", "").update(raw).digest("hex");
    expect(validSignature(raw, sinClave, "")).toBe(false);
  });

  it("arma texto y botones interactivos dentro de los límites de WhatsApp", () => {
    expect(graphPayload("591", { text: "hola" })).toEqual({ messaging_product: "whatsapp", recipient_type: "individual", to: "591", type: "text", text: { body: "hola", preview_url: true } });
    const m: OutMsg = { text: "¿Días?", buttons: [1, 2, 3, 4].map((i) => ({ id: `${i} días`, title: `Un título largo de más ${i}` })) };
    const p = graphPayload("591", m);
    expect(p.type).toBe("interactive");
    expect(p.interactive.action.buttons).toHaveLength(3);
    expect(p.interactive.action.buttons[0]).toEqual({ type: "reply", reply: { id: "1 días", title: "Un título largo de m" } });
  });

  it("atiende a cada persona en orden, entrega lo guardado después de contestar y rechaza cuerpos enormes", async () => {
    const pasos: string[] = [];
    const server = createWebhookServer({
      verifyToken: "vt",
      appSecret: "s3",
      handle: async (_f, text) => {
        await new Promise((r) => setTimeout(r, text === "uno" ? 40 : 0));
        return [{ text }];
      },
      send: async (_to, m) => void pasos.push(m.text),
      onInbound: (m) => void pasos.push(`entra ${m.text || "audio"}`),
      onHandled: async () => void pasos.push("guardados"),
      noLegible: () => [{ text: "solo texto" }],
    });
    await new Promise<void>((r) => server.listen(0, r));
    const url = `http://localhost:${(server.address() as AddressInfo).port}/webhook`;
    const post = (raw: string) => fetch(url, { method: "POST", headers: { "x-hub-signature-256": "sha256=" + createHmac("sha256", "s3").update(raw).digest("hex") }, body: raw });
    const de = (id: string, text: string) => JSON.stringify(hook([text ? { from: "59171234567", id, type: "text", text: { body: text } } : { from: "59171234567", id, type: "audio", audio: {} }]));
    try {
      await post(de("a", "uno"));
      await post(de("b", "dos"));
      await post(de("c", ""));
      await new Promise((r) => setTimeout(r, 120));
      expect(pasos).toEqual(["entra uno", "entra dos", "entra audio", "uno", "guardados", "dos", "guardados", "solo texto", "guardados"]);
      const enorme = await post("x".repeat(3_100_000)).then((r) => r.status, () => 413); // el servidor puede cortar antes de contestar
      expect(enorme).toBe(413);
      expect((await post("no es json")).status).toBe(200);
      expect((await post("null")).status).toBe(200);
    } finally {
      server.close();
    }
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
