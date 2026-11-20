# H-1: disputa sobre un escrow ya liberado (v1 de Trustless Work)

> **Estado (19-nov-2026):** En la v1 del escrow que usamos (commit `f0b706e`), un escrow ya liberado se puede marcar en disputa sin mover fondos; la v2 de Trustless Work ya lo impide, y `pp_guardian` también lo bloquea (#21). **Detalle de la v2:** en las ramas `single-release-develop-v2` y `single-release-main-v2`, `dispute_escrow` responde `EscrowAlreadyReleased` si el escrow ya se liberó. Todas las pruebas se hicieron en **testnet**.
>
> Este documento explica qué pasa en la v1, cómo se reproduce y cómo lo cubrimos. Pendiente: evaluar la migración a Trustless Work v2 (plan de 30 días).

| Campo | Valor |
|---|---|
| Repositorio | `Trustless-Work/Trustless-Work-Smart-Escrow` |
| Versión que usamos | v1: `single-release-develop` @ `f0b706eaf6e98aa83bf4f95df42857b5d4c8e847` (2026-09-29) |
| Archivo (v1) | `contracts/escrow/src/core/validators/dispute.rs`, `validate_dispute_flag_change_conditions` |
| En la v2 | `single-release-develop-v2` y `single-release-main-v2` rechazan con `EscrowAlreadyReleased` |
| Impacto | **Bajo**: no permite mover fondos, pero deja un estado inconsistente y emite eventos de disputa sobre un escrow terminado |
| WASM probado | sha256 `1b367bc8476cf80b89f6396e2aa07b602b78361dd829b5ce9b64ada365196660` |

## Español

### Descripción

En la v1, `dispute_escrow` llama a `validate_dispute_flag_change_conditions`, que rechaza si el escrow ya está en disputa (`#13`) o ya está resuelto (`#24`), **pero no revisa `flags.released`**.

Por eso, después de `release_funds`, cualquier dirección con rol en el escrow, salvo el dispute_resolver, puede llamar `dispute_escrow`. Eso incluye al approver, al service_provider, a la plataforma, al release_signer y al receiver. La llamada se acepta, deja `released = true` y `disputed = true` a la vez, y emite el evento `EscrowDisputed`.

Las demás funciones de la v1 sí tratan `released` como estado final:

- `release_funds` devuelve `#35 EscrowAlreadyReleased`;
- `change_milestone_status` devuelve `#35`.

### Reproducción en testnet con la v1 (hashes reales)

Escrow [`CDBOEPQVMZ3HB33WOJFB63IOAGT6GFMACGVQOZJX333YD7CENYRGFWSC`](https://stellar.expert/explorer/testnet/contract/CDBOEPQVMZ3HB33WOJFB63IOAGT6GFMACGVQOZJX333YD7CENYRGFWSC), con el WASM de arriba y 10,2564103 LABUSD (token de prueba). En este escrow, approver y release_signer son un contrato que aprueba y libera en la misma invocación (nuestro `pp_guardian`). service_provider y receiver son la cuenta `GAKG5N3H…ZTCZQQ`.

| # | Paso | Tx |
|---|---|---|
| 1 | Deploy de la instancia | [`02b6ea71…`](https://stellar.expert/explorer/testnet/tx/02b6ea71d5cdd39d4ddf1a88329fb69f5dee118c37f0e488a94d42335f6fa683) |
| 2 | `initialize_escrow` | [`945b63f2…`](https://stellar.expert/explorer/testnet/tx/945b63f2bb0315b606a8f365cc658c86156f2ebf52948778408726fe22757547) |
| 3 | `fund_escrow` (vía nuestro contrato) | [`b93a57ee…`](https://stellar.expert/explorer/testnet/tx/b93a57ee187a72f69833ff11e13dffad557f390454a95f7b43896ab19b505508) |
| 4 | `change_milestone_status` → `"enviado"` | [`0a6bd08d…`](https://stellar.expert/explorer/testnet/tx/0a6bd08d9302ac513e7e625ded5713c7af917a0d207f7561436e621a93214e79) |
| 5 | `approve_milestone` + `release_funds`; queda `released = true` y saldo 0 | [`2594aa6f…`](https://stellar.expert/explorer/testnet/tx/2594aa6fbb5e307d35af028cb2c2b39d8ba59a659a4216e000beb5ce14f3e208) |
| 6 | **El service_provider llama `dispute_escrow` directo en el escrow y se acepta** | [`8315f9c3…`](https://stellar.expert/explorer/testnet/tx/8315f9c353d0177be12669090af6e880e2f41767d7f79af6b356e35ff78b7d26) |

Estado después del paso 6 (`get_escrow`):

```json
{"flags": {"disputed": true, "released": true, "resolved": false},
 "milestones": [{"status": "enviado", "approved": true}]}
```

Para reproducirlo con cualquier escrow single-release v1 ya liberado:

```bash
stellar contract invoke --network testnet --id <ESCROW_LIBERADO> --source <service_provider> \
  -- dispute_escrow --signer <service_provider>
# → se envía sin error; get_escrow muestra released=true y disputed=true
```

### Impacto

- **Fondos: ninguno.** Después de liberar, el saldo es 0 y `resolve_dispute` no puede repartir nada (`#41` o `#39`).
- **Estado inconsistente y permanente.** El escrow queda liberado y en disputa a la vez, y no hay forma de limpiar el flag: `resolve_dispute` exige saldo mayor que 0.
- **Eventos de disputa sobre un escrow terminado.** Se emite `EscrowDisputed`, y un indexador o una cola de revisión podría abrir un caso por un trabajo ya pagado.

### Cómo lo cubrimos

- **En el contrato:** en Trato (antes Pago Protegido) la disputa pasa por `pp_guardian`, que rechaza abrirla sobre un escrow liberado (`#21`, `EscrowAlreadyReleased`). Lo cubre el test `disputa_directa_tras_liberar_es_inofensiva`.
- **En la app:** el estado on-chain manda, y "liberado" se muestra por encima de "en disputa" ([app/DECISIONES.md](../app/DECISIONES.md) §36).
- **A futuro:** evaluar la migración a Trustless Work v2, que ya trae esta verificación.

### El cambio de la v2, probado sobre la v1

Probamos sobre una copia local de la v1 (no se modificó el repo original) una verificación equivalente a la de la v2: revisar `released` en el validador, antes de revisar los roles.

```diff
--- a/contracts/escrow/src/core/validators/dispute.rs
+++ b/contracts/escrow/src/core/validators/dispute.rs
@@ -87,6 +87,10 @@
         return Err(ContractError::EscrowAlreadyResolved);
     }
 
+    if escrow.flags.released {
+        return Err(ContractError::EscrowAlreadyReleased);
+    }
+
     let Roles {
         approver,
         service_provider,
```

Reutiliza el error existente `#35 EscrowAlreadyReleased`, así que no cambia la interfaz. El diff está en [`tw-h1/fix.diff`](tw-h1/fix.diff) y el test en [`tw-h1/dispute_after_release.rs`](tw-h1/dispute_after_release.rs):

1. Inicializa, fondea, aprueba y libera un escrow.
2. Verifica que approver, service_provider, platform y release_signer reciban `Err(Ok(ContractError::EscrowAlreadyReleased))` al llamar `try_dispute_escrow`.
3. Verifica que `disputed` siga en `false`.

| Estado | `cargo test -p escrow` |
|---|---|
| v1 sin el cambio | el test nuevo **no pasa**: `left: Ok(Ok(()))`, `right: Err(Ok(EscrowAlreadyReleased))` |
| v1 con el cambio | **pasa toda la suite**: 21/21 (20 tests existentes + el nuevo) |

---

## English (short)

**H-1: in Trustless Work v1, `dispute_escrow` accepts disputes on an already released single-release escrow. Trustless Work v2 already rejects it.**

- **Where (v1):** `contracts/escrow/src/core/validators/dispute.rs::validate_dispute_flag_change_conditions` (branch `single-release-develop` @ `f0b706e`). It checks `disputed` and `resolved` but not `released`. After `release_funds`, any role holder except the dispute resolver can call `dispute_escrow`, which succeeds: the escrow ends up `released = true` and `disputed = true`, and `EscrowDisputed` is emitted.
- **v2:** branches `single-release-develop-v2` and `single-release-main-v2` return `EscrowAlreadyReleased`.
- **Testnet repro (v1):** escrow `CDBOEPQVMZ3HB33WOJFB63IOAGT6GFMACGVQOZJX333YD7CENYRGFWSC`. Release tx `2594aa6fbb5e307d35af028cb2c2b39d8ba59a659a4216e000beb5ce14f3e208`. Post-release dispute by the service provider, accepted: tx `8315f9c353d0177be12669090af6e880e2f41767d7f79af6b356e35ff78b7d26`.
- **Impact:** low. No funds can move, because the balance is 0 and `resolve_dispute` needs a positive total. The escrow is left in a permanent inconsistent state.
- **In Trato (formerly Pago Protegido):** `pp_guardian` rejects disputes on released escrows (`#21`), and the app shows "released" over "disputed". Pending: evaluate migrating to Trustless Work v2.
