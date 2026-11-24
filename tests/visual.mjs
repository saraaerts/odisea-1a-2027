import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve, url } from './browser-fixture.mjs';

const sizes = [[360, 800], [800, 360], [412, 915], [915, 412], [1366, 700], [1366, 768], [1920, 1080]];
const qualities = ['high', 'medium', 'low'];
const results = [];
const faults = [];
const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
await mkdir('test-results/matriz', { recursive: true });
try {
  for (const [width, height] of sizes) {
    const touch = Math.min(width, height) < 500;
    for (const requested of qualities) {
      const context = await browser.newContext({ viewport: { width, height }, screen: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
      await serve(context);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => { if (e.type() === 'error') errors.push(e.text()); });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      const id = width + 'x' + height + '-' + requested;
      const row = { width, height, requested, touch, errors: [] };
      try {
        await context.addInitScript(() => {
          const nativeSetInterval = window.setInterval.bind(window), nativeClearInterval = window.clearInterval.bind(window);
          // Adelantá la cuenta regresiva inicial para medir el preset antes de su respaldo automático.
          window.setInterval = (fn, delay, ...args) => {
            if (delay !== 200 || typeof fn !== 'function') return nativeSetInterval(fn, delay, ...args);
            let count = 0;
            const timer = nativeSetInterval(() => {
              const now = performance.now(), oldNow = performance.now;
              const accelerated = now + ++count * 400;
              Object.defineProperty(performance, 'now', { configurable: true, value: () => accelerated });
              try { fn(...args); } finally { Object.defineProperty(performance, 'now', { configurable: true, value: oldNow }); }
              if (count >= 16) nativeClearInterval(timer);
            }, 24);
            return timer;
          };
        });
        await page.goto(url, { waitUntil: 'load' });
        await page.getByRole('button', { name: 'Configuración' }).click();
        await page.getByLabel('Calidad gráfica').selectOption(requested);
        await page.getByRole('button', { name: 'Volver' }).click();
        const start = performance.now();
        await page.getByRole('button', { name: 'Iniciar práctica' }).click();
        const canvas = page.locator('#cabin[data-quality="' + requested + '"]');
        await canvas.waitFor({ timeout: 7000 });
        await page.locator('.control:enabled').first().waitFor({ timeout: 7000 });
        const measured = await canvas.evaluate(async (el) => {
          const gl = el.getContext('webgl2');
          if (!gl) throw new Error('No se creó WebGL 2');
          const info = gl.getExtension('WEBGL_debug_renderer_info');
          const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
          const start = performance.now();
          let frames = 0;
          await new Promise((done) => {
            const sample = (now) => {
              frames++;
              if (now - start >= 1250) done();
              else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          });
          const nav = performance.getEntriesByType('navigation')[0];
          return {
            renderer, fps: Number((frames * 1000 / (performance.now() - start)).toFixed(1)),
            frames, canvasWidth: el.width, canvasHeight: el.height,
            active: el.dataset.quality,
            loadMs: Math.round(nav?.loadEventEnd ?? 0),
            gameWidth: document.querySelector('#game').scrollWidth,
            touchTarget: Math.min(...Array.from(document.querySelectorAll('.control'), (b) => Math.min(b.clientWidth + 2, b.clientHeight + 2))),
          };
        });
        Object.assign(row, measured);
        row.cabinReadyAndSampleMs = Math.round(performance.now() - start);
        assert.equal(measured.active, requested);
        assert.ok(measured.gameWidth <= width + 1, 'desborde horizontal');
        assert.ok(measured.touchTarget >= 44, 'un control mide menos de 44 px');
        await page.screenshot({ path: 'test-results/matriz/' + id + '.png', animations: 'disabled', timeout: 12000 });
        const { metrics } = await cdp.send('Performance.getMetrics');
        const find = (name) => metrics.find((entry) => entry.name === name)?.value;
        row.jsHeapMiB = Number(((find('JSHeapUsedSize') ?? 0) / 1048576).toFixed(2));
        row.domNodes = find('Nodes');
        row.framebufferRGBA8MiB = Number((measured.canvasWidth * measured.canvasHeight * 4 / 1048576).toFixed(2));
        row.afterScreenshot = await page.locator('#cabin').getAttribute('data-quality');
        assert.equal(row.afterScreenshot, requested, 'cambió la calidad durante la captura');
        assert.deepEqual(errors, []);
        console.log(id + ': ' + row.fps + ' FPS, heap JS ' + row.jsHeapMiB + ' MiB');
      } catch (error) {
        faults.push(id + ': ' + error.message);
        row.failure = error.message;
      }
      row.errors = errors.slice();
      results.push(row);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile('test-results/matriz/metricas.json', JSON.stringify({ notes: 'Chromium SwiftShader. FPS de requestAnimationFrame; heap JS vía CDP. La estimación RGBA8 cubre un buffer de color, sin profundidad, post, VRAM total ni memoria de sistema. Carga desde fixture local, no 4G.', results, faults }, null, 2) + '\n');
}
assert.deepEqual(faults, []);
