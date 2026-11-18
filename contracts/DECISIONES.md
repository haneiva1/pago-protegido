# Decisiones y hallazgos: pp_guardian y pp_arbiter

Regla aplicada: cuando SPEC.md no decidía algo, tomé la opción más segura para el comprador y para los fondos, y la anoto aquí. Las secciones marcadas **⚠ INTERFAZ** cambian o amplían la interfaz de SPEC §3 y le importan a la sesión de la app.

## ⚠ INTERFAZ: diferencias con SPEC §3

Todo lo de SPEC §3 existe con los mismos nombres y argumentos. Lo nuevo es aditivo:

| Contrato | Qué | Por qué |
|---|---|---|
| `pp_guardian` | **`set_arbiter(arbiter)`** (nuevo nombre) | SPEC dice "configurable por el admin una sola vez" sin darle nombre. Exige auth del admin y falla con `ArbiterAlreadySet` (#2) la segunda vez. Es necesario porque el guardián y el árbitro se referencian mutuamente: primero se despliega el guardián, después el árbitro con el ID del guardián, y al final se llama `set_arbiter`. |
| `pp_guardian` | `fund(...)` **devuelve `Purchase`** | SPEC no fija el retorno. Devolver la compra le ahorra a la app una lectura para obtener el `deadline`. |
| `pp_guardian` | `config() -> GuardianConfig {admin, tw_fee, min_window_secs, max_window_secs, arbiter: Option}` | Lectura para la app. |
| `pp_arbiter` | `resolve(...)` y `refund_unshipped(...)` **devuelven `Split`** `{buyer, seller, balance, buyer_amount, seller_amount}` | Montos brutos del reparto, antes de las comisiones de TW. |
| `pp_arbiter` | **`quote(escrow, buyer_bps) -> Split`** | Solo lectura y sin auth: es la vista previa del slider del panel del árbitro (SPEC §6). Hace las mismas validaciones que `resolve`. |
| `pp_arbiter` | `config() -> ArbiterConfig {admin, guardian, tw_fee}` | Lectura para la app. |
| ambos | Eventos `pp_funded`, `pp_confirmed`, `pp_disputed`, `pp_auto_released`, `pp_arbiter_set`, `pp_resolved`, `pp_refunded_unshipped` y `pp_admin_changed`. El escrow se publica como topic. | Para indexar el historial en la app. |

- **Tipo `Purchase`:** tiene exactamente los campos de SPEC: `{buyer, seller, funded_at, deadline}`. Los tiempos son timestamps del ledger, en segundos.
- **Tipos del escrow en los bindings del guardián:** `bindings/pp_guardian` exporta `Escrow`, `Roles`, `Milestone`, `Flags` y `Trustline`, idénticos a los de TW. Sirven para armar `expected_escrow`.
- **Códigos de error:** están en el enum `Error` de cada `lib.rs` y en `Errors` de los bindings. Los que más va a ver la app:

| Contrato | Error |
|---|---|
| guardián | #4 `WindowOutOfRange` |
| guardián | #5 `PurchaseAlreadyExists` |
| guardián | #7 `NotBuyer` |
| guardián | #8 `NotBuyerOrSeller` |
| guardián | #9 a #11: roles del escrow que no son del modo guardián |
| guardián | #19 `DeadlineNotReached` |
| guardián | #20 `EscrowDisputed` |
| guardián | #21 `EscrowAlreadyReleased` |
| guardián | #23 `NotShipped` |
| árbitro | #1 `InvalidBps` |
| árbitro | #2 `NotInDispute` |
| árbitro | #5 `EmptyEscrow` |
| árbitro | #7 `DeadlineNotReached` |
| árbitro | #8 `AlreadyShipped` |

## Decisiones de implementación

**D-1. Rama y worktree.** Trabajo en `worktree-pp-contracts`, creada desde `worktree-pago-protegido` (la rama del spike). El worktree `pago-protegido` estaba bloqueado por otra sesión. Todo lo nuevo está en `pago-protegido/contracts/`.

**D-2. Tipos del escrow copiados, no `contractimport!`.**
- `contractimport!` genera los tipos con `export = false`. Con eso, el spec de `pp_guardian` referenciaría `Escrow` sin definirlo y los bindings TypeScript quedarían sin ese tipo.
- Por eso `shared/escrow_iface.rs` copia `Escrow`, `Roles`, `Milestone`, `Flags` y `Trustline` campo por campo desde `storage/types.rs` de TW, y define un `contractclient` con las firmas reales de `contract.rs`.
- Se incluye con `include!` en los dos contratos. No uso un crate compartido para que los tipos queden en el spec de cada uno.
- Un `#[contracttype]` struct se serializa como ScMap por nombre de campo, así que es compatible con el escrow real. Los 27 tests contra el WASM real lo demuestran.

**D-3. Tests con el WASM real.**
- `wasm/escrow.wasm` es una copia byte a byte del WASM del spike (sha256 `1b367bc8…196660`, el mismo hash que está subido a testnet). Está versionado con `git add -f`.
- Los tests lo registran con `env.register(ESCROW_WASM, ())`.
- Están en un crate aparte (`integration-tests`), que enlaza los dos contratos de forma nativa sin afectar sus builds WASM.

**D-4. Auth en los tests.**
- `mock_all_auths` simula también la auth de direcciones de contrato. Por eso solo se usa para preparar el escenario.
- Toda aserción de autorización corre con `set_auths(&[])` (auth real, sin firmas) o con `mock_auths` para una dirección concreta.

**D-5. Validaciones extra en `fund`.** Todas fallan antes de mover fondos:
- `expected_escrow` debe ser igual a `get_escrow`. El escrow ya lo valida (`#33`); el guardián lo revisa antes para dar un error propio: `EscrowMismatch` (#16).
- El escrow debe tener exactamente **1 hito** (`NotSingleMilestone`). `confirm` y `auto_release` aprueban el hito 0, y SPEC define un solo hito.
- `service_provider == receiver` (`ServiceProviderNotReceiver`). Si no, quien marca "enviado" no sería quien cobra.
- `buyer != receiver` (`BuyerIsSeller`). Si fueran la misma dirección, el reparto 70/30 quedaría ambiguo, porque las distribuciones son un `Map` por dirección.
- Flags en false y hito sin aprobar (`EscrowNotPristine`).
- `amount == escrow.amount` (`AmountMismatch`). Un fondeo parcial dejaría `release_funds` imposible (`#6`).
- El escrow debe tener **saldo 0 antes de fondear** (`EscrowAlreadyFunded`). Esto evita el doble fondeo y que quede saldo extra atrapado después de liberar.

**D-6. Orden de validaciones.**
- `confirm` y `fund` piden `require_auth` primero, como dice SPEC.
- `dispute` primero valida que `caller` sea el comprador o el vendedor y después pide su auth, también como en SPEC.
- `confirm`, `dispute` y `auto_release` revisan el estado del escrow antes de delegar: liberado (#21), resuelto (#22) o en disputa (#20). Así la app recibe errores del guardián y no los del escrow, que son ambiguos al cruzar contratos.
- En `auto_release`, el estado del escrow se revisa antes que el plazo.

**D-7. `"enviado"` exacto.** `auto_release` y `refund_unshipped` comparan el status del hito 0 con el string exacto `"enviado"`. `"Enviado"` no cuenta, y hay un test que lo cubre. La app debe escribir exactamente `"enviado"`.

**D-8. Redondeo del reparto (invariante 8).**
- Cálculo: `seller_amount = floor(saldo × (10000 − buyer_bps) / 10000)` y `buyer_amount = saldo − seller_amount`. La unidad que sobra, si hay, va al comprador: es quien pagó y nunca es un tercero.
- Después, TW descuenta las comisiones por destinatario con `floor(monto × comisión_total / total)`. Por eso la plataforma y TW reciben como mucho su valor nominal, y el residuo de ese redondeo queda en el comprador o el vendedor.
- Los montos 0 se omiten de las distribuciones, porque TW rechaza montos ≤ 0 (`#38`).
- Lo cubre el test `redondeo_nunca_favorece_a_terceros`, con saldos como 3, 7, 999 y 1 000 000 007 unidades.

**D-9. `tw_fee` fijo en el constructor de ambos contratos.**
- En el spike, la dirección de la comisión de TW la elegía quien llamaba a `release_funds` o `resolve_dispute` (hallazgo 2).
- Ahora, en los flujos que pasan por el guardián o el árbitro, nadie la puede cambiar. En testnet es `twfee`.

**D-10. Poderes de los admins.**
- El admin del guardián solo puede llamar `set_arbiter`, y una vez. Después no tiene ningún poder: el guardián no tiene `set_admin`.
- El admin del árbitro puede llamar `resolve` y `set_admin`. Para `set_admin` basta la firma del admin actual, como dice SPEC.
- En testnet ambos admins son la identidad `arbitro`.

**D-11. `refund_unshipped` implementada (era opcional).**
- No requiere auth. Funciona si hay disputa, venció el plazo y el hito no está en `"enviado"`. Devuelve el 100% al comprador.
- Protege al comprador si el vendedor nunca despacha y el árbitro no actúa.
- El vendedor la bloquea marcando `"enviado"`, y entonces decide el árbitro.
- Aun así, TW cobra comisiones sobre el reembolso: el comprador recupera 146,55 de 150 (ver H-4).

**D-12. TTL.**
- La instancia de cada contrato se extiende a 30 días en cada llamada.
- Cada `Purchase` (storage persistente) se extiende a 120 días: la ventana máxima es de 30 días y queda margen para una disputa.

**D-13. Bindings.**
- Se generaron con `stellar contract bindings typescript`, como pide la tarea. El CLI 30 avisa que el comando está deprecado en favor del CLI de `@stellar/stellar-sdk`.
- `dist/` queda versionado para que la app los use con `file:` sin compilar.
- Se agregó `bindings/tw_escrow` (desde el WASM) porque la app necesita `initialize_escrow` y `change_milestone_status`. No tiene `contractId`.

**D-14. Testnet.**
- El script crea la identidad `tercero` (friendbot + trustline a LABUSD) para los intentos del escenario (d). Necesita trustline para que un rechazo no se pueda atribuir a la falta de trustline.
- `lab` emitió 600 LABUSD al comprador para los 4 escenarios.
- Los intentos que deben fallar los rechaza la simulación, así que no se envían y no tienen hash, igual que en el spike. La evidencia es el stderr de cada uno, en `scripts/out/flujo/fallo-*.txt`.

**D-15. Plazos.**
- `deadline` usa `env.ledger().timestamp()`, no el reloj del servidor.
- El escenario (c) espera hasta `deadline + 5 s` y reintenta la simulación cada 5 s, porque el ledger puede ir unos segundos atrás.

**D-16. Robustez frente al RPC de testnet.** Dos corridas del flujo se cortaron por el RPC, no por los contratos. Sus logs quedan en `scripts/out/flujo-run-1-timeout.log` y `scripts/out/flujo-run-2-lectura-vacia.log`.

| Corrida | Qué pasó | Corrección en el script |
|---|---|---|
| 1 | `Request timeout` de 60 s en `initialize_escrow`, sin hash: la transacción no llegó a firmarse. | `tx()` reintenta hasta 3 veces, pero solo errores de transporte (timeout, conexión, 5xx o 429) que no dejaron hash. Nunca reintenta errores de contrato ni de auth. |
| 2 | La lectura de `get_escrow` inmediatamente después del init volvió vacía: un nodo del RPC todavía no veía el ledger. Los roles eran correctos. | Las lecturas `view` reintentan si la respuesta viene vacía. |

Las instancias huérfanas de esas corridas (un escrow sin inicializar en la corrida 1, y un escrow A completo más un escrow B inicializado en la corrida 2) no tienen fondos o ya se liberaron.

## Hallazgos sobre Trustless Work (no se modificó su código)

**H-1. Bug: `dispute_escrow` no revisa `flags.released`.**
- `validate_dispute_flag_change_conditions` (`core/validators/dispute.rs`) rechaza si el escrow ya está en disputa o resuelto, pero **no si ya se liberó**.
- Por eso, después de liberar, cualquier rol (vendedor, plataforma, approver o release_signer) puede poner `disputed = true` directo en el escrow.
- En nuestro diseño es inofensivo: el saldo es 0 y el árbitro responde `EmptyEscrow`. Pero deja un escrow liberado marcado como "en disputa", y la app debe mostrar `released` con prioridad sobre `disputed`.
- `pp_guardian.dispute` sí lo impide: devuelve `EscrowAlreadyReleased` (#21).
- Lo cubre el test `disputa_directa_tras_liberar_es_inofensiva`. Vale la pena reportarlo a TW.

**H-2. El guardián no puede verificar on-chain que `escrow` sea el WASM de TW.**
- soroban-sdk 28 no tiene API para leer el ejecutable de otro contrato. Un contrato falso podría imitar `get_escrow` con los roles correctos.
- Lo que lo limita: el comprador firma el árbol `fund → fund_escrow → transfer`, que muestra a qué dirección van los fondos.
- **La app debe verificar con RPC** (`getLedgerEntries` de la instancia del contrato → `executable.wasm_hash`) que el escrow ejecuta `1b367bc8…196660` antes de pedir la firma del comprador.

**H-3. `initialize_escrow` no exige firma** (hallazgo 1 del spike).
- Entre el deploy y el init, alguien podría inicializar la instancia con sus propios roles.
- En ese caso `pp_guardian.fund` rechaza el escrow por roles o por `expected_escrow`, así que **los fondos nunca están en riesgo**: el peor caso es un DoS de esa instancia.
- El script verifica los roles después del init.
- La app debería preferir `tw_new_single_release_escrow`, que despliega e inicializa en una sola transacción.

**H-4. Un reembolso también paga comisiones** (hallazgo 3 del spike). Con 100% al comprador, recupera 146,55 de 150: pierde el 2% de la plataforma y el 0,3% de TW. No se cambió: SPEC fija las comisiones y no dice nada sobre reembolsos. → **Pregunta de producto abierta.**

**H-5. La plataforma puede agregar hitos con fondos adentro** (`update_escrow`, hallazgo 8 del spike).
- Si lo hace, `confirm` y `auto_release` dejan de funcionar (`#5 EscrowNotCompleted`), porque el guardián solo aprueba el hito 0.
- No aprueba todos los hitos a propósito: el comprador estaría aprobando hitos que nunca vio.
- Los fondos siguen protegidos: queda la vía de disputa y árbitro, que paga solo al comprador y al vendedor (test `hito_agregado_por_plataforma_no_desvia_fondos`).
- Con fondos, la plataforma **no** puede cambiar el receiver ni los roles (`#33`), y durante una disputa no puede editar nada (`#16`).

**H-6. La plataforma (y el vendedor) pueden disputar directo en el escrow,** sin pasar por el guardián, porque son roles de TW. El invariante 6 se cumple "por el guardián". Abrir una disputa así solo congela los fondos: la resolución sigue acotada al comprador y al vendedor.

**H-7. Tokens enviados directo al escrow antes del `fund`.** El guardián rechaza fondear (`EscrowAlreadyFunded`), así que el comprador no paga nada. Esos tokens quedan en una instancia sin compra registrada, y el árbitro no puede repartirlos porque no hay comprador. No es plata del comprador; queda documentado.

**H-8. Las direcciones de contrato solo se autorizan como invocador directo.**
- `pp_guardian` y `pp_arbiter` no implementan `__check_auth`, así que nadie puede firmar en su nombre.
- Esta es la base del invariante 1: el escrow pide `dispute_resolver.require_auth()`, y eso solo se cumple cuando el propio `pp_arbiter` hace la llamada.
- Escenario (d) en testnet: la llamada directa a `resolve_dispute` en nombre del árbitro falla, tanto para un tercero como para el admin.
