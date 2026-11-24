import {
  AVATAR_OPTIONS, CONFIG, CONTROLS, MAX_PLAYERS, PASS_SHIPS, POINTS, cleanAvatar, isAreaId,
  type AreaId, type Avatar, type Control,
} from "../config.ts";

export const RULES = Object.freeze({
  initialHull: 100,
  lateMs: 5000,
  duplicateMs: 1200,
  graceMs: 800,
  transitionMs: 6000,
  fireMs: 2000,
  handsPerStage: 3,
  helpMs: 6000,
  timeoutDamage: 8,
  errorDamage: 2,
  errorsPerShip: 3,
});

export interface Player {
  id: string;
  name: string;
  area: AreaId;
  avatar: Avatar;
}

export interface Order {
  id: number;
  reader: string;
  actor: string;
  control: string;
  value: number | null;
  due: number;
  extension: number;
}

export interface Fire {
  id: number;
  next: number;
  slot: number;
}

export type EventKind = "ok" | "err" | "fail" | "help" | "out" | "boom" | "stage";
export interface GameEvent {
  id: number;
  kind: EventKind;
  peer?: string;
  to?: string;
}

export type GameAction =
  | { type: "control"; control: string; value?: number; stage: number }
  | { type: "help"; to: string; order: number; stage: number }
  | { type: "fire"; id: number; stage: number };

type Touch = [slot: number, control: string, value: number, time: number];
type Recent = [slot: number, control: string, time: number];
export type Phase = "lobby" | "between" | "play" | "end";

export interface GameState {
  gid: string;
  group: boolean;
  phase: Phase;
  time: number;
  until: number;
  stage: number;
  cleared: number;
  adjustmentMs: number;
  need: number;
  done: number;
  ships: number;
  hull: number;
  errors: number;
  broken: boolean;
  losses: number[];
  stats: { ok: number; err: number; fail: number; help: number; out: number };
  players: Player[];
  active: string[];
  orders: Order[];
  fires: Fire[];
  hands: Record<string, number>;
  values: Record<string, Record<string, number>>;
  events: GameEvent[];
  seed: number;
  orderSeq: number;
  fireSeq: number;
  eventSeq: number;
  recent: Recent[];
  touches: Touch[];
}

export interface GameOptions {
  gid?: string;
  group?: boolean;
  seed?: number;
  adjustmentMs?: number;
}

const MAX_EVENTS = 7;
const MAX_RECENT = MAX_PLAYERS * Math.max(...CONFIG.areas.map(area => area.controles.length));
const MAX_TOUCHES = MAX_PLAYERS * Math.max(...CONFIG.areas.map(area => area.controles.reduce<number>(
  (sum, [kind]) => sum + (kind === "d" ? 4 : kind === "t" ? 2 : 1), 0,
)));
const LAST_STAGE = CONFIG.etapas.length - 1;
const WORD = /^[A-Za-z0-9_-]{1,32}$/;
const phases = new Set<Phase>(["lobby", "between", "play", "end"]);
const kinds = new Set<EventKind>(["ok", "err", "fail", "help", "out", "boom", "stage"]);

export function cleanPeerId(value: unknown): value is string {
  return typeof value === "string" && WORD.test(value) &&
    value !== "__proto__" && value !== "constructor" && value !== "prototype";
}

export function cleanName(value: unknown): string {
  if (typeof value !== "string") return "Tripulante";
  return Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, "").trim())
    .slice(0, 18).join("") || "Tripulante";
}

export function createGame(players: Player[], options: GameOptions = {}): GameState {
  const seed = (options.seed ?? Math.floor(Math.random() * 0x100000000)) >>> 0;
  const roster = players.slice(0, MAX_PLAYERS).map(player => ({ ...player, avatar: cleanAvatar(player.avatar) }));
  return {
    gid: options.gid ?? ("m" + seed.toString(36) + Date.now().toString(36)),
    group: options.group ?? roster.length > 1,
    adjustmentMs: Math.max(-2000, Math.min(3000, Math.round(options.adjustmentMs ?? 0))),
    phase: "lobby", time: 0, until: 0, stage: 0, cleared: -1,
    need: 0, done: 0, ships: CONFIG.naves, hull: RULES.initialHull, errors: 0, broken: false,
    losses: CONFIG.etapas.map(() => 0), stats: { ok: 0, err: 0, fail: 0, help: 0, out: 0 },
    players: roster, active: roster.map(player => player.id), orders: [], fires: [],
    hands: Object.fromEntries(roster.map(player => [player.id, RULES.handsPerStage])),
    values: {}, events: [], seed, orderSeq: 0, fireSeq: 0, eventSeq: 0, recent: [], touches: [],
  };
}

export function ordersRequired(players: number): number {
  return Math.min(18, 6 + 2 * players);
}

export function orderDurationMs(stage: number, adjustmentMs: number): number {
  return Math.max(5000, 10000 + adjustmentMs - 600 * stage);
}

function activeAt(control: Control, stage: number): boolean {
  return !control.etapas || control.etapas.includes(stage + 1);
}

export function visibleControls(state: GameState, peer: string): Control[] {
  const area = state.players.find(player => player.id === peer)?.area;
  return Object.values(CONTROLS).filter(control => control.area === area && activeAt(control, state.stage));
}

export function orderText(order: Order): string {
  const control = CONTROLS[order.control];
  if (control.kind === "b") return "Presioná " + control.label;
  if (control.kind === "t") return (order.value ? "Encendé " : "Apagá ") + control.label;
  return "Poné " + control.label + " en " + order.value;
}

function randomInt(state: GameState, max: number): number {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return Math.floor(state.seed / 0x100000000 * max);
}

function event(state: GameState, kind: EventKind, peer?: string, to?: string): void {
  state.events.push({ id: ++state.eventSeq, kind, peer, to });
  if (state.events.length > MAX_EVENTS) state.events.shift();
}

function fillOrders(state: GameState): void {
  if (state.phase !== "play") return;
  // Cuando se reparten todos los pedidos, cada puesto recibe uno de un compañero distinto.
  const rotation = !state.orders.length && state.active.length > 1 ? 1 + randomInt(state, state.active.length - 1) : 0;
  const focus: readonly AreaId[] = CONFIG.etapas[state.stage].foco;
  for (const [seat, reader] of state.active.entries()) {
    if (state.orders.some(order => order.reader === reader)) continue;
    const others = state.active.filter(actor => actor !== reader || (!state.group && state.active.length === 1));
    const load = (actor: string) => state.orders.filter(order => order.actor === actor).length;
    const free = (actor: string, fresh: boolean) => {
      const slot = state.players.findIndex(player => player.id === actor);
      return visibleControls(state, actor).filter(control =>
        !state.orders.some(order => order.actor === actor && order.control === control.id) &&
        // Evitá repetir enseguida el control que esa persona acaba de resolver.
        !(fresh && state.recent.some(entry => entry[0] === slot && entry[1] === control.id)));
    };
    const controlsOf = (actor: string) => {
      const fresh = free(actor, true);
      return fresh.length ? fresh : free(actor, false);
    };
    // Después del reparto inicial, el pedido puede ir a cualquier compañero con menos de dos pendientes
    // (uno en práctica, donde la pantalla muestra un solo pedido a la vez).
    // Las áreas en foco de la etapa pesan el triple.
    const available = others.filter(actor => controlsOf(actor).length > 0);
    const light = available.filter(actor => load(actor) < (state.group ? 2 : 1));
    const minimum = Math.min(...available.map(load));
    const rotated = state.active[(seat + rotation) % state.active.length];
    const preferred = rotation && available.includes(rotated) ? [rotated]
      : light.length ? light : available.filter(actor => load(actor) === minimum);
    const weighted = preferred.flatMap(actor => {
      const area = state.players.find(player => player.id === actor)?.area;
      return Array<string>(area && focus.includes(area) ? 3 : 1).fill(actor);
    });
    if (!weighted.length) continue;
    const actor = weighted[randomInt(state, weighted.length)];
    const pool = controlsOf(actor);
    const control = pool[randomInt(state, pool.length)];
    const current = state.values[actor]?.[control.id] ?? 0;
    let value: number | null = null;
    if (control.kind === "t") value = 1 - current;
    if (control.kind === "d") value = (current + 1 + randomInt(state, 3)) % 4;
    state.orders.push({
      id: ++state.orderSeq, reader, actor, control: control.id, value,
      due: state.time + orderDurationMs(state.stage, state.adjustmentMs), extension: 0,
    });
  }
}

export function setActivePlayers(state: GameState, peers: string[]): void {
  const active = state.players.filter(player => peers.includes(player.id)).map(player => player.id);
  if (state.active.length === active.length && state.active.every((peer, index) => peer === active[index])) return;
  state.active = active;
  state.orders = state.orders.filter(order => {
    if (active.includes(order.reader) && active.includes(order.actor)) return true;
    // Un compañero puede haber alcanzado a leer la orden antes de desconectarse.
    rememberOrder(state, order);
    return false;
  });
  fillOrders(state);
}

export function launch(state: GameState): void {
  if (state.phase !== "lobby" || state.players.length === 0) return;
  state.active = state.players.map(player => player.id);
  state.hands = Object.fromEntries(state.players.map(player => [player.id, RULES.handsPerStage]));
  state.phase = "between";
  state.until = state.time + RULES.transitionMs;
}

function finish(state: GameState): void {
  state.phase = "end";
  state.orders = [];
}

function damage(state: GameState, amount: number): void {
  state.hull = Math.max(0, state.hull - amount);
  if (state.hull === 0) {
    state.broken = true;
    event(state, "boom");
    finish(state);
  }
}

function loseShip(state: GameState): void {
  state.ships = Math.max(0, state.ships - 1);
  state.losses[state.stage] += 1;
}

function clearStage(state: GameState): void {
  state.cleared = state.stage;
  state.orders = [];
  event(state, "stage");
  if (state.stage === LAST_STAGE) {
    finish(state);
    return;
  }
  state.stage += 1;
  state.phase = "between";
  state.until = state.time + RULES.transitionMs;
  for (const fire of state.fires) fire.next += RULES.transitionMs;
}

function pruneTouches(state: GameState): void {
  state.recent = state.recent.filter(entry => state.time - entry[2] < RULES.lateMs);
  state.touches = state.touches.filter(entry => state.time - entry[3] < RULES.duplicateMs);
}

function rememberOrder(state: GameState, order: Order): void {
  const slot = state.players.findIndex(player => player.id === order.actor);
  state.recent = state.recent.filter(entry => entry[0] !== slot || entry[1] !== order.control);
  state.recent.push([slot, order.control, state.time]);
  if (state.recent.length > MAX_RECENT) state.recent.shift();
}

function expireOrder(state: GameState, order: Order): void {
  state.orders = state.orders.filter(current => current !== order);
  state.stats.fail += 1;
  loseShip(state);
  rememberOrder(state, order);
  const slotsInUse = new Set(state.fires.map(fire => fire.slot));
  let slot = 0;
  while (slotsInUse.has(slot)) slot += 1;
  state.fires.push({ id: ++state.fireSeq, slot, next: state.time + RULES.fireMs });
  event(state, "fail", order.reader);
  damage(state, RULES.timeoutDamage);
  if (!state.ships) finish(state);
}

export function tick(state: GameState, deltaMs: number): void {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0 || state.phase === "lobby" || state.phase === "end") return;
  const stop = state.time + Math.round(deltaMs);
  while (state.time < stop) {
    if (state.phase === "between") {
      state.time = Math.min(stop, state.until);
      if (state.time === state.until) {
        state.phase = "play";
        state.done = 0;
        state.need = ordersRequired(state.active.length);
        state.hands = Object.fromEntries(state.players.map(player => [player.id, RULES.handsPerStage]));
        fillOrders(state);
      }
      continue;
    }
    const nextExpiry = Math.min(...state.orders.map(order => order.due + RULES.graceMs + 1));
    const nextFire = Math.min(...state.fires.map(fire => fire.next));
    state.time = Math.min(stop, nextExpiry, nextFire);
    for (const order of [...state.orders]) {
      if (state.time > order.due + RULES.graceMs) expireOrder(state, order);
      if (state.phase !== "play") break;
    }
    if (state.phase !== "play") break;
    let burning = 0;
    for (const fire of state.fires) {
      if (state.time < fire.next) continue;
      fire.next += RULES.fireMs;
      burning += 1;
    }
    if (burning) damage(state, burning);
    if (state.hull === 0) break;
    fillOrders(state);
  }
  pruneTouches(state);
}

export function applyAction(state: GameState, peer: string, action: GameAction): boolean {
  if (state.phase !== "play" || action.stage !== state.stage || !state.active.includes(peer)) return false;
  if (action.type === "help") {
    const order = state.orders.find(order => order.reader === action.to && order.id === action.order);
    if (!order || order.reader === peer || !state.hands[peer]) return false;
    order.due += RULES.helpMs;
    order.extension += 1;
    state.hands[peer] -= 1;
    state.stats.help += 1;
    event(state, "help", peer, order.reader);
    return true;
  }
  if (action.type === "fire") {
    const fire = state.fires.find(fire => fire.id === action.id);
    if (!fire) return false;
    state.fires = state.fires.filter(current => current !== fire);
    state.stats.out += 1;
    event(state, "out", peer);
    return true;
  }
  const control = Object.hasOwn(CONTROLS, action.control) ? CONTROLS[action.control] : undefined;
  const slot = state.players.findIndex(player => player.id === peer);
  if (!control || state.players[slot]?.area !== control.area || !activeAt(control, state.stage)) return false;
  const value = action.value ?? -1;
  if (!validValue(control, value)) return false;
  pruneTouches(state);
  if (state.touches.some(touch => touch[0] === slot && touch[1] === control.id && touch[2] === value)) return false;
  state.touches.push([slot, control.id, value, state.time]);
  if (state.touches.length > MAX_TOUCHES) state.touches.shift();
  if (value >= 0) (state.values[peer] ??= {})[control.id] = value;
  const order = state.orders.find(order => order.actor === peer && order.control === control.id);
  if (order && (order.value === null || order.value === value)) {
    state.orders = state.orders.filter(current => current !== order);
    state.done += 1;
    state.stats.ok += 1;
    rememberOrder(state, order);
    event(state, "ok", peer, order.reader);
    if (state.done >= state.need) clearStage(state);
    else fillOrders(state);
  } else if (!order && !state.recent.some(entry => entry[0] === slot && entry[1] === control.id)) {
    state.stats.err += 1;
    state.errors = (state.errors + 1) % RULES.errorsPerShip;
    event(state, "err", peer);
    if (!state.errors) loseShip(state);
    damage(state, RULES.errorDamage);
    if (!state.ships) finish(state);
  }
  return true;
}

export function outcome(state: GameState) {
  const kind = state.broken ? "nave_rota" : state.cleared < LAST_STAGE ? "participar"
    : state.ships >= CONFIG.naves ? "meta" : state.ships >= PASS_SHIPS ? "aprobado" : "participar";
  const titles = {
    nave_rota: "Nave rota", meta: "Misión perfecta", aprobado: "Aprobaron", participar: "No alcanzó",
  };
  return { kind, title: titles[kind], points: state.group ? POINTS[kind] : 0 };
}

function validValue(control: Control, value: unknown): value is number {
  if (control.kind === "b") return value === -1;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 &&
    value <= (control.kind === "t" ? 1 : 3);
}

type Data = Record<string, unknown>;

function data(value: unknown): Data | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : null;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function getControl(id: unknown): Control | undefined {
  return typeof id === "string" && Object.hasOwn(CONTROLS, id) ? CONTROLS[id] : undefined;
}

export function decodePlayer(raw: unknown): Player | null {
  const player = data(raw);
  if (!player || !cleanPeerId(player.id) || !isAreaId(player.area)) return null;
  return { id: player.id, name: cleanName(player.name), area: player.area, avatar: cleanAvatar(player.avatar) };
}

export function decodeAction(raw: unknown): GameAction | null {
  const action = data(raw);
  if (!action || !integer(action.stage, 0, LAST_STAGE)) return null;
  const stage = action.stage;
  if (action.type === "help" && cleanPeerId(action.to) && integer(action.order, 1, 10000)) {
    return { type: "help", stage, to: action.to, order: action.order };
  }
  if (action.type === "fire" && integer(action.id, 1, CONFIG.naves)) {
    return { type: "fire", stage, id: action.id };
  }
  if (action.type !== "control") return null;
  const control = getControl(action.control);
  if (!control || !validValue(control, action.value ?? -1)) return null;
  if (control.kind === "b") return { type: "control", stage, control: control.id };
  return { type: "control", stage, control: control.id, value: action.value as number };
}

const MAX_TIME = 24 * 60 * 60 * 1000;
const avatarKeys = Object.keys(AVATAR_OPTIONS) as (keyof Avatar)[];

// La instantánea de red usa índices de puesto y de avatar; la simulación sigue usando sus tipos normales.
export function encodeState(state: GameState): unknown {
  const playerSlot = (peer: string | undefined) => state.players.findIndex(player => player.id === peer);
  return {
    ...state,
    players: state.players.map(({ id, name, area, avatar }) => [id, name, area, avatarKeys.map(key => avatar[key])]),
    active: state.active.map(playerSlot),
    orders: state.orders.map(order => [
      order.id, playerSlot(order.reader), playerSlot(order.actor), order.control, order.value, order.due, order.extension,
    ]),
    fires: state.fires.map(fire => [fire.id, fire.next, fire.slot]),
    hands: state.players.map(player => state.hands[player.id] ?? RULES.handsPerStage),
    values: state.players.map(player => state.values[player.id] ?? {}),
    events: state.events.map(event => [event.id, event.kind, playerSlot(event.peer), playerSlot(event.to)]),
    v: 1,
  };
}

function unpackState(s: Data): Data | null {
  const { players, active, orders, fires, hands, values, events } = s;
  if (!Array.isArray(players) || players.length > MAX_PLAYERS || !Array.isArray(active) ||
    active.length > players.length || !Array.isArray(orders) || orders.length > players.length ||
    !Array.isArray(fires) || fires.length > CONFIG.naves || !Array.isArray(hands) || hands.length !== players.length ||
    !Array.isArray(values) || values.length !== players.length || !Array.isArray(events) || events.length > MAX_EVENTS) return null;
  const roster = players.map(item => {
    if (!Array.isArray(item) || !cleanPeerId(item[0]) || !Array.isArray(item[3]) ||
      item[3].length !== avatarKeys.length) return null;
    return {
      id: item[0], name: item[1], area: item[2],
      avatar: Object.fromEntries(avatarKeys.map((key, index) => [key, item[3][index]])),
    };
  });
  if (roster.some(player => !player)) return null;
  const peer = (slot: unknown) => integer(slot, 0, players.length - 1) ? roster[slot]?.id : undefined;
  return {
    ...s, players: roster, active: active.map(peer),
    orders: orders.map(order => Array.isArray(order) ? {
      id: order[0], reader: peer(order[1]), actor: peer(order[2]), control: order[3],
      value: order[4], due: order[5], extension: order[6],
    } : null),
    fires: fires.map(fire => Array.isArray(fire) ? { id: fire[0], next: fire[1], slot: fire[2] } : null),
    hands: Object.fromEntries(hands.map((hand, index) => [peer(index), hand])),
    values: Object.fromEntries(values.map((panel, index) => [peer(index), panel])),
    events: events.map(event => Array.isArray(event) ? {
      id: event[0], kind: event[1], peer: peer(event[2]), to: peer(event[3]),
    } : null),
  };
}

export function decodeState(raw: unknown): GameState | null {
  const packet = data(raw);
  const s = packet?.v === 1 ? unpackState(packet) : packet;
  if (!s || !cleanPeerId(s.gid) || !phases.has(s.phase as Phase) || typeof s.group !== "boolean" ||
    typeof s.broken !== "boolean" || !integer(s.time, 0, MAX_TIME) || !integer(s.until, 0, MAX_TIME) ||
    !integer(s.stage, 0, LAST_STAGE) || !integer(s.cleared, -1, s.stage) || !integer(s.adjustmentMs, -2000, 3000) ||
    !integer(s.need, 0, 18) || !integer(s.done, 0, s.need) || !integer(s.ships, 0, CONFIG.naves) ||
    !integer(s.hull, 0, RULES.initialHull) || !integer(s.errors, 0, RULES.errorsPerShip - 1) ||
    !integer(s.seed, 0, 0xffffffff) || !integer(s.orderSeq, 0, 10000) || !integer(s.fireSeq, 0, CONFIG.naves) ||
    !integer(s.eventSeq, 0, 10000) || (s.phase === "between" && s.until < s.time)) return null;
  if (!Array.isArray(s.losses) || s.losses.length !== CONFIG.etapas.length ||
    !s.losses.every(value => integer(value, 0, CONFIG.naves))) return null;
  const stats = data(s.stats);
  if (!stats || !integer(stats.ok, 0, 144) || !integer(stats.err, 0, 100) ||
    !integer(stats.fail, 0, CONFIG.naves) || !integer(stats.help, 0, 96) || !integer(stats.out, 0, CONFIG.naves)) return null;
  if (!Array.isArray(s.players) || s.players.length > MAX_PLAYERS ||
    !Array.isArray(s.active) || s.active.length > s.players.length) return null;
  const players = s.players.map(decodePlayer);
  if (!players.every((player): player is Player => player !== null)) return null;
  const byPeer = new Map(players.map(player => [player.id, player]));
  const hasPeer = (value: unknown): value is string => typeof value === "string" && byPeer.has(value);
  if (byPeer.size !== players.length || !s.active.every(hasPeer) || new Set(s.active).size !== s.active.length) return null;
  const active = [...s.active];
  const orders: Order[] = [];
  if (!Array.isArray(s.orders) || s.orders.length > active.length) return null;
  for (const item of s.orders) {
    const order = data(item);
    const control = getControl(order?.control);
    if (!order || !control || !hasPeer(order.reader) || !hasPeer(order.actor) || !active.includes(order.reader) ||
      !active.includes(order.actor) || (s.group && order.reader === order.actor) ||
      control.area !== byPeer.get(order.actor)?.area || !activeAt(control, s.stage) ||
      !integer(order.id, 1, s.orderSeq) || !integer(order.due, Math.max(0, s.time - RULES.graceMs), MAX_TIME) ||
      !integer(order.extension, 0, MAX_PLAYERS * RULES.handsPerStage) ||
      !(control.kind === "b" ? order.value === null : validValue(control, order.value))) return null;
    if (orders.some(other => other.id === order.id || other.reader === order.reader ||
      (other.actor === order.actor && other.control === control.id))) return null;
    orders.push({
      id: order.id, reader: order.reader, actor: order.actor, control: control.id, value: order.value as number | null,
      due: order.due, extension: order.extension,
    });
  }
  const fires: Fire[] = [];
  if (!Array.isArray(s.fires) || s.fires.length > Math.ceil(RULES.initialHull / RULES.timeoutDamage)) return null;
  for (const item of s.fires) {
    const fire = data(item);
    if (!fire || !integer(fire.id, 1, s.fireSeq) || !integer(fire.next, s.time, MAX_TIME) ||
      !integer(fire.slot, 0, CONFIG.naves - 1)) return null;
    if (fires.some(other => other.id === fire.id || other.slot === fire.slot)) return null;
    fires.push({ id: fire.id, next: fire.next, slot: fire.slot });
  }
  const hands: GameState["hands"] = {};
  const values: GameState["values"] = {};
  const handData = data(s.hands);
  const valueData = data(s.values);
  if (!handData || !valueData) return null;
  for (const player of players) {
    const hand = handData[player.id];
    if (integer(hand, 0, RULES.handsPerStage)) hands[player.id] = hand;
    else if (s.phase === "lobby") hands[player.id] = RULES.handsPerStage;
    else return null;
    const panel = data(valueData[player.id]);
    if (!panel) continue;
    for (const control of Object.values(CONTROLS)) {
      if (control.area !== player.area || control.kind === "b") continue;
      const value = panel[control.id];
      if (validValue(control, value)) (values[player.id] ??= {})[control.id] = value;
    }
  }
  const events: GameEvent[] = [];
  if (!Array.isArray(s.events) || s.events.length > MAX_EVENTS) return null;
  for (const item of s.events) {
    const e = data(item);
    if (!e || !integer(e.id, (events.at(-1)?.id ?? 0) + 1, s.eventSeq) || !kinds.has(e.kind as EventKind)) return null;
    const peer = hasPeer(e.peer) ? e.peer : undefined;
    const to = hasPeer(e.to) ? e.to : undefined;
    events.push({ id: e.id, kind: e.kind as EventKind, peer, to });
  }
  const recent: Recent[] = [];
  const touches: Touch[] = [];
  if (!Array.isArray(s.recent) || s.recent.length > MAX_RECENT || !Array.isArray(s.touches) || s.touches.length > MAX_TOUCHES) return null;
  for (const entry of s.recent) {
    if (!Array.isArray(entry) || entry.length !== 3) return null;
    const [slot, id, time] = entry;
    const control = getControl(id);
    if (!integer(slot, 0, players.length - 1) || !control || control.area !== players[slot].area ||
      !integer(time, 0, s.time)) return null;
    recent.push([slot, control.id, time]);
  }
  for (const entry of s.touches) {
    if (!Array.isArray(entry) || entry.length !== 4) return null;
    const [slot, id, value, time] = entry;
    const control = getControl(id);
    if (!integer(slot, 0, players.length - 1) || !control || control.area !== players[slot].area ||
      !validValue(control, value) || !integer(time, 0, s.time)) return null;
    touches.push([slot, control.id, value, time]);
  }
  return {
    gid: s.gid, group: s.group, phase: s.phase as Phase, time: s.time, until: s.until,
    stage: s.stage, cleared: s.cleared, adjustmentMs: s.adjustmentMs, need: s.need, done: s.done, ships: s.ships,
    hull: s.hull, errors: s.errors, broken: s.broken, losses: [...s.losses],
    stats: { ok: stats.ok, err: stats.err, fail: stats.fail, help: stats.help, out: stats.out },
    players, active, orders, fires, hands, values, events,
    seed: s.seed, orderSeq: s.orderSeq, fireSeq: s.fireSeq, eventSeq: s.eventSeq, recent, touches,
  };
}
