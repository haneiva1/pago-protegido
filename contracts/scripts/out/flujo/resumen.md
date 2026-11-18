# Flujo testnet de Pago Protegido (run 20261118-045216)

pp_guardian [`CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU`](https://stellar.expert/explorer/testnet/contract/CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU) · pp_arbiter [`CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU`](https://stellar.expert/explorer/testnet/contract/CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU)

## Escrows (una instancia por escenario)

| Escenario | Escrow |
|---|---|
| a | [`CCTSP4FWPIO67JKIFL6F7BGO7QM4FDP2IGLQXKC4YDTL2M3BZAQUQIGA`](https://stellar.expert/explorer/testnet/contract/CCTSP4FWPIO67JKIFL6F7BGO7QM4FDP2IGLQXKC4YDTL2M3BZAQUQIGA) |
| b | [`CDQQLWDFB32BAIMG5OTMT2COQENO5SE5WVDPCS2UHW3MU2O7GXBWW6RR`](https://stellar.expert/explorer/testnet/contract/CDQQLWDFB32BAIMG5OTMT2COQENO5SE5WVDPCS2UHW3MU2O7GXBWW6RR) |
| c | [`CDTKBAXCHMAIIG5JRGARXY62MPQBOMF5GKHIBKTAVZQ5XZ5XTLLR3L4P`](https://stellar.expert/explorer/testnet/contract/CDTKBAXCHMAIIG5JRGARXY62MPQBOMF5GKHIBKTAVZQ5XZ5XTLLR3L4P) |
| d | [`CDYMQQKLWS6J3LS3RV2Y2H2UEIKGZ4Q5CPB3LQAS5DUWO54N5IODWQMP`](https://stellar.expert/explorer/testnet/contract/CDYMQQKLWS6J3LS3RV2Y2H2UEIKGZ4Q5CPB3LQAS5DUWO54N5IODWQMP) |

## Transacciones

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

## Intentos rechazados (simulación, no llegan a la red)

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

## Saldos LABUSD (antes → después, en LABUSD)

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
