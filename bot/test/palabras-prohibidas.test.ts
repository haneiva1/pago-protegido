// Palabras prohibidas en todo texto que ve un cliente: los mensajes del bot (bot/src) y los textos visibles de la
// app (app/src). Lee el código con el parser de TypeScript y revisa solo textos: strings, templates y texto JSX.
// No revisa comentarios, imports (también los dinámicos), tipos, nombres de propiedades, clases CSS, estilos ni rutas.
// Lo que queda y es código (un identificador, una clave), va en EXCEPCIONES con su motivo.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");

/** La lista de palabras prohibidas (tuteo de Bolivia, sin jerga técnica ni promesas legales). */
const PROHIBIDAS: [string, RegExp][] = [
  ["garantía", /garant[ií]a|garantiz/iu],
  ["seguro", /(?<!\p{L})seguros?(?!\p{L})/iu],
  ["custodia", /custodi/iu],
  ["arbitraje", /arbitraje/iu],
  ["100%", /(?<![\d.,])100\s?%/u],
  ["cripto", /(?<!\p{L})cripto/iu],
  ["token", /(?<!\p{L})tokens?(?!\p{L})/iu],
  ["wallet", /(?<!\p{L})wallets?(?!\p{L})/iu],
  ["llave", /(?<!\p{L})llaves?(?!\p{L})/iu],
  ["blockchain", /blockchain/iu],
  // Nombre viejo del producto: en pantallas y mensajes es Trato. Con mayúsculas, porque "link de pago protegido"
  // describe lo que es. Los identificadores (pp_guardian, PP-, pago-protegido) son código y no se revisan; la nota
  // "Trato antes se llamaba Pago Protegido", si algún día va en una pantalla, entra en EXCEPCIONES.
  ["Pago Protegido", /Pago\s+Protegido/u],
];

/**
 * Textos que no ve ningún cliente aunque contengan una palabra de la lista: identificadores, claves y rutas.
 * `archivo` es relativo a la raíz del repo y `texto` es el string completo, tal cual está en el código.
 */
const EXCEPCIONES: { archivo: string; texto: string; motivo: string }[] = [
  { archivo: "bot/src/main.ts", texto: "token", motivo: "clave de configuración de WhatsApp (cfg.wa.token) en un error de arranque para el equipo" },
];

/** Atributos JSX que son código, no texto visible. */
const ATRIBUTOS_CODIGO = new Set([
  "className", "style", "data-testid", "id", "htmlFor", "name", "type", "key", "href", "src", "rel", "target", "method",
  "autoComplete", "inputMode", "pattern", "accept", "d", "viewBox", "fill", "stroke", "strokeLinecap", "strokeLinejoin",
]);

/** Llamadas cuyos argumentos son código: claves de almacenamiento, SQL, consola, comparaciones de strings. */
const LLAMADAS_CODIGO =
  /^(console\.\w+|localStorage\.\w+|sessionStorage\.\w+|[\w.]+\.(get|set|has|delete|prepare|exec|run|all|startsWith|endsWith|includes|split|replace|match|test|getItem|setItem|removeItem)|require|fetch)$/;

function archivos(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : archivos(p, ext);
    return ext.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts") ? [p] : [];
  });
}

const COMPARACIONES = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.InKeyword,
]);

function esCodigo(n: ts.Node): boolean {
  const p = n.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  // import("…") dinámico: es una ruta de módulo, no un texto.
  if (ts.isCallExpression(p) && p.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)) && p.name === n) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === n) return true;
  if (ts.isCaseClause(p)) return true;
  if (ts.isBinaryExpression(p) && COMPARACIONES.has(p.operatorToken.kind)) return true;
  for (let a: ts.Node | undefined = p; a; a = a.parent) {
    if (ts.isJsxAttribute(a) && ATRIBUTOS_CODIGO.has(a.name.getText())) return true;
    if (ts.isCallExpression(a) && LLAMADAS_CODIGO.test(a.expression.getText())) return true;
    if (ts.isNewExpression(a) && /^(URL|RegExp)$/.test(a.expression.getText())) return true;
    if (ts.isJsxElement(a) || ts.isJsxSelfClosingElement(a) || ts.isBlock(a) || ts.isSourceFile(a)) break;
  }
  return false;
}

function textosDe(src: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (!esCodigo(n)) out.push(n.text);
    } else if (ts.isTemplateExpression(n)) {
      if (!esCodigo(n)) out.push([n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(" … "));
    } else if (ts.isJsxText(n)) {
      if (n.text.trim()) out.push(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

/** Textos de un .ts/.tsx: strings, partes fijas de los templates y texto JSX. */
function textosTs(file: string): string[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return textosDe(ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, kind));
}

/** Textos de un .html: lo que hay entre etiquetas y los strings de sus scripts, sin estilos. */
function textosHtml(file: string): string[] {
  const html = readFileSync(file, "utf8").replace(/<style[\s\S]*?<\/style>/g, "");
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, "\n");
  const enScripts = scripts.flatMap((s) => textosDe(ts.createSourceFile(`${file}.js`, s, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)));
  return [...visible.split("\n"), ...enScripts];
}

const textos = (f: string) => (f.endsWith(".html") ? textosHtml(f) : textosTs(f));

/** Rutas y URLs: son código aunque digan "wallet" (`/api/wallet/activate`). */
const esRuta = (t: string) => /^\/[\w\-./[\]:]*$/.test(t.trim()) || /^https?:\/\/\S+$/.test(t.trim());

function hallazgos(files: string[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f);
    for (const t of textos(f)) {
      if (esRuta(t)) continue;
      for (const [palabra, re] of PROHIBIDAS) {
        if (!re.test(t)) continue;
        if (EXCEPCIONES.some((e) => e.archivo === rel && t === e.texto)) continue;
        out.push(`${rel}: "${palabra}" en ${JSON.stringify(t.trim().slice(0, 160))}`);
      }
    }
  }
  return out;
}

describe("palabras prohibidas en textos para clientes", () => {
  it("la lista detecta las variantes y deja pasar palabras parecidas", () => {
    const hits = (t: string) => PROHIBIDAS.filter(([, re]) => re.test(t)).map(([p]) => p);
    expect(hits("Te garantizamos un pago 100% seguro con tu wallet y tus llaves")).toEqual(["garantía", "seguro", "100%", "wallet", "llave"]);
    expect(hits("Criptomonedas, tokens, blockchain, custodiamos y arbitraje")).toEqual(["custodia", "arbitraje", "cripto", "token", "blockchain"]);
    expect(hits("Asegúrate de revisarlo: todo para el comprador, Bs 2.100, 1.100%, contrato y retrato")).toEqual([]);
  });

  it("el lector encuentra los textos visibles y salta el código", () => {
    const bot = textos(join(ROOT, "bot/src/engine/messages.ts"));
    expect(bot.some((t) => t.includes("¿En cuántos días lo despachas?"))).toBe(true);
    const app = textos(join(ROOT, "app/src/app/como-funciona/page.tsx"));
    expect(app.some((t) => t.includes("Pollar guarda el acceso"))).toBe(true);
    expect(app.some((t) => t.includes("rounded-xl"))).toBe(false); // className
    expect(textos(join(ROOT, "bot/src/transports/sim.html")).some((t) => t.includes("Simulador del bot"))).toBe(true);
  });

  it("mensajes del bot (bot/src)", () => {
    expect(hallazgos(archivos(join(ROOT, "bot/src"), /\.(ts|html)$/))).toEqual([]);
  });

  it("textos visibles de la app (app/src)", () => {
    expect(hallazgos(archivos(join(ROOT, "app/src"), /\.tsx?$/))).toEqual([]);
  });

  it("cada excepción sigue haciendo falta", () => {
    const vigentes = EXCEPCIONES.filter((e) => textos(join(ROOT, e.archivo)).some((t) => t === e.texto && PROHIBIDAS.some(([, re]) => re.test(t))));
    expect(vigentes).toEqual(EXCEPCIONES);
  });
});
