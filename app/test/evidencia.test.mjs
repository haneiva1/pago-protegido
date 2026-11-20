// Tests unitarios de la evidencia con huella (M5): tipo por los primeros bytes, nombres válidos y huella del link.
import assert from "node:assert/strict";
import { test } from "node:test";
import { huellaDeLink, mimeDeNombre, rechazoDeTipo, tipoEvidencia } from "../src/lib/evidencia.ts";

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

test("tipoEvidencia: de los ftyp, solo las marcas de video; una foto HEIC/HEIF/AVIF no es mp4", () => {
  for (const marca of ["isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "M4A ", "3gp4", "3gp5", "3gp6", "3g2a"])
    assert.equal(tipoEvidencia(bytes([0, 0, 0, 0x18], `ftyp${marca}`))?.ext, "mp4", marca);
  assert.equal(tipoEvidencia(bytes([0, 0, 0, 0x14], "ftypqt  "))?.ext, "mov");
  for (const marca of ["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1", "avif", "avis", "crx ", "qtxx"]) {
    const b = bytes([0, 0, 0, 0x18], `ftyp${marca}`);
    assert.equal(tipoEvidencia(b), null, marca);
    assert.equal(rechazoDeTipo(b), "Sube la foto en JPG", marca);
  }
  assert.match(rechazoDeTipo(bytes("%PDF-1.7")), /Sube una foto \(JPG, PNG o WebP\) o un video/);
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
