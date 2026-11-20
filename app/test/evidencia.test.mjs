// Tests unitarios de la evidencia con huella (M5): tipo por los primeros bytes, nombres válidos y huella del link.
import assert from "node:assert/strict";
import { test } from "node:test";
import { huellaDeLink, mimeDeNombre, tipoEvidencia } from "../src/lib/evidencia.ts";

const bytes = (...partes) => {
  const out = [];
  for (const p of partes) out.push(...(typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p));
  while (out.length < 16) out.push(0);
  return new Uint8Array(out);
};

test("tipoEvidencia: fotos y videos por sus primeros bytes", () => {
  assert.equal(tipoEvidencia(bytes([0xff, 0xd8, 0xff, 0xe0]))?.ext, "jpg");
  assert.equal(tipoEvidencia(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]))?.mime, "image/png");
  assert.equal(tipoEvidencia(bytes("RIFF", [1, 2, 3, 4], "WEBP"))?.ext, "webp");
  assert.equal(tipoEvidencia(bytes([0, 0, 0, 0x20], "ftypisom"))?.ext, "mp4");
  assert.equal(tipoEvidencia(bytes([0, 0, 0, 0x14], "ftypqt  "))?.ext, "mov");
  assert.equal(tipoEvidencia(bytes([0x1a, 0x45, 0xdf, 0xa3]))?.video, true);
});

test("tipoEvidencia: rechaza lo que no es foto ni video", () => {
  assert.equal(tipoEvidencia(bytes("<html><script>")), null);
  assert.equal(tipoEvidencia(bytes("%PDF-1.7")), null);
  assert.equal(tipoEvidencia(new Uint8Array([0xff, 0xd8])), null);
});

test("nombres: solo <sha256>.<ext>; la huella sale del link", () => {
  const sha = "a".repeat(64);
  assert.equal(mimeDeNombre(`${sha}.jpg`), "image/jpeg");
  assert.equal(mimeDeNombre(`${sha}.mp4`), "video/mp4");
  assert.equal(mimeDeNombre("../../.env.local"), null);
  assert.equal(mimeDeNombre(`${sha}.html`), null);
  assert.equal(mimeDeNombre(`${sha.slice(1)}.jpg`), null);
  assert.equal(huellaDeLink(`https://trato.example/api/evidencia/${sha}.png`), sha);
  assert.equal(huellaDeLink("https://example.com/foto.jpg"), null);
});
