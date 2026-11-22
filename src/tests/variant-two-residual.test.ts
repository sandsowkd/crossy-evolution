import test from "node:test";
import assert from "node:assert/strict";
import { RNG } from "../core/rng";
import { GameSimulation } from "../core/simulation";
import { VARIANT_TWO_CONFIG } from "../core/upstream";
import { VARIANT_TWO_INPUT_START } from "../core/sensor-version";
import { Innovations, minimalGenome } from "../evolution/genome";
import { Network } from "../evolution/network";
import { validGenome } from "../evolution/checkpoint";
import { connectRiverInputs, mutateRiverInputs } from "../evolution/variant-two-residual";

test("river topology adds zero-effect connections and residual mutations preserve road weights", () => {
  const rng = new RNG(71), tracker = new Innovations(), genome = minimalGenome(0, rng, tracker, true, 9);
  const original = structuredClone(genome), before = new Network(original);
  connectRiverInputs(genome, tracker); connectRiverInputs(genome, tracker);
  assert.ok(validGenome(genome));
  const after = new Network(genome), simulation = new GameSimulation(VARIANT_TWO_CONFIG, 42);
  for (const row of [0, 27, 46, 88]) {
    simulation.agent.row = row;
    const observation = simulation.getObservation(9);
    assert.deepEqual(after.activate(observation), before.activate(observation));
  }
  const legacy = structuredClone(genome.connections.filter(c => c.from < VARIANT_TWO_INPUT_START));
  const copy = structuredClone(genome);
  mutateRiverInputs(genome, new RNG(9), 1); mutateRiverInputs(copy, new RNG(9), 1);
  assert.deepEqual(genome, copy);
  assert.deepEqual(genome.connections.filter(c => c.from < VARIANT_TWO_INPUT_START), legacy);
  assert.ok(validGenome(genome));
  assert.ok(genome.connections.some(c => c.from >= VARIANT_TWO_INPUT_START && c.weight !== 0));
});
