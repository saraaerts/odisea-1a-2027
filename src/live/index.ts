import { CONFIG } from '../config.ts';
import type { Room } from '../net/room.ts';
import { watchBoard, type BoardSummary } from '../net/session.ts';
import type { Feed, mountTelemetry } from './telemetry.ts';
import './live.css';

const TTL = 12_000;
const TITLES = {
  ok: 'Orden resuelta',
  err: 'Control equivocado',
  fail: 'Orden vencida · se perdió una nave',
  help: 'Una mano a tiempo',
  out: 'Fuego apagado',
  boom: 'Casco roto',
  stage: 'Etapa completada',
} as const;

interface LiveOptions {
  onBack: () => void;
  reduced: () => boolean;
}

function layout() {
  return `
    <header class="live-head">
      <div><h1 tabindex="-1">Pantalla en vivo</h1><p class="live-status" aria-live="polite"></p></div>
      <div class="live-tools"><button type="button" class="quiet" id="live-alerts-toggle" aria-controls="live-alerts" aria-pressed="true">Ocultar alertas</button><button type="button" class="quiet" id="live-back">Volver</button></div>
    </header>
    <div class="live-deck">
      <div class="live-grid">${Array.from({ length: 4 }, (_, slot) => `
        <article class="live-card" data-slot="${slot}" data-signal="waiting">
          <div class="live-feed" aria-hidden="true"><span class="live-planet"></span><span class="live-reticle"></span><span class="live-dash"></span></div>
          <div class="live-caption"><span class="live-number">Nave ${slot + 1}</span><h2>Esperando señal</h2></div>
          <dl class="live-metrics" hidden><div><dt>Naves</dt><dd data-metric="fleet"></dd></div><div><dt>Casco</dt><dd data-metric="hull"></dd></div><div><dt>Errores</dt><dd data-metric="errors"></dd></div></dl>
        </article>`).join('')}
      </div>
      <canvas class="live-canvas" aria-hidden="true"></canvas>
    </div>
    <aside id="live-alerts" class="live-alerts" aria-label="Cinta de alertas"><strong>Alertas</strong><p aria-live="polite">Sin novedades</p></aside>`;
}

export async function mountLive(root: HTMLElement, room: Room, jornada: string, options: LiveOptions) {
  root.innerHTML = layout();
  const canvas = root.querySelector('canvas')!;
  const cards = [...root.querySelectorAll<HTMLElement>('.live-card')];
  const status = root.querySelector<HTMLElement>('.live-status')!;
  const back = root.querySelector<HTMLButtonElement>('#live-back')!;
  const toggle = root.querySelector<HTMLButtonElement>('#live-alerts-toggle')!;
  const ribbon = root.querySelector<HTMLElement>('#live-alerts')!;
  const alert = ribbon.querySelector('p')!;
  const slots: (string | undefined)[] = Array(4).fill(undefined);
  const summaries = new Map<string, { summary: BoardSummary; at: number; lastAlert: number }>();
  let stopped = false;
  let drawTimer: ReturnType<typeof setInterval> | undefined;
  let renderer: ReturnType<typeof mountTelemetry> | undefined;
  let feeds: Feed[] = [];
  let needsDraw = true;
  root.dataset.render = '2d';

  function paint() {
    feeds = [];
    let active = 0;
    for (const [index, card] of cards.entries()) {
      const id = slots[index];
      const data = id ? summaries.get(id)?.summary : undefined;
      const title = card.querySelector('h2')!;
      const metrics = card.querySelector('dl')!;
      if (!data) {
        card.dataset.signal = 'waiting';
        if (title.textContent !== 'Esperando señal') title.textContent = 'Esperando señal';
        metrics.hidden = true;
        continue;
      }
      active++;
      card.dataset.signal = 'active';
      card.dataset.stage = String(data.stage);
      card.dataset.warning = data.broken || data.fires > 0 ? 'true' : 'false';
      const caption = data.broken ? 'Casco roto' : data.phase === 'end' ? 'Misión terminada' : CONFIG.etapas[data.stage].nombre;
      if (title.textContent !== caption) title.textContent = caption;
      metrics.hidden = false;
      card.querySelector('[data-metric="fleet"]')!.textContent = data.fleet + '/40';
      card.querySelector('[data-metric="hull"]')!.textContent = data.hull + ' %';
      card.querySelector('[data-metric="errors"]')!.textContent = String(data.errors);
      feeds.push({ host: card, summary: data });
    }
    const text = active === 0 ? 'Esperando partidas · ' + jornada.toUpperCase()
      : active + ' / 4 ' + (active === 1 ? 'nave en pantalla' : 'naves en pantalla');
    if (status.textContent !== text) status.textContent = text;
    needsDraw = true;
  }

  function receive(summary: BoardSummary) {
    if (stopped) return;
    if (summary.phase === 'lobby' || summary.phase === 'closed') {
      summaries.delete(summary.code);
    } else {
      const previous = summaries.get(summary.code);
      let lastAlert = previous?.summary.gid === summary.gid ? previous.lastAlert : 0;
      if (summaries.size < 32 || previous) {
        summaries.set(summary.code, { summary, at: performance.now(), lastAlert });
      }
      const slot = slots.indexOf(summary.code);
      const newest = summary.events.filter(event => event.id > lastAlert).at(-1);
      if (newest) {
        lastAlert = newest.id;
        const entry = summaries.get(summary.code);
        if (entry) entry.lastAlert = lastAlert;
        if (slot >= 0) alert.textContent = `Nave ${slot + 1} · ${TITLES[newest.kind]}`;
      }
    }
    chooseSlots();
    paint();
  }

  function chooseSlots() {
    const now = performance.now();
    for (const [code, item] of summaries) {
      if (now - item.at >= TTL) summaries.delete(code);
    }
    for (let index = 0; index < slots.length; index++) {
      const current = slots[index];
      if (current && !summaries.has(current)) slots[index] = undefined;
    }
    for (const code of summaries.keys()) {
      if (slots.includes(code)) continue;
      const empty = slots.indexOf(undefined);
      if (empty === -1) break;
      slots[empty] = code;
    }
  }

  function failWebGL() {
    if (stopped || root.dataset.render === '2d') return;
    root.dataset.render = '2d';
    renderer?.destroy();
    renderer = undefined;
  }

  function swapRibbon() {
    ribbon.hidden = !ribbon.hidden;
    toggle.textContent = ribbon.hidden ? 'Mostrar alertas' : 'Ocultar alertas';
    toggle.setAttribute('aria-pressed', String(!ribbon.hidden));
    needsDraw = true;
  }

  const detach = await watchBoard(room, jornada, receive);
  paint();
  back.addEventListener('click', options.onBack);
  toggle.addEventListener('click', swapRibbon);
  canvas.addEventListener('webglcontextlost', failWebGL);
  const resize = new ResizeObserver(() => { needsDraw = true; });
  resize.observe(canvas);
  const expires = setInterval(() => {
    const before = slots.join('|');
    chooseSlots();
    if (before !== slots.join('|')) paint();
  }, 500);
  void import('./telemetry.ts').then(module => {
    if (stopped) return;
    renderer = module.mountTelemetry(canvas);
    root.dataset.render = '3d';
    drawTimer = setInterval(() => {
      if (stopped || document.hidden || !renderer) return;
      const reduced = options.reduced();
      if (!needsDraw && (reduced || !feeds.length)) return;
      try {
        renderer.draw(feeds, reduced);
        needsDraw = false;
      } catch {
        failWebGL();
      }
    }, 1000 / 20);
  }).catch(failWebGL);

  return () => {
    if (stopped) return;
    stopped = true;
    resize.disconnect();
    clearInterval(expires);
    clearInterval(drawTimer);
    canvas.removeEventListener('webglcontextlost', failWebGL);
    renderer?.destroy();
    back.removeEventListener('click', options.onBack);
    toggle.removeEventListener('click', swapRibbon);
    void detach().catch(() => {});
    root.replaceChildren();
  };
}
