import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = await build({
  stdin: {
    contents: `import { mountCabin } from './src/render/cabin.ts';
      import { mountAvatarPreview } from './src/render/preview.ts';
      import { cleanAvatar } from './src/config.ts';
      Object.assign(window, { mountCabin, mountAvatarPreview, cleanAvatar });`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
});
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  await mkdir('test-results/avatares', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 360 } });
  const faults = [];
  page.on('pageerror', (error) => faults.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') faults.push(message.text()); });
  await page.setContent('<style>body{margin:0;background:#12213a}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>');
  await page.addScriptTag({ content: fixture.outputFiles[0].text });
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    window.avatar = window.cleanAvatar({ pelo: 8, colorPelo: 6, piel: 3, gorro: 6, colorGorro: 1, ropa: 5,
      colorRopa: 4, acc: 5, colorAcc: 2, lentes: 3, colorLentes: 8, cara: 1, detalle: 6 });
    window.preview = window.mountAvatarPreview(canvas, window.avatar);
  });
  const custom = await page.screenshot({ path: 'test-results/avatares/vestuario.png' });
  await page.evaluate(() => window.preview.update(window.cleanAvatar({ pelo: 3, colorPelo: 3, piel: 2, cara: 4, ropa: 3, colorRopa: 5 })));
  assert.notDeepEqual(await page.screenshot(), custom);

  await page.evaluate(() => {
    window.preview.destroy();
    const canvas = document.createElement('canvas');
    document.body.replaceChildren(canvas);
    window.cabin = window.mountCabin(canvas, { quality: 'medium', view: 'fixed' });
    window.state = {
      stage: 0, fleet: 40, hull: 100, fires: 0, progress: .5,
      crew: [window.avatar, window.cleanAvatar({ pelo: 3, colorPelo: 2, colorRopa: 2, piel: 4, lentes: 7 }),
        window.cleanAvatar({ pelo: 4, piel: 2, gorro: 2, colorGorro: 6, colorRopa: 8 }),
        window.cleanAvatar({ pelo: 7, piel: 1, acc: 2, colorAcc: 4, colorRopa: 7 })],
    };
    window.cabin.render(window.state, 130);
  });
  const cabin = await page.screenshot({ path: 'test-results/avatares/cuatro-puestos.png' });
  const variations = [];
  for (const [i, kind] of ['ok', 'error', 'help', 'celebrate'].entries()) {
    await page.evaluate(({ i, kind }) => {
      // Usar la misma fase visible de animación, cambiando el gesto y asiento.
      window.state.effect = { id: i + 1, seat: i, kind };
      window.cabin.render(window.state, 1_000 + i * 800);
      window.cabin.render(window.state, 1_350 + i * 800);
    }, { i, kind });
    variations.push(await page.screenshot());
  }
  assert.equal(new Set([cabin, ...variations].map((frame) => frame.toString('base64'))).size, 5);
  const metrics = await page.evaluate(() => window.cabin.stats());
  assert.ok(metrics.calls < 100 && metrics.triangles < 150_000);
  assert.deepEqual(faults, []);
  console.log(JSON.stringify({ vistaPrevia: true, puestos: 4, gestos: variations.length, metricas: metrics }));
} finally {
  await browser.close();
}
