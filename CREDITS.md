# Créditos y licencias

- Diseño, controles, narrativa y dibujo clásico: versión 2D de **Odisea 1A 2027**, aportada en el proyecto. Uso como continuación de ese material.
- Cabina, naves, entornos, personajes, icono, efectos y tonos: geometría, gráficos y audio procedurales originales, creados para esta versión. No se incluyeron modelos comerciales, personajes de franquicias ni grabaciones de terceros.
- Piloto 02. Atlas de color y relieve preparado para Odisea a partir de un retrato original generado con ImageGen tomando como referencia el boceto del 02. La profundidad se estimó en la preparación con MediaPipe y la malla se construye en el juego. El resultado está en [retro-portrait-data.ts](src/render/retro-portrait-data.ts).
- Rulos del piloto 02. Las guías, la geometría y las hebras de la silueta se construyen en el juego. La textura de las fibras se generó con ImageGen a partir del boceto 02 y se normalizó para aplicar tintes. [Textura de fibras](src/render/retro-hair-texture.ts).

<details>
<summary>Prompt del retrato que se usó para el atlas</summary>

> Use case: photorealistic-natural. Supporting image is a 10-panel reference sheet. Use ONLY character 02, second panel in the top row, as the exact fictional identity reference. Generate one square 1024x1024 neutral facial texture source portrait, with completely straight-on symmetric frontal orthographic view of her head with zero yaw, pitch or roll, camera at eye level and gazing straight at the lens, whole head, chin and ears in frame. For the portrait remove glasses, headphones, clothing in frame and hold hair tightly back behind the ears and forehead so that all facial skin and jaw contours are fully visible from forehead down. Keep her exact recognizable natural adult feminine features and proportions from panel 02: softly broad rounded jaw and gently squared chin, round cheekbones, almond deep brown eyes and defined eyelids, broad dark espresso natural eyebrows, medium slender natural nose with a round tip, warm medium olive caramel skin with irregular pale brown freckles on cheeks and nose, distinct softly full warm rose brown closed lips with a very subtle confident smile. Match features and face shape of 02; no extra glam styling. Image should resemble a flat evenly lit high resolution albedo source for a game model based on a real face, with authentic subtle pore and skin color detail, broad shadowless neutral softbox all around and no directional highlights or shadows. Plain medium gray background. High sharpness. No retouching, illustration, text, graphic seam, cosmetic sheen, glasses, microphone or headgear. Fill square with her face centered, ears in frame, no shoulders. The skin texture atlas will be made from this photograph, so eyes, brows, nose and mouth must be clearly resolved.

</details>

<details>
<summary>Prompt de la textura de fibras</summary>

> Use case: photorealistic-natural. Texture source for 3D video game hair, using only the brown hair of character 02 (top row, second panel) from the reference image. Generate a macro swatch of the fiber pattern, full bleed as an orthographic closeup of a continuous soft dense surface of many hundreds of fine dark chestnut hair strands, with small irregular naturally separated overlapping fibers and subclumps. Strands flow mostly vertically down the square with slightly wavy longitudinal direction. Texture is flat over the entire image, filling every edge, meant to wrap and bend around our own 3D curled volume. No single isolated lock, no face, no scalp, no giant loops or diagonal streaks, no hair part, no foreground/background boundary, no frizz too large, no text. Hair root-to-tip direction equals top to bottom. Show dark brown lowlights and soft chestnut glints just like the fine fibers in 02, with softly diffused even overhead light, no hotspot or large scale brightness gradient, no contrasty dark shadows or reflections from environment. Medium-to-low contrast, tiny strands with irregular visible length, natural hair fiber detail, non-plastic, dry, real. The whole square should look as if it can tile, with the continuous very dense hair strand pattern covering it completely and the various fine strands kept sharp.

</details>

- [Poppins](https://github.com/itfoundry/Poppins), Indian Type Foundry, SIL Open Font License 1.1; distribución mediante Fontsource. Véase [licencia adjunta](public/licencias/Poppins-OFL.txt).
- [Three.js](https://github.com/mrdoob/three.js/tree/r170), licencia MIT. [Supabase JS](https://github.com/supabase/supabase-js/tree/v2.45.4), licencia MIT. Sus avisos se incluyen con las dependencias y se conservan en la distribución.

Si sumás GLB, sonidos o texturas, registrá título, autoría, URL, licencia y cambios. Para arte externo usá CC0 o CC BY.
