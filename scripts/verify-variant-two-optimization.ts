import assert from "node:assert/strict";
import fs from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { Trainer } from "../src/evolution/trainer";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { sha256, writeVariantTwoAtomic as atomic, writeVariantTwoImmutable as immutable } from "../src/evolution/variant-two-experiment";

const root = "results/variants/variant-2/encoding-equivalence", mode = process.argv[2];
assert.ok(["capture","verify"].includes(mode));
if(mode === "capture") {
  const source="results/variants/variant-2/transfer-normal-001", head=JSON.parse(fs.readFileSync(`${source}/HEAD.json`,"utf8"));
  const file=`${source}/snapshots/${String(head.generation).padStart(5,"0")}.json`;
  const text=fs.readFileSync(file,"utf8");assert.equal(sha256(text),head.snapshotSha256);
  const snapshot=parseEvolution<{checkpoint: ReturnType<Trainer["checkpoint"]>}>(text);
  const trainer=Trainer.restore(parseCheckpoint(stringifyEvolution(snapshot.checkpoint))), record=trainer.runGeneration();
  immutable(`${root}/reference.json.gz`,gzipSync(stringifyEvolution({record,neat:trainer.neat.save()})));
  immutable(`${root}/source.json`,JSON.stringify({sourceSnapshot:file,sourceSnapshotSha256:head.snapshotSha256,
    generation:record.generation,trainingEpisodes:trainer.config.population*trainer.config.trainingSeeds,
    note:"Extra generation evaluated to verify encoder equivalence; not counted as new lineage progress."},null,2));
  console.log(`Captured unmodified-encoder generation ${record.generation}, ${trainer.config.population*trainer.config.trainingSeeds} episodes.`);
} else {
  const source=JSON.parse(fs.readFileSync(`${root}/source.json`,"utf8")),text=fs.readFileSync(source.sourceSnapshot,"utf8");
  assert.equal(sha256(text),source.sourceSnapshotSha256);
  const snapshot=parseEvolution<{checkpoint: ReturnType<Trainer["checkpoint"]>}>(text);
  const trainer=Trainer.restore(parseCheckpoint(stringifyEvolution(snapshot.checkpoint))), record=trainer.runGeneration();
  const expected=parseEvolution<{record:typeof record;neat:ReturnType<Trainer["neat"]["save"]>}>(gunzipSync(fs.readFileSync(`${root}/reference.json.gz`)).toString());
  assert.deepEqual(record,expected.record);assert.deepEqual(trainer.neat.save(),expected.neat);
  const report={generation:record.generation,fullPopulation:record.populationSize,trainingMaps:record.seeds.length,
    observationsAndPhysicsEquivalent:true,wholeGenerationAndOffspringExact:true,
    referenceTrainingEpisodes:source.trainingEpisodes,verificationRepeatedTrainingEpisodes:source.trainingEpisodes,
    totalExtraEvaluationEpisodes:source.trainingEpisodes*2,recordSha256:sha256(stringifyEvolution(record)),finalMapsOpened:false};
  atomic(`${root}/verification.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
