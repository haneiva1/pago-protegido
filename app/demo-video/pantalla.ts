// Lo que el video de la demo (demo.spec.ts) inyecta en cada página que graba, y el escenario de las escenas de celular.
// Solo corre en los contextos del video: la app no cambia.

/** Subtítulos (solo en la pestaña, no en los marcos). Sobreviven a las navegaciones del mismo origen (sessionStorage). */
export function subtitulos() {
  if (window.top !== window) return;
  const KEY = "__pp_sub";
  const render = (text: string | null) => {
    let el = document.getElementById("pp-sub");
    if (!text) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "pp-sub";
      Object.assign(el.style, {
        zIndex: "2147483647",
        background: "rgba(15,23,42,.92)",
        color: "#fff",
        padding: "12px 22px",
        borderRadius: "14px",
        font: "600 22px/30px system-ui, -apple-system, 'Segoe UI', sans-serif",
        letterSpacing: "0",
        whiteSpace: "pre-line",
        textAlign: "center",
        width: "max-content",
        boxShadow: "0 10px 30px rgba(0,0,0,.35)",
        pointerEvents: "none",
      });
      // En el escenario de los celulares va al costado del celular; en el resto, abajo al centro.
      const slot = document.getElementById("pp-sub-slot");
      if (slot) {
        el.style.maxWidth = "100%";
        slot.appendChild(el);
      } else {
        Object.assign(el.style, { position: "fixed", left: "50%", bottom: "28px", transform: "translateX(-50%)", maxWidth: "90vw" });
        (document.body ?? document.documentElement).appendChild(el);
      }
    }
    el.textContent = text;
  };
  (window as unknown as { __ppSub: (t: string | null) => void }).__ppSub = (t) => {
    try {
      if (t) sessionStorage.setItem(KEY, t);
      else sessionStorage.removeItem(KEY);
    } catch {}
    render(t);
  };
  document.addEventListener("DOMContentLoaded", () => {
    try {
      render(sessionStorage.getItem(KEY));
    } catch {}
  });
}

/**
 * Sin "localhost" en pantalla (en todos los marcos): las URLs locales se cambian por una etiqueta neutra, sin inventar
 * un dominio. Solo toca el texto visible de los nodos (nunca los saca del DOM, para no romper React), no los href ni
 * los <script>.
 */
export function sinLocalhost(simOrigin: string) {
  const HAY = /localhost|127\.0\.0\.1/i;
  const URL_LOCAL = /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?((?:\/[^\s"'<>)]*)?)/gi;
  const RUTA = /^\/[^\s"'<>)]*/;
  const etiqueta = (ruta: string) =>
    ruta.startsWith("/p/")
      ? "trato · link de pago"
      : ruta.startsWith("/verificar")
        ? "trato · verificar"
        : ruta.startsWith("/tienda/")
          ? "trato · perfil de la tienda"
          : ruta.startsWith("/panel")
            ? "trato · panel del vendedor"
            : "trato";
  // React parte "{host}/verificar" en dos nodos de texto (y en el HTML del servidor los separa con un comentario).
  const vecino = (n: Node, siguiente: boolean): Text | null => {
    let s = siguiente ? n.nextSibling : n.previousSibling;
    while (s && s.nodeType === Node.COMMENT_NODE) s = siguiente ? s.nextSibling : s.previousSibling;
    return s && s.nodeType === Node.TEXT_NODE ? (s as Text) : null;
  };
  const pendientes = new WeakSet<Text>();
  // Nunca el código de la página: el payload de React (RSC) va en <script> y cambiarle el largo a un texto lo rompe.
  const NO_VISIBLE = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TEXTAREA", "TITLE"]);
  const arreglar = (n: Text) => {
    if (NO_VISIBLE.has(n.parentElement?.tagName ?? "")) return;
    const v = n.nodeValue ?? "";
    const previo = v.startsWith("/") ? vecino(n, false) : null;
    if (previo && pendientes.has(previo)) {
      const ruta = v.match(RUTA)![0];
      pendientes.delete(previo);
      previo.nodeValue = etiqueta(ruta);
      n.nodeValue = v.slice(ruta.length);
      return;
    }
    if (!HAY.test(v)) return;
    let pendiente = false;
    const nuevo = v.replace(URL_LOCAL, (m: string, ruta: string, i: number) => {
      if (!ruta && i + m.length === v.length) {
        const sig = vecino(n, true);
        const r = sig?.nodeValue?.match(RUTA);
        if (sig && r) {
          sig.nodeValue = sig.nodeValue!.slice(r[0].length);
          return etiqueta(r[0]);
        }
        pendiente = true;
      }
      return etiqueta(ruta || "/");
    });
    if (nuevo !== v) n.nodeValue = nuevo;
    if (pendiente) pendientes.add(n);
  };
  const recorrer = (raiz: Node) => {
    if (raiz.nodeType === Node.TEXT_NODE) return arreglar(raiz as Text);
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) arreglar(n as Text);
  };
  // Campos de texto con una URL local: se difuminan (no se puede cambiar su valor sin tocar el estado de React).
  const campos = () => {
    for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
      if (!HAY.test(el.value)) continue;
      el.dataset.ppOculto = "1";
      el.style.color = "transparent";
      el.style.textShadow = "0 0 9px rgba(15,23,42,.6)";
    }
  };
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === "characterData") arreglar(m.target as Text);
      else m.addedNodes.forEach(recorrer);
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  document.addEventListener("input", campos, true);
  (window as unknown as { __ppSinLocalhost: () => void }).__ppSinLocalhost = () => {
    if (document.body) recorrer(document.body);
    campos();
  };
  if (location.origin === simOrigin) {
    // Simulador del bot: sin la línea "App: http://localhost:…" y con el celular más bajo, para que el subtítulo no tape lo que se escribe.
    document.addEventListener("DOMContentLoaded", () => {
      const css = document.createElement("style");
      css.textContent = "#app-url{display:none!important}body{align-items:flex-start!important;padding-top:18px!important}.phone{max-height:calc(100vh - 150px)!important}";
      document.head.appendChild(css);
    });
  }
}

/** Un círculo donde se toca (los videos de Playwright no muestran el puntero). */
export function toques() {
  addEventListener(
    "pointerdown",
    (e) => {
      const d = document.createElement("div");
      Object.assign(d.style, {
        position: "fixed",
        left: `${e.clientX - 20}px`,
        top: `${e.clientY - 20}px`,
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        background: "rgba(16,185,129,.30)",
        border: "3px solid rgba(5,150,105,.85)",
        pointerEvents: "none",
        zIndex: "2147483646",
        transition: "transform .5s ease-out, opacity .5s ease-out",
      });
      document.documentElement.appendChild(d);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          d.style.transform = "scale(1.9)";
          d.style.opacity = "0";
        }),
      );
      setTimeout(() => d.remove(), 700);
    },
    true,
  );
}

/**
 * Escenario de las escenas de celular (1280x720): el celular, con la página real en un iframe del mismo origen, y al
 * costado quién es, qué hace y el subtítulo (#pp-sub-slot), en letra grande.
 */
export const escenarioHtml = (logo: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Trato</title><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1280px;height:720px;overflow:hidden}
body{display:flex;align-items:center;gap:56px;padding:0 64px 0 72px;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
  background:radial-gradient(1100px 680px at 12% 8%,#065f46 0%,#064e3b 38%,#0f172a 100%)}
.lado{flex:1;align-self:stretch;position:relative;display:flex;flex-direction:column;justify-content:center;padding-bottom:130px}
.marca{position:absolute;top:34px;left:0;display:flex;align-items:center;gap:10px;font-size:22px;font-weight:800;opacity:.92}
.marca svg{width:30px;height:30px;display:block}
#rol{display:inline-block;width:fit-content;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);font-size:18px;font-weight:600}
#titulo{font-size:46px;font-weight:800;letter-spacing:-.8px;line-height:1.1;margin-top:20px}
#detalle{font-size:23px;line-height:1.4;opacity:.85;margin-top:12px;max-width:600px}
#pp-sub-slot{position:absolute;left:0;right:0;bottom:28px;display:flex;justify-content:center}
.telefono{flex:none;width:414px;height:690px;background:#0b0b0c;border-radius:48px;padding:12px;box-shadow:0 30px 70px rgba(0,0,0,.5),inset 0 0 0 2px #2b2b2e}
#celular{width:390px;height:666px;border:0;border-radius:36px;background:#f6f7f9;display:block}
</style></head><body>
<section class="lado"><div class="marca">${logo}Trato</div><span id="rol"></span><h1 id="titulo"></h1><p id="detalle"></p><div id="pp-sub-slot"></div></section>
<div class="telefono"><iframe id="celular" name="celular" title="Celular"></iframe></div>
</body></html>`;
