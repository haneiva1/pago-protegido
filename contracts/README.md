# Pago Protegido: contratos Soroban (`pp_guardian` y `pp_arbiter`)

Contratos del "modo guardián" de Pago Protegido ([SPEC.md](../docs/SPEC.md) §2–§4) sobre el escrow single-release de Trustless Work (commit `f0b706e`, soroban-sdk 28). **Solo testnet.**

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
├── integration-tests/tests/   38 tests (v2) con el WASM REAL de TW: invariantes + red team
├── wasm/escrow.wasm           WASM de TW (sha256 1b367bc8…196660), versionado con git add -f
├── scripts/
│   ├── lib.sh                 helpers (tx con hash/fee, expect_fail, saldos)
│   ├── deploy-testnet.sh      despliega guardián + árbitro y los conecta
│   ├── flujo-v2-testnet.sh    escenarios v2 en testnet (flujo-testnet.sh: v1)
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

**38 tests (v2)** en dos archivos:

| Archivo | Tests | Qué cubre |
|---|---:|---|
| `tests/invariantes.rs` | 26 | Los 9 invariantes de SPEC §4 sobre la interfaz v2 |
| `tests/red_team_v2.rs` | 12 | TW-1, TW-2, TW-3 y TW-5; `mark_shipped`; `extend`; `refund_unshipped` por plazo de despacho; TTL de `Purchase`; contratos no actualizables |

Qué test cubre cada invariante y cada hallazgo: [`../docs/SEGURIDAD.md`](../docs/SEGURIDAD.md), §2 y §4b.

## Desplegar en testnet

```bash
bash scripts/deploy-testnet.sh          # una vez; FORCE=1 para redesplegar
```

El script:

- usa `ppdemo` como deployer (v2), `arbitro` como admin de ambos contratos y `twfee` como `tw_fee`;
- configura en el guardián el plazo de despacho y la ventana de revisión, cada uno entre 60 s y 2 592 000 s (30 días);
- conserva los IDs de v1 como `*_V1_ID`;
- sube los dos WASM, despliega el guardián, despliega el árbitro con el ID del guardián y llama `set_arbiter` firmado por `arbitro`;
- escribe `deployments/testnet.env` y `deployments/testnet.json`.

## Flujo real en testnet

```bash
bash scripts/flujo-v2-testnet.sh         # v2: a, b, c, e, f y d (≈ 10 min; espera por la hora del ledger)
```

| Escenario v2 | Qué prueba |
|---|---|
| (a) | `fund` → `mark_shipped` → `confirm` |
| (b) | Disputa resuelta 70/30 |
| (c) | `auto_release` 60 s después del envío |
| (e) | `extend`: pasado el plazo original no libera, y pasado el nuevo sí |
| (f) | `refund_unshipped` |
| (d) | 9 desvíos rechazados, incluido `withdraw_remaining_funds`, y la interfaz on-chain sin upgrade |

`flujo-testnet.sh` es el flujo de v1. Ya no funciona contra v2, pero su evidencia se conserva en `scripts/out/flujo/` y en DEPLOYED-v1.md.

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
2. **Comprador:** `pp_guardian.fund({escrow, buyer, expected_escrow, amount, ship_secs, inspect_secs})`.
   - `expected_escrow` debe ser idéntico al `get_escrow` guardado.
   - `amount` debe ser igual a `escrow.amount`.
   - Cada plazo debe estar entre 60 s y 30 días.
   - El comprador firma el árbol de auth `fund → fund_escrow → transfer`, que incluye los dos plazos.
3. **Vendedor:** `pp_guardian.mark_shipped({escrow, seller, evidence})`. Lo firma el vendedor, una sola vez y antes de `ship_deadline`.
   - La evidencia es el código de encomienda, la URL de una foto o "entregado en persona".
   - **Ya no se usa** `escrow.change_milestone_status` directo: lo que se escriba así no cuenta.
4. **Cierre de la compra.** Ocurre una de estas cosas:
   - **Confirmación:** el comprador llama `pp_guardian.confirm({escrow, buyer})`. Exige el envío registrado; aprueba todos los hitos y libera.
   - **Más tiempo para revisar:** el comprador llama `pp_guardian.extend({escrow, buyer})`, una vez y antes de `release_at`.
   - **Disputa:** el comprador o el vendedor llaman `pp_guardian.dispute({escrow, caller})`.
   - **Liberación automática:** desde `release_at`, cualquiera llama `pp_guardian.auto_release({escrow})`, sin firmas.
5. **Árbitro:** previsualiza con `pp_arbiter.quote({escrow, buyer_bps})` (solo lectura) y resuelve con `pp_arbiter.resolve({escrow, buyer_bps})`, firmado por `arbitro`.
6. **Reembolso sin envío:** si hay disputa, venció `funded_at + ship_secs` y no hubo `mark_shipped`, cualquiera puede llamar `pp_arbiter.refund_unshipped({escrow})`.
7. **Consultas:**
   - `pp_guardian.purchase({escrow})` devuelve `{buyer, seller, amount, funded_at, ship_secs, inspect_secs, ship_deadline, shipped_at, release_at, extended, evidence}` o `null`;
   - `pp_guardian.config()` y `pp_arbiter.config()` devuelven la configuración.

Errores de cada contrato: enum `Errors` en los bindings, o `Error` en `pp_guardian/src/lib.rs` y `pp_arbiter/src/lib.rs`.
