# DEPLOYED: Pago Protegido en testnet

**Solo testnet** (`Test SDF Network ; September 2015`, RPC `https://soroban-testnet.stellar.org`). Desplegado el 2026-11-18 con `scripts/deploy-testnet.sh`. Los datos para máquinas están en `deployments/testnet.json` y `deployments/testnet.env`.

## Contratos

| Qué | ID / hash |
|---|---|
| **pp_guardian** | [`CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU`](https://stellar.expert/explorer/testnet/contract/CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU) |
| **pp_arbiter** | [`CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU`](https://stellar.expert/explorer/testnet/contract/CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU) |
| WASM pp_guardian (sha256) | `be5333485993a24b0d1fdde950efb77fd49f5e8bf83b93404a52487f552996bf` |
| WASM pp_arbiter (sha256) | `76bd9817b13b5fec1b25a2b3969a7ab6c0eb03744b1f0043e835a975d32a047f` |
| WASM escrow Trustless Work (ya estaba subido; commit f0b706e) | `1b367bc8476cf80b89f6396e2aa07b602b78361dd829b5ce9b64ada365196660` |
| SAC LABUSD (7 decimales) | [`CC65P6TQQ646YDXVS3PM6YVZASXW6WM5B67YKI46JH4EG65LJPOGBD4S`](https://stellar.expert/explorer/testnet/contract/CC65P6TQQ646YDXVS3PM6YVZASXW6WM5B67YKI46JH4EG65LJPOGBD4S) |

Los hashes de los WASM coinciden con un `stellar contract build` del código commiteado en esta rama.

## Configuración on-chain

| Parámetro | Valor |
|---|---|
| admin de pp_guardian y de pp_arbiter (identidad `arbitro`) | `GBCSZ6TJSQD5FCOPGDQGTGWLLICPKE3DTHRMRVLYSDA4RQDOQMAUDRJT` |
| `tw_fee` (identidad `twfee`, recibe el 0,3% de TW) | `GCK2H2G65HK3AJTFLFAAM4HD42EHAGRLIEYZ47UBJRJECNRDVZR6BYPX` |
| `platform` de cada escrow (identidad `plataforma`, 2%) | `GDDJTZ7LNW33A46DYIYWQY5YDBZPPHLIAQHOAHTIM5ZIQALDVVTCPKDZ` |
| ventana del guardián | min **60 s**, max **2 592 000 s** (30 días) |
| `pp_guardian.config().arbiter` | `CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU` (fijado con `set_arbiter`, una sola vez) |
| `pp_arbiter.config().guardian` | `CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU` |

## Transacciones del despliegue

| Paso | Qué | Tx | s | Fee (stroops) |
|---|---|---|---:|---:|
| D1 | upload WASM pp_guardian | [`d47d8e2c…`](https://stellar.expert/explorer/testnet/tx/d47d8e2c11093402bc8545f8f39868dfe8b0109bcb617083c29d15c1414a42c0) | 8.91 | 10319350 |
| D2 | upload WASM pp_arbiter | [`d9d701e3…`](https://stellar.expert/explorer/testnet/tx/d9d701e33df9389df7de53e9870d85ae6a6b74c0b3ea41c0b33139f64d41341a) | 8.17 | 8784583 |
| D3 | deploy pp_guardian (admin=arbitro, tw_fee=twfee, 60 s..30 d) | [`d57cd28b…`](https://stellar.expert/explorer/testnet/tx/d57cd28b0a006460a015b47dbfc211b2cfe4c73d9b613e7eafc5030bb92ed8d4) | 8.39 | 33920002 |
| D4 | deploy pp_arbiter (admin=arbitro, guardian, tw_fee=twfee) | [`8fea8d38…`](https://stellar.expert/explorer/testnet/tx/8fea8d38989db8d006cf19044abf185a7ebd687b4eeb599b385e971ffd55ccd8) | 5.43 | 28907675 |
| D5 | pp_guardian.set_arbiter(pp_arbiter) firmado por arbitro | [`f7be608d…`](https://stellar.expert/explorer/testnet/tx/f7be608db6319aa9454fb15c67ee260871f481d25ac69d8fa885e36effa6cd5a) | 8.59 | 35843 |

## Comisiones reales (LABUSD, compra de 150)

Todos los montos salen de los saldos on-chain leídos antes y después de cada escenario, en unidades base exactas. Plataforma 2% y Trustless Work 0,3%. TW descuenta las comisiones del reparto también en una disputa.

| Escenario | Comprador (neto) | Vendedor | Plataforma | Trustless Work | Suma |
|---|---:|---:|---:|---:|---:|
| (a) caso feliz, `confirm` | −150,000 | **+146,550** | +3,000 | +0,450 | 0 |
| (b) disputa 70/30, `resolve(7000)` | −150 + **102,585** = −47,415 | **+43,965** | +3,000 | +0,450 | 0 |
| (c) `auto_release` a los 60 s | −150,000 | **+146,550** | +3,000 | +0,450 | 0 |
| (d) disputa 50/50, `resolve(5000)` | −150 + **73,275** = −76,725 | **+73,275** | +3,000\* | +0,450\* | 0 |

- **(b) en detalle:**
  - el comprador recibe 105 − 0,315 (TW) − 2,10 (plataforma) = 102,585;
  - el vendedor recibe 45 − 0,135 − 0,90 = 43,965;
  - es igual a lo que predice el test `resolve_70_30_montos_exactos`.
- **\* Fondos ajenos al escrow en (d).** Mientras corría (d), las cuentas `plataforma` y `twfee` recibieron además +1,2820511 y +0,1923075 LABUSD. Son exactamente el 2% y el 0,3% de 64,1025641 LABUSD (Bs 750 a 11,70), es decir, otra liberación que ocurrió al mismo tiempo con las mismas cuentas, probablemente la app en paralelo. No viene de este escrow: el escrow de (d) bajó de 150 a 0, y comprador + vendedor recibieron 146,55, lo que deja 3,45 para las comisiones. La tabla de saldos de más abajo muestra los Δ crudos.
- **`tercero` y `arbitro` no recibieron nada en ningún escenario.**

## Costo de red (XLM, fee cobrado)

| Operación | Stroops | XLM |
|---|---:|---:|
| deploy de una instancia del escrow | ~16 250 | 0,0016 |
| `initialize_escrow` | ~137 000 | 0,0137 |
| `pp_guardian.fund` (incluye la renta del `Purchase`, TTL 120 días) | ~725 600 | 0,0726 |
| `change_milestone_status` | ~10 190 | 0,0010 |
| `pp_guardian.confirm` (aprobar + liberar) | 19 210 | 0,0019 |
| `pp_guardian.auto_release` | 18 663 | 0,0019 |
| `pp_guardian.dispute` | ~8 100 | 0,0008 |
| `pp_arbiter.resolve` (2 destinatarios) | ~22 600 | 0,0023 |

Una compra completa por el caso feliz (deploy + init + fund + enviado + confirm) cuesta unas 0,091 XLM.

## Flujo real: `scripts/flujo-testnet.sh` (terminó con código 0)

Evidencia cruda en `scripts/out/flujo/` (`txlog.tsv`, `fallos.tsv`, `saldos.tsv`, `escrow-*.json`, `purchase-*.json`, `quote-b.json`, `arbiter-funciones.json`, `fallo-*.txt`). Log completo en `scripts/out/flujo-run.log`.

### Escrows (una instancia por escenario)

| Escenario | Escrow |
|---|---|
| a | [`CCTSP4FWPIO67JKIFL6F7BGO7QM4FDP2IGLQXKC4YDTL2M3BZAQUQIGA`](https://stellar.expert/explorer/testnet/contract/CCTSP4FWPIO67JKIFL6F7BGO7QM4FDP2IGLQXKC4YDTL2M3BZAQUQIGA) |
| b | [`CDQQLWDFB32BAIMG5OTMT2COQENO5SE5WVDPCS2UHW3MU2O7GXBWW6RR`](https://stellar.expert/explorer/testnet/contract/CDQQLWDFB32BAIMG5OTMT2COQENO5SE5WVDPCS2UHW3MU2O7GXBWW6RR) |
| c | [`CDTKBAXCHMAIIG5JRGARXY62MPQBOMF5GKHIBKTAVZQ5XZ5XTLLR3L4P`](https://stellar.expert/explorer/testnet/contract/CDTKBAXCHMAIIG5JRGARXY62MPQBOMF5GKHIBKTAVZQ5XZ5XTLLR3L4P) |
| d | [`CDYMQQKLWS6J3LS3RV2Y2H2UEIKGZ4Q5CPB3LQAS5DUWO54N5IODWQMP`](https://stellar.expert/explorer/testnet/contract/CDYMQQKLWS6J3LS3RV2Y2H2UEIKGZ4Q5CPB3LQAS5DUWO54N5IODWQMP) |

### Transacciones

| Esc. | Paso | Qué | Tx | s | Fee (stroops) |
|---|---|---|---|---:|---:|
| a | a1 | deploy instancia del escrow de TW (wasm 1b367bc8…) | [`1a5c22ff…`](https://stellar.expert/explorer/testnet/tx/1a5c22ff549b2e42cdd88a4effd759d8bce6e9f62aa78a390caf386d3c31ea8f) | 5.62 | 16241 |
| a | a2 | initialize_escrow con roles del modo guardián (plataforma) | [`ce1141a4…`](https://stellar.expert/explorer/testnet/tx/ce1141a4d04f8136d727f823437518ba9f91500b08d98460da2707af6f5ec78a) | 8.50 | 136807 |
| a | a3 | pp_guardian.fund: comprador deposita 150 LABUSD (ventana 259200 s) | [`cdf1ae81…`](https://stellar.expert/explorer/testnet/tx/cdf1ae816d4fc39684851505142b4dfca816a37232f4938185d1207bebe7564a) | 5.92 | 725565 |
| a | a4 | change_milestone_status: vendedor marca "enviado" + guía | [`993259ad…`](https://stellar.expert/explorer/testnet/tx/993259adb3525c73bf511533d12a88e708158ad388dfc4afa9b1bd0be5f66740) | 8.95 | 10193 |
| a | a5 | pp_guardian.confirm: comprador aprueba y libera en la misma invocación | [`9648085a…`](https://stellar.expert/explorer/testnet/tx/9648085a1c0af9fc56269491908e4569eed03da4eb5631a5a33608ca74da541e) | 8.77 | 19210 |
| b | b1 | deploy instancia del escrow de TW (wasm 1b367bc8…) | [`a9066630…`](https://stellar.expert/explorer/testnet/tx/a9066630ece1b8557f6cca3b5f6a5feb1e0ddbb9df6d5f090e642a8695151667) | 5.76 | 16252 |
| b | b2 | initialize_escrow con roles del modo guardián (plataforma) | [`f8804a72…`](https://stellar.expert/explorer/testnet/tx/f8804a7299309b97cadcf4154bb4a44cee3704a5c4bb652529d6c69aeb6b4fbd) | 13.11 | 136917 |
| b | b3 | pp_guardian.fund: comprador deposita 150 LABUSD (ventana 259200 s) | [`68390f66…`](https://stellar.expert/explorer/testnet/tx/68390f66092b1eecde59df3f82daf563632a70d00beed60944256990c89b624e) | 6.33 | 725565 |
| b | b4 | change_milestone_status: vendedor marca "enviado" + guía | [`f6c7e8cd…`](https://stellar.expert/explorer/testnet/tx/f6c7e8cd8a29b6c677eca989f3818766c398df7a17b8954c4ef17e85d5ff1d51) | 8.41 | 10193 |
| b | b5 | pp_guardian.dispute: comprador abre reclamo | [`48c02510…`](https://stellar.expert/explorer/testnet/tx/48c025109d662cef536317026bd887084e186b1ea72b0649d19df06f5090da87) | 5.59 | 8133 |
| b | b6 | pp_arbiter.resolve(buyer_bps=7000) firmado por arbitro | [`f06fdee6…`](https://stellar.expert/explorer/testnet/tx/f06fdee67f31e8eb4915e8b57d503f35b19afdd303ba4e145ea262f87b65f293) | 8.82 | 22650 |
| c | c1 | deploy instancia del escrow de TW (wasm 1b367bc8…) | [`4666137a…`](https://stellar.expert/explorer/testnet/tx/4666137a5f9ec3deab1cb20cb91e919d730b88f03c0fe53ff5647e72c3222ef1) | 5.62 | 16252 |
| c | c2 | initialize_escrow con roles del modo guardián (plataforma) | [`634924b1…`](https://stellar.expert/explorer/testnet/tx/634924b14478a2a1b28092440e5f975c1e31d8e1930527e0244a0dfb7bdd7a11) | 9.97 | 136917 |
| c | c3 | pp_guardian.fund: comprador deposita 150 LABUSD (ventana 60 s) | [`0933303d…`](https://stellar.expert/explorer/testnet/tx/0933303dd6751b6e868ca32dd75956a228988029b747379348cfad607332948a) | 9.39 | 725565 |
| c | c4 | change_milestone_status: vendedor marca "enviado" + guía | [`f52e403d…`](https://stellar.expert/explorer/testnet/tx/f52e403d927111feb0597debf53d27a829728a528b96cffc3779375831e2cf61) | 39.78 | 10195 |
| c | c6 | pp_guardian.auto_release: lo dispara tercero (sin rol, sin auth de nadie) | [`47912506…`](https://stellar.expert/explorer/testnet/tx/479125061f098ca7ec22d070804c089f4a69696e1d58ecaf6731806e03e98f1f) | 5.62 | 18663 |
| d | d1 | deploy instancia del escrow de TW (wasm 1b367bc8…) | [`ea1b85f8…`](https://stellar.expert/explorer/testnet/tx/ea1b85f8ce962d0ce95784f97fba21f19784973d247b74ed3b3148779c69f693) | 11.73 | 16262 |
| d | d2 | initialize_escrow con roles del modo guardián (plataforma) | [`e711de8f…`](https://stellar.expert/explorer/testnet/tx/e711de8f8636026ff2708ae2ca02cf3b9affedddfa4fec566aa3aefc725fc37b) | 8.67 | 137027 |
| d | d3 | pp_guardian.fund: comprador deposita 150 LABUSD (ventana 259200 s) | [`62c85bbb…`](https://stellar.expert/explorer/testnet/tx/62c85bbb11d28217ca2355653e23b5f4ded62af046583a06ccb26b89f38a2408) | 23.57 | 726185 |
| d | d4 | pp_guardian.dispute: el vendedor abre la disputa | [`e41bbbbd…`](https://stellar.expert/explorer/testnet/tx/e41bbbbd513ef22e35207d89210d466fb31056791bf0ae8faebd560e585685b4) | 8.79 | 8052 |
| d | d10 | cierre legítimo: pp_arbiter.resolve(buyer_bps=5000) firmado por arbitro | [`a630b7ff…`](https://stellar.expert/explorer/testnet/tx/a630b7ffa31ede4d95664fe43e8e42ed196791e647e37f69ce0d5ae4a982b648) | 4.11 | 22569 |

### Intentos rechazados (simulación, no llegan a la red)

| Esc. | Paso | Intento | Error |
|---|---|---|---|
| a | a6 | comprador intenta disputar después de confirm | `Error(Contract, #21)` |
| c | c5 | tercero llama auto_release antes del plazo | `Error(Contract, #19)` |
| d | d0 | interfaz de pp_arbiter: ninguna función acepta destino ni distribuciones | `quote(escrow: address, buyer_bps: u32); config(); resolve(escrow: address, buyer_bps: u32); set_admin(new_admin: address); __constructor(admin: address, guardian: address, tw_fee: address); refund_unshipped(escrow: address)` |
| d | d5 | tercero llama pp_arbiter.resolve (falta la firma del admin) | `error: Missing signing key for account GBCSZ6TJSQD5FCOPGDQGTGWLLICPKE3DTHRMRVLYSDA4RQDOQMAUDRJT` |
| d | d6 | tercero llama escrow.resolve_dispute como dispute_resolver, todo para él | `Error(Contract, #12)` |
| d | d7 | tercero llama escrow.resolve_dispute en nombre de pp_arbiter | `error: Contract addresses are not supported to sign auth entries CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU` |
| d | d8 | el admin (arbitro) llama escrow.resolve_dispute en nombre de pp_arbiter hacia tercero | `error: Contract addresses are not supported to sign auth entries CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU` |
| d | d9 | la plataforma intenta cambiar el receiver a tercero | `Error(Contract, #16)` |

### Saldos LABUSD (antes → después, en LABUSD)

| Esc. | Cuenta | Antes | Después | Δ |
|---|---|---:|---:|---:|
| a | comprador | 722.0750000 | 572.0750000 | -150.0000000 |
| a | vendedor | 368.6250000 | 515.1750000 | +146.5500000 |
| a | plataforma | 8.7820511 | 11.7820511 | +3.0000000 |
| a | twfee | 1.9923075 | 2.4423075 | +0.4500000 |
| a | arbitro | 0.0000000 | 0.0000000 | +0.0000000 |
| a | tercero | 0.0000000 | 0.0000000 | +0.0000000 |
| a | escrow | 0.0000000 | 0.0000000 | +0.0000000 |
| b | comprador | 572.0750000 | 524.6600000 | -47.4150000 |
| b | vendedor | 515.1750000 | 559.1400000 | +43.9650000 |
| b | plataforma | 11.7820511 | 14.7820511 | +3.0000000 |
| b | twfee | 2.4423075 | 2.8923075 | +0.4500000 |
| b | arbitro | 0.0000000 | 0.0000000 | +0.0000000 |
| b | tercero | 0.0000000 | 0.0000000 | +0.0000000 |
| b | escrow | 0.0000000 | 0.0000000 | +0.0000000 |
| c | comprador | 524.6600000 | 374.6600000 | -150.0000000 |
| c | vendedor | 559.1400000 | 705.6900000 | +146.5500000 |
| c | plataforma | 14.7820511 | 17.7820511 | +3.0000000 |
| c | twfee | 2.8923075 | 3.3423075 | +0.4500000 |
| c | arbitro | 0.0000000 | 0.0000000 | +0.0000000 |
| c | tercero | 0.0000000 | 0.0000000 | +0.0000000 |
| c | escrow | 0.0000000 | 0.0000000 | +0.0000000 |
| d | comprador | 374.6600000 | 297.9350000 | -76.7250000 |
| d | vendedor | 705.6900000 | 778.9650000 | +73.2750000 |
| d | plataforma | 17.7820511 | 22.0641022 | +4.2820511 |
| d | twfee | 3.3423075 | 3.9846150 | +0.6423075 |
| d | arbitro | 0.0000000 | 0.0000000 | +0.0000000 |
| d | tercero | 0.0000000 | 0.0000000 | +0.0000000 |
| d | escrow | 0.0000000 | 0.0000000 | +0.0000000 |

### Por qué (d) demuestra que no existe la vía

- **Interfaz (d0):** las funciones públicas de pp_arbiter son `resolve(escrow, buyer_bps)`, `quote(escrow, buyer_bps)`, `refund_unshipped(escrow)`, `set_admin(new_admin)`, `config()` y `__constructor(admin, guardian, tw_fee)`. Ninguna recibe un destino ni un mapa de distribuciones. El script lo verifica con `jq` sobre la interfaz on-chain.
- **El escrow solo obedece a su `dispute_resolver`** (d6, `#12`), y ese rol es el contrato pp_arbiter. Un contrato no tiene llave, así que nadie puede firmar en su nombre: ni un tercero (d7) ni el propio admin del árbitro (d8). Solo vale la auth del árbitro cuando es él quien hace la llamada.
- **Por el árbitro hace falta la firma del admin** (d5). Aun con esa firma, el destino sale del `Purchase` registrado y de `roles.receiver`.
- **La plataforma no puede cambiar el receiver** durante la disputa (d9, `#16`) ni con fondos adentro (test `no_existe_via_directa_al_escrow`, `#33`).
- **Cierre legítimo (d10):** 50/50, que solo mueve fondos al comprador y al vendedor (más las comisiones fijas). El saldo de `tercero` quedó igual.
