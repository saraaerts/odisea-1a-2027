import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve, url } from './browser-fixture.mjs';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
await serve(context);
await context.addInitScript(() => localStorage.setItem('odisea-3d-config', JSON.stringify({ quality: 'classic', muted: true })));
const faults = [];

async function open() {
  const page = await context.newPage();
  page.on('pageerror', error => faults.push(error.message));
  page.on('console', message => { if (message.type() === 'error') faults.push(message.text()); });
  await page.goto(url);
  return page;
}

async function prep(name, area, jornada) {
  const page = await open();
  await page.getByRole('button', { name: 'Jugar en equipo' }).click();
  await page.locator('#crew-name').fill(name);
  await page.locator('#crew-area').selectOption(area);
  await page.locator('#crew-jornada').fill(jornada);
  return page;
}

try {
  const jornada = 'QAPRUEBA';
  const live = await open();
  await live.getByRole('button', { name: 'Abrir proyector' }).click();
  await live.locator('#projection-code').fill(jornada);
  await live.getByRole('button', { name: 'Ver la flota' }).click();
  await live.locator('.live[data-render="3d"]').waitFor();
  assert.equal(await live.locator('.live-card[data-signal="waiting"]').count(), 4);

  const hosts = [];
  for (let index = 0; index < 4; index++) {
    const host = await prep('Capitana ' + index, 'tut', jornada);
    await host.getByRole('button', { name: 'Crear sala' }).click();
    await host.locator('#lobby-code').waitFor();
    const code = await host.locator('#lobby-code').textContent();
    const guest = await prep('Tripulante ' + index, 'ri', jornada);
    await guest.locator('#crew-code').fill(code);
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await host.waitForFunction(() => document.querySelector('#lobby-count').textContent.includes('2 / 4'));
    hosts.push(host);
  }
  for (const host of hosts) await host.getByRole('button', { name: 'Despegar' }).click();
  await live.waitForFunction(() => document.querySelectorAll('.live-card[data-signal=active]').length === 4);
  assert.equal(await live.locator('.live-canvas').count(), 1);
  assert.equal(await live.locator('.live-canvas').evaluate(canvas => !!canvas.getContext('webgl2')), true);
  assert.equal(await live.locator('.live-number').allTextContents().then(text => text.join('/')), 'Nave 1/Nave 2/Nave 3/Nave 4');
  assert.doesNotMatch(await live.locator('#live').innerText(), /Capitana|Tripulante/);
  assert.match(await live.locator('.live-status').innerText(), /4 \/ 4/);

  await live.bringToFront();
  const cover = live.locator('.live-grid');
  const checkLayout = async () => {
    const cards = await live.locator('.live-card').evaluateAll(items =>
      items.map(item => [item.offsetLeft, item.offsetTop, item.offsetWidth, item.offsetHeight]));
    assert.equal(cards[0][1], cards[1][1]);
    assert.equal(cards[2][1], cards[3][1]);
    assert.equal(cards[0][0], cards[2][0]);
    assert.equal(cards[1][0], cards[3][0]);
    assert.ok(cards.every(card => card[2] > 70 && card[3] > 60));
    assert.ok(await live.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
    assert.ok(await live.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const name of ['Ocultar alertas', 'Volver']) {
      const button = await live.getByRole('button', { name, exact: true }).boundingBox();
      assert.ok(button.height >= 44 && button.width >= 44);
    }
  };
  await checkLayout();
  await live.waitForFunction(() => document.querySelector('#live-alerts p')?.textContent.includes('Orden vencida'), null, { timeout: 35_000 });
  await live.waitForFunction(() => Array.from(document.querySelectorAll('[data-metric=fleet]')).some(item => item.textContent !== '40/40'));
  await mkdir('test-results', { recursive: true });
  await live.screenshot({ path: 'test-results/proyector-1366x768.png' });
  await live.setViewportSize({ width: 800, height: 360 });
  await checkLayout();
  await live.screenshot({ path: 'test-results/proyector-800x360.png' });
  await live.getByRole('button', { name: 'Ocultar alertas' }).click();
  assert.equal(await live.locator('#live-alerts').isVisible(), false);
  await live.getByRole('button', { name: 'Mostrar alertas' }).click();
  assert.equal(await live.locator('#live-alerts').isVisible(), true);
  assert.ok(await cover.isVisible());
  await live.getByRole('button', { name: 'Odisea, inicio' }).click();
  assert.equal(await live.locator('.live-canvas').count(), 0);
  assert.deepEqual(faults, []);
  console.log('Proyector: cuatro partidas en vivo, un contexto WebGL, telemetría, alertas y grilla sin scroll en 1366×768 y 800×360.');
} finally {
  await browser.close();
}
