import { test } from "node:test";
import assert from "node:assert/strict";
import { RNG } from "../core/rng";
import { GameSimulation } from "../core/simulation";
import { INPUT_COUNT } from "../core/observation";
import { ACTIONS, DEFAULT_CONFIG } from "../core/types";
import {
  Innovations,
  minimalGenome,
  addNode,
  addConnection,
  crossover,
  distance,
} from "../evolution/genome";
import { Network } from "../evolution/network";
import { NEAT } from "../evolution/neat";
import { Trainer } from "../evolution/trainer";
import { parseCheckpoint } from "../evolution/checkpoint";
import {
  evaluateGenome,
  episode,
  HELD_OUT_SEEDS,
} from "../evolution/evaluation";
import { alwaysUp, randomPolicy, heuristic } from "../evolution/baselines";
import { Replay } from "../evolution/replay";
import { stringifyEvolution } from "../evolution/serialization";
import {
  VALIDATION_SEEDS,
  FINAL_TEST_SEEDS,
  CONTINUATION_TEST_SEEDS,
} from "../evolution/suites";

test("five finite action scores; exact forward inference", () => {
  const g = minimalGenome(0, new RNG(1), new Innovations()),
    n = new Network(g);
  g.connections = [];
  const s = new GameSimulation();
  assert.ok(ACTIONS.includes(n.decide(s.getObservation())));
  assert.equal(n.scores.length, 5);
  assert.ok([...n.scores].every(Number.isFinite));
  assert.equal(s.getObservation().length, INPUT_COUNT);
});
test("innovation alignment, node splitting, acyclic connections and crossover inheritance", () => {
  const t = new Innovations(),
    rng = new RNG(17),
    a = minimalGenome(0, rng, t),
    b = structuredClone(a);
  addNode(a, new RNG(9), t);
  addNode(b, new RNG(9), t);
  assert.equal(a.nodes.at(-1)?.id, b.nodes.at(-1)?.id);
  assert.ok(a.nodes.some((n) => n.kind === "hidden"));
  assert.ok(a.connections.some((c) => !c.enabled));
  for (let i = 0; i < 20; i++) addConnection(a, rng, t);
  a.fitness = 10;
  b.fitness = 0;
  const c = crossover(a, b, 10, rng);
  assert.equal(c.connections.length, a.connections.length);
  assert.ok(distance(a, b) > 0);
  for (const edge of c.connections)
    assert.ok(
      c.nodes.find((n) => n.id === edge.from)!.depth <
        c.nodes.find((n) => n.id === edge.to)!.depth,
    );
});
test("speciation, elitism and breeding create actual distinct topologies", () => {
  const n = new NEAT(50, 9);
  for (const g of n.population) g.fitness = g.id;
  n.classify();
  assert.ok(n.species.length > 1);
  const best = n.population.at(-1)!;
  n.breed();
  assert.equal(n.population.length, 50);
  assert.ok(
    n.population.some(
      (g) => JSON.stringify(g.connections) === JSON.stringify(best.connections),
    ),
  );
  assert.ok(n.population.some((g) => g.nodes.some((n) => n.kind === "hidden")));
});
test("baseline episodes terminate and map suite is not used as selection seeds", () => {
  for (const p of [alwaysUp, heuristic, randomPolicy(12)])
    assert.ok(episode(p, 7, { maxTicks: 120 }).ticks <= 120);
  const t = new Trainer({
    population: 50,
    simulation: { ...DEFAULT_CONFIG, maxTicks: 120 },
  });
  const r = t.runGeneration();
  assert.ok(r.seeds.every((s) => !HELD_OUT_SEEDS.includes(s)));
  assert.equal(r.evaluation.length, 16);
});
test("checkpoint restores RNG, innovations, population and next generation exactly", () => {
  const t = new Trainer({
    population: 50,
    simulation: { ...DEFAULT_CONFIG, maxTicks: 120 },
  });
  t.runGeneration();
  const c = parseCheckpoint(JSON.stringify(t.checkpoint())),
    restored = Trainer.restore(c);
  assert.deepEqual(t.runGeneration(), restored.runGeneration());
  assert.deepEqual(t.neat.save(), restored.neat.save());
  assert.throws(() => parseCheckpoint('{"version":4}'));
  const corrupt = structuredClone(c);
  corrupt.neat.population[0].connections[0].weight = NaN;
  assert.throws(() => parseCheckpoint(JSON.stringify(corrupt)));
  const emptyCohort = structuredClone(c);
  emptyCohort.history[0].contenders = [];
  assert.throws(() => parseCheckpoint(JSON.stringify(emptyCohort)));
});
test("evaluation order independent and saved champion exactly replays", () => {
  const g = minimalGenome(0, new RNG(33), new Innovations()),
    a = evaluateGenome(g, [9, 5, 1], { maxTicks: 240 }),
    b = evaluateGenome(g, [1, 9, 5], { maxTicks: 240 });
  assert.deepEqual(a, [b[1], b[2], b[0]]);
  const replay = new Replay([g], 9, { ...DEFAULT_CONFIG, maxTicks: 240 });
  while (!replay.finished) replay.advance();
  assert.equal(replay.current.sim.agent.maxRow, a[0].score);
  assert.equal(replay.current.sim.tick, a[0].ticks);
  const snapshot = replay.current.sim.getState(),
    decisions = replay.decisions;
  replay.seek(decisions);
  assert.deepEqual(replay.current.sim.getState(), snapshot);
});

test("pausing between evaluation batches preserves exact generation outcome", () => {
  const config = {
      population: 50,
      simulation: { ...DEFAULT_CONFIG, maxTicks: 120 },
    },
    a = new Trainer(config),
    b = new Trainer(config);
  a.batch(7);
  a.batch(3);
  assert.throws(() => a.checkpoint());
  let out;
  do {
    out = a.batch(4);
  } while (!out.record);
  assert.deepEqual(out.record, b.runGeneration());
  assert.deepEqual(a.checkpoint(), b.checkpoint());
});

test("manual curriculum transition preserves the evolved population at a generation boundary", () => {
  const t = new Trainer({
    population: 50,
    simulation: { ...DEFAULT_CONFIG, maxTicks: 120 },
  });
  t.runGeneration();
  const c = t.checkpoint();
  c.config.simulation.curriculum = "trains";
  const resumed = Trainer.restore(c);
  assert.deepEqual(resumed.neat.save(), c.neat);
  assert.equal(resumed.generation, 1);
  const next = resumed.runGeneration();
  assert.equal(next.generation, 2);
  assert.equal(next.curriculum, "trains");
  assert.equal(resumed.history[0].curriculum, "roads");
});

test("full 200-chicken generations remain archived before breeding and replay their actual outcomes", () => {
  const t = new Trainer({
    population: 200,
    simulation: { ...DEFAULT_CONFIG, maxTicks: 120 },
  });
  const first = t.runGeneration();
  const archived = structuredClone(first.contenders);
  t.runGeneration();
  assert.equal(t.history.length, 2);
  assert.equal(first.contenders.length, 200);
  assert.equal(t.history[1].contenders.length, 200);
  assert.equal(new Set(first.contenders.map((g) => g.id)).size, 200);
  assert.deepEqual(first.contenders, archived);
  assert.ok(first.contenders.every((g) => g.id < 200));
  const replay = new Replay(
    first.contenders,
    first.seeds[0],
    t.config.simulation,
  );
  while (!replay.finished) replay.advance();
  for (const a of replay.agents) {
    const [result] = evaluateGenome(
      a.genome,
      [first.seeds[0]],
      t.config.simulation,
    );
    assert.equal(a.sim.agent.maxRow, result.score);
    assert.equal(a.sim.tick, result.ticks);
  }
  const outcomes = replay.agents.map((a) => a.sim.getState());
  replay.seek(replay.decisions);
  assert.deepEqual(
    replay.agents.map((a) => a.sim.getState()),
    outcomes,
  );
});

test("compact archives retain all genomes, weights, hidden nodes and exact continuation; legacy JSON still imports", () => {
  const t = new Trainer({
    population: 50,
    simulation: { ...DEFAULT_CONFIG, maxTicks: 120 },
  });
  t.runGeneration();
  t.runGeneration();
  const checkpoint = t.checkpoint();
  const encoded = stringifyEvolution(checkpoint);
  assert.ok(encoded.length < JSON.stringify(checkpoint).length / 2);
  const restored = parseCheckpoint(encoded);
  assert.deepEqual(restored, checkpoint);
  assert.deepEqual(parseCheckpoint(JSON.stringify(checkpoint)), checkpoint);
  assert.deepEqual(
    Trainer.restore(restored).runGeneration(),
    t.runGeneration(),
  );
  assert.throws(() =>
    parseCheckpoint(encoded.replace("implicit-base-v1", "unknown")),
  );
});

test("robust training preserves sensor versions, adaptive species state and exact checkpoint continuation", () => {
  const t = new Trainer({
    population: 50,
    trainingSeeds: 3,
    profile: "robust-v2",
    observationVersion: 2,
    simulation: { ...DEFAULT_CONFIG, maxTicks: 240 },
  });
  t.runGeneration();
  const record = t.runGeneration();
  assert.ok(t.neat.population.every((g) => g.observationVersion === 2));
  assert.ok(t.neat.save().tuning);
  const checkpoint = parseCheckpoint(stringifyEvolution(t.checkpoint()));
  const restored = Trainer.restore(checkpoint);
  assert.deepEqual(t.runGeneration(), restored.runGeneration());
  assert.deepEqual(t.neat.save(), restored.neat.save());
  const replay = new Replay(
    [record.champion],
    record.seeds[0],
    t.config.simulation,
  );
  while (!replay.finished) replay.advance();
  assert.equal(replay.current.sim.agent.maxRow, record.training[0].score);
  assert.equal(replay.current.sim.tick, record.training[0].ticks);
});

test("legacy sensor/training checkpoints retain the original generation-one behavior", () => {
  const t = new Trainer({ population: 100, trainingSeeds: 3 });
  const r = t.runGeneration();
  assert.equal(r.champion.id, 84);
  assert.equal(r.bestFitness, 76.81);
  assert.equal(r.training[0].score, 17);
  assert.equal(r.training[0].ticks, 263);
  assert.equal(r.champion.observationVersion, undefined);
});

test("training, validation, historical monitor and both final test seed spaces are disjoint", () => {
  const suites = [VALIDATION_SEEDS, FINAL_TEST_SEEDS, CONTINUATION_TEST_SEEDS, HELD_OUT_SEEDS];
  const all = suites.flat();
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.every((seed) => seed > 0x3fffffff));
  assert.equal(FINAL_TEST_SEEDS.length, 512);
  assert.equal(CONTINUATION_TEST_SEEDS.length, 512);
});
