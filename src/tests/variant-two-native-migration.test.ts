import test from "node:test";
import assert from "node:assert/strict";
import { observation } from "../core/observation";
import { observation as referenceObservation } from "./fixtures/reference-v9-observation";
import { RNG } from "../core/rng";
import { sensorCount } from "../core/sensor-version";
import { GameSimulation } from "../core/simulation";
import { VARIANT_TWO_CONFIG } from "../core/upstream";
import { ACTIONS } from "../core/types";
import { MAX_CHECKPOINT_CHARACTERS, NATIVE_MAX_CHECKPOINT_CHARACTERS, parseCheckpoint } from "../evolution/checkpoint";
import { Trainer } from "../evolution/trainer";
import { stringifyEvolution } from "../evolution/serialization";

test("native V9 allocation optimization matches the frozen encoder at every requested channel", () => {
  const rng = new RNG(9122001), size = sensorCount(9);
  const masks = [new Uint8Array(size), new Uint8Array(size).fill(1),
    Uint8Array.from({ length: size }, () => +(rng.next() < .16))];
  const out = new Float32Array(size);
  for (let i = 0; i < 1000; i++) {
    const sim = new GameSimulation(VARIANT_TWO_CONFIG, rng.int(0xffffffff));
    sim.tick = rng.int(36000);
    sim.agent.x = i % 4 === 0 ? -.5 : i % 4 === 1 ? 5 : rng.range(-5.1, 5.1);
    sim.agent.row = i % 5 === 0 ? 0 : rng.range(26, 500);
    sim.agent.lastAction = ACTIONS[i % 5];
    sim.agent.ridingSpeed = rng.range(-5, 5);
    sim.agent.lastProgressTick = Math.max(0, sim.tick - rng.int(700));
    for (const mask of masks) {
      out.fill(NaN);
      const expected = referenceObservation(sim.world, sim.agent, sim.tick, 9, mask);
      assert.equal(observation(sim.world, sim.agent, sim.tick, 9, mask, out), out);
      assert.deepEqual(out, expected, `state=${i}`);
      assert.deepEqual(observation(sim.world, sim.agent, sim.tick, 9, mask), expected);
    }
  }
});

test("larger trusted native checkpoint bounds are explicit and ordinary imports keep their bound", () => {
  assert.equal(MAX_CHECKPOINT_CHARACTERS, 128_000_000);
  assert.equal(NATIVE_MAX_CHECKPOINT_CHARACTERS, 256_000_000);
  const trainer = new Trainer({ population: 50, trainingSeeds: 1,
    simulation: { curriculum: "roads", difficulty: 1, maxTicks: 12 } });
  const text = stringifyEvolution(trainer.checkpoint());
  const expected = parseCheckpoint(text);
  assert.deepEqual(parseCheckpoint(text, NATIVE_MAX_CHECKPOINT_CHARACTERS), expected);
  assert.deepEqual(parseCheckpoint(text, text.length), expected);
  assert.throws(() => parseCheckpoint(text, text.length - 1), /Checkpoint exceeds/);
  for (const limit of [NaN, Infinity, 0, -1, 1.5, NATIVE_MAX_CHECKPOINT_CHARACTERS + 1])
    assert.throws(() => parseCheckpoint(text, limit), /Invalid checkpoint size limit/);
});
