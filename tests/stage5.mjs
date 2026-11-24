import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve, url } from './browser-fixture.mjs';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' });
await serve(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });

async function openWardrobe() {
  await page.getByRole('button', { name: /Abrir vestuario/ }).click();
  await page.getByRole('heading', { name: 'Equipamiento' }).waitFor();
}
const choose = name => page.locator('.wardrobe-categories').getByRole('button', { name, exact: true }).click();
const piece = name => page.locator('.wardrobe-options').getByRole('button', { name, exact: true });

try {
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.setItem('odisea-jugador', JSON.stringify({ name: 'Luz', area: 'ri', av: { ropa: 3, colorRopa: 1, lentes: 1 } }));
    localStorage.setItem('odisea-puntos', JSON.stringify({ puntos: 95, unlocked: [], games: ['pasada'] }));
  });
  await page.reload();
  await openWardrobe();
  assert.equal(await page.locator('#profile-name').inputValue(), 'Luz');
  assert.equal(await page.locator('#profile-area').inputValue(), 'ri');
  assert.equal(await page.locator('.wardrobe-points').textContent(), '95 puntos');

  const portrait = page.locator('.wardrobe-canvas');
  await portrait.waitFor({ state: 'visible' });
  const original = await portrait.screenshot();
  await piece('Cresta').click();
  await piece('Cian').click();
  await choose('Cara');
  await piece('Pícara').click();
  await piece('Pecas').click();
  await choose('Piel');
  await piece('Morena').click();
  await choose('Ropa');
  assert.equal(await piece('Remera Teclab').getAttribute('aria-pressed'), 'true');
  await piece('Campera').click();
  await piece('Violeta').click();
  await choose('Gorros');
  await piece('Corona, bloqueado por 300 puntos').click();
  assert.match(await page.locator('.wardrobe-buy').textContent(), /Te faltan 205 puntos/);
  assert.ok(await page.getByRole('button', { name: 'Desbloquear y equipar' }).isDisabled());
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('odisea-3d-perfil')).avatar.gorro), 0);
  await piece('Gorra, bloqueado por 50 puntos').click();
  await page.getByRole('button', { name: 'Desbloquear y equipar' }).click();
  assert.equal(await page.locator('.wardrobe-points').textContent(), '45 puntos');
  assert.match(await page.locator('.wardrobe-status').textContent(), /desbloqueada y equipada/);
  await piece('Menta').click();
  await choose('Accesorios');
  await piece('Aros, bloqueado por 30 puntos').click();
  await page.getByRole('button', { name: 'Desbloquear y equipar' }).click();
  assert.equal(await page.locator('.wardrobe-points').textContent(), '15 puntos');
  await piece('Rosa').click();
  await choose('Lentes');
  await piece('Hexagonales').click();
  await piece('Dorado').click();
  assert.notDeepEqual(await portrait.screenshot(), original, 'Cambiar las piezas y colores modifica el avatar 3D');

  const controls = await page.locator('.wardrobe-grid button:visible').evaluateAll(buttons => buttons.map(button => {
    const { width, height } = button.getBoundingClientRect();
    return { width, height };
  }));
  assert.ok(controls.every(({ width, height }) => width >= 44 && height >= 44));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);

  await page.reload();
  await openWardrobe();
  assert.equal(await page.locator('.wardrobe-points').textContent(), '15 puntos');
  await choose('Gorros');
  assert.equal(await piece('Gorra').getAttribute('aria-pressed'), 'true');
  assert.equal(await piece('Menta').getAttribute('aria-pressed'), 'true');
  await piece('Gorra').click();
  assert.equal(await page.locator('.wardrobe-points').textContent(), '15 puntos', 'Equipar una pieza comprada no vuelve a cobrar');
  await choose('Lentes');
  assert.equal(await piece('Hexagonales').getAttribute('aria-pressed'), 'true');
  assert.equal(await piece('Dorado').getAttribute('aria-pressed'), 'true');
  const saved = await page.evaluate(() => ({
    profile: JSON.parse(localStorage.getItem('odisea-3d-perfil')),
    wallet: JSON.parse(localStorage.getItem('odisea-3d-puntos')),
  }));
  assert.deepEqual(saved.wallet, { points: 15, owned: ['gorro:2', 'acc:1'], paid: ['pasada'] });
  assert.deepEqual(saved.profile.avatar, {
    pelo: 9, colorPelo: 6, piel: 3, cara: 5, detalle: 1, ropa: 4, colorRopa: 7,
    gorro: 2, colorGorro: 2, acc: 1, colorAcc: 6, lentes: 7, colorLentes: 3,
  });

  await page.goto(new URL('?vista=vestuario&modo=ajuste', url).href);
  const fine = page.getByRole('button', { name: 'Ajuste fino', exact: true });
  await fine.waitFor();
  assert.equal(await fine.getAttribute('aria-pressed'), 'true');
  const left = page.getByRole('button', { name: 'Girar a la izquierda' });
  await left.waitFor();
  const straight = await portrait.screenshot();
  await left.click();
  assert.notDeepEqual(await portrait.screenshot(), straight, 'El botón cambia el ángulo del avatar 3D');
  await page.getByRole('button', { name: 'Girar a la derecha' }).click();

  const faceValues = { jaw: -2, cheek: 2, eyes: -1, brows: 1, nose: 2, lips: -2 };
  for (const [key, value] of Object.entries(faceValues)) await page.locator(`[data-wardrobe-face="${key}"]`).fill(String(value));
  assert.equal(await page.getByRole('slider', { name: 'Mandíbula' }).getAttribute('aria-valuetext'), 'Muy angosta');
  // Los colores viven en su propia pestaña del ajuste fino.
  await page.locator('[data-wardrobe-fine-panel="colors"]').click();
  const colorValues = { skin: '#AA806A', hair: '#7A263F', suit: '#5614CA', hat: '#42CD9C', accessory: '#CB346E', glasses: '#DDAA21' };
  for (const [key, value] of Object.entries(colorValues)) {
    const hex = page.locator(`[data-wardrobe-hex="${key}"]`);
    await hex.fill(value.toLowerCase());
    await hex.press('Enter');
    assert.equal(await hex.inputValue(), value);
  }
  const skin = page.getByRole('textbox', { name: 'Código hex de piel' });
  await skin.fill('#123');
  await skin.press('Enter');
  assert.equal(await skin.getAttribute('aria-invalid'), 'true');
  assert.doesNotMatch(await page.locator('.wardrobe-status').textContent(), /^$/);
  const fineControls = await page.locator('.wardrobe-fine :is(input,button), .wardrobe-turn button').evaluateAll(els =>
    els.map(el => [el.getBoundingClientRect().width, el.getBoundingClientRect().height]),
  );
  // La pestaña oculta del ajuste fino mide 0 × 0; se controlan las visibles.
  assert.ok(fineControls.filter(([width, height]) => width || height).every(([width, height]) => width >= 44 && height >= 44));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
  await page.reload();
  assert.equal(await page.getByRole('slider', { name: 'Mandíbula' }).inputValue(), '-2');
  assert.equal(await page.locator('[data-wardrobe-hex="skin"]').inputValue(), '#AA806A');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('odisea-3d-perfil')).avatar.custom), {
    ...faceValues, ...colorValues,
  });

  await page.evaluate(() => localStorage.setItem('odisea-3d-config', JSON.stringify({ quality: 'classic' })));
  await page.reload();
  await page.getByRole('slider', { name: 'Mandíbula' }).waitFor();
  assert.ok(await page.locator('.wardrobe-classic svg').isVisible());
  assert.ok(await page.locator('.wardrobe-canvas').isHidden());
  assert.ok(await page.getByRole('button', { name: 'Girar a la izquierda' }).isHidden());
  const beforeReset = await page.locator('.wardrobe-classic svg').innerHTML();
  for (const value of Object.values(colorValues)) assert.ok(beforeReset.includes(value), 'SVG usa el color personalizado ' + value);
  await choose('Pelo');
  await piece('Cian').click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('odisea-3d-perfil')).avatar.custom), {
    ...faceValues, ...Object.fromEntries(Object.entries(colorValues).filter(([key]) => key !== 'hair')),
  });
  await choose('Ajuste fino');
  await page.getByRole('button', { name: 'Restablecer ajuste fino' }).click();
  assert.equal(await page.getByRole('slider', { name: 'Mandíbula' }).inputValue(), '0');
  assert.notEqual(await page.locator('.wardrobe-classic svg').innerHTML(), beforeReset);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('odisea-3d-perfil')).avatar), saved.profile.avatar);
  assert.equal(await page.locator('.wardrobe-points').textContent(), '15 puntos');
  assert.deepEqual(errors, []);
  console.log('Validación del vestuario: giro 3D, retrato clásico, rasgos, tintes hex, reset, compras, migración y persistencia.');
} finally {
  await browser.close();
}
