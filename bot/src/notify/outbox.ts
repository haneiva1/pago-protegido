// Bandeja de salida de WhatsApp: respeta la ventana de 24 horas de Meta (docs/WHATSAPP.md).
//
// Dentro de las 24 horas desde el último mensaje de la persona, los avisos salen como texto. Fuera de esa ventana Meta
// solo acepta plantillas aprobadas: el aviso queda guardado y sale apenas la persona escribe. Si hay plantilla
// (WA_TEMPLATE_AVISO), además se le manda para avisarle que tiene una novedad.

import type { OutMsg } from "../engine/messages.ts";
import { esBsuid, normPhone } from "../engine/parse.ts";
import { FUERA_DE_VENTANA, GraphError, corto, esPermanente, pista, type EstadoEnvio } from "../transports/whatsapp.ts";

export const VENTANA_MS = 24 * 3_600_000;
/** Margen: si falta menos que esto para que se cierre, se trata como cerrada. */
const MARGEN_MS = 60_000;
/** Un aviso guardado que nadie pidió se descarta a los 7 días. */
export const VENCE_MS = 7 * 24 * 3_600_000;
const ESPERA_MAX_MS = 10 * 60_000;

export interface AvisoMeta {
  slug: string;
  kind: string;
  papel: "vendedor" | "comprador";
  /** Código del pedido y resumen corto: son los dos datos de la plantilla. */
  code: string;
  resumen: string;
  /** Después de esta hora (ms) el aviso ya no sirve (un recordatorio vencido, por ejemplo). */
  vence?: number;
}

export interface Pendiente extends AvisoMeta {
  msg: OutMsg;
  vence: number;
  /** Ya se le avisó con la plantilla. */
  anunciado?: boolean;
  intentos: number;
  /** No se reintenta antes de esta hora (ms). */
  proximo: number;
}

export interface OutboxState {
  /** Teléfono → hora (ms) del último mensaje que mandó la persona. */
  ventanas: Record<string, number>;
  pendientes: Record<string, Pendiente[]>;
}

export interface OutboxDeps {
  send: (to: string, m: OutMsg) => Promise<string | undefined>;
  /** Manda la plantilla de aviso. Sin ella, los avisos fuera de la ventana solo esperan. */
  anunciar?: (to: string, params: string[]) => Promise<string | undefined>;
  now?: () => number;
  state?: OutboxState;
  save?: () => void;
}

export class Outbox {
  readonly state: OutboxState;
  private readonly now: () => number;
  private readonly colas = new Map<string, Promise<unknown>>();
  /** Avisos aceptados por Meta que todavía pueden fallar por el webhook `statuses`. */
  private readonly enVuelo = new Map<string, { to: string; msg: OutMsg; meta: AvisoMeta; intentos: number }>();

  constructor(private readonly d: OutboxDeps) {
    this.now = d.now ?? Date.now;
    this.state = { ventanas: { ...d.state?.ventanas }, pendientes: { ...d.state?.pendientes } };
  }

  private clave(to: string) {
    return esBsuid(to) ? to : normPhone(to);
  }

  /** La persona escribió: se abre (o se alarga) su ventana de 24 horas, desde la hora de su mensaje. */
  entrante(from: string, at: number = this.now()) {
    const k = this.clave(from);
    this.state.ventanas[k] = Math.max(this.state.ventanas[k] ?? 0, Math.min(at, this.now()));
    for (const [tel, t] of Object.entries(this.state.ventanas)) if (this.now() - t > VENTANA_MS) delete this.state.ventanas[tel];
    this.d.save?.();
  }

  abierta(to: string): boolean {
    const t = this.state.ventanas[this.clave(to)];
    return t != null && this.now() < t + VENTANA_MS - MARGEN_MS;
  }

  pendientesDe(to: string): number {
    return this.vigentes(this.clave(to)).length;
  }

  /** Manda el aviso, o lo guarda hasta que se pueda. Nunca lanza: un aviso que no sale no frena a los demás. */
  avisar(to: string, msg: OutMsg, meta: AvisoMeta): Promise<void> {
    const k = this.clave(to);
    return this.enSerie(k, async () => {
      // El aviso nuevo reemplaza a los que seguían esperando por el mismo pedido.
      this.quitar(k, (p) => p.slug === meta.slug && p.papel === meta.papel);
      const p: Pendiente = { ...meta, msg, vence: meta.vence ?? this.now() + VENCE_MS, intentos: 0, proximo: 0 };
      if (this.abierta(k)) await this.intentar(k, p);
      else {
        this.guardar(k, p);
        await this.anunciar(k, p);
      }
      this.d.save?.();
    });
  }

  /** Salen los avisos guardados de una persona que acaba de escribir. */
  entregar(to: string): Promise<void> {
    return this.vaciar(this.clave(to), true);
  }

  /** Reintenta los que fallaron por algo pasajero (con la ventana abierta) y descarta los vencidos. */
  async vuelta(): Promise<void> {
    for (const k of Object.keys(this.state.pendientes)) await this.vaciar(k, false);
  }

  /** Webhook `statuses`: Meta puede aceptar el mensaje y rechazarlo después (por ejemplo, por la ventana de 24 horas). */
  async estado(s: EstadoEnvio): Promise<void> {
    const v = this.enVuelo.get(s.id);
    if (s.status !== "failed") {
      if (s.status === "delivered" || s.status === "read") this.enVuelo.delete(s.id);
      return;
    }
    console.error(`[avisos] no se entregó a ${corto(v?.to ?? s.to ?? "")} (${s.code ?? "sin código"}):`, s.detalle ?? "", pista(s.code));
    if (!v) return;
    this.enVuelo.delete(s.id);
    await this.enSerie(v.to, async () => {
      const reemplazado = (this.state.pendientes[v.to] ?? []).some((p) => p.slug === v.meta.slug && p.papel === v.meta.papel);
      if (esPermanente(s.code) || reemplazado) return;
      await this.fallo(v.to, { ...v.meta, msg: v.msg, vence: v.meta.vence ?? this.now() + VENCE_MS, intentos: v.intentos + 1, proximo: 0 }, s.code);
      this.d.save?.();
    });
  }

  private vigentes(k: string): Pendiente[] {
    return (this.state.pendientes[k] ?? []).filter((p) => p.vence > this.now());
  }

  private vaciar(k: string, yaMismo: boolean): Promise<void> {
    return this.enSerie(k, async () => {
      const antes = this.state.pendientes[k] ?? [];
      if (!antes.length) return;
      const lista = this.vigentes(k);
      this.poner(k, [...lista]);
      let cambio = lista.length !== antes.length;
      for (const p of lista) {
        if (!this.abierta(k)) break;
        if (!yaMismo && p.proximo > this.now()) continue;
        this.quitar(k, (x) => x === p);
        cambio = true;
        await this.intentar(k, p);
      }
      if (cambio) this.d.save?.();
    });
  }

  private async intentar(k: string, p: Pendiente): Promise<void> {
    try {
      const id = await this.d.send(k, p.msg);
      if (!id) return;
      const { msg, intentos, proximo: _p, anunciado: _a, ...meta } = p;
      this.enVuelo.set(id, { to: k, msg, meta, intentos });
      if (this.enVuelo.size > 2000) this.enVuelo.delete(this.enVuelo.keys().next().value!);
    } catch (e) {
      const code = e instanceof GraphError ? e.code : undefined;
      console.error(`[avisos] no pude avisar a ${corto(k)} (${p.kind}):`, e instanceof Error ? e.message : e, pista(code));
      if (esPermanente(code)) return;
      await this.fallo(k, { ...p, intentos: p.intentos + 1 }, code);
    }
  }

  private async fallo(k: string, p: Pendiente, code?: number): Promise<void> {
    if (code === FUERA_DE_VENTANA) {
      delete this.state.ventanas[k];
      this.guardar(k, p);
      await this.anunciar(k, p);
      return;
    }
    this.guardar(k, { ...p, proximo: this.now() + Math.min(ESPERA_MAX_MS, 10_000 * 2 ** Math.min(10, p.intentos - 1)) });
  }

  /** Una plantilla por aviso. Si falla, el aviso sigue guardado. */
  private async anunciar(k: string, p: Pendiente): Promise<void> {
    if (!this.d.anunciar || p.anunciado) return;
    try {
      await this.d.anunciar(k, [p.code, p.resumen]);
      p.anunciado = true;
    } catch (e) {
      const code = e instanceof GraphError ? e.code : undefined;
      console.error(`[avisos] plantilla a ${corto(k)}:`, e instanceof Error ? e.message : e, pista(code));
    }
  }

  private guardar(k: string, p: Pendiente) {
    this.poner(k, [...(this.state.pendientes[k] ?? []), p]);
  }

  private poner(k: string, lista: Pendiente[]) {
    if (lista.length) this.state.pendientes[k] = lista;
    else delete this.state.pendientes[k];
  }

  private quitar(k: string, si: (p: Pendiente) => boolean) {
    this.poner(k, (this.state.pendientes[k] ?? []).filter((p) => !si(p)));
  }

  /** Una cosa por vez por persona: un mensaje que llega y una vuelta del reloj no mandan lo mismo dos veces. */
  private enSerie<T>(k: string, f: () => Promise<T>): Promise<T> {
    const r = (this.colas.get(k) ?? Promise.resolve()).then(f, f);
    this.colas.set(k, r);
    const listo = () => void (this.colas.get(k) === r && this.colas.delete(k));
    r.then(listo, listo);
    return r;
  }
}
