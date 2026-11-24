import { AVATAR_COLOR_NAMES, AVATAR_OPTIONS, type Avatar } from '../config.ts';
import { html } from './dom.ts';
import { equipPiece, ownsPiece, priceOf, profile, settings, syncWallet, unlockPiece, wallet } from './profile.ts';
import './wardrobe.css';

type AvatarKey = keyof Avatar;
type Colors = keyof typeof AVATAR_COLOR_NAMES;
type Group = { label: string; parts: { key: AvatarKey; label: string; color?: true }[] };
type Preview = { update(avatar: Avatar): void; destroy(): void };

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
  const skin = AVATAR_OPTIONS.piel[avatar.piel];
  const hair = AVATAR_OPTIONS.colorPelo[avatar.colorPelo];
  const cloth = AVATAR_OPTIONS.colorRopa[avatar.colorRopa];
  const hat = AVATAR_OPTIONS.colorGorro[avatar.colorGorro];
  const accent = AVATAR_OPTIONS.colorAcc[avatar.colorAcc];
  const glasses = AVATAR_OPTIONS.colorLentes[avatar.colorLentes];
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
    <ellipse cx="68" cy="55" rx="19" ry="23" fill="${skin}"/>
    ${avatar.pelo !== 5 ? `<path fill="${hair}" d="M48 51Q45 30 67 29Q91 31 87 52Q81 48 77 ${avatar.pelo === 1 ? 51 : 39}Q65 50 48 51Z"/>` : ''}
    ${[4, 6, 7, 9].includes(avatar.pelo) ? `<circle cx="${avatar.pelo === 7 ? 84 : 68}" cy="28" r="${avatar.pelo === 6 ? 14 : 7}" fill="${hair}"/>` : ''}
    <g fill="#241e2b"><circle cx="61" cy="55" r="1.5"/>${avatar.cara === 3 ? '<rect x="73" y="54" width="4" height="2" rx="1"/>' : '<circle cx="75" cy="55" r="1.5"/>'}</g>
    <path stroke="#5c2b32" stroke-width="1.2" stroke-linecap="round" fill="none" d="M64 62 ${smile}"/>
    ${avatar.detalle === 1 ? '<path stroke="#6a4539" stroke-dasharray="1 2" d="M53 59H61M75 59H83"/>' : ''}
    ${[2, 3, 4].includes(avatar.detalle) ? `<path fill="${hair}" opacity=".8" d="M59 60Q68 56 77 60Q68 64 59 60Z${avatar.detalle > 2 ? 'M54 67Q68 78 82 67Q68 85 54 67Z' : ''}"/>` : ''}
    ${avatar.detalle === 5 ? '<circle cx="75" cy="62" r="1.2" fill="#6a4539"/>' : ''}
    ${avatar.detalle === 6 ? '<rect x="75" y="60" width="8" height="3" rx="1.5" fill="#ffb986"/>' : ''}
    ${avatar.gorro ? `<path fill="${hat}" stroke="#edf9ff" stroke-opacity=".4" d="${avatar.gorro === 1 ? 'M48 38Q68 24 88 38L87 43Q68 30 49 43Z' : avatar.gorro === 7 ? 'M49 38L48 25L57 31L68 20L78 30L88 25L86 38Z' : 'M47 41Q48 21 68 21Q88 21 89 41Z'}"/>` : ''}
    ${avatar.lentes ? `<g stroke="${glasses}" stroke-width="2.2" fill="${avatar.lentes >= 9 ? '#10253cbd' : 'none'}"><rect x="52" y="50" width="15" height="10" rx="${lens}"/><rect x="69" y="50" width="15" height="10" rx="${lens}"/><path d="M67 54H69"/></g>` : ''}
    ${avatar.acc ? `<path fill="${accent}" d="${avatar.acc < 3 ? 'M46 52H49V65H45ZM87 52H90V65H86Z' : 'M62 85H74L78 95L68 103L58 95Z'}"/>` : ''}
  </svg>`;
}

export function mountWardrobe(host: HTMLElement, options: { onChange?: () => void } = {}) {
  let group = 0;
  let preview: Preview | undefined;
  let selection: { key: AvatarKey; index: number } | undefined;
  let painted = '';
  let destroyed = false;
  syncWallet();
  host.innerHTML = `<section class="wardrobe-grid" aria-labelledby="wardrobe-heading">
    <div class="wardrobe-stage">
      <canvas class="wardrobe-canvas" aria-hidden="true" hidden></canvas>
      <div class="wardrobe-classic" aria-hidden="true"></div>
      <span class="wardrobe-badge">Tu tripulante</span>
    </div>
    <div class="wardrobe-kit">
      <div class="wardrobe-header"><h2 id="wardrobe-heading">Equipamiento</h2><b class="wardrobe-points"></b></div>
      <div class="wardrobe-categories" role="group" aria-label="Categorías del vestuario"></div>
      <div class="wardrobe-options"></div>
      <div class="wardrobe-buy"></div>
      <p class="wardrobe-status" role="status"></p>
    </div>
  </section>`;
  const canvas = host.querySelector('canvas')!;
  const classic = host.querySelector<HTMLElement>('.wardrobe-classic')!;
  const points = host.querySelector<HTMLElement>('.wardrobe-points')!;
  const categories = host.querySelector<HTMLElement>('.wardrobe-categories')!;
  const choices = host.querySelector<HTMLElement>('.wardrobe-options')!;
  const purchase = host.querySelector<HTMLElement>('.wardrobe-buy')!;
  const status = host.querySelector<HTMLElement>('.wardrobe-status')!;

  const displayed = () => selection
    ? { ...profile.avatar, [selection.key]: selection.index }
    : profile.avatar;

  function updatePortrait(): void {
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
    classic.hidden = false;
    painted = '';
    updatePortrait();
  }

  function refresh(): void {
    if (destroyed) return;
    points.textContent = `${wallet.points} ${wallet.points === 1 ? 'punto' : 'puntos'}`;
    categories.innerHTML = groups.map(({ label }, index) =>
      `<button type="button" data-wardrobe-group="${index}" aria-pressed="${group === index}">${html(label)}</button>`,
    ).join('');
    choices.innerHTML = groups[group].parts.map(({ key, label, color }) => {
      const options = AVATAR_OPTIONS[key];
      const selected = selection?.key === key ? selection.index : profile.avatar[key];
      const names: readonly string[] = color ? AVATAR_COLOR_NAMES[key as Colors] : options;
      const items = options.map((value, index) => {
        const locked = !ownsPiece(key, index);
        const price = locked ? priceOf(key, index) : 0;
        const name = names[index];
        return `<button type="button" class="wardrobe-option${color ? ' swatch' : ''}" data-wardrobe-piece="${key}" data-wardrobe-index="${index}" aria-pressed="${index === selected}"${color || locked ? ` aria-label="${html(name)}${locked ? ', bloqueado por ' + price + ' puntos' : ''}"` : ''}>
          ${color ? `<span class="wardrobe-swatch" style="--swatch:${value}"></span>` : ''}
          <span>${html(name)}</span>${locked ? `<small>${price} pts</small>` : ''}
        </button>`;
      }).join('');
      return `<fieldset class="wardrobe-section"><legend>${html(label)}</legend><div class="wardrobe-items">${items}</div></fieldset>`;
    }).join('');
    if (selection) {
      const { key, index } = selection;
      const price = priceOf(key, index);
      const name = AVATAR_OPTIONS[key][index];
      const missing = price - wallet.points;
      purchase.innerHTML = `<div><b>${html(name)}</b><span>${missing === 1 ? 'Te falta 1 punto.' : missing > 1 ? `Te faltan ${missing} puntos.` : `Cuesta ${price} puntos.`}</span></div><button class="primary" type="button" data-wardrobe-buy ${missing > 0 ? 'disabled' : ''}>Desbloquear y equipar</button>`;
    } else purchase.replaceChildren();
    updatePortrait();
  }

  function click(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.dataset.wardrobeGroup !== undefined) {
      group = Number(button.dataset.wardrobeGroup);
      selection = undefined;
      status.textContent = '';
      refresh();
      categories.querySelector<HTMLButtonElement>(`[data-wardrobe-group="${group}"]`)?.focus();
      return;
    }
    const key = button.dataset.wardrobePiece as AvatarKey | undefined;
    const index = Number(button.dataset.wardrobeIndex);
    if (key && Number.isFinite(priceOf(key, index))) {
      selection = undefined;
      if (equipPiece(key, index)) {
        options.onChange?.();
        status.textContent = '';
      } else {
        selection = { key, index };
        status.textContent = 'Vista previa de una pieza bloqueada.';
      }
      refresh();
      choices.querySelector<HTMLButtonElement>(`[data-wardrobe-piece="${key}"][data-wardrobe-index="${index}"]`)?.focus();
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
      choices.querySelector<HTMLButtonElement>(`[data-wardrobe-piece="${key}"][data-wardrobe-index="${index}"]`)?.focus();
    }
  }

  function sync(event: StorageEvent): void {
    if (event.key !== 'odisea-3d-puntos') return;
    syncWallet();
    refresh();
  }

  host.addEventListener('click', click);
  window.addEventListener('storage', sync);
  canvas.addEventListener('webglcontextlost', fallback);
  refresh();
  if (settings.quality !== 'classic') {
    void import('../render/preview.ts').then(({ mountAvatarPreview }) => {
      if (destroyed) return;
      canvas.hidden = false;
      preview = mountAvatarPreview(canvas, displayed());
      classic.hidden = true;
    }).catch(() => { if (!destroyed) fallback(); });
  }

  return {
    refresh,
    destroy() {
      destroyed = true;
      host.removeEventListener('click', click);
      window.removeEventListener('storage', sync);
      canvas.removeEventListener('webglcontextlost', fallback);
      preview?.destroy();
      host.replaceChildren();
    },
  };
}
