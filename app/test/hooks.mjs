// Resolución de imports para los tests unitarios (`npm run test:unit` lo carga con --import): el alias `@/` de
// tsconfig y los imports relativos sin extensión dentro de src/, como los escribe Next. Node quita los tipos solo.
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

function archivo(p) {
  for (const c of [p, `${p}.ts`, `${p}.tsx`, path.join(p, "index.ts")]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) {
      const f = archivo(path.join(SRC, spec.slice(2)));
      if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
    }
    const desdeSrc = ctx.parentURL?.startsWith("file:") && fileURLToPath(ctx.parentURL).startsWith(SRC + path.sep);
    if (desdeSrc && (spec.startsWith("./") || spec.startsWith("../"))) {
      const f = archivo(path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec));
      if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
    }
    return next(spec, ctx);
  },
});
