import { test } from "node:test";
import assert from "node:assert/strict";
import { RNG } from "../core/rng";
import { GameSimulation } from "../core/simulation";
import { World, generateRow, hazardsAt, signalAt } from "../core/world";
import { ACTIONS, DEFAULT_CONFIG, DT, TRAIN_START } from "../core/types";
import { sweptHit } from "../core/collision";
import { INPUT_COUNT } from "../core/observation";

test("same seed/actions reproduce every observation, collision, score and snapshot", () => {
  const a = new GameSimulation({}, 123),
    b = new GameSimulation({}, 123),
    rng = new RNG(77);
  for (let i = 0; i < 100; i++) {
    const action = rng.pick(ACTIONS);
    assert.deepEqual(a.step(action), b.step(action));
    assert.deepEqual(a.getState(), b.getState());
  }
  a.reset(99);
  b.reset(99);
  assert.deepEqual(a.getState(), b.getState());
});

test("continuous local sensors are bounded and deterministic and cannot change physics", () => {
  const a = new GameSimulation({}, 123),
    b = new GameSimulation({}, 123);
  let fractional = false;
  for (const action of ["UP", "UP", "WAIT", "LEFT", "UP", "RIGHT"] as const) {
    const before = a.getState();
    const observation = a.getObservation(2);
    assert.equal(observation.length, INPUT_COUNT);
    assert.ok(
      [...observation].every((v) => Number.isFinite(v) && v >= -1 && v <= 1),
    );
    fractional ||= [...observation].some((v) => v > 0 && v < 1);
    assert.deepEqual(a.getObservation(2), b.getObservation(2));
    assert.deepEqual(a.getState(), before);
    a.step(action);
    b.step(action);
    assert.deepEqual(a.getState(), b.getState());
  }
  assert.ok(fractional);
});
test("row access order and cache eviction cannot change content", () => {
  const a = new World(19, DEFAULT_CONFIG),
    b = new World(19, DEFAULT_CONFIG);
  for (let r = 150; r >= 0; r--) b.row(r);
  for (let r = 0; r < 160; r++) assert.deepEqual(a.row(r), b.row(r));
  assert.ok(a.cacheSize <= 96);
  assert.notDeepEqual(a.row(12), generateRow(20, 12, DEFAULT_CONFIG));
});
test("cars wrap continuously and speed scales in simulated seconds", () => {
  const r = generateRow(4, 2, DEFAULT_CONFIG);
  assert.equal(r.type, "road");
  const h = hazardsAt(r, 0)[0],
    later = hazardsAt(r, 1)[0];
  assert.ok(Math.abs(later.x - h.x - h.speed * DT) < 1e-10);
  for (let t = 0; t < 10000; t += 37)
    for (const car of hazardsAt(r, t)) assert.ok(car.x >= -11 && car.x < 11);
});
test("trajectory sensors see an intervening hazard while preserving legacy observations and physics", () => {
  const sim = new GameSimulation();
  sim.agent.row = 1;
  sim.agent.maxRow = 1;
  const row = sim.world.row(2);
  row.type = "road";
  row.blocked = [];
  row.speed = -20;
  row.vehicles = [{ offset: 2, length: 1.05, variant: "car" }];
  const before = sim.getState();
  const original = sim.getObservation(1), trajectory = sim.getObservation(3);
  assert.equal(original[648 + 3], 0);
  assert.equal(trajectory[648 + 3], 1);
  assert.deepEqual(trajectory.slice(0, 648), original.slice(0, 648));
  assert.ok([...trajectory].every((v) => Number.isFinite(v) && v >= -1 && v <= 1));
  assert.deepEqual(sim.getState(), before);
  sim.step("UP", false);
  assert.equal(sim.agent.deathReason, "car");
});
test("swept collisions catch fast trains, mid-hop contact and reject mismatched axis times", () => {
  assert.equal(sweptHit(0, 0, 0, 1, -4, 4, 1, 2), true);
  assert.equal(sweptHit(0, 0, 0, 1, 0, 0, 1, 0.8), true);
  assert.equal(sweptHit(0, 0, 0, 1, -9, -8, 1, 1), false);
  assert.equal(sweptHit(-3, -3, 3, 3, 0, 0, 2, 0.1), false);
});
test("blocked trees consume a decision, bounds kill, timeout truncates", () => {
  const s = new GameSimulation({ maxTicks: 24 });
  s.step("LEFT");
  s.step("WAIT");
  assert.equal(s.agent.deathReason, "timeout");
  const b = new GameSimulation();
  b.step("DOWN");
  assert.equal(b.agent.deathReason, "bounds");
  const c = new GameSimulation();
  c.world.row(1).blocked.push(0);
  const res = c.step("UP");
  assert.equal(res.blocked, true);
  assert.equal(c.agent.row, 0);
  assert.equal(c.tick, 12);
});
test("train warning precedes entering playable bounds and schedules repeat", () => {
  let rail;
  for (let r = 2; r < 100; r++) {
    const row = generateRow(88, r, { ...DEFAULT_CONFIG, curriculum: "trains" });
    if (row.type === "rail") {
      rail = row;
      break;
    }
  }
  assert.ok(rail);
  rail.phase = 0;
  const arrival = (TRAIN_START - 4.5 - rail.length / 2) / Math.abs(rail.speed);
  assert.equal(signalAt(rail, (arrival - 0.5) / DT), true);
  assert.equal(
    signalAt(rail, Math.max(0, arrival - rail.warning - 0.1) / DT),
    false,
  );
  assert.ok(
    Math.abs(
      hazardsAt(rail, 100)[0].x - hazardsAt(rail, 100 + rail.period / DT)[0].x,
    ) < 1e-8,
  );
});
test("actual physics kills a chicken while hopping; fatal hop earns no row", () => {
  const s = new GameSimulation();
  const r = s.world.row(1);
  r.type = "road";
  r.speed = 20;
  r.vehicles = [{ offset: -2, length: 1, variant: "car" }];
  s.step("UP");
  assert.equal(s.agent.deathReason, "car");
  assert.ok(s.agent.row > 0 && s.agent.row < 1);
  assert.equal(s.agent.maxRow, 0);
});
test("observation fixed, finite and normalized with explicit unknowns", () => {
  const s = new GameSimulation();
  const o = s.getObservation();
  assert.equal(o.length, INPUT_COUNT);
  assert.ok([...o].every((v) => Number.isFinite(v) && v >= -1 && v <= 1));
  assert.equal(o[8], 1);
});
test("a winding static route remains clear across many seeds", () => {
  for (let seed = 0; seed < 20; seed++) {
    const w = new World(seed, DEFAULT_CONFIG);
    for (let r = 2; r < 200; r++) {
      const row = w.row(r);
      assert.ok(row.blocked.length <= 2);
      assert.ok(
        Array.from({ length: 9 }, (_, i) => i - 4).filter(
          (x) => !row.blocked.includes(x),
        ).length >= 7,
      );
    }
  }
});

test("fast train crosses an occupied lane in one tick without tunneling", () => {
  const s = new GameSimulation({ curriculum: "trains" });
  s.agent.row = 1;
  const r = s.world.row(1);
  r.type = "rail";
  r.speed = 600;
  r.length = 2;
  r.phase = (TRAIN_START - 4) / 600;
  r.period = 10;
  const result = s.step("UP");
  assert.equal(result.deathReason, "train");
  assert.equal(result.terminated, true);
  assert.equal(s.tick, 1);
  assert.equal(s.agent.maxRow, 0);
});
test("wrapping a distant car never sweeps a phantom collision through the map", () => {
  const s = new GameSimulation();
  const r = s.world.row(0);
  r.type = "road";
  r.speed = 12;
  r.vehicles = [{ offset: 10.95, length: 1, variant: "car" }];
  s.step("WAIT");
  assert.equal(s.agent.alive, true);
});
test("invalid boundary action takes precedence over a simultaneous hazard", () => {
  const s = new GameSimulation();
  s.agent.x = 4;
  const r = s.world.row(0);
  r.type = "road";
  r.vehicles = [{ offset: 4, length: 1, variant: "car" }];
  s.step("RIGHT");
  assert.equal(s.agent.deathReason, "bounds");
  assert.equal(s.tick, 0);
});
