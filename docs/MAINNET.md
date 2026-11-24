# Prueba real en Stellar mainnet (entre amigos)

Para la final del viernes 27-nov. **Nada de esto toca la demo de testnet:** mainnet es otra instancia de la misma app, con su propio servicio, base, contratos y llaves, elegida con `STELLAR_NETWORK=mainnet`. Sin esa variable, la app es la de siempre.

Estado al 24-nov-2026: el código está listo y probado **sin red real**. No se desplegó nada, no se creó ninguna cuenta y no se firmó ninguna transacción en mainnet. Todo lo que cuesta plata lo ejecuta Hans con esta guía.

- [1. Lo que hay que saber antes](#1-lo-que-hay-que-saber-antes)
- [2. Cómo paga el comprador y quién paga qué](#2-cómo-paga-el-comprador-y-quién-paga-qué)
- [3. Cuentas y XLM](#3-cuentas-y-xlm)
- [4. Desplegar los contratos](#4-desplegar-los-contratos)
- [5. El servicio en Railway](#5-el-servicio-en-railway)
- [6. Primera compra (USD 1 a 5)](#6-primera-compra-usd-1-a-5)
- [7. Verificar en stellar.expert](#7-verificar-en-stellarexpert)
- [8. Si algo falla: cerrar o devolver](#8-si-algo-falla-cerrar-o-devolver)
- [9. Inventario: todo lo que depende de testnet](#9-inventario-todo-lo-que-depende-de-testnet)
- [10. Qué falta para la rampa de Pollar](#10-qué-falta-para-la-rampa-de-pollar-bolivianos-por-qr)
- [11. Límites conocidos](#11-límites-conocidos)

---

## 1. Lo que hay que saber antes

### Trustless Work en mainnet es otro contrato

Se verificó leyendo mainnet (solo lectura, 24-nov-2026):

| | Testnet (hoy) | Mainnet |
|---|---|---|
| WASM del escrow single-release | `1b367bc8…196660` (commit `f0b706e`). **No está en mainnet** | `96d51751f924c938a081deb740056dc1c5cc60c6e645672062531f82957ed2fe` |
| `release_funds` / `resolve_dispute` / `withdraw_remaining_funds` | reciben `trustless_work_address` | **no la reciben** |
| Cuenta del 0,3 % | la que pasamos (`twfee`) | fija en el WASM: `GBWWSOATPLIC72ZBOIM7WJCT7VCAHNWW4QUBZ2H4FORMCCIUM5ZVKSZN` (tiene trustline a USDC) |
| Fábrica | instancia propia que crea la app | la oficial es `CBPX734ETRN25FGHB2E2WGISGTGMDGG5QTDKJEEPJ56H7QAJJEFPBWTO`; la app sigue creando la suya con el mismo WASM |
| API REST | `dev.api.trustlesswork.com` | `api.trustlesswork.com`, **con API key propia de mainnet** (dapp.trustlesswork.com → Settings → API Keys → Mainnet) |

Consecuencias:

1. **API key:** no hace falta. Trato no usa la API de Trustless Work: habla directo con su contrato. Solo haría falta si se usara su API o su SDK REST.
2. **Nuestros contratos de testnet no sirven en mainnet.** Con ellos el fondeo entraría, pero `release_funds` fallaría por un argumento de más y la plata no se podría liberar. Por eso `pp_guardian` y `pp_arbiter` tienen el feature de compilación `tw-mainnet` (apagado por defecto; el build de siempre da los mismos hashes). Los 53 tests de contratos pasan con los dos: contra el WASM de testnet y contra el WASM real de mainnet (`contracts/wasm/escrow-mainnet.wasm`).
3. La variante sale del código de `main`, así que **incluye H-13** (plazo máximo de 7 días para resolver un reclamo), que la demo todavía no tiene desplegado.
4. La app no deja pagar si algo no calza: en mainnet el WASM del escrow está fijo en el código (no hay variable) y, antes de pedir la firma, comprueba por RPC que `pp_guardian` y `pp_arbiter` corran los WASM de `contracts/wasm/mainnet.sha256`.

**Decisión que queda a Hans.** La alternativa era subir a mainnet el WASM de testnet y usar los contratos v2 sin cambios. Se descartó por tres razones: cuesta 32,2 XLM más; la auditoría de Runtime Verification marcó como grave (A01) que el 0,3 % vaya a una cuenta elegida por quien llama; y no sería el contrato que Trustless Work usa en mainnet. Si prefieres esa, hay que cambiar `MAINNET_PUBLICO` en `app/src/lib/server/config.ts`.

Lo que no se pudo verificar: los IDs y hashes de mainnet no están en la documentación de Trustless Work (salen de la cadena), no recompilamos `96d51751` desde su código, y su repositorio no tiene licencia. Conviene escribirle a Trustless Work antes del viernes para avisar de la prueba.

### El RPC

La app y los comandos de esta guía usan un RPC público, sin clave. Resultado de `getHealth` y `getNetwork` el 24-nov-2026 a las 21:26 UTC:

| RPC | Resultado |
|---|---|
| `https://rpc.lightsail.network` (**por defecto**) | `healthy`, ledger 65653901, passphrase `Public Global Stellar Network ; September 2015`, protocolo 30, 7 días de eventos, 0,7 s |
| `https://soroban-rpc.mainnet.stellar.gateway.fm` | igual, 0,7 s |
| `https://rpc.ankr.com/stellar_soroban` | igual, 0,4 s |
| `https://mainnet.sorobanrpc.com` | respondió a las 21:16 y dejó de responder a las 21:19: no usarlo como único |

Si el de por defecto falla el viernes, cambia `STELLAR_RPC_URL` por cualquiera de los otros y reinicia el servicio. Horizon: `https://horizon.stellar.org` (respondió, protocolo 30).

### Topes y avisos

- Monto máximo por compra: `MAINNET_MAX_USD` (10 por defecto, con la protección incluida). Se revisa al crear el link, al cambiarlo y al pagar. Un valor inválido no abre el tope.
- Cuentas que activa la plataforma: `MAINNET_MAX_CUENTAS` (20 por defecto). Cada una cuesta 1,5 XLM; sin tope, cualquiera con la URL podría vaciar la cuenta.
- Aviso fijo en todas las páginas: «Prueba real en mainnet: plata real, montos chicos».
- `/probar`, la rampa simulada, friendbot y Pollar están apagados en mainnet aunque queden sus variables.
- `/metricas` de esta instancia tiene dos grupos: «Prueba real en mainnet» y el piloto. Las de testnet quedan solo en la demo: otra base, otros contratos. La app se niega a abrir una base de la otra red.

---

## 2. Cómo paga el comprador y quién paga qué

**Elegido: dirección a la que se manda USDC.** Es el menor cambio: la cuenta del comprador ya existe hoy (se crea sola en su navegador) y ya firma el fondeo. En mainnet, en lugar del QR simulado, la página muestra la dirección de esa cuenta. El comprador manda el USDC desde su propia cuenta Stellar (Lobstr, Freighter, un exchange), la página ve llegar el saldo y habilita «Pagar y guardar en el contrato».

Se descartó firmar con la billetera del comprador (Freighter o similar): suma una dependencia, no sirve desde un exchange y en celular depende de la app de cada uno.

Como la plata pasa por una cuenta que vive en el navegador, se agregó lo mínimo para que no quede atrapada:

- **Retirar mis USDC** (panel del vendedor, y la página del pedido para el comprador): manda todo el saldo a otra cuenta Stellar, con memo opcional. Lo firma el navegador; el servidor no puede mover esa plata.
- **Guardar el respaldo de mi cuenta:** muestra la clave (S…) para guardarla. Safari en iPhone puede borrar los datos de un sitio tras 7 días sin visitarlo: **pídele a cada persona que la guarde antes de pagar o vender.**

| Qué | Quién lo paga |
|---|---|
| Reserva de cada cuenta nueva (2 × 0,5 XLM) y de su trustline a USDC (0,5 XLM) | la plataforma: 1,5 XLM al activarla (`createAccount`). No se recupera |
| Comisiones de red de comprador y vendedor | la plataforma, con fee bump, como en testnet |
| Crear el contrato de cada compra | la plataforma |
| Resolver un reclamo | la cuenta `arbitro` |
| 2 % (o la protección) y 0,3 % de Trustless Work | salen del pago, como en testnet |

---

## 3. Cuentas y XLM

Cuatro cuentas tuyas. **Todas nuevas:** la app rechaza las llaves de testnet.

| Identidad | Para qué | Trustline USDC | XLM a mandarle |
|---|---|---|---:|
| `trato-deployer` | sube los WASM y despliega los contratos. Después se puede vaciar | no | **48** |
| `trato-arbitro` | admin de los dos contratos; firma los repartos del revisor | no | **3** |
| `trato-plataforma` | crea los escrows, paga comisiones y reservas, cobra el 2 % | **sí, obligatoria** | **20** |
| tu cuenta de siempre | de donde salen los XLM y el USDC de la prueba | sí | — |

**Total: 71 XLM.** Cálculo (tarifas leídas de mainnet el 24-nov; reserva base 0,5 XLM):

| Concepto | XLM | De dónde sale |
|---|---:|---|
| Subir `pp_guardian.wasm` (20.407 B, 120 días) | 23,1004041 | simulado en mainnet |
| Subir `pp_arbiter.wasm` (13.846 B, 120 días) | 17,8803247 | simulado en mainnet |
| Instanciar los dos contratos y `set_arbiter` | ≤ 0,70 | cota: no se puede simular hasta subir los WASM |
| Reserva de `trato-deployer` (2 × 0,5) | 1,00 | base |
| Colchón (la renta sube con el tamaño del estado de la red) | 5,32 | |
| **`trato-deployer`** | **48,00** | |
| Reserva (1,00) + `set_arbiter` y unos 10 repartos (≤ 0,20) + colchón | 3,00 | |
| **`trato-arbitro`** | **3,00** | |
| Reserva con trustline (3 × 0,5) | 1,50 | base |
| Fábrica de escrows, una sola vez | 0,03 | simulado: 0,0209 |
| 6 personas × 1,5 | 9,00 | exacto |
| 5 compras × 0,45 | 2,25 | ver abajo |
| Colchón | 7,22 | |
| **`trato-plataforma`** | **20,00** | |

Cada compra: crear el escrow 0,2433 (simulado con la fábrica oficial; en la red se ve entre 0,22 y 0,38), fondear ≤ 0,15, registrar el envío ≤ 0,02, confirmar ≤ 0,01 y dos retiros ≤ 0,03. Total **≈ 0,45 XLM**. Para otra cantidad: `1,53 + 1,5 × personas + 0,45 × compras + colchón`.

Antes de empezar, compara con la red: si la simulación del paso 4 pide más que eso, manda más XLM. Si el saldo no alcanza, la red rechaza la transacción sin cobrarla.

```bash
# Red (el RPC por defecto de la app). Cuidado: si exportas STELLAR_NETWORK, el CLI también la lee.
stellar network add mainnet --rpc-url https://rpc.lightsail.network \
  --network-passphrase "Public Global Stellar Network ; September 2015"

# Identidades nuevas, sin friendbot. Guarda un respaldo de cada una fuera de la computadora.
for k in trato-deployer trato-arbitro trato-plataforma; do stellar keys generate $k; stellar keys address $k; done
```

Manda los XLM desde tu cuenta a las tres direcciones (verifícalas en stellar.expert) y abre la trustline de la plataforma:

```bash
stellar tx new change-trust --network mainnet --source trato-plataforma \
  --line USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
```

Sin esa trustline la liberación fallaría (Trustless Work le paga el 2 % a esa cuenta): la app no deja pagar hasta que exista.

---

## 4. Desplegar los contratos

Necesitas `stellar-cli 30.0.1` y el Rust de `contracts/rust-toolchain.toml` (1.99.1): con otras versiones cambian los hashes.

```bash
cd contracts
cargo test                                               # 53 tests, escrow de testnet
cargo test -p pp_integration_tests --features tw-mainnet # los mismos, escrow real de mainnet
bash scripts/wasm-mainnet.sh                             # compila y compara; NO sigas si algo dice DIFERENTE
```

Tiene que dar:

```
OK  pp_guardian.wasm     46e96842b9c71e3930ef6c554d181153672afce9b971d214ecc20f9810309d94
OK  pp_arbiter.wasm      a23fde5c8abd3f9ae76834b3136c836769b0906834d48986f9c1ee3060e0263c
OK  escrow-mainnet.wasm  96d51751f924c938a081deb740056dc1c5cc60c6e645672062531f82957ed2fe
```

`wasm-mainnet.sh` compara con `contracts/wasm/mainnet.sha256`. `verify-wasm.sh` no cambia: sigue verificando los de testnet.

```bash
ARB=$(stellar keys address trato-arbitro)
TW=GBWWSOATPLIC72ZBOIM7WJCT7VCAHNWW4QUBZ2H4FORMCCIUM5ZVKSZN

# 1 y 2. Subir los WASM (≈ 41 XLM). Devuelven los hashes de arriba.
stellar contract upload --network mainnet --source trato-deployer --wasm target/mainnet/pp_guardian.wasm
stellar contract upload --network mainnet --source trato-deployer --wasm target/mainnet/pp_arbiter.wasm

# 3. pp_guardian (mismos plazos que testnet: de 60 s a 30 días)
GUARDIAN=$(stellar contract deploy --network mainnet --source trato-deployer \
  --wasm-hash 46e96842b9c71e3930ef6c554d181153672afce9b971d214ecc20f9810309d94 -- \
  --admin $ARB --tw_fee $TW --min_ship_secs 60 --max_ship_secs 2592000 --min_inspect_secs 60 --max_inspect_secs 2592000)

# 4. pp_arbiter
ARBITER=$(stellar contract deploy --network mainnet --source trato-deployer \
  --wasm-hash a23fde5c8abd3f9ae76834b3136c836769b0906834d48986f9c1ee3060e0263c -- \
  --admin $ARB --guardian $GUARDIAN --tw_fee $TW)

# 5. Conectarlos (una sola vez, lo firma el árbitro)
stellar contract invoke --network mainnet --id $GUARDIAN --source trato-arbitro -- set_arbiter --arbiter $ARBITER

# 6. Comprobar lo que quedó en la red (solo lectura)
for id in $GUARDIAN $ARBITER; do stellar contract fetch --network mainnet --id $id --out-file /tmp/c.wasm && shasum -a 256 /tmp/c.wasm; done
stellar contract invoke --network mainnet --id $GUARDIAN --source trato-arbitro --send=no -- config
stellar contract invoke --network mainnet --id $ARBITER  --source trato-arbitro --send=no -- config
echo "GUARDIAN=$GUARDIAN  ARBITER=$ARBITER"
```

Anota los dos IDs y el ledger del paso 3 (stellar.expert lo muestra en la transacción): es `PP_DEPLOY_LEDGER`. El `tw_fee` queda guardado pero en mainnet no se usa: el 0,3 % va a la cuenta fija del escrow.

Los contratos no son actualizables. Si algo sale mal antes de la primera compra, se despliega otro par; los WASM ya subidos no se vuelven a pagar.

---

## 5. El servicio en Railway

Un servicio **aparte** del de la demo, con su propio volumen. Se construye con `deploy/app.Dockerfile`, que ahora acepta `STELLAR_NETWORK` como build arg. La red queda fija al construir (el navegador firma para esa red): si el build y el runtime no coinciden, la app no arranca.

| Variable | Para qué |
|---|---|
| `STELLAR_NETWORK` | `mainnet`, en **build y runtime** |
| `PP_GUARDIAN_ID`, `PP_ARBITER_ID` | los contratos del paso 4 (obligatorias: no hay valor por defecto) |
| `PP_DEPLOY_LEDGER` | desde qué ledger lee eventos `/metricas` |
| `PLATAFORMA_SECRET`, `ARBITRO_SECRET` | llaves de `trato-plataforma` y `trato-arbitro` |
| `ARBITRO_PANEL_KEY` | clave del panel del revisor (una nueva) |
| `PP_DB_PATH` | base nueva, dentro del volumen del servicio |
| `FX_BS_PER_USD`, `PLATFORM_FEE_BPS` | como en la demo |
| `MAINNET_MAX_USD`, `MAINNET_MAX_CUENTAS` | topes (opcionales: 10 y 20) |
| `STELLAR_RPC_URL`, `STELLAR_HORIZON_URL` | opcionales, para cambiar de RPC o de Horizon |
| `PP_IP_HEADER` | opcional, como en la demo |
| `PP_DEMO` | opcional. Con 1, `?demo=1` ofrece plazos de 2 minutos y «Pagar al vendedor» se habilita a los 10 segundos. Solo para mostrarlo en vivo, entre personas de confianza |

**No pongas:** `LAB_SECRET`, `LABUSD_CODE`, `LABUSD_SAC`, `TWFEE_ADDRESS`, `ESCROW_WASM_HASH`, `PP_PROBAR`, `NEXT_PUBLIC_WALLET`, las de Pollar ni ninguna llave de testnet. `PP_DEVOLUCION_COMPLETA` queda apagada: con 1, la plataforma necesita saldo de USDC para reintegrar comisiones.

Al levantar, comprueba:

1. `/api/info` responde con `"red":"mainnet"`, `"topeUsd":10`, los dos contratos tuyos y `wasmHash` `96d51751…`.
2. La franja de arriba dice «Prueba real en mainnet: plata real, montos chicos».
3. `/probar` da 404 y `/metricas` dice «Prueba real en mainnet».

El cron de plazos de GitHub apunta a la demo: en mainnet los plazos se procesan cuando alguien visita el sitio, o con `curl -X POST <URL>/api/plazos/procesar`.

---

## 6. Primera compra (USD 1 a 5)

Dos personas, cada una en su celular. Vendedor A, comprador B. B necesita unos USD 4 de USDC en una cuenta Stellar propia.

1. **A** entra a `/vender`, crea su tienda y su cuenta se activa (cuesta 1,5 XLM de la plataforma). En el panel abre «Guardar el respaldo de mi cuenta» y guarda la clave.
2. **A** crea un link: Bs 20, 1 día para despachar, protección a cargo del comprador. B pagará Bs 25 (≈ 2,14 USDC). El mínimo de protección es Bs 5, así que USD 1 exacto es «Yo la regalo» con Bs 11,70.
3. **B** abre el link, toca «Pagar … con USDC» y pone los datos de entrega. Su cuenta se activa y aparecen la dirección y el monto. **Guarda el respaldo antes de mandar nada.**
4. **B** manda el monto exacto de **USDC en la red Stellar** a esa dirección. En unos segundos la página dice que llegó.
5. **B** toca «Pagar y guardar en el contrato». Son dos transacciones (crear el contrato y fondearlo), unos 30 segundos.
6. **A** ve el pedido pagado y registra el envío («Entrega en persona» sirve).
7. **B** confirma. En la misma ciudad se habilita a las 2 horas; en otra, a las 24. Para mostrarlo en vivo, usa `PP_DEMO=1` y crea el link desde el panel con `?demo=1`.
8. **A** retira: «Retirar mis USDC» → su propia cuenta Stellar, con memo si es de un exchange.

Con Bs 20 a cargo del comprador: B paga ≈ 2,1368 USDC, A recibe el precio completo (≈ 1,7094), Trustless Work el 0,3 % y Trato el resto. Haz primero una de este monto completa antes de invitar a más gente.

---

## 7. Verificar en stellar.expert

Todo en `https://stellar.expert/explorer/public/…`:

| Qué mirar | Dónde | Qué tiene que decir |
|---|---|---|
| Contratos | `/contract/<PP_GUARDIAN_ID>` y `/contract/<PP_ARBITER_ID>` | el hash del WASM es el del paso 4 |
| Escrow de la compra | link «Ver contrato» del pedido | WASM `96d51751…`, creado por `trato-plataforma` |
| Fondeo | la transacción «Guardar el pago en el contrato» | transferencia de USDC de la cuenta de B al escrow; la comisión la pagó `trato-plataforma` (fee bump) |
| Moneda | el activo de la transferencia | USDC, emisor `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`, contrato `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` |
| Liberación | la transacción «Pagar al vendedor» | tres transferencias: vendedor, `trato-plataforma` y `GBWW…KSZN` (0,3 %). El escrow queda en 0 |
| Nadie más cobró | saldos del escrow y de las tres cuentas | la suma de lo que salió es lo que entró |

Estado crudo de una compra: `stellar contract invoke --network mainnet --id <PP_GUARDIAN_ID> --source trato-arbitro --send=no -- purchase --escrow <ESCROW>`.

---

## 8. Si algo falla: cerrar o devolver

La plata de una compra solo puede ir al vendedor o volver al comprador, con el servidor prendido o apagado. Los comandos del CLI sirven aunque la app esté caída.

| Situación | Qué hacer |
|---|---|
| B mandó USDC y no pagó | «Ya no quiero pagar: devolverme el USDC» en la página del pago |
| El pago dice que la verificación falló | no se firmó nada: el USDC sigue en la cuenta de B. Revisar los hashes del paso 4 |
| Se firmó el fondeo y la página no avanza | esperar y recargar: la app le pregunta a `pp_guardian`. Si la compra está registrada, aparece pagada |
| A no despacha | al vencer el plazo se devuelve sola al visitar el pedido o con `POST /api/plazos/procesar`. A mano: `dispute_escrow` y `refund_unshipped` (abajo) |
| A despachó y B no confirma | vencida la revisión se paga sola. A mano: `auto_release` (cualquiera lo firma) |
| Llegó mal | B abre un reclamo; el revisor reparte en `/revisor` (0 a 100 %) |
| El revisor no puede decidir | a los 7 días del reclamo cualquiera ejecuta `resolve_expired`: todo al comprador si no hubo envío, todo al vendedor si lo hubo |
| RPC caído o lento | cambiar `STELLAR_RPC_URL` (sección 1) y reiniciar |
| B o A perdió el navegador | con la clave de respaldo, importarla en una billetera Stellar (Lobstr, Freighter) y mover el USDC. Sin respaldo, esa plata se pierde |
| Hay que parar todo | apagar el servicio nuevo en Railway. Lo que esté en contratos se cierra por CLI |

```bash
G=<PP_GUARDIAN_ID>; R=<PP_ARBITER_ID>; E=<escrow de la compra>
# No despachó y venció el plazo: congelar (rol platform) y devolver
stellar contract invoke --network mainnet --id $E --source trato-plataforma -- dispute_escrow --signer $(stellar keys address trato-plataforma)
stellar contract invoke --network mainnet --id $R --source trato-arbitro -- refund_unshipped --escrow $E
# Despachó, venció la revisión y no hay reclamo
stellar contract invoke --network mainnet --id $G --source trato-arbitro -- auto_release --escrow $E
# Reclamo abierto: 10000 = todo al comprador, 0 = todo al vendedor
stellar contract invoke --network mainnet --id $R --source trato-arbitro -- resolve --escrow $E --buyer_bps 10000
# Reclamo de más de 7 días sin decidir
stellar contract invoke --network mainnet --id $R --source trato-arbitro -- resolve_expired --escrow $E
```

En una devolución total el comprador recibe el pago **menos** las comisiones del contrato (0,3 % de Trustless Work y la de la plataforma), igual que en testnet. En una prueba de USD 2 son centavos: devuélvelos a mano desde `trato-plataforma`.

Al terminar: `stellar tx new account-merge --network mainnet --source trato-deployer --account <tu cuenta>` recupera lo que sobró ahí. No cierres `trato-plataforma` ni `trato-arbitro` mientras haya compras abiertas.

---

## 9. Inventario: todo lo que depende de testnet

| Qué | Dónde | En mainnet |
|---|---|---|
| Passphrase | `app/src/lib/server/config.ts`, `lib/wallet/local.ts` | `lib/red.ts` → `PASSPHRASE[RED]` |
| RPC `soroban-testnet.stellar.org` | `config.ts` | `rpc.lightsail.network` o `STELLAR_RPC_URL` |
| Horizon `horizon-testnet.stellar.org` (trustlines, historial, reintegros, indexador) | `config.ts` → `stellar.ts`, `metrics.ts`, `verificacion.ts`, `reintegro-red.ts` | `horizon.stellar.org` o `STELLAR_HORIZON_URL` |
| Friendbot | `stellar.ts` `ensureFunded` | `createAccount` de 1,5 XLM desde la plataforma, con cupo |
| LABUSD, emisor `lab` y su SAC (`LAB_SECRET`, `LABUSD_CODE`, `LABUSD_SAC`) | `config.ts`, `stellar.ts` `labusd()` y `mintLabusd()` | USDC de Circle fijo; el SAC se deriva del emisor; `mintLabusd` da error |
| Rampa simulada | `orders.ts` `startPayment`, `PagoQr.tsx` | no existe: depósito de USDC (`components/mainnet/PagoUsdc.tsx`) |
| WASM del escrow de Trustless Work (`ESCROW_WASM_HASH`) | `config.ts`, `escrow/tw.ts`, `contracts/wasm/escrow.wasm` | `MAINNET_PUBLICO.twWasmHash`, `contracts/wasm/escrow-mainnet.wasm` |
| Fábrica (instancia propia, guardada en `kv`) | `escrow/tw.ts` `factoryId` | igual, con el WASM de mainnet |
| Cuenta del 0,3 % (`TWFEE_ADDRESS`) | `config.ts`, constructores de los contratos | fija en el WASM de Trustless Work |
| IDs de `pp_guardian` y `pp_arbiter` (por defecto los v2 `CDKY…`/`CDTE…`; la demo usa `CB3O…`/`CAS6…` por variable) | `config.ts` | obligatorios por variable; los de testnet publicados en `contracts/deployments/testnet.json` se rechazan |
| API de Trustless Work | no se usa | no se usa |
| Explorador `stellar.expert/explorer/testnet` | `lib/format.ts` | `/explorer/public` |
| Indexador de `/metricas`: `DEPLOY_LEDGER`, pares históricos, cuenta de la plataforma, regla «moneda» | `metrics.ts`, `verificacion.ts`, `kpis.ts` | `PP_DEPLOY_LEDGER`, solo el par de mainnet, USDC, grupo `mainnet` |
| Pollar (`stellarNetwork: "testnet"`) | `PollarProviders.tsx` | apagado: billetera local para los dos roles |
| `/probar`, `/api/probar/*`, e2e, videos y `scripts/*.mjs` de la app | varios | apagado o solo testnet (no se tocaron) |
| Enlaces fijos en `components/probar/Construido.tsx` | `/probar` | no se muestran |
| Scripts de contratos: `lib.sh` (se niega a correr fuera de testnet), `deploy-testnet.sh`, `redesplegar-testnet.sh`, `flujo-*.sh`, `metricas.sh`, `archivar-evidencia.sh` | `contracts/scripts/` | no se tocan; mainnet usa `wasm-mainnet.sh` y los comandos de la sección 4 |
| `verify-wasm.sh` | `contracts/scripts/` | sin cambios (testnet); `wasm-mainnet.sh` es el de mainnet |
| Cron de plazos | `.github/workflows` | apunta solo a la demo |
| Bot de WhatsApp | `bot/` | no se despliega en esta prueba |
| Textos «modo práctica», «dólares de prueba», «red de prueba» | páginas y componentes | `lib/red.ts` `TEXTOS` |

**Cómo vive cada escrow** (igual en las dos redes, salvo lo marcado):

1. **Se crea.** La plataforma llama `tw_new_single_release_escrow` en su instancia fábrica: despliega e inicializa el escrow de esa compra en una transacción. Roles: `approver` y `release_signer` = `pp_guardian`; `dispute_resolver` = `pp_arbiter`; `service_provider` y `receiver` = vendedor; `platform` = plataforma. *En mainnet, recién cuando el USDC ya está en la cuenta del comprador.*
2. **Se fondea.** El comprador firma `pp_guardian.fund` (monto y plazos), la plataforma lo envuelve en un fee bump. La app verifica antes el WASM y los roles. *En mainnet, también el WASM de nuestros dos contratos.*
3. **Se libera.** `confirm` (comprador, después de `mark_shipped`) o `auto_release` (cualquiera, vencida la revisión).
4. **Se devuelve o reparte.** `refund_unshipped` (no despachó), `resolve` (revisor) o `resolve_expired` (H-13). *`resolve_expired` está en los contratos de mainnet; la app todavía no lo llama: va por CLI.*

---

## 10. Qué falta para la rampa de Pollar (bolivianos por QR)

Solo análisis: no hay nada implementado. Fuente: las docs de Pollar leídas el 18-nov (`docs-pp/pollar/` y `POLLAR.md`, fuera de este repo).

**La ruta.** El comprador paga un QR bancario en Bs. Stereum recibe los bolivianos y entrega USDT en Polygon; Pollar lo cambia a USDC en Polygon y lo pasa a Stellar con el puente CCTP de Circle. Son 3 tramos (el tope por ruta es 4). La orden entrega **en la billetera Pollar del usuario**, no en otra dirección ni en un contrato: después el comprador igual firma `pp_guardian.fund`.

**Lo que no sabemos y hay que preguntarle a Pollar primero:**

1. ¿Stereum/BOB está disponible en Live? En Test mode Bolivia no aparece y `GET /v3/ramps/routes` devolvió una lista vacía el 18-nov.
2. ¿Cuál es el mínimo por operación y el costo total? La doc no da cifras; con dos tramos extra, una compra de USD 1 a 10 puede no alcanzar el mínimo o perder mucho en comisiones.
3. ¿Stereum exige que el titular de la cuenta que paga el QR sea el dueño de la billetera?

**Paso a producción, en orden:**

| Paso | Qué implica |
|---|---|
| Pedir Live | Settings → General → Go live. Lo aprueba Pollar a mano: no hay plazo publicado. Crea una app nueva con llaves `pub_mainnet_` y `sec_mainnet_` |
| Dominio | registrar el dominio del servicio de mainnet en Developers → Websites |
| Custodia con Turnkey | en Live, Pollar no guarda llaves: hay que elegir **co-firmada 2 de 2** (dispositivo del usuario + Pollar) o autocustodia 1 de 1. Conviene la co-firmada, que permite políticas |
| Recuperación | una billetera Turnkey no firma nada, salvo su propia creación, hasta que el usuario agrega una (passkey, correo u otro dispositivo): `SDK_WALLET_RECOVERY_REQUIRED`. Es un paso más antes del primer pago |
| Firmas | cada firma pide aprobación en el dispositivo, y los tramos de rampa siempre. El fondeo es un XDR armado por nosotros: `signTx` puede responder `cosign_pending`, que hoy `lib/wallet/pollar.ts` trata como error. Hay que esperar la aprobación y seguir |
| Vencimiento | el fondeo que arma el servidor vence a los 300 s y un XDR propio **no se rearma** al aprobar: si el usuario tarda más, hay que pedir otro |
| Reservas y comisiones | modelo de créditos (100 créditos = 1 USD) o billeteras propias. El activador de la cuenta y la trustline a USDC pasarían a Pollar; nuestro fee bump del fondeo puede seguir |
| KYC | lo hace el **comprador**, sea cual sea el monto, si el corredor lo exige: formulario, Didit (documento y prueba de vida) y SEGIP. Cada paso se cobra en créditos. Si se usan cuentas propias de Stereum, también el KYC propio |
| Billetera en Polygon | la ruta pasa por Polygon: Pollar crea ahí una «rail wallet» del usuario, con su llave del dispositivo |

**Cambios en Trato:** Pollar también para el comprador (hoy es solo del vendedor y la billetera local es invisible), `stellarNetwork` según `RED`, pantalla de cotización y orden (`quoteRamp`, `createRampOrder`, `pollRampOrder`), manejo de órdenes retenidas (`retryRampOrder`), esperar el USDC con el mismo chequeo de saldo que ya existe (`/api/wallet/saldo`) y seguir con el fondeo. Para el vendedor, la venta (USDC a Bs) es la ruta inversa por Stereum.

**Lectura.** No llega para el viernes: depende de una aprobación manual, del KYC de cada comprador y de saber si BOB está en Live. Lo razonable es pedir Live esta semana y mostrar la prueba con USDC directo. El depósito de USDC que se construyó es el mismo punto de llegada que usaría la rampa.

---

## 11. Límites conocidos

- **Sin ensayo en testnet de la liberación:** el WASM de mainnet paga a una cuenta fija que en testnet no tiene trustline a LABUSD. El ensayo real es la primera compra de USD 2; antes están los 53 tests contra ese WASM.
- El monto en USDC tiene 7 decimales; si la billetera o el exchange redondea hacia abajo, faltará una fracción. Que mande un centavo de más: lo que sobra se retira.
- Si un reclamo se cierra con `resolve_expired`, el pedido queda resuelto, pero `/metricas` y `/transparencia` lo siguen mostrando en reclamo (todavía no leen ese evento).
- El pago a 2 transacciones asume un solo proceso del servidor, como en la demo.
- No se corrió el e2e en mainnet (gasta plata real). Los tests de mainnet usan llaves al azar y ninguna red.
- El contrato del USDC de Circle puede congelar cuentas (`AUTH_REVOCABLE`): es propio de USDC, no de Trato.
- No hay revisión legal de una prueba con dinero de terceros: por eso, solo entre conocidos y con tope.
