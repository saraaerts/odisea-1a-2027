import { cleanAvatar, isAreaId } from '../config.ts';
import { decodeAction, decodeState, type GameAction, type GameState, type Player } from '../sim/index.ts';
import { isPeerId, isRecord, jsonBytes } from './room.ts';

export const MAX_BODY_BYTES = 3910;
const sessionCode = /^[a-z0-9][a-z0-9-]{2,16}[a-z0-9]$/;
const gidPattern = /^[a-z0-9_-]{1,20}$/i;

export function cleanCode(raw: string): string {
  const code = raw.trim().toLowerCase();
  if (!sessionCode.test(code)) throw new Error('Ingresá un código de 4 a 18 caracteres con letras, números o guiones internos.');
  return code;
}

export function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function cleanPlayer(peer: string, raw: unknown): Player | null {
  if (!isPeerId(peer) || !isRecord(raw) || !isAreaId(raw.area) || typeof raw.name !== 'string') return null;
  const name = Array.from(raw.name.slice(0, 180).replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim())
    .slice(0, 18).join('') || 'Tripulante';
  return { id: peer, name, area: raw.area, avatar: cleanAvatar(raw.avatar) };
}

export type ActionPacket = { g: string; n: number; a: GameAction };
export type Ack = [peer: string, latest: number, bits: number];

export function readAction(value: unknown): ActionPacket | null {
  if (!isRecord(value) || typeof value.g !== 'string' || !gidPattern.test(value.g) ||
    !integer(value.n, 1, 1_000_000) ||
    jsonBytes(value) >= MAX_BODY_BYTES) return null;
  const action = decodeAction(value.a);
  return action ? { g: value.g, n: value.n, a: action } : null;
}

export function acknowledged(ack: Ack | undefined, seq: number): boolean {
  if (!ack || seq > ack[1]) return false;
  const offset = ack[1] - seq;
  return offset >= 32 || ((ack[2] >>> offset) & 1) === 1;
}

export function addAck(acks: Ack[], peer: string, seq: number): void {
  const ack = acks.find(row => row[0] === peer);
  if (!ack) {
    acks.push([peer, seq, 1]);
  } else if (seq > ack[1]) {
    const offset = seq - ack[1];
    ack[1] = seq;
    ack[2] = offset >= 32 ? 1 : ((ack[2] << offset) | 1) >>> 0;
  } else if (ack[1] - seq < 32) {
    ack[2] = (ack[2] | (1 << (ack[1] - seq))) >>> 0;
  }
}

export interface SnapshotPacket {
  e: number;
  r: number;
  a: Ack[];
  s: GameState;
}

export function readSnapshot(value: unknown): SnapshotPacket | null {
  if (!isRecord(value) || !integer(value.e, 0, 1_000_000) || !integer(value.r, 1, 1_000_000) ||
    !Array.isArray(value.a) || value.a.length > 4 || jsonBytes(value) >= MAX_BODY_BYTES) return null;
  const game = decodeState(value.s);
  if (!game || game.players.length > 4) return null;
  const acks: Ack[] = [];
  for (const ack of value.a) {
    if (!Array.isArray(ack) || ack.length !== 3 || !isPeerId(ack[0]) ||
      !game.players.some(player => player.id === ack[0]) || acks.some(previous => previous[0] === ack[0]) ||
      !integer(ack[1], 1, 1_000_000) || !integer(ack[2], 1, 0xffffffff) || (ack[2] & 1) === 0) {
      return null;
    }
    acks.push([ack[0], ack[1], ack[2]]);
  }
  for (const player of game.players) {
    const clean = cleanPlayer(player.id, player);
    if (!clean) return null;
    player.name = clean.name;
    player.avatar = clean.avatar;
  }
  return { e: value.e, r: value.r, a: acks, s: game };
}

const phases = ['lobby', 'between', 'play', 'end', 'closed'] as const;
const alerts = ['ok', 'err', 'fail', 'help', 'out', 'boom', 'stage'] as const;

export interface BoardSummary {
  code: string;
  gid: string;
  host: string;
  epoch: number;
  rev: number;
  stage: number;
  phase: typeof phases[number];
  fleet: number;
  hull: number;
  errors: number;
  broken: boolean;
  done: number;
  need: number;
  fires: number;
  players: Pick<Player, 'area' | 'avatar'>[];
  events: { id: number; kind: typeof alerts[number] }[];
}

export function readSummary(value: unknown, peer: string): BoardSummary | null {
  if (!isRecord(value) || !isPeerId(peer) || typeof value.code !== 'string' || !sessionCode.test(value.code) ||
    typeof value.gid !== 'string' || !gidPattern.test(value.gid) || !integer(value.epoch, 0, 1_000_000) ||
    !integer(value.rev, 1, 1_000_000) || !integer(value.stage, 0, 7) ||
    typeof value.phase !== 'string' || !phases.includes(value.phase as BoardSummary['phase']) ||
    !integer(value.fleet, 0, 40) || !integer(value.hull, 0, 100) || !integer(value.errors, 0, 20_000) ||
    typeof value.broken !== 'boolean' || !integer(value.done, 0, 18) || !integer(value.need, 0, 18) ||
    !integer(value.fires, 0, 40) || !Array.isArray(value.players) || value.players.length > 4 ||
    !Array.isArray(value.events) || value.events.length > 6 || jsonBytes(value) >= MAX_BODY_BYTES) return null;
  const players: BoardSummary['players'] = [];
  const events: BoardSummary['events'] = [];
  for (const row of value.players) {
    if (!isRecord(row) || !isAreaId(row.area)) return null;
    players.push({ area: row.area, avatar: cleanAvatar(row.avatar) });
  }
  for (const event of value.events) {
    if (!isRecord(event) || !integer(event.id, 1, 1_000_000) || typeof event.kind !== 'string' ||
      !alerts.includes(event.kind as BoardSummary['events'][number]['kind'])) return null;
    events.push({ id: event.id, kind: event.kind as BoardSummary['events'][number]['kind'] });
  }
  return {
    code: value.code, gid: value.gid, host: peer, epoch: value.epoch, rev: value.rev, stage: value.stage,
    phase: value.phase as BoardSummary['phase'], fleet: value.fleet, hull: value.hull, errors: value.errors,
    broken: value.broken, done: value.done, need: value.need, fires: value.fires, players, events,
  };
}
