# Odisea 1A 2027

Leé [ARQUITECTURA.md](ARQUITECTURA.md) antes de cambiar reglas o contratos. Escribí textos del juego y documentación en español rioplatense (voseo). El `index.html` del directorio padre es la fuente histórica 2D y queda intacto.

- Usá `src/config.ts` para editar áreas, etapas y controles. Mantené la simulación libre de DOM, Three.js y red.
- Los puestos y órdenes tienen identidad propia. En grupo, las órdenes de una persona siempre apuntan a otro puesto. Mantené los controles en HTML y respetá tamaños táctiles y preferencias de movimiento.
- `room` abstrae Supabase Broadcast/Presence y la red de pestañas. Respetá el límite de 4 KiB, el protocolo, la validación y la migración por epoch. La vista 2D y la cabina 3D comparten la misma partida.
- No guardes datos reales de estudiantes. No pegues claves privadas ni claves `service_role`. El sitio estático acepta la URL y clave pública anon por variables de Vite.
- Mantené versiones fijadas, arte original o con licencia libre declarada y rutas relativas para Pages.
- Corré `npm test` y `npm run build`. Para cambios en UI o 3D corré también la prueba Playwright pertinente. No atribuyas a un emulador resultados de GPU, memoria o red de un teléfono físico.
