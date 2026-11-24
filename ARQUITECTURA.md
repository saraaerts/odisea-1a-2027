# Odisea 1A 2027 · arquitectura y criterios de entrega

La versión 3D vive en `odisea-3d/`. El `index.html` en la raíz es la versión 2D vigente: coincide con el archivo dentro de `Odisea-1A-2027.zip`. Queda intacto. Se extraen de ahí la configuración de áreas y etapas, el catálogo de avatar y el comportamiento de juego; la vista clásica integrada comparte la partida con el 3D. Una copia histórica separada sirve de referencia, con la conexión anterior desactivada.

## Supuestos y decisiones de paridad

| Tema | Decisión |
|---|---|
| Reglas | Flota simbólica de 40, corte en 32 y meta 40. No se usan registros de estudiantes. Casco en cero termina como «Nave rota», incluso con 32 naves o más. Las 8 etapas se completan con órdenes cumplidas; las vencidas se reemplazan. |
| Numeración | La fórmula usa el índice de etapa 0–7, como el 2D: sin ajuste son 10 s en Despegue y 5,8 s en Reinscripción. La pantalla numera 1–8. El objetivo por etapa queda fijo según la tripulación al arrancarla. |
| Cooperación | Hasta 4 por grupo; 3–4 recomendado, 2 permitido para ensayar, 1 con práctica local. Cada persona tiene su propio panel y recibe pedidos para otro puesto. Si se repite el área se asigna el control a una persona concreta. En práctica, los bots cubren los otros puestos. Tras el reparto inicial, cada pedido va a cualquier compañero con menos de dos pendientes; las áreas en foco de la etapa pesan el triple y no se repite enseguida el control recién resuelto. |
| Diferencias pedidas | Tres manos **por persona** por etapa (antes eran tres compartidas). Cada vencimiento prende un foco; se puede apagar, como en el 2D. Se respeta el ciclo de daño de 2 s de cada foco y el intervalo de 6 s entre etapas. Un dial o interruptor pedido admite posiciones intermedias sin sumar error. |
| Premios | Un solo premio local por partida grupal: 100 perfecta, 50 aprobada, 10 participación, 5 casco roto. El perfil importa cuando puede las claves locales de la versión anterior. Los perfiles se editan en el dispositivo; se transmiten alias y opciones del avatar, sin datos académicos. |
| Proyección | Código de jornada común, códigos de partida separados. La grilla muestra hasta cuatro partidas activas sin nombres, ordenadas en forma estable. Las tarjetas viejas se vencen y liberan su lugar. |

## Arquitectura

- TypeScript, Vite con rutas relativas y Three.js fijado. GitHub Pages publica la carpeta estática compilada. Supabase JS **2.45.4**, solamente Broadcast y Presence, sin base de datos de aplicación. Modo local con BroadcastChannel para pestañas del mismo navegador y servidor.
- `src/config.ts`: áreas, etapas, tipos de control y catálogo. `src/sim/`: simulación determinista sin DOM ni GPU, con reloj lógico, semilla y estado serializable; acciones con puesto, partida y etapa identificados. Reloj anfitrión a 200 ms. Las pruebas llaman la misma lógica desde Node.
- `src/net/`: contrato `room` con `join`, `emit`, `on`, `presence`, `peers`, `onPeers` y `leave`. `act` transporta acciones y secuencias; `st`, latidos y snapshots para retomar; `tablero`, resumen numérico independiente cada ~700 ms. Se descartan mensajes malformados o de 4 KiB en adelante; no se envían textos de órdenes, geometrías ni texturas. La UI arma los textos desde CONFIG.
- La migración usa presencia, reloj del último mensaje y elección determinista entre jugadores disponibles. Candidatura antes de los 6 s de silencio, nuevo epoch, revisiones crecientes y descarte de épocas viejas. Se retoma desde el último snapshot aceptado y se preservan manos, fuego, números de secuencia y reloj lógico. La reconexión se anuncia en el HUD; gracia de 800 ms, acciones tardías de menos de 5 s y repetidas de menos de 1,2 s no penalizan. Los reintentos de una misma acción son idempotentes.
- `src/ui/`: HUD HTML sobre la cabina, controles táctiles de 44 px o más, nombre y área, sala, puntos y personalización. `src/render/`: cabina y entornos locales, cámaras de escritorio/táctil, eventos de animación, calidad y desmontaje. `src/live/`: proyección sin scroll, con un contexto WebGL y hasta cuatro recortes del canvas; el texto se mantiene en HTML.
- La cabina se carga después del HUD. Si WebGL no está disponible, se pierde el contexto o Baja no sostiene 24 FPS, se pasa a la vista 2D clásica integrada en la misma sesión. Las muestras automáticas excluyen pestañas ocultas y tienen un calentamiento. El modo de movimiento reducido evita sacudidas y parpadeos; fuego intenso y audio se pueden apagar.

## Realismo y assets

El objetivo es una cabina creíble de nave industrial, con siluetas originales y una ruta reconocible. Los personajes son modulares y estilizados: piel, pelo, cara, ropa, gorros, lentes y accesorios por separado. Las luces y materiales sugieren volumen. Para celulares se aproxima el fuego y el humo con partículas y texturas procedurales; no se hace simulación volumétrica ni trazado de rayos. El negro del espacio y el contraste del panel tienen prioridad sobre el detalle de fondo.

| Calidad | Presupuesto visual |
|---|---|
| Alta | PBR, reflejos de entorno, sombras suaves, bloom, grano y más partículas. |
| Media | PBR básico, sombras acotadas, bloom liviano, DPR tope 1,25. Objetivo: hasta 100 llamadas de dibujo, 150.000 triángulos y 30 FPS en móvil de referencia. |
| Baja | Materiales sencillos, menos partículas, DPR tope 1, sin sombras ni postprocesado. La proyección usa una variante simplificada. |

Assets previstos: casco interior, parabrisas, paneles, consolas y cuatro asientos; nave de flota instanciada 40 veces; estación orbital, cinturón, agujero negro, tormenta, asteroides, nebulosa, planeta con anillos y portal; figura base, pelo, caras, uniformes, accesorios y lentes; chispas, humo, fuego, explosión y estelas; avisos sonoros y tipografía. Se prioriza geometría original y texturas procedurales. El arte que se agregue más adelante puede entrar como GLB Meshopt/Draco y WebP/KTX2, con atribuciones y licencias verificadas en `CREDITS.md`.

## Riesgos

| Riesgo | Mitigación y límite |
|---|---|
| Partición de red o celulares en segundo plano | Se elige entre clientes activos a partir de un snapshot; la mayoría de fallas de un host se recupera sin cobrar el intervalo de desconexión. Sin coordinador no se puede garantizar un solo host durante una partición total ni tomar el mando si se suspenden todas las pestañas. |
| Canales públicos y puntos locales | Se valida formato, tamaño, puesto y secuencias; el código de sala actúa como invitación, no como autenticación. Un cliente modificado puede manipular una sala o sus puntos. La actividad es colaborativa, sin datos sensibles ni ranking verificado. |
| Tráfico y cuotas | Presence para cambios infrecuentes, snapshots compactos y tablero independiente; medir 4 partidas en el proyecto Supabase de la jornada. |
| Tiempo, temperatura y GPU móvil | Validar en Safari iOS y Chrome Android físicos. La emulación comprueba composición y da métricas comparables en el host de pruebas; no certifica 4G, consumo de GPU ni temperatura. |
| Cambio de CONFIG | Grupo y proyector deben correr la misma compilación; versionar y distribuir una sola URL para la jornada. |
| Infraestructura | Hace falta un repositorio y un proyecto Supabase habilitado. El paquete no contiene claves privadas. El proyecto local conserva modo práctica y sala entre pestañas sin Supabase. |

## Gates

1. Contrastar fuente y diseño; cerrar los supuestos, la arquitectura y la lista de assets antes de escribir código.
2. Reglas Node con bots; simulación de red de cuatro clientes, 500 ms y 5 % de pérdida, caída y retorno del anfitrión; HTML jugable sin WebGL.
3. Validar cabina, avatar base, un control y Despegue.
4. Verificar ocho escenas, tres calidades, efectos, transición y respaldo.
5. Validar avatar modular, colores, persistencia y premios.
6. Validar cuatro partidas simultáneas en la grilla, resumen periódico y cinta ocultable.
7. Build estático, matriz Playwright (7 tamaños × 3 calidades, consola, FPS y memoria disponible), verificación del presupuesto y entrega para Pages. Los resultados físicos y Supabase real se registran por separado si no están disponibles.

Referencias: [Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Presence](https://supabase.com/docs/guides/realtime/presence), [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer), [fuentes de publicación de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
