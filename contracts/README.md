# Pago Protegido: contratos Soroban (`pp_guardian` y `pp_arbiter`)

Contratos del "modo guardián" de Pago Protegido ([SPEC.md](../../docs-pp/SPEC.md) §2–§4, en `stellar-lab/docs-pp/`) sobre el escrow single-release de Trustless Work (commit `f0b706e`, soroban-sdk 28). **Solo testnet.**

- **`pp_guardian`**: approver y release_signer de cada escrow. El comprador fondea a través de él (`fund`), confirma con aprobación y liberación atómicas (`confirm`), abre disputas junto con el vendedor (`dispute`) y, si vence el plazo con el hito en `"enviado"`, cualquiera puede liberar (`auto_release`).
- **`pp_arbiter`**: dispute_resolver de cada escrow. El admin solo elige `buyer_bps` y el contrato reparte el saldo entre el comprador registrado y el vendedor (`roles.receiver`). Ninguna función acepta direcciones de destino.

IDs, hashes y transacciones reales: [DEPLOYED.md](DEPLOYED.md). Decisiones y hallazgos: [DECISIONES.md](DECISIONES.md).

## Estructura

```
contracts/
├── Cargo.toml                 workspace (soroban-sdk =28.0.0, perfil release de TW)
├── shared/escrow_iface.rs     tipos Escrow/Roles/… + cliente mínimo del escrow de TW (include! en ambos contratos)
├── pp_guardian/src/lib.rs
├── pp_arbiter/src/lib.rs
├── integration-tests/tests/   27 tests con el WASM REAL de TW (invariantes de SPEC §4)
├── wasm/escrow.wasm           WASM de TW (sha256 1b367bc8…196660), versionado con git add -f
├── scripts/
│   ├── lib.sh                 helpers (tx con hash/fee, expect_fail, saldos)
│   ├── deploy-testnet.sh      despliega guardián + árbitro y los conecta
│   ├── flujo-testnet.sh       escenarios a–d en testnet, un escrow por escenario
│   ├── bindings.sh            bindings TypeScript
│   └── out/                   evidencia de cada corrida (tsv, json, resumen.md)
├── deployments/testnet.env    IDs (lo leen los scripts)
├── deployments/testnet.json   lo mismo, para la app
└── bindings/                  pp_guardian, pp_arbiter, tw_escrow (TypeScript)
```

## Requisitos

- Rust 1.99.1 con target `wasm32v1-none`, y Stellar CLI 30.0.1.
- `jq` y `perl` (los scripts los usan para medir tiempos y procesar JSON).
- Para testnet, las identidades del CLI `plataforma`, `arbitro`, `comprador`, `vendedor`, `twfee` y `lab` (emisor de LABUSD). El flujo crea `tercero` si no existe.

## Compilar

```bash
cd pago-protegido/contracts
stellar contract build
# → target/wasm32v1-none/release/pp_guardian.wasm y pp_arbiter.wasm
```

## Testear

```bash
cargo test
```

`cargo test` no necesita compilar antes: los tests registran `wasm/escrow.wasm` (el WASM real de Trustless Work) en el `Env` y los dos contratos de forma nativa. Para la autorización:

- `mock_all_auths` se usa solo para preparar el escenario;
- las aserciones de autorización usan `set_auths(&[])` o `mock_auths` con una dirección concreta (auth real).

| Invariante (SPEC §4) | Tests |
|---|---|
| I1: el árbitro solo paga a comprador y vendedor | `resolve_nunca_paga_a_terceros`, `no_existe_via_directa_al_escrow`, `hito_agregado_por_plataforma_no_desvia_fondos`, `disputa_directa_tras_liberar_es_inofensiva` |
| I2: `resolve` solo admin, solo en disputa | `resolve_solo_admin`, `resolve_solo_con_disputa_abierta`, `resolve_bps_invalido_y_montos_cero`, `set_admin_transfiere_el_poder` |
| I3: `confirm` solo el comprador; liberado sin ventana | `confirm_solo_comprador_registrado`, `sin_disputa_despues_de_confirm`, `arboles_de_auth_de_fund_y_confirm`, `caso_feliz_confirm_libera_con_comisiones_exactas` |
| I4: `auto_release` falla antes del deadline, con disputa o sin "enviado" | `auto_release_falla_antes_del_deadline`, `auto_release_falla_si_no_esta_enviado`, `auto_release_falla_con_disputa`, `auto_release_tras_deadline_sin_auth` |
| I5: `fund` una vez, ventana en [min, max] | `fund_una_sola_vez`, `fund_ventana_dentro_de_min_max`, `fund_exige_firma_del_comprador`, `fund_otras_validaciones` |
| I6: disputa solo comprador o vendedor | `disputa_solo_comprador_o_vendedor` |
| I7: sin roles del modo guardián, `fund` falla | `fund_falla_sin_roles_del_modo_guardian`, `fund_otras_validaciones` |
| I8: el reparto suma el saldo y el redondeo nunca favorece a terceros | `redondeo_nunca_favorece_a_terceros`, `resolve_nunca_paga_a_terceros`, `resolve_70_30_montos_exactos` |
| I9: comisiones de 2% y 0,3% con números reales | `caso_feliz_confirm_libera_con_comisiones_exactas`, `resolve_70_30_montos_exactos`, `auto_release_tras_deadline_sin_auth` |
| Extra | `refund_unshipped_reglas`, `set_arbiter_una_vez_y_solo_admin`, `constructor_rechaza_ventanas_invalidas` |

## Desplegar en testnet

```bash
bash scripts/deploy-testnet.sh          # una vez; FORCE=1 para redesplegar
```

El script:

- usa `plataforma` como deployer, `arbitro` como admin de ambos contratos y `twfee` como `tw_fee`;
- configura en el guardián una ventana mínima de 60 s y una máxima de 2 592 000 s (30 días);
- sube los dos WASM, despliega el guardián, despliega el árbitro con el ID del guardián y llama `set_arbiter` firmado por `arbitro`;
- escribe `deployments/testnet.env` y `deployments/testnet.json`.

## Flujo real en testnet

```bash
bash scripts/flujo-testnet.sh            # a, b, c y d (≈ 6 min; c espera 60 s de ledger)
bash scripts/flujo-testnet.sh b          # un solo escenario
```

En cada escenario el script despliega una instancia nueva del escrow con el WASM ya subido (`1b367bc8…`) y la inicializa con los roles del modo guardián. Después verifica los roles con `get_escrow`. El script termina con código ≠ 0 si una transacción falla o si un intento que debía fallar no falla, o falla con otro error.

La evidencia queda en `scripts/out/flujo/`:

- `resumen.md`: tablas con links a stellar.expert;
- `txlog.tsv`, `fallos.tsv` y `saldos.tsv`;
- `escrow-*.json` y `purchase-*.json`;
- `fallo-*.txt`: el stderr completo de cada rechazo.

## Datos de ejemplo y métricas

```bash
bash scripts/compras-demo.sh             # 6 compras de Bs 120 a 900 con desenlaces distintos (deployer: ppdemo)
bash scripts/metricas.sh > m.json        # métricas desde los eventos pp_* (getEvents del RPC, solo lectura)
bash scripts/gen-deployed.sh             # regenera DEPLOYED.md
```

- **`compras-demo.sh`:**
  - incluye la reproducción on-chain del bug H-1 de TW;
  - usa la identidad `ppdemo` (se crea con friendbot) para desplegar e inicializar, así no choca con la secuencia de `plataforma` que usa la app;
  - deja la evidencia en `scripts/out/demo/`.
- **Métricas:** formato de salida y cómo las consume la app (página `/transparencia`) en [`../docs/METRICAS.md`](../docs/METRICAS.md). Salida de ejemplo en `scripts/out/metricas/metricas-ejemplo.json`.
- **Más documentación:**
  - arquitectura y diagramas: [`../docs/ARQUITECTURA.md`](../docs/ARQUITECTURA.md);
  - seguridad: [`../docs/SEGURIDAD.md`](../docs/SEGURIDAD.md);
  - borrador del reporte a Trustless Work: [`../docs/reporte-trustless-work.md`](../docs/reporte-trustless-work.md).

## Bindings TypeScript

```bash
bash scripts/bindings.sh --build        # regenera bindings/ y compila cada paquete
```

| Paquete | Origen | `networks.testnet.contractId` |
|---|---|---|
| `bindings/pp_guardian` | contrato desplegado | ID del guardián |
| `bindings/pp_arbiter` | contrato desplegado | ID del árbitro |
| `bindings/tw_escrow` | `wasm/escrow.wasm` | ninguno: cada compra es una instancia nueva, así que se pasa `contractId` al crear el `Client` |

`dist/` está versionado, así que la app puede depender de los paquetes con `"pp_guardian": "file:../contracts/bindings/pp_guardian"` sin compilarlos.

## Cómo lo usa la app (resumen)

1. **Plataforma:**
   - despliega una instancia del escrow (`wasmHashes.tw_escrow`);
   - la inicializa con `approver = release_signer = pp_guardian`, `dispute_resolver = pp_arbiter`, `service_provider = receiver = vendedor`, `platform = plataforma`, `platform_fee = 200` y un hito `"Entrega del producto"` con status `"pendiente"`. El tipo `Escrow` está en `bindings/pp_guardian`.
   - Antes de pedir firmas, verificar con RPC que la instancia ejecuta el WASM `1b367bc8…` (ver DECISIONES.md, H-2).
2. **Comprador:** `pp_guardian.fund({escrow, buyer, expected_escrow, amount, window_secs})`.
   - `expected_escrow` debe ser idéntico al `get_escrow` guardado.
   - `amount` debe ser igual a `escrow.amount`.
   - La ventana debe estar entre 60 s y 30 días.
   - El comprador firma el árbol de auth `fund → fund_escrow → transfer`.
3. **Vendedor:** `escrow.change_milestone_status(0, "enviado", evidencia, vendedor)`, directo en el escrow. Lo firma el vendedor.
4. **Cierre de la compra.** Ocurre una de estas cosas:
   - **Confirmación:** el comprador llama `pp_guardian.confirm({escrow, buyer})`, que aprueba y libera.
   - **Disputa:** el comprador o el vendedor llaman `pp_guardian.dispute({escrow, caller})`.
   - **Liberación automática:** pasado el plazo, cualquiera llama `pp_guardian.auto_release({escrow})`, sin firmas.
5. **Árbitro:** previsualiza con `pp_arbiter.quote({escrow, buyer_bps})` (solo lectura) y resuelve con `pp_arbiter.resolve({escrow, buyer_bps})`, firmado por `arbitro`.
6. **Reembolso sin envío:** si hay disputa, venció el plazo y el hito no está en `"enviado"`, cualquiera puede llamar `pp_arbiter.refund_unshipped({escrow})`.
7. **Consultas:**
   - `pp_guardian.purchase({escrow})` devuelve `{buyer, seller, funded_at, deadline}` o `null`;
   - `pp_guardian.config()` y `pp_arbiter.config()` devuelven la configuración.

Errores de cada contrato: enum `Errors` en los bindings, o `Error` en `pp_guardian/src/lib.rs` y `pp_arbiter/src/lib.rs`.
