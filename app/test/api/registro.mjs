// Carga los .ts de la app como en Next.js para los tests de las rutas (`npm run test:api`):
// - `@/…` → `src/…` y los imports sin extensión → `.ts` o `/index.ts`;
// - los módulos que hablan con la red (Horizon, RPC, escrows) se cambian por los de `stubs/`, que reexportan el
//   módulo real (`?real`) y reemplazan solo las funciones de red. Así ningún test toca testnet.
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";

const SRC = new URL("../../src/", import.meta.url).href;
const TEST = new URL("../", import.meta.url).href;
const STUBS = {
  "lib/server/stellar.ts": new URL("./stubs/stellar.mjs", import.meta.url).href,
  "lib/server/escrow/index.ts": new URL("./stubs/escrow.mjs", import.meta.url).href,
  "lib/server/metrics.ts": new URL("./stubs/metrics.mjs", import.meta.url).href,
};

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) spec = SRC + spec.slice(2);
    const relative = spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("file:");
    // Solo el código de la app y de los tests: node_modules (y su require de CommonJS) se resuelven como siempre.
    const propio = ctx.parentURL?.startsWith(SRC) || ctx.parentURL?.startsWith(TEST);
    if (!relative || !propio) return next(spec, ctx);
    const u = new URL(spec, ctx.parentURL);
    const real = u.search === "?real";
    u.search = "";
    let href = u.href;
    if (!/\.(m?[jt]s|json)$/.test(u.pathname)) {
      for (const ext of [".ts", "/index.ts"]) {
        if (existsSync(new URL(href + ext))) {
          href += ext;
          break;
        }
      }
    }
    const rel = href.startsWith(SRC) ? href.slice(SRC.length) : null;
    if (rel && STUBS[rel] && !real) return { url: STUBS[rel], shortCircuit: true };
    return next(real ? `${href}?real` : href, ctx);
  },
});
