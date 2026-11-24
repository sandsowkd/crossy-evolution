import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { episode, mean, type Episode } from "../../src/evolution/evaluation";
import { type Genome } from "../../src/evolution/genome";
import { Network } from "../../src/evolution/network";
import { parseEvolution } from "../../src/evolution/serialization";
import { type Config } from "../../src/core/types";

const source = process.argv[2] ?? ".archive/results/variant-1/continued/selected.json";
const output = process.argv[3] ?? ".archive/results/variant-1/experiments/evolution/sparse-benchmark.json";
const sourceGenome = parseEvolution<{ genome: Genome }>(fs.readFileSync(source, "utf8")).genome;
const seeds = Array.from({ length: 64 }, (_, i) => (0xa1000000 + i * 65537) >>> 0);
const config: Config = { curriculum: "roads", maxTicks: 36000, difficulty: 1 };
const reports = [];
for (const version of [1, 2, 3] as const) {
  const genome = structuredClone(sourceGenome);
  if (version === 1) delete genome.observationVersion;
  else genome.observationVersion = version;
  const network = new Network(genome);
  const run = (sparse: boolean) => {
    const start = performance.now();
    const episodes = seeds.map((seed) => episode((o) => network.decide(o), seed,
      config, undefined, sparse ? network : undefined, version));
    return { seconds: (performance.now() - start) / 1000, episodes };
  };
  run(false); run(true); // Warm both implementations before measuring.
  const dense: number[] = [], sparse: number[] = [];
  let reference: Episode[] | undefined;
  for (let round = 0; round < 4; round++) {
    // Alternate order to reduce bias from JIT and neighboring training jobs.
    for (const mode of round % 2 ? [true, false] : [false, true]) {
      const r = run(mode);
      if (reference) assert.deepEqual(r.episodes, reference);
      else reference = r.episodes;
      (mode ? sparse : dense).push(r.seconds);
    }
  }
  const report = { observationVersion: version, episodesPerRound: seeds.length,
    consumedInputs: network.requiredInputs.reduce((a, b) => a + b, 0),
    denseSeconds: dense, sparseSeconds: sparse,
    meanDenseSeconds: mean(dense), meanSparseSeconds: mean(sparse),
    speedup: mean(dense) / mean(sparse), exactEpisodeMatches: seeds.length * 8,
    physicsTicksPerRound: reference!.reduce((a, e) => a + e.ticks, 0),
    meanRow: mean(reference!.map((e) => e.score)) };
  reports.push(report); console.log(report);
}
const result = { machine: os.cpus()[0].model, node: process.version, source,
  sourceGenome: sourceGenome.id, config, seeds,
  note: "Versions are retagged solely to benchmark each encoder path, not as model-quality evidence. Dense and sparse policies receive bit-exact consumed channels; all episode outcomes match. Other training jobs may affect timings.", reports };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
