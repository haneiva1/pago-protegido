# WASM del escrow de Trustless Work

`escrow.wasm` es el escrow **single-release** de Trustless Work compilado **sin modificaciones**. Lo usan los tests de `integration-tests/` (`include_bytes!` en `tests/common/mod.rs`) y es el mismo WASM instalado en testnet.

| | |
|---|---|
| Repo | `Trustless-Work/Trustless-Work-Smart-Escrow` |
| Rama / commit | `single-release-develop` @ `f0b706eaf6e98aa83bf4f95df42857b5d4c8e847` |
| sha256 | `1b367bc8476cf80b89f6396e2aa07b602b78361dd829b5ce9b64ada365196660` |

La app verifica on-chain este mismo hash antes de pedir la firma del pago ("Contrato verificado").

Para comprobarlo:

```bash
shasum -a 256 contracts/wasm/escrow.wasm
```

Para reconstruirlo desde el código fuente (no hace falta para correr los tests):

```bash
git clone https://github.com/Trustless-Work/Trustless-Work-Smart-Escrow.git && cd Trustless-Work-Smart-Escrow
git checkout f0b706eaf6e98aa83bf4f95df42857b5d4c8e847
stellar contract build   # el WASM queda en target/wasm32v1-none/release/escrow.wasm
```

No vendorizamos el código de Trustless Work en este repo: los tests solo necesitan el WASM y el commit lo fija.

## El escrow de mainnet: `escrow-mainnet.wasm`

Trustless Work usa en mainnet **otro WASM**, con otra interfaz: la cuenta de su 0,3 % viene fija en el contrato, así que `release_funds`, `resolve_dispute` y `withdraw_remaining_funds` no reciben `trustless_work_address`. Con `escrow.wasm` (testnet) nuestros contratos sí lo pasan: los de testnet **no podrían liberar** un escrow de mainnet.

| | |
|---|---|
| De dónde sale | leído de mainnet por RPC el 24-nov-2026: lo ejecutan los escrows single-release que crea la fábrica `CBPX734ETRN25FGHB2E2WGISGTGMDGG5QTDKJEEPJ56H7QAJJEFPBWTO` |
| sha256 | `96d51751f924c938a081deb740056dc1c5cc60c6e645672062531f82957ed2fe` |
| Código fuente más parecido | rama `single-release-main` @ `6e4d40e` (no recompilamos el WASM: no lo damos por reproducido) |
| Cuenta del 0,3 % (fija en el WASM) | `GBWWSOATPLIC72ZBOIM7WJCT7VCAHNWW4QUBZ2H4FORMCCIUM5ZVKSZN` |
| Otra diferencia | no congela `change_milestone_status` después de liberar o resolver (no mueve plata) |

`pp_guardian` y `pp_arbiter` se compilan para ese escrow con el feature `tw-mainnet` (apagado por defecto: el build de siempre da los mismos hashes). Se prueban con los mismos tests contra este WASM:

```bash
cd contracts && cargo test -p pp_integration_tests --features tw-mainnet
bash contracts/scripts/wasm-mainnet.sh   # compila y compara con wasm/mainnet.sha256
```
