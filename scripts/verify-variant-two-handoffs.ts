import assert from "node:assert/strict";
import fs from "node:fs";
import { sha256, writeVariantTwoImmutable as immutable } from "../src/evolution/variant-two-experiment";

// Compare the serialized implicit-base representation directly, including every
// learned weight, history record, population, RNG, innovation and species field.
for (const run of process.argv.slice(2)) {
  assert.match(run, /^transfer-[a-z0-9-]{1,48}$/);
  const directory = `results/variants/variant-2/${run}`;
  const protocol = JSON.parse(fs.readFileSync(`${directory}/protocol.json`, "utf8"));
  assert.equal(protocol.initialization, "resume");
  const sourceRaw = fs.readFileSync(protocol.parent.snapshotFile, "utf8");
  assert.equal(sha256(sourceRaw), protocol.parent.snapshotSha256);
  const targetFile = `${directory}/snapshots/${String(protocol.initialGeneration).padStart(5, "0")}.json`;
  const targetRaw = fs.readFileSync(targetFile, "utf8");
  const source = JSON.parse(sourceRaw), target = JSON.parse(targetRaw);
  assert.equal(source.genomeEncoding, target.genomeEncoding);
  assert.deepEqual(target.checkpoint, source.checkpoint);
  assert.deepEqual(target.selected, source.selected);
  assert.equal(target.protocolSha256, sha256(JSON.stringify(protocol)));
  const report = { run, source: protocol.parent.directory, generation: protocol.initialGeneration,
    sourceSnapshotSha256: protocol.parent.snapshotSha256, initialSnapshotSha256: sha256(targetRaw),
    completeNativeCheckpointExact: true, selectedPolicyExact: true,
    populationRngInnovationsSpeciesParametersAndHistoryExact: true,
    trainingConfigurationAndNextMapStreamExact: true,
    remainingGenerations: protocol.generationCap - protocol.initialGeneration,
    plannedRemainingTrainingEpisodes: (protocol.generationCap - protocol.initialGeneration) *
      protocol.config.population * protocol.config.trainingSeeds, finalMapsOpened: false };
  immutable(`${directory}/initialization-verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
