# Validación de Odisea 1A 2027

## Puertas de avance

| Etapa | Evidencia |
|---|---|
| 1 · Arquitectura | Se contrastaron CONFIG, reglas, perfil y créditos del HTML 2D con el pedido. Se fijaron los supuestos antes de crear código. |
| 2 · Simulación y red | `npm test`: bots, órdenes cruzadas, daños, manos, puntos, instantáneas, sanitización y cuatro clientes sobre Supabase simulado con 500 ms y 5 % de pérdida. `tests/stage2.mjs`: práctica, partida 2D entre pestañas y regreso al puesto tras recargar. |
| 3 · Despegue | `tests/stage3.mjs`: WebGL 2, estación, panel operativo y consola limpia; captura `test-results/gate3-despegue.png`. |
| 4 · Ruta completa | `tests/stage4.mjs`: ocho escenas distintas, tres presets, impacto, hiperimpulso y respaldo por rendimiento. `tests/fallback.mjs`: estado conservado al no tener WebGL, perder el contexto o bajar de 24 FPS. |
| 5 · Vestuario | `tests/stage5.mjs`: vista previa, colores, compras, persistencia, migración y modo clásico en 360×800. `tests/avatares-3d.mjs`: cuatro puestos, cuatro gestos y cambios de piezas visibles. El fixture Media con cuatro personajes usó 67 llamadas de dibujo y 41.720 triángulos. |
| 6 · Proyector | `tests/stage6.mjs`: cuatro partidas reales de la aplicación mediante red local entre pestañas; un contexto WebGL, cuatro tarjetas sin nombres, cinta ocultable y sin scroll en 1366×768 y 800×360. |
| 7 · Supabase | `tests/supabase-real.mjs --usar-legacy`: cuatro clientes, Presence, acción remota, `tablero`, toma de mando en **4.096 ms** y retorno del anfitrión anterior como tripulante. Se usó un canal efímero y perfiles ficticios. La demora y la pérdida controladas se comprobaron por separado con el transporte simulado. |
| 7 · Carga simulada | `tests/carga.mjs`: Chromium, caché desactivada, 4 Mb/s de bajada, 1 Mb/s de subida y 120 ms de latencia. Tres aperturas: **0,92–0,97 s** al inicio y **1,78–4,02 s** hasta el contexto 3D, contando el clic automatizado. |
| 7 · Matriz visual | 21 capturas, 7 tamaños × 3 calidades, sin errores de consola, sin desborde horizontal y con controles de 44 px o más. El heap JavaScript quedó entre **6,37 y 9,80 MiB**. `test-results/matriz/metricas.json` incluye cada tamaño, calidad, FPS, memoria y renderer. |
| 7 · Paquete | Build estático: **1.005.064 bytes**. Archivo Pages comprimido: **335.559 bytes**. El build funciona desde rutas relativas, conserva `.nojekyll` y no incluye credenciales del juego anterior. |

| Tamaño (px) | Alta, FPS | Media, FPS | Baja, FPS |
|---|---:|---:|---:|
| 360 × 800 | 8,7 | 38,9 | 60,3 |
| 800 × 360 | 9,0 | 37,7 | 60,8 |
| 412 × 915 | 7,0 | 30,8 | 60,3 |
| 915 × 412 | 5,9 | 30,4 | 60,7 |
| 1366 × 700 | 6,6 | 19,7 | 52,6 |
| 1366 × 768 | 5,9 | 17,2 | 47,8 |
| 1920 × 1080 | 2,8 | 13,0 | 46,0 |

Chromium de escritorio con SwiftShader renderiza WebGL por software. Las capturas fijan la calidad solicitada el tiempo justo para medir y capturar cada perfil; el respaldo automático se verificó aparte. Media sostuvo entre 30,4 y 38,9 FPS en los cuatro tamaños móviles emulados. En los tres tamaños de escritorio de este entorno, Baja superó 46 FPS o llegó a 46. Alta requiere aceleración por GPU. El heap de JavaScript y la estimación de una superficie RGBA8 no miden memoria total ni VRAM. Queda pendiente la prueba con iPhone y Android físicos y una conexión 4G de la jornada.

## Correcciones del 14/11/2026

- **Reloj del anfitrión:** cada pulso avanza el tiempo real transcurrido, con tope de 1,5 s. Con la pestaña anfitriona en segundo plano (un pulso por segundo) la partida ya no corre en cámara lenta. Test: `tests/network.test.ts`.
- **Reparto de pedidos:** dentro de una etapa cada persona le lee a distintos compañeros, las áreas en foco reciben más pedidos y casi no se repite el mismo control dos veces seguidas. Una persona puede tener hasta dos pedidos pendientes a la vez. Test: `tests/sim.test.ts`.
- **Proyector:** las ocho escenas se ubican a la misma distancia que en la cabina.
- **Detalles:** el código de sala se muestra en mayúscula y los nombres largos de los controles se cortan por sílabas.
- Las capturas y la tabla de FPS de arriba son anteriores a estos cambios.

## Avatar 05 (24/11/2026, revisión 2)

- `src/render/avatar.ts` reemplazado por la revisión 2 del modelo facetado (estilo 05). Misma API: `makePilot` y `crewSeats`; suma `inspectPilot` y `REFERENCE_AVATAR`.
- Parche en `src/render/cabin.ts`: en calidad Baja no se reemplazan los materiales del avatar.
- Se adaptaron los campos opcionales `custom` y `style`, que el vestuario todavía no guarda.
- 61.440 combinaciones (sentado y de pie) generadas sin errores ni valores inválidos. Peor caso: 1.435 triángulos, 5 mallas y 1 material.
- Pasan `npm test`, avatares-3d, stage2, stage4, stage5, stage6 y fallback.

## Versión completa con ajuste fino y pelo sin huecos (24/11/2026)

- Se combinó el paquete «Odisea-1A-2027-Completo» con las correcciones de la v1.1 (reloj del anfitrión, reparto de pedidos, proyector, código en mayúscula). El paquete partía de la v1.0.
- Pelo: el casquete envuelve el cráneo hasta la nuca; sin huecos en coronilla, nuca ni frente (`tests/avatar-cobertura.mjs`: 0 vértices afuera). Peor caso: 1.497 triángulos.
- Vestuario: ajuste fino de rasgos y colores en dos pestañas. `tests/stage5.mjs` se actualizó para abrir la pestaña Colores y medir solo los controles visibles.
- Pasan `npm test` (17), avatar-cobertura, avatares-3d, stage2, stage4, stage5, stage6 y fallback, y una partida completa de cuatro pestañas con proyector sin errores de consola.
- Los archivos `src/render/retro-*` no se usan en el juego y no suman peso al build.

## Proyector de seis partidas (24/11/2026)

- La pantalla en vivo muestra hasta 6 partidas: grilla de 3 × 2 en pantallas horizontales y de 2 × 3 en verticales. Pensado para una jornada de unas 20 personas en 5 grupos de 4.
- `tests/stage6.mjs` arma seis partidas simultáneas y controla la grilla sin scroll en 1366×768, 1920×1080, 800×360 y 412×915.

## Menos mensajes de Supabase para jornadas grandes (24/11/2026)

- Quien crea una sala envía el resumen al proyector por un canal solo de envío (API REST de Broadcast): ya no recibe los resúmenes de las demás salas. El resumen sale cada 2 s.
- Sin cambios en la partida, el estado se repite cada 2 s (antes 1 s). Para no confundir una pausa con una caída, el aviso de reconexión pasa a 3,5 s y la elección de nuevo anfitrión a 6,5 s.
- Medición simulada con salas de 4 que juegan y un proyector (cada envío cuenta 1 más 1 por receptor, como factura Supabase): 5 salas, de 73 a 27 mensajes por segundo; 10 salas, de 216 a 54. El plan gratis permite 100.
