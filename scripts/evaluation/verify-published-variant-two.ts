import assert from "node:assert/strict";
import fs from "node:fs";
import type { Config } from "../../src/core/types";
import { VARIANT_TWO_CONFIG } from "../../src/core/upstream";
import type { Genome } from "../../src/evolution/genome";
import { validGenome } from "../../src/evolution/checkpoint";
import { evaluateGenome } from "../../src/evolution/evaluation";
import { Replay } from "../../src/evolution/replay";
import { parseEvolution } from "../../src/evolution/serialization";
import { summarizeVariantTwo } from "../../src/evolution/variant-two-experiment";

const base = ".archive/results/variant-2";
const publication = JSON.parse(fs.readFileSync(`${base}/published-v4-native-progress.json`, "utf8"));
const seeds = Array.from({ length: 256 }, (_, i) => (0x98000000 + i * 65537) >>> 0);
const reports = [];
for (const record of publication.records) {
  const preview = parseEvolution<{ genomes: Genome[]; selectedGenome: number; simulation: Config }>(
    fs.readFileSync(record.previewFile, "utf8"));
  assert.equal(preview.genomes.length, 200);
  assert.ok(preview.genomes.every(g => validGenome(g) && g.observationVersion === 9));
  assert.deepEqual(preview.simulation, VARIANT_TWO_CONFIG);
  assert.equal(preview.selectedGenome, record.genome);
  const selected = preview.genomes.find(g => g.id === preview.selectedGenome)!;
  const verification = JSON.parse(fs.readFileSync(record.verificationFile, "utf8"));
  const expected = verification.confirmationEpisodes ?? verification.episodes;
  assert.deepEqual(expected.map((e: { seed: number }) => e.seed), seeds);
  const actual = evaluateGenome(selected, seeds, VARIANT_TWO_CONFIG);
  assert.deepEqual(actual, expected);
  const metrics = summarizeVariantTwo(actual);
  assert.equal(metrics.meanRow, record.meanRow);
  assert.equal(metrics.maximumRow, record.maximumRow);
  const peak = actual.reduce((a, b) => a.score >= b.score ? a : b);
  const replay = new Replay([selected], peak.seed, VARIANT_TWO_CONFIG);
  while (!replay.finished) replay.advance();
  assert.equal(replay.current.sim.tick, peak.ticks);
  assert.equal(replay.current.sim.agent.maxRow, peak.score);
  assert.equal(replay.current.sim.agent.deathReason, peak.deathReason);
  reports.push({ kind: record.kind, genome: selected.id, metrics,
    exactNativeEpisodeTraces: 256, actualPeakRendererExact: true, savedNativePolicies: 200 });
}
console.log(JSON.stringify({ reports, repeatedDevelopmentEpisodes: 512, rendererEpisodes: 2,
  newTrainingEpisodes: 0, finalMapsOpened: false }, null, 2));
