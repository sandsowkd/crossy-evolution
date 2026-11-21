import assert from "node:assert/strict";
import { test } from "node:test";
import { hash } from "../core/rng";
import { NEAT } from "../evolution/neat";
import { Trainer } from "../evolution/trainer";
import { cloneGenome, type EvolutionParameters } from "../evolution/genome";
import { parseCheckpoint } from "../evolution/checkpoint";
import { stringifyEvolution } from "../evolution/serialization";
import { mean } from "../evolution/evaluation";
import { NEAT as ReferenceNEAT } from "./fixtures/reference-neat";
import { experimentalBreed, type Profile } from "./fixtures/reference-experimental-operators";

const profiles = [
  { name: "precise", fraction: .12, sigma: .045, reset: 0, node: .01, edge: .04, crossover: .25, parentFraction: .25, risk: .5 },
  { name: "balanced", fraction: .2, sigma: .09, reset: .0025, node: .03, edge: .15, crossover: .5, parentFraction: .3, risk: .5 },
  { name: "diverse", fraction: .25, sigma: .18, reset: .015, node: .08, edge: .3, crossover: .75, parentFraction: .4, risk: .5 },
  { name: "risk", fraction: .15, sigma: .065, reset: .001, node: .02, edge: .1, crossover: .4, parentFraction: .25, risk: .8 },
];
const parameters = (p: Profile): EvolutionParameters => ({
  weightMutationRate: p.fraction, weightMutationSigma: p.sigma, weightResetRate: p.reset,
  addNodeRate: p.node, addConnectionRate: p.edge, toggleConnectionRate: .005,
  crossoverRate: p.crossover, parentFraction: p.parentFraction,
  retainStaleSpeciesProgress: true,
});
function assignFitness(n: NEAT | ReferenceNEAT, generation: number) {
  for (const g of n.population)
    g.fitness = Math.sin(g.id * .37 + generation) * 40 +
      g.connections.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0);
}
function warmPopulation(n: NEAT | ReferenceNEAT) {
  const ancestor = structuredClone(n.population[0]);
  n.population = Array.from({ length: n.size }, (_, id) => {
    const g = structuredClone(ancestor); g.id = id;
    for (const c of g.connections) c.weight += Math.floor(id / 10) * .7;
    return g;
  });
}

test("omitted parameters preserve frozen legacy and robust NEAT RNG/population trajectories", () => {
  for (const robust of [false, true]) {
    const actual = new NEAT(50, 43298, robust), reference = new ReferenceNEAT(50, 43298, robust);
    assert.deepEqual(actual.save(), reference.save());
    warmPopulation(actual); warmPopulation(reference);
    for (let generation = 0; generation < 12; generation++) {
      assignFitness(actual, generation); assignFitness(reference, generation);
      actual.classify(); reference.classify();
      if (generation === 0) assert.ok(actual.species.length < actual.size / 2, "most offspring must mutate or cross over");
      actual.breed(); reference.breed();
      assert.deepEqual(actual.save(), reference.save(), `robust=${robust}, generation=${generation}`);
    }
  }
});

test("serialized profile operators reproduce the frozen parameter experiment including stale species state", () => {
  for (const profile of profiles) {
    const actual = new NEAT(50, 92165, true, 3, parameters(profile));
    actual.threshold = .5;
    warmPopulation(actual);
    const reference = NEAT.load(actual.save());
    for (let generation = 0; generation < 10; generation++) {
      assignFitness(actual, generation); assignFitness(reference, generation);
      actual.classify(); reference.classify();
      if (generation === 3) {
        actual.generation = 40; reference.generation = 40;
        for (const s of actual.species) {
          actual.progress.set(s.id, { best: 1e9, improved: 0 });
          reference.progress.set(s.id, { best: 1e9, improved: 0 });
        }
      }
      // Exercise the custom profile's intentionally retained inactive bookkeeping.
      actual.progress.set(99999, { best: -1, improved: 0 });
      reference.progress.set(99999, { best: -1, improved: 0 });
      actual.breed(); experimentalBreed(reference, profile);
      assert.deepEqual(actual.save(), reference.save(), `${profile.name}, generation=${generation}`);
    }
    assert.ok(actual.population.some((g) => g.connections.some((c) => c.weight !== actual.population[0].connections.find((other) => other.innovation === c.innovation)?.weight)));
  }
});

test("custom training seed schedule, risk objective, monitor maps and operators survive native checkpoint continuation exactly", () => {
  for (const profile of profiles) {
    const monitorSeeds = Array.from({ length: 16 }, (_, i) => (0xa1000000 + i * 65537) >>> 0);
    const trainer = new Trainer({ population: 50, seed: 712049, trainingSeeds: 4,
      simulation: { curriculum: "roads", maxTicks: 240, difficulty: 1 },
      profile: "robust-v2", observationVersion: 3,
      evolutionParameters: parameters(profile), fitnessRiskWeight: profile.risk,
      trainingSeedStride: 31, trainingSeedStream: 573, monitorSeeds });
    trainer.runGeneration();
    const record = trainer.runGeneration();
    assert.deepEqual(record.seeds, Array.from({ length: 4 }, (_, i) => hash(712049, 31 + i, 573) & 0x3fffffff));
    assert.deepEqual(record.evaluation.map((r) => r.seed), monitorSeeds);
    const scores = record.training.map((e) => e.fitness).sort((a, b) => a - b);
    assert.equal(record.champion.fitness,
      (1 - profile.risk) * mean(scores) + profile.risk * mean(scores.slice(0, 2)));
    const checkpoint = parseCheckpoint(stringifyEvolution(trainer.checkpoint()));
    const resumed = Trainer.restore(checkpoint);
    for (let generation = 0; generation < 3; generation++) {
      assert.deepEqual(resumed.runGeneration(), trainer.runGeneration());
      assert.deepEqual(resumed.checkpoint(), trainer.checkpoint());
    }
    assert.deepEqual(resumed.config.evolutionParameters, parameters(profile));
  }
});

test("checkpoint import rejects malformed or inconsistent explicit training parameters", () => {
  const trainer = new Trainer({ population: 50, profile: "robust-v2", evolutionParameters: parameters(profiles[0]) });
  const valid = trainer.checkpoint();
  assert.doesNotThrow(() => parseCheckpoint(stringifyEvolution(valid)));
  const reject = (edit: (c: typeof valid) => void) => {
    const c = structuredClone(valid); edit(c);
    assert.throws(() => parseCheckpoint(stringifyEvolution(c)), /parameters/);
  };
  reject((c) => { c.neat.parameters!.weightMutationRate = 1.1; });
  reject((c) => { c.neat.parameters!.weightMutationSigma = NaN; });
  reject((c) => { c.neat.parameters!.crossoverRate = .8; });
  reject((c) => { delete c.neat.parameters; });
  reject((c) => { c.config.fitnessRiskWeight = -.1; });
  reject((c) => { c.config.trainingSeedStride = 0; });
  reject((c) => { c.config.trainingSeedStream = 0x100000000; });
  reject((c) => { c.config.monitorSeeds = []; });
  reject((c) => { c.config.monitorSeeds = [-1]; });
  reject((c) => { c.config.evolutionParameters!.speciesThresholdFloor = 0; c.neat.parameters!.speciesThresholdFloor = 0; });
  reject((c) => { c.config.evolutionParameters!.speciesThresholdStep = Infinity; c.neat.parameters!.speciesThresholdStep = Infinity; });
  reject((c) => { c.config.evolutionParameters!.speciesThresholdFloor = .01; });
  reject((c) => { c.config.evolutionParameters!.speciesThresholdStep = .0025; });
});

test("optional low thresholds split nearby warm genomes and survive exact native continuation", () => {
  const tuning: EvolutionParameters = { ...parameters(profiles[1]), speciesThresholdFloor: .01, speciesThresholdStep: .0025 };
  const trainer = new Trainer({ population: 50, seed: 194438, trainingSeeds: 2,
    profile: "robust-v2", evolutionParameters: tuning, observationVersion: 5,
    simulation: { curriculum: "roads", maxTicks: 120, difficulty: 1 } });
  const ancestor = cloneGenome(trainer.neat.population[0]);
  trainer.neat.population = Array.from({length:50}, (_, id) => {
    const g = cloneGenome(ancestor); g.id = id;
    for (const c of g.connections) c.weight += Math.floor(id / 5) * .09;
    return g;
  });
  trainer.neat.threshold = .04;
  const control = NEAT.load(trainer.neat.save());
  control.threshold = .5;
  control.classify();
  trainer.neat.classify();
  assert.equal(control.species.length, 1);
  assert.equal(trainer.neat.species.length, 10);
  assert.equal(trainer.neat.threshold, .04, "target eight to twelve species holds the threshold");
  const single = NEAT.load(trainer.neat.save());
  single.population = single.population.map((g) => ({ ...cloneGenome(ancestor), id:g.id }));
  single.classify();
  assert.equal(single.threshold, .04 - .0025);
  for (let i = 0; i < 30; i++) single.classify();
  assert.equal(single.threshold, .01);
  trainer.neat.species = [];
  trainer.runGeneration();
  const checkpoint = parseCheckpoint(stringifyEvolution(trainer.checkpoint()));
  assert.equal(checkpoint.neat.parameters!.speciesThresholdFloor, .01);
  const restored = Trainer.restore(checkpoint);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(restored.runGeneration(), trainer.runGeneration());
    assert.deepEqual(restored.checkpoint(), trainer.checkpoint());
  }
  const invalid = structuredClone(checkpoint);
  delete invalid.config.evolutionParameters!.speciesThresholdFloor;
  delete invalid.neat.parameters!.speciesThresholdFloor;
  invalid.neat.tuning!.threshold = .04;
  assert.throws(() => parseCheckpoint(stringifyEvolution(invalid)), /adaptive species/);
});

test("checkpoint archive references accept one safe run namespace and legacy root paths", () => {
  const trainer = new Trainer({ population: 50, trainingSeeds: 1,
    simulation: { curriculum: "roads", maxTicks: 12, difficulty: 1 } });
  trainer.runGeneration();
  const checkpoint = trainer.checkpoint();
  for (const path of [
    "/training-cohorts/00001.json.gz", "/training-cohorts/a/00001.json.gz",
    "/training-cohorts/warm-v3-run-100/00001.json.gz",
    `/training-cohorts/${"a".repeat(64)}/00001.json.gz`,
  ]) {
    checkpoint.history[0].cohortFile = path;
    assert.doesNotThrow(() => parseCheckpoint(stringifyEvolution(checkpoint)));
  }
  for (const path of [
    "/training-cohorts/../00001.json.gz", "/training-cohorts/a/b/00001.json.gz",
    "/training-cohorts/A/00001.json.gz", "/training-cohorts/-a/00001.json.gz",
    "/training-cohorts/a-/00001.json.gz", "/training-cohorts/a_b/00001.json.gz",
    `/training-cohorts/${"a".repeat(65)}/00001.json.gz`,
  ]) {
    checkpoint.history[0].cohortFile = path;
    assert.throws(() => parseCheckpoint(stringifyEvolution(checkpoint)), /history/);
  }
});

test("checkpoint imports accept long resumed exports above the former limit and remain bounded", () => {
  const original = new Trainer({population:50,trainingSeeds:1,
    simulation:{curriculum:"roads",maxTicks:12,difficulty:1}});
  const encoded = stringifyEvolution(original.checkpoint());
  const restored = Trainer.restore(parseCheckpoint(encoded + " ".repeat(45_000_000)));
  assert.deepEqual(restored.runGeneration(),original.runGeneration());
  assert.throws(() => parseCheckpoint(" ".repeat(128_000_001)), /exceeds 128 MB limit/);
});
