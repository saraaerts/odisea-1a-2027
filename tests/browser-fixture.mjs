import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' };
export const url = process.env.ODISEA_TEST_URL ?? 'http://odisea.test/';
export async function serve(context) {
  if (process.env.ODISEA_TEST_URL) return;
  await context.route('http://odisea.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = resolve(dist, '.' + (path.endsWith('/') ? path + 'index.html' : path));
    if (!file.startsWith(dist + sep)) return route.fulfill({ status: 400 });
    try { await route.fulfill({ body: await readFile(file), contentType: types[extname(file)] ?? 'application/octet-stream' }); }
    catch { await route.fulfill({ status: 404 }); }
  });
}
