import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// El fixture carga el mismo renderer en un documento aislado. La app publicada no expone esta entrada.
const fixture = await build({
  stdin: {
    contents: "import { mountCabin } from './src/render/cabin.ts'; window.mountCabin = mountCabin;",
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
const faults = [];
try {
  await mkdir('test-results/etapas', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (error) => faults.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') faults.push(message.text()); });
  await page.setContent('<style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>');
  await page.addScriptTag({ content: fixture.outputFiles[0].text });
  await page.evaluate(() => {
    window.canvas = document.querySelector('canvas');
    window.cabin = window.mountCabin(window.canvas, { quality: 'medium', view: 'first', reduced: true });
    window.frame = { stage: 0, fleet: 40, hull: 100, fires: 0, phase: 'play', progress: .65 };
  });

  const scenes = [];
  for (let stage = 0; stage < 8; stage++) {
    await page.evaluate((stage) => {
      window.frame.stage = stage;
      window.cabin.render(window.frame, 100 + stage * 110);
    }, stage);
    scenes.push(await page.screenshot({ path: `test-results/etapas/etapa-${stage + 1}.png` }));
  }
  assert.equal(new Set(scenes.map((image) => image.toString('base64'))).size, 8);

  const metrics = [];
  for (const quality of ['high', 'medium', 'low']) {
    const stats = await page.evaluate((quality) => {
      window.cabin.configure({ quality });
      window.cabin.render(window.frame, 1050);
      return window.cabin.stats();
    }, quality);
    assert.equal(stats.quality, quality);
    assert.ok(stats.triangles > 1000);
    metrics.push(stats);
  }
  assert.ok(metrics[0].textures > metrics[2].textures);
  assert.ok(metrics[1].calls < 100 && metrics[1].triangles < 150_000);

  const damaged = { stage: 1, fleet: 37, hull: 60, fires: 3, phase: 'between', progress: .48 };
  await page.evaluate((damaged) => {
    window.cabin.configure({ quality: 'medium', reduced: false, intense: true });
    window.cabin.render(damaged, 1800);
    window.cabin.render(damaged, 2090);
  }, damaged);
  const action = await page.screenshot({ path: 'test-results/etapas/impacto-e-hiperimpulso.png' });
  await page.evaluate((damaged) => {
    window.cabin.configure({ reduced: true, intense: false });
    window.cabin.render(damaged, 2120);
  }, damaged);
  const reduced = await page.screenshot();
  await page.evaluate((damaged) => window.cabin.render(damaged, 2280), damaged);
  assert.notDeepEqual(action, reduced);
  assert.deepEqual(await page.screenshot(), reduced);

  const fallback = await page.evaluate(() => {
    window.cabin.destroy();
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const reasons = [];
    const cabin = window.mountCabin(canvas, { quality: 'low', reduced: true, onFallback: (reason) => reasons.push(reason) });
    for (let now = 100; now < 13_000; now += 610) cabin.render(window.frame, now);
    cabin.destroy();
    return reasons;
  });
  assert.deepEqual(fallback, ['fps']);
  assert.deepEqual(faults, []);
  console.log(JSON.stringify({ escenas: scenes.length, perfiles: metrics, respaldoConMenosDe2Fps: fallback[0] }));
} finally {
  await browser.close();
}
