# DEPLOYED: Pago Protegido v2 en testnet

**Solo testnet** (`Test SDF Network ; September 2015`). v2 incorpora los hallazgos del red team sobre Trustless Work (TW-1, TW-2, TW-3 y TW-5): ver [DECISIONES.md](DECISIONES.md) §v2 y [docs/SEGURIDAD.md](../docs/SEGURIDAD.md) §4b.

- **Despliegue:** se hizo con `scripts/deploy-testnet.sh`. El deployer fue `ppdemo`, y el admin es `arbitro`.
- **Datos para máquinas:** `deployments/testnet.json` y `deployments/testnet.env`.
- **v1:** está retirado para compras nuevas. Sus IDs, transacciones y comisiones siguen en [DEPLOYED-v1.md](DEPLOYED-v1.md).

## Contratos v2

| Qué | ID / hash |
|---|---|
| **pp_guardian v2** | [`CDKYF7OAJTACP4JNJSGGXDRA3DHE442R26CT5ZE5DJHNSHH7XJUOATOT`](https://stellar.expert/explorer/testnet/contract/CDKYF7OAJTACP4JNJSGGXDRA3DHE442R26CT5ZE5DJHNSHH7XJUOATOT) |
| **pp_arbiter v2** | [`CDTEA424AWSIIHEQ4FIQHFQOTWS3XAVLQHX7FI3MU6JZP4OPMTEVU5UA`](https://stellar.expert/explorer/testnet/contract/CDTEA424AWSIIHEQ4FIQHFQOTWS3XAVLQHX7FI3MU6JZP4OPMTEVU5UA) |
| WASM pp_guardian v2 (sha256) | `1a3a475bab2b5c5caabc08f07c03855ade94644db2b59c593a9867071842f887` |
| WASM pp_arbiter v2 (sha256) | `194fe3615f6e31621daa3ff73162e0f7d2c16c35a04e13345315bd0e5063a6c7` |
| WASM escrow Trustless Work (sin cambios, commit f0b706e) | `1b367bc8476cf80b89f6396e2aa07b602b78361dd829b5ce9b64ada365196660` |
| SAC LABUSD (7 decimales) | [`CC65P6TQQ646YDXVS3PM6YVZASXW6WM5B67YKI46JH4EG65LJPOGBD4S`](https://stellar.expert/explorer/testnet/contract/CC65P6TQQ646YDXVS3PM6YVZASXW6WM5B67YKI46JH4EG65LJPOGBD4S) |
| Ledger del despliegue | 5793072 |
| v1 (retirado) | pp_guardian [`CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU`](https://stellar.expert/explorer/testnet/contract/CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU) · pp_arbiter [`CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU`](https://stellar.expert/explorer/testnet/contract/CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU) |

Los hashes coinciden con un `stellar contract build` del código commiteado. **Ninguno de los dos contratos es actualizable**: un cambio de lógica implica IDs nuevos, como de v1 a v2.

## Configuración on-chain

| Parámetro | Valor |
|---|---|
| admin de pp_guardian y de pp_arbiter (`arbitro`) | `GBCSZ6TJSQD5FCOPGDQGTGWLLICPKE3DTHRMRVLYSDA4RQDOQMAUDRJT` |
| `tw_fee` (`twfee`, 0,3% de TW) | `GCK2H2G65HK3AJTFLFAAM4HD42EHAGRLIEYZ47UBJRJECNRDVZR6BYPX` |
| `platform` de cada escrow (`plataforma`, 2%) | `GDDJTZ7LNW33A46DYIYWQY5YDBZPPHLIAQHOAHTIM5ZIQALDVVTCPKDZ` |
| plazo de despacho (`ship_secs`) | min **60 s**, max **2592000 s** (30 días) |
| ventana de revisión (`inspect_secs`) | min **60 s**, max **2592000 s** (30 días) |
| `pp_guardian.config().arbiter` | `CDTEA424AWSIIHEQ4FIQHFQOTWS3XAVLQHX7FI3MU6JZP4OPMTEVU5UA` (fijado con `set_arbiter`, una sola vez) |

## Transacciones del despliegue v2

| Paso | Qué | Tx | s | Fee (stroops) |
|---|---|---|---:|---:|
| D1 | upload WASM pp_guardian v2 | [`55f62c8b…`](https://stellar.expert/explorer/testnet/tx/55f62c8b724dddfd071c9e5fac7931d4c7be6b9bdae82f06583ebd251e62f18b) | 8.87 | 13157956 |
| D2 | upload WASM pp_arbiter v2 | [`7315e802…`](https://stellar.expert/explorer/testnet/tx/7315e8025e06ef78680d5bb517d67512c2740767dbdecbc65041cef77decd2a6) | 3.69 | 8599633 |
| D3 | deploy pp_guardian v2 (admin=arbitro, tw_fee=twfee, despacho y revisión 60 s..30 d) | [`3248bb6a…`](https://stellar.expert/explorer/testnet/tx/3248bb6a40cf0c103a2670b4533b04725fad4d345e0f962d0f7d96065bbd8fde) | 5.25 | 43228752 |
| D4 | deploy pp_arbiter v2 (admin=arbitro, guardian v2, tw_fee=twfee) | [`cc87089b…`](https://stellar.expert/explorer/testnet/tx/cc87089b3725821fd57f32e1d223e6c9966b672360efed1449eaa4a395923cda) | 3.51 | 28297673 |
| D5 | pp_guardian.set_arbiter(pp_arbiter v2) firmado por arbitro | [`a6d15834…`](https://stellar.expert/explorer/testnet/tx/a6d158342c4ec1e7a7c9f489046421c69a0a4bcc18779e8fd0bcafc42d156649) | 5.69 | 35512 |

## Comisiones reales en v2 (compra de 50 LABUSD)

Los Δ salen de los saldos on-chain leídos **justo antes y después de la transacción final** de cada escenario.

| Escenario | Transacción final | Comprador | Vendedor | Plataforma (2%) | Trustless Work (0,3%) |
|---|---|---:|---:|---:|---:|
| (a) feliz | `confirm` | +0.0000000 | +48.8500000 | +1.0000000 | +0.1500000 |
| (b) disputa 70/30 | `resolve(7000)` | +34.1950000 | +14.6550000 | +1.0000000 | +0.1500000 |
| (c) automática a los 60 s del envío | `auto_release` | +0.0000000 | +48.8500000 | +1.0000000 | +0.1500000 |
| (e) automática tras `extend` | `auto_release` | +0.0000000 | +48.8500000 | +1.0000000 | +0.1500000 |
| (f) sin envío | `refund_unshipped` | +48.8500000 | +0.0000000 | +1.0000000 | +0.1500000 |
| (d) cierre 50/50 tras los desvíos | `resolve(5000)` | +24.4250000 | +24.4250000 | +1.4567500 | +0.2671153 |

Valores esperados para 50 LABUSD:

| Desenlace | Comprador | Vendedor | Plataforma | TW |
|---|---:|---:|---:|---:|
| Liberación (a, c, e) | — | 48,85 | 1,00 | 0,15 |
| 70/30 (b) | 34,195 | 14,655 | 1,00 | 0,15 |
| Reembolso (f) | 48,85 | — | 1,00 | 0,15 |
| 50/50 (d) | 24,425 | 24,425 | 1,00 | 0,15 |

Si una fila de `plataforma` o `twfee` no coincide con esto, es porque **la app hizo otra operación en el mismo ledger** con esas cuentas compartidas. El escrow de cada escenario siempre termina en 0 y `tercero` nunca recibe nada (ver la tabla cruda más abajo).

## Flujo real v2: `scripts/flujo-v2-testnet.sh` (terminó con código 0)

Evidencia cruda en `scripts/out/flujo-v2/`: `txlog.tsv`, `fallos.tsv`, `saldos.tsv`, `tiempos.tsv`, `interfaces.txt`, `escrow-*.json`, `purchase-*.json` y `fallo-*.txt`. Log completo en `scripts/out/flujo-v2-run.log`.

### Escrows

| Esc. | Escrow |
|---|---|
| f | [`CAD5VSBQ4HCB7W5CNXA2OEIGFR6M5KBD23K3DBVSQCHU4M5AZCNT24JD`](https://stellar.expert/explorer/testnet/contract/CAD5VSBQ4HCB7W5CNXA2OEIGFR6M5KBD23K3DBVSQCHU4M5AZCNT24JD) |
| c | [`CDDGS3I25VKQEMWORGAWRBONC5EJXISR5GX4Z5G252SERBMMY45PEVVT`](https://stellar.expert/explorer/testnet/contract/CDDGS3I25VKQEMWORGAWRBONC5EJXISR5GX4Z5G252SERBMMY45PEVVT) |
| e | [`CCWA6PU5ZN6XIHW5UHIZYKKGOYYQH3EYN752I32NHKNXQZ7HLNALWEVQ`](https://stellar.expert/explorer/testnet/contract/CCWA6PU5ZN6XIHW5UHIZYKKGOYYQH3EYN752I32NHKNXQZ7HLNALWEVQ) |
| a | [`CCS74JS3QVAXAI2GCTOP5BEUP47FSB36HOYURDCRR2A5PK7B5YVA6U6E`](https://stellar.expert/explorer/testnet/contract/CCS74JS3QVAXAI2GCTOP5BEUP47FSB36HOYURDCRR2A5PK7B5YVA6U6E) |
| b | [`CDI4GMT5NBN2DSY5SPHU3HZE56H3UGDEOL3WGSZKNFNMCB7OAWWOTTIJ`](https://stellar.expert/explorer/testnet/contract/CDI4GMT5NBN2DSY5SPHU3HZE56H3UGDEOL3WGSZKNFNMCB7OAWWOTTIJ) |
| d | [`CD6W43MIXEO452LDCWH7SZUOIVVJM5ZGAUIMUR7WYD3ZJPLFSIBMIZFK`](https://stellar.expert/explorer/testnet/contract/CD6W43MIXEO452LDCWH7SZUOIVVJM5ZGAUIMUR7WYD3ZJPLFSIBMIZFK) |

### Transacciones

| Esc. | Paso | Qué | Tx | s | Fee (stroops) |
|---|---|---|---|---:|---:|
| prep | P1 | lab (emisor) envía 400 LABUSD al comprador | [`371e706d…`](https://stellar.expert/explorer/testnet/tx/371e706dfafe8724734474319ddf11712016af250cd65fbf970f984db18fe7e7) | 6.82 | 100 |
| f | f1 | deploy instancia del escrow (ppdemo) | [`26b48462…`](https://stellar.expert/explorer/testnet/tx/26b48462fb66a282464d8d8295febe9bfb6e04fb163b0de06cbe955ec093fbf7) | 8.06 | 16100 |
| f | f2 | initialize_escrow (ppdemo), roles modo guardián v2 | [`dd5a2041…`](https://stellar.expert/explorer/testnet/tx/dd5a2041caaa99a533dbdb891eb65bf7e607e03119cce20b3372dfe7a877ba00) | 8.54 | 136204 |
| f | f3 | pp_guardian.fund 50 LABUSD (despacho 60 s, revisión 3600 s) | [`b86fd9ab…`](https://stellar.expert/explorer/testnet/tx/b86fd9abda26ccc33f3e7ab3eb99eea904a4b076005c2806c6967f1cf9db6360) | 79.87 | 1090395 |
| f | f4 | comprador abre disputa (no llega el envío) | [`2ff2f3b5…`](https://stellar.expert/explorer/testnet/tx/2ff2f3b575b3e3fcd094cd4241676d347bc62c5d542644d863b0ff76124f4a0a) | 3.75 | 8087 |
| c | c1 | deploy instancia del escrow (ppdemo) | [`5409e933…`](https://stellar.expert/explorer/testnet/tx/5409e9333c3a962fcb194e1ccc3bbdd207e9707193c195e46121f74bd936f558) | 8.31 | 16100 |
| c | c2 | initialize_escrow (ppdemo), roles modo guardián v2 | [`a548bfc4…`](https://stellar.expert/explorer/testnet/tx/a548bfc4f903d90c868d6a50028c60a1768fde9ecc6f38570f35fda3fd9c699b) | 81.55 | 135272 |
| c | c3 | pp_guardian.fund 50 LABUSD (despacho 3600 s, revisión 60 s) | [`0a59edf7…`](https://stellar.expert/explorer/testnet/tx/0a59edf7aecb505384aecc548aa4bfafdfa3b36bbcca2a08190ac88e45fb4a82) | 5.91 | 1090341 |
| c | c4 | pp_guardian.mark_shipped (vendedor, evidencia) | [`44e7ef2f…`](https://stellar.expert/explorer/testnet/tx/44e7ef2fbbe1015df195384b85ff1aea0d0c34f26cb5d56c95543526648b1a5e) | 8.84 | 119505 |
| e | e1 | deploy instancia del escrow (ppdemo) | [`d3a3a2b7…`](https://stellar.expert/explorer/testnet/tx/d3a3a2b7a385204bcb102bc998d8e4a0e6321a08c24361af9f81460ebb7b25bc) | 8.36 | 16100 |
| e | e2 | initialize_escrow (ppdemo), roles modo guardián v2 | [`0acacc43…`](https://stellar.expert/explorer/testnet/tx/0acacc43dcf59858beb9d8e8f9ca00c79d98d5ee41305afb29fb46e4e2782c7f) | 5.53 | 136204 |
| e | e3 | pp_guardian.fund 50 LABUSD (despacho 3600 s, revisión 60 s) | [`5a5fb3e1…`](https://stellar.expert/explorer/testnet/tx/5a5fb3e11872e1710027288c70c5e1eb0ea75091e5a5c51daf5ddc4a8587101f) | 13.34 | 1090395 |
| e | e4 | pp_guardian.mark_shipped (vendedor, evidencia) | [`d18b7422…`](https://stellar.expert/explorer/testnet/tx/d18b74220739175a78ce955def11c45d3d507e5563c492e6e2e98cd076e05d80) | 8.56 | 119527 |
| e | e5 | pp_guardian.extend (comprador): release_at + 60 s | [`ace187c5…`](https://stellar.expert/explorer/testnet/tx/ace187c507ce2d6ccb0c0014a970b07818b108e60bb692fa10356292bd79d963) | 9.10 | 5902 |
| e | e8 | pp_guardian.auto_release tras el plazo extendido (tercero) | [`73348764…`](https://stellar.expert/explorer/testnet/tx/73348764f4638bb293115dc6c2b2392707b1f632ed7fbc33012156bb17558855) | 5.53 | 18715 |
| c | c6 | pp_guardian.auto_release (tercero, sin firmas) | [`4a6feb28…`](https://stellar.expert/explorer/testnet/tx/4a6feb28078c8404d88947730aadea7c32c42d2a400ee1fb21e2cd937633644a) | 8.37 | 18694 |
| f | f7 | pp_arbiter.refund_unshipped (tercero, sin firmas): 100% al comprador | [`fdff2f9b…`](https://stellar.expert/explorer/testnet/tx/fdff2f9bb7ce10a0cf02f2d2dbbf299c38681bdea4db872bc98caec2713de0ee) | 8.80 | 19237 |
| a | a1 | deploy instancia del escrow (ppdemo) | [`362fb8ae…`](https://stellar.expert/explorer/testnet/tx/362fb8aec532af41e6fc6ddf4b6c56c7455cd2ea024a6f045626920afe6866a4) | 8.16 | 16090 |
| a | a2 | initialize_escrow (ppdemo), roles modo guardián v2 | [`a8077602…`](https://stellar.expert/explorer/testnet/tx/a80776022d159a882a132da12f5f2c2e5a3667f5032e6fc67dc03583351f093a) | 8.66 | 133768 |
| a | a3 | pp_guardian.fund 50 LABUSD (despacho 3600 s, revisión 3600 s) | [`5143ee1b…`](https://stellar.expert/explorer/testnet/tx/5143ee1b7b4c076782172248a5e2e52740fcaf5fa633347207f8b38ffe68fd57) | 8.56 | 1089310 |
| a | a5 | pp_guardian.mark_shipped (vendedor, evidencia) | [`00082803…`](https://stellar.expert/explorer/testnet/tx/00082803f6f9521016c7f12496c8276e2ac509b5c7f765e5c9cdc87416d9f0c3) | 8.64 | 119373 |
| a | a6 | pp_guardian.confirm: aprueba todos los hitos y libera | [`0d3cb6aa…`](https://stellar.expert/explorer/testnet/tx/0d3cb6aa042da56b562c3490f5c45311b08af66d4fcf2eb80e742026aeefaba9) | 8.59 | 19209 |
| b | b1 | deploy instancia del escrow (ppdemo) | [`1c59c38d…`](https://stellar.expert/explorer/testnet/tx/1c59c38de54a26fed8ce3c9790b76d6c1ae8af610033e305c5babee3b89b853d) | 5.29 | 16090 |
| b | b2 | initialize_escrow (ppdemo), roles modo guardián v2 | [`f506777d…`](https://stellar.expert/explorer/testnet/tx/f506777d858adc8f904b86741ab833b8582e3e04b6143bd40611f86342fe30ba) | 5.96 | 133768 |
| b | b3 | pp_guardian.fund 50 LABUSD (despacho 3600 s, revisión 3600 s) | [`ca01c07e…`](https://stellar.expert/explorer/testnet/tx/ca01c07e2d67537f1eb4cf32eff13d96d0e90953cdae852ce949e484e2447500) | 33.22 | 1089310 |
| b | b4 | pp_guardian.mark_shipped (vendedor, evidencia) | [`5dc57d0b…`](https://stellar.expert/explorer/testnet/tx/5dc57d0b5103131aec922dc5939f6aabf260628133cb15fe7b23c6d1ff29d3e9) | 3.96 | 119373 |
| b | b5 | pp_guardian.dispute (comprador) | [`6066d76e…`](https://stellar.expert/explorer/testnet/tx/6066d76eb51478558eae7f8d1bdd3be7aa042061ebaaf3d58dfa138e2de732b9) | 5.58 | 8123 |
| b | b6 | pp_arbiter.resolve(7000) firmado por arbitro | [`68ba9ed2…`](https://stellar.expert/explorer/testnet/tx/68ba9ed24755a4c401a28bfa122b5a48fee7929a1d9ae9256bb7f4e1b2ff889d) | 5.69 | 22640 |
| d | d1 | deploy instancia del escrow (ppdemo) | [`4ca89963…`](https://stellar.expert/explorer/testnet/tx/4ca89963eb6b3c4ea788da45d1b3c3dbfdc46dc0617f5f2aac886ed0d91c56ba) | 5.40 | 16080 |
| d | d2 | initialize_escrow (ppdemo), roles modo guardián v2 | [`6a83c6f8…`](https://stellar.expert/explorer/testnet/tx/6a83c6f81ff47ee2b2c880f902322d099cec8257d4958b6864942d276cab9065) | 5.60 | 134588 |
| d | d3 | pp_guardian.fund 50 LABUSD (despacho 3600 s, revisión 3600 s) | [`a75720ad…`](https://stellar.expert/explorer/testnet/tx/a75720ad5bb6e6c37c2494f01c3bd78bcc4d082f9ca93ed32b2b8ba504f5fcee) | 8.36 | 1088408 |
| d | d4 | pp_guardian.mark_shipped (vendedor, evidencia) | [`c1218e5f…`](https://stellar.expert/explorer/testnet/tx/c1218e5f59d82ed72b007d52a530bd556c39e4ed82ab611015e9efe999c964da) | 30.28 | 119298 |
| d | d5 | pp_guardian.dispute (vendedor) | [`2670470f…`](https://stellar.expert/explorer/testnet/tx/2670470fab94cf4ab6d3019ef3a427e54493193d34a8488b7e3fe445bc026878) | 5.62 | 8147 |
| d | d15 | cierre legítimo: pp_arbiter.resolve(5000) firmado por arbitro | [`71a5d5fb…`](https://stellar.expert/explorer/testnet/tx/71a5d5fba9547815375fdee6f414ce3efe209eb8a47e4ac8b53307e39c1e2d2c) | 80.20 | 22662 |

### Intentos rechazados (simulación, no llegan a la red)

| Esc. | Paso | Intento | Error |
|---|---|---|---|
| d | d0 | interfaces on-chain v2: sin upgrade, sin destinos elegibles, sin withdraw | `guardian=["__constructor","auto_release","config","confirm","dispute","extend","fund","mark_shipped","purchase","set_arbiter"] arbiter=["__constructor","config","quote","refund_unshipped","resolve","set_admin"]` |
| f | f5 | refund_unshipped antes del plazo de despacho | `Error(Contract, #7)` |
| c | c5 | tercero llama auto_release antes de release_at | `Error(Contract, #19)` |
| e | e6 | auto_release después del plazo ORIGINAL y antes del extendido | `Error(Contract, #19)` |
| e | e7 | segundo extend (solo una vez) | `Error(Contract, #27)` |
| f | f6 | el vendedor intenta marcar enviado tarde | `Error(Contract, #26)` |
| a | a4 | confirm antes de mark_shipped | `Error(Contract, #23)` |
| d | d6 | tercero llama pp_arbiter.resolve (falta la firma del admin) | `error: Missing signing key for account GBCSZ6TJSQD5FCOPGDQGTGWLLICPKE3DTHRMRVLYSDA4RQDOQMAUDRJT` |
| d | d7 | tercero: escrow.resolve_dispute como dispute_resolver | `Error(Contract, #12)` |
| d | d8 | tercero: escrow.resolve_dispute en nombre de pp_arbiter | `error: Contract addresses are not supported to sign auth entries CDTEA424AWSIIHEQ4FIQHFQOTWS3XAVLQHX7FI3MU6JZP4OPMTEVU5UA` |
| d | d9 | admin (arbitro): escrow.resolve_dispute en nombre de pp_arbiter hacia tercero | `error: Contract addresses are not supported to sign auth entries CDTEA424AWSIIHEQ4FIQHFQOTWS3XAVLQHX7FI3MU6JZP4OPMTEVU5UA` |
| d | d10 | TW-5: tercero: withdraw_remaining_funds como dispute_resolver | `Error(Contract, #12)` |
| d | d11 | TW-5: admin: withdraw_remaining_funds en nombre de pp_arbiter | `error: Contract addresses are not supported to sign auth entries CDTEA424AWSIIHEQ4FIQHFQOTWS3XAVLQHX7FI3MU6JZP4OPMTEVU5UA` |
| d | d12 | platform: update_escrow con receiver = tercero (solo simulación) | `Error(Contract, #16)` |
| d | d13 | tercero: mark_shipped haciéndose pasar por vendedor | `Error(Contract, #24)` |
| d | d14 | tercero: extend haciéndose pasar por comprador | `Error(Contract, #7)` |

### Esperas por hora del ledger

| Esc. | Qué | Objetivo | Ledger |
|---|---|---:|---:|
| e | pasó el release_at original (1794989496) | 1794989499 | 1794989501 |
| e | pasó el release_at extendido (1794989556) | 1794989556 | 1794989556 |
| e | pasó release_at de c (1794989456) | 1794989456 | 1794989641 |
| c | venció el plazo de despacho de f (1794989336) | 1794989336 | 1794989731 |

### Saldos LABUSD justo antes y después de la transacción final de cada escenario

| Esc. | Cuenta | Antes | Después | Δ |
|---|---|---:|---:|---:|
| e | comprador | 399.3191881 | 399.3191881 | +0.0000000 |
| e | vendedor | 922.1748297 | 971.0248297 | +48.8500000 |
| e | plataforma | 44.8162361 | 45.8162361 | +1.0000000 |
| e | twfee | 7.3974328 | 7.5474328 | +0.1500000 |
| e | tercero | 0.0000000 | 0.0000000 | +0.0000000 |
| e | escrow | 50.0000000 | 0.0000000 | -50.0000000 |
| c | comprador | 399.3191881 | 399.3191881 | +0.0000000 |
| c | vendedor | 971.0248297 | 1019.8748297 | +48.8500000 |
| c | plataforma | 45.8162361 | 46.8162361 | +1.0000000 |
| c | twfee | 7.5474328 | 7.6974328 | +0.1500000 |
| c | tercero | 0.0000000 | 0.0000000 | +0.0000000 |
| c | escrow | 50.0000000 | 0.0000000 | -50.0000000 |
| f | comprador | 399.3191881 | 448.1691881 | +48.8500000 |
| f | vendedor | 1019.8748297 | 1019.8748297 | +0.0000000 |
| f | plataforma | 46.8162361 | 47.8162361 | +1.0000000 |
| f | twfee | 7.6974328 | 7.8474328 | +0.1500000 |
| f | tercero | 0.0000000 | 0.0000000 | +0.0000000 |
| f | escrow | 50.0000000 | 0.0000000 | -50.0000000 |
| a | comprador | 398.1691881 | 398.1691881 | +0.0000000 |
| a | vendedor | 1019.8748297 | 1068.7248297 | +48.8500000 |
| a | plataforma | 47.8162361 | 48.8162361 | +1.0000000 |
| a | twfee | 7.8474328 | 7.9974328 | +0.1500000 |
| a | tercero | 0.0000000 | 0.0000000 | +0.0000000 |
| a | escrow | 50.0000000 | 0.0000000 | -50.0000000 |
| b | comprador | 348.1691881 | 382.3641881 | +34.1950000 |
| b | vendedor | 1068.7248297 | 1083.3798297 | +14.6550000 |
| b | plataforma | 48.8162361 | 49.8162361 | +1.0000000 |
| b | twfee | 7.9974328 | 8.1474328 | +0.1500000 |
| b | tercero | 0.0000000 | 0.0000000 | +0.0000000 |
| b | escrow | 50.0000000 | 0.0000000 | -50.0000000 |
| d | comprador | 332.3641881 | 356.7891881 | +24.4250000 |
| d | vendedor | 1083.3798297 | 1107.8048297 | +24.4250000 |
| d | plataforma | 49.8162361 | 51.2729861 | +1.4567500 |
| d | twfee | 8.1474328 | 8.4145481 | +0.2671153 |
| d | tercero | 0.0000000 | 0.0000000 | +0.0000000 |
| d | escrow | 50.0000000 | 0.0000000 | -50.0000000 |
