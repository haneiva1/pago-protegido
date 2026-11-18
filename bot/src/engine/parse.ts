// Lectura de frases bolivianas: precios en Bs, días de entrega y la venta en texto libre.
// Todo es puro: sin red, sin reloj, sin estado.

/** Minúsculas y sin tildes, con la MISMA longitud que el original (para recortar el texto original). */
export function fold(s: string): string {
  let out = "";
  for (const ch of s) {
    const base = String.fromCodePoint(ch.normalize("NFD").codePointAt(0)!).toLowerCase();
    out += base.length === ch.length ? base : ch;
  }
  return out;
}

/** "hola!!" → "hola"; espacios simples. */
export function clean(s: string): string {
  return fold(s).replace(/[¡!¿?.,;:]+/g, " ").replace(/\s+/g, " ").trim();
}

// Número boliviano: "450", "1.200", "1.200,50", "450,50", "1,200.50", "450.-"
const NUM = String.raw`\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;

/** "1.200" → 1200, "1.200,50" → 1200.5, "450,5" → 450.5, "450.-" → 450. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/\s/g, "").replace(/[.,]-$/, "");
  let mult = 1;
  if (/mil$/.test(s)) {
    mult = 1000;
    s = s.replace(/mil$/, "");
  }
  let n: number;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) n = Number(s.replace(/\./g, "").replace(",", "."));
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) n = Number(s.replace(/,/g, ""));
  else if (/^\d+([.,]\d{1,2})?$/.test(s)) n = Number(s.replace(",", "."));
  else return null;
  return Number.isFinite(n) ? Math.round(n * mult * 100) / 100 : null;
}

const WORD_NUM: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
};

type Range = [number, number];

interface Found<T> {
  value: T;
  range: Range;
}

const DAY_LEAD = String.raw`(?:(?:con\s+)?(?:entrega|entrego|envio|envios|llega|demora|despacho)\s+)?(?:en\s+|de\s+|a\s+)?`;

/** Días de entrega en un texto ya plegado con `fold`. */
export function findDays(low: string): Found<number> | null {
  const rules: [RegExp, (m: RegExpExecArray) => number][] = [
    [new RegExp(String.raw`${DAY_LEAD}\b(\d{1,2})\s*(?:dias?|d)\b`), (m) => Number(m[1])],
    [new RegExp(String.raw`${DAY_LEAD}\b(${Object.keys(WORD_NUM).join("|")})\s+dias?\b`), (m) => WORD_NUM[m[1]]],
    [new RegExp(String.raw`${DAY_LEAD}\b(una|1|dos|2)\s+semanas?\b`), (m) => (/^(una|1)$/.test(m[1]) ? 7 : 14)],
    [new RegExp(String.raw`${DAY_LEAD}\bpasado\s+manana\b`), () => 2],
    [new RegExp(String.raw`(?:(?:para|entrega|entrego|llega)\s+)?\b(?:manana|hoy|en\s+el\s+dia|inmediata|al\s+toque)\b`), () => 1],
  ];
  for (const [re, val] of rules) {
    const m = re.exec(low);
    if (m) return { value: val(m), range: [m.index, m.index + m[0].length] };
  }
  return null;
}

const CUR = String.raw`(?:bs\b\.?|bob\b|bolivianos?\b|pesos?\b|bolis\b)`;
/** Moneda ANTES del número: "Bs450", "Bs. 450" (sin \b final, porque letra y dígito no tienen borde). */
const CUR_PRE = String.raw`\b(?:bs\.?|bob|bolivianos?)`;
const USD = String.raw`(?:\$us|us\$|\$|usd\b|dolares?\b)`;
const PRICE_WORD = String.raw`\b(?:a\s+solo|a|por|precio|cuesta|vale|en)`;
const NOT_PRICE_BEFORE = /(?:talla|t|nro|numero|n°|no|modelo|size|version|serie|#)\.?\s*$/;
const NOT_PRICE_AFTER = /^\s*(?:gb|tb|mb|ml|lt|l|kg|g|gr|cm|mm|m|pulgadas|"|años|anos|meses|unidades|u|x|%)\b/;

export interface PriceFound extends Found<number> {
  /** El número vino con "Bs"/"bolivianos" o "a/por/precio". */
  marked: boolean;
  usd: boolean;
}

/**
 * Precio en Bs en un texto plegado. Con moneda gana el monto mayor ("zapatillas 40 Bs 450" → 450).
 * Sin moneda: el que sigue a "a/por/precio", o si `bare`, el último número que no sea talla, modelo, GB…
 */
export function findPrice(low: string, bare: boolean): PriceFound | null {
  const amount = String.raw`(${NUM})(?:[.,]-)?(\s*mil\b)?`;
  const cands: PriceFound[] = [];
  const push = (m: RegExpExecArray, numIdx: number, marked: boolean, usd: boolean) => {
    const v = parseAmount(m[numIdx] + (m[numIdx + 1] ? "mil" : ""));
    if (v != null) cands.push({ value: v, range: [m.index, m.index + m[0].length], marked, usd });
  };
  for (const [re, usd] of [
    [new RegExp(String.raw`(?:${PRICE_WORD}\s+)?${CUR_PRE}\s*${amount}`, "g"), false],
    [new RegExp(String.raw`(?:${PRICE_WORD}\s+)?\b${amount}\s*${CUR}`, "g"), false],
    [new RegExp(String.raw`(?:${PRICE_WORD}\s+)?${USD}\s*${amount}`, "g"), true],
    [new RegExp(String.raw`(?:${PRICE_WORD}\s+)?\b${amount}\s*${USD}`, "g"), true],
  ] as [RegExp, boolean][]) {
    for (let m; (m = re.exec(low)); ) push(m, 1, true, usd);
  }
  if (cands.length) return cands.sort((a, b) => b.value - a.value)[0];

  const worded = new RegExp(String.raw`\b${PRICE_WORD}\s+${amount}\b(?!\s*(?:dias?|d)\b)`, "g");
  for (let m; (m = worded.exec(low)); ) {
    if (!NOT_PRICE_AFTER.test(low.slice(m.index + m[0].length))) push(m, 1, true, false);
  }
  if (cands.length) return cands[cands.length - 1];
  if (!bare) return null;

  const loose = new RegExp(String.raw`\b${amount}(?![\d.,]*\s*(?:dias?|d)\b)`, "g");
  for (let m; (m = loose.exec(low)); ) {
    if (NOT_PRICE_BEFORE.test(low.slice(0, m.index))) continue;
    if (NOT_PRICE_AFTER.test(low.slice(m.index + m[0].length))) continue;
    push(m, 1, false, false);
  }
  return cands.length ? cands[cands.length - 1] : null;
}

export interface SellDraft {
  product?: string;
  priceBs?: number;
  days?: number;
  /** El precio vino en dólares: hay que pedirlo en Bs. */
  usd?: boolean;
}

const SELL_VERB = /^\s*(?:(?:hola|buenas|buen\s+dia|buenos\s+dias|buenas\s+(?:tardes|noches))[\s,!.]+)?(?:quiero\s+|voy\s+a\s+|quisiera\s+)?(?:vender|vendo|vendemos|venta\s+de|venta|nuevo\s+link|crear\s+(?:un\s+)?link|link\s+de\s+pago|cobrar|cobro)\b(?:\s+(?:de|un|una|unas|unos|el|la|los|las|mi|mis)\b)?/;

function cut(orig: string, ranges: Range[]): string {
  let out = orig;
  for (const [a, b] of [...ranges].sort((x, y) => y[0] - x[0])) out = `${out.slice(0, a)} ${out.slice(b)}`;
  return out;
}

/**
 * "vendo zapatillas nike 40 a 450 bs entrega 3 días" → { product: "Zapatillas nike 40", priceBs: 450, days: 3 }.
 * `bare` decide qué es un número suelto: "price" (frase libre), "days" (respuesta a ¿cuántos días?) o "none".
 */
export function parseSell(text: string, bare: "price" | "days" | "none" = "price"): SellDraft {
  const orig = text.replace(/\s+/g, " ").trim();
  const low = fold(orig);
  const out: SellDraft = {};
  const ranges: Range[] = [];
  const verb = SELL_VERB.exec(low);
  if (verb) ranges.push([0, verb[0].length]);
  const masked = (s: string) => {
    let r = s;
    for (const [a, b] of ranges) r = r.slice(0, a) + " ".repeat(b - a) + r.slice(b);
    return r;
  };

  const days = findDays(masked(low));
  if (days) {
    out.days = days.value;
    ranges.push(days.range);
  }
  const price = findPrice(masked(low), bare === "price");
  if (price) {
    if (price.usd) out.usd = true;
    else out.priceBs = price.value;
    ranges.push(price.range);
  }
  if (bare === "days" && out.days == null) {
    const m = /^\s*(\d{1,2})\s*$/.exec(masked(low));
    if (m) {
      out.days = Number(m[1]);
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  let product = cut(orig, ranges).replace(/\s+/g, " ");
  // Quitar conectores sueltos de los bordes ("… a", "en …"), comparando sin tildes.
  for (let prev = ""; prev !== product; ) {
    prev = product;
    const f = fold(product);
    const lead = /^(?:\s|[-,:;.+*]|(?:a|en|por|y|de|con|precio|entrega|a solo)(?=\s|$))+/.exec(f);
    if (lead) product = product.slice(lead[0].length);
    const tail = /(?:\s|[-,:;.+*]|(?<=\s|^)(?:a|en|por|y|de|con|precio|entrega|a solo))+$/.exec(fold(product));
    if (tail) product = product.slice(0, tail.index);
  }
  product = product.trim();
  if (product.length >= 2 && /[a-zñáéíóú]/i.test(product)) {
    const first = product.split(" ")[0];
    out.product = (first === first.toLowerCase() ? product[0].toUpperCase() + product.slice(1) : product).slice(0, 80);
  }
  return out;
}

/** "591 7123-4567", "+59171234567", "71234567" → "59171234567" (8 dígitos de Bolivia → con 591). */
export function normPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  return d.length === 8 ? `591${d}` : d;
}

/** Código corto del pedido: el sufijo hex del slug ("zapatillas-nike-a1b2c3" → "a1b2c3"). */
export function shortCode(slug: string): string {
  return slug.split("-").pop() ?? slug;
}

/** Busca un pedido por slug completo o por su código corto. */
export function matchOrder<T extends { slug: string }>(orders: T[], code: string): T | undefined {
  const c = fold(code).replace(/^#/, "").trim();
  if (!c) return undefined;
  return orders.find((o) => o.slug === c) ?? orders.find((o) => shortCode(o.slug) === c) ?? orders.find((o) => o.slug.startsWith(c));
}
