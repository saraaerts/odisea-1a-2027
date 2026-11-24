import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import './ui/style.css';
import { CONFIG, cleanAvatar, type Avatar } from './config.ts';
import { applyAction, createGame, launch, orderDurationMs, orderText, outcome, RULES, tick, visibleControls, type GameAction, type GameState, type Player } from './sim/index.ts';
import { createLocalRoom, createSupabaseRoom } from './net/room.ts';
import { createSession, type SessionView } from './net/session.ts';
import { mountClassic } from './render/classic.ts';
import type { mountCabin } from './render/cabin.ts';
import { armAudio, beep } from './ui/audio.ts';
import { byId, clock, fill, html, invite, label, show, station } from './ui/dom.ts';
import { alias, award, profile, saveProfile, saveSettings, settings, wallet, type Quality } from './ui/profile.ts';
import { areas, shell } from './ui/layout.ts';
import { seatId } from './ui/seat.ts';
import { mountWardrobe } from './ui/wardrobe.ts';

type Page = 'home' | 'crew' | 'profile' | 'settings' | 'projection' | 'lobby' | 'game' | 'end' | 'live';
const pages: Page[] = ['home', 'crew', 'profile', 'settings', 'projection', 'lobby', 'game', 'end', 'live'];
const mount = byId('app')!;
mount.innerHTML = shell;
const url = new URL(location.href);
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() as string | undefined;
const online = Boolean(supabaseUrl && supabaseKey);
const makeRoom = async () => {
  const peer = await seatId();
  return online ? createSupabaseRoom(supabaseUrl!, supabaseKey!, peer) : createLocalRoom(peer);
};
const field = (id: string) => byId<HTMLInputElement | HTMLSelectElement>(id)!;
const button = (id: string) => byId<HTMLButtonElement>(id)!;
const viewMedia = matchMedia('(any-pointer:coarse)');
const motionMedia = matchMedia('(prefers-reduced-motion: reduce)');
let page: Page = 'home', behindSettings: Page = 'home';
let local: GameState | null = null, localTimer = 0, simStamp = performance.now();
let session: Awaited<ReturnType<typeof createSession>> | null = null, sessionView: SessionView | null = null;
let identity = 'pilot-local', opening = false, roomAttempt = 0, lastState: GameState | null = null, stateAt = 0;
let lastLogicalTime = -1;
let cachedCrew: Player[] | null = null, avatars: Avatar[] = [];
type Cabin = ReturnType<typeof mountCabin>;
type Classic = ReturnType<typeof mountClassic>;
let visual: Classic | Cabin | null = null, raf = 0, visualRun = 0;
let flightEffect: { id: number; kind: 'ok' | 'error' | 'help' | 'celebrate'; seat?: number } | undefined, effectId = 0;
let lastEvent = 0, lastGid = '', message = '', messageAt = 0, toastTimer = 0;
let endSeen = '', resultAfter = 0, pendingLobby = false, selectedHelp = '';
let wardrobe: ReturnType<typeof mountWardrobe> | null = null;
let liveDispose: (() => void) | undefined;
let liveAttempt = 0;

function go(next: Page) {
  const prev = page;
  if (next === 'settings' && prev !== 'settings') behindSettings = prev;
  if (prev === 'game' && next !== 'game') stopVisual();
  if (prev === 'profile' && next !== 'profile') { wardrobe?.destroy(); wardrobe = null; }
  if (prev === 'live' && next !== 'live') closeProjection();
  page = next;
  for (const p of pages) show(p, p === next);
  if (prev !== next && !['game', 'lobby', 'end'].includes(next)) {
    window.scrollTo(0, 0);
    byId(next)?.querySelector('h1')?.setAttribute('tabindex', '-1');
    byId(next)?.querySelector('h1')?.focus({ preventScroll: true });
  }
  if (next === 'game' && !visual) startVisual();
  if (next === 'home') {
    label('home-alias', profile.name || 'Armá tu perfil');
    label('home-profile', profile.name ? areaName(profile.area) + ' · ' + wallet.points + ' puntos' : 'Elegí tu área y prepará tu avatar.');
  }
  if (next === 'profile' || next === 'crew') {
    field(next + '-name').value = profile.name;
    fill(next + '-area', areas());
    field(next + '-area').value = profile.area;
  }
  if (next === 'profile' && !wardrobe) wardrobe = mountWardrobe(byId('wardrobe')!, { onChange: () => { label('home-profile', areaName(profile.area) + ' · ' + wallet.points + ' puntos'); } });
  if (next === 'settings') field('quality').value = settings.quality;
}
function closeProjection() {
  liveAttempt++;
  liveDispose?.();
  liveDispose = undefined;
}
async function openProjection() {
  const jornada = station(field('projection-code').value);
  if (!jornada) { toast('Completá el código de jornada.'); return; }
  const attempt = ++liveAttempt;
  const submit = byId('projection-form')!.querySelector('button')!;
  submit.disabled = true;
  let root: HTMLElement | undefined;
  try {
    const [{ mountLive }, room] = await Promise.all([import('./live/index.ts'), makeRoom()]);
    if (attempt !== liveAttempt || page !== 'projection') return;
    root = document.createElement('div');
    root.className = 'live';
    byId('live')!.replaceChildren(root);
    go('live');
    const dispose = await mountLive(root, room, jornada, {
      onBack: () => go('projection'),
      reduced: () => motionMedia.matches || !settings.motion,
    });
    if (attempt !== liveAttempt) dispose();
    else {
      liveDispose = dispose;
      root.querySelector('h1')?.focus({ preventScroll: true });
    }
  } catch {
    if (attempt === liveAttempt) {
      go('projection');
      toast('No pudimos abrir la pantalla en vivo. Revisá el código y la conexión.');
    }
  } finally {
    submit.disabled = false;
  }
}
function toast(text: string) {
  label('toast', text); show('toast', true);
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => show('toast', false), 3600);
}
function areaName(id: string) { return CONFIG.areas.find((a) => a.id === id)?.nombre ?? 'Academia'; }
function setSound() {
  button('sound').textContent = settings.muted ? 'Sonido: no' : 'Sonido: sí';
  button('sound').setAttribute('aria-pressed', String(!settings.muted));
  button('sound').setAttribute('aria-label', settings.muted ? 'Activar sonido' : 'Silenciar sonido');
  byId<HTMLInputElement>('audio')!.checked = !settings.muted;
}
function setMuted(muted: boolean) { settings.muted = muted; saveSettings(); setSound(); armAudio(); }
async function leave() {
  roomAttempt++;
  opening = false;
  clearInterval(localTimer);
  local = null; lastState = null; endSeen = ''; resultAfter = 0; pendingLobby = false;
  const leaving = session;
  session = null; sessionView = null;
  if (leaving) { try { await leaving.leave(); } catch { /* la conexión ya se cerró */ } }
}
function saveFields(page: 'profile' | 'crew') {
  const name = alias(field(page + '-name').value);
  if (!name) { field(page + '-name').focus(); toast('Escribí un apodo para tu puesto.'); return false; }
  profile.name = name;
  profile.area = CONFIG.areas.find((a) => a.id === field(page + '-area').value)?.id ?? profile.area;
  saveProfile();
  return true;
}
function practice() {
  armAudio();
  void leave();
  identity = 'pilot-local';
  const bots = CONFIG.areas.filter((area) => area.id !== profile.area).slice(0, 2);
  const players: Player[] = [
    { ...profile, id: identity, name: profile.name || 'Piloto' },
    ...bots.map((area, i) => ({ id: 'bot-' + (i + 1), name: i ? 'Delta' : 'Vega', area: area.id, avatar: cleanAvatar({ pelo: i + 1, ropa: 2, piel: i + 1, colorRopa: i + 1 }) })),
  ];
  const state = createGame(players, { group: false });
  local = state;
  launch(state);
  simStamp = performance.now();
  localTimer = window.setInterval(() => {
    if (state !== local) return;
    const now = performance.now();
    tick(state, Math.min(400, now - simStamp));
    simStamp = now;
    for (const o of [...state.orders]) {
      // Los bots resuelven las órdenes entre ellos y las que vos les leés.
      if (o.actor !== identity && state.phase === 'play' && o.due - state.time < 3500) {
        applyAction(state, o.actor, { type: 'control', stage: state.stage, control: o.control, ...(o.value === null ? {} : { value: o.value }) });
      }
    }
    updateGame(state);
  }, 200);
  updateGame(state);
}
function stateChange(view: SessionView) {
  sessionView = view;
  if (opening || !session) return;
  const outsideRoster = view.game && !view.game.players.some((p) => p.id === identity);
  if (!view.game || view.game.phase === 'lobby' || outsideRoster || (pendingLobby && view.game.phase === 'end')) {
    if (page !== 'settings') go('lobby');
    drawLobby(view);
  } else if (view.game.phase !== 'end' || !pendingLobby) {
    pendingLobby = false;
    updateGame(view.game);
  }
}
async function enter(host: boolean) {
  if (opening || !saveFields('crew')) return;
  const jornada = station(field('crew-jornada').value);
  const code = host ? invite() : station(field('crew-code').value);
  if (![jornada, code].every((c) => /^[A-Z0-9][A-Z0-9-]{2,16}[A-Z0-9]$/.test(c))) { toast('Usá códigos de 4 a 18 caracteres: letras, números o guiones internos.'); return; }
  opening = true;
  const attempt = ++roomAttempt;
  label('transport-hint', 'Abriendo el canal de la nave…');
  try {
    const room = await makeRoom();
    if (attempt !== roomAttempt) return;
    const joined = await createSession({ room, code, jornada, profile: { ...profile }, host, onChange: (view) => { if (attempt === roomAttempt) stateChange(view); } });
    if (attempt !== roomAttempt) { await joined.leave(); return; }
    session = joined;
    identity = session.peerId;
    const reconnect = new URL(location.href);
    reconnect.searchParams.set('sala', code);
    reconnect.searchParams.set('jornada', jornada);
    try { history.replaceState(null, '', reconnect); } catch { /* visor embebido sin historial */ }
    opening = false;
    stateChange(session.view());
  } catch {
    if (attempt === roomAttempt) {
      toast(online ? 'No pudimos conectar. Revisá internet y Supabase, o probá la práctica.' : 'No pudimos abrir la red de pestañas. Probá la práctica.');
      opening = false;
    }
  } finally { if (attempt === roomAttempt) transportHint(); }
}
function drawLobby(view: SessionView) {
  label('lobby-code', view.code.toUpperCase()); label('lobby-jornada', view.jornada);
  label('lobby-count', view.players.length + ' / 4 tripulantes');
  fill('lobby-roster', view.players.map((p) => `<div class="crew-row"><b>${html(p.name)}${p.id === identity ? ' · vos' : ''}</b><span>${html(areaName(p.area))}</span></div>`).join(''));
  show('host-actions', view.host);
  button('start').disabled = view.players.length < 2 || !view.connected;
  const outside = !view.players.some((p) => p.id === identity);
  label('lobby-note', !view.connected || view.reconnecting ? 'Reconectando con la nave…' : view.host ? (view.players.length < 2 ? 'Invitá a otra persona para despegar. Lo ideal son 3–4.' : 'Cuando estén, arrancá la misión.') : outside && view.players.length >= 4 ? 'La sala está llena. Creá otra nave con el mismo código de jornada.' : outside && view.game?.phase !== 'lobby' ? 'La partida ya despegó. Esperá en la sala o creá otra nave.' : 'Esperá a que la persona al mando dé la orden de despegue.');
}
function act(action: GameAction) {
  armAudio();
  if (local) { applyAction(local, identity, action); updateGame(local); }
  else if (!sessionView?.reconnecting) session?.act(action);
}
function updateGame(state: GameState) {
  if (state !== lastState || state.time !== lastLogicalTime) stateAt = performance.now();
  lastState = state; lastLogicalTime = state.time;
  if (cachedCrew !== state.players) { cachedCrew = state.players; avatars = state.players.map((p) => p.avatar); }
  if (lastGid !== state.gid) { lastGid = state.gid; lastEvent = 0; message = ''; flightEffect = undefined; }
  for (const ev of state.events) {
    if (ev.id <= lastEvent) continue;
    lastEvent = ev.id;
    const messages: Record<string, string> = { ok: 'Orden cumplida', err: 'Control equivocado', fail: 'Orden vencida · se perdió una nave', help: ev.to === identity ? 'Mano recibida · +6 s' : ev.peer === identity ? 'Diste una mano · +6 s' : 'Una orden ganó +6 s', out: 'Foco apagado', boom: 'Casco destruido', stage: 'Trayecto despejado' };
    if (ev.kind !== 'ok' || ev.peer === identity) { message = messages[ev.kind] ?? ''; messageAt = stateAt; }
    if (ev.kind !== 'ok' || ev.peer === identity) beep(ev.kind);
    const kind = ({ ok: 'ok', err: 'error', fail: 'error', boom: 'error', help: 'help', stage: 'celebrate' } as const)[ev.kind as 'ok' | 'err' | 'fail' | 'boom' | 'help' | 'stage'];
    if (kind) flightEffect = { id: ++effectId, kind, seat: ev.peer ? Math.max(0, state.players.findIndex((p) => p.id === ev.peer)) : undefined };
  }
  if (state.phase === 'end') {
    if (endSeen !== state.gid) {
      endSeen = state.gid;
      resultAfter = page === 'game' && settings.motion && !motionMedia.matches ? performance.now() + 950 : 0;
      const result = outcome(state);
      if (state.players.some((p) => p.id === identity)) award(state.gid, result.points);
      label('result-title', result.title);
      fill('result-stats', '<div class="result-stats">' + [[state.ships + ' / ' + CONFIG.naves, 'Naves que llegaron'], [state.hull + ' %', 'Casco'], [state.stats.ok, 'Órdenes cumplidas'], [state.stats.err, 'Errores']].map(([v, name]) => '<div><b>' + v + '</b>' + name + '</div>').join('') + '</div>');
      label('result-points', result.points ? '+' + result.points + ' puntos para tu vestuario.' : 'La práctica no suma puntos.');
      button('again').textContent = local ? 'Practicar de nuevo' : 'Volver a la sala';
    }
    if (page === 'game' && performance.now() < resultAfter) renderHud(state);
    else if (page !== 'settings') go('end');
    return;
  }
  if (page !== 'settings') go('game');
  renderHud(state);
}
function renderHud(state: GameState) {
  const stage = CONFIG.etapas[state.stage];
  const me = state.players.find((p) => p.id === identity);
  const order = state.orders.find((o) => o.reader === identity);
  const actor = state.players.find((p) => p.id === order?.actor);
  const tutorial = local && state.orders.some((o) => o.actor === identity && o.reader !== identity);
  const botOrder = tutorial ? state.orders.find((o) => o.actor === identity && o.reader !== identity) : null;
  label('stage-number', 'RUTA DE ACADEMIA / ' + String(state.stage + 1).padStart(2, '0') + ' · ' + String(CONFIG.etapas.length).padStart(2, '0'));
  label('stage-name', stage?.nombre ?? 'En vuelo');
  label('ships', state.ships + ' / ' + CONFIG.naves); label('hull', state.hull + ' %'); label('done', state.done + ' / ' + state.need); label('errors', state.stats.err);
  show('reconnecting', !!sessionView?.reconnecting || sessionView?.connected === false);
  label('order-caption', state.phase === 'end' ? 'INFORME DE VUELO' : state.phase === 'between' ? 'HIPERIMPULSO' : botOrder ? 'PRÁCTICA · MENSAJE DE TU TRIPULACIÓN' : 'TU ORDEN · LEELA EN VOZ ALTA');
  label('order', state.phase === 'end' ? outcome(state).title : state.phase === 'between' ? 'Rumbo a ' + stage.nombre : botOrder ? orderText(botOrder) : order ? orderText(order) : 'Esperá la próxima orden');
  label('order-target', state.phase === 'between' ? stage.texto : botOrder ? 'Resolvé este pedido en tu propio panel. Los bots cubren los demás puestos.' : actor ? 'Para ' + actor.name + ' · ' + areaName(actor.area) + ' · puesto ' + (state.players.indexOf(actor) + 1) : '');
  label('panel-area', me ? areaName(me.area) : 'Sin puesto en esta misión');
  const controls = visibleControls(state, identity);
  const disabled = state.phase !== 'play' || !!sessionView?.reconnecting || !me || !state.active.includes(identity);
  const activeButton = document.activeElement instanceof HTMLButtonElement && document.activeElement.closest('#controls') ? document.activeElement : null;
  const activeControl = activeButton?.dataset.control, activeValue = activeButton?.dataset.next;
  fill('controls', controls.map((c) => {
    const val = state.values[identity]?.[c.id] ?? 0;
    if (c.kind === 'd') return `<div class="dial" role="group" aria-label="${html(c.label)}"><span>${html(c.label)}</span><div class="dial-steps">${[0, 1, 2, 3].map((v) => `<button class="control" type="button" aria-label="${html(c.label)}, nivel ${v}" aria-pressed="${val === v}" data-control="${html(c.id)}" data-next="${v}" ${disabled ? 'disabled' : ''}>${v}</button>`).join('')}</div></div>`;
    const status = c.kind === 't' ? (val ? 'Encendido' : 'Apagado') : 'Pulsador';
    return `<button class="control" type="button" data-control="${html(c.id)}" data-next="${c.kind === 't' ? 1 - val : ''}" ${c.kind === 't' ? 'aria-pressed="' + !!val + '"' : ''} ${disabled ? 'disabled' : ''}>${html(c.label)}<small>${status}</small></button>`;
  }).join('') || '<p class="notice">Panel en espera.</p>');
  if (activeControl && !activeButton?.isConnected && !disabled) {
    const candidates = Array.from(mount.querySelectorAll<HTMLButtonElement>('#controls [data-control]')).filter((b) => b.dataset.control === activeControl);
    (candidates.find((b) => b.dataset.next === activeValue) ?? candidates[0])?.focus({ preventScroll: true });
  }
  const peers = state.players.filter((p) => p.id !== identity && state.orders.some((o) => o.reader === p.id));
  const helpOptions = peers.map((p) => `<option value="${html(p.id)}">${html(p.name)}</option>`).join('');
  fill('help-target', helpOptions || '<option value="">Sin pedidos</option>');
  field('help-target').value = peers.some((p) => p.id === selectedHelp) ? selectedHelp : peers[0]?.id ?? '';
  field('help-target').disabled = disabled || peers.length === 0 || !state.hands[identity];
  label('help', 'Dar una mano · ' + (state.hands[identity] ?? 0));
  label('fire', state.fires.length ? 'Apagar fuego · ' + state.fires.length : 'Sin fuego');
  button('help').disabled = disabled || peers.length === 0 || !state.hands[identity];
  button('fire').disabled = disabled || !state.fires.length;
  updateClock(performance.now());
}
function updateClock(now: number) {
  const state = lastState;
  if (!state || page !== 'game') return;
  const order = local ? state.orders.find((o) => o.actor === identity && o.reader !== identity) ?? state.orders.find((o) => o.reader === identity) : state.orders.find((o) => o.reader === identity);
  const end = state.phase === 'between' ? state.until : order?.due;
  const duration = state.phase === 'between' ? RULES.transitionMs : orderDurationMs(state.stage, state.adjustmentMs) + (order?.extension ?? 0) * RULES.helpMs;
  const elapsed = sessionView?.reconnecting || document.hidden ? 0 : Math.max(0, Math.min(now - stateAt, 1100));
  const remaining = Math.max(0, (end ?? state.time) - state.time - elapsed);
  label('remaining', end === undefined ? '—' : clock(remaining));
  const timer = byId('timer')!;
  timer.dataset.low = String(remaining < 2800);
  (timer.firstElementChild as HTMLElement).style.width = Math.min(100, 100 * remaining / duration).toFixed(1) + '%';
  label('status', now - messageAt < 4000 ? message : '');
}
const qualityLabels = { high: 'Alta', medium: 'Media', low: 'Baja', classic: '2D clásica' };
const visualOpts = () => ({ view: (viewMedia.matches || innerWidth < 730 ? 'fixed' : 'first') as 'fixed' | 'first', reduced: motionMedia.matches || !settings.motion, intense: settings.intense });
function freshCanvas() {
  const old = byId<HTMLCanvasElement>('cabin')!;
  const next = document.createElement('canvas');
  next.id = old.id;
  old.replaceWith(next);
  return next;
}
function showQuality(quality: keyof typeof qualityLabels, reason?: string) {
  const canvas = byId<HTMLCanvasElement>('cabin')!;
  canvas.dataset.quality = quality;
  label('quality-pill', qualityLabels[quality]);
  if (reason) canvas.dataset.fallback = reason;
}
function startVisual() {
  const run = ++visualRun;
  let lastOpts = visualOpts();
  const classic = (reason?: string) => {
    if (run !== visualRun) return;
    visual?.destroy();
    visual = mountClassic(freshCanvas(), visualOpts());
    showQuality('classic', reason);
  };
  classic();
  const requested = settings.quality;
  if (requested !== 'classic') void import('./render/cabin.ts').then(({ mountCabin }) => {
    if (run !== visualRun || page !== 'game') return;
    visual?.destroy();
    visual = null;
    const canvas = freshCanvas();
    if (!canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' })) { classic('webgl'); return; }
    try {
      visual = mountCabin(canvas, {
        ...visualOpts(), quality: requested,
        onQuality: (quality) => showQuality(quality),
        onFallback: (reason) => queueMicrotask(() => classic(reason)),
      });
    } catch { classic('webgl'); }
  }).catch(() => classic('webgl'));
  const frame = (now: number) => {
    if (run !== visualRun) return;
    const state = lastState;
    if (state) {
      const opts = visualOpts();
      if (opts.view !== lastOpts.view || opts.reduced !== lastOpts.reduced || opts.intense !== lastOpts.intense) {
        visual?.configure(opts);
        lastOpts = opts;
      }
      const frame = { stage: state.stage, fleet: state.ships, hull: state.hull, fires: state.fires.length, progress: state.done / Math.max(1, state.need), phase: state.phase, effect: flightEffect, crew: avatars };
      try { visual?.render(frame, now); }
      catch {
        if (visual && 'stats' in visual) classic('webgl');
        else { visual?.destroy(); visual = null; }
      }
      updateClock(now);
      if (state.phase === 'end' && endSeen === state.gid && now >= resultAfter) { go('end'); return; }
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}
function stopVisual() { ++visualRun; cancelAnimationFrame(raf); visual?.destroy(); visual = null; }
viewMedia.addEventListener('change', () => visual?.configure(visualOpts()));
motionMedia.addEventListener('change', () => visual?.configure(visualOpts()));
function transportHint() {
  label('transport-hint', online ? 'Supabase Realtime · pueden entrar desde distintos dispositivos.' : 'Red local de prueba · abrí otra pestaña en este navegador. Configurá Supabase para jugar desde otros dispositivos.');
}
function updateSettingLabels() {
  label('quality-note', 'Automática mide la fluidez y baja la calidad si hace falta. La partida sigue en 2D si falla la cabina 3D.');
  setSound();
}

mount.addEventListener('click', (ev) => {
  const hit = (ev.target as Element).closest<HTMLButtonElement>('button');
  if (!hit || hit.disabled) return;
  const next = hit.dataset.go as Page | undefined;
  if (next) {
    if (next === 'home') void leave();
    go(next); return;
  }
  if (hit.dataset.control && lastState) {
    flightEffect = { id: ++effectId, kind: 'ok', seat: Math.max(0, lastState.players.findIndex((p) => p.id === identity)) };
    act({ type: 'control', stage: lastState.stage, control: hit.dataset.control, ...(hit.dataset.next ? { value: Number(hit.dataset.next) } : {}) });
  }
  if (hit.id === 'practice') practice();
  if (hit.id === 'sound') setMuted(!settings.muted);
  if (hit.id === 'close-settings') {
    if (behindSettings === 'game' && lastState?.phase === 'end') go('end');
    else if (behindSettings === 'live') { go('projection'); void openProjection(); }
    else { go(behindSettings); if (behindSettings === 'game' && lastState) renderHud(lastState); }
  }
  if (hit.id === 'start') { armAudio(); session?.start(Number(field('adjustment').value)); }
  if (hit.id === 'again') {
    if (local) practice();
    else if (session && sessionView) { pendingLobby = true; session.wait(); go('lobby'); drawLobby(session.view()); }
  }
  if (hit.id === 'copy-code' && sessionView) {
    const share = new URL(location.href);
    share.search = new URLSearchParams({ sala: sessionView.code, jornada: sessionView.jornada }).toString();
    navigator.clipboard?.writeText(share.href).then(() => toast('Invitación copiada.'), () => toast('Compartí el código de sala y de jornada.')) ?? toast('Compartí el código de sala y de jornada.');
  }
  if (hit.id === 'help' && lastState) {
    const to = field('help-target').value;
    const o = lastState.orders.find((order) => order.reader === to);
    if (o) act({ type: 'help', stage: lastState.stage, to, order: o.id });
  }
  if (hit.id === 'fire' && lastState?.fires.length) act({ type: 'fire', stage: lastState.stage, id: lastState.fires[0].id });
});
mount.addEventListener('change', (ev) => {
  const el = ev.target as HTMLInputElement | HTMLSelectElement;
  if (el.id === 'help-target') selectedHelp = el.value;
  if (el.id === 'quality') { settings.quality = el.value as Quality; saveSettings(); updateSettingLabels(); }
  if (el.id === 'intense' || el.id === 'motion') { settings[el.id] = (el as HTMLInputElement).checked; saveSettings(); }
  if (el.id === 'audio') setMuted(!(el as HTMLInputElement).checked);
});
mount.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const form = ev.target as HTMLFormElement;
  if (form.id === 'profile-form' && saveFields('profile')) toast('Perfil guardado en este dispositivo.');
  if (form.id === 'crew-form') void enter(((ev as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'host');
  if (form.id === 'projection-form') void openProjection();
});
window.addEventListener('pagehide', (ev) => {
  if (!ev.persisted) { stopVisual(); closeProjection(); void leave(); }
});
transportHint();
updateSettingLabels();
if (url.searchParams.has('sala')) {
  field('crew-code').value = station(url.searchParams.get('sala') ?? '');
  field('crew-jornada').value = station(url.searchParams.get('jornada') ?? 'ODISEA') || 'ODISEA';
  go('crew');
} else { go('home'); }
