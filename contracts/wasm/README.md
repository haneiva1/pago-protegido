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
