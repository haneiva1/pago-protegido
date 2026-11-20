# Métricas on-chain de Pago Protegido

Las métricas públicas salen **solo de eventos on-chain** de `pp_guardian` y `pp_arbiter`, sin base de datos privada. Cualquiera puede recalcularlas con un RPC de Stellar.

## Eventos

| Evento (topic 0) | Contrato | Topic 1 | Datos (map) |
|---|---|---|---|
| `pp_funded` | pp_guardian | escrow | `buyer`, `seller`, `amount` (i128), `deadline` (u64) |
| `pp_confirmed` | pp_guardian | escrow | `buyer` |
| `pp_auto_released` | pp_guardian | escrow | (vacío) |
| `pp_disputed` | pp_guardian | escrow | `caller` |
| `pp_resolved` | pp_arbiter | escrow | `buyer_bps` (u32), `buyer_amount`, `seller_amount` |
| `pp_refunded_unshipped` | pp_arbiter | escrow | `buyer_amount` |
| `pp_arbiter_set` / `pp_admin_changed` | admin | — | `arbiter` / `old_admin`, `new_admin` |

El momento de cada evento es el `ledgerClosedAt` del ledger que lo incluye. v2 agrega `pp_shipped` (envío registrado, con la evidencia) y `pp_extended` (revisión extendida) en `pp_guardian`.

## Reglas del indexador: qué compras cuentan (H-9)

Un evento `pp_funded` auténtico **no prueba** que hubo una compra. `pp_guardian.fund` acepta cualquier contrato que imite la interfaz del escrow de Trustless Work, así que con un escrow falso se pueden emitir `pp_funded`, `pp_shipped`, `pp_confirmed`, `pp_disputed` y `pp_refunded_unshipped` sin mover plata ([SEGURIDAD.md, H-9](SEGURIDAD.md#h-9-la-reputación-se-podía-fabricar-con-escrows-falsos)). Por eso la app cuenta una compra en `/metricas`, `/tienda/<slug>`, la insignia, "Tus números" y `/transparencia` **solo si su escrow cumple las cuatro reglas**:

| # | Regla | Cómo se comprueba | Si falla |
|---|---|---|---|
| 1 | **WASM de Trustless Work.** El escrow corre el código auditado. | `getLedgerEntries` de la instancia → `executable.wasm_hash` = `1b367bc8…196660` (el mismo hash que verifica la app antes de cada pago). Solo WASM propio: ni SAC ni referencia externa. | "Su contrato no es el escrow de Trustless Work" |
| 2 | **Roles de Trato.** `approver` = `release_signer` = `pp_guardian`, `dispute_resolver` = `pp_arbiter` (el par v2 o el par v1), `platform` = la cuenta `plataforma`, y `receiver` = `service_provider` = el vendedor del evento. | `get_escrow` simulado (lectura, sin firma). | "Los roles del escrow no son los de Trato" |
| 3 | **Moneda LABUSD.** `trustline.address` = SAC de LABUSD `CC65P6TQ…OGBD4S`. | El mismo `get_escrow`. | "No usa LABUSD" |
| 4 | **El pago movió la plata.** La transacción de `pp_funded` contiene un evento `transfer` **del SAC de LABUSD** del comprador al escrow por el monto exacto, y el `amount` del escrow es ese mismo monto. | `getTransaction` del RPC. Si el pago ya salió de la ventana del RPC (unos 7 días), los efectos de Horizon (`account_debited` + `contract_credited`). | "El pago no movió la plata" |

- **Sin dato no hay prueba.** Si la instancia o la transacción no existen, la regla falla y la compra no cuenta. Ante un error transitorio del RPC o de Horizon, la compra queda **pendiente**: no cuenta hasta verificarse y se reintenta en la próxima lectura.
- **Una sola verificación por escrow.** El resultado se guarda en SQLite (`escrow_verificado`) junto con la huella de los valores esperados. Si cambia un valor (otro WASM, otro SAC, otra plataforma), todo se vuelve a verificar.
- **Lo que se ve en `/transparencia`:** las reglas, cuántas compras están verificadas, cuántas se descartaron y por qué (la primera regla que falla), con el escrow y el pago de las últimas descartadas. `/api/transparencia` trae lo mismo en `indexador`.
- **Los eventos de compras descartadas** no entran en ningún número ni en "Últimas operaciones". Se siguen guardando en `pp_events`, porque son públicos.
- **Valores esperados.** Salen de `.env.local` (`ESCROW_WASM_HASH`, `LABUSD_SAC`, la cuenta `plataforma`) o, si no hay, de los valores públicos de [`contracts/DEPLOYED.md`](../contracts/DEPLOYED.md) (`TESTNET_PUBLICO` en `app/src/lib/server/config.ts`).
- **Código y tests.** Las reglas están en `app/src/lib/server/verificacion.ts`, que solo depende de `@stellar/stellar-sdk`, así que cualquiera puede reusarlas para recalcular las cifras. Los tests unitarios (`npm test` en `app/`) usan un fondeo real de testnet y escrows falsos armados como en la PoC del jurado. El ataque mismo está en `contracts/integration-tests/tests/hallazgos_jurado.rs`.
- **Cifras (20-nov).** Con el indexador verificado, las cifras no cambiaron: las 101 compras de la base local del e2e (ledgers 5790757–5825034) y las 74 de la base del e2e público cumplen las cuatro reglas. No había compras fabricadas, y desde ahora una compra fabricada no suma.
- **Lo que estas reglas no impiden.** Una persona que paga de verdad con LABUSD a su propia tienda (venta a sí misma) pasa las cuatro reglas. Le cuesta el 2,3% de comisiones por venta y queda a la vista en el registro público. Para la v3 de los contratos está previsto que `platform` co-firme `fund`, así solo cuentan las compras hechas desde la app ([SEGURIDAD.md, H-9](SEGURIDAD.md#h-9-la-reputación-se-podía-fabricar-con-escrows-falsos)).
- **`scripts/metricas.sh`** sigue contando los eventos crudos, como referencia de las reglas de estado. Las cifras de la app son las del indexador verificado.

## Tipo de cambio Bs ↔ USD

Los montos on-chain están en USD de prueba (LABUSD). Para mostrarlos en bolivianos, el script y la app usan **11,70 Bs por USD**, un **parámetro de la demo, no una cotización** oficial ni de mercado:

- `metricas.sh`: variable `TIPO_CAMBIO` (11,70 si no se define); la salida lo informa en `tipo_cambio_bs_por_usd`.
- App (`/metricas`, `/tienda/<slug>`, "Tus números" y `/transparencia`): `FX_BS_PER_USD` (11,70 si no se define). Suma los montos en USD de prueba y los pasa a Bs con el tipo de cambio configurado al mostrar; cada pantalla muestra también el monto en USD de prueba.
- Cada pedido de la app guarda su propio tipo de cambio, el del momento en que se creó, para su precio, su protección y sus repartos.

En producción, el tipo de cambio sería el que aplique la ETF al convertir bolivianos a USDC. Más detalle en el [README](../README.md#tipo-de-cambio).

## Script

```bash
cd pago-protegido/contracts
bash scripts/metricas.sh > metricas.json                     # desde el ledger del despliegue
EVENTS_OUT=eventos.jsonl bash scripts/metricas.sh            # también guarda los eventos crudos
START_LEDGER=… RPC_URL=… TIPO_CAMBIO=11.70 bash scripts/metricas.sh
```

- Usa `getEvents` del RPC con `xdrFormat: "json"`, filtrado por los dos contratos.
- Pagina por `cursor` hasta llegar al último ledger y calcula todo con `jq`.
- No firma nada.
- Requiere `curl` y `jq`.

Salida de ejemplo: [`contracts/scripts/out/metricas/metricas-ejemplo.json`](../contracts/scripts/out/metricas/metricas-ejemplo.json). Los eventos crudos están en `eventos-ejemplo.jsonl`.

Es una corrida real en testnet del 2026-11-18, después del despliegue de v2. Lee juntos los eventos de **v1 y v2**, porque los IDs de v1 se conservan en `testnet.env`. Incluye:
- el flujo v1 (a–d);
- las 6 compras de `compras-demo.sh`;
- el flujo v2 (a, b, c, e, f, d);
- las compras que la app hizo en paralelo.

Resultado:

| Métrica | Valor |
|---|---|
| Compras | **47** (41 en v1, 6 en v2) |
| Confirmadas | 19 |
| Liberadas automáticamente | 8 |
| Disputas | 18, de las cuales 2 terminaron en reembolso sin envío |
| Envíos registrados con evidencia (v2) | 5 |
| Revisiones extendidas (v2) | 1 |

v2 agrega a cada compra los campos `version`, `plazo` (`ship_deadline` en v2, `deadline` en v1), `enviada` (evidencia, hora del envío y `libera_desde`) y `extendida`. También agrega los totales `por_version`, `enviadas_con_evidencia_v2` y `revisiones_extendidas_v2`.

### Campos

| Campo | Qué es |
|---|---|
| `compras_protegidas` | Cantidad de `pp_funded` |
| `volumen.labusd`, `volumen.bs_aprox` | Suma de `amount`, en USD de prueba y en Bs al `tipo_cambio_bs_por_usd` |
| `liberadas_por_confirmacion` | Compras con `pp_confirmed` |
| `liberadas_automaticamente` | Compras con `pp_auto_released` |
| `en_curso` | Fondeadas, sin desenlace y sin disputa |
| `disputas.total`, `abiertas_por_comprador`, `abiertas_por_vendedor` | Quién abrió cada disputa, comparando `caller` con el `buyer` de `pp_funded` |
| `disputas.pendientes` | En disputa, sin resolver |
| `disputas.resueltas_por_arbitro`, `reembolsos_sin_envio` | Desenlaces por `pp_resolved` y por `pp_refunded_unshipped` |
| `disputas.a_favor_del_comprador`, `a_favor_del_vendedor`, `repartos_parciales`, `buyer_bps_promedio` | Cómo se resolvieron: 100% comprador, 100% vendedor o reparto parcial |
| `disputas.segundos_promedio_hasta_resolucion` | Del fondeo a la resolución |
| `tiempo_promedio_hasta_liberacion` | Del fondeo a `confirm` o `auto_release`, en segundos y horas, con la cantidad de muestras |
| `comisiones_estimadas` | Nominales sobre compras cerradas: 2% plataforma y 0,3% TW. Es una estimación: el script no lee el `platform_fee` de cada escrow, que se define al crear el pedido (2% si el vendedor regala la protección; menos si la paga el comprador). Ver la [tarifa del README](../README.md#tarifa). |
| `compras[]` | Detalle por compra: escrow, monto, estado, fechas, disputa, resolución y links a stellar.expert |

Un mismo escrow puede aparecer en `liberadas_*` o en `disputas`, pero no en ambas: en Pago Protegido una compra liberada no puede disputarse por el guardián.

## Cómo la consume la app: página `/transparencia`

**Recomendación:** ingerir los eventos de forma incremental en SQLite y calcular las métricas al servir la página.

El RPC público guarda solo unos 7 días de eventos (`getHealth.oldestLedger`). Por eso no alcanza con consultar el RPC al momento de mostrar la página.

1. **Tabla `pp_events`:**
   - columnas `id TEXT PRIMARY KEY` (el `id` del evento), `kind`, `escrow`, `ledger`, `closed_at`, `tx_hash` y `data_json`;
   - una tabla `pp_cursor (k PRIMARY KEY, cursor)` para guardar por dónde va la ingesta.
2. **Ingesta:** un job cada 1–5 minutos, o al cargar `/transparencia` con un lock simple.

```ts
import { rpc, scValToNative } from "@stellar/stellar-sdk";
import deployed from "../contracts/deployments/testnet.json";

const server = new rpc.Server(deployed.rpcUrl);
const filters = [{ type: "contract" as const,
  contractIds: [deployed.contracts.pp_guardian, deployed.contracts.pp_arbiter] }];

export async function ingest(db: Database) {
  let cursor = db.prepare("select cursor from pp_cursor where k='events'").pluck().get() as string | undefined;
  for (;;) {
    const res = cursor
      ? await server.getEvents({ filters, cursor, limit: 200 })
      : await server.getEvents({ filters, startLedger: deployed.deployLedger, limit: 200 });
    const insert = db.prepare(`insert or ignore into pp_events
      (id, kind, escrow, ledger, closed_at, tx_hash, data_json) values (?,?,?,?,?,?,?)`);
    for (const ev of res.events) {
      insert.run(ev.id, scValToNative(ev.topic[0]), ev.topic[1] ? scValToNative(ev.topic[1]) : null,
        ev.ledger, ev.ledgerClosedAt, ev.txHash,
        JSON.stringify(scValToNative(ev.value), (_, v) => typeof v === "bigint" ? v.toString() : v));
    }
    cursor = res.cursor;
    db.prepare("insert or replace into pp_cursor (k, cursor) values ('events', ?)").run(cursor);
    if (res.events.length < 200) break;
  }
}
```

3. **Agregados:** se calculan con SQL o en TS sobre `pp_events`, con las mismas reglas que `scripts/metricas.sh`, que sirve de implementación de referencia y para verificar resultados.
   - El estado de cada compra lo da el primer evento terminal: `pp_confirmed`, `pp_auto_released`, `pp_resolved` o `pp_refunded_unshipped`.
   - Si no hay evento terminal pero sí `pp_disputed`, la compra está en disputa.
4. **Qué mostrar,** en español simple y sin jerga:
   - "Compras protegidas", "Volumen protegido" (en Bs ≈ USD) y "Se liberaron sin problemas" (confirmadas + automáticas, en % del total cerrado);
   - "Tiempo promedio hasta que el vendedor cobra";
   - "Reclamos" (total, quién los abrió y cómo se resolvieron: a favor del comprador, del vendedor o repartido);
   - "Comisiones" (plataforma 2%, Trustless Work 0,3%);
   - la lista de compras con "Ver en Stellar" (`escrow_url`, `tx_fondeo` y `tx_liberacion`), con las direcciones truncadas;
   - el texto fijo: "Estas cifras se calculan con datos públicos de la red Stellar (testnet). Cualquiera puede verificarlas."

**Alternativa mínima para la demo:** un route handler que ejecute el script (`bash scripts/metricas.sh`) o la misma lógica con `getEvents`, y cachee el JSON 60 s. Funciona mientras los eventos estén dentro de la ventana de retención del RPC.
