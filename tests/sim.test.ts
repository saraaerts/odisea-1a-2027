import assert from "node:assert/strict";
import { test } from "node:test";
import { CONFIG, PASS_SHIPS, cleanAvatar, type AreaId } from "../src/config.ts";
import {
  RULES, applyAction, createGame, decodeAction, decodeState, encodeState, launch,
  orderDurationMs, ordersRequired, outcome, setActivePlayers, tick, visibleControls,
  type GameState, type Order, type Player,
} from "../src/sim/index.ts";

function crew(areas: AreaId[] = ["tut", "azu", "sec", "ri"]): Player[] {
  return areas.map((area, index) => ({
    id: String(index + 1).repeat(12), name: ["Eva", "Teo", "Cami", "Paz"][index],
    area, avatar: cleanAvatar(null),
  }));
}

function playing(areas?: AreaId[]): GameState {
  const state = createGame(crew(areas), { gid: "prueba", seed: 81 });
  launch(state);
  tick(state, RULES.transitionMs);
  return state;
}

function doOrder(state: GameState, order: Order): boolean {
  return applyAction(state, order.actor, {
    type: "control", control: order.control, value: order.value ?? undefined, stage: state.stage,
  });
}

test("cuatro bots coordinan los puestos y completan las ocho etapas", () => {
  const state = playing(["ri", "ri", "ri", "ri"]);
  const stages = new Set<number>();
  assert.equal(state.need, 14);
  assert.equal(ordersRequired(1), 8);
  assert.equal(ordersRequired(3), 12);
  assert.equal(ordersRequired(8), 18);
  for (let attempt = 0; state.phase !== "end" && attempt < 150; attempt += 1) {
    if (state.phase === "between") {
      tick(state, RULES.transitionMs);
      continue;
    }
    stages.add(state.stage);
    const order = state.orders[0];
    assert.ok(order);
    assert.notEqual(order.reader, order.actor);
    assert.equal(order.due - state.time <= orderDurationMs(state.stage, 0), true);
    assert.ok(visibleControls(state, order.actor).some(control => control.id === order.control));
    assert.equal(doOrder(state, order), true);
    tick(state, RULES.duplicateMs);
  }
  assert.equal(state.phase, "end");
  assert.equal(stages.size, CONFIG.etapas.length);
  assert.equal(state.stats.ok, 14 * 8);
  assert.equal(state.ships, 40);
  assert.equal(state.hull, 100);
  assert.deepEqual(outcome(state), { title: "Misión perfecta", points: 100, kind: "meta" });
  assert.equal(orderDurationMs(0, 0), 10000);
  assert.equal(orderDurationMs(7, 0), 5800);
  assert.equal(orderDurationMs(7, -2000), 5000);
  assert.equal(orderDurationMs(0, 3000), 13000);
});

test("la gracia de 800 ms permite actuar con el reloj en cero", () => {
  const state = playing();
  const order = state.orders[0];
  tick(state, order.due - state.time + RULES.graceMs);
  assert.equal(state.ships, 40);
  assert.equal(doOrder(state, order), true);
  assert.equal(state.stats.ok, 1);
});

test("cada vencimiento pierde una nave y deja un fuego que daña cada dos segundos", () => {
  const state = playing();
  tick(state, state.orders[0].due - state.time + RULES.graceMs + 1);
  assert.equal(state.ships, 36);
  assert.equal(state.hull, 68);
  assert.equal(state.fires.length, 4);
  assert.equal(state.done, 0);
  assert.equal(state.orders.length, 4);
  assert.equal(state.losses[0], 4);
  const actor = state.players[0].id;
  const fire = state.fires[0];
  assert.equal(applyAction(state, actor, { type: "fire", id: fire.id, stage: 0 }), true);
  assert.equal(applyAction(state, actor, { type: "fire", id: fire.id, stage: 0 }), false);
  tick(state, 1999);
  assert.equal(state.hull, 68);
  tick(state, 1);
  assert.equal(state.hull, 65);
  tick(state, 4000);
  assert.equal(state.hull, 59);
  tick(state, 60000);
  assert.equal(state.phase, "end");
  assert.equal(state.hull, 0);
  assert.deepEqual(outcome(state), { title: "Nave rota", points: 5, kind: "nave_rota" });
  assert.ok(decodeState(JSON.parse(JSON.stringify(encodeState(state)))));
});

test("tres controles no pedidos cuestan casco y una nave; los duplicados inmediatos se ignoran", () => {
  const state = playing();
  const actor = state.players[0].id;
  const control = visibleControls(state, actor).find(control => control.kind === "b" &&
    !state.orders.some(order => order.actor === actor && order.control === control.id));
  assert.ok(control);
  const action = { type: "control", control: control.id, stage: 0 } as const;
  assert.equal(applyAction(state, actor, action), true);
  tick(state, RULES.duplicateMs - 1);
  assert.equal(applyAction(state, actor, action), false);
  assert.equal(state.hull, 98);
  tick(state, 1);
  assert.equal(applyAction(state, actor, action), true);
  tick(state, RULES.duplicateMs);
  assert.equal(applyAction(state, actor, action), true);
  assert.equal(state.hull, 94);
  assert.equal(state.errors, 0);
  assert.equal(state.ships, 39);
  assert.equal(state.stats.err, 3);
});

test("una orden reciente, cumplida o vencida, tolera toques hasta el umbral de cinco segundos", () => {
  for (const expired of [false, true]) {
    const state = playing();
    const order = state.orders[0];
    if (expired) tick(state, order.due - state.time + RULES.graceMs + 1);
    else assert.equal(doOrder(state, order), true);
    state.orders = state.orders.filter(next => next.actor !== order.actor || next.control !== order.control);
    tick(state, RULES.lateMs - 1);
    state.orders = state.orders.filter(next => next.actor !== order.actor || next.control !== order.control);
    assert.equal(doOrder(state, order), true);
    assert.equal(state.stats.err, 0);
    tick(state, RULES.duplicateMs);
    state.orders = state.orders.filter(next => next.actor !== order.actor || next.control !== order.control);
    assert.equal(doOrder(state, order), true);
    assert.equal(state.stats.err, 1);
  }
});

test("las manos pertenecen a cada persona y se renuevan al iniciar la etapa siguiente", () => {
  const state = playing();
  const order = state.orders[0];
  const [helper, other] = state.players.filter(player => player.id !== order.reader);
  const act = { type: "help", to: order.reader, order: order.id, stage: state.stage } as const;
  const before = order.due;
  assert.equal(applyAction(state, order.reader, act), false);
  for (let i = 0; i < 3; i += 1) assert.equal(applyAction(state, helper.id, act), true);
  assert.equal(applyAction(state, helper.id, act), false);
  assert.equal(applyAction(state, other.id, act), true);
  assert.equal(order.due, before + 4 * RULES.helpMs);
  assert.equal(state.hands[helper.id], 0);
  assert.equal(state.hands[other.id], 2);
  for (let i = 0; i < 14; i += 1) {
    assert.equal(doOrder(state, state.orders[0]), true);
    if (state.phase === "play") tick(state, RULES.duplicateMs);
  }
  tick(state, RULES.transitionMs);
  assert.equal(state.stage, 1);
  assert.ok(Object.values(state.hands).every(count => count === 3));
});

test("valida el panel, los diales, el resultado por umbral y los puntos de práctica", () => {
  const state = playing();
  const actor = state.players[0].id;
  assert.equal(applyAction(state, actor, { type: "control", control: "sec0", stage: 0 }), false);
  assert.equal(applyAction(state, actor, { type: "control", control: "tut2", value: 4, stage: 0 }), false);
  assert.equal(applyAction(state, actor, { type: "control", control: "tut0", stage: 1 }), false);
  assert.equal(decodeAction({ type: "control", control: "constructor", stage: 0 }), null);
  assert.equal(decodeAction({ type: "control", control: "tut1", value: "1", stage: 0 }), null);
  const order = state.orders[0];
  order.actor = actor;
  order.control = "tut2";
  order.value = 3;
  assert.equal(applyAction(state, actor, { type: "control", control: "tut2", value: 2, stage: 0 }), true);
  assert.equal(state.stats.err, 0);
  assert.equal(doOrder(state, order), true);
  assert.equal(state.stats.ok, 1);
  state.cleared = 7;
  // Objetivo: 43 % de 40 naves = 17,2, se redondea a 18.
  assert.equal(PASS_SHIPS, 18);
  state.ships = 18;
  assert.deepEqual(outcome(state), { title: "Aprobaron", points: 50, kind: "aprobado" });
  state.ships = 17;
  assert.deepEqual(outcome(state), { title: "No alcanzó", points: 10, kind: "participar" });
  state.group = false;
  assert.equal(outcome(state).points, 0);
});

test("al desconectarse un puesto las órdenes se reasignan y el puesto puede volver", () => {
  const state = playing();
  const gone = state.players[0].id;
  const survivors = state.active.filter(peer => peer !== gone);
  const cancelled = state.orders.find(order => order.reader === gone);
  assert.ok(cancelled);
  setActivePlayers(state, survivors);
  assert.equal(state.players.length, 4);
  assert.equal(state.orders.length, 3);
  assert.equal(state.need, 14);
  assert.ok(state.orders.every(order => order.reader !== gone && order.actor !== gone));
  assert.equal(doOrder(state, cancelled), true);
  assert.equal(state.stats.err, 0, "La orden que pudo llegar a leerse se trata como toque tardío");
  setActivePlayers(state, [...survivors, gone]);
  assert.equal(state.orders.length, 4);
  assert.ok(state.orders.some(order => order.reader === gone));
});

test("Reinscripción conserva nombres y activa sólo los controles de la etapa ocho", () => {
  const state = playing(["ri", "sec", "azu", "pp"]);
  assert.deepEqual(CONFIG.areas.map(area => area.nombre), [
    "Tutores", "Coaches", "Azu", "Secretaría", "Exámenes finales", "RI", "PP", "Training",
  ]);
  for (let i = 0; state.stage < 7 && i < 125; i += 1) {
    if (state.phase === "between") tick(state, RULES.transitionMs);
    else {
      doOrder(state, state.orders[0]);
      tick(state, RULES.duplicateMs);
    }
  }
  assert.equal(state.stage, 7);
  assert.equal(CONFIG.etapas[state.stage].nombre, "Estación de reinscripción");
  const [ri, sec, azu, pp] = state.players.map(player => visibleControls(state, player.id).map(control => control.label));
  assert.deepEqual(ri, ["Reinscripciones activas", "Suscripción", "Fase de descuento", "Métodos de pago", "Pedido de excepción"]);
  assert.deepEqual(sec, ["Trámite de título intermedio", "Trámite de título", "Otros servicios"]);
  assert.ok(azu.includes("Cargar materias en Canvas"));
  assert.ok(!azu.includes("Bancos de preguntas sincronizados"));
  assert.ok(pp.includes("Validar informes finales"));
  assert.ok(!pp.includes("Convenios"));
});

test("la instantánea compacta preserva el reloj, el sorteo y la protección contra duplicados", () => {
  const state = playing(["coa", "coa", "coa", "coa"]);
  for (const player of state.players) player.name = "🛰️🚀🌌✨🛸🔧🛟🌟🌑😀🌎🛰️🚀🌌✨";
  for (const player of state.players) {
    for (const control of visibleControls(state, player.id)) {
      const values = control.kind === "b" ? [undefined] : [0, 1];
      for (const value of values) applyAction(state, player.id, { type: "control", control: control.id, value, stage: 0 });
    }
  }
  const packet = JSON.stringify({
    p: state.players[0].id, topic: "st", data: { epoch: 4, revision: 127, state: encodeState(state) },
  });
  assert.ok(Buffer.byteLength(packet) < 4096, "La instantánea y su envoltorio deben caber en 4 KiB");
  const copy = decodeState(JSON.parse(packet).data.state);
  assert.ok(copy);
  assert.deepEqual(copy, state);
  const order = state.orders[0];
  assert.equal(doOrder(copy, order), doOrder(state, order));
  tick(state, 15000);
  tick(copy, 15000);
  assert.deepEqual(copy, state);
  assert.equal(decodeState({ ...state, hull: "999" }), null);
  assert.equal(decodeState({ ...state, orders: [{ ...state.orders[0], due: -1 }] }), null);
  const withExtra = decodeState({ ...state, extra: "No se incorpora" });
  assert.ok(withExtra);
  assert.equal(Object.hasOwn(withExtra, "extra"), false);
});

test("los pedidos cruzan a toda la tripulación, pesan las áreas en foco y no repiten enseguida", () => {
  const perActor = new Map<string, number>();
  const pairs = new Set<string>();
  let orders = 0, repeats = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    // Etapa 1: Tutores está en foco; Secretaría y RI no.
    const state = createGame(crew(["tut", "sec", "ri", "ri"]), { gid: "cruce", seed });
    launch(state);
    tick(state, RULES.transitionMs);
    const seen = new Set<number>();
    const last = new Map<string, string>();
    for (let step = 0; state.stage === 0 && state.phase === "play" && step < 400; step += 1) {
      for (const order of [...state.orders]) {
        if (seen.has(order.id)) continue;
        seen.add(order.id);
        orders += 1;
        assert.notEqual(order.reader, order.actor);
        assert.ok(state.orders.filter(other => other.actor === order.actor).length <= 2);
        if (last.get(order.actor) === order.control) repeats += 1;
        last.set(order.actor, order.control);
        perActor.set(order.actor, (perActor.get(order.actor) ?? 0) + 1);
        if (seed === 1) pairs.add(order.reader + ">" + order.actor);
      }
      const order = state.orders[step % state.orders.length];
      if (order) doOrder(state, order);
      tick(state, 400);
    }
  }
  const [tutores, ...others] = crew(["tut", "sec", "ri", "ri"]).map(player => perActor.get(player.id) ?? 0);
  assert.ok(pairs.size > 4, "cada persona le lee a más de un compañero");
  assert.ok(others.every(count => tutores > count * 1.15), "el área en foco recibe más pedidos");
  assert.ok(repeats / orders < 0.12, "pocas repeticiones inmediatas");
});
