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

El momento de cada evento es el `ledgerClosedAt` del ledger que lo incluye.

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

Es una corrida real en testnet del 2026-11-18, ledgers 5790662 → 5791278. Incluye:
- las compras de `flujo-testnet.sh` (a–d);
- las 6 de `compras-demo.sh` (Bs 120 a 900);
- las que la app ya hizo en modo guardián.

Resultado: **14 compras**, 1087,61 USD de prueba (≈ Bs 12 725). Hubo 6 confirmaciones, 2 liberaciones automáticas y 6 disputas. De las disputas:
- 4 las abrió el comprador y 2 el vendedor;
- 5 las resolvió el árbitro: 1 a favor del comprador, 1 a favor del vendedor y 3 con reparto parcial;
- 1 terminó en reembolso por falta de envío.

En el JSON, el reembolso cuenta como 100% comprador. Por eso suma 4 en `repartos_parciales` y 1 en `a_favor_del_comprador`.

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
| `comisiones_estimadas` | Nominales sobre compras cerradas: 2% plataforma y 0,3% TW |
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
