/** Publish a small gallery from the immutable, independently tested final model. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { type Genome } from "../src/evolution/genome";
import { Trainer } from "../src/evolution/trainer";

const source = "results/variants/variant-1/final", namespace = "variant-1-final";
const checkpointText = fs.readFileSync(`${source}/checkpoint.json`, "utf8");
const checkpoint = parseCheckpoint(checkpointText);
const selectedModel = parseEvolution<{genome: Genome; generation: number; meanRow: number}>(fs.readFileSync(`${source}/selected.json`, "utf8"));
const evaluation = JSON.parse(fs.readFileSync(`${source}/evaluation.json`, "utf8"));
const freeze = JSON.parse(fs.readFileSync(`${source}/freeze.json`, "utf8"));
assert.equal(checkpoint.config.simulation.eagle, undefined);
assert.equal(createHash("sha256").update(checkpointText).digest("hex"), freeze.checkpointSha256);
const wanted = new Set([1, 100, selectedModel.generation]);
fs.mkdirSync(`public/training-cohorts/${namespace}`, { recursive: true });
for (const record of checkpoint.history) {
  const file = path.basename(record.cohortFile!);
  const data = fs.readFileSync(`${source}/generations/${file}`);
  const decoded = gunzipSync(data);
  const population = parseEvolution<{contenders: Genome[]}>(decoded.toString());
  assert.equal(population.contenders.length, 100);
  if (record.generation === selectedModel.generation) {
    assert.deepEqual(population.contenders.find(g => g.id === selectedModel.genome.id), selectedModel.genome);
  }
  record.cohortHash = createHash("sha256").update(decoded).digest("hex");
  record.cohortFile = `/training-cohorts/${namespace}/${file}`;
  fs.writeFileSync(`public/training-cohorts/${namespace}/${file}`, data);
}
const exported = stringifyEvolution(checkpoint);
parseCheckpoint(exported);
fs.writeFileSync("public/trained-checkpoint.json", exported);
fs.writeFileSync("public/demo.json", stringifyEvolution({
  config: checkpoint.config,
  history: checkpoint.history.filter(r => wanted.has(r.generation)),
  curatedHistory: true,
  selectedModel, evaluation,
  provenance: { label: "Variant 1 final · cars and roads", initialization: "Warm start",
    trainingEpisodes: 480000,
    ancestry: "1,174 selected phase positions across inherited warm starts. This memory branch trained 100 chickens × 32 maps for 150 generations. Its independent 512-map final assessment uses the historical rules without an eagle." },
}));
// Browser export must continue exactly like the frozen native checkpoint.
const native = Trainer.restore(parseCheckpoint(checkpointText));
const browser = Trainer.restore(parseCheckpoint(exported));
assert.deepEqual(browser.runGeneration(), native.runGeneration());
assert.deepEqual(browser.neat.save(), native.neat.save());
fs.writeFileSync(`${source}/viewer-verification.json`, JSON.stringify({
  verifiedAt: new Date().toISOString(), namespace, fullNativePopulations: 150,
  featuredGenerations: [...wanted], populationPerGeneration: 100,
  sourceCheckpointUnchanged: createHash("sha256").update(fs.readFileSync(`${source}/checkpoint.json`)).digest("hex") === freeze.checkpointSha256,
  exactNativeContinuation: "Generation 151 and subsequent full NEAT state match exactly; verification only, not saved as new training.",
}, null, 2) + "\n");
console.log("Published three full-population highlights and exact native checkpoint; 150 archives retained locally/release.");
