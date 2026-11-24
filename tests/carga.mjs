import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../dist', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + sep)) { response.writeHead(400).end(); return; }
  try {
    const data = await readFile(file);
    const extension = extname(file);
    const compressed = /^(\.html|\.css|\.js|\.svg)$/.test(extension);
    response.writeHead(200, { 'Content-Type': types[extension] ?? 'application/octet-stream', 'Cache-Control': 'no-store', ...(compressed ? { 'Content-Encoding': 'gzip' } : {}) });
    response.end(compressed ? gzipSync(data) : data);
  } catch { response.writeHead(404).end(); }
});
await new Promise((ready, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', ready); });
let browser;
const results = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (let index = 0; index < 3; index++) {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, screen: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 120, downloadThroughput: 500_000, uploadThroughput: 125_000, connectionType: 'cellular4g' });
    const first = performance.now();
    await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'load' });
    const ready = Math.round(performance.now() - first);
    await page.getByRole('button', { name: 'Iniciar práctica' }).click();
    await page.locator('#cabin[data-quality]:not([data-quality=classic])').waitFor();
    const first3d = Math.round(performance.now() - first);
    results.push({ homeMs: ready, first3dMs: first3d });
    await context.close();
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  if (results.length) {
    await mkdir('test-results', { recursive: true });
    await writeFile('test-results/carga-4g-simulada.json', JSON.stringify({ downloadMbps: 4, uploadMbps: 1, latencyMs: 120, results }, null, 2) + '\n');
  }
}
console.log(JSON.stringify(results));
if (results.some((r) => r.first3dMs >= 8000)) process.exitCode = 1;
