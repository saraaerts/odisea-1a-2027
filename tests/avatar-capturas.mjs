import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { serve, url } from './browser-fixture.mjs';

const root = resolve('test-results/avatar-nuca');
const fixture = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
      import * as T from 'three';
      import { AVATAR_OPTIONS, cleanAvatar } from './src/config.ts';
      import { makePilot, REFERENCE_AVATAR } from './src/render/avatar.ts';
      import { release } from './src/render/model.ts';

      const size = 320;
      const background = '#0a1226';
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(size, size, false);
      renderer.setClearColor(background);
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      const camera = new T.OrthographicCamera(-.36, .36, .36, -.36, .1, 20);
      const scene = new T.Scene();
      const front = new T.DirectionalLight('#ffe8d4', 2.1);
      front.position.set(-3, 5, -4);
      const back = new T.DirectionalLight('#edf1ff', 1.7);
      back.position.set(3, 3, 4);
      scene.add(new T.HemisphereLight('#d9e6ff', '#795e51', 1.7), front, back);
      const directions = {
        frente: [0, 0, -3], nuca: [0, 0, 3], perfil: [3, 0, 0], arriba: [0, 3, 0],
      };
      const labels = { frente: 'Frente', nuca: 'Nuca', perfil: 'Perfil', arriba: 'Arriba' };
      const asPNG = canvas => canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);

      function capture(label, selections) {
        const sheet = document.createElement('canvas');
        const head = 48;
        const band = 22;
        sheet.width = size * Object.keys(directions).length;
        sheet.height = head + selections.length * (size + band);
        const ctx = sheet.getContext('2d');
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, sheet.width, sheet.height);
        ctx.font = 'bold 21px sans-serif';
        ctx.fillStyle = '#eeeff9';
        ctx.fillText(label, 16, 30);
        const captures = [];
        for (const [row, selection] of selections.entries()) {
          const avatar = cleanAvatar({ ...REFERENCE_AVATAR, acc: 0, lentes: 0, ...selection.avatar });
          const pilot = makePilot(0, avatar, { seated: false });
          pilot.object.position.set(0, 0, 0);
          pilot.object.rotation.y = 0;
          scene.add(pilot.object);
          try {
            // Pasá por la pose normal y enderezá el giro de reposo del retrato.
            pilot.pose(0, 0, true);
            const torso = pilot.object.children.find(group => group.position.y === .22);
            const headGroup = torso?.children.find(group => group.isGroup && group.position.y > .55);
            if (headGroup) headGroup.rotation.set(0, 0, 0);
            if (torso) torso.rotation.set(0, 0, 0);
            const origin = new T.Vector3(0, .934, -.047);
            for (const [column, [view, position]] of Object.entries(directions).entries()) {
              camera.position.copy(origin).add(new T.Vector3(...position));
              camera.up.set(0, view === 'arriba' ? 0 : 1, view === 'arriba' ? 1 : 0);
              camera.lookAt(origin);
              renderer.render(scene, camera);
              if (renderer.info.render.triangles <= 0 || renderer.info.render.triangles > 2_000) {
                throw new Error('Presupuesto excedido en ' + selection.name + ', ' + view);
              }
              if (renderer.info.memory.textures !== 0) throw new Error('Se detectaron texturas del avatar');
              const x = column * size, y = head + row * (size + band);
              ctx.drawImage(renderer.domElement, x, y);
              ctx.strokeStyle = '#25405a';
              ctx.strokeRect(x + .5, y + .5, size - 1, size + band - 1);
              ctx.fillStyle = '#e2eafa';
              ctx.font = '16px sans-serif';
              ctx.fillText(selection.name + ' · ' + labels[view], x + 9, y + size + 15, size - 18);
              captures.push({ key: selection.key, view, image: asPNG(renderer.domElement) });
            }
          } finally {
            scene.remove(pilot.object);
            release(pilot.object);
          }
        }
        return { sheet: asPNG(sheet), captures };
      }

      window.captureHair = capture;
      window.hairCatalog = AVATAR_OPTIONS.pelo;
    `,
  },
  bundle: true,
  write: false,
});

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
function checkErrors(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}

try {
  await mkdir(root, { recursive: true });
  const page = await browser.newPage();
  checkErrors(page);
  await page.addScriptTag({ content: fixture.outputFiles[0].text });
  const catalog = await page.evaluate(() => window.hairCatalog);
  assert.equal(catalog.length, 10);
  const shots = [];

  async function saveSheet(title, file, selections) {
    const result = await page.evaluate(({ title, selections }) => window.captureHair(title, selections), { title, selections });
    await writeFile(resolve(root, file + '.png'), Buffer.from(result.sheet, 'base64'));
    for (const { key, view, image } of result.captures) {
      await mkdir(resolve(root, key), { recursive: true });
      await writeFile(resolve(root, key, view + '.png'), Buffer.from(image, 'base64'));
      shots.push(key + '/' + view);
    }
  }

  for (const start of [0, 5]) {
    const selections = catalog.slice(start, start + 5).map((name, index) => ({
      key: 'pelo-' + (start + index), name, avatar: { pelo: start + index, gorro: 0 },
    }));
    await saveSheet('Peinados ' + (start + 1) + ' a ' + (start + 5), 'peinados-' + (start + 1), selections);
  }
  assert.equal(shots.length, 40);
  await saveSheet('Peinados con equipamiento', 'equipamiento', [
    { key: 'rapado-gorra', name: 'Rapado con gorra', avatar: { pelo: 5, gorro: 2, acc: 2 } },
    { key: 'rodete-boina', name: 'Rodete con boina', avatar: { pelo: 4, gorro: 4, acc: 1 } },
    { key: 'afro-auriculares', name: 'Afro con auriculares', avatar: { pelo: 6, acc: 2 } },
    { key: 'rulos-auriculares', name: 'Rulos con auriculares', avatar: { pelo: 3, acc: 2 } },
    { key: 'casco', name: 'Casco con visor', avatar: { pelo: 9, gorro: 6, lentes: 10 } },
  ]);
  await page.close();

  const viewport = { width: 412, height: 915 };
  const context = await browser.newContext({ viewport, screen: viewport, isMobile: true, hasTouch: true,
    deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await serve(context);
  const app = await context.newPage();
  checkErrors(app);
  await app.goto(url);
  await app.evaluate(() => {
    localStorage.setItem('odisea-3d-perfil', JSON.stringify({ name: 'Luz', area: 'ri',
      avatar: { pelo: 5, piel: 2, colorPelo: 1, ropa: 4, colorRopa: 3, lentes: 1, acc: 2 } }));
    localStorage.setItem('odisea-3d-puntos', JSON.stringify({ points: 80, paid: [], owned: ['acc:2'] }));
    localStorage.setItem('odisea-3d-config', JSON.stringify({ quality: 'low', motion: false, muted: true }));
  });
  await app.goto(new URL('?vista=vestuario', url).href);
  const avatar = app.locator('.wardrobe-canvas');
  await avatar.waitFor({ state: 'visible' });
  const before = await avatar.screenshot({ path: resolve(root, 'vestuario-rapado.png') });
  const rulos = app.locator('[data-wardrobe-piece="pelo"][data-wardrobe-index="3"]');
  await rulos.click();
  assert.equal(await rulos.getAttribute('data-equipped'), 'true');
  const after = await avatar.screenshot({ path: resolve(root, 'vestuario-rulos.png') });
  assert.notDeepEqual(before, after, 'El cambio de peinado se dibuja en el vestuario');
  await app.getByRole('button', { name: 'Girar a la derecha' }).click();
  assert.notDeepEqual(await avatar.screenshot(), after, 'El giro cambia la vista');
  await app.getByRole('button', { name: 'Probar en cabina', exact: true }).click();
  const cabin = app.locator('#cabin[data-quality="low"]');
  await cabin.waitFor({ state: 'visible' });
  await cabin.screenshot({ path: resolve(root, 'cabina.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ peinados: catalog.length, capturas: shots.length,
    vestuario: true, cabina: true, errores: errors.length, carpeta: root }));
} finally { await browser.close(); }
