// Ventana de 24 horas de WhatsApp: qué sale, qué espera y qué se descarta (src/notify/outbox.ts).
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Outbox, VENCE_MS, VENTANA_MS, type AvisoMeta, type OutboxState } from "../src/notify/outbox.ts";
import { estadoDe, guardarEstado, leerEstado } from "../src/state.ts";
import { GraphError } from "../src/transports/whatsapp.ts";

const TEL = "59171234567";
const meta = (kind = "pagado", extra: Partial<AvisoMeta> = {}): AvisoMeta => ({ slug: "polera-a1b2c3", kind, papel: "vendedor", code: "PP-4821", resumen: "tu cliente ya pagó", ...extra });

let clock: number;
let salidas: [string, string][];
let plantillas: [string, string[]][];
let falla: (() => Error | null) | null;

function armar(opts: { plantilla?: boolean; state?: OutboxState } = {}) {
  let n = 0;
  return new Outbox({
    now: () => clock,
    send: async (to, m) => {
      const e = falla?.();
      if (e) throw e;
      salidas.push([to, m.text]);
      return `wamid.${++n}`;
    },
    anunciar: opts.plantilla ? async (to, params) => (plantillas.push([to, params]), "wamid.t") : undefined,
    state: opts.state,
  });
}

beforeEach(() => {
  clock = 1_800_000_000_000;
  salidas = [];
  plantillas = [];
  falla = null;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("ventana de 24 horas", () => {
  it("quien nunca escribió no recibe nada: el aviso espera y sale cuando escribe", async () => {
    const o = armar();
    await o.avisar(TEL, { text: "aviso" }, meta());
    expect(salidas).toEqual([]);
    expect(o.pendientesDe(TEL)).toBe(1);
    o.entrante("+591 71234567", clock); // el mismo número, escrito de otra forma
    await o.entregar(TEL);
    expect(salidas).toEqual([[TEL, "aviso"]]);
    expect(o.pendientesDe(TEL)).toBe(0);
    await o.vuelta();
    expect(salidas).toHaveLength(1);
  });

  it("dentro de las 24 horas sale al toque; después, espera", async () => {
    const o = armar();
    o.entrante(TEL, clock);
    clock += VENTANA_MS - 3_600_000;
    await o.avisar(TEL, { text: "a tiempo" }, meta());
    expect(salidas).toEqual([[TEL, "a tiempo"]]);
    clock += 3_600_000;
    expect(o.abierta(TEL)).toBe(false);
    await o.avisar(TEL, { text: "tarde" }, meta("liberado"));
    expect(salidas).toHaveLength(1);
    expect(o.pendientesDe(TEL)).toBe(1);
  });

  it("la ventana cuenta desde la hora del mensaje, no desde que llegó: un webhook atrasado no la abre de más", () => {
    const o = armar();
    o.entrante(TEL, clock - VENTANA_MS - 1);
    expect(o.abierta(TEL)).toBe(false);
    o.entrante(TEL, clock + 999_999_999); // reloj adelantado de quien manda
    expect(o.state.ventanas[TEL]).toBe(clock);
  });

  it("con plantilla: avisa una sola vez por aviso, con el código y el resumen", async () => {
    const o = armar({ plantilla: true });
    await o.avisar(TEL, { text: "aviso" }, meta());
    expect(plantillas).toEqual([[TEL, ["PP-4821", "tu cliente ya pagó"]]]);
    await o.vuelta();
    await o.vuelta();
    expect(plantillas).toHaveLength(1);
    o.entrante(TEL);
    await o.entregar(TEL);
    expect(salidas).toEqual([[TEL, "aviso"]]);
  });

  it("el aviso nuevo del mismo pedido reemplaza al viejo, pero no el de la otra parte ni el de otro pedido", async () => {
    const o = armar();
    await o.avisar(TEL, { text: "pagado" }, meta());
    await o.avisar(TEL, { text: "enviado" }, meta("enviado_vendedor"));
    await o.avisar(TEL, { text: "te llegó" }, meta("te_llego", { papel: "comprador" }));
    await o.avisar(TEL, { text: "otro" }, meta("pagado", { slug: "gorra-d4e5f6" }));
    o.entrante(TEL);
    await o.entregar(TEL);
    expect(salidas.map(([, t]) => t)).toEqual(["enviado", "te llegó", "otro"]);
  });

  it("un recordatorio vencido o un aviso de más de 7 días ya no sale", async () => {
    const o = armar();
    await o.avisar(TEL, { text: "recordatorio" }, meta("recordatorio", { vence: clock + 1000, papel: "comprador" }));
    await o.avisar(TEL, { text: "viejo" }, meta());
    clock += 2000;
    expect(o.pendientesDe(TEL)).toBe(1);
    clock += VENCE_MS;
    o.entrante(TEL);
    await o.entregar(TEL);
    expect(salidas).toEqual([]);
    expect(o.state.pendientes).toEqual({});
  });
});

describe("errores de Meta", () => {
  it("131047 en el envío: cierra la ventana, guarda el aviso y manda la plantilla", async () => {
    const o = armar({ plantilla: true });
    o.entrante(TEL);
    falla = () => new GraphError(400, 131047, "Re-engagement message");
    await o.avisar(TEL, { text: "aviso" }, meta());
    expect(o.abierta(TEL)).toBe(false);
    expect(o.pendientesDe(TEL)).toBe(1);
    expect(plantillas).toHaveLength(1);
  });

  it("131047 que llega después, por el webhook de estados: igual", async () => {
    const o = armar();
    o.entrante(TEL);
    await o.avisar(TEL, { text: "aviso" }, meta());
    await o.estado({ id: "wamid.1", status: "failed", to: TEL, code: 131047 });
    expect(o.abierta(TEL)).toBe(false);
    expect(o.pendientesDe(TEL)).toBe(1);
    o.entrante(TEL);
    await o.entregar(TEL);
    expect(salidas).toHaveLength(2);
    // Entregado: un "failed" repetido ya no lo vuelve a encolar.
    await o.estado({ id: "wamid.2", status: "delivered", to: TEL });
    await o.estado({ id: "wamid.2", status: "failed", to: TEL, code: 131047 });
    expect(o.pendientesDe(TEL)).toBe(0);
  });

  it("lo pasajero (la credencial vencida, Meta caída) se reintenta con espera creciente, sin perder el aviso", async () => {
    const o = armar();
    o.entrante(TEL);
    let intentos = 0;
    falla = () => (intentos++, new GraphError(401, 190, "expired"));
    await o.avisar(TEL, { text: "aviso" }, meta());
    await o.vuelta(); // todavía no pasó la espera
    expect(intentos).toBe(1);
    clock += 10_000;
    await o.vuelta();
    expect(intentos).toBe(2);
    clock += 10_000;
    await o.vuelta(); // la segunda espera es de 20 s
    expect(intentos).toBe(2);
    falla = null;
    clock += 10_000;
    await o.vuelta();
    expect(salidas).toEqual([[TEL, "aviso"]]);
    expect(o.pendientesDe(TEL)).toBe(0);
  });

  it("131030 (no está entre los 5 números de prueba): se descarta y no se insiste", async () => {
    const o = armar();
    o.entrante(TEL);
    falla = () => new GraphError(400, 131030, "Recipient phone number not in allowed list");
    await o.avisar(TEL, { text: "aviso" }, meta());
    expect(o.pendientesDe(TEL)).toBe(0);
  });

  it("un aviso ya anunciado con la plantilla no la vuelve a mandar si Meta lo rechaza después", async () => {
    const o = armar({ plantilla: true });
    await o.avisar(TEL, { text: "aviso" }, meta());
    expect(plantillas).toHaveLength(1);
    o.entrante(TEL);
    falla = () => new GraphError(400, 131047, "Re-engagement message");
    await o.entregar(TEL);
    expect(plantillas).toHaveLength(1);
    expect(o.pendientesDe(TEL)).toBe(1);
  });

  it("si el aviso viejo falla mientras sale el nuevo, el viejo no llega después", async () => {
    const o = armar();
    o.entrante(TEL);
    let cual = 0;
    falla = () => (++cual === 1 ? new GraphError(503, 2, "caída") : null);
    await Promise.all([o.avisar(TEL, { text: "viejo" }, meta()), o.avisar(TEL, { text: "nuevo" }, meta("liberado"))]);
    clock += 60_000;
    await o.vuelta();
    expect(salidas.map(([, t]) => t)).toEqual(["nuevo"]);
    expect(o.pendientesDe(TEL)).toBe(0);
  });

  it("un mensaje que llega y una vuelta del reloj a la vez no mandan el aviso dos veces", async () => {
    const o = armar();
    await o.avisar(TEL, { text: "aviso" }, meta());
    o.entrante(TEL);
    await Promise.all([o.entregar(TEL), o.vuelta(), o.entregar(TEL)]);
    expect(salidas).toHaveLength(1);
  });
});

describe("estado guardado", () => {
  const archivo = () => join(mkdtempSync(join(tmpdir(), "bot-estado-")), "estado.json");

  it("los avisos y las ventanas sobreviven a un reinicio", async () => {
    const f = archivo();
    const o = armar();
    o.entrante("59176543210");
    await o.avisar(TEL, { text: "aviso" }, meta());
    guardarEstado(f, { instancia: "testnet|https://a", outbox: o.state });
    const o2 = armar({ state: estadoDe(leerEstado(f), "testnet|https://a").outbox });
    expect(o2.abierta("59176543210")).toBe(true);
    o2.entrante(TEL);
    await o2.entregar(TEL);
    expect(salidas).toEqual([[TEL, "aviso"]]);
  });

  it("al cambiar de instancia (testnet → mainnet) no se mezclan pedidos ni avisos; quedan solo las ventanas", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const saved = { instancia: "testnet|https://a", poller: { cursor: 1, orders: {} }, phoneLinks: { [TEL]: "G" }, greeted: [TEL], outbox: { ventanas: { [TEL]: 5 }, pendientes: { [TEL]: [] } } };
    expect(estadoDe(saved, "mainnet|https://b")).toEqual({ outbox: { ventanas: { [TEL]: 5 }, pendientes: {} } });
    expect(estadoDe({ greeted: [TEL] }, "testnet|https://a")).toEqual({ greeted: [TEL] }); // estado viejo, sin instancia
  });

  it("un archivo roto no tumba el arranque: queda aparte", () => {
    const f = archivo();
    writeFileSync(f, '{"poller":');
    expect(leerEstado(f)).toEqual({});
    expect(readFileSync(`${f}.roto`, "utf8")).toBe('{"poller":');
  });

  it("si no se puede escribir, sigue en memoria", () => {
    expect(() => guardarEstado("/dev/null/no/estado.json", {})).not.toThrow();
  });
});
