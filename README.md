# Trato

**El contra entrega que funciona con cualquier encomienda.** Trato es un link de pago para ventas por redes en Bolivia:
- el comprador paga con QR;
- la plata queda bloqueada en contratos de Stellar hasta que confirma que recibió;
- si el vendedor no despacha a tiempo, la plata vuelve al comprador sin que nadie tenga que decidirlo.

[![CI](https://github.com/haneiva1/pago-protegido/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/haneiva1/pago-protegido/actions/workflows/ci.yml?query=branch%3Amain)

**[Pruébalo en el navegador](https://app-production-dc7d8d8b.up.railway.app/probar)** · **[Capturas de cada pantalla](app/e2e/capturas/)** · **[Contratos en testnet](#evidencia-on-chain)** · **[Verifícalo en tu máquina](#pruébalo)**

> Trato antes se llamaba Pago Protegido. El repo, los contratos (`pp_guardian`, `pp_arbiter`) y los códigos de pedido `PP-` conservan ese nombre.

## Trato en los cinco criterios

| Criterio | Qué hay | Dónde verlo |
|---|---|---|
| **Problema y usuario** | Bolivia hizo 892 millones de pagos con QR en 2025 (BCB), pero con un desconocido de otra ciudad alguien tiene que confiar primero. En Tarija, 74 de las 91 denuncias por estafa de 2026 empezaron en redes; un falso vendedor de iPhone cobró por adelantado a 6 compradores de 3 departamentos. Y al vendedor tampoco le sirve una captura: ASFI advierte sobre comprobantes falsificados. Usuario inicial: vendedores de celulares y electrónica que envían por encomienda a otra ciudad. Validación: todavía no hay ninguna entrevista registrada. El guion, la nota de consentimiento y la regla de lectura ya están escritos; es la tarea de Joaquín del 23 al 29-nov. Antecedente: en una encuesta propia de feb-2026 a 27 negocios que venden por WhatsApp, hecha para un proyecto anterior y no para Trato, 6 marcaron que les dicen «ya pagué» y les cuesta verificarlo | [docs/PROBLEMA.md](docs/PROBLEMA.md) (24 casos públicos con fuente) · [docs/USUARIOS.md](docs/USUARIOS.md) |
| **Producto funcionando** | Flujo completo en Stellar testnet: link → QR → plata bloqueada → envío con foto → confirmación, liberación por plazo o devolución. 12 de 12 pruebas de punta a punta contra testnet, 6 de ellas con pagos en testnet (plata de prueba), corridas el 20-nov, antes de los PR #12 y #13. En cada cambio la CI corre 47 tests de contratos, 191 del bot y 171 de la app | [`/probar`](https://app-production-dc7d8d8b.up.railway.app/probar) · [capturas](app/e2e/capturas/) · [transacciones](#evidencia-on-chain) · [CI](https://github.com/haneiva1/pago-protegido/actions/workflows/ci.yml?query=branch%3Amain) |
| **Uso de Stellar** | Dos contratos Soroban propios en los roles que mueven la plata del escrow de Trustless Work (single-release v1, commit `f0b706e`, sin modificar). *Fee bump*, Pollar, verificación del WASM antes de firmar y reputación calculada solo con compras verificadas. 47 tests contra el WASM real, incluidas secuencias aleatorias de operaciones; 9 desvíos rechazados en testnet; los hashes de los contratos se reproducen con `contracts/scripts/verify-wasm.sh` | [Evidencia](#evidencia-on-chain) · [docs/SEGURIDAD.md](docs/SEGURIDAD.md) |
| **Plan de 30 días** | Tres entregables que dependen solo del equipo y se verifican desde afuera, con una métrica norte y un punto de decisión en la semana 2 | [Plan](#plan-de-30-días) |
| **Equipo y compromiso** | El avance entre entregas, cambio por cambio y con links: 101 commits desde la entrega 1 (al 21-nov) | [Avance](#avance) · [comparar `v1-19nov` con `main`](https://github.com/haneiva1/pago-protegido/compare/v1-19nov...main) |

## Avance

| Prometido el 19-nov | Estado al 21-nov | Evidencia |
|---|---|---|
| README sin contradicciones | hecho | [PR #1](https://github.com/haneiva1/pago-protegido/pull/1) |
| Plan de 30 días medible, separando lo propio de lo que depende de terceros | hecho | [Plan](#plan-de-30-días) |
| CI pública con los tests de contratos y del bot | en verde, y además corre los de la app | [CI en `main`](https://github.com/haneiva1/pago-protegido/actions/workflows/ci.yml?query=branch%3Amain) · [PR #12](https://github.com/haneiva1/pago-protegido/pull/12) |
| Demo desplegada con el proceso que libera y devuelve los pedidos vencidos | en Railway: [app-production-dc7d8d8b.up.railway.app](https://app-production-dc7d8d8b.up.railway.app) (testnet; [`/probar`](https://app-production-dc7d8d8b.up.railway.app/probar)). Desde el 21-nov la app libera y devuelve los vencidos cada vez que alguien abre un pedido o el panel, o el bot consulta. Falta que el proceso no dependa de visitas: pasa a la semana 1 (E1) | [PR #12](https://github.com/haneiva1/pago-protegido/pull/12) · [deploy/DEPLOY.md](deploy/DEPLOY.md) |
| Prueba del login de Pollar en la demo desplegada | pendiente: depende de la demo pública. El vendedor ya entra con Pollar en local | [captura](app/e2e/capturas/50-pollar-modal-login-3020-celular.png) (anterior al cambio de nombre) |
| Entrevistas con vendedores y compradores | no cumplido: 0 vendedores y 0 compradores registrados al 21-nov; pasa al 23–29 de noviembre | [docs/USUARIOS.md](docs/USUARIOS.md) |
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
| **Además, el 21-nov** | | |
| Plazos y privacidad: envío con un reclamo abierto, liberación por plazo que llega sola, reclamo fuera de plazo rechazado y una vista pública del pedido sin la evidencia | hecho | [PR #12](https://github.com/haneiva1/pago-protegido/pull/12) |
| Evidencia firmada: solo el comprador o el vendedor suben fotos, con la firma de su cuenta | hecho | [PR #13](https://github.com/haneiva1/pago-protegido/pull/13) |

Los PR #3 a #9 aparecen como «cerrados» porque se integraron juntos en el [PR #10](https://github.com/haneiva1/pago-protegido/pull/10), que sí está mergeado: su código está en `main`.

## Pruébalo

**En el navegador (2 minutos):** en [`/probar`](https://app-production-dc7d8d8b.up.railway.app/probar), el vendedor y el comprador aparecen lado a lado. Cada paso muestra su transacción en stellar.expert, incluido un intento de desvío que el contrato rechaza.

La demo corre en Stellar testnet (plata de prueba) con el commit `5400e4c`. Usa un despliegue paralelo de `pp_guardian`, `pp_arbiter` y LABUSD, creado el 21-nov para la demo: no son los contratos de [Evidencia on-chain](#evidencia-on-chain), aunque el código es el mismo. Por eso en la demo `/metricas` y `/transparencia` aparecen sin datos.

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
| Liberación al vencer la revisión: `auto_release` no pide la autorización de nadie y cualquiera puede enviarla | [`4a6feb28…`](https://stellar.expert/explorer/testnet/tx/4a6feb28078c8404d88947730aadea7c32c42d2a400ee1fb21e2cd937633644a) |
| Devolución porque el vendedor no despachó: con el pedido en reclamo, `refund_unshipped` no pide la autorización de nadie. El reclamo lo abre la plataforma o el comprador | reclamo [`2ff2f3b5…`](https://stellar.expert/explorer/testnet/tx/2ff2f3b575b3e3fcd094cd4241676d347bc62c5d542644d863b0ff76124f4a0a) · devolución [`fdff2f9b…`](https://stellar.expert/explorer/testnet/tx/fdff2f9bb7ce10a0cf02f2d2dbbf299c38681bdea4db872bc98caec2713de0ee) |
| El revisor reparte 70/30: solo puede elegir el porcentaje | [`68ba9ed2…`](https://stellar.expert/explorer/testnet/tx/68ba9ed24755a4c401a28bfa122b5a48fee7929a1d9ae9256bb7f4e1b2ff889d) |
| Un tercero intenta cobrar haciéndose pasar por el revisor | rechazado, `Error(Contract, #12)` ([evidencia](contracts/scripts/out/flujo-v2/fallo-d-d7.txt)) |

Una compra completa cuesta ≈0,138 XLM de comisión de red (`contracts/scripts/out/flujo-v2/txlog.tsv`), y la paga la plataforma. Los 9 desvíos y los 6 escenarios están en [docs/TECNICO.md](docs/TECNICO.md#evidencia).

## Seguridad en 5 líneas

1. Los roles que mueven el pago son contratos sin llave privada: nadie puede firmar por ellos.
2. El pago solo puede ir al vendedor o volver al comprador; aparte, la comisión fija del pedido. Ninguna función acepta otra dirección.
3. "Pagar al vendedor" aprueba y libera en la misma transacción. El envío se registra una sola vez y los plazos los firma el comprador.
4. Hay 47 tests contra el WASM real: invariantes, red team y 200 secuencias aleatorias que comprueban que el saldo se conserva, que ningún tercero cobra y que cada compra tiene un solo desenlace. En testnet se rechazaron 9 desvíos sin que el tercero recibiera nada. Los hashes de los contratos desplegados se reproducen desde el código (`verify-wasm.sh`).
5. Atacamos nuestro propio historial de tiendas: con un contrato falso se podían fabricar ventas. Ahora solo cuentan las compras cuyo contrato es el de Trustless Work y donde la plata se movió ([H-9](docs/SEGURIDAD.md)).

**Lo que todavía depende de nosotros, en testnet:**
- El revisor es una sola cuenta y su llave está en el mismo servidor que la de la plataforma. Quien tenga las dos puede abrir un reclamo y repartirlo entre el comprador y el vendedor de ese pedido, nunca hacia un tercero (H-12).
- Un reclamo no tiene desenlace por defecto: si el revisor no decide, la plata queda bloqueada (H-13).
- La cuenta que el comprador crea en su navegador firma la transacción que arma el servidor sin mostrársela (H-11).

Los tres están en [docs/SEGURIDAD.md](docs/SEGURIDAD.md) con su arreglo previsto.

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

### Quién sería el sujeto regulado

Hoy Trato corre en testnet con un activo sin valor: no recibe plata de nadie. Con plata real, nuestra lectura, que no es una opinión legal, es que **Trato mismo quedaría dentro de la regulación, no solo la rampa**: crea el contrato de cada pedido, cobra una comisión y resuelve los reclamos.

- La [Ley 393](https://www.bcb.gob.bo/webdocs/sistema_pagos/2013%20-%20LEY%200393%20-%20Servicios%20Financieros.pdf) (art. 486) prohíbe realizar «masivamente y en forma habitual» actividades propias de las entidades financieras sin autorización de la ASFI.
- Desde 2025 las Empresas de Tecnología Financiera necesitan licencia de la ASFI. Su reglamento incluye «pagos y plataformas de pago» y las soluciones con activos virtuales, y prevé un Entorno Controlado de Pruebas ([resumen de Ferrere](https://ferrere.com/en/news/asfi-aprueba-formalmente-el-reglamento-para-empresas-fintech/)).

Por eso hay dos caminos y ningún atajo: operar dentro de una entidad con licencia, que identifica al cliente, recibe los bolivianos y contrata con él, con Trato como proveedor de tecnología; o pedir la licencia propia y pasar por el entorno de pruebas. **No habrá plata real sin una opinión legal escrita y sin uno de esos dos caminos.** El piloto de 30 días es en testnet. El detalle por actividad está en [docs/TECNICO.md](docs/TECNICO.md#quién-sería-el-sujeto-regulado).

### Cuánto queda por pedido

| Precio | Si paga el comprador (1,5%, tope Bs 50) | Le queda a Trato | Si paga el vendedor (2,3%) | Le queda a Trato |
|---:|---:|---:|---:|---:|
| Bs 1.500 | Bs 22,50 | ≈ Bs 17,9 | Bs 34,50 | Bs 30,00 |
| Bs 3.000 | Bs 45,00 | ≈ Bs 35,9 | Bs 69,00 | Bs 60,00 |
| Bs 7.000 | Bs 50,00 | ≈ Bs 28,9 | Bs 161,00 | Bs 140,00 |

«Le queda a Trato» es la protección menos el 0,3% de Trustless Work ([cómo sale la cuenta](docs/TECNICO.md#cuánto-queda-por-pedido)). La comisión de red, ≈0,138 XLM por compra completa, también la paga Trato.

**Lo que esa cuenta no incluye, porque todavía no lo sabemos:**
- **La conversión entre bolivianos y dólares digitales, ida y vuelta.** No hay tarifas publicadas. El único dato público es el de un banco en 2024: Bs 35 por cada venta y un mínimo de 200 USDT por compra ([PROBLEMA.md](docs/PROBLEMA.md#5-bancos-bolivianos-con-servicios-en-usdt)). Si la absorbe Trato, la tarifa actual aguanta hasta 1,2% del precio en pedidos de hasta Bs 3.333, y solo 0,4% en uno de Bs 7.000. Por encima, cada pedido pierde.
- **El tiempo del revisor** por cada reclamo.
- **Lo que cuesta conseguir a cada vendedor.**

Las tres se miden en el piloto (costo por pedido, tasa de reclamos y minutos por reclamo) y con la cotización de un banco. Mientras no se conozcan, no prometemos un margen.

## Equipo

| Persona | Rol | Bio |
|---|---|---|
| **Hans Aneiva** | Producto y contratos | Escribió los contratos `pp_guardian` y `pp_arbiter`, el bot y la mayor parte de la app: 111 de los 138 commits de `main` al 21-nov |
| **Joaquín** | Backend y usuarios | 25 commits entre el 20 y el 21-nov: plazos, privacidad del pedido, indexador verificado, evidencia firmada y la CI ([PR #12](https://github.com/haneiva1/pago-protegido/pull/12) y [#13](https://github.com/haneiva1/pago-protegido/pull/13)). Lleva las entrevistas, que todavía son 0 |

## Más detalle

[docs/TECNICO.md](docs/TECNICO.md) tiene cómo funciona paso a paso, la tarifa, qué es real y qué es simulado, las llaves, los hallazgos sobre Trustless Work, la evidencia completa, el mapa del código, el tipo de cambio y la estructura del repo.
