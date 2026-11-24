import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve, url } from './browser-fixture.mjs';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const faults = [];
const context = await browser.newContext({ viewport: { width: 1000, height: 640 } });
await serve(context);
const page = await context.newPage();
page.on('pageerror', (e) => faults.push(e.message));
page.on('console', (e) => { if (e.type() === 'error') faults.push(e.text()); });
try {
  await page.goto(url);
  await page.getByRole('button', { name: 'Configuración' }).click();
  await page.getByLabel('Calidad gráfica').selectOption('low');
  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByRole('button', { name: 'Iniciar práctica' }).click();
  await page.locator('#cabin[data-quality=low]').waitFor();
  const gl = await page.locator('#cabin').evaluate((c) => !!c.getContext('webgl2'));
  assert.equal(gl, true);
  assert.match(await page.locator('#stage-name').textContent(), /Despegue/);
  const control = page.locator('.control:enabled').first();
  await control.waitFor();
  const before = await page.locator('#cabin').screenshot();
  await control.click();
  const after = await page.locator('#cabin').screenshot();
  assert.notDeepEqual(after, before);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/gate3-despegue.png' });
  assert.deepEqual(faults, []);
  console.log('Despegue 3D: contexto WebGL 2, vista de cabina y control de HTML activo, sin errores.');
} finally { await browser.close(); }
