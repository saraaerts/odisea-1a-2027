import {
  AVATAR_OPTIONS, AVATAR_PRICES, CONFIG, POINTS, cleanAvatar, cleanAvatarCustom, isAreaId,
  type AreaId, type Avatar, type AvatarColorKey, type AvatarCustom,
} from '../config.ts';

export interface Profile { name: string; area: AreaId; avatar: Avatar }
interface Wallet { points: number; paid: string[]; owned: string[] }
const PROFILE_KEY = 'odisea-3d-perfil';
const WALLET_KEY = 'odisea-3d-puntos';
const load = (key: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
};
const save = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* navegación privada */ }
};
export function alias(value: unknown) {
  return typeof value === 'string' ? Array.from(value.replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim()).slice(0, 18).join('') : '';
}
const old = load('odisea-jugador');
const raw = load(PROFILE_KEY) ?? old;
function classicAvatar(raw: unknown): Avatar {
  const { style: _retiredStyle, ...avatar } = cleanAvatar(raw);
  return avatar;
}
export const profile: Profile = {
  name: alias(raw?.name ?? raw?.nombre),
  area: isAreaId(raw?.area) ? raw.area : CONFIG.areas[0].id,
  avatar: classicAvatar(raw?.avatar ?? raw?.av),
};

type PieceKey = keyof typeof AVATAR_OPTIONS;
const keys = Object.keys(AVATAR_OPTIONS) as PieceKey[];
const prices: Partial<Record<PieceKey, readonly number[]>> = AVATAR_PRICES;
export const customColorSlot: Partial<Record<PieceKey, AvatarColorKey>> = {
  piel: 'skin', colorPelo: 'hair', colorRopa: 'suit', colorGorro: 'hat', colorAcc: 'accessory', colorLentes: 'glasses',
};
const pieceId = (key: PieceKey, index: number) => key + ':' + index;
const purchasable = new Set(keys.flatMap(key =>
  AVATAR_OPTIONS[key].flatMap((_, index) => (prices[key]?.[index] ?? 0) > 0 ? [pieceId(key, index)] : []),
));
const validGameId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(value);

function readWallet(raw: Record<string, unknown> | null): Wallet {
  const points = raw?.points ?? raw?.puntos;
  const paid = raw?.paid ?? raw?.games;
  const owned = raw?.owned ?? raw?.unlocked;
  return {
    points: typeof points === 'number' && Number.isSafeInteger(points) ? Math.max(0, points) : 0,
    paid: Array.isArray(paid) ? [...new Set(paid.filter(validGameId))] : [],
    owned: Array.isArray(owned) ? [...new Set(owned.filter(key => typeof key === 'string' && purchasable.has(key)))] : [],
  };
}

export const wallet = readWallet(load(WALLET_KEY) ?? load('odisea-puntos'));

export function syncWallet(): void {
  const stored = load(WALLET_KEY);
  if (stored) Object.assign(wallet, readWallet(stored));
}

export function priceOf(key: PieceKey, index: number): number {
  if (!Object.hasOwn(AVATAR_OPTIONS, key) || !Number.isInteger(index) || index < 0 || index >= AVATAR_OPTIONS[key].length) {
    return Infinity;
  }
  return prices[key]?.[index] ?? 0;
}

export function ownsPiece(key: PieceKey, index: number): boolean {
  const price = priceOf(key, index);
  return price === 0 || (Number.isFinite(price) && wallet.owned.includes(pieceId(key, index)));
}

for (const key of keys) if (!ownsPiece(key, profile.avatar[key])) profile.avatar = { ...profile.avatar, [key]: 0 };

export function saveProfile() {
  profile.avatar = classicAvatar(profile.avatar);
  save(PROFILE_KEY, profile);
}
export function saveWallet() { save(WALLET_KEY, wallet); }

export function saveAvatarCustom(custom?: AvatarCustom): void {
  const { custom: _previous, ...base } = profile.avatar;
  const cleaned = cleanAvatarCustom(custom);
  profile.avatar = cleaned ? { ...base, custom: cleaned } : base;
  saveProfile();
}

export function equipPiece(key: PieceKey, index: number): boolean {
  if (!ownsPiece(key, index)) return false;
  profile.avatar = { ...profile.avatar, [key]: index };
  const color = customColorSlot[key];
  if (color && profile.avatar.custom?.[color]) {
    const custom = { ...profile.avatar.custom };
    delete custom[color];
    saveAvatarCustom(custom);
  } else saveProfile();
  return true;
}

export function unlockPiece(key: PieceKey, index: number): 'comprado' | 'equipado' | 'sin saldo' | 'inválido' {
  const price = priceOf(key, index);
  if (!Number.isFinite(price)) return 'inválido';
  syncWallet();
  if (ownsPiece(key, index)) {
    equipPiece(key, index);
    return 'equipado';
  }
  if (wallet.points < price) return 'sin saldo';
  wallet.points -= price;
  wallet.owned.push(pieceId(key, index));
  saveWallet();
  equipPiece(key, index);
  return 'comprado';
}

export function award(gid: string, points: number) {
  if (!validGameId(gid) || !Object.values<number>(POINTS).includes(points)) return;
  syncWallet();
  if (wallet.paid.includes(gid)) return;
  wallet.points = Math.min(Number.MAX_SAFE_INTEGER, wallet.points + points);
  wallet.paid.push(gid);
  saveWallet();
}
export type Quality = 'auto' | 'high' | 'medium' | 'low' | 'classic';
const prefs = load('odisea-3d-config');
const qualities: readonly unknown[] = ['auto', 'high', 'medium', 'low', 'classic'];
export const settings: { quality: Quality; muted: boolean; intense: boolean; motion: boolean } = {
  quality: qualities.includes(prefs?.quality) ? prefs?.quality as Quality : 'auto',
  muted: prefs?.muted !== false,
  intense: prefs?.intense !== false,
  motion: prefs?.motion !== false,
};
export function saveSettings() { save('odisea-3d-config', settings); }
