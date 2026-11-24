import {
  AVATAR_COLOR_NAMES, AVATAR_OPTIONS, type Avatar, type AvatarColorKey, type AvatarFaceKey,
} from '../config.ts';
import { html } from './dom.ts';
import {
  customColorSlot, equipPiece, ownsPiece, priceOf, profile, saveAvatarCustom, settings,
  syncWallet, unlockPiece, wallet,
} from './profile.ts';
import './wardrobe.css';

type AvatarKey = keyof typeof AVATAR_OPTIONS;
type Colors = keyof typeof AVATAR_COLOR_NAMES;
type Group = { label: string; parts: { key: AvatarKey; label: string; color?: true }[] };
type Preview = {
  update(avatar: Avatar): void;
  setZoom(factor: number): void;
  setView(view: 'portrait' | 'body'): void;
  rotateBy(radians: number): void;
  destroy(): void;
};

const fineGroup = 'Ajuste fino';
const faceOptions: Record<AvatarFaceKey, { name: string; levels: [string, string, string, string, string] }> = {
  jaw: { name: 'Mandíbula', levels: ['Muy angosta', 'Angosta', 'Base', 'Ancha', 'Muy ancha'] },
  cheek: { name: 'Pómulos', levels: ['Muy suaves', 'Suaves', 'Base', 'Marcados', 'Muy marcados'] },
  eyes: { name: 'Ojos', levels: ['Muy chicos', 'Chicos', 'Base', 'Grandes', 'Muy grandes'] },
  brows: { name: 'Cejas', levels: ['Muy bajas', 'Bajas', 'Base', 'Altas', 'Muy altas'] },
  nose: { name: 'Nariz', levels: ['Muy angosta', 'Angosta', 'Base', 'Ancha', 'Muy ancha'] },
  lips: { name: 'Labios', levels: ['Muy finos', 'Finos', 'Base', 'Gruesos', 'Muy gruesos'] },
};
const fineColors: Record<AvatarColorKey, { name: string; base: Colors }> = {
  skin: { name: 'Piel', base: 'piel' },
  hair: { name: 'Pelo', base: 'colorPelo' },
  suit: { name: 'Ropa', base: 'colorRopa' },
  hat: { name: 'Gorro', base: 'colorGorro' },
  accessory: { name: 'Accesorio', base: 'colorAcc' },
  glasses: { name: 'Marco de lentes', base: 'colorLentes' },
};
const faceKeys = Object.keys(faceOptions) as AvatarFaceKey[];
const colorKeys = Object.keys(fineColors) as AvatarColorKey[];
let wardrobeId = 0;

const groups: Group[] = [
  { label: 'Pelo', parts: [{ key: 'pelo', label: 'Peinado' }, { key: 'colorPelo', label: 'Color de pelo', color: true }] },
  { label: 'Cara', parts: [{ key: 'cara', label: 'Expresión' }, { key: 'detalle', label: 'Detalle' }] },
  { label: 'Piel', parts: [{ key: 'piel', label: 'Tono de piel', color: true }] },
  { label: 'Ropa', parts: [{ key: 'ropa', label: 'Prenda' }, { key: 'colorRopa', label: 'Color de ropa', color: true }] },
  { label: 'Gorros', parts: [{ key: 'gorro', label: 'Gorro' }, { key: 'colorGorro', label: 'Color del gorro', color: true }] },
  { label: 'Accesorios', parts: [{ key: 'acc', label: 'Accesorio' }, { key: 'colorAcc', label: 'Color del accesorio', color: true }] },
  { label: 'Lentes', parts: [{ key: 'lentes', label: 'Marco' }, { key: 'colorLentes', label: 'Color del marco', color: true }] },
];

function classicPortrait(avatar: Avatar): string {
  const skin = currentColor(avatar, 'skin');
  const hair = currentColor(avatar, 'hair');
  const cloth = currentColor(avatar, 'suit');
  const hat = currentColor(avatar, 'hat');
  const accent = currentColor(avatar, 'accessory');
  const glasses = currentColor(avatar, 'glasses');
  const jaw = avatar.custom?.jaw ?? 0;
  const cheek = avatar.custom?.cheek ?? 0;
  const eyes = avatar.custom?.eyes ?? 0;
  const brows = avatar.custom?.brows ?? 0;
  const nose = avatar.custom?.nose ?? 0;
  const lips = avatar.custom?.lips ?? 0;
  const long = [2, 3, 7, 8].includes(avatar.pelo);
  const smile = ['Q68 65 72 60', 'Q68 70 73 59', 'L72 62', 'Q68 64 73 59', 'Q68 57 72 62', 'Q69 68 74 60', 'L71 60'][avatar.cara];
  const lens = avatar.lentes === 1 || avatar.lentes === 6 ? 5 : 2;
  return `<svg viewBox="0 0 136 114" aria-hidden="true">
    <circle cx="68" cy="59" r="46" fill="#0c2440" stroke="#376180"/>
    <circle cx="68" cy="59" r="42" fill="none" stroke="#214568" stroke-dasharray="2 5"/>
    ${long ? `<path fill="${hair}" d="M47 48Q48 27 68 28Q88 27 90 48L94 78L42 77Z"/>` : ''}
    <path fill="${cloth}" d="M26 112Q32 87 55 80L81 80Q104 87 110 112Z"/>
    <path fill="none" stroke="#d8eeff" stroke-opacity=".45" d="M39 105L46 91L58 86M97 105L90 91L79 86M68 91V112"/>
    ${avatar.ropa ? '<path fill="none" stroke="#c4eff4" stroke-opacity=".42" d="M32 100H49M88 100H104"/>' : ''}
    <path fill="${skin}" d="M60 72H76V85Q68 94 60 85Z"/>
    <ellipse cx="68" cy="55" rx="${19 + jaw * .8 + cheek * .2}" ry="23" fill="${skin}"/>
    ${avatar.pelo !== 5 ? `<path fill="${hair}" d="M48 51Q45 30 67 29Q91 31 87 52Q81 48 77 ${avatar.pelo === 1 ? 51 : 39}Q65 50 48 51Z"/>` : ''}
    ${[4, 6, 7, 9].includes(avatar.pelo) ? `<circle cx="${avatar.pelo === 7 ? 84 : 68}" cy="28" r="${avatar.pelo === 6 ? 14 : 7}" fill="${hair}"/>` : ''}
    <g fill="#241e2b"><circle cx="61" cy="55" r="${1.5 + eyes * .24}"/>${avatar.cara === 3 ? '<rect x="73" y="54" width="4" height="2" rx="1"/>' : `<circle cx="75" cy="55" r="${1.5 + eyes * .24}"/>`}</g>
    <path stroke="${hair}" stroke-width="1" stroke-linecap="round" fill="none" d="M58 ${50 - brows * .5}Q61 ${49 - brows * .5} 64 ${50 - brows * .5}M72 ${50 - brows * .5}Q75 ${49 - brows * .5} 78 ${50 - brows * .5}"/>
    <path stroke="#725244" stroke-opacity=".35" stroke-linecap="round" fill="none" d="M68 55L${66.5 - nose * .2} 59H${69 + nose * .3}"/>
    <path stroke="#5c2b32" stroke-width="${1.2 + lips * .15}" stroke-linecap="round" fill="none" d="M64 62 ${smile}"/>
    ${avatar.detalle === 1 ? '<path stroke="#6a4539" stroke-dasharray="1 2" d="M53 59H61M75 59H83"/>' : ''}
    ${[2, 3, 4].includes(avatar.detalle) ? `<path fill="${hair}" opacity=".8" d="M59 60Q68 56 77 60Q68 64 59 60Z${avatar.detalle > 2 ? 'M54 67Q68 78 82 67Q68 85 54 67Z' : ''}"/>` : ''}
    ${avatar.detalle === 5 ? '<circle cx="75" cy="62" r="1.2" fill="#6a4539"/>' : ''}
    ${avatar.detalle === 6 ? '<rect x="75" y="60" width="8" height="3" rx="1.5" fill="#ffb986"/>' : ''}
    ${avatar.gorro ? `<path fill="${hat}" stroke="#edf9ff" stroke-opacity=".4" d="${avatar.gorro === 1 ? 'M48 38Q68 24 88 38L87 43Q68 30 49 43Z' : avatar.gorro === 7 ? 'M49 38L48 25L57 31L68 20L78 30L88 25L86 38Z' : 'M47 41Q48 21 68 21Q88 21 89 41Z'}"/>` : ''}
    ${avatar.lentes ? `<g stroke="${glasses}" stroke-width="2.2" fill="${avatar.lentes >= 9 ? '#10253cbd' : 'none'}"><rect x="52" y="50" width="15" height="10" rx="${lens}"/><rect x="69" y="50" width="15" height="10" rx="${lens}"/><path d="M67 54H69"/></g>` : ''}
    ${avatar.acc ? `<path fill="${accent}" d="${avatar.acc < 3 ? 'M46 52H49V65H45ZM87 52H90V65H86Z' : 'M62 85H74L78 95L68 103L58 95Z'}"/>` : ''}
  </svg>`;
}

function currentColor(avatar: Avatar, key: AvatarColorKey): string {
  const base = fineColors[key].base;
  return avatar.custom?.[key] ?? AVATAR_OPTIONS[base][avatar[base]];
}

export function mountWardrobe(host: HTMLElement, options: {
  startFine?: boolean; startClothes?: boolean; onChange?: () => void;
} = {}) {
  let group = options.startFine ? groups.length : options.startClothes ? 3 : 0;
  const zoomLevels = [1, 1.25, 1.5, 1.75, 2, 2.25];
  let zoomLevel = 3;
  let preview: Preview | undefined;
  let selection: { key: AvatarKey; index: number } | undefined;
  let colorPreview: { key: AvatarColorKey; value: string } | undefined;
  let painted = '';
  let destroyed = false;
  let finePanel: 'traits' | 'colors' = 'traits';
  let layoutFrame = 0;
  let thumbnailFrame = 0;
  let thumbnailRun = 0;
  let revealKey: string | undefined;
  let thumbnails: ReturnType<typeof import('../render/thumbnails.ts').createAvatarThumbnails> | undefined;
  let thumbnailImport: Promise<void> | undefined;
  const thumbnailCache = new Map<string, string>();
  const scrollPositions = new Map<string, number>();
  const prefix = 'vestuario-' + ++wardrobeId;
  const scrollBehavior = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' as const : 'smooth' as const;
  syncWallet();
  host.innerHTML = `<section class="wardrobe-grid" aria-labelledby="wardrobe-heading">
    <div class="wardrobe-stage">
      <canvas class="wardrobe-canvas" aria-hidden="true" hidden></canvas>
      <div class="wardrobe-classic" aria-hidden="true"></div>
      <span class="wardrobe-badge"></span>
      <div class="wardrobe-turn" role="group" aria-label="Giro y zoom del avatar" hidden>
        <button type="button" data-wardrobe-turn="-1" aria-label="Girar a la izquierda">↶</button>
        <button type="button" data-wardrobe-turn="1" aria-label="Girar a la derecha">↷</button>
        <button type="button" data-wardrobe-zoom="-1" aria-label="Alejar" title="Alejar">−</button>
        <button type="button" data-wardrobe-zoom="1" aria-label="Acercar" title="Acercar">+</button>
      </div>
    </div>
    <div class="wardrobe-kit">
      <div class="wardrobe-carousel wardrobe-category-carousel">
        <div class="wardrobe-header"><h2 id="wardrobe-heading">Equipamiento</h2><b class="wardrobe-points"></b></div>
        <button type="button" class="wardrobe-prev" data-wardrobe-scroll="-1" aria-label="Categorías anteriores" aria-controls="${prefix}-categories">‹</button>
        <button type="button" class="wardrobe-next" data-wardrobe-scroll="1" aria-label="Categorías siguientes" aria-controls="${prefix}-categories">›</button>
        <div class="wardrobe-categories wardrobe-track" id="${prefix}-categories" data-wardrobe-track="categories" role="group" aria-label="Categorías del vestuario"></div>
      </div>
      <div class="wardrobe-options"></div>
      <div class="wardrobe-buy"></div>
      <p class="wardrobe-status" role="status"></p>
    </div>
  </section>`;
  const canvas = host.querySelector('canvas')!;
  const classic = host.querySelector<HTMLElement>('.wardrobe-classic')!;
  const turn = host.querySelector<HTMLElement>('.wardrobe-turn')!;
  const badge = host.querySelector<HTMLElement>('.wardrobe-badge')!;
  const kit = host.querySelector<HTMLElement>('.wardrobe-kit')!;
  const zoomOut = turn.querySelector<HTMLButtonElement>('[data-wardrobe-zoom="-1"]')!;
  const zoomIn = turn.querySelector<HTMLButtonElement>('[data-wardrobe-zoom="1"]')!;
  const rotationButtons = turn.querySelectorAll<HTMLButtonElement>('[data-wardrobe-turn]');
  const points = host.querySelector<HTMLElement>('.wardrobe-points')!;
  const categories = host.querySelector<HTMLElement>('.wardrobe-categories')!;
  const choices = host.querySelector<HTMLElement>('.wardrobe-options')!;
  const purchase = host.querySelector<HTMLElement>('.wardrobe-buy')!;
  const status = host.querySelector<HTMLElement>('.wardrobe-status')!;

  function displayed(): Avatar {
    if (colorPreview) return { ...profile.avatar, custom: { ...profile.avatar.custom, [colorPreview.key]: colorPreview.value } };
    return selection ? { ...profile.avatar, [selection.key]: selection.index } : profile.avatar;
  }

  function updatePortrait(): void {
    preview?.setView(group === 3 ? 'body' : 'portrait');
    const avatar = displayed();
    const fingerprint = JSON.stringify(avatar);
    if (fingerprint === painted) return;
    painted = fingerprint;
    if (preview) preview.update(avatar);
    else classic.innerHTML = classicPortrait(avatar);
  }

  function fallback(): void {
    preview?.destroy();
    preview = undefined;
    canvas.hidden = true;
    rotationButtons.forEach((button) => { button.hidden = true; });
    turn.hidden = false;
    classic.hidden = false;
    painted = '';
    updatePortrait();
  }

  function updateZoom(): void {
    const zoom = zoomLevels[zoomLevel];
    preview?.setZoom(zoom);
    classic.style.setProperty('--portrait-zoom', String(zoom));
    zoomOut.disabled = zoomLevel === 0;
    zoomIn.disabled = zoomLevel === zoomLevels.length - 1;
  }

  function carousel(key: string, label: string, items: string, classes = ''): string {
    const id = prefix + '-' + key;
    return `<div class="wardrobe-carousel">
      <span class="wardrobe-carousel-label" id="${id}-label">${html(label)}</span>
      <button type="button" class="wardrobe-prev" data-wardrobe-scroll="-1" aria-label="Opciones anteriores de ${html(label.toLowerCase())}" aria-controls="${id}">‹</button>
      <button type="button" class="wardrobe-next" data-wardrobe-scroll="1" aria-label="Opciones siguientes de ${html(label.toLowerCase())}" aria-controls="${id}">›</button>
      <div id="${id}" class="wardrobe-track ${classes}" data-wardrobe-track="${key}" role="group" aria-labelledby="${id}-label" tabindex="0">${items}</div>
    </div>`;
  }

  function updateArrows(track: HTMLElement): void {
    const wrap = track.parentElement!;
    const overflow = track.scrollWidth - track.clientWidth;
    wrap.querySelector<HTMLButtonElement>('.wardrobe-prev')!.disabled = track.scrollLeft <= 2;
    wrap.querySelector<HTMLButtonElement>('.wardrobe-next')!.disabled = overflow < 2 || track.scrollLeft >= overflow - 2;
  }

  function rememberScroll(): void {
    for (const track of host.querySelectorAll<HTMLElement>('[data-wardrobe-track]')) {
      if (track.clientWidth) scrollPositions.set(track.dataset.wardrobeTrack!, track.scrollLeft);
    }
  }

  function layoutCarousels(): void {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      if (destroyed) return;
      for (const track of host.querySelectorAll<HTMLElement>('[data-wardrobe-track]')) {
        if (!track.clientWidth) continue;
        const remembered = scrollPositions.get(track.dataset.wardrobeTrack!);
        const selected = track.querySelector<HTMLElement>('[aria-pressed="true"]');
        if (remembered !== undefined) track.scrollLeft = remembered;
        else if (selected) track.scrollLeft += selected.getBoundingClientRect().left - track.getBoundingClientRect().left - (track.clientWidth - selected.offsetWidth) * .5;
        if (selected && revealKey === track.dataset.wardrobeTrack) {
          const bounds = track.getBoundingClientRect(), item = selected.getBoundingClientRect();
          if (item.left < bounds.left) track.scrollLeft += item.left - bounds.left;
          else if (item.right > bounds.right) track.scrollLeft += item.right - bounds.right;
        }
        updateArrows(track);
      }
      revealKey = undefined;
    });
  }

  function pageTrack(track: HTMLElement, direction: number): void {
    const children = [...track.children] as HTMLElement[];
    const bounds = track.getBoundingClientRect();
    const boxes = children.map(child => child.getBoundingClientRect());
    let index: number;
    if (direction > 0) index = boxes.findIndex(box => box.right > bounds.right + 2);
    else {
      const first = boxes.findIndex(box => box.left >= bounds.left - 2);
      const visible = Math.max(1, boxes.filter(box => box.left >= bounds.left - 2 && box.right <= bounds.right + 2).length);
      index = Math.max(0, first - visible);
    }
    const target = boxes[index];
    const left = target ? track.scrollLeft + target.left - bounds.left : direction > 0 ? track.scrollWidth : 0;
    track.scrollTo({ left, behavior: scrollBehavior() });
  }

  function trackScroll(event: Event): void {
    const track = event.target;
    if (!(track instanceof HTMLElement) || !track.hasAttribute('data-wardrobe-track')) return;
    scrollPositions.set(track.dataset.wardrobeTrack!, track.scrollLeft);
    updateArrows(track);
  }

  function navigateTrack(event: KeyboardEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.matches('input')) return;
    const track = target.closest<HTMLElement>('[data-wardrobe-track]');
    if (!track || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...track.querySelectorAll<HTMLButtonElement>(':scope > button')];
    if (target instanceof HTMLButtonElement && buttons.length) {
      const current = buttons.indexOf(target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : Math.max(0, Math.min(buttons.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1)));
      buttons[next].focus({ preventScroll: true });
      buttons[next].scrollIntoView({ behavior: scrollBehavior(), block: 'nearest', inline: 'nearest' });
    } else {
      const left = event.key === 'Home' ? 0 : event.key === 'End' ? track.scrollWidth
        : track.scrollLeft + track.clientWidth * (event.key === 'ArrowRight' ? 1 : -1);
      track.scrollTo({ left, behavior: scrollBehavior() });
    }
    event.preventDefault();
  }

  function thumbnailAvatar(key: AvatarKey, index: number): Avatar {
    const next = { ...profile.avatar, [key]: index };
    if (key === 'pelo') return { ...next, gorro: 0, acc: 0 };
    return next;
  }

  function renderThumbnails(): void {
    cancelAnimationFrame(thumbnailFrame);
    const run = ++thumbnailRun;
    if (settings.quality === 'classic' || !choices.querySelector('[data-wardrobe-thumb]')) return;
    if (!thumbnails) {
      thumbnailImport ??= import('../render/thumbnails.ts').then(({ createAvatarThumbnails }) => {
        if (!destroyed) { thumbnails = createAvatarThumbnails(); renderThumbnails(); }
      }).catch(() => { /* Las miniaturas clásicas siguen mostrando cada opción. */ });
      return;
    }
    const cards = [...choices.querySelectorAll<HTMLButtonElement>('[data-wardrobe-piece]')];
    let index = 0;
    const next = () => {
      if (destroyed || run !== thumbnailRun) return;
      const card = cards[index++];
      if (!card) return;
      const image = card.querySelector<HTMLImageElement>('[data-wardrobe-thumb]');
      if (image) {
        const key = card.dataset.wardrobePiece as AvatarKey;
        const avatar = thumbnailAvatar(key, Number(card.dataset.wardrobeIndex));
        const crop = key === 'ropa' || (key === 'acc' && [3, 4, 5, 7].includes(avatar.acc)) ? 'body' : 'head';
        const fingerprint = crop + '/' + JSON.stringify(avatar);
        let url = thumbnailCache.get(fingerprint);
        try {
          if (!url) {
            url = thumbnails!.render(avatar, crop);
            thumbnailCache.set(fingerprint, url);
            if (thumbnailCache.size > 160) thumbnailCache.delete(thumbnailCache.keys().next().value!);
          }
          image.src = url;
          image.hidden = false;
          image.parentElement!.classList.add('is-ready');
        } catch { /* Conservá la miniatura clásica si WebGL deja de responder. */ }
      }
      thumbnailFrame = requestAnimationFrame(next);
    };
    thumbnailFrame = requestAnimationFrame(next);
  }

  function renderFine(): void {
    if (!choices.querySelector('.wardrobe-fine')) {
      choices.innerHTML = `<div class="wardrobe-fine">
        <div class="wardrobe-fine-tabs" role="group" aria-label="Tipo de ajuste">
          <button type="button" data-wardrobe-fine-panel="traits" aria-pressed="true">Rasgos</button>
          <button type="button" data-wardrobe-fine-panel="colors" aria-pressed="false">Colores</button>
        </div>
        <fieldset class="wardrobe-section wardrobe-fine-pane" data-wardrobe-pane="traits"><legend>Rasgos de la cara</legend>
          ${carousel('rasgos', 'Rasgos de la cara', faceKeys.map(key => `<label class="wardrobe-slider">
            <span>${faceOptions[key].name}<output data-wardrobe-level="${key}"></output></span>
            <input type="range" min="-2" max="2" step="1" value="0" aria-label="${faceOptions[key].name}" data-wardrobe-face="${key}">
          </label>`).join(''), 'wardrobe-sliders wardrobe-fine-track')}
        </fieldset>
        <fieldset class="wardrobe-section wardrobe-fine-pane" data-wardrobe-pane="colors" hidden><legend>Colores personalizados</legend>
          ${carousel('colores', 'Colores personalizados', colorKeys.map(key => `<div class="wardrobe-color">
            <b>${fineColors[key].name}</b>
            <input type="color" data-wardrobe-color="${key}" aria-label="Elegí color personalizado para ${fineColors[key].name.toLowerCase()}">
            <input type="text" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false"
              data-wardrobe-hex="${key}" aria-label="Código hex de ${fineColors[key].name.toLowerCase()}" pattern="#?[0-9A-Fa-f]{6}">
          </div>`).join(''), 'wardrobe-colors wardrobe-fine-track')}
        </fieldset>
        <button class="quiet wardrobe-reset" type="button" data-wardrobe-reset>Restablecer ajuste fino</button>
      </div>`;
    }
    for (const pane of choices.querySelectorAll<HTMLElement>('[data-wardrobe-pane]')) pane.hidden = pane.dataset.wardrobePane !== finePanel;
    for (const tab of choices.querySelectorAll('[data-wardrobe-fine-panel]')) tab.setAttribute('aria-pressed', String(tab.getAttribute('data-wardrobe-fine-panel') === finePanel));
    for (const key of faceKeys) {
      const value = profile.avatar.custom?.[key] ?? 0;
      const input = choices.querySelector<HTMLInputElement>(`[data-wardrobe-face="${key}"]`)!;
      const level = faceOptions[key].levels[value + 2];
      input.value = String(value);
      input.setAttribute('aria-valuetext', level);
      choices.querySelector<HTMLOutputElement>(`[data-wardrobe-level="${key}"]`)!.textContent = level;
    }
    for (const key of colorKeys) {
      const value = currentColor(profile.avatar, key);
      choices.querySelector<HTMLInputElement>(`[data-wardrobe-color="${key}"]`)!.value = value;
      const hex = choices.querySelector<HTMLInputElement>(`[data-wardrobe-hex="${key}"]`)!;
      if (hex !== document.activeElement) hex.value = value;
    }
  }

  function refresh(): void {
    if (destroyed) return;
    rememberScroll();
    badge.textContent = selection ? 'Vista previa' : 'Tu tripulante';
    points.textContent = `${wallet.points} ${wallet.points === 1 ? 'punto' : 'puntos'}`;
    if (!categories.children.length) categories.innerHTML = [...groups.map(({ label }) => label), fineGroup].map((label, index) =>
      `<button type="button" data-wardrobe-group="${index}">${html(label)}</button>`,
    ).join('');
    [...categories.children].forEach((button, index) => button.setAttribute('aria-pressed', String(group === index)));
    if (group === groups.length) renderFine();
    else {
      const parts = groups[group].parts;
      const availability = parts.map(({ key }) => AVATAR_OPTIONS[key].map((_, index) => ownsPiece(key, index)));
      const catalog = JSON.stringify({ group, availability });
      if (choices.dataset.catalog !== catalog || !choices.querySelector('.wardrobe-items')) {
        choices.innerHTML = parts.map(({ key, label, color }) => {
          const values = AVATAR_OPTIONS[key];
          const names: readonly string[] = color ? AVATAR_COLOR_NAMES[key as Colors] : values;
          const items = values.map((value, index) => {
            const locked = !ownsPiece(key, index);
            const price = locked ? priceOf(key, index) : 0;
            const name = names[index];
            return `<button type="button" class="wardrobe-option${color ? ' swatch' : ''}" data-wardrobe-piece="${key}" data-wardrobe-index="${index}" aria-pressed="false" aria-label="${html(name)}${locked ? ', bloqueado por ' + price + ' puntos' : ''}">
              ${color ? `<span class="wardrobe-swatch" style="--swatch:${value}"></span>`
                : `<span class="wardrobe-thumb-frame" aria-hidden="true">${classicPortrait(thumbnailAvatar(key, index))}<img class="wardrobe-thumbnail" data-wardrobe-thumb alt="" hidden></span>`}
              <span>${html(name)}</span>${locked ? `<small>${price} pts</small>` : ''}
              <span class="wardrobe-equipped" aria-hidden="true">✓ ${color ? 'Aplicado' : 'Equipado'}</span>
            </button>`;
          }).join('');
          return `<fieldset class="wardrobe-section"><legend>${html(label)}</legend>${carousel(key, label, items, 'wardrobe-items')}
            <p class="wardrobe-custom-label" hidden></p></fieldset>`;
        }).join('');
        choices.dataset.catalog = catalog;
      }
      for (const { key } of parts) {
        const colorKey = customColorSlot[key];
        const custom = colorKey && profile.avatar.custom?.[colorKey];
        const equipped = custom ? -1 : profile.avatar[key];
        const selected = selection?.key === key ? selection.index : equipped;
        const track = choices.querySelector<HTMLElement>(`[data-wardrobe-track="${key}"]`)!;
        for (const card of track.querySelectorAll<HTMLButtonElement>('[data-wardrobe-index]')) {
          const index = Number(card.dataset.wardrobeIndex);
          card.setAttribute('aria-pressed', String(index === selected));
          card.dataset.equipped = String(index === equipped && ownsPiece(key, index));
          const frame = card.querySelector<HTMLElement>('.wardrobe-thumb-frame');
          if (frame) {
            const avatar = thumbnailAvatar(key, index);
            const signature = JSON.stringify(avatar);
            if (frame.dataset.avatar !== signature) {
              frame.querySelector('svg')!.outerHTML = classicPortrait(avatar);
              frame.dataset.avatar = signature;
            }
          }
        }
        const hint = track.closest('fieldset')!.querySelector<HTMLElement>('.wardrobe-custom-label')!;
        hint.hidden = !custom;
        hint.textContent = custom ? 'Personalizado · ' + custom : '';
      }
    }
    if (selection) {
      const { key, index } = selection;
      const price = priceOf(key, index);
      const name = AVATAR_OPTIONS[key][index];
      const missing = price - wallet.points;
      purchase.innerHTML = `<div><b>${html(name)}</b><span>${missing === 1 ? 'Te falta 1 punto.' : missing > 1 ? `Te faltan ${missing} puntos.` : `Cuesta ${price} puntos.`}</span></div><button class="primary" type="button" data-wardrobe-buy ${missing > 0 ? 'disabled' : ''}>Desbloquear y equipar</button>`;
    } else purchase.replaceChildren();
    updatePortrait();
    layoutCarousels();
    renderThumbnails();
  }

  function setFineColor(input: HTMLInputElement, key: AvatarColorKey, action: 'preview' | 'save'): void {
    const hex = input.value.trim().replace(/^#/, '').toUpperCase();
    if (/^[0-9A-F]{6}$/.test(hex)) {
      const value = '#' + hex;
      status.textContent = '';
      input.removeAttribute('aria-invalid');
      if (action === 'preview') {
        colorPreview = { key, value };
        updatePortrait();
      } else {
        colorPreview = undefined;
        input.value = value;
        saveAvatarCustom({ ...profile.avatar.custom, [key]: value });
        options.onChange?.();
        refresh();
        status.textContent = 'Guardaste el color de ' + fineColors[key].name.toLowerCase() + '.';
      }
    } else {
      colorPreview = undefined;
      updatePortrait();
      if (action === 'save') {
        input.setAttribute('aria-invalid', 'true');
        status.textContent = 'Ingresá seis dígitos hexadecimales, por ejemplo #49E3E7.';
      }
    }
  }

  function fineInput(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const face = input.dataset.wardrobeFace as AvatarFaceKey | undefined;
    const color = (input.dataset.wardrobeColor ?? input.dataset.wardrobeHex) as AvatarColorKey | undefined;
    if (face && Object.hasOwn(faceOptions, face)) {
      saveAvatarCustom({ ...profile.avatar.custom, [face]: Number(input.value) });
      options.onChange?.();
      refresh();
    } else if (color && Object.hasOwn(fineColors, color)) {
      setFineColor(input, color, event.type === 'change' ? 'save' : 'preview');
    }
  }

  function confirmHex(event: KeyboardEvent): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || event.key !== 'Enter') return;
    const key = input.dataset.wardrobeHex as AvatarColorKey | undefined;
    if (!key || !Object.hasOwn(fineColors, key)) return;
    event.preventDefault();
    setFineColor(input, key, 'save');
  }

  function click(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.dataset.wardrobeScroll) {
      const track = button.parentElement!.querySelector<HTMLElement>('[data-wardrobe-track]')!;
      pageTrack(track, Number(button.dataset.wardrobeScroll));
      return;
    }
    const fine = button.dataset.wardrobeFinePanel;
    if (fine === 'traits' || fine === 'colors') {
      rememberScroll();
      finePanel = fine;
      renderFine();
      layoutCarousels();
      return;
    }
    if (button.dataset.wardrobeZoom) {
      zoomLevel = Math.max(0, Math.min(zoomLevels.length - 1, zoomLevel + Number(button.dataset.wardrobeZoom)));
      updateZoom();
      return;
    }
    if (button.dataset.wardrobeGroup !== undefined) {
      group = Number(button.dataset.wardrobeGroup);
      selection = undefined;
      colorPreview = undefined;
      status.textContent = '';
      revealKey = 'categories';
      refresh();
      categories.querySelector<HTMLButtonElement>(`[data-wardrobe-group="${group}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (button.hasAttribute('data-wardrobe-reset')) {
      colorPreview = undefined;
      saveAvatarCustom();
      options.onChange?.();
      button.focus({ preventScroll: true });
      for (const input of choices.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
      status.textContent = 'Restableciste los rasgos y colores personalizados.';
      refresh();
      return;
    }
    if (button.dataset.wardrobeTurn) {
      preview?.rotateBy(Number(button.dataset.wardrobeTurn) * Math.PI / 6);
      return;
    }
    const key = button.dataset.wardrobePiece as AvatarKey | undefined;
    const index = Number(button.dataset.wardrobeIndex);
    if (key && Number.isFinite(priceOf(key, index))) {
      selection = undefined;
      if (equipPiece(key, index)) {
        options.onChange?.();
        status.textContent = 'Guardaste tu elección.';
      } else {
        selection = { key, index };
        status.textContent = 'Vista previa de una pieza bloqueada.';
      }
      revealKey = key;
      refresh();
      choices.querySelector<HTMLButtonElement>(`[data-wardrobe-piece="${key}"][data-wardrobe-index="${index}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (button.hasAttribute('data-wardrobe-buy') && selection) {
      const { key, index } = selection;
      const result = unlockPiece(key, index);
      if (result === 'comprado' || result === 'equipado') {
        selection = undefined;
        options.onChange?.();
        status.textContent = result === 'comprado' ? 'Pieza desbloqueada y equipada.' : 'Pieza equipada.';
      } else status.textContent = 'Te faltan puntos para desbloquear esta pieza.';
      refresh();
      choices.querySelector<HTMLButtonElement>(`[data-wardrobe-piece="${key}"][data-wardrobe-index="${index}"]`)?.focus({ preventScroll: true });
    }
  }

  function sync(event: StorageEvent): void {
    if (event.key !== 'odisea-3d-puntos') return;
    syncWallet();
    refresh();
  }

  host.addEventListener('click', click);
  host.addEventListener('scroll', trackScroll, true);
  host.addEventListener('keydown', navigateTrack);
  const resizeObserver = new ResizeObserver(layoutCarousels);
  resizeObserver.observe(kit);
  choices.addEventListener('input', fineInput);
  choices.addEventListener('change', fineInput);
  choices.addEventListener('keydown', confirmHex);
  window.addEventListener('storage', sync);
  canvas.addEventListener('webglcontextlost', fallback);
  updateZoom();
  refresh();
  if (settings.quality !== 'classic') {
    void import('../render/preview.ts').then(({ mountAvatarPreview }) => {
      if (destroyed) return;
      canvas.hidden = false;
      preview = mountAvatarPreview(canvas, displayed(), zoomLevels[zoomLevel]);
      preview.setView(group === 3 ? 'body' : 'portrait');
      classic.hidden = true;
      turn.hidden = false;
    }).catch(() => { if (!destroyed) fallback(); });
  } else fallback();

  return {
    refresh,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(layoutFrame);
      cancelAnimationFrame(thumbnailFrame);
      resizeObserver.disconnect();
      thumbnails?.destroy();
      host.removeEventListener('click', click);
      host.removeEventListener('scroll', trackScroll, true);
      host.removeEventListener('keydown', navigateTrack);
      choices.removeEventListener('input', fineInput);
      choices.removeEventListener('change', fineInput);
      choices.removeEventListener('keydown', confirmHex);
      window.removeEventListener('storage', sync);
      canvas.removeEventListener('webglcontextlost', fallback);
      preview?.destroy();
      host.replaceChildren();
    },
  };
}
