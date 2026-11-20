# Trato

**El contra entrega que cruza departamentos.** Trato es un link de pago para ventas por redes en Bolivia:
- el comprador paga con QR;
- la plata queda bloqueada en contratos de Stellar hasta que confirma que recibió;
- si el vendedor no despacha, la plata vuelve sola.

**[Pruébalo en el navegador]([URL]/probar)** · **[Video de 3 minutos]([link])** · **[Contratos en testnet](#evidencia-on-chain)** · **[Verifícalo en tu máquina](#pruébalo)**

> Trato antes se llamaba Pago Protegido. El repo, los contratos (`pp_guardian`, `pp_arbiter`) y los códigos de pedido `PP-` conservan ese nombre.

## Trato en los cinco criterios

| Criterio | Qué hay | Dónde verlo |
|---|---|---|
| **Problema y usuario** | Bolivia hizo 892 millones de pagos con QR en 2025 (BCB), pero con un desconocido de otra ciudad alguien tiene que confiar primero. En Tarija, 74 de las 91 denuncias por estafa de 2026 empezaron en redes; un falso vendedor de iPhone cobró por adelantado a 6 compradores de 3 departamentos. Y al vendedor tampoco le sirve una captura: ASFI advierte sobre comprobantes falsificados. Usuario inicial: vendedores de celulares y electrónica que envían por encomienda a otra ciudad. Validación: [N] entrevistas | [docs/PROBLEMA.md](docs/PROBLEMA.md) (24 casos públicos con fuente) · [docs/USUARIOS.md](docs/USUARIOS.md) |
| **Producto funcionando** | Flujo completo en Stellar testnet: link → QR → plata bloqueada → envío con foto → confirmación, liberación por plazo o devolución. 12 de 12 pruebas de punta a punta contra testnet, 6 de ellas con pagos reales | [`/probar`]([URL]/probar) · [video]([link]) · [capturas](app/e2e/capturas/) |
| **Uso de Stellar** | Dos contratos Soroban propios en los roles que mueven la plata del escrow de Trustless Work. *Fee bump*, Pollar, verificación del WASM antes de firmar y reputación calculada solo con compras verificadas. 47 tests contra el WASM real, incluidas secuencias aleatorias de operaciones; 9 desvíos rechazados en testnet; los hashes de los contratos se reproducen con `contracts/scripts/verify-wasm.sh` | [Evidencia](#evidencia-on-chain) · [docs/SEGURIDAD.md](docs/SEGURIDAD.md) |
| **Plan de 30 días** | Tres entregables que dependen solo del equipo y se verifican desde afuera, con una métrica norte y un punto de decisión en la semana 2 | [Plan](#plan-de-30-días) |
| **Equipo y compromiso** | El avance entre entregas, cambio por cambio y con links | [Avance](#avance) |

## Avance

| Prometido el 19-nov | Estado al 20-nov | Evidencia |
|---|---|---|
| README sin contradicciones | hecho | [PR #1](https://github.com/haneiva1/pago-protegido/pull/1) |
| Plan de 30 días medible, separando lo propio de lo que depende de terceros | hecho | [Plan](#plan-de-30-días) |
| CI pública con los tests de contratos y del bot | [estado] | [link] |
| Demo desplegada con el proceso que libera y devuelve los pedidos vencidos | [estado] | [link] |
| Prueba del login de Pollar en la demo desplegada | [estado] | [link] |
| Entrevistas con vendedores y compradores | [N] vendedores y [N] compradores | [docs/USUARIOS.md](docs/USUARIOS.md) |
| **Además, el 20-nov** | | |
| Nombre Trato en la app, el bot y la documentación | hecho | [PR #2](https://github.com/haneiva1/pago-protegido/pull/2) |
| Textos limpios y una sola versión: el mismo segmento (Bs 1.000 a 7.000) en todas las pantallas, y un test que falla si aparece una palabra prohibida | hecho | [PR #3](https://github.com/haneiva1/pago-protegido/pull/3) |
| Experiencia del comprador: "Dos salidas", QR para pagar desde el mismo celular, acceso a su compra, reclamo guiado, evidencia con cámara y seguimiento del envío | hecho | [PR #4](https://github.com/haneiva1/pago-protegido/pull/4) |
| Reputación verificada: solo cuentan las compras cuyo contrato es el de Trustless Work y donde la plata se movió (H-9) | hecho | [PR #5](https://github.com/haneiva1/pago-protegido/pull/5) |
| Contratos comprobables: 47 tests contra el WASM real y hashes que se reproducen con `verify-wasm.sh` | hecho | [PR #5](https://github.com/haneiva1/pago-protegido/pull/5) |
| API firmada: cada acción del comprador y del vendedor lleva su firma (SEP-53). Nadie puede bloquear un link: reserva de 10 minutos al pagar, códigos de 8 caracteres y límite por IP | hecho | [PR #6](https://github.com/haneiva1/pago-protegido/pull/6) |
| Vendedor y revisor: link rápido, envío con foto y huella, "Pasar a mi banco" (simulado) y un revisor que ve la regla que aplica y "✓ coincide" en cada foto | hecho | [PR #7](https://github.com/haneiva1/pago-protegido/pull/7) |
| `/probar`: el vendedor y el comprador lado a lado, con cada transacción en stellar.expert | hecho | [PR #9](https://github.com/haneiva1/pago-protegido/pull/9) |
| Devolución completa (apagada) y evidencia archivada | hecho (detrás de un interruptor apagado) | [PR #8](https://github.com/haneiva1/pago-protegido/pull/8) |

## Pruébalo

**En el navegador (2 minutos):** en [`/probar`]([URL]/probar), el vendedor y el comprador aparecen lado a lado. Cada paso muestra su transacción en stellar.expert, incluido un intento de desvío que el contrato rechaza.

**En tu máquina, sin claves.** Requisitos: Rust y cargo, Node 22 o más, y Chromium para Playwright.

```bash
cd contracts && cargo test && cd ..                        # 47 tests contra el WASM real de Trustless Work
cd bot && npm ci && npm test && cd ..                      # bot: 191 unitarios y 4 e2e del simulador
cd app && npm ci && npm run build && npm run test:e2e:publico   # app: build y e2e de solo lectura contra testnet
```

El camino con pagos en testnet y la demo local están en [docs/TECNICO.md](docs/TECNICO.md#para-el-jurado).

## Evidencia on-chain

**Contratos v2 en testnet:**
- `pp_guardian`: [`CDKYF7OA…UOATOT`](https://stellar.expert/explorer/testnet/contract/CDKYF7OAJTACP4JNJSGGXDRA3DHE442R26CT5ZE5DJHNSHH7XJUOATOT)
- `pp_arbiter`: [`CDTEA424…TEVU5UA`](https://stellar.expert/explorer/testnet/contract/CDTEA424AWSIIHEQ4FIQHFQOTWS3XAVLQHX7FI3MU6JZP4OPMTEVU5UA)

**Transacciones:**

| Qué pasa | Transacción |
|---|---|
| El comprador paga y la plata queda bloqueada | [`5143ee1b…`](https://stellar.expert/explorer/testnet/tx/5143ee1b7b4c076782172248a5e2e52740fcaf5fa633347207f8b38ffe68fd57) |
| El vendedor registra el envío | [`00082803…`](https://stellar.expert/explorer/testnet/tx/00082803f6f9521016c7f12496c8276e2ac509b5c7f765e5c9cdc87416d9f0c3) |
| "Pagar al vendedor": aprueba y libera en una sola transacción | [`0d3cb6aa…`](https://stellar.expert/explorer/testnet/tx/0d3cb6aa042da56b562c3490f5c45311b08af66d4fcf2eb80e742026aeefaba9) |
| Liberación al vencer la revisión, sin firmas | [`4a6feb28…`](https://stellar.expert/explorer/testnet/tx/4a6feb28078c8404d88947730aadea7c32c42d2a400ee1fb21e2cd937633644a) |
| Devolución porque el vendedor no despachó, sin firmas | [`fdff2f9b…`](https://stellar.expert/explorer/testnet/tx/fdff2f9bb7ce10a0cf02f2d2dbbf299c38681bdea4db872bc98caec2713de0ee) |
| El revisor reparte 70/30: solo puede elegir el porcentaje | [`68ba9ed2…`](https://stellar.expert/explorer/testnet/tx/68ba9ed24755a4c401a28bfa122b5a48fee7929a1d9ae9256bb7f4e1b2ff889d) |
| Un tercero intenta cobrar haciéndose pasar por el revisor | rechazado, `Error(Contract, #12)` ([evidencia](contracts/scripts/out/flujo-v2/fallo-d-d7.txt)) |

Una compra completa cuesta ≈0,138 XLM de comisión de red (`contracts/scripts/out/flujo-v2/txlog.tsv`), y la paga la plataforma. Los 9 desvíos y los 6 escenarios están en [docs/TECNICO.md](docs/TECNICO.md#evidencia).

## Seguridad en 5 líneas

1. Los roles que mueven el pago son contratos sin llave privada: nadie puede firmar por ellos.
2. El pago solo puede ir al vendedor o volver al comprador; aparte, la comisión fija del pedido. Ninguna función acepta otra dirección.
3. "Pagar al vendedor" aprueba y libera en la misma transacción. El envío se registra una sola vez y los plazos los firma el comprador.
4. Hay 47 tests contra el WASM real: invariantes, red team y 200 secuencias aleatorias que comprueban que el saldo se conserva, que ningún tercero cobra y que cada compra tiene un solo desenlace. En testnet se rechazaron 9 desvíos sin que el tercero recibiera nada. Los hashes de los contratos desplegados se reproducen desde el código (`verify-wasm.sh`).
5. Atacamos nuestro propio historial de tiendas: con un contrato falso se podían fabricar ventas. Ahora solo cuentan las compras cuyo contrato es el de Trustless Work y donde la plata se movió ([H-9](docs/SEGURIDAD.md)).

Lo que falta antes de mainnet está en [docs/SEGURIDAD.md](docs/SEGURIDAD.md).

## Plan de 30 días

**Métrica norte:** pedidos completados por vendedores reales.

| Semana | Entregable a la SDF y cómo se verifica | Responsable | Meta |
|---|---|---|---|
| 1 (30 nov – 6 dic) | **E1. App pública que cualquiera puede usar:** URL estable, proceso automático de plazos, CI en verde y `/probar` abierto. Se verifica con la URL, las transacciones en stellar.expert y el historial de CI | Joaquín | 20 vendedores confirmados para el piloto |
| 2–3 (7 – 20 dic) | **E2. Piloto medido:** 20 vendedores del segmento usan links reales con montos de prueba en testnet, y el comprador tiene cuenta recuperable (Pollar o passkey). Se verifica en `/metricas`, con el indexador verificado, y en `docs/USUARIOS.md` | Los dos | ≥40% de links pagados, ≥70% sin reclamo y ≥5 vendedores con un segundo link |
| 4 (21 – 27 dic) | **E3. Contratos v3 listos para auditoría:** plazo para reclamar (H-10), fondeo co-firmado por la plataforma, revisor 2 de 3 con multisig nativo, build reproducible y modelo de amenazas para el Audit Bank. Postulación al SCF | Hans | Informe de seguridad y postulación enviada |

**Punto de decisión:** si en la semana 2 menos del 30% de los links llega al pago, cambia la oferta: quién paga la protección, el precio o el segmento.

**Gestión en paralelo, sin prometer resultados:**
- cartas de interés de un banco que ya opera con dólares digitales, de una agencia de encomiendas y de 2 o 3 administradores de grupos de compraventa;
- la opinión legal;
- el número de WhatsApp real.

## Equipo

| Persona | Rol | Bio |
|---|---|---|
| **Hans Aneiva** | Producto y contratos | [bio] |
| **Joaquín [apellido]** | Backend y usuarios | [bio] |

## Más detalle

[docs/TECNICO.md](docs/TECNICO.md) tiene cómo funciona paso a paso, la tarifa, qué es real y qué es simulado, las llaves, los hallazgos sobre Trustless Work, la evidencia completa, el mapa del código, el tipo de cambio y la estructura del repo.
