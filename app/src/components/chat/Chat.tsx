"use client";

import { useEffect, useRef, useState } from "react";
import { IconoCerrar, IconoMas, Nudo } from "@/components/iconos";
import { Progress, Spinner, type ProgressStep } from "@/components/ui";
import { horaChat, type Boton, type Mensaje } from "@/lib/chat";
import { IconoAtras, IconoCamara, IconoMicrofono, IconoTelefono, IconoVideo, IconoVistos } from "./iconos-chat";

/** Patrón sutil propio: el Nudo de Trato repetido, muy tenue sobre Sal (nada del fondo de WhatsApp). */
const PATRON = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="84" height="84" viewBox="0 0 84 84"><path d="M34 36 42 42.5 50 36v12L42 42.5 34 48Z" fill="rgba(10,42,27,0.045)"/></svg>',
)}")`;

/**
 * Pantalla de chat con la estructura y los gestos de una app de mensajería (encabezado con contacto, burbujas con
 * cola, hora y doble visto, separador de fecha, respuestas rápidas, barra de escribir), con la paleta de Trato.
 * El contacto es la cuenta de empresa "Trato", con el Nudo de avatar.
 */
export function Chat({
  mensajes,
  onBoton,
  pasos,
  ocupado,
  hoja,
  overlay,
  testId,
}: {
  mensajes: Mensaje[];
  onBoton: (id: string) => void;
  /** Pasos en curso (transacciones) para la burbuja que está "en curso". */
  pasos?: ProgressStep[];
  /** Alguna acción en curso: los botones se desactivan. */
  ocupado?: boolean;
  /** Hoja inferior (formularios reales): { titulo?, contenido, onCerrar }. */
  hoja?: { titulo?: string; contenido: React.ReactNode; onCerrar: () => void } | null;
  /** Vista a pantalla completa dentro del celular (p. ej. la página de pago). */
  overlay?: { titulo: string; contenido: React.ReactNode; onCerrar: () => void } | null;
  testId?: string;
}) {
  const { lista, escribiendo } = useEscribiendo(mensajes);
  const ref = useRef<HTMLDivElement>(null);
  const [cargas, setCargas] = useState(0);
  // Siempre al último mensaje: en cada mensaje nuevo, al cambiar sus botones y cuando termina de cargar una imagen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const abajo = () => {
      const ultimo = el.lastElementChild as HTMLElement | null;
      ultimo?.scrollIntoView({ block: "end" });
      el.scrollTop = el.scrollHeight;
    };
    abajo();
    const raf = requestAnimationFrame(abajo);
    const t = setTimeout(abajo, 120);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [lista.length, escribiendo, cargas, JSON.stringify(lista[lista.length - 1] ?? null)]);

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-sal text-monte" data-testid={testId}>
      <header className="sticky top-0 z-10 flex shrink-0 items-center gap-1 bg-monte px-1.5 py-2 text-sal">
        <span className="flex h-9 w-9 items-center justify-center" aria-hidden>
          <IconoAtras className="h-5 w-5" />
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sal" aria-hidden>
          <Nudo className="h-4 w-4 text-monte" />
        </span>
        <div className="ml-1 min-w-0 flex-1 leading-tight">
          <p className="truncate text-base font-semibold">Trato</p>
          <p className="truncate text-xs text-sal/70" data-testid="chat-estado">
            {escribiendo ? "escribiendo…" : "cuenta de empresa"}
          </p>
        </div>
        <span className="flex items-center gap-0.5 text-sal/80" aria-hidden>
          <span className="flex h-9 w-9 items-center justify-center">
            <IconoVideo className="h-5 w-5" />
          </span>
          <span className="flex h-9 w-9 items-center justify-center">
            <IconoTelefono className="h-5 w-5" />
          </span>
        </span>
      </header>

      <div ref={ref} className="flex-1 space-y-1.5 overflow-y-auto px-3 pb-5 pt-3" data-testid="chat-mensajes" style={{ backgroundImage: PATRON, backgroundSize: "84px 84px" }}>
        <p className="mx-auto w-fit rounded-lg bg-tinta-100 px-3 py-1 text-xs font-medium text-tinta-600">Hoy</p>
        {lista.map((m) => (
          <Burbuja key={m.id} m={m} pasos={m.enCurso ? pasos : undefined} ocupado={ocupado} onBoton={onBoton} onCarga={() => setCargas((n) => n + 1)} />
        ))}
        {escribiendo && (
          <div className="flex w-fit items-center gap-1 rounded-2xl rounded-tl-md bg-white px-3 py-2.5 shadow-[0_1px_1px_rgb(10_42_27/0.06)]" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-tinta-400 animate-latido" />
            <span className="h-1.5 w-1.5 rounded-full bg-tinta-400 animate-latido [animation-delay:200ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-tinta-400 animate-latido [animation-delay:400ms]" />
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 px-2 pb-2 pt-1">
        <span className="flex h-10 w-10 items-center justify-center text-tinta-600" aria-hidden>
          <IconoMas className="h-6 w-6" />
        </span>
        <div className="flex h-11 flex-1 items-center rounded-full bg-white px-4 text-base text-tinta-400 ring-1 ring-tinta-200">
          <span className="truncate">Mensaje</span>
        </div>
        <span className="flex h-10 w-10 items-center justify-center text-tinta-600" aria-hidden>
          <IconoCamara className="h-6 w-6" />
        </span>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-monte text-sal" aria-hidden>
          <IconoMicrofono className="h-5 w-5" />
        </span>
      </div>

      {hoja && (
        <div className="absolute inset-x-0 bottom-0 top-[52px] z-20 flex items-end bg-monte/45 animate-aparecer" role="dialog" aria-label={hoja.titulo ?? "Hoja"}>
          <div className="max-h-[90%] w-full overflow-y-auto rounded-t-panel bg-white px-4 pb-6 pt-2 shadow-alzada" data-testid="chat-hoja">
            <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-tinta-300" aria-hidden />
            <div className={`mb-1 flex items-center gap-2 ${hoja.titulo ? "justify-between" : "justify-end"}`}>
              {hoja.titulo && <h2 className="text-lg">{hoja.titulo}</h2>}
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-tinta-600 hover:bg-tinta-100" onClick={hoja.onCerrar} aria-label="Cerrar">
                <IconoCerrar className="h-5 w-5" />
              </button>
            </div>
            {hoja.contenido}
          </div>
        </div>
      )}

      {overlay && (
        <div className="absolute inset-0 z-30 flex flex-col bg-sal animate-aparecer" role="dialog" aria-label={overlay.titulo} data-testid="chat-overlay">
          <div className="flex shrink-0 items-center gap-1 bg-monte px-1.5 py-2 text-sal">
            <button type="button" className="flex h-9 items-center gap-1 rounded-full pl-1.5 pr-3 text-sm font-semibold hover:bg-sal/10" onClick={overlay.onCerrar} data-testid="volver-al-chat">
              <IconoAtras className="h-5 w-5" />
              Volver al chat
            </button>
            <p className="ml-1 truncate text-sm text-sal/70">{overlay.titulo}</p>
          </div>
          <div className="min-h-0 flex-1">{overlay.contenido}</div>
        </div>
      )}
    </div>
  );
}

/** Los mensajes nuevos del bot aparecen después de "escribiendo…" (700 ms), como en un chat real. */
function useEscribiendo(mensajes: Mensaje[]) {
  const [vistos, setVistos] = useState<Set<string>>(() => new Set(mensajes.map((m) => m.id)));
  const [escribiendo, setEscribiendo] = useState(false);
  const pendientes = mensajes.filter((m) => !vistos.has(m.id));
  useEffect(() => {
    if (!pendientes.length) return;
    const bot = pendientes.some((m) => m.de === "bot" && !m.sistema);
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setEscribiendo(bot && !reduce);
    const t = setTimeout(
      () => {
        setVistos((v) => new Set([...v, ...pendientes.map((m) => m.id)]));
        setEscribiendo(false);
      },
      bot && !reduce ? 700 : 0,
    );
    return () => clearTimeout(t);
  }, [pendientes.map((m) => m.id).join("|")]);
  // Lo que "yo" acabo de tocar se muestra al instante.
  const lista = mensajes.filter((m) => vistos.has(m.id) || m.de === "yo");
  return { lista, escribiendo };
}

/** *negrita* del bot → <strong>. */
function conNegritas(texto: string) {
  return texto.split(/(\*[^*]+\*)/g).map((t, i) => (t.startsWith("*") && t.endsWith("*") ? <strong key={i}>{t.slice(1, -1)}</strong> : <span key={i}>{t}</span>));
}

function Burbuja({ m, pasos, ocupado, onBoton, onCarga }: { m: Mensaje; pasos?: ProgressStep[]; ocupado?: boolean; onBoton: (id: string) => void; onCarga?: () => void }) {
  if (m.sistema)
    return (
      <p className="mx-auto max-w-[92%] rounded-lg bg-aviso-50 px-3 py-1.5 text-center text-xs text-aviso-700" data-testid="chat-sistema">
        {m.texto}
      </p>
    );
  const propio = m.de === "yo";
  const desconocido = m.de === "desconocido";
  return (
    <div className={`flex flex-col ${propio ? "items-end" : "items-start"} animate-aparecer`} data-testid={`chat-${m.id}`} data-de={m.de}>
      {desconocido && (
        <p className="mx-auto mb-1 w-fit rounded-lg bg-tinta-100 px-3 py-1 text-xs text-tinta-600">
          <span className="num">{m.desconocidoDe}</span> · no está en tus contactos
        </p>
      )}
      <div
        className={`relative max-w-[86%] rounded-2xl px-3 pb-1.5 pt-2 shadow-[0_1px_1px_rgb(10_42_27/0.06)] ${
          propio ? "rounded-tr-md bg-exito-100" : "rounded-tl-md bg-white"
        } ${desconocido ? "ring-1 ring-error-200" : ""}`}
      >
        <span
          aria-hidden
          className={`absolute top-0 h-0 w-0 border-t-[10px] ${propio ? "-right-2 border-l-[10px] border-l-transparent border-t-exito-100" : "-left-2 border-r-[10px] border-r-transparent border-t-white"}`}
        />
        {desconocido && <p className="mb-1 num text-sm font-semibold text-error-700">{m.desconocidoDe}</p>}
        {m.texto && (
          <p className="whitespace-pre-line text-[15px] leading-snug">
            {m.enCurso && <Spinner className="mr-1.5 inline-block h-4 w-4 align-[-3px] text-musgo" />}
            {conNegritas(m.texto)}
          </p>
        )}
        {m.enCurso && pasos && pasos.length > 0 && (
          <div className="mt-2 text-sm">
            <Progress steps={pasos} />
          </div>
        )}
        {m.tarjeta && (
          <a href={m.tarjeta.url} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl bg-tinta-50 ring-1 ring-tinta-200/80" data-testid="chat-tarjeta">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.tarjeta.imagen} alt="" className="aspect-[1200/630] w-full object-cover" onLoad={onCarga} />
            <span className="block px-3 py-2">
              <span className="block truncate text-sm font-semibold text-monte">{m.tarjeta.titulo}</span>
              <span className="mt-0.5 block truncate text-xs text-tinta-500">{m.tarjeta.dominio}</span>
            </span>
          </a>
        )}
        <span className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${propio ? "text-musgo" : "text-tinta-500"}`}>
          <span className="num">{horaChat(m.at)}</span>
          {propio && <IconoVistos className="h-4 w-4" />}
        </span>
        {m.botones && m.botones.length > 0 && (
          <div className="mt-2 space-y-1.5" data-testid="chat-botones">
            {m.botones.map((b) => (
              <BotonRapido key={b.id} b={b} ocupado={ocupado} onClick={() => onBoton(b.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BotonRapido({ b, ocupado, onClick }: { b: Boton; ocupado?: boolean; onClick: () => void }) {
  const off = Boolean(ocupado || b.deshabilitado);
  return (
    <>
    {b.principal && !off && (
      <span className="flex items-center gap-1.5 pl-1 text-xs font-semibold text-musgo" data-testid="toca-aqui" aria-hidden>
        <span className="h-2 w-2 rounded-full bg-yungas animate-latido" />
        Toca aquí
      </span>
    )}
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      data-testid={`chat-boton-${b.id}`}
      className={
        b.principal
          ? "btn-primary w-full py-3 text-base disabled:bg-tinta-200 disabled:text-tinta-600 disabled:opacity-100"
          : "flex w-full items-center justify-center rounded-control bg-white py-3 text-base font-semibold text-musgo ring-1 ring-tinta-200 transition-colors duration-150 hover:bg-tinta-50 disabled:opacity-50"
      }
    >
      {b.texto}
    </button>
    </>
  );
}
