> **Nota:** especificación original del MVP v1 (18-nov), copiada de `stellar-lab/docs-pp/SPEC.md` al crear este repo. Usa el nombre de entonces: el producto ahora se llama Trato (antes Pago Protegido). Lo que cambió después (contratos v2, plazos, segmento) está en el [CHANGELOG](../CHANGELOG.md), en [contracts/DECISIONES.md](../contracts/DECISIONES.md) y en [app/DECISIONES.md](../app/DECISIONES.md). En particular: la tarifa vigente (la protección la paga el comprador, 1,5% con mínimo Bs 5 y tope Bs 50; si el vendedor la regala, 2,3%) y a dónde va la plata (solo al vendedor o de vuelta al comprador; aparte, la comisión fija que se define al crear el pedido) están en el [README](../README.md#tarifa); las llaves, en [README, Llaves](../README.md#llaves). Donde este SPEC dice `platform_fee` = 200 bps, hoy es el caso "Yo la regalo". Las rutas a `stellar-lab/...` y a `vendor/` son de la máquina donde se armó el spike; el WASM de Trustless Work que usan los tests está en [contracts/wasm/](../contracts/wasm/).

# Pago Protegido: SPEC del MVP en testnet (v1, 18-nov-2026)

## 0. Qué es

Pago Protegido son links de pago protegidos para ventas por redes en Bolivia:

1. El vendedor crea un link.
2. El comprador paga y la plata queda en un escrow en Stellar (Trustless Work).
3. Cuando el comprador confirma que recibió, la plata se libera al vendedor.
4. Si hay un problema, se abre una disputa y un árbitro reparte entre comprador y vendedor.

Nadie, ni siquiera la plataforma, puede mandar la plata a otro lado.

Principios no negociables:

1. **NO CUSTODIA.** Las llaves del comprador y del vendedor viven en su dispositivo; en el MVP, en el navegador. El servidor solo tiene tres llaves:
   - la de la plataforma (deploy y fee bump);
   - la del admin del árbitro;
   - la del emisor de la moneda de prueba.
2. **Árbitro acotado.** El árbitro solo puede repartir entre comprador y vendedor (contrato `pp_arbiter`).
3. **Confirmación atómica.** Confirmar es aprobar y liberar en la misma invocación (contrato `pp_guardian`).
4. **Solo testnet.** La rampa de bolivianos está simulada y la pantalla lo dice.

## 1. Entorno (ya existe)

- Stellar CLI 30.0.1, Rust 1.99.1 con target `wasm32v1-none` y soroban-sdk 28 (la versión la fija Trustless Work).
- **Escrow de Trustless Work:**
  - repo `Trustless-Work/Trustless-Work-Smart-Escrow`, rama `single-release-develop`, commit `f0b706e`;
  - clonado y compilado en `/Users/hansaneiva/dev/stellar-lab/.claude/worktrees/pago-protegido/spikes/pago-protegido/vendor`;
  - el WASM está en `vendor/target/wasm32v1-none/release/escrow.wasm`;
  - ya está subido a testnet con hash `1b367bc8476cf80b89f6396e2aa07b602b78361dd829b5ce9b64ada365196660`;
  - cada instancia guarda un solo escrow, así que **cada compra es un deploy** (`tw_new_single_release_escrow`, o deploy + `initialize_escrow`);
  - en ese mismo spike: `RESULTADOS.md` (hallazgos y errores esperados) y `pago-protegido.sh` (comandos que funcionan).
- **Moneda de prueba:** LABUSD, 7 decimales.
  - Emisor: la identidad `lab`.
  - SAC: `CC65P6TQQ646YDXVS3PM6YVZASXW6WM5B67YKI46JH4EG65LJPOGBD4S`.
  - En pantalla se llama "USD de prueba".
- **Identidades de testnet** (`stellar keys`):

  | Identidad | Uso |
  |---|---|
  | `plataforma` | rol platform, deployer y fee bump |
  | `arbitro` | admin del árbitro |
  | `comprador` | solo para scripts |
  | `vendedor` | solo para scripts |
  | `twfee` | recibe el 0,3% de Trustless Work |
  | `lab` | emisor de LABUSD |

- **Endpoints:**
  - RPC: `https://soroban-testnet.stellar.org`
  - Horizon: `https://horizon-testnet.stellar.org`
  - Friendbot.
  - Explorador: `https://stellar.expert/explorer/testnet`

## 2. Roles del escrow

**Modo guardián** (el modo final):

| Rol en Trustless Work | Quién |
|---|---|
| approver | contrato `pp_guardian` |
| release_signer | contrato `pp_guardian` |
| dispute_resolver | contrato `pp_arbiter` |
| service_provider | vendedor |
| receiver | vendedor |
| platform | cuenta `plataforma` |

- `platform_fee` = 200 bps (2%).
- Un solo hito, "Entrega del producto", con status inicial `"pendiente"`.
- El vendedor cambia el hito a `"enviado"` con evidencia: código de encomienda o URL de una foto.

**Modo directo** (temporal, solo para que la app avance antes de que existan los contratos):

- approver = release_signer = comprador;
- dispute_resolver = cuenta `arbitro`.

## 3. Interfaz de los contratos

Los nombres son orientativos; ajusta los tipos al código real de Trustless Work.

### `pp_guardian`

- **`__constructor(admin, tw_fee: Address, min_window_secs: u64, max_window_secs: u64)`**
- **`fund(escrow, buyer, expected_escrow: Escrow, amount: i128, window_secs: u64)`**
  1. Exige `buyer.require_auth()`.
  2. Valida que `min ≤ window_secs ≤ max`.
  3. Valida que el escrow tenga al guardián como approver y release_signer, y a `pp_arbiter` como dispute_resolver. El guardián guarda la dirección del árbitro, configurable por el admin una sola vez.
  4. Registra `Purchase { buyer, seller (= roles.receiver), funded_at, deadline = now + window_secs }`.
  5. Llama `escrow.fund_escrow(buyer, expected_escrow, amount)`.
  6. Falla si ya hay una compra registrada para ese escrow.
- **`confirm(escrow, buyer)`**
  1. Exige `buyer.require_auth()`.
  2. Valida que `buyer == Purchase.buyer`.
  3. En la misma invocación llama `escrow.approve_milestone(0, guardián)` y `escrow.release_funds(guardián, tw_fee)`.
- **`dispute(escrow, caller)`**
  1. Exige que `caller` sea `Purchase.buyer` o `Purchase.seller`.
  2. Exige `caller.require_auth()`.
  3. Llama `escrow.dispute_escrow(guardián)`.
- **`auto_release(escrow)`**: no requiere auth. Aprueba y libera solo si se cumplen todas estas condiciones:
  - `now ≥ deadline`;
  - no hay disputa;
  - no está liberado;
  - el status del hito 0 es `"enviado"`.
- **`purchase(escrow) -> Option<Purchase>`**

### `pp_arbiter`

- **`__constructor(admin, guardian, tw_fee)`**
- **`resolve(escrow, buyer_bps: u32)`**
  1. Exige `admin.require_auth()`.
  2. Valida que `bps ≤ 10000` y que el escrow esté en disputa.
  3. Toma `buyer` de `guardian.purchase(escrow)` y `seller` de `escrow.roles.receiver`.
  4. Lee el saldo con el balance del token en el escrow.
  5. Arma las distribuciones solo hacia esas dos direcciones, omitiendo los montos 0.
  6. Llama `escrow.resolve_dispute(árbitro, tw_fee, distribuciones)`.
- **`refund_unshipped(escrow)`** (opcional): no requiere auth. Si el escrow está en disputa, el status no es `"enviado"` y `now ≥ deadline`, devuelve el 100% al comprador.
- **`set_admin(new_admin)`**: exige auth del admin.

**No debe existir ninguna función pública que permita elegir direcciones de destino.**

## 4. Invariantes

Cada invariante necesita al menos un test, con el WASM real de Trustless Work.

1. El árbitro nunca puede enviar fondos a una dirección distinta del comprador registrado y del vendedor (receiver).
2. Solo el admin puede llamar `resolve`, y solo con el escrow en disputa.
3. Solo el comprador registrado puede ejecutar `confirm`. Después de `confirm` el escrow queda liberado, sin ventana para disputar después de aprobar.
4. `auto_release` falla antes del deadline, si hay disputa o si el hito no está en `"enviado"`.
5. `fund` funciona una sola vez por escrow, y el plazo debe estar dentro de [min, max].
6. Por el guardián, solo el comprador o el vendedor pueden abrir una disputa.
7. Si el escrow no tiene los roles del modo guardián, `fund` falla.
8. El reparto suma el saldo del escrow. El redondeo queda documentado y nunca favorece a un tercero.
9. Las comisiones del caso feliz y de la disputa quedan documentadas con números reales: plataforma 2%, Trustless Work 0,3%.

## 5. Arquitectura de la app (`pago-protegido/app/`)

- **Stack:** Next.js (App Router), TypeScript, Tailwind, `@stellar/stellar-sdk` y SQLite con better-sqlite3 en `app/data/`.
- **`EscrowService`** (interfaz) con dos implementaciones:
  - `DirectEscrowService`: modo directo.
  - `GuardianEscrowService`: modo guardián, con los bindings de `pago-protegido/contracts/bindings` o invocando con stellar-sdk.
  - Se elige con `PP_MODE=direct|guardian`.
- **`WalletProvider`** (interfaz). En el MVP se implementa como `LocalWallet`:
  - un keypair generado en el navegador y guardado en localStorage;
  - la llave nunca sale del navegador;
  - el servidor arma la transacción, el navegador firma la transacción y las auth entries de Soroban, y el servidor la envuelve en un fee bump con la llave `plataforma` y la envía.
  - Hay que dejar listo el punto de integración para `PollarWallet` (login con Google o email, billetera embebida, patrocinio). Si existe `POLLAR_API_KEY` en `.env.local`, intentar la integración con `@pollar/core` y `@pollar/react`. El README de npm documenta `createPollarAdapterHook('trustlessWork')`.
- **Rampa simulada:**
  - "Pagar con QR" muestra un QR de ejemplo y un botón "Simular pago del banco (testnet)".
  - El servidor emite LABUSD desde `lab` a la billetera del comprador por el equivalente en Bs. El tipo de cambio es configurable (por defecto 11,70 Bs por USD) y la pantalla muestra ambos montos.
  - Etiqueta visible: "Rampa simulada en testnet. En producción la hace una entidad certificada por ASFI."
- **Cuentas nuevas:** friendbot y trustline a LABUSD.
- **Transparencia:** cada transacción guarda su hash y muestra "Ver en Stellar" (stellar.expert testnet).
- **Deploy del escrow:** al iniciar el pago, el servidor despliega la instancia con la llave `plataforma` y los roles de la sección 2.

## 6. Pantallas y textos

Todo en español, simple, mobile-first y sin jerga cripto.

### "/" Landing para vendedores

- Título: "Vende por redes sin que desconfíen de ti."
- Bajada: "Tu cliente paga por adelantado y su plata queda protegida hasta que recibe. Tú cobras seguro y sin comprobantes falsos."
- Botón: "Crear mi link".

### "/vender" Onboarding

- Máximo 3 pasos: nombre de la tienda, WhatsApp y billetera (se crea sola).
- Después lleva a "Tu primer link".

### "/panel" Vendedor

- **Crear link:** producto, descripción corta, foto opcional (URL), precio en Bs y días de entrega (1 a 15).
- **Pedidos**, con estos estados: Esperando pago, Pagado (despacha), Enviado, Liberado, En disputa, Resuelto.
- **"Marcar como enviado"**, con código de encomienda o foto.
- **Saldo** en USD de prueba.
- **Copiar link** y **"Compartir por WhatsApp"** (wa.me con el texto listo).

### "/p/[slug]" Comprador

- **Antes de pagar:**
  - producto y precio en Bs (≈ USD);
  - vendedor: nombre, WhatsApp y ventas completadas;
  - bloque "Cómo te protegemos": pagas → tu plata queda guardada en un contrato que nadie puede tocar → se libera cuando confirmas, o un árbitro decide si hay problema;
  - botón "Pagar protegido".
- **Después de pagar:**
  - línea de tiempo del pedido;
  - el plazo de liberación automática;
  - botones "Recibí conforme" y "Tengo un problema" (motivo, texto y foto opcional).

### "/arbitro" Panel del árbitro

- Disputas abiertas, con la evidencia de ambos lados y el estado on-chain.
- Slider "% para el comprador" (0 a 100) con vista previa de los montos.
- Botón "Resolver".
- Texto fijo: "El árbitro solo puede repartir entre comprador y vendedor. El contrato no permite otro destino."

### "/como-funciona"

- Diagrama del flujo con links a los contratos en stellar.expert.

### Mensajes de WhatsApp

- En cada evento, un texto listo para copiar. El bot real viene después.

## 7. Demo de 3 minutos (la app debe permitirla)

1. El vendedor crea el link "Zapatillas Nike talla 40, Bs 450, entrega en 3 días" en 30 segundos o menos.
2. El comprador abre el link en el celular y paga con el QR simulado. El escrow queda fondeado, con link a stellar.expert.
3. El vendedor marca "enviado" con el código de encomienda.
4. El comprador toca "Recibí conforme" y el vendedor recibe al instante. Se ven los montos del vendedor, la plataforma y Trustless Work.
5. En un segundo pedido se abre una disputa y el árbitro reparte 70/30. Se muestra que el contrato rechaza mandar la plata a otra dirección.
