#!/usr/bin/env node
// Une los clips de pago-protegido/demo/video/clips/*.webm en pago-protegido/demo/video/pago-protegido-demo.mp4
// (1280x720, 30 fps, H.264). Los clips de celular se centran sobre fondo oscuro. Requiere ffmpeg.
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VIDEO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "demo", "video");
const CLIPS = join(VIDEO, "clips");
const OUT = join(VIDEO, "pago-protegido-demo.mp4");
const VF = "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,fps=30,format=yuv420p";

const clips = readdirSync(CLIPS).filter((f) => f.endsWith(".webm")).sort();
if (!clips.length) {
  console.error(`No hay clips en ${CLIPS}. Corre primero: npm run demo:video`);
  process.exit(1);
}
if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
  console.log(`ffmpeg no está instalado. Los clips quedaron en ${CLIPS}. Para unirlos:`);
  console.log(`  cd ${CLIPS}`);
  console.log(`  for f in *.webm; do ffmpeg -y -i "$f" -vf "${VF}" -c:v libx264 -crf 24 -an "\${f%.webm}.mp4"; done`);
  console.log(`  ls *.mp4 | sed "s/.*/file '&'/" > lista.txt && ffmpeg -f concat -safe 0 -i lista.txt -c copy ../pago-protegido-demo.mp4`);
  process.exit(0);
}

const list = [];
for (const c of clips) {
  const seg = join(CLIPS, c.replace(/\.webm$/, ".mp4"));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(CLIPS, c), "-vf", VF, "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-an", seg]);
  list.push(`file '${seg.replace(/'/g, "'\\''")}'`);
}
const listFile = join(CLIPS, "lista.txt");
writeFileSync(listFile, list.join("\n") + "\n");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", OUT]);
const dur = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", OUT], { encoding: "utf8" }).stdout.trim();
console.log(`Video listo: ${OUT} (${clips.length} clips, ${Math.round(Number(dur))} s, 1280x720)`);
