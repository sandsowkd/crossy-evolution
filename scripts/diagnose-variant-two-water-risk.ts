import fs from "node:fs";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { GameSimulation } from "../src/core/simulation";
import { VARIANT_TWO_CONFIG } from "../src/core/upstream";
import { GLOBAL_OFFSET } from "../src/core/observation";
import { sensorCount } from "../src/core/sensor-version";
import { ACTIONS } from "../src/core/types";
import { Network } from "../src/evolution/network";
import { fitness } from "../src/evolution/evaluation";
import type { Genome } from "../src/evolution/genome";
import { parseEvolution } from "../src/evolution/serialization";
import { summarizeVariantTwo, writeVariantTwoImmutable } from "../src/evolution/variant-two-experiment";

// Observation-engineering diagnostic, NOT evolution and NOT a publishable model.
// Probes use the current locally visible state and one decision's deterministic physics.
const best = JSON.parse(fs.readFileSync("results/variants/variant-2/best-development.json", "utf8"));
const population = parseEvolution<{ contenders: Genome[] }>(gunzipSync(fs.readFileSync(
  `${best.selectedDirectory}/generations/${String(best.generation).padStart(5, "0")}.json.gz`)).toString()).contenders;
const current = population.find(g => g.id === best.genome); assert.ok(current);
const original = parseEvolution<{ genome: Genome }>(fs.readFileSync("results/variants/variant-1/final/selected.json", "utf8")).genome;
const results = [];
for (const [name, genome] of [["frozen-variant-one", original], ["current-variant-two", current]] as const) {
  for (const enriched of [false, true]) {
    let observedDecisions = 0, probedActions = 0, identifiedFatalWaterActions = 0;
    const network = new Network(genome), buffer = new Float32Array(sensorCount(network.observationVersion));
    const episodes = (best.developmentMaps as number[]).map(seed => {
      const sim = new GameSimulation(VARIANT_TWO_CONFIG, seed), probe = new GameSimulation(VARIANT_TWO_CONFIG, seed);
      probe.world = sim.world;
      while (sim.agent.alive) {
        sim.getObservation(network.observationVersion, network.requiredInputs, buffer);
        const row = Math.round(sim.agent.row);
        if (enriched && [-1, 0, 1].some(dy => sim.world.row(row + dy).type === "water")) {
          const before = { tick: sim.tick, agent: { ...sim.agent } };
          for (let i = 0; i < ACTIONS.length; i++) {
            probe.tick = sim.tick; probe.agent = { ...sim.agent }; probe.step(ACTIONS[i], false); probedActions++;
            if (probe.agent.deathReason === "water" || probe.agent.deathReason === "bounds") {
              buffer[GLOBAL_OFFSET + 3 + i] = 1; identifiedFatalWaterActions++;
            }
          }
          assert.deepEqual({ tick: sim.tick, agent: sim.agent }, before, "Diagnostic probe changed the real agent");
        }
        sim.step(network.decide(buffer), false); observedDecisions++;
      }
      return { seed, score: sim.agent.maxRow, ticks: sim.tick, deathReason: sim.agent.deathReason,
        fitness: fitness(sim.agent.maxRow, sim.tick, sim.agent.deathReason) };
    });
    const result = { name, enriched, genome: genome.id, observedDecisions, probedActions, identifiedFatalWaterActions,
      ...summarizeVariantTwo(episodes), episodes };
    if (name === "current-variant-two" && !enriched) assert.equal(result.meanRow, best.meanRow);
    results.push(result); console.log(JSON.stringify({ ...result, episodes: undefined }));
  }
}
writeVariantTwoImmutable(`results/variants/variant-2/water-risk-diagnostic-${current.id}.json`, JSON.stringify({
  diagnosticOnly: true, newTrainingGenerations: 0, frozenModelsUnmodified: true, liveTrainingAndViewerUnchanged: true,
  source: { directory: best.selectedDirectory, generation: best.generation, genome: current.id },
  mapRole: "development", maps: best.developmentMaps, finalMapsOpened: false, results }, null, 2));
