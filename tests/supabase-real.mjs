// Prueba manual. Usa exclusivamente canales efímeros de Supabase Realtime.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { cleanAvatar } from '../src/config.ts';
import { createRealtimeRoom, newPeerId } from '../src/net/room.ts';
import { createSession, watchBoard } from '../src/net/session.ts';

async function config() {
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
    return [process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY];
  }
  if (!process.argv.includes('--usar-legacy')) {
    throw new Error('Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY o pasá --usar-legacy.');
  }
  const legacy = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const match = /const\s+SUPA\s*=\s*\{\s*url:\s*['"]([^'"]+)['"]\s*,\s*key:\s*['"]([^'"]+)['"]/u.exec(legacy);
  if (!match) throw new Error('No se encontró la configuración pública del juego 2D.');
  return [match[1], match[2]];
}

function validatePublicConfig(url, key) {
  if (!/^https:\/\/[a-z0-9.-]+\/?$/iu.test(url)) throw new Error('Se esperaba una URL HTTPS de Supabase.');
  if (key.startsWith('sb_publishable_')) return;
  const parts = key.split('.');
  let role;
  try {
    if (parts.length === 3) role = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role;
  } catch { /* validación de la credencial pública */ }
  if (role !== 'anon') throw new Error('La prueba requiere una clave pública anon o publishable.');
}

async function until(predicate, timeout, description) {
  const expires = performance.now() + timeout;
  while (performance.now() < expires) {
    if (predicate()) return;
    await delay(100);
  }
  throw new Error('No se confirmó ' + description + '.');
}

const sessions = [];
const clients = [];
let stop;
let step = 'validar la configuración';
try {
  const [url, key] = await config();
  validatePublicConfig(url, key);
  const { createClient } = await import('@supabase/supabase-js');
  function factory(id) {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    clients.push(client);
    return createRealtimeRoom(client, id);
  }
  const jornada = 'qa' + newPeerId();
  const code = newPeerId();
  const board = [];
  step = 'conectar al proyector';
  stop = await watchBoard(factory('qa-view'), jornada, summary => board.push(summary));
  const areas = ['tut', 'coa', 'azu', 'sec'];
  for (const [index, area] of areas.entries()) {
    step = 'conectar al tripulante ' + (index + 1);
    sessions.push(await createSession({
      room: factory('qa-pilot' + index),
      jornada, code, profile: { name: 'Prueba ' + (index + 1), area, avatar: cleanAvatar({}) },
      host: index === 0,
    }));
  }
  const [first, second, third, fourth] = sessions;
  step = 'confirmar Presence de cuatro tripulantes';
  await until(() => sessions.every(session => session.view().players.length === 4), 7000, 'el roster completo');
  step = 'despegar';
  assert.equal(first.start(3000), true);
  await until(() => sessions.every(session => session.view().game?.phase === 'play'), 10_000, 'el despegue');
  const gid = first.view().game.gid;
  const order = first.view().game.orders.find(order => order.actor === second.peerId);
  assert.ok(order);
  step = 'confirmar acción y tablero';
  assert.equal(second.act({ type: 'control', control: order.control, stage: 0, value: order.value ?? undefined }), true);
  await until(() => sessions.every(session => session.view().game?.stats.ok === 1), 4000, 'la acción remota');
  await until(() => board.some(item => item.gid === gid && item.done === 1), 4000, 'el tablero');
  step = 'cortar al anfitrión';
  const cutAt = performance.now();
  await first.leave();
  await until(() => second.view().host && [third, fourth].every(session =>
    session.view().game?.gid === gid && !session.view().reconnecting), 6400, 'la toma de mando');
  const cutDuration = Math.round(performance.now() - cutAt);
  await until(() => board.some(item => item.epoch === 1 && item.host === second.peerId), 4000, 'el nuevo anfitrión en el tablero');
  step = 'reconectar al anfitrión anterior';
  const rejoined = await createSession({
    room: factory(first.peerId), jornada, code,
    profile: { name: 'Prueba 1', area: areas[0], avatar: cleanAvatar({}) }, host: false,
  });
  sessions.push(rejoined);
  await until(() => rejoined.view().game?.gid === gid && second.view().game?.active.includes(first.peerId), 5000, 'el regreso del tripulante');
  assert.equal(rejoined.view().host, false);
  console.log(`Supabase real OK · 4 tripulantes · acción remota · tablero · toma de mando en ${cutDuration} ms · retorno verificado.`);
} catch {
  console.error('Prueba de Supabase sin confirmar al ' + step + '.');
  process.exitCode = 1;
} finally {
  await Promise.allSettled(sessions.map(session => session.leave()));
  await stop?.().catch(() => {});
  for (const client of clients) client.realtime.disconnect();
}
