import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve, url } from './browser-fixture.mjs';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const context = await browser.newContext({ viewport: { width: 800, height: 360 }, reducedMotion: 'reduce' });
await serve(context);
const faults = [];
async function open() {
  const page = await context.newPage();
  page.on('pageerror', (e) => faults.push(e.message));
  page.on('console', (e) => { if (e.type() === 'error') faults.push(e.text()); });
  await page.goto(url);
  await page.getByRole('heading', { name: 'Odisea 1A 2027' }).waitFor();
  await page.evaluate(() => localStorage.setItem('odisea-3d-config', JSON.stringify({ quality: 'classic', muted: true })));
  await page.reload();
  return page;
}
try {
  const solo = await open();
  await solo.getByRole('button', { name: 'Iniciar práctica' }).click();
  await solo.locator('#game').waitFor();
  assert.match(await solo.locator('#stage-name').textContent(), /Despegue/);
  assert.equal(await solo.locator('#quality-pill').textContent(), '2D clásica');
  const controls = solo.locator('.control');
  assert.ok(await controls.count() >= 3);
  assert.ok((await controls.first().boundingBox()).height >= 44);
  await solo.getByRole('button', { name: 'Odisea, inicio' }).click();
  await solo.close();

  const host = await open();
  await host.getByRole('button', { name: 'Jugar en equipo' }).click();
  await host.locator('#crew-name').fill('Vega');
  await host.getByRole('button', { name: 'Crear sala' }).click();
  await host.locator('#lobby-code').waitFor();
  const code = await host.locator('#lobby-code').textContent();
  assert.ok(code);
  const guest = await open();
  await guest.getByRole('button', { name: 'Jugar en equipo' }).click();
  await guest.locator('#crew-name').fill('Delta');
  await guest.locator('#crew-area').selectOption('ri');
  await guest.getByLabel('Código de sala').fill(code);
  await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
  await host.waitForFunction(() => document.querySelector('#lobby-count').textContent.includes('2 / 4'));
  await host.getByRole('button', { name: 'Despegar' }).click();
  for (const page of [host, guest]) await page.locator('#game').waitFor();
  assert.equal(await host.locator('#panel-area').textContent(), 'Tutores');
  assert.equal(await guest.locator('#panel-area').textContent(), 'RI');
  await host.waitForFunction(() => document.querySelector('#order-target').textContent.includes('Delta'));
  await guest.waitForFunction(() => document.querySelector('#order-target').textContent.includes('Vega'));
  assert.match(await host.locator('#order-target').textContent(), /Delta/);
  assert.match(await guest.locator('#order-target').textContent(), /Vega/);
  await guest.reload();
  await guest.locator('#crew').waitFor();
  assert.equal(await guest.locator('#crew-code').inputValue(), code.toUpperCase());
  await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
  await guest.locator('#game').waitFor({ timeout: 8000 });
  assert.equal(await guest.locator('#panel-area').textContent(), 'RI');
  assert.deepEqual(faults, []);
  console.log('Validación 2D: práctica, dos pestañas, puestos separados, órdenes cruzadas y regreso al puesto tras recargar.');
} finally { await browser.close(); }
