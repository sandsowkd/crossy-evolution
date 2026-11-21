import test from "node:test";
import assert from "node:assert/strict";
import { variantSimulation } from "../core/variants";
import { GameSimulation } from "../core/simulation";
import { generateRow } from "../core/world";
import { WIDE_DEVELOPMENT_SEEDS, LONG_FURTHER_TEST_SEEDS, LONG_POST_FURTHER_TEST_SEEDS, VARIANT_ONE_CLOSE_SEEDS } from "../evolution/suites";

test("Variant1 remains roads-only with at most three consecutive roads and no inactivity death", () => {
  const config = variantSimulation(1);
  for (let seed = 0; seed < 20; seed++) {
    let consecutive = 0;
    for (let row = 0; row < 1000; row++) {
      const lane = generateRow(seed, row, config);
      assert.notEqual(lane.type, "rail");
      consecutive = lane.type === "road" ? consecutive + 1 : 0;
      assert.ok(consecutive <= 3);
      if (lane.type === "road") assert.equal(lane.vehicles.length, 3);
    }
  }
  const sim = new GameSimulation(config, 42);
  for (let i = 0; i < 2999; i++) sim.step("WAIT", false);
  assert.equal(sim.agent.alive, true);
  assert.equal(sim.agent.maxRow, 0);
  sim.step("WAIT", false);
  assert.equal(sim.agent.deathReason, "timeout");
  assert.equal(sim.tick, 36000);
});

test("Variant2 maps contain rails; planned variants cannot silently run Variant1", () => {
  const config = variantSimulation(2);
  assert.equal(config.curriculum, "mixed");
  assert.deepEqual(config.eagle, { afterTicks: 600, warningTicks: 180 });
  assert.ok(Array.from({length: 1000}, (_, row) => generateRow(42, row, config)).some(r => r.type === "rail"));
  assert.throws(() => variantSimulation(3), /not implemented/);
  assert.throws(() => variantSimulation(4), /not implemented/);
});

test("Variant1 closing maps are separate from development, historical F9 and gated FA", () => {
  const other = new Set([...WIDE_DEVELOPMENT_SEEDS, ...LONG_FURTHER_TEST_SEEDS, ...LONG_POST_FURTHER_TEST_SEEDS]);
  assert.equal(new Set(VARIANT_ONE_CLOSE_SEEDS).size, 512);
  assert.ok(VARIANT_ONE_CLOSE_SEEDS.every(seed => !other.has(seed)));
});
