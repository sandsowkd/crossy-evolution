import assert from "node:assert/strict";
import { test } from "node:test";
import { observation, INPUT_COUNT } from "../core/observation";
import { RNG } from "../core/rng";
import { GameSimulation } from "../core/simulation";
import { type Row } from "../core/types";
import { observation as referenceObservation } from "./fixtures/reference-observation";

test("trajectory pruning preserves frozen dense and sparse sensors across random states, wraps, extreme speeds and grazing", () => {
  const rng = new RNG(61871);
  const masks = [
    new Uint8Array(INPUT_COUNT).fill(1),
    Uint8Array.from({ length: INPUT_COUNT }, () => +(rng.next() < .17)),
    new Uint8Array(INPUT_COUNT),
  ];
  const compare = (sim: GameSimulation, version: 1 | 2 | 3 | 4) => {
    const args = [sim.world, sim.agent, sim.tick, version] as const;
    assert.deepEqual(observation(...args), referenceObservation(...args));
    for (const mask of masks)
      assert.deepEqual(observation(...args, mask), referenceObservation(...args, mask));
  };
  for (let i = 0; i < 1200; i++) {
    const sim = new GameSimulation({
      curriculum: i % 2 ? "roads" : "trains",
      difficulty: .1 + rng.next() * 2.9,
      maxTicks: 36000,
    }, rng.int(0xffffffff));
    sim.agent.x = i % 3 === 0 ? rng.pick([-4, 4]) : rng.range(-4, 4);
    sim.agent.row = i % 5 === 0 ? 0 : rng.range(0, 1800);
    sim.tick = rng.int(36000);
    const cy = Math.round(sim.agent.row);
    if (i % 3 === 0) {
      for (const dy of [-1, 0, 1]) {
        const row = sim.world.row(cy + dy);
        const override: Partial<Row> = i % 6 === 0
          ? { type: "road", blocked: [], speed: rng.pick([-600, -20, -1e-12, 0, 1e-12, 20, 600]),
            vehicles: [{ offset: rng.pick([-11.05, -10.95, -1e-12, 0, 1e-12, 10.95, 11.05]),
              length: rng.pick([.01, 1.05, 1.85, 7, 20]), variant: "car" }] }
          : { type: "rail", blocked: [], speed: rng.pick([-600, -20, 20, 600]),
            phase: rng.pick([0, .2 - 1e-12, .2, .2 + 1e-12]), period: .2,
            length: rng.pick([.01, 1.05, 7, 20]) };
        Object.assign(row, override);
      }
    }
    for (const version of [1, 2, 3, 4] as const) compare(sim, version);
  }
  for (const epsilon of [0, -Number.EPSILON, Number.EPSILON, -1e-12, 1e-12, -1e-8, 1e-8])
    for (const side of [-1, 1])
      for (const rowOffset of [-1, 0, 1]) {
        const sim = new GameSimulation();
        sim.agent.row = 5;
        sim.agent.maxRow = 5;
        for (const dy of [-1, 0, 1]) {
          const row = sim.world.row(5 + dy);
          row.type = "grass"; row.blocked = [];
        }
        const row = sim.world.row(5 + rowOffset);
        row.type = "road"; row.speed = 0;
        row.vehicles = [{ offset: side * (.525 + .22 + .35 + epsilon), length: 1.05, variant: "car" }];
        compare(sim, 3); compare(sim, 4);
      }
});
