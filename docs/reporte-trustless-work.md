# BORRADOR, NO ENVIADO: reporte de bug para Trustless Work

> Borrador para que Hans lo revise. No se publicó ni se envió a nadie. Todas las pruebas se hicieron en **testnet**.

**Título propuesto:** `dispute_escrow` permite marcar como disputado un escrow ya liberado (single-release)

| Campo | Valor |
|---|---|
| Repositorio | `Trustless-Work/Trustless-Work-Smart-Escrow` |
| Rama / commit | `single-release-develop` @ `f0b706eaf6e98aa83bf4f95df42857b5d4c8e847` (2026-09-29) |
| Archivo | `contracts/escrow/src/core/validators/dispute.rs`, `validate_dispute_flag_change_conditions` |
| Severidad sugerida | **Baja**: no permite mover fondos, pero deja un estado inconsistente y emite eventos espurios |
| WASM probado | sha256 `1b367bc8476cf80b89f6396e2aa07b602b78361dd829b5ce9b64ada365196660` |

## Español

### Descripción

`dispute_escrow` llama a `validate_dispute_flag_change_conditions`, que rechaza si el escrow ya está en disputa (`#13`) o ya está resuelto (`#24`), **pero no revisa `flags.released`**.

Por eso, después de `release_funds`, cualquier dirección con rol en el escrow, salvo el dispute_resolver, puede llamar `dispute_escrow`. Eso incluye al approver, al service_provider, a la plataforma, al release_signer y al receiver. La llamada se acepta, deja `released = true` y `disputed = true` a la vez, y emite el evento `EscrowDisputed`.

Las demás funciones sí tratan `released` como estado final:

- `release_funds` devuelve `#35 EscrowAlreadyReleased`;
- `change_milestone_status` devuelve `#35`.

### Reproducción en testnet (hashes reales)

Escrow [`CDBOEPQVMZ3HB33WOJFB63IOAGT6GFMACGVQOZJX333YD7CENYRGFWSC`](https://stellar.expert/explorer/testnet/contract/CDBOEPQVMZ3HB33WOJFB63IOAGT6GFMACGVQOZJX333YD7CENYRGFWSC), con el WASM de arriba y 10,2564103 LABUSD (token de prueba). En este escrow, approver y release_signer son un contrato que aprueba y libera en la misma invocación (nuestro `pp_guardian`). service_provider y receiver son la cuenta `GAKG5N3H…ZTCZQQ`.

| # | Paso | Tx |
|---|---|---|
| 1 | Deploy de la instancia | [`02b6ea71…`](https://stellar.expert/explorer/testnet/tx/02b6ea71d5cdd39d4ddf1a88329fb69f5dee118c37f0e488a94d42335f6fa683) |
| 2 | `initialize_escrow` | [`945b63f2…`](https://stellar.expert/explorer/testnet/tx/945b63f2bb0315b606a8f365cc658c86156f2ebf52948778408726fe22757547) |
| 3 | `fund_escrow` (vía nuestro contrato) | [`b93a57ee…`](https://stellar.expert/explorer/testnet/tx/b93a57ee187a72f69833ff11e13dffad557f390454a95f7b43896ab19b505508) |
| 4 | `change_milestone_status` → `"enviado"` | [`0a6bd08d…`](https://stellar.expert/explorer/testnet/tx/0a6bd08d9302ac513e7e625ded5713c7af917a0d207f7561436e621a93214e79) |
| 5 | `approve_milestone` + `release_funds`; queda `released = true` y saldo 0 | [`2594aa6f…`](https://stellar.expert/explorer/testnet/tx/2594aa6fbb5e307d35af028cb2c2b39d8ba59a659a4216e000beb5ce14f3e208) |
| 6 | **El service_provider llama `dispute_escrow` y se acepta** | [`8315f9c3…`](https://stellar.expert/explorer/testnet/tx/8315f9c353d0177be12669090af6e880e2f41767d7f79af6b356e35ff78b7d26) |

Estado después del paso 6 (`get_escrow`):

```json
{"flags": {"disputed": true, "released": true, "resolved": false},
 "milestones": [{"status": "enviado", "approved": true}]}
```

Para reproducirlo con cualquier escrow single-release ya liberado:

```bash
stellar contract invoke --network testnet --id <ESCROW_LIBERADO> --source <service_provider> \
  -- dispute_escrow --signer <service_provider>
# → se envía sin error; get_escrow muestra released=true y disputed=true
```

### Impacto

- **Fondos: ninguno directo.** Después de liberar, el saldo es 0 y `resolve_dispute` no puede repartir nada (`#41` o `#39`).
- **Estado inconsistente y permanente.** El escrow queda liberado y en disputa a la vez, y no hay forma de limpiar el flag: `resolve_dispute` exige saldo mayor que 0.
- **Eventos espurios.** Se emite `EscrowDisputed` sobre un escrow terminado. Indexadores, dashboards y colas de arbitraje (incluidos los de TW) pueden abrir casos o notificaciones por un trabajo ya pagado.
- **Molestia de bajo costo.** Una de las partes, por ejemplo un service_provider enojado o una plataforma, puede marcar como "en disputa" un escrow terminado con una transacción de unos 0,0007 XLM.

### Fix sugerido

Agregar la verificación de `released` en el validador, antes de revisar los roles:

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

Reutiliza el error existente `#35 EscrowAlreadyReleased`, así que no cambia la interfaz.

### Test

Archivo [`tw-h1/dispute_after_release.rs`](tw-h1/dispute_after_release.rs). Va en `contracts/escrow/src/tests/` con `mod dispute_after_release;` en `tests/mod.rs`, y usa los helpers del repo.

1. Inicializa, fondea, aprueba y libera un escrow.
2. Verifica que approver, service_provider, platform y release_signer reciban `Err(Ok(ContractError::EscrowAlreadyReleased))` al llamar `try_dispute_escrow`.
3. Verifica que `disputed` siga en `false`.

Resultado, verificado en una copia local del repo (no se modificó el original):

| Estado | `cargo test -p escrow` |
|---|---|
| Sin el fix | **falla** el test nuevo: `left: Ok(Ok(()))`, `right: Err(Ok(EscrowAlreadyReleased))` |
| Con el fix | **pasa toda la suite**: 21/21 (20 tests existentes + el nuevo) |

### Cómo lo mitigamos mientras tanto

En Pago Protegido, la disputa pasa por nuestro contrato `pp_guardian`, que rechaza abrirla sobre un escrow liberado (`EscrowAlreadyReleased`). La UI muestra "liberado" por encima de "en disputa".

---

## English (short)

**`dispute_escrow` accepts disputes on an already released single-release escrow.**

- **Where:** `contracts/escrow/src/core/validators/dispute.rs::validate_dispute_flag_change_conditions` (branch `single-release-develop` @ `f0b706e`). It checks `disputed` and `resolved` but not `released`. After `release_funds`, any role holder except the dispute resolver can call `dispute_escrow`, which succeeds: the escrow ends up `released = true` and `disputed = true`, and `EscrowDisputed` is emitted.
- **Testnet repro:** escrow `CDBOEPQVMZ3HB33WOJFB63IOAGT6GFMACGVQOZJX333YD7CENYRGFWSC`. Release tx `2594aa6fbb5e307d35af028cb2c2b39d8ba59a659a4216e000beb5ce14f3e208`. Post-release dispute by the service provider, accepted: tx `8315f9c353d0177be12669090af6e880e2f41767d7f79af6b356e35ff78b7d26`.
- **Impact:** low. No funds can move, because the balance is 0 and `resolve_dispute` needs a positive total. The escrow is left in a permanent inconsistent state, and spurious dispute events can trigger off-chain arbitration flows or notifications for finished jobs. Any party can trigger it cheaply.
- **Fix:** add `if escrow.flags.released { return Err(ContractError::EscrowAlreadyReleased); }` after the `resolved` check (diff above). It reuses error `#35`, so there is no interface change.
- **Test:** `tw-h1/dispute_after_release.rs` releases an escrow and asserts that `try_dispute_escrow` returns `EscrowAlreadyReleased` for every role. It fails without the fix and passes with it, along with the full existing suite (21/21).
