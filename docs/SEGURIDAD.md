# Seguridad de Pago Protegido (contratos, testnet)

> **Resumen para el jurado**
> 1. La plata del comprador queda en un escrow de Trustless Work. Los roles que la mueven (aprobar, liberar y resolver) son contratos nuestros sin llave privada, así que nadie puede firmar por ellos.
> 2. El árbitro solo elige un porcentaje. El contrato reparte únicamente entre el comprador registrado y el vendedor, y no existe ninguna función que acepte otra dirección de destino.
> 3. Confirmar es aprobar y liberar en la misma transacción. Si el vendedor despachó y el comprador no responde, el pago se libera solo al vencer el plazo, y cualquiera puede dispararlo.
> 4. Los 9 invariantes tienen tests (27 en total) contra el WASM real de Trustless Work. Además, 5 ataques reales en testnet fueron rechazados y el saldo del atacante no cambió.
> 5. Encontramos un bug en Trustless Work (H-1). Es inofensivo en nuestro diseño y lo documentamos para reportarlo. Antes de mainnet faltan una auditoría, un multisig para el admin y la gestión de TTL.

Todo lo de este documento corre **solo en testnet**. Código: [`contracts/`](../contracts/). Despliegue y transacciones: [`contracts/DEPLOYED.md`](../contracts/DEPLOYED.md). Decisiones: [`contracts/DECISIONES.md`](../contracts/DECISIONES.md).

## 1. Modelo de amenazas

**Activos:**
- el saldo de cada escrow (el pago del comprador);
- la integridad del reparto: que solo pueda ir al comprador y al vendedor;
- la disponibilidad: que los fondos no queden atrapados.

**Supuestos:**
- el escrow de TW es el WASM `1b367bc8…196660` (commit `f0b706e`);
- Stellar/Soroban y el SAC de LABUSD funcionan según su especificación;
- las llaves del comprador y del vendedor viven en sus dispositivos.

| Actor | Qué podría intentar | Qué lo impide | Evidencia |
|---|---|---|---|
| **Tercero** sin rol | Llevarse los fondos con `resolve_dispute`, `release_funds` o `pp_arbiter.resolve` | En el escrow, esos roles son contratos y nadie puede firmar por ellos. `pp_arbiter.resolve` exige la firma del admin. | testnet (d5–d7); tests `no_existe_via_directa_al_escrow` y `resolve_solo_admin` |
| **Admin del árbitro** (llave comprometida o malicioso) | Mandar los fondos a su cuenta | `resolve` solo acepta `buyer_bps` y el destino sale de `Purchase.buyer` y `roles.receiver`. No puede llamar al escrow en nombre del árbitro. | testnet (d8); tests `resolve_nunca_paga_a_terceros` y `redondeo_nunca_favorece_a_terceros` |
| | Resolver sin que haya disputa | `NotInDispute` | test `resolve_solo_con_disputa_abierta` |
| | Favorecer injustamente a una parte | **Riesgo residual**: es su función. Se mitiga con evidencia pública y un multisig en mainnet. | — |
| **Plataforma** (servidor comprometido) | Cambiar el receiver con fondos adentro | TW lo rechaza (`#33`, y `#16` durante una disputa) | testnet (d9); test `no_existe_via_directa_al_escrow` |
| | Agregar hitos para bloquear `confirm` | Los fondos siguen yendo solo al comprador o al vendedor vía disputa. | test `hito_agregado_por_plataforma_no_desvia_fondos` |
| | Inicializar el escrow con roles propios | `fund` exige los roles del modo guardián, `expected_escrow` idéntico y saldo 0. | test `fund_falla_sin_roles_del_modo_guardian` |
| **Vendedor** | Aprobar o liberar su propio pago | El approver y el release_signer son el guardián, y `confirm` es solo para el comprador registrado. | test `confirm_solo_comprador_registrado`; spike C2 |
| | Liberar sin haber despachado | `auto_release` exige el hito en `"enviado"` y el plazo vencido. | tests `auto_release_*` |
| **Comprador** | Disputar después de recibir y confirmar | `confirm` aprueba y libera en la misma transacción, así que después no queda nada que disputar. | testnet (a6, `#21`); test `sin_disputa_despues_de_confirm` |
| | No responder nunca | `auto_release` libera al vendedor cuando vence el plazo. | testnet (escenario c) |
| **Escrow falso** que imita la interfaz de TW | Que el comprador fondee un contrato del atacante | **Riesgo residual (H-2)**: el guardián no puede leer el WASM de otro contrato. La app debe verificarlo por RPC antes de pedir la firma. | — |
| **Front-running** del `initialize_escrow` | Inicializar la instancia con otros roles | `fund` lo rechaza. Solo es un DoS de esa instancia. Mitigación: `tw_new_single_release_escrow`. | DECISIONES H-3 |
| **Bloqueo de fondos** | Dejar fondos atrapados por falta de árbitro o un vendedor que nunca despacha | `refund_unshipped` (sin auth) devuelve el 100% al comprador. `auto_release` (sin auth) paga al vendedor. | test `refund_unshipped_reglas`; compra de ejemplo p6 |

## 2. Invariantes (SPEC §4) y sus tests

Todos los tests están en `contracts/integration-tests/tests/invariantes.rs` y corren con `cargo test` contra el **WASM real** de Trustless Work. Las aserciones de autorización usan auth real (`set_auths` o `mock_auths`), no `mock_all_auths`.

| # | Invariante | Tests |
|---|---|---|
| 1 | El árbitro nunca envía fondos a una dirección distinta del comprador registrado y del vendedor | `resolve_nunca_paga_a_terceros` (8 valores de bps), `no_existe_via_directa_al_escrow`, `hito_agregado_por_plataforma_no_desvia_fondos`, `disputa_directa_tras_liberar_es_inofensiva` |
| 2 | Solo el admin llama `resolve`, y solo con el escrow en disputa | `resolve_solo_admin`, `resolve_solo_con_disputa_abierta`, `resolve_bps_invalido_y_montos_cero`, `set_admin_transfiere_el_poder` |
| 3 | Solo el comprador registrado ejecuta `confirm`, y después de confirmar el escrow queda liberado sin ventana para disputar | `confirm_solo_comprador_registrado`, `sin_disputa_despues_de_confirm`, `arboles_de_auth_de_fund_y_confirm`, `caso_feliz_confirm_libera_con_comisiones_exactas` |
| 4 | `auto_release` falla antes del deadline, con disputa o sin "enviado" | `auto_release_falla_antes_del_deadline`, `auto_release_falla_si_no_esta_enviado`, `auto_release_falla_con_disputa`, `auto_release_tras_deadline_sin_auth` |
| 5 | `fund` funciona una vez por escrow y el plazo debe estar en [min, max] | `fund_una_sola_vez`, `fund_ventana_dentro_de_min_max`, `fund_exige_firma_del_comprador`, `fund_otras_validaciones` |
| 6 | Por el guardián, solo el comprador o el vendedor abren una disputa | `disputa_solo_comprador_o_vendedor` |
| 7 | Sin los roles del modo guardián, `fund` falla | `fund_falla_sin_roles_del_modo_guardian`, `fund_otras_validaciones` |
| 8 | El reparto suma el saldo del escrow y el redondeo nunca favorece a un tercero | `redondeo_nunca_favorece_a_terceros`, `resolve_nunca_paga_a_terceros`, `resolve_70_30_montos_exactos` |
| 9 | Comisiones documentadas con números reales (2% y 0,3%) | `caso_feliz_confirm_libera_con_comisiones_exactas`, `resolve_70_30_montos_exactos`, `auto_release_tras_deadline_sin_auth`; montos on-chain en DEPLOYED.md |

## 3. Los 5 ataques del escenario (d) en testnet

`scripts/flujo-testnet.sh` (escenario d) preparó el ataque así:

- desplegó el escrow [`CDYMQQKL…5IODWQMP`](https://stellar.expert/explorer/testnet/contract/CDYMQQKLWS6J3LS3RV2Y2H2UEIKGZ4Q5CPB3LQAS5DUWO54N5IODWQMP);
- el comprador lo fondeó con 150 LABUSD ([tx `62c85bbb…`](https://stellar.expert/explorer/testnet/tx/62c85bbb11d28217ca2355653e23b5f4ded62af046583a06ccb26b89f38a2408));
- el vendedor abrió una disputa por el guardián ([tx `e41bbbbd…`](https://stellar.expert/explorer/testnet/tx/e41bbbbd513ef22e35207d89210d466fb31056791bf0ae8faebd560e585685b4)).

Después, la cuenta `tercero` ([`GBQBD3KM…LDZF`](https://stellar.expert/explorer/testnet/account/GBQBD3KM7EGOZAI7QTFF43RTHEZ7ZKMGBHQDHPJ5OPT6CZCLBP57LDZF), con trustline a LABUSD para que el rechazo no se pueda atribuir a la falta de trustline) intentó llevarse el saldo. Los 5 intentos los rechaza la **simulación** de Soroban, así que no llegan a enviarse ni tienen hash. Su evidencia es el stderr completo, guardado en `contracts/scripts/out/flujo/fallo-d-d*.txt`.

| # | Ataque | Resultado |
|---|---|---|
| d5 | `tercero` llama `pp_arbiter.resolve(escrow, 0)` | ❌ `Missing signing key for account GBCSZ6…` (falta la firma del admin) |
| d6 | `tercero` llama `escrow.resolve_dispute` declarándose dispute_resolver, con todo para él | ❌ `Error(Contract, #12)` `OnlyDisputeResolverCanExecuteThisFunction` |
| d7 | `tercero` llama `escrow.resolve_dispute` en nombre de `pp_arbiter` | ❌ `Contract addresses are not supported to sign auth entries` |
| d8 | El **admin del árbitro** llama `escrow.resolve_dispute` en nombre de `pp_arbiter` hacia `tercero` | ❌ igual que d7: ni el admin puede firmar por el contrato |
| d9 | La plataforma cambia el receiver a `tercero` con `update_escrow` | ❌ `Error(Contract, #16)` `EscrowOpenedForDisputeResolution` |

Al final, el árbitro cerró la disputa por la vía legítima, 50/50 ([tx `a630b7ff…`](https://stellar.expert/explorer/testnet/tx/a630b7ffa31ede4d95664fe43e8e42ed196791e647e37f69ce0d5ae4a982b648)): comprador y vendedor recibieron 73,275 LABUSD cada uno y **el saldo de `tercero` no cambió** (0 → 0, en `scripts/out/flujo/saldos.tsv`).

Antes de los ataques, el script también verificó sobre la interfaz on-chain de `pp_arbiter` (d0) que ninguna función acepta un destino:

```
quote(escrow: address, buyer_bps: u32); config(); resolve(escrow: address, buyer_bps: u32);
set_admin(new_admin: address); __constructor(admin, guardian, tw_fee: address); refund_unshipped(escrow: address)
```

## 4. Hallazgos

### H-1: Trustless Work permite disputar un escrow ya liberado (bug de TW)

`dispute_escrow` valida `disputed` y `resolved`, pero **no `released`** (`core/validators/dispute.rs`, `validate_dispute_flag_change_conditions`). Por eso, después de una liberación, cualquier dirección con rol en el escrow (vendedor, plataforma) puede ponerle `disputed = true` llamando directo al escrow.

- **Reproducido en testnet** con la compra de ejemplo p1. El escrow quedó con `released = true` y `disputed = true` a la vez. Hashes y pasos en el [reporte para Trustless Work](reporte-trustless-work.md).
- **Impacto en Pago Protegido: ninguno sobre los fondos**, porque el saldo es 0 y el árbitro responde `EmptyEscrow`. `pp_guardian.dispute` lo bloquea con `EscrowAlreadyReleased` (#21). La app debe mostrar "liberado" por encima de "en disputa".
- **Test:** `disputa_directa_tras_liberar_es_inofensiva`.

### H-2: el guardián no puede verificar on-chain que el escrow sea el de Trustless Work

soroban-sdk 28 no tiene API para leer el WASM de otro contrato. Un contrato falso podría imitar `get_escrow` con los roles correctos para que el comprador lo fondee.

- **Mitigaciones:**
  - el comprador firma el árbol de auth `fund → fund_escrow → transfer`, que muestra a qué contrato van los fondos;
  - **la app debe verificar por RPC** que la instancia ejecuta el WASM `1b367bc8…196660` (`getLedgerEntries` de la instancia → `executable.wasm_hash`) antes de pedir la firma.
- **Alternativa para mainnet:** que la plataforma despliegue con `tw_new_single_release_escrow` desde una instancia conocida, o un `pp_factory` que despliegue el WASM fijo y registre las instancias legítimas para que el guardián las consulte.

Otros hallazgos menores (H-3 a H-8) están en [`contracts/DECISIONES.md`](../contracts/DECISIONES.md).

## 5. Qué falta para mainnet

| Tema | Estado en testnet | Qué hace falta |
|---|---|---|
| **Auditoría** | Tests propios con el WASM real, sin revisión externa | Auditoría independiente de `pp_guardian`, `pp_arbiter` y de su integración con TW (en especial reentrada entre contratos, árboles de auth y redondeo). También revisar la versión de TW que se use en mainnet. |
| **Admin del árbitro** | Una sola llave (`arbitro`) | Multisig en la cuenta admin (por ejemplo 2 de 3, con umbrales de Stellar) o un contrato de cuenta con política. `set_admin` ya existe para migrar. Conviene además un registro público de resoluciones con su evidencia. |
| **Admin del guardián** | Solo puede `set_arbiter`, una vez | Fijar el árbitro en el mismo flujo de despliegue para que no quede ventana. |
| **TTL y renta** | Instancias extendidas 30 días por llamada, `Purchase` 120 días, escrow de TW 1 año (su código) | Un bot que extienda el TTL de la instancia y del código WASM de los contratos (`extend_ttl`) y monitoree los vencimientos. Definir quién paga la renta. |
| **Verificación del escrow (H-2)** | Responsabilidad de la app | Verificar el WASM antes de cada firma, o una factory on-chain. |
| **Inicialización atómica (H-3)** | deploy + init en dos transacciones | `tw_new_single_release_escrow` o una factory propia. |
| **Bug H-1 de TW** | Reportado (borrador) | Esperar el fix de TW o mantener la guarda en el guardián (ya existe). |
| **Comisiones en reembolsos** | TW cobra 2,3% también al devolver | Decisión de producto (H-4): `platform_fee` diferenciado u otro mecanismo. |
| **Moneda** | LABUSD de prueba | USDC real, verificando su SAC. |
| **Actualizaciones** | Los contratos no son actualizables (no exponen `update_current_contract_wasm`) | Mantenerlos así (es más seguro) y versionar con despliegues nuevos. |
| **Monitoreo** | Script de métricas sobre `getEvents` (ventana de ~7 días del RPC) | Un indexador persistente y alertas ante disputas, resoluciones atípicas y cambios de admin. |
