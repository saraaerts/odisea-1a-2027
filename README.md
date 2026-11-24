# Odisea 1A 2027

Juego cooperativo para Academia de Teclab. Cada persona ocupa un puesto y recibe órdenes para el panel de otra. Lean las órdenes en voz alta y traten de llegar a la última estación con al menos 18 de las 40 naves (43 % de permanencia). La meta es que lleguen todas. Las naves son simbólicas; usá apodos y no ingreses datos de estudiantes.

## Probalo en tu compu

Instalá Node.js 22.18 o posterior. Abrí una terminal en esta carpeta:

```sh
npm ci
npm run dev
```

Abrí la URL que imprime Vite. **Iniciar práctica** funciona con bots. **Jugar en equipo** funciona entre pestañas del mismo navegador y origen hasta que configures Supabase. Para una partida real, 3–4 personas entran con el mismo código de sala. Cada grupo crea su propia sala; todos usan el mismo código de jornada para **Pantalla en vivo**. No hace falta elegir equipos por área. Para ensayar, podés despegar con dos personas.

Entrá a **Vestuario → Ajuste fino** para cambiar mandíbula, pómulos, ojos, cejas, nariz y labios, o elegir colores propios de piel, pelo, ropa, gorros, accesorios y lentes. Podés girar la vista 3D y tocar **Probar en cabina** para practicar con tu avatar. Los ajustes se guardan en el dispositivo y aparecen cuando entrás a una partida. Para abrir directamente Ajuste fino, agregá `?vista=vestuario&modo=ajuste` a la URL del juego.

Podés cambiar la calidad en **Configuración**. En Automática, el juego baja de preset según la fluidez; si sigue por debajo de 24 FPS, o si falla WebGL, pasa a 2D con las mismas órdenes, daños y manos. Si elegís un preset fijo que no sostiene 24 FPS, también entra el respaldo. La copia histórica está en [legacy/index.html](public/legacy/index.html); su antigua conexión está desactivada.

## Conectá Supabase

1. Abrí un proyecto de Supabase de la persona responsable de la actividad. En Realtime permití canales públicos: esta versión usa **Broadcast** y **Presence** públicos, con una invitación por código de sala. No se crean tablas ni se almacena una nómina.
2. Copiá `.env.example` a `.env.local`. Poné la URL del proyecto y la clave pública `anon` (o `publishable`) en `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Esas variables llegan al navegador. La compilación rechaza claves que no sean públicas.
3. Reiniciá Vite. Creá una sala y entrá desde otro dispositivo. Probá también la proyección con un código de jornada distinto del que vas a usar el día de la actividad.

Los canales no autentican a cada tripulante; cualquier participante con acceso al proyecto y el código puede conectarse. Usá códigos de jornada distintos para actividades separadas, no compartas públicamente los códigos de sala y revisá las cuotas de Realtime con la carga prevista. Si todas las pestañas quedan suspendidas o aisladas, la partida puede quedar en pausa hasta que vuelva alguien con un estado válido.

## Desplegá en GitHub Pages

1. Creá un repositorio dedicado bajo la cuenta de la persona responsable. Subí el **contenido de esta carpeta** a la raíz del repositorio; no hace falta subir el directorio padre, sus ZIP ni el archivo Excel.
2. En **Settings → Pages → Build and deployment**, elegí **GitHub Actions**. En **Settings → Secrets and variables → Actions → Variables**, creá las dos variables públicas de Supabase si querés multijugador entre dispositivos.
3. Hacé push a `main` o ejecutá **Publicar Odisea en GitHub Pages** desde Actions. Abrí la URL del entorno `github-pages`. Las rutas de Vite son relativas para funcionar bajo `usuario.github.io/repositorio/`.

También podés generar la carpeta estática con `npm run build` y servir `dist/` en cualquier hosting estático. Si publicás desde una rama con Jekyll, conservá `dist/.nojekyll`. No está desplegado por esta entrega.

## Pruebas y edición

```sh
npm test
npm run build
npx playwright install chromium
npm run test:visual
```

Podés apuntar `CHROME_PATH` al Chrome que ya tenés instalado. La suite visual sirve el build con Playwright por defecto; si preferís un servidor local, poné su URL en `ODISEA_TEST_URL`. Las capturas y métricas quedan en `test-results/`. Para editar áreas, textos o controles, empezá por `src/config.ts`. Mantené sincronizada la versión del juego entre los grupos y el proyector. Consultá [validación](VALIDACION.md) para ver el alcance de cada prueba.

Para pruebas puntuales, corré `npm run test:2d`, `npm run test:respaldo`, `node tests/stage6.mjs` o `node tests/carga.mjs` después de compilar. Con un proyecto Supabase configurado, `node --env-file=.env.local tests/supabase-real.mjs` prueba una partida efímera de cuatro puestos y la toma de mando.

## Lo que queda para la jornada

- Definí quién será dueño del repo y del proyecto de Supabase, y probá la red con cuatro grupos y el proyector. La recuperación ante una partición total no tiene garantía de consenso sin servidor coordinador.
- Validá 30 FPS en Media, temperatura, memoria y primera carga en 4G con un Android de gama media y un iPhone reales. Un navegador emulado sirve para revisar tamaños y detectar errores, pero no reemplaza esos equipos.
- Confirmá los nombres y controles de cada área y el uso de marca. La base del 34 % y la mejora de 9 puntos (objetivo 43 %) pertenecen a la metáfora del juego; cualquier cifra institucional real se valida por fuera y no se guarda acá.
- Si querés más realismo, priorizá GLB comprimidos y texturas KTX2/WebP con licencias verificadas. El fuego y los personajes actuales apuntan a una buena lectura en celular, con un presupuesto pequeño.

Más detalles: [arquitectura y riesgos](ARQUITECTURA.md), [créditos](CREDITS.md) y [contexto del proyecto](AGENTS.md). Referencias oficiales: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Supabase Presence](https://supabase.com/docs/guides/realtime/presence).
