import assert from "node:assert/strict";
import { test } from "node:test";
import { GameSimulation } from "../core/simulation";
import { CURRENT_CONFIG, DEFAULT_CONFIG, ACTIONS, type Action, type Config } from "../core/types";
import { RNG } from "../core/rng";
import { BIAS, OUTPUT_START, Innovations, cloneGenome, minimalGenome, type Genome } from "../evolution/genome";
import { episode, evaluateGenome, fitness, type Trace } from "../evolution/evaluation";
import { Network } from "../evolution/network";
import { parseCheckpoint } from "../evolution/checkpoint";
import { stringifyEvolution } from "../evolution/serialization";
import { DEFAULT_TRAINING, Trainer } from "../evolution/trainer";
import { Replay } from "../evolution/replay";
import { ReferenceSimulation } from "./fixtures/reference-simulation";

const rules = (afterTicks = 600, warningTicks = 180): Config => ({
  ...DEFAULT_CONFIG, maxTicks: 1800, eagle: { afterTicks, warningTicks },
});
function clearWorld(sim: GameSimulation) {
  for (let row = -2; row <= 30; row++) {
    const terrain = sim.world.row(row);
    terrain.type = "grass"; terrain.blocked = [];
  }
}
function constantGenome(action: Action, source?: Genome) {
  const g = source ? cloneGenome(source) : minimalGenome(0, new RNG(481), new Innovations());
  g.connections = g.connections.filter((c) => c.from === BIAS)
    .map((c) => ({ ...c, enabled: true, weight: +(c.to === OUTPUT_START + ACTIONS.indexOf(action)) }));
  return g;
}
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("new game preset opts into the eagle while historical defaults remain eagle-free", () => {
  assert.equal(DEFAULT_CONFIG.eagle, undefined);
  assert.deepEqual(CURRENT_CONFIG.eagle, { afterTicks: 600, warningTicks: 180 });
  assert.deepEqual(DEFAULT_TRAINING.simulation.eagle, CURRENT_CONFIG.eagle);
  const historical = new GameSimulation();
  const current = new GameSimulation(CURRENT_CONFIG);
  assert.equal(historical.eagleState, undefined);
  assert.equal("lastProgressTick" in historical.agent, false);
  assert.equal(current.agent.lastProgressTick, 0);
  for (let i = 0; i < 50; i++) { historical.step("WAIT", false); current.step("WAIT", false); }
  assert.equal(historical.tick, 600);
  assert.equal(historical.agent.alive, true);
  assert.equal(current.tick, 600);
  assert.equal(current.agent.deathReason, "eagle");
});

test("only a completed surviving new best row resets the eagle timer", () => {
  const sim = new GameSimulation(rules(96, 24));
  clearWorld(sim);
  sim.step("UP", false);
  assert.equal(sim.agent.maxRow, 1);
  assert.equal(sim.agent.lastProgressTick, 12);
  for (const action of ["LEFT", "RIGHT", "DOWN", "UP", "WAIT"] as const) {
    sim.step(action, false);
    assert.equal(sim.agent.lastProgressTick, 12, action);
  }
  assert.equal(sim.agent.maxRow, 1);
  assert.equal(sim.agent.row, 1);
  assert.equal(sim.eagleState!.idleTicks, 60);
  sim.step("UP", false);
  assert.equal(sim.agent.maxRow, 2);
  assert.equal(sim.agent.lastProgressTick, 84);
  assert.equal(sim.eagleState!.idleTicks, 0);
  assert.equal(sim.eagleState!.remainingTicks, 96);
});

test("blocked forward attempts consume time without resetting progress", () => {
  const sim = new GameSimulation(rules(36, 12));
  clearWorld(sim);
  sim.world.row(1).blocked = [0];
  for (let i = 0; i < 3; i++) {
    const result = sim.step("UP", false);
    assert.equal(result.blocked, true);
    assert.equal(sim.agent.lastProgressTick, 0);
    assert.equal(sim.agent.maxRow, 0);
  }
  assert.equal(sim.tick, 36);
  assert.equal(sim.agent.row, 0);
  assert.equal(sim.agent.deathReason, "eagle");
});

test("warning begins at the configured boundary and reset clears timer state", () => {
  const sim = new GameSimulation(CURRENT_CONFIG);
  for (let i = 0; i < 34; i++) sim.step("WAIT", false);
  assert.equal(sim.tick, 408);
  assert.equal(sim.eagleState!.warning, false);
  sim.step("WAIT", false);
  assert.deepEqual(sim.eagleState, { idleTicks: 420, remainingTicks: 180, warning: true, captured: false });
  sim.reset(314);
  assert.equal(sim.tick, 0);
  assert.equal(sim.agent.lastProgressTick, 0);
  assert.deepEqual(sim.eagleState, { idleTicks: 0, remainingTicks: 600, warning: false, captured: false });
});

test("caller rules and renderer snapshots cannot mutate the live eagle deadline", () => {
  const config = rules(17, 5), sim = new GameSimulation(config);
  config.eagle!.afterTicks = 600;
  const snapshot = sim.getState();
  snapshot.config.eagle!.afterTicks = 1200;
  snapshot.config.eagle!.warningTicks = 180;
  assert.deepEqual(sim.config.eagle, { afterTicks: 17, warningTicks: 5 });
  sim.step("WAIT", false); sim.step("WAIT", false);
  assert.equal(sim.tick, 17);
  assert.equal(sim.agent.deathReason, "eagle");
});

test("exact eagle deadline stops a partial hop in both clear-hop and physics-loop paths", () => {
  for (const fallback of [false, true]) {
    const sim = new GameSimulation(rules(17, 5));
    clearWorld(sim);
    if (fallback) {
      const row = sim.world.row(0);
      row.type = "rail"; row.speed = 1; row.phase = 0; row.period = 1000; row.length = 1;
    }
    const first = sim.step("WAIT", false);
    const final = sim.step("RIGHT", false);
    assert.equal(sim.tick, 17);
    close(sim.agent.x, 5 / 12);
    assert.equal(sim.agent.maxRow, 0);
    assert.equal(sim.agent.lastProgressTick, 0);
    assert.equal(final.deathReason, "eagle");
    assert.equal(final.terminated, true);
    assert.equal(final.truncated, false);
    close(final.reward, -2.05);
    close(first.reward + final.reward, fitness(0, 17, "eagle"));
    assert.deepEqual(sim.eagleState, { idleTicks: 17, remainingTicks: 0, warning: true, captured: true });
    const frozen = sim.getState();
    assert.equal(sim.step("UP", false).reward, 0);
    assert.deepEqual(sim.getState(), frozen);
  }
});

test("deadline capture takes priority over progress credit and a simultaneous timeout", () => {
  const sim = new GameSimulation({ ...rules(24, 0), maxTicks: 24 });
  clearWorld(sim);
  sim.step("WAIT", false);
  const final = sim.step("UP", false);
  assert.equal(sim.tick, 24);
  assert.equal(sim.agent.row, 1);
  assert.equal(sim.agent.maxRow, 0);
  assert.equal(sim.agent.lastProgressTick, 0);
  assert.equal(final.deathReason, "eagle");
  close(final.reward, -2.12);
  const earlierTimeout = new GameSimulation({ ...rules(17, 5), maxTicks: 16 });
  clearWorld(earlierTimeout);
  earlierTimeout.step("WAIT", false);
  const timeout = earlierTimeout.step("RIGHT", false);
  assert.equal(earlierTimeout.tick, 16);
  assert.equal(timeout.deathReason, "timeout");
  assert.equal(timeout.truncated, true);
  assert.equal(timeout.terminated, false);
  close(timeout.reward, -.04);
});

test("car and train collisions keep priority over the eagle at the same physics tick", () => {
  for (const kind of ["car", "train"] as const) {
    const sim = new GameSimulation(rules(17, 5));
    clearWorld(sim);
    const row = sim.world.row(0), initialX = .5 + .22 + 1.65;
    row.type = kind === "car" ? "road" : "rail";
    row.speed = -6;
    row.length = 1;
    row.period = 1000;
    row.phase = (80 - initialX) / 6;
    row.vehicles = [{ offset: initialX, length: 1, variant: "car" }];
    sim.step("WAIT", false);
    assert.equal(sim.agent.alive, true);
    const final = sim.step("WAIT", false);
    assert.equal(sim.tick, 17);
    assert.equal(final.deathReason, kind);
    assert.equal(sim.eagleState!.captured, false);
    close(final.reward, -2.05);
    close(fitness(0, sim.tick, final.deathReason), -2.17);
  }
});

test("historical eagle-free games keep frozen states and rewards after the new deadline", () => {
  const sim = new GameSimulation(DEFAULT_CONFIG, 727), reference = new ReferenceSimulation(DEFAULT_CONFIG, 727);
  for (let i = 0; i < 60; i++) {
    assert.deepEqual(sim.step("WAIT", false), reference.step("WAIT", false));
    assert.deepEqual(sim.agent, reference.agent);
  }
  assert.equal(sim.tick, 720);
  assert.equal(sim.agent.alive, true);
  assert.equal("lastProgressTick" in sim.agent, false);
  const rng = new RNG(329);
  for (let i = 0; i < 50; i++) {
    const action = rng.pick(ACTIONS);
    assert.deepEqual(sim.step(action, false), reference.step(action, false));
    assert.deepEqual(sim.getState(), reference.getState());
  }
});

test("runtime and checkpoint validation reject the same malformed eagle rules", () => {
  const checkpoint = new Trainer({ population: 50 }).checkpoint();
  for (const rule of [null, false, {}, { afterTicks: 11, warningTicks: 0 },
    { afterTicks: 36001, warningTicks: 0 }, { afterTicks: 17.5, warningTicks: 0 },
    { afterTicks: 17, warningTicks: -1 }, { afterTicks: 17, warningTicks: 17 },
    { afterTicks: 17, warningTicks: 1.5 }, { afterTicks: Infinity, warningTicks: 0 }]) {
    const eagle = rule as unknown as Config["eagle"];
    assert.throws(() => new GameSimulation({ eagle }), /eagle/);
    const c = structuredClone(checkpoint); c.config.simulation.eagle = eagle;
    assert.throws(() => parseCheckpoint(stringifyEvolution(c)), /configuration/);
  }
  for (const eagle of [{ afterTicks: 12, warningTicks: 0 }, { afterTicks: 36000, warningTicks: 35999 }]) {
    assert.doesNotThrow(() => new GameSimulation({ eagle }));
    const c = structuredClone(checkpoint); c.config.simulation.eagle = eagle;
    assert.doesNotThrow(() => parseCheckpoint(stringifyEvolution(c)));
  }
});

test("eagle episodes, sparse evaluation, replay animation and deterministic seeks agree", () => {
  const genome = constantGenome("RIGHT"), config = rules(17, 5), seed = 981;
  const network = new Network(genome), trace: Trace[] = [];
  const expected = episode((o) => network.decide(o), seed, config, trace, network);
  assert.equal(expected.deathReason, "eagle");
  assert.equal(expected.ticks, 17);
  assert.equal(expected.fitness, -2.17);
  assert.deepEqual(evaluateGenome(genome, [seed], config), [expected]);
  assert.deepEqual(trace.map((r) => r.tick), [0, 12]);
  const replay = new Replay([genome], seed, config);
  replay.advance(); replay.advance();
  assert.equal(replay.current.sim.tick, expected.ticks);
  assert.equal(replay.current.sim.agent.deathReason, "eagle");
  assert.equal(replay.snapshot(.2).agents[0].alive, true);
  assert.equal(replay.snapshot(.5).agents[0].alive, false);
  const captured = replay.current.sim.getState();
  replay.seek(1);
  assert.equal(replay.current.sim.agent.alive, true);
  assert.equal(replay.current.sim.agent.lastProgressTick, 0);
  assert.deepEqual(replay.current.sim.eagleState, { idleTicks: 12, remainingTicks: 5, warning: true, captured: false });
  replay.seek(2);
  assert.deepEqual(replay.current.sim.getState(), captured);
});

test("eagle training checkpoints preserve their rules and exact subsequent generations", () => {
  const trainer = new Trainer({ population: 50, seed: 81, trainingSeeds: 2,
    simulation: { ...rules(17, 5), maxTicks: 96 } });
  const waiting = constantGenome("WAIT", trainer.neat.population[0]);
  trainer.neat.population = Array.from({ length: 50 }, (_, id) => ({ ...cloneGenome(waiting), id }));
  const first = trainer.runGeneration();
  assert.ok(first.training.every((r) => r.deathReason === "eagle" && r.ticks === 17));
  assert.ok(first.evaluation.every((r) => r.deathReason === "eagle" && r.ticks === 17));
  const checkpoint = parseCheckpoint(stringifyEvolution(trainer.checkpoint()));
  assert.deepEqual(checkpoint.config.simulation.eagle, { afterTicks: 17, warningTicks: 5 });
  const restored = Trainer.restore(checkpoint);
  for (let generation = 0; generation < 3; generation++) {
    assert.deepEqual(restored.runGeneration(), trainer.runGeneration());
    assert.deepEqual(restored.checkpoint(), trainer.checkpoint());
  }
  const legacy = new Trainer({ population: 50, simulation: { ...DEFAULT_CONFIG, maxTicks: 24 } });
  const restoredLegacy = Trainer.restore(parseCheckpoint(stringifyEvolution(legacy.checkpoint())));
  assert.equal(restoredLegacy.config.simulation.eagle, undefined);
  assert.deepEqual(restoredLegacy.runGeneration(), legacy.runGeneration());
});
