import fs from "node:fs";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { setImmediate } from "node:timers/promises";
import { parseEvolution } from "../../src/evolution/serialization";
import { evaluateGenome, mean } from "../../src/evolution/evaluation";
import type { Checkpoint } from "../../src/evolution/trainer";
import type { Genome } from "../../src/evolution/genome";
import { VARIANT_TWO_CONFIG } from "../../src/core/upstream";
import { sha256, summarizeVariantTwo, writeVariantTwoImmutable } from "../../src/evolution/variant-two-experiment";

// Compare complete, actual cohorts on the same previously opened development maps.
// Usage: tsx scripts/evaluation/audit-variant-two-populations.ts OUTPUT.json DIR:GEN [...]
const [output, ...sources] = process.argv.slice(2);
assert.ok(output && sources.length >= 2);
assert.equal(fs.existsSync(output), false, "Choose a new report file");
const seeds = Array.from({ length: 64 }, (_, i) => (0x94000000 + i * 65537) >>> 0);
const reports = [];
for (const source of sources) {
  const [directory, generationText] = source.split(":");
  const generation = Number(generationText);
  assert.ok(Number.isInteger(generation) && generation > 0);
  const head = JSON.parse(fs.readFileSync(`${directory}/HEAD.json`, "utf8"));
  const snapshotText = fs.readFileSync(`${directory}/snapshots/${String(head.generation).padStart(5, "0")}.json`, "utf8");
  assert.equal(sha256(snapshotText), head.snapshotSha256);
  const snapshot = parseEvolution<{ checkpoint: Checkpoint }>(snapshotText);
  assert.deepEqual(snapshot.checkpoint.config.simulation, VARIANT_TWO_CONFIG);
  const record = snapshot.checkpoint.history.find(r => r.generation === generation);
  assert.ok(record);
  const cohortFile = `${directory}/generations/${String(generation).padStart(5, "0")}.json.gz`;
  const payload = gunzipSync(fs.readFileSync(cohortFile)).toString();
  assert.equal(sha256(payload), record.cohortHash);
  const { contenders } = parseEvolution<{ contenders: Genome[] }>(payload);
  assert.equal(contenders.length, record.populationSize);
  const all = [], policies = [];
  for (const genome of contenders) {
    const episodes = evaluateGenome(genome, seeds, VARIANT_TWO_CONFIG);
    all.push(...episodes);
    policies.push({ genome: genome.id, ...summarizeVariantTwo(episodes) });
    await setImmediate();
  }
  const values = policies.map(p => p.meanRow).sort((a, b) => a - b);
  const quantile = (q: number) => values[Math.floor(q * (values.length - 1))];
  const report = { directory, generation, cohortFile, cohortSha256: sha256(payload),
    sourceSnapshotSha256: head.snapshotSha256, population: contenders.length,
    developmentEpisodes: all.length, populationMeanRow: mean(values),
    policyMeanDistribution: { minimum: values[0], p10: quantile(.1), p25: quantile(.25), median: quantile(.5),
      p75: quantile(.75), p90: quantile(.9), maximum: values.at(-1) },
    policiesAveraging100: values.filter(v => v >= 100).length,
    episodes: summarizeVariantTwo(all), policies: policies.sort((a, b) => b.meanRow - a.meanRow) };
  reports.push(report);
  console.log(JSON.stringify({ ...report, policies: undefined }));
}
writeVariantTwoImmutable(output, JSON.stringify({ createdAt: new Date().toISOString(),
  simulation: VARIANT_TWO_CONFIG, seeds, mapRole: "development", finalMapsOpened: false, reports }, null, 2));
