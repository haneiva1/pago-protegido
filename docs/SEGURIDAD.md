# Seguridad de Pago Protegido (contratos, testnet)

> **Resumen para el jurado**
> 1. La plata del comprador queda en un escrow de Trustless Work. Los roles que la mueven (aprobar, liberar y resolver) son contratos nuestros sin llave privada, así que nadie puede firmar por ellos.
> 2. El árbitro solo elige un porcentaje. El contrato reparte únicamente entre el comprador registrado y el vendedor, y no existe ninguna función que acepte otra dirección de destino.
> 3. Confirmar es aprobar y liberar en la misma transacción. Si el vendedor despachó y el comprador no responde, el pago se libera solo al vencer el plazo, y cualquiera puede dispararlo.
> 4. Los 9 invariantes y los hallazgos del red team sobre Trustless Work tienen tests (38 en total, v2) contra el WASM real de Trustless Work. En testnet se rechazaron 9 desvíos con v2 (y 5 ataques con v1), y el saldo del tercero no cambió.
> 5. Usamos la v1 del escrow single-release de Trustless Work. H-1 es un hallazgo comunicado al equipo de Trustless Work: en la v1, un escrow ya liberado se puede marcar en disputa sin mover fondos; la v2 de Trustless Work ya lo impide, y `pp_guardian` también lo bloquea (#21). Antes de mainnet faltan una auditoría, un multisig para el admin, una billetera recuperable para el comprador y la gestión de TTL.

Todo lo de este documento corre **solo en testnet**. Código: [`contracts/`](../contracts/). Despliegue y transacciones: [`contracts/DEPLOYED.md`](../contracts/DEPLOYED.md). Decisiones: [`contracts/DECISIONES.md`](../contracts/DECISIONES.md).

## 1. Modelo de amenazas

**Activos:**
- el saldo de cada escrow (el pago del comprador);
- la integridad del reparto: que solo pueda ir al comprador y al vendedor;
- la disponibilidad: que los fondos no queden atrapados.

**Supuestos:**
- el escrow de TW es el WASM `1b367bc8…196660` (commit `f0b706e`);
- Stellar/Soroban y el SAC de LABUSD funcionan según su especificación;
- la plataforma no tiene las llaves del comprador ni del vendedor. En testnet, el comprador firma con una llave creada en su navegador, y el vendedor entra con la billetera embebida de Pollar (o con una llave local en el navegador). Qué llaves tiene el servidor y qué puede hacer cada una: [README, Llaves](../README.md#llaves).

| Actor | Qué podría intentar | Qué lo impide | Evidencia |
|---|---|---|---|
| **Tercero** sin rol | Llevarse los fondos con `resolve_dispute`, `release_funds` o `pp_arbiter.resolve` | En el escrow, esos roles son contratos y nadie puede firmar por ellos. `pp_arbiter.resolve` exige la firma del admin. | testnet (d5–d7); tests `no_existe_via_directa_al_escrow` y `resolve_solo_admin` |
| **Admin del árbitro** (llave comprometida o malicioso) | Mandar los fondos a su cuenta | `resolve` solo acepta `buyer_bps` y el destino sale de `Purchase.buyer` y `roles.receiver`. No puede llamar al escrow en nombre del árbitro. | testnet (d8); tests `resolve_nunca_paga_a_terceros` y `redondeo_nunca_favorece_a_terceros` |
| | Resolver sin que haya disputa | `NotInDispute` | test `resolve_solo_con_disputa_abierta` |
| | Favorecer injustamente a una parte | **Riesgo residual**: es su función. Se mitiga con evidencia pública y un multisig en mainnet. | — |
| **Plataforma** (servidor comprometido) | Cambiar el receiver con fondos adentro | TW lo rechaza (`#33`, y `#16` durante una disputa) | testnet (d9); test `no_existe_via_directa_al_escrow` |
| | Agregar hitos para bloquear `confirm` | Los fondos siguen yendo solo al comprador o al vendedor vía disputa. | test `tw2_hito_agregado_confirm_aprueba_todos_y_libera`, `tw2_hito_con_status_vacio_queda_la_disputa` |
| | Inicializar el escrow con roles propios | `fund` exige los roles del modo guardián, `expected_escrow` idéntico y saldo 0. | test `fund_falla_sin_roles_del_modo_guardian` |
| **Vendedor** | Aprobar o liberar su propio pago | El approver y el release_signer son el guardián, y `confirm` es solo para el comprador registrado. | test `confirm_solo_comprador_registrado`; spike C2 |
| | Liberar sin haber despachado | `auto_release` exige el hito en `"enviado"` y el plazo vencido. | tests `auto_release_*` |
| **Comprador** | Disputar después de recibir y confirmar | `confirm` aprueba y libera en la misma transacción, así que después no queda nada que disputar. | testnet (a6, `#21`); test `sin_disputa_despues_de_confirm` |
| | No responder nunca | `auto_release` libera al vendedor cuando vence el plazo. | testnet (escenario c) |
| **Escrow falso** que imita la interfaz de TW | Que el comprador fondee un contrato del atacante | **Riesgo residual (H-2, TW-4)**: el guardián no puede leer el WASM de otro contrato. La app verifica por RPC el hash del WASM y los roles antes de pedir la firma; si no coinciden, bloquea el pago. | `verifyEscrowInstance` en `app/src/lib/server/escrow/tw.ts`; [app/DECISIONES.md](../app/DECISIONES.md) §35 |
| **Front-running** del `initialize_escrow` | Inicializar la instancia con otros roles | `fund` lo rechaza. Solo es un DoS de esa instancia. Mitigación: `tw_new_single_release_escrow`. | DECISIONES H-3 |
| **Bloqueo de fondos** | Dejar fondos atrapados por falta de árbitro o un vendedor que nunca despacha | `refund_unshipped` (sin auth) devuelve el 100% al comprador. `auto_release` (sin auth) paga al vendedor. | test `refund_unshipped_por_plazo_de_despacho`; compra de ejemplo p6 |

## 2. Invariantes (SPEC §4) y sus tests

Todos los tests están en `contracts/integration-tests/tests/invariantes.rs` y corren con `cargo test` contra el **WASM real** de Trustless Work. Las aserciones de autorización usan auth real (`set_auths` o `mock_auths`), no `mock_all_auths`.

| # | Invariante | Tests |
|---|---|---|
| 1 | El árbitro nunca envía fondos a una dirección distinta del comprador registrado y del vendedor | `resolve_nunca_paga_a_terceros` (8 valores de bps), `no_existe_via_directa_al_escrow`, `tw2_hito_agregado_confirm_aprueba_todos_y_libera`, `tw2_hito_con_status_vacio_queda_la_disputa`, `disputa_directa_tras_liberar_es_inofensiva` |
| 2 | Solo el admin llama `resolve`, y solo con el escrow en disputa | `resolve_solo_admin`, `resolve_solo_con_disputa_abierta`, `resolve_bps_invalido_y_montos_cero`, `set_admin_transfiere_el_poder` |
| 3 | Solo el comprador registrado ejecuta `confirm`, y después de confirmar el escrow queda liberado sin ventana para disputar | `confirm_solo_comprador_registrado`, `confirm_exige_envio_registrado`, `sin_disputa_despues_de_confirm`, `arboles_de_auth_de_fund_ship_y_confirm`, `caso_feliz_fund_ship_confirm_comisiones_exactas` |
| 4 | `auto_release` se rechaza antes del deadline, con disputa o sin "enviado". En v2, "enviado" quiere decir registrado con `mark_shipped`, y el deadline es `release_at`. | `auto_release_falla_sin_envio_y_antes_de_release_at`, `auto_release_falla_con_disputa`, `tw1_disputa_de_platform_bloquea_auto_release`, `extend_suma_inspect_y_solo_una_vez`, `auto_release_tras_release_at_sin_auth` |
| 5 | `fund` funciona una vez por escrow y los plazos deben estar en [min, max]. En v2 son dos: despacho y revisión. | `fund_una_sola_vez`, `fund_ventanas_dentro_de_min_max`, `fund_exige_firma_del_comprador`, `fund_otras_validaciones` |
| 6 | Por el guardián, solo el comprador o el vendedor abren una disputa | `disputa_solo_comprador_o_vendedor` |
| 7 | Sin los roles del modo guardián, `fund` falla | `fund_falla_sin_roles_del_modo_guardian`, `fund_otras_validaciones` |
| 8 | El reparto suma el saldo del escrow y el redondeo nunca favorece a un tercero | `redondeo_nunca_favorece_a_terceros`, `resolve_nunca_paga_a_terceros`, `resolve_70_30_montos_exactos` |
| 9 | Comisiones documentadas con números reales (2% y 0,3%) | `caso_feliz_fund_ship_confirm_comisiones_exactas`, `resolve_70_30_montos_exactos`, `auto_release_tras_release_at_sin_auth`; montos on-chain en DEPLOYED.md |

## 3. Los 5 ataques del escenario (d) en testnet (v1)

> Con los contratos v2 la prueba se repitió con **9 desvíos**, todos rechazados: ver la tabla de [Evidencia del README](../README.md#evidencia) y [`contracts/DEPLOYED.md`](../contracts/DEPLOYED.md). Esta sección es la corrida de v1.

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

### H-1: en la v1 de Trustless Work, un escrow ya liberado se puede marcar en disputa

**Hallazgo comunicado al equipo de Trustless Work.** Usamos la v1 del escrow single-release (commit `f0b706e`). En la v1, `dispute_escrow` valida `disputed` y `resolved`, pero **no `released`** (`core/validators/dispute.rs`, `validate_dispute_flag_change_conditions`). Por eso, después de una liberación, cualquier dirección con rol en el escrow (vendedor, plataforma) puede ponerle `disputed = true` llamando directo al escrow.

- **Reproducido en testnet** con la compra de ejemplo p1. El escrow quedó con `released = true` y `disputed = true` a la vez. Hashes y pasos en la [nota técnica de H-1](reporte-trustless-work.md).
- **La v2 de Trustless Work ya lo impide** (`single-release-develop-v2` y `single-release-main-v2` responden `EscrowAlreadyReleased`). Pendiente: evaluar la migración a la v2 (plan de 30 días).
- **Impacto en Pago Protegido: ninguno sobre los fondos**, porque el saldo es 0 y el árbitro responde `EmptyEscrow`. `pp_guardian.dispute` lo bloquea con `EscrowAlreadyReleased` (#21). La app debe mostrar "liberado" por encima de "en disputa".
- **Test:** `disputa_directa_tras_liberar_es_inofensiva`.

### H-2: el guardián no puede verificar on-chain que el escrow sea el de Trustless Work

soroban-sdk 28 no tiene API para leer el WASM de otro contrato. Un contrato falso podría imitar `get_escrow` con los roles correctos para que el comprador lo fondee.

- **Mitigaciones:**
  - el comprador firma el árbol de auth `fund → fund_escrow → transfer`, que muestra a qué contrato van los fondos;
  - **la app debe verificar por RPC** que la instancia ejecuta el WASM `1b367bc8…196660` (`getLedgerEntries` de la instancia → `executable.wasm_hash`) antes de pedir la firma.
- **Lo que hace hoy la app:** antes de pedir la firma del pago, baja el WASM de la instancia por RPC, compara su sha256 con `1b367bc8…196660` y revisa los roles. Si algo no coincide, muestra "Pago bloqueado" y no arma la transacción (ver TW-4 en §4b).
- **Alternativa para mainnet:** un `pp_factory` propio que despliegue el WASM fijo y registre las instancias legítimas para que el guardián las consulte. Desplegar con `tw_new_single_release_escrow` no alcanza solo, porque esa función despliega el hash que reciba (TW-4).

Otros hallazgos menores (H-3 a H-8) están en [`contracts/DECISIONES.md`](../contracts/DECISIONES.md).

## 4b. Red team de Trustless Work (TW-1 a TW-5) y cómo los cubre v2

El red team revisó el código de la v1 de TW (commit `f0b706e`). Son **decisiones de diseño de un escrow genérico, no errores**: el escrow deja que las partes elijan roles, hitos y a quién se reparte. Para compras entre desconocidos, los contratos v2 de Pago Protegido (ronda 4) suman una regla extra a cada uno. Los tests están en `contracts/integration-tests/tests/red_team_v2.rs`, y la evidencia on-chain, en `contracts/scripts/out/flujo-v2/` y en DEPLOYED.md §v2.

| Hallazgo en TW | Riesgo para Pago Protegido | La regla extra (v2) | Test | Testnet (flujo v2) |
|---|---|---|---|---|
| **TW-1**: `platform` también puede abrir disputas (`dispute_escrow` acepta cualquier rol salvo el resolver) | Una plataforma comprometida congela los fondos o impide la liberación automática | `auto_release`, `confirm` y `extend` leen el flag **real** de TW (`disputed`), así que cualquier disputa bloquea la liberación. La resolución sigue acotada a comprador y vendedor. Abrirla por el guardián sigue reservado a ellos dos. | `tw1_disputa_de_platform_bloquea_auto_release` | — (lo cubre el test; en testnet no se usa `plataforma` para no chocar con la app) |
| **TW-2**: con fondos adentro, `platform` puede agregar hitos sin aprobar (`update_escrow`), y `release_funds` exige todos aprobados | `confirm` y `auto_release` quedarían bloqueados para siempre | `confirm` y `auto_release` **aprueban todos los hitos pendientes** y liberan en la misma invocación. Si un hito agregado tiene status vacío, TW no deja aprobarlo (`#30`): el guardián responde `#29 MilestoneNotApprovable` sin tocar nada y queda la vía de disputa y árbitro. | `tw2_hito_agregado_confirm_aprueba_todos_y_libera`, `tw2_auto_release_tambien_aprueba_todos`, `tw2_hito_con_status_vacio_queda_la_disputa` | `confirm` de (a): "aprueba todos los hitos y libera" |
| **TW-3**: la evidencia de envío se puede sobrescribir (`change_milestone_status` del service_provider) | El vendedor cambia la guía después del hecho | El envío pasa por `mark_shipped`, **una sola vez**. El guardián guarda su propia copia inmutable de la evidencia, con `shipped_at` y `release_at`. Lo que escriba después directo en TW no cambia nada: ni `confirm`, ni `auto_release`, ni `refund_unshipped`. | `tw3_evidencia_inmutable_en_el_guardian`, `mark_shipped_reglas`, `confirm_exige_envio_registrado` | (d13) un tercero no puede `mark_shipped` (`#24`); (f6) el vendedor tarde (`#26`) |
| **TW-4**: la fábrica (`tw_new_single_release_escrow`) despliega cualquier código, porque recibe el hash del WASM como argumento | Una dirección creada por la fábrica no prueba que el contrato sea el escrow de TW: un contrato falso podría recibir el pago | **La app verifica el hash antes de pedir firmas** (`getContractWasmByContractId` → sha256 = `1b367bc8…196660`) y los roles con `get_escrow`. Si algo no coincide, "Pago bloqueado". Es la misma verificación de H-2. | en la app: sello "Contrato verificado" en el e2e | — (lo verifica la app en cada pago) |
| **TW-5**: `withdraw_remaining_funds` acepta destinos arbitrarios | Desviar fondos sobrantes de un escrow terminado | Solo puede llamarla el `dispute_resolver`, que es `pp_arbiter`, y `pp_arbiter` **no tiene ninguna ruta** a esa función. Nadie puede firmar por el contrato. | `tw5_sin_ruta_a_withdraw_remaining_funds`, `contratos_no_actualizables_y_sin_rutas_peligrosas` | (d10) tercero como resolver: `#12`; (d11) el admin en nombre del árbitro: imposible firmar |

**Otras propiedades verificadas en v2:**

- **Contratos no actualizables.** Ni `pp_guardian` ni `pp_arbiter` llaman a `update_current_contract_wasm`, despliegan código ni tienen una función de admin que cambie su WASM. El test `contratos_no_actualizables_y_sin_rutas_peligrosas` revisa el código y la lista exacta de funciones públicas. `flujo-v2-testnet.sh` (d0) compara además la interfaz **on-chain** con esa lista. Un cambio de lógica exige desplegar contratos nuevos con IDs nuevos, como pasó de v1 a v2.
- **Plazos firmados por el comprador.** `ship_secs` e `inspect_secs` van en el árbol de auth de `fund`. `extend` lo usa solo el comprador, una vez. El escenario (e) del flujo v2 comprueba **con la hora del ledger** que, pasado el plazo original y antes del extendido, `auto_release` se rechaza (`#19`).
- **TTL.** Cada operación sobre una `Purchase` le extiende el TTL a 120 días (test `ttl_de_purchase_se_extiende_en_cada_operacion`).

## 5. Qué falta para mainnet

| Tema | Estado en testnet | Qué hace falta |
|---|---|---|
| **Auditoría** | Tests propios con el WASM real, sin revisión externa | Auditoría independiente de `pp_guardian`, `pp_arbiter` y de su integración con TW (en especial reentrada entre contratos, árboles de auth y redondeo). También revisar la versión de TW que se use en mainnet. |
| **Admin del árbitro** | Una sola llave (`arbitro`) | Multisig en la cuenta admin (por ejemplo 2 de 3, con umbrales de Stellar) o un contrato de cuenta con política. `set_admin` ya existe para migrar. Conviene además un registro público de resoluciones con su evidencia. |
| **Admin del guardián** | Solo puede `set_arbiter`, una vez | Fijar el árbitro en el mismo flujo de despliegue para que no quede ventana. |
| **TTL y renta** | Instancias extendidas 30 días por llamada, `Purchase` 120 días, escrow de TW 1 año (su código) | Un bot que extienda el TTL de la instancia y del código WASM de los contratos (`extend_ttl`) y monitoree los vencimientos. Definir quién paga la renta. |
| **Verificación del escrow (H-2, TW-4)** | La app verifica el hash del WASM y los roles antes de cada firma | Mantenerlo, o un `pp_factory` on-chain que registre las instancias legítimas. |
| **Inicialización atómica (H-3)** | deploy + init en dos transacciones | `tw_new_single_release_escrow` o una factory propia. |
| **H-1 (v1 de TW)** | Hallazgo comunicado al equipo de Trustless Work; `pp_guardian` lo bloquea (#21) | La v2 de Trustless Work ya lo impide: evaluar la migración (plan de 30 días, semana 4). Exige contratos nuevos. |
| **Comisiones en devoluciones y disputas** | Trustless Work descuenta la comisión fija del pedido también cuando la plata vuelve al comprador | Se mantiene y queda documentado en la [Tarifa del README](../README.md#tarifa). Cambiarlo exige contratos nuevos. |
| **Llave del comprador** | Llave creada en el navegador, sin respaldo | Billetera recuperable (login o passkey) antes de mainnet ([README, Llaves](../README.md#llaves)). |
| **Moneda** | LABUSD de prueba | USDC real, verificando su SAC. |
| **Actualizaciones** | Los contratos no son actualizables (no exponen `update_current_contract_wasm`) | Mantenerlos así (es más prudente) y versionar con despliegues nuevos. |
| **Monitoreo** | Script de métricas sobre `getEvents` (ventana de ~7 días del RPC) | Un indexador persistente y alertas ante disputas, resoluciones atípicas y cambios de admin. |
