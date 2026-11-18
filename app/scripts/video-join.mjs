#!/usr/bin/env node
// Arma pago-protegido/demo/v2/pago-protegido-demo-v2.mp4 (1280x720, 30 fps, H.264) a partir de los clips de
// npm run demo:video (pago-protegido/demo/v2/clips/*.webm). Con PP_VIDEO_DIR se usa otra carpeta.
//   1. Normaliza cada clip a 1280x720 (los de celular se centran sobre fondo oscuro).
//   2. Acorta las esperas a testnet: detecta tramos sin cambios (freezedetect) y, si duran más de LONG s,
//      deja HEAD s a velocidad normal (para leer el subtítulo), acelera el resto y deja TAIL s al final.
//   3. Ajusta la velocidad general para que el video quede cerca de TARGET s.
//   4. Agrega una placa inicial (3 s) y una final (4 s), renderizadas desde HTML con el logo.
//   5. Genera la lámina de cuadros pago-protegido/demo/v2/lamina.png.
// Reproducible: npm run demo:video:join (sin volver a grabar). Requiere ffmpeg/ffprobe.
import { chromium } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VIDEO = process.env.PP_VIDEO_DIR ? resolve(process.env.PP_VIDEO_DIR) : resolve(APP, "..", "demo", "v2");
const CLIPS = join(VIDEO, "clips");
const WORK = join(CLIPS, "work");
const OUT = join(VIDEO, "pago-protegido-demo-v2.mp4");
const SHEET = join(VIDEO, "lamina.png");
const TARGET = Number(process.env.VIDEO_TARGET_S || 108); // objetivo: 2 minutos o menos, con las placas
const INTRO_S = 3;
const OUTRO_S = 4;
const LONG = 4.5; // tramos quietos más largos que esto se acortan
const HEAD = 3.6; // segundos que se dejan a velocidad normal al inicio del tramo quieto
const TAIL = 0.5; // y al final
const FAST = 12; // velocidad del resto del tramo
const NORM = "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,fps=30,format=yuv420p";
const ENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30", "-an"];

const ff = (args) => execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
const dur = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout.trim());

const clips = readdirSync(CLIPS)
  .filter((f) => f.endsWith(".webm") && !/portada/.test(f))
  .sort();
if (!clips.length) {
  console.error(`No hay clips en ${CLIPS}. Corre primero: npm run demo:video`);
  process.exit(1);
}
if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
  console.log(`ffmpeg no está instalado. Los clips quedaron en ${CLIPS}. Para unirlos sin recortes:`);
  console.log(`  cd ${CLIPS} && for f in *.webm; do ffmpeg -y -i "$f" -vf "${NORM}" -c:v libx264 -crf 23 -an "\${f%.webm}.mp4"; done`);
  console.log(`  ls *.mp4 | sed "s/.*/file '&'/" > lista.txt && ffmpeg -f concat -safe 0 -i lista.txt -c copy ../pago-protegido-demo.mp4`);
  process.exit(0);
}
mkdirSync(WORK, { recursive: true });

// 1–2) Normalizar y planear los recortes de cada clip.
function freezes(file, d) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-vf", "freezedetect=n=-45dB:d=1.2", "-map", "0:v", "-f", "null", "-"], { encoding: "utf8" });
  const starts = [...r.stderr.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...r.stderr.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((s, i) => [s, ends[i] ?? d]);
}
const plans = clips.map((c) => {
  const norm = join(WORK, c.replace(/\.webm$/, ".norm.mp4"));
  ff(["-i", join(CLIPS, c), "-vf", NORM, ...ENC, norm]);
  const d = dur(norm);
  const pieces = [];
  let t = 0;
  for (const [fs, fe] of freezes(norm, d)) {
    if (fs > t) pieces.push([t, fs, 1]);
    if (fe - fs > LONG) {
      pieces.push([fs, fs + HEAD, 1], [fs + HEAD, fe - TAIL, FAST], [fe - TAIL, fe, 1]);
    } else {
      pieces.push([fs, fe, 1]);
    }
    t = fe;
  }
  if (t < d) pieces.push([t, d, 1]);
  const merged = pieces
    .filter(([a, b]) => b - a > 0.04)
    .reduce((acc, p) => {
      const last = acc.at(-1);
      if (last && last[2] === p[2] && Math.abs(last[1] - p[0]) < 0.01) last[1] = p[1];
      else acc.push([...p]);
      return acc;
    }, []);
  return { clip: c, norm, d, pieces: merged, out: join(WORK, c.replace(/\.webm$/, ".fast.mp4")) };
});

// 3) Factor general para acercarse al objetivo (nunca más lento que el original).
const planned = plans.reduce((acc, p) => acc + p.pieces.reduce((s, [a, b, v]) => s + (b - a) / v, 0), 0);
const g = Math.max(1, planned / (TARGET - INTRO_S - OUTRO_S));
for (const p of plans) {
  const parts = p.pieces.map(([a, b, v], i) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=(PTS-STARTPTS)/${(v * g).toFixed(4)}[v${i}]`);
  const filter = `${parts.join(";")};${p.pieces.map((_, i) => `[v${i}]`).join("")}concat=n=${p.pieces.length}:v=1:a=0,fps=30,format=yuv420p[out]`;
  ff(["-i", p.norm, "-filter_complex", filter, "-map", "[out]", ...ENC, p.out]);
}

// 4) Placas inicial y final, desde HTML con el logo.
const logo = readFileSync(join(APP, "src", "app", "icon.svg"), "utf8");
const plate = (body) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;width:1280px;height:720px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#064e3b,#0f172a);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;text-align:center">${body}</body></html>`;
const INTRO = plate(`<div><div style="width:150px;height:150px;margin:0 auto 22px">${logo}</div>
  <div style="font-size:76px;font-weight:800;letter-spacing:-1.5px">Pago Protegido</div>
  <div style="font-size:34px;margin-top:14px;opacity:.95">Pagos protegidos para ventas por redes</div>
  <div style="font-size:26px;margin-top:26px;opacity:.75">sobre Stellar</div></div>`);
const chip = (t) => `<span style="display:inline-block;margin:8px;padding:12px 24px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);font-size:30px;font-weight:600">${t}</span>`;
const OUTRO = plate(`<div><div style="width:110px;height:110px;margin:0 auto 18px">${logo}</div>
  <div style="font-size:46px;font-weight:800">Contratos v2 en Stellar testnet</div>
  <div style="margin-top:26px">${["pp_guardian v2", "pp_arbiter v2", "Trustless Work"].map(chip).join("")}</div>
  <div style="font-size:24px;margin-top:30px;opacity:.75">Pago Protegido · demo en testnet con USD de prueba</div></div>`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const [name, html] of [["intro", INTRO], ["outro", OUTRO]]) {
  await page.setContent(html);
  await page.screenshot({ path: join(WORK, `${name}.png`) });
}
await browser.close();
ff(["-loop", "1", "-t", String(INTRO_S), "-i", join(WORK, "intro.png"), "-vf", `fps=30,format=yuv420p,fade=t=in:st=0:d=0.5`, ...ENC, join(WORK, "intro.mp4")]);
ff(["-loop", "1", "-t", String(OUTRO_S), "-i", join(WORK, "outro.png"), "-vf", `fps=30,format=yuv420p,fade=t=out:st=${OUTRO_S - 0.6}:d=0.6`, ...ENC, join(WORK, "outro.mp4")]);

// Unir todo.
const order = [join(WORK, "intro.mp4"), ...plans.map((p) => p.out), join(WORK, "outro.mp4")];
const list = join(WORK, "lista.txt");
writeFileSync(list, order.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", OUT]);
const total = dur(OUT);

// 5) Lámina de cuadros: 15 cuadros (placa inicial, 13 repartidos en el recorrido y placa final).
const times = [1.5, ...Array.from({ length: 13 }, (_, i) => INTRO_S + 1 + (i * (total - INTRO_S - OUTRO_S - 2)) / 12), total - 2];
times.forEach((t, i) => ff(["-ss", t.toFixed(2), "-i", OUT, "-frames:v", "1", "-vf", "scale=384:216", join(WORK, `thumb-${String(i).padStart(2, "0")}.png`)]));
ff(["-framerate", "1", "-i", join(WORK, "thumb-%02d.png"), "-vf", "tile=5x3:padding=6:color=0x0f172a", "-frames:v", "1", "-update", "1", SHEET]);

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
console.log(`Video listo: ${OUT}`);
console.log(`  ${clips.length} clips + placas de ${INTRO_S} s y ${OUTRO_S} s · ${mmss(total)} (${total.toFixed(1)} s) · 1280x720 · velocidad general ×${g.toFixed(2)}`);
console.log(`  Lámina de cuadros: ${SHEET}`);
