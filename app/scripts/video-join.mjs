#!/usr/bin/env node
// Arma el video de la demo v3: pago-protegido/demo/v3/trato-demo-v3.mp4 (1280x720, 30 fps, H.264, sin audio), en el
// orden del guion (app/demo-video/guion.json). Con PP_VIDEO_DIR se usa otra carpeta.
//   1. Clips de npm run demo:video (demo/v3/clips/NN-<escena>.webm y su NN-<escena>.subs.json): se normalizan a
//      1280x720 y se recortan desde que la escena está lista («inicio»).
//   2. Esperas a testnet: los tramos sin cambios (freezedetect) de más de LARGO s se aceleran, salvo el tiempo de
//      lectura de cada subtítulo (subs.json), que queda a velocidad normal. Lo acelerado lleva la pastilla «⏩ Acelerado».
//   3. Placas (portada, problema, Stellar, plan y cierre) desde HTML, con el subtítulo quemado (el ffmpeg local no
//      tiene drawtext ni subtitles) y una imagen por bloque de subtítulos. Duran la ventana del guion; si el total
//      pasa de VIDEO_MAX_S (180 s), se acortan hasta el tiempo de lectura de sus subtítulos. El cierre lleva los 3
//      hashes del flujo feliz (clips/hashes.json) y el link al repo.
//   4. Lámina de cuadros: demo/v3/lamina.png.
// En las placas se revisan las palabras prohibidas, que no diga "localhost" y que cada subtítulo ocupe 2 líneas o menos.
// Reproducible sin volver a grabar: npm run demo:video:join. Requiere ffmpeg/ffprobe.
import { chromium } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VIDEO = process.env.PP_VIDEO_DIR ? resolve(process.env.PP_VIDEO_DIR) : resolve(APP, "..", "demo", "v3");
const CLIPS = join(VIDEO, "clips");
const WORK = join(CLIPS, "work");
const OUT = join(VIDEO, "trato-demo-v3.mp4");
const SHEET = join(VIDEO, "lamina.png");
const MAX_S = Number(process.env.VIDEO_MAX_S || 180); // el video entero, con las placas
const REPO = "github.com/haneiva1/pago-protegido";
const W = 1280;
const H = 720;
const LARGO = 3; // tramos quietos más largos que esto se aceleran…
const INICIO = 1; // …salvo el primer segundo,
const COLA = 0.6; // los últimos 0,6 s
const MIN_CORTE = 0.8; // y los pedazos muy cortos.
const RAPIDO = 12; // velocidad mínima de lo acelerado;
const MAX_RAPIDO_S = 2.5; // si un tramo acelerado igual dura más que esto, se acelera más.
const NORM = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,fps=30,format=yuv420p`;
const ENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-an"];

const guion = JSON.parse(readFileSync(join(APP, "demo-video", "guion.json"), "utf8"));
const PROHIBIDAS = guion.prohibidas.map((s) => new RegExp(s, "i"));
const LOCALHOST = /localhost|127\.0\.0\.1/i;
const leer = (t) => Math.max(guion.lectura.min, guion.lectura.base + t.replace(/\n/g, " ").length / guion.lectura.cps);

const ff = (args) => execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
const dur = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout.trim());
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// 0) Escenas del guion: placas y clips (el de /probar es opcional: sin él, el video sale sin esa escena).
const archivos = existsSync(CLIPS) ? readdirSync(CLIPS) : [];
const escenas = [];
const faltan = [];
for (const e of guion.escenas) {
  if (e.tipo === "placa") {
    escenas.push({ ...e });
    continue;
  }
  const webm = archivos.find((f) => f.endsWith(`-${e.id}.webm`));
  if (!webm) {
    if (e.opcional) console.warn(`⚠️  Falta el clip «${e.id}» en ${CLIPS}: el video sale sin esa escena.`);
    else faltan.push(e.id);
    continue;
  }
  const subs = join(CLIPS, webm.replace(/\.webm$/, ".subs.json"));
  escenas.push({ ...e, webm: join(CLIPS, webm), meta: existsSync(subs) ? JSON.parse(readFileSync(subs, "utf8")) : { inicio: 0, subs: [] } });
}
if (faltan.length) {
  console.error(`Faltan clips (${faltan.join(", ")}) en ${CLIPS}. Corre primero: npm run demo:video`);
  process.exit(1);
}
if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
  console.log(`ffmpeg no está instalado. Los clips quedaron en ${CLIPS} (sin placas ni recortes).`);
  process.exit(0);
}
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const hashesFile = join(CLIPS, "hashes.json");
const hashes = existsSync(hashesFile) ? JSON.parse(readFileSync(hashesFile, "utf8")) : {};
if (!hashes.pago || !hashes.envio || !hashes.confirmacion) console.warn(`⚠️  Faltan hashes del flujo feliz en ${hashesFile}: el cierre muestra «—».`);

// 1–2) Clips: normalizar, recortar el arranque y acelerar las esperas sin tocar el tiempo de lectura.
function quietos(file, d) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-vf", "freezedetect=n=-45dB:d=1", "-map", "0:v", "-f", "null", "-"], { encoding: "utf8" });
  const desde = [...r.stderr.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const hasta = [...r.stderr.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return desde.map((s, i) => [s, hasta[i] ?? d]);
}
const restar = (tramos, [a, b]) => tramos.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [[x, Math.min(y, a)], [Math.max(x, b), y]])).filter(([x, y]) => y - x > 0.01);

const clips = escenas.filter((e) => e.tipo === "clip");
for (const c of clips) {
  c.norm = join(WORK, `${c.id}.norm.mp4`);
  c.out = join(WORK, `${c.id}.mp4`);
  ff(["-i", c.webm, "-vf", NORM, ...ENC, c.norm]);
  const d = dur(c.norm);
  const desde = Math.min(Math.max(0, (c.meta.inicio ?? 0) - 0.2), Math.max(0, d - 1));
  const lectura = (c.meta.subs ?? []).map((s) => [s.t - 0.2, s.t + s.read + 0.4]);
  const rapidos = [];
  for (const [qa, qb] of quietos(c.norm, d)) {
    if (qb - qa <= LARGO) continue;
    let tramos = [[Math.max(qa + INICIO, desde), qb - COLA]].filter(([x, y]) => y > x);
    for (const l of lectura) tramos = restar(tramos, l);
    rapidos.push(...tramos.filter(([x, y]) => y - x >= MIN_CORTE));
  }
  rapidos.sort((x, y) => x[0] - y[0]);
  const piezas = [];
  let t = desde;
  for (const [a, b] of rapidos) {
    if (a > t) piezas.push([t, a, 1]);
    piezas.push([a, b, Math.max(RAPIDO, (b - a) / MAX_RAPIDO_S)]);
    t = b;
  }
  if (t < d) piezas.push([t, d, 1]);
  c.piezas = piezas.filter(([a, b]) => b - a > 0.04);
  c.planeado = c.piezas.reduce((s, [a, b, v]) => s + (b - a) / v, 0);
}

// Placas y pastilla «acelerado», desde HTML.
const logo = readFileSync(join(APP, "src", "app", "icon.svg"), "utf8");
const CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{width:${W}px;height:${H}px;overflow:hidden;position:relative;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
  background:radial-gradient(1100px 680px at 12% 8%,#065f46 0%,#064e3b 38%,#0f172a 100%)}
.zona{position:absolute;left:96px;right:96px;top:44px;bottom:136px;display:flex;flex-direction:column;justify-content:center}
.centro{align-items:center;text-align:center}
.kicker{font-size:19px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6ee7b7}
h1{font-size:56px;font-weight:800;letter-spacing:-1.2px;line-height:1.08;margin-top:12px}
.oculto{opacity:0}
.tarjeta{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:22px;padding:22px 24px}
.marca{display:flex;align-items:center;gap:18px}
.logo svg{width:100%;height:100%;display:block}
.dato b{display:block;font-size:40px;font-weight:800;color:#6ee7b7;letter-spacing:-.5px}
.dato span{display:block;font-size:20px;line-height:1.4;margin-top:8px;opacity:.92}
.caja small{display:block;font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a7f3d0}
.caja b{display:block;font-size:32px;font-weight:800;margin-top:8px}
.caja span{display:block;font-size:19px;line-height:1.35;margin-top:6px;opacity:.9}
.stat{display:flex;align-items:center;gap:16px;padding:16px 20px;border-radius:18px;background:rgba(16,185,129,.14);border:1px solid rgba(110,231,183,.35)}
.stat b{font-size:46px;font-weight:800;color:#6ee7b7;min-width:58px;text-align:center}
.stat span{font-size:20px;line-height:1.3}
.paso{display:flex;align-items:center;gap:20px;font-size:30px;font-weight:700;padding:18px 24px}
.paso i{font-style:normal;flex:none;display:flex;align-items:center;justify-content:center;width:50px;height:50px;border-radius:50%;background:#10b981;color:#062e22;font-size:24px;font-weight:800}
.hash{display:flex;gap:18px;align-items:baseline;margin-top:6px}
.hash span{width:136px;font-size:17px;font-weight:600;color:#a7f3d0}
.hash code{font:500 17px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}
#sub{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);width:max-content;max-width:1150px;padding:12px 22px;border-radius:14px;
  background:rgba(15,23,42,.92);box-shadow:0 10px 30px rgba(0,0,0,.35);font:600 22px/30px system-ui,-apple-system,"Segoe UI",sans-serif;white-space:pre-line;text-align:center}`;
const pagina = (cuerpo, sub) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${cuerpo}${sub ? `<div id="sub">${esc(sub)}</div>` : ""}</body></html>`;
const ver = (si) => (si ? "" : " oculto");
const marca = (px, fs) =>
  `<div class="marca"><div class="logo" style="width:${px}px;height:${px}px">${logo}</div><div style="font-size:${fs}px;font-weight:800;letter-spacing:-2px">Trato</div></div>`;

const PLACAS = {
  portada: (b) => `<div class="zona centro">${marca(92, 96)}
    <div style="font-size:30px;margin-top:10px;opacity:.92">El contra entrega no cruza departamentos. Trato sí.</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:46px;width:100%;text-align:left">
      <div class="tarjeta dato${ver(b >= 0)}"><b>892 millones</b><span>de pagos con QR en Bolivia el año pasado</span></div>
      <div class="tarjeta dato${ver(b >= 1)}"><b>Otra ciudad</b><span>por Facebook o WhatsApp: alguien tiene que confiar primero</span></div>
      <div class="tarjeta dato${ver(b >= 2)}"><b>6 compradores</b><span>de 3 departamentos pagaron por adelantado a un falso vendedor de iPhone</span></div>
    </div></div>`,
  problema: () => `<div class="zona">
    <div class="kicker">El problema, del lado del vendedor</div>
    <h1>Una captura no es un pago</h1>
    <div style="display:flex;align-items:center;gap:72px;margin-top:40px;padding-left:24px">
      <div style="position:relative;width:330px;flex:none;background:#fff;color:#0f172a;border-radius:22px;padding:24px 26px;transform:rotate(-4deg);box-shadow:0 30px 60px rgba(0,0,0,.45)">
        <div style="font-size:15px;color:#64748b">Comprobante de transferencia</div>
        <div style="font-size:20px;font-weight:700;color:#059669;margin-top:10px">✓ Transferencia exitosa</div>
        <div style="font-size:44px;font-weight:800;margin-top:6px;letter-spacing:-1px">Bs 1.800,00</div>
        <div style="font-size:15px;color:#475569;margin-top:12px;line-height:1.6">Para: Tienda Sofi<br>Ref.: 0042-7781-55<br>Hoy · 10:42</div>
        <div style="position:absolute;right:-30px;bottom:26px;transform:rotate(-14deg);border:5px solid #e11d48;color:#e11d48;font-size:38px;font-weight:900;padding:2px 16px;border-radius:12px;background:rgba(255,255,255,.9)">¿REAL?</div>
      </div>
      <div style="font-size:30px;line-height:1.45">Un comprobante en imagen<br>se edita en segundos.<br><span style="color:#6ee7b7;font-weight:700">¿Despachas contra eso?</span></div>
    </div></div>`,
  stellar: (b) => `<div class="zona">
    <div class="kicker">Sobre Stellar · testnet</div>
    <h1>Lo que hay por dentro</h1>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:30px">
      <div class="tarjeta caja"><small>Escrow</small><b>Trustless Work</b><span>guarda la plata de cada compra</span></div>
      <div class="tarjeta caja"><small>Contrato propio · Soroban</small><b>pp_guardian</b><span>plazos, envío y confirmación</span></div>
      <div class="tarjeta caja"><small>Contrato propio · Soroban</small><b>pp_arbiter</b><span>solo reparte entre comprador y vendedor</span></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:20px">
      <div class="stat${ver(b >= 1)}"><b>47</b><span>tests contra el código real</span></div>
      <div class="stat${ver(b >= 1)}"><b>9</b><span>intentos de desvío rechazados en testnet</span></div>
      <div class="stat${ver(b >= 2)}"><b>✓</b><span>la reputación solo cuenta compras verificadas</span></div>
    </div></div>`,
  plan: () => `<div class="zona">
    <div class="kicker">El plan</div>
    <h1>En 30 días</h1>
    <div style="display:grid;gap:18px;margin-top:34px;max-width:840px">
      ${["App pública", "Piloto medido con 20 vendedores", "Contratos listos para auditoría"].map((t, i) => `<div class="tarjeta paso"><i>${i + 1}</i>${t}</div>`).join("")}
    </div></div>`,
  cierre: () => `<div class="zona centro">${marca(70, 72)}
    <div style="font-size:34px;font-weight:700;margin-top:6px">Dos salidas, nunca una tercera.</div>
    <div class="tarjeta" style="margin-top:28px;text-align:left;padding:18px 26px">
      <div class="kicker" style="font-size:14px;margin-bottom:8px">Flujo feliz en Stellar testnet${hashes.pedido ? ` · pedido ${esc(hashes.pedido)}` : ""} · verificable en stellar.expert</div>
      ${[["Pago", hashes.pago], ["Envío", hashes.envio], ["Confirmación", hashes.confirmacion]].map(([k, v]) => `<div class="hash"><span>${k}</span><code>${esc(v ?? "—")}</code></div>`).join("")}
    </div>
    <div style="font-size:26px;font-weight:700;margin-top:24px">${REPO}</div></div>`,
};
const PASTILLA = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:transparent">
  <div id="p" style="display:inline-block;padding:9px 16px;border-radius:999px;background:rgba(15,23,42,.88);color:#fff;font:600 18px/1 system-ui,-apple-system,'Segoe UI',sans-serif">⏩ Acelerado · esperando a la red</div></body></html>`;

const placas = escenas.filter((e) => e.tipo === "placa");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
for (const e of placas) {
  if (!PLACAS[e.id]) throw new Error(`No hay diseño para la placa «${e.id}»`);
  e.segmentos = [];
  for (const [b, sub] of e.bloques.entries()) {
    const png = join(WORK, `placa-${e.id}-${b}.png`);
    await page.setContent(pagina(PLACAS[e.id](b), sub), { waitUntil: "load" });
    const { texto, lineas } = await page.evaluate(() => {
      const s = document.getElementById("sub");
      return { texto: document.body.innerText, lineas: s ? Math.round((s.getBoundingClientRect().height - 24) / 30) : 0 };
    });
    for (const re of PROHIBIDAS) if (re.test(texto)) throw new Error(`Palabra prohibida ${re} en la placa «${e.id}» (bloque ${b + 1})`);
    if (LOCALHOST.test(texto)) throw new Error(`"localhost" en la placa «${e.id}»`);
    if (lineas > 2) throw new Error(`El subtítulo ${b + 1} de la placa «${e.id}» ocupa ${lineas} líneas (máximo 2): «${sub}»`);
    await page.screenshot({ path: png });
    e.segmentos.push({ png, lectura: leer(sub), mp4: join(WORK, `placa-${e.id}-${b}.mp4`) });
  }
}
const PASTILLA_PNG = join(WORK, "pastilla.png");
await page.setContent(PASTILLA);
await page.locator("#p").screenshot({ path: PASTILLA_PNG, omitBackground: true });
await browser.close();

// Clips: cada pieza a su velocidad; las aceleradas, con la pastilla.
for (const c of clips) {
  const n = c.piezas.filter(([, , v]) => v > 1).length;
  const g = n ? [`[1:v]split=${n}${Array.from({ length: n }, (_, k) => `[p${k}]`).join("")}`] : [];
  let k = 0;
  c.piezas.forEach(([a, b, v], i) => {
    const trozo = `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=(PTS-STARTPTS)/${v.toFixed(4)}`;
    g.push(v > 1 ? `${trozo}[r${i}];[r${i}][p${k++}]overlay=24:20[v${i}]` : `${trozo}[v${i}]`);
  });
  g.push(`${c.piezas.map((_, i) => `[v${i}]`).join("")}concat=n=${c.piezas.length}:v=1:a=0,fps=30,format=yuv420p[out]`);
  ff(["-i", c.norm, ...(n ? ["-i", PASTILLA_PNG] : []), "-filter_complex", g.join(";"), "-map", "[out]", ...ENC, c.out]);
  c.dur = dur(c.out);
}

// 3) Duración de las placas: la ventana del guion, o menos (hasta su tiempo de lectura) si el total pasa de MAX_S.
const totalClips = clips.reduce((s, c) => s + c.dur, 0);
const ventanas = placas.reduce((s, e) => s + (e.hasta - e.desde), 0);
const k = Math.min(1, Math.max(0, (MAX_S - totalClips) / ventanas));
for (const e of placas) {
  const lectura = e.segmentos.reduce((s, x) => s + x.lectura, 0);
  e.dur = Math.max(lectura, (e.hasta - e.desde) * k);
  for (const s of e.segmentos) s.dur = (e.dur * s.lectura) / lectura;
}
const primero = escenas[0].tipo === "placa" ? escenas[0].segmentos[0] : null;
const ultimo = escenas.at(-1).tipo === "placa" ? escenas.at(-1).segmentos.at(-1) : null;
for (const e of placas) {
  for (const s of e.segmentos) {
    const vf = ["fps=30", "format=yuv420p", s === primero && "fade=t=in:st=0:d=0.6", s === ultimo && `fade=t=out:st=${(s.dur - 0.8).toFixed(2)}:d=0.8`].filter(Boolean).join(",");
    ff(["-loop", "1", "-t", s.dur.toFixed(3), "-i", s.png, "-vf", vf, ...ENC, s.mp4]);
  }
}

// 4) Unir todo, en el orden del guion.
const orden = escenas.flatMap((e) => (e.tipo === "placa" ? e.segmentos.map((s) => s.mp4) : [e.out]));
const lista = join(WORK, "lista.txt");
writeFileSync(lista, orden.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
ff(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", "-movflags", "+faststart", OUT]);
const total = dur(OUT);

// Lámina de cuadros: 15 cuadros repartidos en todo el video.
const tiempos = Array.from({ length: 15 }, (_, i) => 1 + (i * (total - 2)) / 14);
tiempos.forEach((t, i) => ff(["-ss", t.toFixed(2), "-i", OUT, "-frames:v", "1", "-vf", "scale=384:216", join(WORK, `cuadro-${String(i).padStart(2, "0")}.png`)]));
ff(["-framerate", "1", "-i", join(WORK, "cuadro-%02d.png"), "-vf", "tile=5x3:padding=6:color=0x0f172a", "-frames:v", "1", "-update", "1", SHEET]);

// Línea de tiempo contra la del guion.
console.log(`Video listo: ${OUT}`);
console.log(`  ${mmss(total)} (${total.toFixed(1)} s, máximo ${MAX_S} s) · 1280x720 · sin audio · lámina: ${SHEET}`);
let t = 0;
for (const e of escenas) {
  const d = e.tipo === "placa" ? e.segmentos.reduce((s, x) => s + dur(x.mp4), 0) : e.dur;
  const rap = e.tipo === "clip" ? ` · ${e.piezas.filter(([, , v]) => v > 1).length} tramos acelerados` : "";
  console.log(`  ${mmss(t)}–${mmss(t + d)}  ${e.id.padEnd(10)} ${d.toFixed(1).padStart(5)} s  (guion ${mmss(e.desde)}–${mmss(e.hasta)}, ${e.hasta - e.desde} s)${rap}`);
  t += d;
}
if (total > MAX_S + 0.5) console.warn(`⚠️  El video dura ${total.toFixed(1)} s: más de ${MAX_S} s. Acorta las escenas grabadas (demo-video/demo.spec.ts).`);
