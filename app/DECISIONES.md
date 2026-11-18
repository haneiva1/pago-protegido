# Decisiones de la app (fuera de SPEC.md)

Criterio: cuando el SPEC no decide algo, se elige **la opción más simple que respete el SPEC**. Cada decisión se puede revisar sin rehacer la app.

## Producto

1. **Un link de pago es de un solo uso y es el pedido.** Cada link se comparte con un cliente; el mismo registro guarda el pedido, su escrow y su estado. `/p/[slug]` es a la vez la página de pago y la de seguimiento. Para vender lo mismo otra vez, se crea otro link (30 segundos).
2. **El primero que inicia el pago queda como comprador.** Al tocar "Simular pago del banco", la dirección del comprador queda en los roles del escrow. Si otra persona abre el link, ve "Este link ya lo está pagando otra persona".
3. **"Recibí conforme" se permite desde "Pagado" y desde "Enviado".** Cubre la entrega en persona sin guía. La liberación automática (`auto_release`, modo guardián) exige "enviado", como dice el SPEC.
4. **Plazo de liberación automática = días de entrega + 3 días, contados desde el fondeo.** Es el `window_secs` que se pasa a `pp_guardian.fund`. En modo directo el plazo se muestra pero no se ejecuta: el contrato de Trustless Work no tiene plazos (hallazgo 6 del spike), y la pantalla lo aclara.
5. **Reclamo:**
   - Motivos fijos: "No llegó", "Llegó dañado", "No es lo que pedí", "Llegó incompleto", "Otro".
   - Texto libre y foto por URL. No se suben archivos en el MVP.
   - El vendedor responde con texto ("Tu versión para el árbitro").
   - La evidencia vive en SQLite; on-chain solo queda el estado del hito y la evidencia de envío.
6. **"Ventas completadas" = pedidos liberados** por confirmación del comprador. No cuenta las disputas resueltas.
7. **El reembolso por disputa también paga comisiones** (2% plataforma + 0,3% Trustless Work), porque así lo hace el contrato (hallazgo 3 del spike). El árbitro lo ve en la vista previa: con 100% para el comprador, recibe 97,7%.
8. **Montos:**
   - Se calcula en unidades base (7 decimales) con la misma división entera del contrato y se muestra con 2 decimales.
   - El precio en Bs se convierte con `FX_BS_PER_USD` (11,70 por defecto), redondeado a la unidad base más cercana.
   - La rampa emite exactamente el monto del pedido.
9. **Estados en pantalla:** Esperando pago, Pagado (despacha), Enviado, Liberado, En disputa y Resuelto, igual que el SPEC.
10. **WhatsApp:**
    - Si el destinatario es el vendedor, el link `wa.me` lleva su número. Si es el comprador (no tenemos su número), abre WhatsApp para elegir el contacto.
    - Cada evento tiene su texto: link creado, pago recibido (comprador → vendedor y vendedor → comprador), enviado, liberado, reclamo y resolución.
11. **Las pantallas se actualizan por consulta periódica** (7–10 s), no por websockets.

## Seguridad y no custodia

12. **Una billetera por rol en el navegador.** `pp.billetera.vendedor` y `pp.billetera.comprador` en `localStorage`, para que una persona pueda probar los dos lados en un mismo dispositivo sin que comprador y vendedor sean la misma cuenta.
13. **El usuario es la cuenta de origen de sus transacciones Soroban.** Así su firma del sobre cubre la autorización (credenciales `SourceAccount`) y no hace falta firmar *auth entries* por separado.
    - La plataforma envuelve cada transacción en un **fee bump** y paga la comisión.
    - Las cuentas nuevas reciben XLM de friendbot (SPEC §5), pero no gastan en comisiones.
14. **La plataforma solo patrocina transacciones que ella misma armó.**
    - Cada transacción preparada se guarda por hash en la tabla `pending`.
    - `/api/tx/submit` rechaza cualquier XDR cuyo hash no esté ahí o que no esté firmado por la cuenta esperada.
    - Así nadie puede usar la llave de la plataforma para pagar comisiones de transacciones ajenas.
15. **Las acciones que no van on-chain se identifican solo por la dirección pública** (crear link, responder un reclamo), sin firma de un desafío. Es aceptable en testnet. Todas las acciones on-chain sí exigen la firma de la billetera y las valida el contrato.
16. **El panel del árbitro se protege con una clave** (`ARBITRO_PANEL_KEY`, generada por `npm run setup`). La llave `arbitro` nunca sale del servidor. El SPEC no define el login del árbitro.
17. **Las transacciones de cada cuenta del servidor se serializan** con un candado por cuenta (`plataforma`, `lab`, `arbitro`), para evitar choques de número de secuencia. Los fee bumps no consumen la secuencia de la plataforma.

## Escrow

18. **Deploy + initialize en una sola transacción** con `tw_new_single_release_escrow`.
    - Así se cierra el hallazgo 1 del spike: entre deploy e init, cualquiera podía inicializar con sus roles.
    - La función se llama sobre una instancia "fábrica": un escrow que nunca se inicializa.
    - La fábrica se despliega una vez y su ID queda en la tabla `kv`.
    - Cada pedido usa un salt nuevo.
19. **`trustless_work_address` = identidad `twfee`**, la misma del spike. El contrato deja que la elija quien llama (hallazgo 2).
20. **Confirmar en modo directo son dos transacciones del comprador:** `approve_milestone` y `release_funds`. La app las encadena sola. Si la segunda falla, al reintentar se retoma desde la liberación. En modo guardián es una sola llamada a `pp_guardian.confirm`, la confirmación atómica del SPEC.
21. **Modo guardián sin bindings compilados.** `GuardianEscrowService` lee el Spec de `pp_guardian` y `pp_arbiter` desde la red y convierte los argumentos por nombre (SPEC §3). Es equivalente a usar los bindings y no depende de que `pago-protegido/contracts/bindings` esté compilado. Si los nombres reales difieren, se ajustan en `ARGS` (`src/lib/server/escrow/guardian.ts`).
22. **"Probar: mandar la plata a otra cuenta"** (panel del árbitro, demo §7.5):
    - Simula `resolve_dispute` hacia otra cuenta y nunca envía nada.
    - La "otra cuenta" es la de la plataforma, porque tiene trustline a LABUSD. Con una cuenta sin trustline, el que falla es el token (`#13 TrustlineMissing`) y la demostración engañaría.
    - **Modo guardián:** lo rechaza el escrow, porque el `dispute_resolver` es `pp_arbiter` y no la cuenta del árbitro. Además, `pp_arbiter` no tiene ninguna función que reciba destinos; se verifica en su Spec.
    - **Modo directo:** el escrow de Trustless Work por sí solo **aceptaría** ese reparto. Lo que impide el desvío es que la app no expone ninguna forma de elegir destino: el servidor solo arma repartos comprador/vendedor. La pantalla lo dice tal cual ("Rechazado por el servidor") y el texto fijo del SPEC se acompaña de una nota de modo directo.
23. **Los errores del contrato se traducen al español** (`src/lib/server/stellar.ts`). Los códigos vienen de `src/error.rs` de Trustless Work (commit `f0b706e`).

## Técnicas

24. **Stack:**
    - Next.js 16 (App Router, Turbopack), React 19, Tailwind 4, `@stellar/stellar-sdk` 17 y `better-sqlite3` 13.
    - El SDK 17 trae XDR con propiedades en lugar de métodos, y `tx.hash()` devuelve `Uint8Array`.
25. **El RPC, Horizon, friendbot y la passphrase están fijos a testnet en el código** (`config.ts`). No hay variable para apuntar a mainnet.
26. **Puertos:**
    - `npm run dev` usa el 3000 (o `PORT`); Pollar tiene registrado ese origen.
    - El e2e usa el 3100, con build propio (`.next-e2e`), `NEXT_PUBLIC_WALLET=local` y base `data/e2e.db`, para no pisar la app de desarrollo.
    - En esta máquina, el 3000 lo ocupa un contenedor de Docker; para probar se usó el 3010.
27. **Capturas del e2e:**
    - Celular a 390 px @2x; escritorio a 1280 px @1x (`scale: "css"`), página completa.
    - Antes de cada captura se verifica que el texto visible no diga "cripto".
28. **Billetera Pollar:**
    - `WalletProvider` define la interfaz común: `connect`, `publicKey`, `signTransaction` y `disconnect`.
    - `NEXT_PUBLIC_WALLET=local|pollar` elige la implementación. Si falta la publishable key, se cae a la local.
    - La integración con `@pollar/core`/`@pollar/react` queda en `src/lib/wallet/pollar.ts`. Su estado está en la sección "Pollar".

## Pollar

Integrado con `@pollar/react` y `@pollar/core` 0.12, siguiendo las páginas de `docs-pp/pollar/`. Cuando se integró todavía no había llegado `POLLAR.md`.

29. **Pollar es la billetera principal.**
    - `npm run setup` copia las llaves de `docs-pp/.env.pollar` y pone `NEXT_PUBLIC_WALLET=pollar`.
    - `LocalWallet` queda como alternativa (`NEXT_PUBLIC_WALLET=local`). El e2e la fuerza con su propio build.
30. **`PollarProvider` no envuelve las páginas.**
    - Se monta aparte (`components/WalletRuntime.tsx` → `PollarProviders.tsx`), solo en el navegador y solo en modo Pollar. Así las páginas siguen renderizando en el servidor.
    - `PollarBridge` copia `isAuthenticated`, `wallet.address`, `openLoginModal` y `logout` de `usePollar()` a `PollarWallet`, que cumple la misma interfaz `WalletProvider`.
    - Se usa un solo `PollarClient` por pestaña. Con varios, Pollar advierte que rotan el refresh token por separado.
31. **Firma sin patrocinio de Pollar:** `signTx(xdr, { skipSponsorship: true })`.
    - Pollar firma (en Test, del lado de su servidor) y devuelve el XDR firmado.
    - Nuestra plataforma hace el fee bump como con la billetera local. Así hay un solo camino de envío y la regla de la tabla `pending` sigue valiendo.
    - Pollar maneja una sola billetera por usuario: en modo Pollar, los roles vendedor y comprador usan la misma cuenta.
32. **Activación:** si la cuenta de Pollar no tiene la trustline a LABUSD (depende de los activos configurados en el dashboard), la app arma la `changeTrust`, Pollar la firma y la plataforma paga la comisión con fee bump, igual que en la billetera local.
33. **Sin verificar de punta a punta.**
    - El build y la carga en el navegador funcionan: aparece el botón "Ingresar con Google o email" y no hay errores de JS.
    - El login real no se pudo probar porque Pollar solo acepta el origen `http://localhost:3000`, y en esta máquina ese puerto lo ocupa un contenedor de Docker (desde 3020, CORS bloquea `/v3/applications/config`).
    - Falta probarlo con `npm run dev` en el puerto 3000 libre, iniciando sesión con Google o email.
    - Riesgo a revisar en esa prueba: si la política de transacciones de la app en Pollar (Wallets → Transaction policy / Signing rules) restringe qué contratos Soroban puede firmar una billetera administrada, habrá que permitir el escrow (cada pedido es una instancia nueva del mismo WASM).
