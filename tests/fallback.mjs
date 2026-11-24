import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve, url } from './browser-fixture.mjs';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  for (const fault of ['webgl', 'context', 'fps']) {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });
    await serve(context);
    if (fault === 'webgl') {
      await context.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return String(type).startsWith('webgl') ? null : original.call(this, type, ...args);
        };
      });
    }
    if (fault === 'fps') {
      await context.addInitScript(() => {
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (fn) => raf(() => setTimeout(() => fn(performance.now()), 65));
      });
    }
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (m) => { if (m.type() === 'error' && !(fault === 'context' && /context lost/i.test(m.text()))) errors.push(m.text()); });
    await page.goto(url);
    await page.getByRole('button', { name: 'Configuración' }).click();
    await page.getByLabel('Calidad gráfica').selectOption('low');
    await page.getByRole('button', { name: 'Volver' }).click();
    await page.getByRole('button', { name: 'Iniciar práctica' }).click();
    if (fault === 'context') {
      const canvas = page.locator('#cabin[data-quality=low]');
      await canvas.waitFor();
      await canvas.evaluate((el) => {
        const ext = el.getContext('webgl2')?.getExtension('WEBGL_lose_context');
        if (!ext) throw new Error('WEBGL_lose_context no está disponible');
        ext.loseContext();
      });
    }
    await page.locator('#cabin[data-quality=classic][data-fallback=' + fault + ']').waitFor({ timeout: 20_000 });
    await page.locator('.control:enabled').first().waitFor();
    assert.match(await page.locator('#stage-name').textContent(), /Despegue/);
    assert.ok(await page.locator('#cabin').evaluate((el) => el.getContext('2d') !== null));
    assert.deepEqual(errors, []);
    console.log('Respaldo 2D sin perder partida: ' + fault);
    await context.close();
  }
} finally { await browser.close(); }
