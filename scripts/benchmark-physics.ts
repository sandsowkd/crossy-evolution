import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GameSimulation } from "../src/core/simulation";
import { type Config } from "../src/core/types";
import { fitness, mean, type Episode } from "../src/evolution/evaluation";
import { type Genome } from "../src/evolution/genome";
import { Network } from "../src/evolution/network";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { ReferenceSimulation } from "../src/tests/fixtures/reference-simulation";

const output = process.argv[2] ?? "results/experiments/evolution/physics-benchmark.json";
const sources = process.argv.slice(3);
if (!sources.length) sources.push("results/continued/selected.json", "results/experiments/trajectory/warm-v3-100/selected.json");
const genomes = sources.map((source) => ({ source,
  genome: parseEvolution<{ genome: Genome }>(fs.readFileSync(source, "utf8")).genome }));
const seeds = Array.from({ length: 64 }, (_, i) => (0xa1000000 + i * 65537) >>> 0);
const baseConfig: Config = { curriculum: "roads", maxTicks: 36000, difficulty: 1 };
function simulate(g: Genome, seed: number, config: Config, reference: boolean): Episode {
  const s = reference ? new ReferenceSimulation(config, seed) : new GameSimulation(config, seed), n = new Network(g);
  const version=n.observationVersion;
  if(version===5||version===6||version===7||version===8||version===9)throw new Error("Frozen physics benchmark sensor fixture covers versions1–4");
  while (s.agent.alive) s.step(n.decide(s.getObservation(version, n.requiredInputs)), false);
  return { seed, score: s.agent.maxRow, ticks: s.tick, deathReason: s.agent.deathReason,
    fitness: fitness(s.agent.maxRow, s.tick, s.agent.deathReason) };
}
const exact = [];
for (const entry of genomes)
  for (const version of [1, 2, 3, 4] as const)
    for (const curriculum of ["roads", "trains"] as const) {
      const g = structuredClone(entry.genome); if (version === 1) delete g.observationVersion; else g.observationVersion = version;
      const config = { ...baseConfig, curriculum }, episodes = [], digest = createHash("sha256");
      let decisions = 0;
      for (const seed of seeds.slice(0, 16)) {
        const fast = new GameSimulation(config, seed), ref = new ReferenceSimulation(config, seed), a = new Network(g), b = new Network(g);
        while (fast.agent.alive) {
          const oa = fast.getObservation(version, a.requiredInputs), ob = ref.getObservation(version, b.requiredInputs);
          assert.deepEqual(oa, ob); const action = a.decide(oa), referenceAction = b.decide(ob);
          assert.equal(action, referenceAction); assert.deepEqual(a.scores, b.scores);
          assert.deepEqual(fast.step(action, false), ref.step(referenceAction, false));
          assert.deepEqual(fast.agent, ref.agent); assert.equal(fast.tick, ref.tick);
          digest.update(JSON.stringify([fast.tick, fast.agent, Array.from(a.scores), action])); decisions++;
        }
        episodes.push({ seed, score: fast.agent.maxRow, ticks: fast.tick, deathReason: fast.agent.deathReason });
      }
      const result = { source: entry.source, genome: g.id, observationVersion: version, curriculum,
        matchedEpisodes: episodes.length, matchedDecisions: decisions, traceSha256: digest.digest("hex"), episodes };
      exact.push(result); console.log(`exact source=${entry.source} version=${version} curriculum=${curriculum} episodes=${episodes.length} decisions=${decisions}`);
    }
const timings = [];
for (const entry of genomes) {
  const g = entry.genome, referenceSeconds: number[] = [], optimizedSeconds: number[] = [];
  let referenceOutcomes: Episode[] | undefined;
  const run = (reference: boolean) => {
    const start = performance.now(), episodes = seeds.map((seed) => simulate(g, seed, baseConfig, reference));
    const seconds = (performance.now() - start) / 1000;
    if (referenceOutcomes) assert.deepEqual(episodes, referenceOutcomes); else referenceOutcomes = episodes;
    return seconds;
  };
  run(true); run(false);
  for (let round = 0; round < 4; round++)
    for (const reference of round % 2 ? [false, true] : [true, false])
      (reference ? referenceSeconds : optimizedSeconds).push(run(reference));
  const result = { source: entry.source, genome: g.id, observationVersion: g.observationVersion ?? 1,
    episodesPerRound: seeds.length, referenceSeconds, optimizedSeconds,
    meanReferenceSeconds: mean(referenceSeconds), meanOptimizedSeconds: mean(optimizedSeconds),
    speedup: mean(referenceSeconds) / mean(optimizedSeconds),
    physicsTicksPerRound: referenceOutcomes!.reduce((a, e) => a + e.ticks, 0),
    meanRow: mean(referenceOutcomes!.map((e) => e.score)) };
  timings.push(result); console.log(result);
}
const result = { machine: os.cpus()[0].model, node: process.version, config: baseConfig, seeds,
  note: "Frozen pre-optimization physics + sparse encoder compared with allocation-free road collisions and scalar slab tests + the same sparse encoder. Full per-decision consumed observations, neural scores/actions, every physics result and agent state match exactly. Source sensor versions are retagged only for equivalence coverage, not model selection. Alternating order, warmup excluded; concurrent training jobs may affect timings.",
  exactMatchedEpisodes: exact.reduce((a, e) => a + e.matchedEpisodes, 0),
  exactMatchedDecisions: exact.reduce((a, e) => a + e.matchedDecisions, 0), exact, timings };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
fs.writeFileSync(output.replace(/\.json$/, "-inputs.json"), stringifyEvolution({ genomes }));
