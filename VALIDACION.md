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
