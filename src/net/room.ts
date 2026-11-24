export interface Peer {
  peer: string;
  data: unknown;
}

export interface Message {
  peer: string;
  data: unknown;
}

export interface Room {
  peerId: string;
  join(topic: string): Promise<Room>;
  emit(event: string, data: unknown): Promise<void>;
  on(event: string, listener: (message: Message) => void): () => void;
  presence(data: unknown): Promise<void>;
  peers(): Peer[];
  onPeers(listener: () => void): () => void;
  leave(): Promise<void>;
  connected(): boolean;
}

const NAMESPACE = 'odisea-3d:v1:';
const FRAME_LIMIT = 3960;
const PRESENCE_LIMIT = 512;
const encoder = new TextEncoder();
const peerPattern = /^[a-zA-Z0-9_-]{1,12}$/;
const topicPattern = /^[a-z0-9:-]{1,48}$/;
const eventPattern = /^[a-z]{1,12}$/;

export function isPeerId(value: unknown): value is string {
  return typeof value === 'string' && peerPattern.test(value) &&
    value !== '__proto__' && value !== 'constructor' && value !== 'prototype';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function jsonBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return typeof json === 'string' ? encoder.encode(json).length : Infinity;
  } catch {
    return Infinity;
  }
}

export function newPeerId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function validPeerId(value: string): string {
  if (!isPeerId(value)) throw new Error('Identificador de tripulante inválido.');
  return value;
}

function channelName(topic: string): string {
  if (!topicPattern.test(topic)) throw new Error('Código de canal inválido.');
  return NAMESPACE + topic;
}

function unpack(raw: unknown): Message | null {
  if (!isRecord(raw) || raw.v !== 1 || !isPeerId(raw.p) || jsonBytes(raw) >= FRAME_LIMIT) {
    return null;
  }
  return { peer: raw.p, data: raw.d };
}

function signals() {
  const events = new Map<string, Set<(message: Message) => void>>();
  const peerChanges = new Set<() => void>();
  return {
    on(event: string, callback: (message: Message) => void) {
      let set = events.get(event);
      if (!set) {
        set = new Set();
        events.set(event, set);
      }
      set.add(callback);
      return () => { set.delete(callback); };
    },
    onPeers(callback: () => void) {
      peerChanges.add(callback);
      return () => { peerChanges.delete(callback); };
    },
    message(event: string, message: Message) {
      for (const callback of events.get(event) ?? []) callback(message);
    },
    peerChange() {
      for (const callback of peerChanges) callback();
    },
    clear() {
      events.clear();
      peerChanges.clear();
    },
  };
}

function frame(peer: string, event: string, data: unknown) {
  const payload = { v: 1, p: peer, d: data };
  if (!eventPattern.test(event) || jsonBytes(payload) >= FRAME_LIMIT) {
    throw new Error('Mensaje inválido o demasiado grande.');
  }
  return payload;
}

function checkPresence(data: unknown): void {
  if (!isRecord(data) || jsonBytes(data) > PRESENCE_LIMIT) {
    throw new Error('Perfil de presencia inválido.');
  }
}

function baseRoom(peerId: string, join: Room['join']): Room {
  return {
    peerId,
    join,
    emit: async () => { throw new Error('Abrí un canal primero.'); },
    on: () => () => {},
    presence: async () => { throw new Error('Abrí un canal primero.'); },
    peers: () => [],
    onPeers: () => () => {},
    leave: async () => {},
    connected: () => false,
  };
}

interface RealtimeChannel {
  on(type: string, filter: { event: string }, listener: (raw: unknown) => void): RealtimeChannel;
  subscribe(listener: (status: string) => void): RealtimeChannel;
  send(input: { type: 'broadcast'; event: string; payload: unknown }): Promise<string>;
  track(data: Record<string, unknown>): Promise<string>;
  presenceState(): Record<string, unknown[]>;
}

export interface RealtimeClient {
  channel(topic: string, options: {
    config: { broadcast: { self: boolean }; presence: { key: string }; private: boolean };
  }): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown>;
}

// El contrato mínimo se puede probar con el mismo adaptador y un servidor falso.
export function createRealtimeRoom(client: RealtimeClient, peerId = newPeerId()): Room {
  validPeerId(peerId);
  async function join(topic: string): Promise<Room> {
    const channel = client.channel(channelName(topic), {
      config: { broadcast: { self: false }, presence: { key: peerId }, private: false },
    });
    const events = signals();
    let online = false;
    let closed = false;
    let tracked: Record<string, unknown> | undefined;
    channel.on('broadcast', { event: '*' }, raw => {
      if (!online || !isRecord(raw) || typeof raw.event !== 'string' || !eventPattern.test(raw.event)) return;
      const message = unpack(raw.payload);
      if (message && message.peer !== peerId) events.message(raw.event, message);
    });
    channel.on('presence', { event: 'sync' }, () => events.peerChange());
    const room: Room = {
      peerId,
      join,
      async emit(event, data) {
        if (!online) throw new Error('Reconectando con la nave…');
        if (await channel.send({ type: 'broadcast', event, payload: frame(peerId, event, data) }) !== 'ok') {
          throw new Error('El mensaje no salió de la nave.');
        }
      },
      on: events.on,
      async presence(data) {
        checkPresence(data);
        tracked = data as Record<string, unknown>;
        if (online && await channel.track(tracked) !== 'ok') {
          throw new Error('No se pudo anunciar la presencia.');
        }
      },
      peers() {
        if (!online) return [];
        const peers: Peer[] = [];
        for (const [id, metas] of Object.entries(channel.presenceState()).slice(0, 64)) {
          const data = Array.isArray(metas) ? metas.at(-1) : undefined;
          if (isPeerId(id) && isRecord(data) && jsonBytes(data) <= PRESENCE_LIMIT) {
            peers.push({ peer: id, data });
          }
        }
        return peers;
      },
      onPeers: events.onPeers,
      async leave() {
        if (closed) return;
        closed = true;
        online = false;
        events.clear();
        await client.removeChannel(channel);
      },
      connected: () => online,
    };
    try {
      await new Promise<void>((resolve, reject) => {
        let joined = false;
        const timeout = setTimeout(() => reject(new Error('La conexión tardó demasiado.')), 10_000);
        channel.subscribe(status => {
          if (closed) return;
          online = status === 'SUBSCRIBED';
          if (online && !joined) {
            joined = true;
            clearTimeout(timeout);
            resolve();
          } else if (online && tracked) {
            void channel.track(tracked).catch(() => {});
          } else if (!joined && (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR')) {
            clearTimeout(timeout);
            reject(new Error('No se pudo abrir el canal. Revisá la conexión y la configuración de Supabase.'));
          }
          events.peerChange();
        });
      });
    } catch (error) {
      await room.leave();
      throw error;
    }
    return room;
  }
  return baseRoom(peerId, join);
}

export async function createSupabaseRoom(url: string, anon: string, peerId = newPeerId()): Promise<Room> {
  if (new URL(url).protocol !== 'https:' || !anon.trim() || anon.startsWith('sb_secret_')) {
    throw new Error('Configurá una URL HTTPS y una clave pública de Supabase.');
  }
  if (anon.split('.').length === 3) {
    try {
      const token = anon.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      if (JSON.parse(atob(token)).role === 'service_role') throw new Error();
    } catch {
      throw new Error('Usá la clave pública anon de Supabase.');
    }
  }
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return createRealtimeRoom(client as unknown as RealtimeClient, peerId);
}

export function createLocalRoom(peerId = newPeerId()): Room {
  validPeerId(peerId);
  async function join(topic: string): Promise<Room> {
    const channel = new BroadcastChannel(channelName(topic));
    const events = signals();
    const peers = new Map<string, { data: unknown; expires: number }>();
    let tracked: unknown;
    let online = true;
    const announce = () => {
      if (tracked) channel.postMessage({ type: 'presence', p: peerId, d: tracked });
    };
    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!online || !isRecord(data) || !isPeerId(data.p) || data.p === peerId) return;
      if (data.type === 'hello') {
        announce();
      } else if (data.type === 'presence' && isRecord(data.d) && jsonBytes(data.d) <= PRESENCE_LIMIT) {
        if (!peers.has(data.p) && peers.size >= 64) return;
        const before = peers.get(data.p);
        peers.set(data.p, { data: data.d, expires: Date.now() + 4_000 });
        if (!before || JSON.stringify(before.data) !== JSON.stringify(data.d)) events.peerChange();
      } else if (data.type === 'leave') {
        if (peers.delete(data.p)) events.peerChange();
      } else if (data.type === 'broadcast' && typeof data.event === 'string' && eventPattern.test(data.event)) {
        const message = unpack(data.frame);
        if (message && message.peer === data.p) events.message(data.event, message);
      }
    };
    channel.postMessage({ type: 'hello', p: peerId });
    const pulse = setInterval(() => {
      announce();
      let expired = false;
      for (const [id, meta] of peers) {
        if (meta.expires < Date.now()) {
          peers.delete(id);
          expired = true;
        }
      }
      if (expired) events.peerChange();
    }, 1000);
    return {
      peerId,
      join,
      async emit(event, data) {
        if (!online) throw new Error('El canal se cerró.');
        channel.postMessage({ type: 'broadcast', p: peerId, event, frame: frame(peerId, event, data) });
      },
      on: events.on,
      async presence(data) {
        checkPresence(data);
        tracked = data;
        announce();
        events.peerChange();
      },
      peers() {
        if (!online) return [];
        const others: Peer[] = [...peers].map(([peer, meta]) => ({ peer, data: meta.data }));
        return tracked ? [{ peer: peerId, data: tracked }, ...others] : others;
      },
      onPeers: events.onPeers,
      async leave() {
        if (!online) return;
        online = false;
        clearInterval(pulse);
        channel.postMessage({ type: 'leave', p: peerId });
        channel.close();
        events.clear();
      },
      connected: () => online,
    };
  }
  return baseRoom(peerId, join);
}
