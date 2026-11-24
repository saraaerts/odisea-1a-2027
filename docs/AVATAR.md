# Avatar 05 · Pelo y nuca

El [avatar integrado](../src/render/avatar.ts) usa las siete filas y los diez lados del cráneo como base. El casquete recorta las mismas facetas que forman la cabeza, las desplaza hacia afuera y cierra la coronilla. La línea trasera queda alrededor de −0,160, con un margen de 0,003 en el borde del casquete. Frente y patillas conservan su forma. Rapado usa un casquete de 0,008 de espesor radial nominal, con una elevación de 0,0072 en la tapa.

Rulos y Afro conservan los bloques facetados sobre una base continua. Bajo un gorro se mantienen las reglas de ajuste. El Casco espacial reemplaza el peinado por un forro mate del color del casco. La parte superior de la carcasa tiene espacio para ese forro y la abertura del visor conserva su forma.

La revisión usa la misma API, poses, catálogo y caché del archivo adjunto. El casquete se fusiona con el mismo material opaco del avatar. El visor transparente sigue usando el material especial de la revisión 2.

## Triángulos por peinado

Cada fila indica el máximo por modo. La columna Casco cuenta el forro. Los triángulos de la carcasa se contabilizan aparte.

| Índice | Peinado | Libre | Ajustado | Casco |
| ---: | --- | ---: | ---: | ---: |
| 0 | Corto | 160 | 120 | 120 |
| 1 | Flequillo | 160 | 140 | 120 |
| 2 | Largo | 200 | 180 | 120 |
| 3 | Rulos | 340 | 240 | 120 |
| 4 | Rodete | 160 | 140 | 120 |
| 5 | Rapado | 120 | 120 | 120 |
| 6 | Afro | 340 | 240 | 120 |
| 7 | Coleta | 180 | 160 | 120 |
| 8 | Melena | 200 | 180 | 120 |
| 9 | Cresta | 220 | 160 | 120 |

El peor caso medido suma **1.497 / 2.000 triángulos**, con Rulos, Sonrisa, Barba, Traje espacial, Auriculares y lentes De sol, en posición sentada. El desglose es 245 de cabeza, 260 de pelo, 552 de uniforme, 216 de auriculares y 224 de lentes. La cabeza con pelo alcanza **585 / 700 triángulos**. El cálculo recorrió 14.080 combinaciones de equipo y postura con las variantes de cara y ropa de mayor costo.

## Vértices del cráneo afuera

| Peinado | Libre | Ajustado | Casco |
| --- | ---: | ---: | ---: |
| Corto | 0 | 0 | 0 |
| Flequillo | 0 | 0 | 0 |
| Largo | 0 | 0 | 0 |
| Rulos | 0 | 0 | 0 |
| Rodete | 0 | 0 | 0 |
| Rapado | 0 | 0 | 0 |
| Afro | 0 | 0 | 0 |
| Coleta | 0 | 0 | 0 |
| Melena | 0 | 0 | 0 |
| Cresta | 0 | 0 | 0 |

La prueba lanza rayos hacia los vértices de la malla real por encima de la línea del pelo. Comprueba que la superficie exterior del casquete o la unión de casco y forro aparezca por delante de la piel. Incluye nueve combinaciones de mandíbula y pómulos, aros, auriculares y todos los gorros. Resultado en 2.160 configuraciones: **0 de 75.600 vértices afuera** y **0 de 4.700.160 puntos adicionales afuera** en facetas, coronilla y cerca de la línea de nacimiento. También verifica que el casquete cierre sus aristas.

Las [vistas de Corto a Rodete](capturas-avatar/peinados-1.png) y [de Rapado a Cresta](capturas-avatar/peinados-6.png) muestran frente, nuca, perfil y coronilla. La [lámina con equipo](capturas-avatar/equipamiento.png) incluye gorra, boina, auriculares y casco con visor. En Playwright también se probó cambiar y girar el avatar en el [vestuario](capturas-avatar/vestuario-rulos.png) y abrir la [cabina](capturas-avatar/cabina.png) a 412 × 915, sin errores de consola. Las capturas corresponden a un navegador de escritorio con ventana emulada.

## Repetí las pruebas

Instalá las dependencias con `npm ci`. Corré `npm test` y `npm run build`. Para ejecutar las capturas, instalá Chromium con `npx playwright install chromium` o configurá `CHROME_PATH` con tu navegador.

```sh
node tests/avatar-cobertura.mjs
node tests/avatar-capturas.mjs
```

El detalle por configuración está en [mediciones.json](mediciones.json). Para levantar el proyecto o conectar las partidas entre dispositivos, seguí el [README](../README.md).

