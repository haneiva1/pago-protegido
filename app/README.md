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
- Si el puerto 3000 está ocupado: `PORT=3020 npm run dev`. Pollar tiene registrados `http://localhost:3000` y `http://localhost:3020` como origen y URL de retorno.
- **Modo guardián por defecto** (`PP_MODE=guardian`), con `pp_guardian` `CAOX6JZV…4OZU` y `pp_arbiter` `CBCDVLEP…PWGU` (de `../contracts/deployments/testnet.json`). El modo directo sigue disponible con `PP_MODE=direct`.
- Para producción local: `npm run build && npm start`.

### Demo de 3 minutos (SPEC §7)

1. `/vender`: nombre de la tienda, WhatsApp y "Crear mi billetera". Te lleva a "Tu primer link". Crea "Zapatillas Nike talla 40", Bs 450, 3 días.
2. Abre el link en el celular (o en otra ventana privada): "Pagar protegido" → QR de ejemplo → "Simular pago del banco (testnet)". Cada paso muestra su "Ver en Stellar".
   - Antes de pedir la firma del pago, la app verifica por RPC que el contrato del pedido ejecuta el WASM de Trustless Work (`1b367bc8…`) y tiene los roles `pp_guardian`/`pp_arbiter`. Si todo está bien, muestra el sello **"Contrato verificado"** con link a stellar.expert; si algo falla, bloquea el pago.
3. En `/panel`, marca "enviado" con el código de encomienda.
4. En el link, toca "Recibí conforme": `pp_guardian.confirm` aprueba y libera en una sola operación. Se ven los montos del vendedor (97,7 %), de la plataforma (2 %) y de Trustless Work (0,3 %).
5. Con un segundo link, toca "Tengo un problema" y luego entra a `/arbitro`. La clave es `ARBITRO_PANEL_KEY`, que está en `.env.local`.
   - El slider muestra la vista previa de `pp_arbiter.quote`. Ponlo en 70 %.
   - "Probar: mandar la plata a otra cuenta" simula `escrow.resolve_dispute` con la llave del árbitro hacia una tercera cuenta. **El contrato lo rechaza**: `Error(Contract, #12)`.
   - "Resolver" llama `pp_arbiter.resolve`.
6. **Liberación automática:** entra a `/panel?demo=1` y marca "Plazo corto de demo" (2 minutos). Paga, marca enviado y espera la cuenta regresiva. Al vencer aparece **"Liberar ahora (plazo vencido)"**, que llama a `pp_guardian.auto_release`, sin firmas.

## Test e2e (Playwright, contra testnet)

```bash
npx playwright install chromium   # solo la primera vez
npm run test:e2e
```

- Hace su propio build en `.next-e2e/`, con la billetera local, y lo levanta en `http://localhost:3100` con una base aparte (`data/e2e.db`). No toca tu `npm run dev`.
- Corre en **modo guardián**. Recorre tres escenarios con transacciones reales en testnet y tarda entre 8 y 12 minutos:
  1. **Caso feliz:** onboarding → link → pago con rampa simulada (sello "Contrato verificado") → enviado → "Recibí conforme". Verifica 37,58 / 0,77 / 0,12 USD de prueba.
  2. **Disputa:** pago → enviado → reclamo → versión del vendedor → vista previa con `pp_arbiter.quote` → intento de desvío rechazado por el contrato (`Error(Contract, #12)`) → `pp_arbiter.resolve` 70/30 (17,54 / 7,52).
  3. **Liberación automática:** link con plazo de demo de 2 minutos → pago → enviado → cuenta regresiva → "Liberar ahora (plazo vencido)" → `pp_guardian.auto_release`.
- Modo directo: `PP_MODE=direct npm run test:e2e`.
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
- Pollar acepta los orígenes `http://localhost:3000` y `http://localhost:3020`; en modo Pollar la app tiene que correr en uno de esos puertos.

**Cómo probar el login real (Hans):**

1. En `.env.local`, deja `NEXT_PUBLIC_WALLET=pollar` (lo pone `npm run setup` si existe `docs-pp/.env.pollar`).
2. Corre `PORT=3020 npm run dev` (o `npm run dev` si el 3000 está libre). Si cambiaste `NEXT_PUBLIC_*`, reinicia el servidor.
3. Abre `http://localhost:3020/vender`, completa tienda y WhatsApp y toca **"Ingresar con Google o email y continuar"**.
4. En el modal de Pollar, entra con Google o con tu email (llega un código). La billetera se crea sola y Pollar le agrega la trustline a LABUSD (configurado en el dashboard).
5. La app te lleva a "Tu primer link". Para probar como comprador, abre el link en otro navegador o en una ventana privada e ingresa con **otra** cuenta: Pollar usa la misma billetera para los dos roles y `pp_guardian` rechaza que comprador y vendedor sean la misma (`BuyerIsSeller`).
6. Cada firma pasa por `signTx(xdr, { skipSponsorship: true })` y la comisión la paga nuestra plataforma con fee bump. Si Pollar pide confirmar la firma, acéptala.
7. Verificado automáticamente con Playwright en `PORT=3020`: el modal de login carga sin errores de origen ni CORS (captura `e2e/capturas/50-pollar-modal-login-3020-celular.png`). El modal de Pollar 0.12.0 aparece en inglés; el idioma se configura en el dashboard de Pollar o con `locale` desde la 0.12.1.
- `LocalWallet` (llave en el navegador) es la alternativa y la que usa el e2e.
- Código: `src/lib/wallet/pollar.ts` y `src/components/PollarProviders.tsx`. Estado y pendientes: `DECISIONES.md`, sección Pollar.
