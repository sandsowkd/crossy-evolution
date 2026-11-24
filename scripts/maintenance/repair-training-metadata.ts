/** One-time correction for the long run started before evaluateGenome passed
 * its network's sensor version through to episode(). That run used binary-v1
 * inputs; weights and outcomes are unchanged. Verify all champions afterward. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { gzipSync, gunzipSync } from "node:zlib";
import { parseCheckpoint } from "../../src/evolution/checkpoint";
import { evaluateGenome } from "../../src/evolution/evaluation";
import { type Genome } from "../../src/evolution/genome";

const output = process.argv[2] ?? ".archive/results/variant-1/learned";
const checkpointPath = path.join(output, "checkpoint.json");
const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
const selectedPath = path.join(output, "selected.json");
const selected = JSON.parse(fs.readFileSync(selectedPath, "utf8"));
const fix = (g: Genome) => {
  delete g.observationVersion;
};
for (const r of checkpoint.history) {
  fix(r.champion);
  r.contenders.forEach(fix);
}
checkpoint.neat.population.forEach(fix);
checkpoint.neat.representatives.forEach((s: { representative: Genome }) =>
  fix(s.representative),
);
fix(selected.genome);
for (const r of checkpoint.history) {
  const file = path.join(output, "generations", path.basename(r.cohortFile));
  const data = JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8"));
  data.contenders.forEach(fix);
  fs.writeFileSync(file, gzipSync(JSON.stringify(data), { level: 3 }));
}
fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint));
fs.writeFileSync(selectedPath, JSON.stringify(selected));
const parsed = parseCheckpoint(fs.readFileSync(checkpointPath, "utf8"));
for (const r of parsed.history) {
  assert.deepEqual(
    evaluateGenome(r.champion, r.seeds, {
      ...parsed.config.simulation,
      curriculum: r.curriculum,
    }),
    r.training,
  );
  assert.deepEqual(
    evaluateGenome(
      r.champion,
      r.evaluation.map((e) => e.seed),
      { ...parsed.config.simulation, curriculum: r.curriculum },
    ),
    r.evaluation,
  );
}
fs.writeFileSync(
  path.join(output, "sensor-verification.json"),
  JSON.stringify(
    {
      correction:
        "Saved sensor metadata now matches the binary-v1 observations actually used by this run. No weights, physics or recorded outcomes changed.",
      verifiedChampionTrainingEpisodes:
        parsed.history.length * parsed.config.trainingSeeds,
      verifiedChampionMonitorEpisodes: parsed.history.length * 16,
      allEpisodeResultsMatchExactly: true,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Corrected sensor metadata; every saved champion reproduces its complete training and monitor suite exactly.`,
);
