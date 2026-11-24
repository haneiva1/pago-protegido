# Desplegar en mainnet

`desplegar.sh` hace las secciones 3 y 4 de [docs/MAINNET.md](../../docs/MAINNET.md) una vez fondeadas las cuentas: seis transacciones, cada una con su confirmación.

| # | Transacción | Firma | Comisión estimada (XLM) |
|---:|---|---|---:|
| 1 | Trustline a USDC | `trato-mn-plataforma` | 0,00001 (más 0,5 de reserva) |
| 2 | Subir `pp_guardian.wasm` | `trato-mn-deployer` | 23,1004 |
| 3 | Subir `pp_arbiter.wasm` | `trato-mn-deployer` | 17,8803 |
| 4 | Instanciar `pp_guardian` | `trato-mn-deployer` | ≤ 0,30 |
| 5 | Instanciar `pp_arbiter` | `trato-mn-deployer` | ≤ 0,30 |
| 6 | `pp_guardian.set_arbiter` | `trato-mn-arbitro` | ≤ 0,10 |

```bash
bash scripts/mainnet/desplegar.sh --dry-run   # 1. mirar: no firma ni envía nada
bash scripts/mainnet/desplegar.sh             # 2. de verdad: escribir MAINNET, y "si" en cada transacción
```

Necesita `stellar-cli 30.0.1`, el Rust de `contracts/rust-toolchain.toml`, `jq`, `curl`, `perl` y una terminal (sin terminal se niega: no hay opción para saltar las confirmaciones).

## Qué cuida

- Compila con `contracts/scripts/wasm-mainnet.sh` y no sigue si un hash difiere de `contracts/wasm/mainnet.sha256`.
- Comprueba que el RPC y Horizon sean de mainnet, que las tres cuentas sean distintas y que no sean las de testnet, y que haya saldo para todo lo que falta **antes** de la primera transacción.
- Muestra quién firma, qué operación es (leída del XDR que se va a firmar) y la comisión máxima. Lo que se confirma es exactamente lo que se firma; solo se le agrega un vencimiento de 3 minutos.
- La comisión máxima es la simulada más 2 %, por si la renta sube entre simular y enviar. Lo que no se usa vuelve.
- Los IDs de los contratos salen de `trato-mn-deployer` y una sal fija. Si se corta, se vuelve a correr: lo que ya está en la red no se paga de nuevo y no puede quedar un par duplicado. `--par 2` despliega otro par (los WASM ya subidos no se vuelven a pagar).
- Antes de `set_arbiter` (se puede una sola vez) compara WASM y configuración de los dos contratos con lo esperado.
- Al final imprime los contract IDs y las variables de Railway: valores públicos y, de los secretos, solo el nombre. Los valores públicos quedan en `contracts/deployments/mainnet.env`.
- No lee ni muestra llaves: las usa el CLI para firmar. Ignora las variables `STELLAR_*` y corre el CLI en una carpeta vacía, para que no cargue ningún `.env`.

## Qué se probó y qué no (24-nov-2026)

**`--dry-run` contra mainnet, con las cuentas reales sin fondos.** Corre hasta el final y sale con 0:

| Paso | Resultado |
|---|---|
| Identidades, RPC, Horizon | bien |
| Compilar los WASM | los tres hashes coinciden |
| Contract IDs | calculados de antemano: `pp_guardian` `CDVFVXCMICLROS6R5EZRLDAAQ6WN6PLXURHNH3O7KJYGMC2TIWI47DM5`, `pp_arbiter` `CCRTWMR3XBSOQCANMK47VQWZXBB42K7XAPE4NGE2ECHPTA6ON6YBVTHW` |
| 1. Trustline | se arma. Es una operación clásica: el RPC no la simula |
| 2 y 3. Subir los WASM | simuladas: 23,1014 y 17,8813 XLM, con 0,001 de tope de inclusión cada una |
| 4 y 5. Instanciar | se arman, **no se pueden simular**: el WASM todavía no está en mainnet (`Error(Storage, MissingValue)`) |
| 6. `set_arbiter` | **no se puede armar ni simular**: el contrato todavía no existe |

Como las cuentas no existen, los pasos 1 a 5 se arman con una cuenta pública como origen (la del 0,3 % de Trustless Work). Es solo para simular: nunca se firma. Con las cuentas fondeadas, el `--dry-run` usa las nuestras; a medida que los pasos quedan en la red, los siguientes se pueden simular.

**`--ensayo` en testnet, de punta a punta**, con identidades descartables guardadas en el llavero (después borradas):

| Caso | Resultado |
|---|---|
| Sin terminal | se niega, sale con 2 |
| Confirmar la 1 y decir "no" en la 2 | sale con 3; la 2 no se envió |
| Volver a correr | salta la 1, envía 2 a 6, comprueba y muestra las variables. `pp_guardian` `CB2336SYCL6YONSGXJVJXNPHIC33QO2FLUAFT253XYZCE2DLCFHLSCFH`, `pp_arbiter` `CA2A4GY6PG2IKGL6D2BZLJ6GCOPJ2B2WZRXRKFLRF6ENT4R7WBVLMIMR` (testnet) |
| Correr otra vez, real y `--dry-run` | las seis dicen "ya está"; salen con 0 |
| `--dry-run --par 2` | 4 y 5 se simulan (el WASM ya está en la red) |
| RPC de otra red | se niega antes de armar nada |
| Dos de las tres cuentas sin fondos | dice cuáles faltan y sale con 1 antes de pedir nada |

En testnet instanciar costó 4,70 y 3,64 XLM, mucho más que lo estimado para mainnet. No es un error de la estimación: el constructor extiende la vida del código a 30 días, y en testnet el código nuevo nace con 7 (`min_persistent_ttl` 120.960 ledgers). En mainnet nace con 120 días (2.073.600), así que no hay nada que extender. Es el mismo motivo por el que subir los WASM cuesta más en mainnet.

**No se probó:** firmar o enviar nada en mainnet, y un corte de red justo durante el envío (el código espera el vencimiento y consulta el hash, pero no se forzó).

## Ensayar otra vez en testnet

```bash
for k in deployer arbitro plataforma; do
  stellar keys generate trato-ensayo-$k --secure-store
  curl -s -o /dev/null "https://friendbot.stellar.org?addr=$(stellar keys address trato-ensayo-$k)"
done
bash scripts/mainnet/desplegar.sh --ensayo
for k in deployer arbitro plataforma; do stellar keys rm --force trato-ensayo-$k; done
```

## Sacar una llave del llavero

El CLI firma con el llavero, pero a propósito no muestra la llave (`stellar keys secret` falla). Estos pasos los hace la persona dueña de las cuentas, en su terminal.

**Respaldo (las tres, antes de mandar XLM).** Acceso a Llaveros → inicio de sesión → buscar `org.stellar.cli-trato-mn` → abrir cada una → «Mostrar contraseña»: son 24 palabras. Anótalas fuera de la computadora. Con ellas se recupera la cuenta en cualquier billetera Stellar.

**`PLATAFORMA_SECRET` y `ARBITRO_SECRET` para Railway.** Copia la `S…` al portapapeles sin mostrarla en pantalla (macOS pide la contraseña):

```bash
K=trato-mn-plataforma        # y después: trato-mn-arbitro
D=$(mktemp -d)
security find-generic-password -w -s "secure_store:org.stellar.cli-$K" | stellar --config-dir "$D" keys add x --seed-phrase
[ "$(stellar --config-dir "$D" keys address x)" = "$(stellar keys address $K)" ] && echo "coincide"
stellar --config-dir "$D" keys secret x | tr -d '\n' | pbcopy     # pegar en Railway
rm -rf "$D"
pbcopy </dev/null            # después de pegar
```

La llave de `trato-mn-deployer` no va en Railway. Se probó la conversión de frase a `S…` con una llave descartable; la lectura con `security -w` no, porque abre un diálogo de macOS.
