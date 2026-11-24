import {
  applyAction, createGame, encodeState, launch, setActivePlayers, tick,
  type GameAction, type GameState, type Player,
} from '../sim/index.ts';
import {
  acknowledged, addAck, cleanCode, cleanPlayer, MAX_BODY_BYTES, readAction, readSnapshot, readSummary,
  type Ack, type ActionPacket, type BoardSummary,
} from './protocol.ts';
import { jsonBytes, newPeerId, type Message, type Room } from './room.ts';

export type { BoardSummary } from './protocol.ts';

const TICK = 200;
const MAX_STEP = 1500;
const SNAPSHOT_INTERVAL = 1000;
const BOARD_INTERVAL = 700;
const RETRY_INTERVAL = 900;
const RECONNECT_WARNING = 2000;
const ELECTION_START = 4200;
const ELECTION_STAGGER = 600;
const PRESENCE_GRACE = 2500;
const BOARD_EXPIRY = 12_000;

export interface SessionView {
  host: boolean;
  connected: boolean;
  reconnecting: boolean;
  players: Player[];
  game: GameState | null;
  code: string;
  jornada: string;
}

export interface SessionOptions {
  room: Room;
  code: string;
  jornada: string;
  profile: Omit<Player, 'id'>;
  host: boolean;
  onChange?: (view: SessionView) => void;
  clock?: () => number;
  autoTick?: boolean;
}

export interface Session {
  peerId: string;
  view(): SessionView;
  start(adjustmentMs?: number): boolean;
  wait(): boolean;
  act(action: GameAction): boolean;
  leave(): Promise<void>;
  pulse(): void;
}

type Pending = { packet: ActionPacket; sent: number; born: number };

export async function createSession(options: SessionOptions): Promise<Session> {
  const code = cleanCode(options.code);
  const jornada = cleanCode(options.jornada);
  const profile = cleanPlayer(options.room.peerId, options.profile);
  if (!profile) throw new Error('Revisá tu nombre y área.');
  const { id: peerId } = profile;
  const now = options.clock ?? (() => performance.now());
  const room = await options.room.join(`group:${jornada}:${code}`);
  let board: Room | undefined;
  let boardOpening = false;
  let boardRetryAt = -Infinity;
  let game: GameState | null = null;
  let hostId = '';
  let epoch = 0;
  let revision = 0;
  let lastSeen = now();
  let lastPulse = now();
  let lastSent = -Infinity;
  let lastBoard = -Infinity;
  let lastActionId = 0;
  let boardRevision = 0;
  let repeatUntil = -Infinity;
  let dirty = true;
  let closed = false;
  let suspendedAt: number | null = null;
  let acks: Ack[] = [];
  let pending: Pending[] = [];
  const absentSince = new Map<string, number>();
  const unsubs: (() => void)[] = [];
  const isHost = () => hostId === peerId;
  let lastStatus = '';

  function presentPlayers(): Player[] {
    const present = new Map([[peerId, profile as Player]]);
    for (const peer of room.peers()) {
      if (peer.peer === peerId) continue;
      const player = cleanPlayer(peer.peer, peer.data);
      if (player) present.set(player.id, player);
    }
    return [...present.values()].sort((a, b) => a.id < b.id ? -1 : a.id === b.id ? 0 : 1);
  }

  function lobbyPlayers(): Player[] {
    const present = presentPlayers();
    const host = present.find(player => player.id === hostId);
    const admitted = new Set(game?.players.map(player => player.id));
    const kept = present.filter(player => player !== host && admitted.has(player.id));
    const others = present.filter(player => player !== host && !admitted.has(player.id));
    return (host ? [host, ...kept, ...others] : [...kept, ...others]).slice(0, 4);
  }

  function view(): SessionView {
    const online = room.connected();
    const waitingForCrew = !!game && (game.phase === 'between' || game.phase === 'play') && game.active.length < 2;
    const reconnecting = !online || waitingForCrew ||
      (isHost() ? suspendedAt !== null : !!game && now() - lastSeen >= RECONNECT_WARNING);
    return {
      host: isHost(), connected: online, reconnecting,
      players: game?.phase === 'lobby' && isHost() ? lobbyPlayers() : game?.players ?? lobbyPlayers(),
      game, code, jornada,
    };
  }

  function notify(): void {
    const current = view();
    lastStatus = `${current.connected}/${current.reconnecting}`;
    options.onChange?.(current);
  }

  function setGame(next: GameState): void {
    if (game?.gid !== next.gid) {
      pending = [];
      acks = [];
      lastActionId = 0;
      absentSince.clear();
    }
    game = next;
    dirty = true;
  }

  function createLobby(): void {
    setGame(createGame(lobbyPlayers(), { group: true, gid: newPeerId() }));
  }

  function sendSnapshot(at: number): void {
    if (!game || !room.connected()) return;
    const packet = { e: epoch, r: revision + 1, a: acks, s: encodeState(game) };
    if (jsonBytes(packet) >= MAX_BODY_BYTES) return;
    revision = packet.r;
    lastSent = at;
    dirty = false;
    void room.emit('st', packet).catch(() => { dirty = true; });
  }

  function sendBoard(at: number, closedPhase = false): Promise<void> {
    if (!game || !board?.connected()) return Promise.resolve();
    // La simulación corre cada 200 ms. Conservá la fase de 700 ms entre envíos
    // aunque cada envío individual caiga en el pulso siguiente.
    lastBoard = at - lastBoard < 2 * BOARD_INTERVAL ? lastBoard + BOARD_INTERVAL : at;
    const payload = {
      code, gid: game.gid, epoch, rev: ++boardRevision, stage: game.stage,
      phase: closedPhase ? 'closed' : game.phase, fleet: game.ships, hull: game.hull, errors: game.stats.err,
      broken: game.broken, done: game.done, need: game.need, fires: game.fires.length,
      players: game.players.map(({ area, avatar }) => ({ area, avatar })),
      events: game.events.slice(-6).map(({ id, kind }) => ({ id, kind })),
    };
    return board.emit('tablero', payload).catch(() => {});
  }

  function connectBoard(at: number): void {
    if (board || boardOpening || at < boardRetryAt) return;
    boardOpening = true;
    void options.room.join(`live:${jornada}`).then(async channel => {
      if (closed || !isHost()) {
        await channel.leave();
        return;
      }
      board = channel;
      await sendBoard(now());
    }).catch(() => {
      boardRetryAt = now() + 5000;
    }).finally(() => {
      boardOpening = false;
    });
  }

  function receiveState(message: Message): void {
    if (closed || message.peer === peerId) return;
    const packet = readSnapshot(message.data);
    if (!packet || !packet.s.group || !packet.s.players.some(player => player.id === message.peer) ||
      !room.peers().some(peer => peer.peer === message.peer && cleanPlayer(peer.peer, peer.data))) return;
    if (hostId && (packet.e < epoch ||
      (packet.e === epoch && (message.peer > hostId || (message.peer === hostId && packet.r <= revision))))) return;
    const wasHost = isHost();
    const changed = game?.gid !== packet.s.gid;
    const changedHost = hostId !== message.peer;
    hostId = message.peer;
    epoch = packet.e;
    revision = packet.r;
    lastSeen = now();
    lastPulse = lastSeen;
    suspendedAt = null;
    setGame(packet.s);
    acks = packet.a;
    const myAck = acks.find(ack => ack[0] === peerId);
    lastActionId = Math.max(lastActionId, myAck?.[1] ?? 0);
    pending = pending.filter(item => !acknowledged(myAck, item.packet.n));
    if (changedHost && !changed) {
      for (const item of pending) item.sent = -Infinity;
    }
    if (wasHost && board) {
      void board.leave().catch(() => {});
      board = undefined;
    }
    notify();
  }

  function processAction(peer: string, packet: ActionPacket): void {
    if (!game || !isHost() || !room.connected() || suspendedAt !== null || packet.g !== game.gid ||
      !game.active.includes(peer) || acknowledged(acks.find(row => row[0] === peer), packet.n)) return;
    // Se acusa recibo aun si el intento era tardío o no tenía efecto.
    addAck(acks, peer, packet.n);
    applyAction(game, peer, packet.a);
    dirty = true;
  }

  function receiveAction(message: Message): void {
    if (!isHost() || !room.peers().some(peer => peer.peer === message.peer)) return;
    const packet = readAction(message.data);
    if (packet) processAction(message.peer, packet);
  }

  function retryActions(at: number): void {
    if (!room.connected() || !game || (!isHost() && at - lastSeen >= RECONNECT_WARNING)) return;
    pending = pending.filter(item => item.packet.g === game?.gid && at - item.born < 10_000);
    if (isHost()) {
      for (const item of pending) processAction(peerId, item.packet);
      pending = [];
      return;
    }
    for (const item of pending) {
      if (at - item.sent < RETRY_INTERVAL) continue;
      item.sent = at;
      void room.emit('act', item.packet).catch(() => {});
    }
  }

  function elect(at: number): void {
    if (!game || !room.connected() || isHost()) return;
    const since = at - lastSeen;
    if (since < ELECTION_START) return;
    const eligible = new Set(game.players.map(player => player.id));
    const candidates = presentPlayers().filter(player => player.id !== hostId && eligible.has(player.id));
    const seat = candidates.findIndex(player => player.id === peerId);
    if (seat === -1 || since < ELECTION_START + seat * ELECTION_STAGGER) return;
    hostId = peerId;
    epoch++;
    revision = 0;
    lastPulse = at;
    lastSent = -Infinity;
    lastBoard = -Infinity;
    repeatUntil = at + 400;
    dirty = true;
    absentSince.clear();
  }

  function syncRoster(at: number): void {
    if (!game) return;
    if (game.phase === 'lobby') {
      const roster = lobbyPlayers();
      if (JSON.stringify(roster) !== JSON.stringify(game.players)) {
        const replacement = createGame(roster, { gid: game.gid, group: true, seed: game.seed });
        setGame(replacement);
      }
      return;
    }
    if (game.phase === 'end') return;
    const present = new Set(presentPlayers().map(player => player.id));
    const active = game.players.filter(player => {
      if (present.has(player.id)) {
        absentSince.delete(player.id);
        return true;
      }
      if (!game?.active.includes(player.id)) return false;
      if (!absentSince.has(player.id)) absentSince.set(player.id, at);
      return at - (absentSince.get(player.id) ?? at) < PRESENCE_GRACE;
    }).map(player => player.id);
    if (active.join('|') !== game.active.join('|')) {
      setActivePlayers(game, active);
      dirty = true;
    }
  }

  function pulse(): void {
    if (closed) return;
    const at = now();
    elect(at);
    if (isHost() && game) {
      if (!room.connected()) {
        suspendedAt = at;
      } else if (suspendedAt === null || at - suspendedAt >= 1000) {
        const resumed = suspendedAt !== null;
        suspendedAt = null;
        syncRoster(at);
        const previous = `${game.phase}/${game.eventSeq}/${game.hull}`;
        // Una pestaña en segundo plano pulsa una vez por segundo: se avanza el tiempo real, con tope.
        if (!resumed && game.active.length >= 2) tick(game, Math.min(MAX_STEP, at - lastPulse));
        if (previous !== `${game.phase}/${game.eventSeq}/${game.hull}`) dirty = true;
        retryActions(at);
        if (dirty || at - lastSent >= SNAPSHOT_INTERVAL || at <= repeatUntil) sendSnapshot(at);
        if (game.phase !== 'lobby') {
          connectBoard(at);
          if (at - lastBoard >= BOARD_INTERVAL) void sendBoard(at);
        }
      }
    } else {
      retryActions(at);
    }
    lastPulse = at;
    const current = view();
    if (isHost() || lastStatus !== `${current.connected}/${current.reconnecting}`) notify();
  }

  unsubs.push(room.on('st', receiveState), room.on('act', receiveAction));
  unsubs.push(room.onPeers(() => {
    if (!room.connected() && isHost() && suspendedAt === null) suspendedAt = now();
    notify();
  }));

  try {
    await room.presence(profile);
  } catch (error) {
    unsubs.forEach(unsubscribe => unsubscribe());
    await room.leave();
    throw error;
  }

  if (options.host) {
    hostId = peerId;
    createLobby();
  }
  const interval = options.autoTick === false ? undefined : setInterval(pulse, TICK);
  pulse();
  return {
    peerId,
    view,
    pulse,
    start(adjustmentMs = 0) {
      if (!isHost() || !room.connected() || suspendedAt !== null || !Number.isFinite(adjustmentMs)) return false;
      const roster = lobbyPlayers();
      if (roster.length < 2 || game?.phase === 'play' || game?.phase === 'between') return false;
      setGame(createGame(roster, { group: true, gid: newPeerId(), adjustmentMs }));
      if (game) launch(game);
      sendSnapshot(now());
      notify();
      return true;
    },
    wait() {
      if (!isHost() || !room.connected() || suspendedAt !== null) return false;
      createLobby();
      sendSnapshot(now());
      notify();
      return true;
    },
    act(action) {
      const current = view();
      if (!game || game.phase !== 'play' || !game.active.includes(peerId) || current.reconnecting ||
        pending.length >= 20 || lastActionId >= 1_000_000) return false;
      const packet = readAction({ g: game.gid, n: lastActionId + 1, a: action });
      if (!packet || packet.a.stage !== game.stage) return false;
      lastActionId = packet.n;
      const at = now();
      if (isHost()) {
        processAction(peerId, packet);
        notify();
      } else {
        pending.push({ packet, sent: -Infinity, born: at });
        retryActions(at);
      }
      return true;
    },
    async leave() {
      if (closed) return;
      closed = true;
      clearInterval(interval);
      unsubs.forEach(unsubscribe => unsubscribe());
      if (isHost()) await sendBoard(now(), true);
      await Promise.all([room.leave(), board?.leave()]);
    },
  };
}

export async function watchBoard(room: Room, jornada: string, onSummary: (summary: BoardSummary) => void) {
  const channel = await room.join(`live:${cleanCode(jornada)}`);
  const seen = new Map<string, { summary: BoardSummary; time: number }>();
  const unsubscribe = channel.on('tablero', ({ data, peer }) => {
    const next = readSummary(data, peer);
    if (!next) return;
    const time = performance.now();
    const entry = seen.get(next.code);
    const previous = entry && time - entry.time < BOARD_EXPIRY ? entry.summary : undefined;
    if (previous && (next.epoch < previous.epoch ||
      (next.epoch === previous.epoch && (next.host > previous.host ||
        (next.host === previous.host && next.rev <= previous.rev))))) return;
    if (seen.size >= 32 && !previous) {
      const first = seen.keys().next().value;
      if (first) seen.delete(first);
    }
    seen.set(next.code, { summary: next, time });
    onSummary(next);
  });
  return async () => {
    unsubscribe();
    await channel.leave();
  };
}
