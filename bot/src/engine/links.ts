// Verificador de links: decide si un link es un link de pago de Trato. Funciones puras.
// Solo es auténtico un link al dominio canónico EXACTO (PP_APP_URL / PP_PUBLIC_URL) con la forma /p/<slug>.
// Todo lo demás es falso; la clasificación (acortador, dominio parecido…) solo sirve para explicar por qué.

import { domainToUnicode } from "node:url";

export type FakeReason =
  /** bit.ly, tinyurl…: esconden a dónde llevan. */
  | "shortener"
  /** pago-protegido.co, pagoprotegid0.com, pagoprotegido.bo.evil.com… */
  | "lookalike"
  /** https://pagoprotegido.bo@evil.com/…: usuario o clave dentro del link. */
  | "hidden"
  /** Otro dominio cualquiera. */
  | "other"
  /** Dominio canónico, pero no es /p/<slug>. */
  | "bad_path"
  /** Dominio canónico y /p/, pero el slug no tiene la forma de la app. */
  | "bad_slug"
  /** Dominio canónico y slug válido, pero la app no tiene ese pedido. */
  | "not_found"
  /** No se puede leer como link. */
  | "invalid";

export type LinkCheck = { ok: true; host: string; slug: string } | { ok: false; host: string; reason: FakeReason };

/**
 * Slug de la app (`slugify` de pago-protegido/app): hasta 4 palabras [a-z0-9] unidas por guiones, máximo 32
 * caracteres, más "-" y 6 hex. Ej.: "zapatillas-nike-40-a1b2c3", "pedido-ff00aa".
 */
export const SLUG_RE = /^(?=[a-z0-9-]{1,32}-[0-9a-f]{6}$)[a-z0-9]+(?:-[a-z0-9]+){0,3}-[0-9a-f]{6}$/;

/** Acortadores conocidos (también sus subdominios: preview.tinyurl.com, x.page.link…). */
export const SHORTENERS = [
  "bit.ly", "bitly.com", "j.mp", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "v.gd", "buff.ly", "cutt.ly", "rebrand.ly",
  "rb.gy", "shorturl.at", "tiny.cc", "tiny.one", "t.ly", "s.id", "bl.ink", "short.io", "short.gy", "lnkd.in", "shorte.st",
  "adf.ly", "qrco.de", "acortar.link", "acortaurl.com", "n9.cl", "l.ead.me", "wa.link", "surl.li", "u.to", "clck.ru",
  "shorturl.asia", "page.link", "linktr.ee", "tr.ee", "x.gd", "urlz.fr", "soo.gd", "trib.al", "dub.sh", "dub.co", "kutt.it",
];

/** Nombre visible de la marca. */
export const BRAND = "Trato";

/**
 * Marcas que un dominio falso imitaría: cualquier dominio que se les parezca y no sea el canónico es una imitación.
 * "pagoprotegido" sigue porque es el nombre anterior y el de los dominios actuales. "trato" no entra: es una palabra
 * común (contrato, retrato) y daría falsas alarmas; el dominio canónico ya se agrega en `brandsOf`.
 */
export const IMITABLES = ["pagoprotegido"];

/** Signos que suelen quedar pegados al copiar un link de un mensaje. */
const TRIM_LEAD = /^[\s<(«“"'*_~[]+/;
const TRIM_TAIL = /[\s>)»”"'*_~.,;:!?¡¿\]]+$/;

/** Links dentro de un mensaje reenviado: con http(s)://, con www. o con un acortador conocido. */
export function findLinks(text: string): string[] {
  const out: string[] = [];
  const re = /(?:https?:\/\/|www\.)[^\s<>"]+|\b[\w.-]+\.[a-z]{2,}\/[^\s<>"]+/gi;
  for (const m of text.matchAll(re)) {
    const raw = m[0].replace(TRIM_TAIL, "");
    if (/^(?:https?:\/\/|www\.)/i.test(raw) || isShortener(raw.split("/")[0].toLowerCase())) out.push(raw);
  }
  return [...new Set(out)];
}

/** "https://x.com/a" | "x.com/a" | "www.x.com" → URL. null si no es un link http(s). */
export function parseLink(raw: string): URL | null {
  const s = raw.trim().replace(TRIM_LEAD, "").replace(TRIM_TAIL, "");
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/]+\.[^/]+:\d/.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || (!u.hostname.includes(".") && u.hostname !== "localhost")) return null;
    return u;
  } catch {
    return null;
  }
}

export const isShortener = (hostname: string) => {
  const h = hostname.replace(/\.$/, "");
  return SHORTENERS.some((s) => h === s || h.endsWith(`.${s}`));
};

// Letras que se usan para imitar a otras: dígitos, Unicode de otros alfabetos y combinaciones ("rn" → "m").
const CONFUSABLE: Record<string, string> = {
  "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", $: "s", "|": "l", "!": "l",
  i: "l", í: "l", ı: "l", ł: "l", // i y l se confunden entre sí: las dos se leen como "l"
  а: "a", е: "e", о: "o", р: "p", с: "c", і: "l", ј: "j", ԁ: "d", ɡ: "g", ο: "o", α: "a", ν: "v", ρ: "p", τ: "t",
};

/** Forma "esqueleto" para comparar dominios a ojo: sin tildes, sin guiones ni puntos, con letras parecidas unificadas. */
export function skeleton(s: string): string {
  const base = domainToUnicode(s) || s;
  let out = "";
  for (const ch of base.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")) out += CONFUSABLE[ch] ?? ch;
  return out.replace(/rn/g, "m").replace(/vv/g, "w").replace(/[^a-z0-9]/g, "");
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Marcas a imitar: "pagoprotegido" y el nombre del dominio canónico (si es un nombre, no "localhost" ni una IP). */
export function brandsOf(canonicalHosts: string[]): string[] {
  const out = new Set(IMITABLES.map(skeleton));
  for (const h of canonicalHosts) {
    const label = h.split(":")[0].split(".").find((l) => l !== "www") ?? "";
    if (/^[a-z][a-z0-9-]{4,}$/.test(label) && label !== "localhost") out.add(skeleton(label));
  }
  return [...out];
}

/** ¿El dominio imita a la marca? Contiene la marca, o un pedazo a 1–2 letras de distancia. */
export function isLookalike(hostname: string, brands: string[]): boolean {
  const flat = skeleton(hostname);
  for (const b of brands) {
    if (flat.includes(b)) return true;
    const tol = b.length >= 8 ? 2 : 1;
    for (let len = b.length - tol; len <= b.length + tol; len++) {
      for (let i = 0; i + len <= flat.length; i++) if (distance(flat.slice(i, i + len), b) <= tol) return true;
    }
  }
  return false;
}

/** "http://localhost:3000/" → "localhost:3000". */
export const hostOf = (url: string) => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
};

/**
 * Revisa la forma de un link, sin red. Si es auténtico en forma, el runtime todavía tiene que confirmar
 * que el pedido existe (GET /api/orders/:slug).
 */
export function checkLink(raw: string, canonicalHosts: string[]): LinkCheck {
  const u = parseLink(raw);
  if (!u) return { ok: false, host: raw.trim().slice(0, 60), reason: "invalid" };
  const host = u.host.toLowerCase();
  if (u.username || u.password) return { ok: false, host, reason: "hidden" };
  if (canonicalHosts.map((h) => h.toLowerCase()).includes(host)) {
    const m = /^\/p\/([^/]+)\/?$/.exec(u.pathname);
    if (!m) return { ok: false, host, reason: "bad_path" };
    let slug: string;
    try {
      slug = decodeURIComponent(m[1]);
    } catch {
      return { ok: false, host, reason: "bad_slug" };
    }
    return SLUG_RE.test(slug) ? { ok: true, host, slug } : { ok: false, host, reason: "bad_slug" };
  }
  if (isShortener(u.hostname)) return { ok: false, host, reason: "shortener" };
  if (isLookalike(u.hostname, brandsOf(canonicalHosts))) return { ok: false, host, reason: "lookalike" };
  return { ok: false, host, reason: "other" };
}
