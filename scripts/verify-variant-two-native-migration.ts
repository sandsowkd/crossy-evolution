import assert from "node:assert/strict";
import fs from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { Trainer, type Checkpoint } from "../src/evolution/trainer";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { mutateRiverInputs } from "../src/evolution/variant-two-residual";
import { sha256, writeVariantTwoImmutable as immutable } from "../src/evolution/variant-two-experiment";

const mode = process.argv[2];
assert.ok(mode === "capture" || mode === "verify");
const root = "results/variants/variant-2/native-migration-001";
if (mode === "capture") {
  const directory = "results/variants/variant-2/transfer-consistent-001";
  const head = JSON.parse(fs.readFileSync(`${directory}/HEAD.json`, "utf8"));
  const source = `${directory}/snapshots/${String(head.generation).padStart(5, "0")}.json`;
  const text = fs.readFileSync(source, "utf8");
  assert.equal(sha256(text), head.snapshotSha256);
  const snapshot = parseEvolution<{ checkpoint: Checkpoint }>(text);
  const trainer = Trainer.restore(parseCheckpoint(stringifyEvolution(snapshot.checkpoint)));
  const protocol = JSON.parse(fs.readFileSync(`${directory}/protocol.json`, "utf8"));
  const started = performance.now(), record = trainer.runGeneration();
  for (const genome of trainer.neat.population.slice(trainer.neat.species.length))
    mutateRiverInputs(genome, trainer.neat.rng, protocol.residualMutation.rate, protocol.residualMutation.sigma);
  immutable(`${root}/reference.json.gz`, gzipSync(stringifyEvolution({ record, neat: trainer.neat.save() })));
  immutable(`${root}/source.json`, JSON.stringify({ source, snapshotSha256: head.snapshotSha256,
    sourceGeneration: head.generation, trainingEpisodes: trainer.config.population * trainer.config.trainingSeeds,
    residualMutation: protocol.residualMutation, referenceSeconds: (performance.now() - started) / 1000,
    note: "Differential verification only; this extra generation is not training lineage progress." }, null, 2));
  console.log(`Captured all ${record.populationSize} chickens and offspring at generation ${record.generation}.`);
} else {
  const source = JSON.parse(fs.readFileSync(`${root}/source.json`, "utf8"));
  const text = fs.readFileSync(source.source, "utf8");
  assert.equal(sha256(text), source.snapshotSha256);
  const snapshot = parseEvolution<{ checkpoint: Checkpoint }>(text);
  const trainer = Trainer.restore(parseCheckpoint(stringifyEvolution(snapshot.checkpoint)));
  const started = performance.now(), record = trainer.runGeneration();
  for (const genome of trainer.neat.population.slice(trainer.neat.species.length))
    mutateRiverInputs(genome, trainer.neat.rng, source.residualMutation.rate, source.residualMutation.sigma);
  const seconds = (performance.now() - started) / 1000;
  const reference = parseEvolution<{ record: typeof record; neat: ReturnType<Trainer["neat"]["save"]> }>(
    gunzipSync(fs.readFileSync(`${root}/reference.json.gz`)).toString());
  assert.deepEqual(record, reference.record);
  assert.deepEqual(trainer.neat.save(), reference.neat);
  const report = { sourceGeneration: source.sourceGeneration, generation: record.generation,
    population: record.populationSize, trainingMaps: record.seeds.length, completeRecordExact: true,
    allOffspringRngInnovationsSpeciesAndResidualMutationsExact: true,
    referenceSeconds: source.referenceSeconds, optimizedSeconds: seconds,
    observedSpeedup: source.referenceSeconds / seconds,
    repeatedVerificationEpisodes: 2 * source.trainingEpisodes, newTrainingLineageGenerations: 0,
    recordSha256: sha256(stringifyEvolution(record)), finalMapsOpened: false };
  immutable(`${root}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
