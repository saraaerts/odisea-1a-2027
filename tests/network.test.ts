import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanAvatar } from '../src/config.ts';
import { createGame, encodeState, launch, RULES, tick, type GameAction } from '../src/sim/index.ts';
import { acknowledged, addAck, cleanPlayer, MAX_BODY_BYTES, readSnapshot, readSummary, type Ack } from '../src/net/protocol.ts';
import { createRealtimeRoom, jsonBytes, type RealtimeClient } from '../src/net/room.ts';
import { createSession, watchBoard, type BoardSummary, type Session, type SessionView } from '../src/net/session.ts';

type WireChannel = ReturnType<RealtimeClient['channel']>;
type Outbound = Parameters<WireChannel['send']>[0];
type Meta = { [key: string]: unknown };

const testAvatar = cleanAvatar({
  pelo: 9, ropa: 5, gorro: 7, acc: 7, lentes: 10, style: 'retro',
  custom: { jaw: -2, cheek: 2, eyes: 2, brows: -2, nose: -2, lips: 2,
    skin: '#a0969b', hair: '#aeb5c7', suit: '#0056f3', hat: '#062149',
    accessory: '#4F913C', glasses: '#8C4C17' },
});

class FakeChannel implements WireChannel {
  online = false;
  meta: Meta | null = null;
  statuses: ((status: string) => void) | undefined;
  handlers = new Map<string, (data: unknown) => void>();

  readonly server: FakeRealtime;
  readonly topic: string;
  readonly peer: string;

  constructor(server: FakeRealtime, topic: string, peer: string) {
    this.server = server;
    this.topic = topic;
    this.peer = peer;
  }

  on(type: string, _filter: { event: string }, listener: (data: unknown) => void): this {
    this.handlers.set(type, listener);
    return this;
  }

  subscribe(listener: (status: string) => void): this {
    this.statuses = listener;
    this.online = true;
    listener('SUBSCRIBED');
    return this;
  }

  async send(input: Outbound): Promise<string> {
    // Un canal que nunca se suscribió envía por REST, como supabase-js.
    if (!this.online && this.statuses) return 'error';
    this.server.send(this, input);
    return 'ok';
  }

  async track(meta: Meta): Promise<string> {
    this.meta = structuredClone(meta);
    this.server.sync(this.topic);
    return 'ok';
  }

  presenceState(): Record<string, unknown[]> {
    return Object.fromEntries(this.server.online(this.topic).filter(channel => channel.meta)
      .map(channel => [channel.peer, [structuredClone(channel.meta)]]));
  }

  setOnline(online: boolean): void {
    this.online = online;
    if (!online) this.meta = null;
    this.statuses?.(online ? 'SUBSCRIBED' : 'CHANNEL_ERROR');
    this.server.sync(this.topic);
  }
}

class FakeRealtime {
  time = 0;
  dropped = 0;
  transmissions: Outbound[] = [];
  channels: FakeChannel[] = [];
  scheduled: { due: number; callback: () => void }[] = [];
  #seed = 0x57fa9132;

  client(): RealtimeClient {
    return {
      channel: (topic, options) => {
        const channel = new FakeChannel(this, topic, options.config.presence.key);
        this.channels.push(channel);
        return channel;
      },
      removeChannel: async channel => {
        this.channels = this.channels.filter(candidate => candidate !== channel);
        (channel as FakeChannel).setOnline(false);
      },
    };
  }

  online(topic: string): FakeChannel[] {
    return this.channels.filter(channel => channel.online && channel.topic === topic);
  }

  setOnline(peer: string, online: boolean): void {
    for (const channel of this.channels.filter(item => item.peer === peer)) channel.setOnline(online);
  }

  sync(topic: string): void {
    for (const channel of this.online(topic)) channel.handlers.get('presence')?.(null);
  }

  send(from: FakeChannel, input: Outbound): void {
    this.transmissions.push(structuredClone(input));
    for (const receiver of this.online(from.topic).filter(channel => channel !== from)) {
      this.#seed = (Math.imul(1664525, this.#seed) + 1013904223) >>> 0;
      if (this.#seed / 0x100000000 < 0.05) {
        this.dropped++;
        continue;
      }
      const message = structuredClone(input);
      this.scheduled.push({
        due: this.time + 500,
        callback: () => {
          if (receiver.online) receiver.handlers.get('broadcast')?.(message);
        },
      });
    }
  }

  async advance(ms: number, sessions: Session[]): Promise<void> {
    assert.equal(ms % 100, 0);
    for (let end = this.time + ms; this.time < end;) {
      this.time += 100;
      const deliver = this.scheduled.filter(task => task.due <= this.time);
      this.scheduled = this.scheduled.filter(task => task.due > this.time);
      for (const task of deliver) task.callback();
      if (this.time % 200 === 0) {
        for (const session of sessions) session.pulse();
        await Promise.resolve();
      }
    }
  }
}

test('cuatro clientes con 500 ms y 5 % de pérdida sobreviven a la caída y retorno del anfitrión', async () => {
  const network = new FakeRealtime();
  const observed: BoardSummary[] = [];
  const stop = await watchBoard(createRealtimeRoom(network.client(), 'viewer'), 'jorn', item => observed.push(item));
  const sessions: Session[] = [];
  const options = [
    ['pilot0', 'tut'],
    ['pilot1', 'coa'],
    ['pilot2', 'azu'],
    ['pilot3', 'sec'],
  ] as const;
  const changes: SessionView[] = [];
  for (const [id, area] of options) {
    sessions.push(await createSession({
      room: createRealtimeRoom(network.client(), id),
      code: 'nave', jornada: 'jorn',
      profile: { name: id, area, avatar: testAvatar },
      host: id === 'pilot0', clock: () => network.time, autoTick: false,
      onChange: id === 'pilot2' ? view => changes.push(view) : undefined,
    }));
  }
  const [oldHost, first, second, third] = sessions;
  await network.advance(2000, sessions);
  assert.equal(first.view().players.length, 4);
  assert.deepEqual(first.view().players.map(player => player.avatar), Array(4).fill(testAvatar));
  assert.equal(second.start(), false, 'un visitante no controla la partida');
  assert.equal(oldHost.start(800), true);
  await network.advance(7000, sessions);
  assert.equal(oldHost.view().game?.phase, 'play');
  assert.equal(first.view().game?.adjustmentMs, 800);
  assert.equal(first.view().game?.need, 14);
  const gid = first.view().game?.gid;
  assert.ok(gid);

  // La pérdida puede forzar un reenvío de este toque. Nunca se ejecuta dos veces.
  const order = oldHost.view().game!.orders.find(item => item.actor === first.peerId);
  assert.ok(order);
  const action: GameAction = { type: 'control', stage: 0, control: order.control, value: order.value ?? undefined };
  assert.equal(first.act(action), true);
  await network.advance(2800, sessions);
  assert.equal(oldHost.view().game?.stats.ok, 1);
  assert.equal(second.view().game?.stats.ok, 1);

  const before = oldHost.view().game!.time;
  const oldWire = network.transmissions.filter(item => item.event === 'st').at(-1)!;
  network.setOnline(oldHost.peerId, false);
  await network.advance(5600, sessions);
  assert.ok(changes.some(view => view.reconnecting), 'la tripulación ve el corte');
  assert.equal(first.view().host, true, 'el primer candidato conectado toma el mando');
  assert.equal(second.view().host, false);
  assert.equal(third.view().host, false);
  assert.equal(second.view().game?.gid, gid);
  assert.ok(first.view().game!.time - before < 1500, 'la caída no consume el tiempo de la orden');
  assert.equal(first.view().game?.stats.ok, 1);

  network.setOnline(oldHost.peerId, true);
  await network.advance(2500, sessions);
  assert.equal(oldHost.view().host, false, 'quien volvió queda como tripulante');
  assert.equal(oldHost.view().game?.gid, gid);
  assert.equal(first.view().game?.active.length, 4);
  assert.deepEqual(oldHost.view().game?.players.map(player => player.avatar), Array(4).fill(testAvatar));
  const oldChannel = network.channels.find(channel => channel.peer === oldHost.peerId && channel.topic.includes('group:'))!;
  await oldChannel.send(oldWire);
  await network.advance(800, sessions);
  assert.equal(second.view().game?.gid, gid, 'se descarta un mensaje de un epoch anterior');
  assert.equal(first.view().host, true);
  assert.ok(observed.some(item => item.epoch === 1 && item.host === first.peerId));
  assert.ok(observed.some(item => item.players.length === 4 && item.players.every(player =>
    player.avatar.custom?.skin === '#A0969B' && player.avatar.custom?.brows === -2 && player.avatar.style === 'retro')));
  assert.equal(network.channels.filter(channel => channel.topic.includes('live:')).length, 2,
    'solo el anfitrión y el proyector quedan suscriptos al canal común');
  assert.equal(network.channels.filter(channel => channel.topic.includes('live:') && channel.online).length, 1,
    'el anfitrión solo envía al canal común: no recibe los resúmenes de las demás salas');
  assert.ok(observed.every(item => item.players.every(player => !('name' in player))));
  assert.ok(network.dropped > 0, 'el escenario efectivamente descartó mensajes');
  assert.ok(network.transmissions.every(item => jsonBytes(item) < 4096));
  await Promise.all(sessions.map(session => session.leave()));
  await stop();
});

test('el adaptador descarta paquetes grandes y el protocolo limpia datos ajenos', async () => {
  const network = new FakeRealtime();
  const first = await createRealtimeRoom(network.client(), 'p1').join('group:jorn:nave');
  const second = await createRealtimeRoom(network.client(), 'p2').join('group:jorn:nave');
  let called = false;
  second.on('act', () => { called = true; });
  await assert.rejects(first.emit('act', { text: '🪐'.repeat(1000) }), /demasiado grande/);
  const target = network.channels.find(channel => channel.peer === 'p2')!;
  target.handlers.get('broadcast')?.({ event: 'act', payload: { v: 1, p: 'p1', d: '🪐'.repeat(1000) } });
  target.handlers.get('broadcast')?.({ event: 'act', payload: { v: 9, p: 'p1', d: {} } });
  assert.equal(called, false);
  await first.emit('act', { text: 'ok' });
  await network.advance(500, []);
  assert.equal(called, true);
  assert.equal(cleanPlayer('p1', { name: '<script>\u0000', area: 'tut' })?.name, 'script');
  assert.equal(cleanPlayer('p1', { name: 'Santi', area: '__proto__' }), null);
  assert.equal(readSummary({ code: 'nave', fleet: 41 }, 'p1'), null);
  await Promise.all([first.leave(), second.leave()]);
});

test('el ACK distingue acciones fuera de orden y descarta copias antiguas', () => {
  const acks: Ack[] = [];
  addAck(acks, 'p1', 3);
  assert.equal(acknowledged(acks[0], 2), false);
  addAck(acks, 'p1', 2);
  assert.equal(acknowledged(acks[0], 2), true);
  assert.equal(acknowledged(acks[0], 3), true);
  addAck(acks, 'p1', 35);
  assert.equal(acknowledged(acks[0], 3), true);
  assert.equal(acknowledged(acks[0], 34), false);
});

test('los avatares del catálogo anterior mantienen índices, y los ajustes nuevos se validan en red', () => {
  const legacy = cleanAvatar({ pelo: 9, cara: 5 });
  assert.equal(legacy.pelo, 9);
  assert.equal(legacy.cara, 0);
  assert.equal(legacy.lentes, 1);
  assert.equal(Object.hasOwn(legacy, 'custom'), false);
  assert.equal(Object.hasOwn(legacy, 'style'), false);
  assert.equal(Object.hasOwn(cleanAvatar({ style: '05' }), 'style'), false);
  const overrides = { jaw: 0, cheek: -1, eyes: 3, brows: '1', nose: 1.2, lips: -2,
    skin: '#decafe', hair: '#bad', suit: 'rgb(1,2,3)', glasses: '#abc123\n', hat: '#112233', tag: 'x' };
  assert.deepEqual(cleanPlayer('peer', { area: 'tut', name: 'Vega', avatar: { custom: overrides } })?.avatar.custom,
    { cheek: -1, lips: -2, skin: '#DECAFE', hat: '#112233' });
  const state = createGame([{ id: 'peer', name: 'Vega', area: 'tut', avatar: legacy }]);
  const packet = { e: 0, r: 1, a: [], s: encodeState(state) };
  assert.deepEqual(readSnapshot(packet)?.s.players[0].avatar, legacy);
  const retro = { ...legacy, style: 'retro' as const };
  state.players[0].avatar = retro;
  assert.deepEqual(readSnapshot({ ...packet, s: encodeState(state) })?.s.players[0].avatar, retro);
});

test('cuatro avatares con todos los ajustes caben en la instantánea con margen para una partida activa', () => {
  const ids = ['100000000001', '100000000002', '100000000003', '100000000004'];
  const state = createGame(ids.map(id => ({ id, name: '🌌'.repeat(18), area: 'tut', avatar: testAvatar })));
  state.time = 84000100 - RULES.transitionMs;
  launch(state);
  tick(state, RULES.transitionMs);
  // Los fuegos, eventos y acciones recientes pueden coexistir en el estado de respaldo.
  state.time = 84000100;
  state.fireSeq = 40;
  state.eventSeq = 10000;
  const fireCount = Math.ceil(RULES.initialHull / RULES.timeoutDamage);
  state.fires = Array.from({ length: fireCount }, (_, index) => ({ id: index + 1, next: 84002100, slot: index }));
  state.events = Array.from({ length: 7 }, (_, index) => ({ id: 9994 + index, kind: 'help', peer: ids[0], to: ids[1] }));
  state.recent = Array.from({ length: 20 }, (_, index) => [index % 4, 'tut0', 84000000 + index]);
  state.touches = Array.from({ length: 36 }, (_, index) => [index % 4, 'tut0', -1, 84000000 + index]);
  const packet = { e: 42, r: 387, a: ids.map(id => [id, 1_000_000, 0xffffffff]), s: encodeState(state) };
  assert.ok(jsonBytes(packet) < MAX_BODY_BYTES, `La instantánea ocupa ${jsonBytes(packet)} bytes`);
  assert.ok(jsonBytes({ v: 1, p: ids[0], d: packet }) < 4096);
  const decoded = readSnapshot(packet);
  assert.ok(decoded);
  assert.deepEqual(decoded.s.players.map(player => player.avatar), Array(4).fill(testAvatar));
});

test('un anfitrión en segundo plano, con un pulso por segundo, mantiene el reloj en tiempo real', async () => {
  const network = new FakeRealtime();
  const sessions: Session[] = [];
  for (const [id, area] of [['pilot0', 'tut'], ['pilot1', 'ri']] as const) {
    sessions.push(await createSession({
      room: createRealtimeRoom(network.client(), id), code: 'nave', jornada: 'jorn',
      profile: { name: id, area, avatar: cleanAvatar({}) },
      host: id === 'pilot0', clock: () => network.time, autoTick: false,
    }));
  }
  const [host, guest] = sessions;
  await network.advance(2000, sessions);
  assert.equal(host.start(), true);
  const before = host.view().game!.time;
  for (let second = 0; second < 20; second++) {
    await network.advance(800, [guest]);
    await network.advance(200, sessions);
  }
  const elapsed = host.view().game!.time - before;
  assert.ok(elapsed >= 18_000 && elapsed <= 20_000, 'avanzó ' + elapsed + ' ms en 20 s');
  assert.equal(guest.view().host, false);
  await Promise.all(sessions.map(session => session.leave()));
});
