import test from "node:test";
import assert from "node:assert/strict";
import { Trainer } from "../evolution/trainer";
import { eagleTransfer } from "../evolution/rules";
import { parseCheckpoint } from "../evolution/checkpoint";
import { stringifyEvolution } from "../evolution/serialization";

test("an eagle transfer is a valid new branch with the exact inherited native population", () => {
  const trainer = new Trainer({ population: 50, trainingSeeds: 1, profile: "robust-v2", observationVersion: 8,
    simulation: { curriculum: "roads", maxTicks: 60, difficulty: 1 } });
  trainer.runGeneration();
  trainer.runGeneration();
  const historical = trainer.checkpoint(), before = structuredClone(historical);
  assert.equal(historical.neat.tuning?.generation, 2);
  const branch = parseCheckpoint(stringifyEvolution(eagleTransfer(historical)));
  assert.deepEqual(historical, before);
  assert.deepEqual(branch.neat.population, historical.neat.population);
  assert.deepEqual(branch.neat.tracker, historical.neat.tracker);
  assert.equal(branch.neat.rng, historical.neat.rng);
  assert.equal(branch.config.observationVersion, 8);
  assert.equal(branch.generation, 0);
  assert.equal(branch.history.length, 0);
  assert.deepEqual(branch.config.simulation.eagle, { afterTicks: 600, warningTicks: 180 });
  const restored = Trainer.restore(branch);
  assert.equal(restored.runGeneration().generation, 1);
  const saved = parseCheckpoint(stringifyEvolution(restored.checkpoint()));
  assert.equal(saved.neat.tuning?.generation, 1);
  assert.deepEqual(saved.config.simulation.eagle, branch.config.simulation.eagle);
});
