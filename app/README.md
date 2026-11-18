# Pago Protegido: app web (testnet)

Links de pago protegidos para ventas por redes:

1. El vendedor crea un link.
2. El comprador paga y la plata queda en un escrow de Trustless Work en Stellar.
3. El vendedor marca "enviado".
4. El comprador confirma y se libera la plata, o abre un reclamo y el árbitro reparte.

**Solo testnet.** La red está fija en el código. La moneda es LABUSD, que en pantalla se llama "USD de prueba". La rampa de bolivianos está simulada y la pantalla lo dice.

Especificación: [`docs-pp/SPEC.md`](../../docs-pp/SPEC.md). Decisiones tomadas fuera del SPEC: [`DECISIONES.md`](DECISIONES.md).

## Correrla en 3 comandos

Requisitos:

- Node 20 o superior (probado con Node 25).
- Stellar CLI con las identidades de testnet `plataforma`, `arbitro`, `lab` y `twfee`, las del spike de `stellar-lab`.

```bash
npm install
npm run setup   # crea .env.local con las llaves de TESTNET (stellar keys show plataforma|arbitro|lab)
npm run dev     # http://localhost:3000
```

- `npm run setup` no pisa un `.env.local` que ya exista. Para regenerarlo: `npm run setup -- --force`.
- Si encuentra `docs-pp/.env.pollar` (o la ruta en `POLLAR_ENV_FILE`), copia también las variables de Pollar.
- Si el puerto 3000 está ocupado: `PORT=3010 npm run dev`. Pollar tiene registrado `http://localhost:3000` como origen y URL de retorno.
- Para producción local: `npm run build && npm start`.

### Demo de 3 minutos (SPEC §7)

1. `/vender`: nombre de la tienda, WhatsApp y "Crear mi billetera". Te lleva a "Tu primer link". Crea "Zapatillas Nike talla 40", Bs 450, 3 días.
2. Abre el link en el celular (o en otra ventana privada): "Pagar protegido" → QR de ejemplo → "Simular pago del banco (testnet)". Cada paso muestra su "Ver en Stellar".
3. En `/panel`, marca "enviado" con el código de encomienda.
4. En el link, toca "Recibí conforme". Se ven los montos del vendedor (97,7 %), de la plataforma (2 %) y de Trustless Work (0,3 %).
5. Con un segundo link, toca "Tengo un problema" y luego entra a `/arbitro`. La clave es `ARBITRO_PANEL_KEY`, que está en `.env.local`. Pon el slider en 70 %, prueba "mandar la plata a otra cuenta" (se rechaza) y toca "Resolver".

## Test e2e (Playwright, contra testnet)

```bash
npx playwright install chromium   # solo la primera vez
npm run test:e2e
```

- Hace su propio build en `.next-e2e/`, con la billetera local, y lo levanta en `http://localhost:3100` con una base aparte (`data/e2e.db`). No toca tu `npm run dev`.
- Recorre dos escenarios con transacciones reales en testnet; tarda entre 6 y 10 minutos:
  - **Caso feliz:** onboarding → link → pago con rampa simulada → enviado → "Recibí conforme". Verifica 37,58 / 0,77 / 0,12 USD de prueba.
  - **Disputa:** pago → enviado → reclamo → versión del vendedor → árbitro 70/30 (17,54 / 7,52). Antes, prueba un desvío a otra cuenta y comprueba que se rechaza.
- Guarda capturas en `e2e/capturas/` en tamaño celular (390 px, @2x) y escritorio (1280 px).
- En cada captura verifica que la pantalla no diga "cripto".
- Puerto distinto: `E2E_PORT=3200 npm run test:e2e`.

Prueba de humo del backend, sin navegador, con la app corriendo: `BASE_URL=http://localhost:3000 npm run smoke`.

## Arquitectura

```
src/
  app/                    pantallas (App Router) y rutas /api
    page.tsx              landing                    /vender     onboarding (3 pasos)
    panel/                panel del vendedor         p/[slug]/   pago y seguimiento del comprador
    arbitro/              panel del árbitro          como-funciona/  diagrama + contratos
  lib/
    format.ts             montos, comisiones (igual que el contrato), links a stellar.expert
    whatsapp.ts           textos listos para copiar en cada evento
    wallet/               WalletProvider: LocalWallet (llave en el navegador) y PollarWallet
    server/
      config.ts           .env.local (solo testnet)
      db.ts               SQLite (better-sqlite3) en data/pp.db
      stellar.ts          RPC, simulación, fee bump, friendbot, trustline, rampa, saldos
      orders.ts           lógica de pedidos (pago, acciones, envío firmado, árbitro)
      escrow/             EscrowService + DirectEscrowService + GuardianEscrowService
```

- **No custodia.** La llave del usuario vive en su navegador (`localStorage`, una por rol). El flujo de cada transacción:
  1. El servidor la arma y la simula con el usuario como cuenta de origen.
  2. El navegador la firma. Esa firma cubre también la autorización de Soroban.
  3. El servidor la envuelve en un **fee bump** firmado por `plataforma`, que paga la comisión, y la envía.
  4. La plataforma solo patrocina transacciones que ella misma armó (tabla `pending`, por hash).
- **Un escrow por compra.** Al pagar, la plataforma llama `tw_new_single_release_escrow` sobre una instancia "fábrica", que despliega e inicializa en la misma transacción. Los roles son los de SPEC §2.
- **Modos.** Se elige con `PP_MODE=direct|guardian`:

  | Rol | `direct` (temporal) | `guardian` |
  |---|---|---|
  | approver = release_signer | comprador | `pp_guardian` |
  | dispute_resolver | cuenta `arbitro` | `pp_arbiter` |

- **Transparencia.** Cada transacción queda en SQLite con su hash y se muestra con "Ver en Stellar". Cada pedido enlaza su contrato en stellar.expert.

### Activar el modo guardián

Cuando existan los contratos `pp_guardian` y `pp_arbiter` (SPEC §3), agrega a `.env.local`:

```
PP_MODE=guardian
PP_GUARDIAN_ID=C...
PP_ARBITER_ID=C...
```

- `GuardianEscrowService` lee el Spec de cada contrato desde la red y convierte los argumentos por nombre:
  - `fund(escrow, buyer, expected_escrow, amount, window_secs)`
  - `confirm(escrow, buyer)`
  - `dispute(escrow, caller)`
  - `auto_release(escrow)`
  - `resolve(escrow, buyer_bps)`
- Si los nombres reales cambian, se ajustan en un solo lugar: `ARGS`, en `src/lib/server/escrow/guardian.ts`.

### Billetera Pollar

`NEXT_PUBLIC_WALLET=local|pollar`. Con las llaves de `docs-pp/.env.pollar`, `npm run setup` deja `pollar` como billetera principal. Tiene login con Google o email y billetera embebida, sin frases secretas.

- La firma va por `signTx(xdr, { skipSponsorship: true })` y la comisión la patrocina nuestra plataforma con fee bump, igual que con la billetera local.
- Pollar solo acepta el origen `http://localhost:3000`, así que en modo Pollar la app tiene que correr en ese puerto.
- `LocalWallet` (llave en el navegador) es la alternativa y la que usa el e2e.
- Código: `src/lib/wallet/pollar.ts` y `src/components/PollarProviders.tsx`. Estado y pendientes: `DECISIONES.md`, sección Pollar.
