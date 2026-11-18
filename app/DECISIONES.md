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

## Segunda ronda: modo guardián por defecto

34. **`PP_MODE=guardian` es el modo por defecto.**
    - Usa `pp_guardian` `CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU` y `pp_arbiter` `CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU`, de `../contracts/deployments/testnet.json`.
    - Los IDs quedan en `.env.local` (`npm run setup`) y como valor por defecto en `config.ts`.
    - `PP_MODE=direct` sigue funcionando.
    - La interfaz real coincide con SPEC §3 y además usa `purchase`, `quote` y el `Purchase` que devuelve `fund`.
35. **H-2: verificación antes de pedir la firma del fondeo.**
    - Por RPC se descarga el WASM de la instancia (`getContractWasmByContractId`) y su sha256 tiene que ser `1b367bc8…196660`.
    - Con `get_escrow` se comparan los roles esperados: approver y release_signer = `pp_guardian`, dispute_resolver = `pp_arbiter`, receiver y service_provider = vendedor, platform = plataforma.
    - Si algo falla, el servidor no arma la transacción y la pantalla muestra "Pago bloqueado". Si todo está bien, muestra el sello "Contrato verificado" con link a stellar.expert.
    - El resultado queda en `orders.verify_json` y se sigue mostrando en el seguimiento.
36. **H-1: el estado on-chain manda.**
    - Al leer un pedido con su estado on-chain, `released` → "Liberado" (aunque también figure en disputa) y `resolved` → "Resuelto".
    - El status de envío se escribe exactamente `"enviado"` (D-7 de contracts).
37. **El plazo real es el del contrato.**
    - Después del fondeo, la app lee `pp_guardian.purchase` y guarda `funded_at` y `deadline` (hora del ledger).
    - "Liberar ahora (plazo vencido)" aparece con 5 s de margen después del deadline y solo si el pedido está "enviado", porque `auto_release` lo exige (#23).
    - Lo llama la plataforma sin firmas de usuario (`auto_release` no requiere auth).
38. **Plazo de demo: `?demo=1` en `/panel`.**
    - Habilita "Plazo corto de demo" (2 minutos; el mínimo del guardián es 60 s).
    - Queda en `orders.window_secs` y no se ofrece fuera de esa URL.
39. **Árbitro:**
    - La vista previa del slider llama `pp_arbiter.quote` (simulación de solo lectura) y muestra los netos con la fórmula de comisiones de TW.
    - `resolve` usa `pp_arbiter.resolve`.
    - El redondeo de la vista previa local y del modo directo se igualó al D-8 del árbitro: la unidad sobrante va al comprador.
40. **Demo de desvío:**
    - Se simula `escrow.resolve_dispute` firmado con la llave `arbitro` hacia una tercera cuenta (la de la plataforma, que tiene trustline).
    - El escrow lo rechaza con `Error(Contract, #12)` `OnlyDisputeResolverCanExecuteThisFunction`, porque el dispute_resolver es `pp_arbiter`.
    - La pantalla muestra la llamada, el error crudo del host y que fue una simulación (no se envía nada ni se cobra comisión).
    - Además se revisa en el Spec que `pp_arbiter` no tenga funciones con destinos.
41. **Errores propios del guardián y del árbitro** (tablas de `contracts/DECISIONES.md`) traducidos al español, con el contrato y el código: p. ej. "Todavía no venció el plazo de liberación automática (pp_guardian #19)".
42. **Rutas de rampa de Pollar:**
    - `docs-pp/pollar/rutas-api.json` se generó con `consultar-rutas.sh`, solo con lecturas (GET /health y /ramps/routes; sin `--cotizar-bob`).
    - HTTP 200 en las tres consultas y **0 rutas** de on-ramp/off-ramp en la app de Test. La salida no contiene la clave.
43. **Pollar en `localhost:3020`:**
    - El modal de login carga sin errores de origen (verificado con Playwright).
    - Faltaba `import "@pollar/react/styles.css"`, que indica POLLAR.md: sin él, el modal salía sin estilos al pie de la página.
    - En 0.12.0 el modal está en inglés (sin `locale` en los tipos).
44. **El e2e reintenta el pago hasta 3 veces si la red falla.**
    - El pago encadena 3–4 transacciones en testnet: rampa, deploy del escrow y fondeo.
    - En una corrida, el deploy del escrow falló una vez por la red. El flujo es idempotente (no vuelve a emitir la rampa y solo crea el escrow si falta), así que el test hace lo mismo que haría el usuario: ve el error y reintenta.
    - El servidor ahora registra los errores de red o contrato (422) en el log.
    - El error se busca por `data-testid="error"`: `role="alert"` también lo usa el route announcer de Next.js.

## Tercera ronda: bot de WhatsApp

45. **Endpoints del bot tal como los pide `../bot/APP-ENDPOINTS.md`.**
    - Van bajo `/api/bot/`, con la clave compartida `PP_BOT_KEY` (`npm run setup`) en `x-bot-key`, comparada con `timingSafeEqual`.
    - Si la app no tiene `PP_BOT_KEY`, siempre responde 401.
46. **WhatsApp del comprador antes de pagar.** El capataz lo pidió antes de pagar; APP-ENDPOINTS §4 lo describía después. Se hicieron las dos cosas:
    - El campo opcional "Tu WhatsApp para avisarte" viaja en `POST /api/orders/:slug/pay`.
    - `POST /api/orders/:slug/buyer-contact` existe con las respuestas exactas de §4, para dejarlo o cambiarlo después.
    - El número se normaliza (solo dígitos; 8 dígitos → `591…`) y se guarda en `orders.buyer_whatsapp`.
    - Solo lo devuelve `/api/bot/changes`: `publicOrder` lo quita de todas las vistas públicas, y el e2e lo verifica.
47. **`/panel?enviar=&evidencia=`:**
    - Si el pedido es de esa billetera y está "pagado", se resalta, se hace scroll hasta él y se precarga la guía. Si no, el panel se ve normal.
    - El bot nunca firma: el vendedor confirma con su billetera.
48. **Si hay varias tiendas con el mismo WhatsApp**, `/api/bot/sellers` devuelve la más reciente, como pide §1. El e2e registra una tienda nueva en cada corrida con el mismo número, y el bot toma esa.
49. **El e2e levanta el simulador del bot como segundo `webServer` de Playwright**, contra la app del e2e: app en el 3100, simulador en el 3130.
    - El simulador corre sin estado en disco (`BOT_STATE_FILE=""`) y avisa cada 2 s.
    - La clave del bot sale de `.env.local`.
50. **`npm run demo`** (`scripts/demo.mjs`) usa `next dev` en el 3020, que acepta Pollar, y `npm run sim` del bot en el 3030.
    - Avisa cada 3 s.
    - Si el bot no tiene `node_modules`, los instala.
    - Si una de las dos partes se cae, apaga todo.

## Cuarta ronda: transparencia, reinicio y video

51. **`/transparencia` calcula todo con eventos on-chain** (docs/METRICAS.md), no con la base privada de pedidos.
    - La ingesta se hace al abrir la página (o `/api/transparencia`), con candado y como mucho cada 15 s. No hay un job aparte: para el MVP alcanza y no agrega procesos.
    - Muestra todas las compras del guardián, incluidas las de scripts y pruebas: es lo que dice la red.
52. **Las comisiones de /transparencia son nominales** (2% y 0,3% del volumen cerrado), como `metricas.sh`. El redondeo real por destinatario puede diferir en unidades.
53. **`demo:reset` borra solo pedidos, tiendas, transacciones y pendientes locales.**
    - Conserva `kv` (la fábrica del escrow, para no desplegar otra) y `pp_events` (para no reingerir).
    - Siembra con billeteras locales de un solo uso. Esas llaves no se guardan, así que esos pedidos son solo historial.
    - La tienda sembrada usa el número del simulador. Cuando el presentador crea la suya con `/vender?wa=`, el bot toma la más reciente (APP-ENDPOINTS §1).
54. **Video:**
    - Cada escena se graba como un clip en un contexto nuevo, para que el video no incluya las esperas de los otros actores.
    - La billetera local pasa entre clips con `storageState`. La segunda compra se paga y se despacha fuera de cámara.
    - Los subtítulos son un overlay que sobrevive a las navegaciones (sessionStorage) y no tapa la interacción (`pointer-events: none`).
    - Se versiona solo el mp4 final; los clips se regeneran.
55. **Playwright compartido:** `playwright.shared.ts` arma la app y el simulador para el e2e (3100/3130, `data/e2e.db`) y para el video (3200/3230, `data/video.db`, `slowMo` 120 ms).

## Quinta ronda: vista previa en WhatsApp y video corto

56. **`/p/[slug]` pasó a ser un componente de servidor** que exporta `generateMetadata` y renderiza `PaginaDePago` (cliente).
    - Así cada pedido tiene su `og:title` ("Producto · Bs 450,00 | Pago Protegido") y su `og:description` (la tienda y la promesa).
    - La imagen OG solo usa datos que ya son públicos en el link: producto, precio y tienda.
57. **`metadataBase` se arma con el host del request** (`x-forwarded-host`/`host` y `x-forwarded-proto`). WhatsApp exige URLs absolutas, y así funciona en localhost, con un túnel o con un dominio sin configurar nada.
    - Costo: el layout lee `headers()` y todas las páginas pasan a ser dinámicas, lo que en este MVP no importa.
58. **Fuente de las imágenes OG: Inter 400/700/800 local** (`@fontsource/inter`).
    - La fuente por defecto de `next/og` solo trae el peso regular.
    - Se escribe "aprox." en lugar de "≈", porque ese glyph no está en el subset latino y satori intentaría bajar una fuente de la red.
59. **Logo:** escudo con check en dos tonos de verde (`src/app/icon.svg`). Es el favicon (convención de Next) y se usa igual en el header, en las imágenes OG y en las placas del video.
60. **Video corto:** las esperas a testnet se acortan automáticamente (`freezedetect` + `setpts`), no a mano. Así el script sigue siendo reproducible con cualquier grabación nueva.
    - En cada tramo quieto se dejan 3,6 s a velocidad normal, para que el subtítulo se lea, y el resto se acelera ×12.
    - Las placas se renderizan desde HTML con Playwright, porque el ffmpeg de Homebrew no trae `drawtext`.
    - La portada grabada se reemplazó por la placa inicial.

## Sexta ronda: producto v2 (ventas entre ciudades por encomienda, Bs 300 a 3.000)

61. **Textos.**
    - **Prohibidas en todas las pantallas:** "seguro", "garantía/garantizado", "100%", "custodia", "plataforma de pagos", "pasarela", "billetera Pago Protegido", "arbitraje" y "árbitro".
    - **Prohibidas además en las pantallas del comprador y del vendedor:** cripto, token, stablecoin, wallet, llave, billetera propia, blockchain y Stellar.
    - **Reemplazos:** "árbitro" pasa a "revisor". La página es `/revisor` y `/arbitro` redirige. La API sigue en `/api/arbitro` y el contrato es `pp_arbiter`.
    - **Stellar** solo se ve detrás de los links "Ver registro público".
    - **El test:** `revisarPalabras` en el e2e revisa cada captura y además recorre todas las pantallas.
    - **Pantallas técnicas:** el panel del revisor, `/como-funciona` y `/transparencia`. Ahí se permiten los términos técnicos, no los legales.
    - **Pendiente fuera de la app:** los textos del bot (`../bot`) todavía dicen "árbitro" y "Recibí conforme". Ver el anexo para el capataz.
    - **Política de reclamos:** se publicó con un cambio: "recupera todo su pago" en lugar de "el 100%", para respetar la lista.
62. **Moneda:** siempre Bs primero, con el tipo de cambio del pedido. Una sola línea al pie: "Se guarda en dólares digitales (en producción, USDC, 1 a 1 con el dólar; en esta práctica, dólares de prueba)". No dice USDC a secas porque en testnet la moneda es LABUSD.
63. **Fricción al confirmar.**
    - "Pagar al vendedor (irreversible)" solo aparece con el pedido en "enviado". Se habilita 2 h después del envío si la ciudad del vendedor y la de destino coinciden, y 24 h si no.
    - **Modo demo:** `PP_DEMO=1` lo baja a 1 minuto. Lo usan el e2e y `npm run demo`.
    - El servidor guarda `confirm_after` al registrar el envío y rechaza confirmar antes.
    - Antes de pagar se pregunta "¿Tienes el producto en tus manos y lo revisaste?". "El vendedor me pide que confirme" abre un reclamo con motivo "Presión para confirmar" (on-chain, por pp_guardian), suma `sellers.pressure_reports` y muestra un aviso. El revisor ve los reportes.
64. **Datos de entrega.**
    - Se piden al pagar: quién recibe, ciudad de destino y agencia preferida (opcional).
    - Se guardan solo en el servidor. Los ven el vendedor (su panel) y el revisor, nunca la vista pública.
    - Quedan ligados al escrow con `sha256(slug, quién, ciudad, agencia)` (16 hex) en la `description`.
65. **Evidencia de envío estructurada.**
    - Campos: empresa (lista, incluye "Entrega en persona"), guía (obligatoria salvo entrega en persona), peso declarado, foto (URL), ciudad de destino y, si la categoría es Celular, IMEI de 15 dígitos (obligatorio).
    - On-chain va `empresa|guía|peso|hash-foto` (12 hex del sha256 de la URL).
    - Cada versión (envío, reclamo y respuesta del vendedor) queda en la tabla `evidence` con su hora, y el revisor ve el historial.
    - El comprador ve el IMEI con "Marca *#06# en el equipo y compara".
66. **Reclamos.**
    - Los motivos son los de la política: no envió, no llegó, llegó vacío o con otro producto, dañado o distinto, más presión para confirmar.
    - Para (c) y (d), desde Bs 300, el comprador tiene que dar el link del video continuo del desempaque.
    - El revisor elige el motivo del fallo (obligatorio) y el slider arranca sin valor: no hay reparto por defecto.
67. **Quién paga la protección (por link).**
    - **"El comprador" (por defecto):** 1,5% con mínimo Bs 5 y máximo Bs 50.
      - El comprador paga precio + protección (`amount` del escrow). La protección incluye el 0,3% de TW.
      - El `platform_fee` del escrow se calcula por pedido (`floor((amount − TW − precio) × 10000 / amount)`), así el vendedor recibe al menos el precio completo.
      - Ejemplo de Bs 450: el comprador paga Bs 456,75, el vendedor recibe Bs 450,04 y `platform_fee` es 117 bps.
    - **"Yo la regalo":** 2% de la venta, como antes.
    - El ajuste del capataz (1,5%, mín. Bs 5, máx. Bs 50) reemplazó al "Bs 5 + 2%" de la consigna original.
68. **Código de pedido corto y legible:** PP-#### (único). `/verificar?codigo=PP-4821` muestra tienda, producto, monto y estado, con el link auténtico.
69. **Tarjeta del vendedor:**
    - ciudad;
    - ventas protegidas (liberadas);
    - reclamos y cómo terminaron;
    - desde cuándo vende;
    - "Verificación de identidad: pendiente (modo práctica)";
    - WhatsApp.
70. **El comprador no ve ningún login.** Siempre usa la llave local invisible, aunque `NEXT_PUBLIC_WALLET=pollar`. Pollar (Google o correo) queda solo para el vendedor: es quien vuelve, cobra y necesita recuperar su cuenta. Al comprador un login le agrega fricción en el momento de pagar.
71. **Señales de confianza en la página de pago:**
    - "Si un QR de Pago Protegido está a nombre de una persona, es estafa".
    - "Verifica este link en <dominio>/verificar con el código…".
    - "¿Dudas? Reenvía este link a nuestro WhatsApp…".
    - En el panel del vendedor: "Para cobrar no tienes que abrir ningún link".
    - El sello "Contrato verificado" se reemplazó por "Pago bloqueado en un contrato público: solo puede ir al vendedor o volver a ti", con "Ver registro público". El detalle de la verificación (WASM y roles) queda plegado.
72. **Piloto.**
    - `/piloto` guarda la lista de espera en `pilot_waitlist` y `npm run piloto:csv` la exporta a `data/piloto.csv`.
    - Quien crea su tienda desde ahí (`/vender?piloto=<id>`) queda con `sellers.pilot = 1`.
    - `/transparencia` cuenta las compras de esos vendedores aparte ("Piloto con vendedores reales"). Lo demás se rotula "Pruebas del equipo en testnet (incluye reclamos forzados)".
    - El 59% se reemplazó por el desglose de cómo terminaron, que aclara que los reclamos son forzados en las pruebas.
73. **`/pedir`** arma el mensaje de WhatsApp para que un comprador le pida a una tienda que use Pago Protegido.
74. **Contratos v2** (`mark_shipped`, reloj desde el envío y `extend`): no se integraron en esta ronda.
    - La interfaz ya los recibe: `CAPABILITIES` en `/api/info` y en cada pedido, el botón "Necesito más tiempo" en la cuenta regresiva (oculto mientras `extend` sea `false`) y la ruta `POST /api/orders/:slug/extend`, que hoy responde 501.
    - Con los IDs v2 se activan las capacidades y se implementan `extend`/`markShipped` en `GuardianEscrowService`.
75. **El e2e borra `data/e2e.db` en cada corrida**, para que las pantallas no muestren textos viejos de corridas anteriores (por ejemplo, el antiguo "árbitro" en movimientos guardados). La fábrica del escrow se vuelve a desplegar una vez por corrida. La limpieza corre solo en el proceso principal de Playwright (sin `TEST_WORKER_INDEX`): cada worker vuelve a evaluar la config y borraría la base con el servidor ya corriendo. Lo mismo vale para `data/video.db`.
76. **El video de la demo (`npm run demo:video`) no se volvió a grabar en esta ronda.** Su script usa los textos de la ronda 5; hay que actualizarlo después de integrar los contratos v2.

## Séptima ronda: contratos v2 integrados (rama `worktree-pp-v2-integracion`)

Las decisiones 74 y 76 quedan reemplazadas por las de esta sección.

77. **Plazos v2 que firma el comprador en `pp_guardian.fund(…, ship_secs, inspect_secs)`.**
    - **Despacho (`ship_secs`)** = los días de entrega que prometió el vendedor, contados desde el pago.
    - **Revisión (`inspect_secs`)** = días de entrega + 3 días, contados desde que el vendedor registra el envío (`release_at`).
    - Es la opción más conservadora: el comprador nunca tiene menos tiempo que en v1 (antes, días + 3 contados desde el pago) y el vendedor no puede retener la plata sin despachar más allá de lo que prometió.
    - Links de demo (`/panel?demo=1`): los dos plazos duran 2 minutos (el mínimo del guardián es 60 s).
    - Antes del envío no hay cuenta regresiva de liberación (`deadline` es `null`): se muestra el plazo de despacho. Después del envío, `deadline` = `release_at` leído de `pp_guardian.purchase` (hora del ledger).
78. **IDs v2 sin tocar la `.env.local` de las rondas anteriores.**
    - `config.ts` usa por defecto `pp_guardian` v2 `CDKYF7OA…UOATOT` y `pp_arbiter` v2 `CDTEA424…TEVU5UA` (`contracts/deployments/testnet.json`).
    - Si `PP_GUARDIAN_ID` o `PP_ARBITER_ID` apuntan a los IDs de v1 (retirados para compras nuevas), se ignoran con un aviso en el log y se usa v2. Cualquier otro ID se respeta.
    - `npm run setup` ya escribe los IDs v2.
    - `/transparencia` lee los eventos de v1 (historial) y de v2, con un cursor nuevo (`events:cursor:v1v2`) para no saltarse los de v2.
79. **Devolución automática si el vendedor no despacha a tiempo.**
    - Condición: pedido pagado (o en reclamo) sin envío registrado y `now ≥ ship_deadline + 10 s` (margen sobre la hora del ledger).
    - La plataforma abre la disputa directo en el escrow con su rol `platform` de Trustless Work (`dispute_escrow`, ver H-6 y TW-1 en contracts) y llama `pp_arbiter.refund_unshipped`, que no pide firmas y valida en el contrato que no haya envío y que el plazo haya vencido. Los dos hashes quedan en la línea de tiempo.
    - **Cuándo corre:** cada vez que alguien consulta (página del pedido, panel del vendedor, panel del revisor y el feed del bot), como mucho cada 15 s y sin bloquear la respuesta. No hay un proceso aparte, igual que la ingesta de /transparencia (51). Con el bot o una página abierta, la devolución pasa en menos de un minuto.
    - **Estado nuevo `devuelto`** ("Devuelto (no se despachó)"), con `refunded_at`, `buyer_bps = 10000` y motivo "No despachó a tiempo". Si el comprador ya había abierto un reclamo y nada se despachó, también se devuelve: es el mismo resultado que la política da para "No envió".
    - Como en cualquier reembolso de Trustless Work, se cobran las comisiones (2% o el `platform_fee` del pedido, más 0,3%): el comprador recibe el total menos eso (DECISIONES 7). La pantalla muestra el reparto.
    - `POST /api/orders/:slug/refund-unshipped` hace lo mismo a pedido, sin firmas.
80. **"Necesito más tiempo" = `pp_guardian.extend`, una sola vez.**
    - Lo firma el comprador. `POST /api/orders/:slug/extend` (antes 501) devuelve la transacción armada y se envía por `/api/tx/submit`, como el resto.
    - Solo con el pedido "enviado", antes de `release_at`, sin reclamo y si no se usó antes. El servidor lo valida y el contrato también (`#27`, `#28`).
    - Al confirmarse, la app relee `release_at` del contrato. El botón desaparece y el vendedor ve "El comprador ya pidió más tiempo una vez".
81. **`auto_release` respeta la disputa en los dos lados.** Antes de llamarlo, la app lee el flag `disputed` real del escrow y, si hay reclamo, no lo intenta. El contrato también lo rechaza (`#20`). Sigue siendo un botón que cualquiera puede tocar al vencer la revisión ("Liberar ahora (plazo vencido)"), no un barrido automático. Pagar solo al vendedor es irreversible; devolver al comprador (79) es la dirección segura y por eso sí es automática.
82. **Envío por `pp_guardian.mark_shipped`.**
    - La evidencia on-chain sigue siendo `empresa|guía|peso|hash-foto` (65), recortada a 256 bytes (`MAX_EVIDENCE_LEN`). La copia del guardián es la que cuenta (D-17 de contracts).
    - El IMEI y los datos de entrega no van on-chain: se quedan en el servidor.
    - Ya no se escribe "enviado" directo en el escrow: en v2 eso no cuenta para `confirm`, `auto_release` ni `refund_unshipped`.
83. **API para el bot (APP-ENDPOINTS §6–§8 del bot).**
    - `POST /api/links` acepta `proteccion: "comprador" | "vendedor"` (igual a `feePayer`) y responde la vista pública del pedido.
    - `PATCH /api/links/:slug { sellerPubkey, proteccion }` cambia quién paga la protección mientras nadie empezó a pagar (409 si ya hay comprador o contrato).
    - La vista pública suma `proteccion` y `proteccion_bs_cents` (lo que la paga el comprador, o el 2,3% que regala el vendedor).
    - `/api/bot/changes` suma `code`, `deadline`, `ship_deadline`, `shipped_at` y `extended`.
    - `/api/info` → `capabilities: { extend, clockFromShipping, refundUnshipped, proteccionPatch }`.
84. **`npm run demo:reset` para v2.**
    - Borra pedidos, tiendas, transacciones, evidencias y pendientes de `data/pp.db`, y el estado del bot de la demo (`../bot/data/bot-state.json`).
    - Conserva la fábrica del escrow, los eventos on-chain y la lista de espera del piloto (son datos de personas).
    - Verifica que la app esté en modo guardián v2 y siembra 3 pedidos reales en testnet: liberado, resuelto 70/30 y devuelto por no despacho (este último corre en paralelo y tarda unos 2 minutos).
85. **Video y capturas v2** (`npm run demo:video`, `pago-protegido/demo/v2/`).
    - Guion de 6 escenas: bot → link, pago con la rampa simulada en pantalla, envío con empresa, guía e IMEI, pregunta obligatoria, cobro con link al registro público, y desvío del revisor rechazado por el contrato.
    - La compra con reclamo para la última escena se arma fuera de cámara, por API y con cuentas locales de un solo uso.
    - Los subtítulos también pasan por la lista de palabras prohibidas.
    - Se versionan el mp4, la lámina y las 6 capturas clave; los clips se regeneran.
