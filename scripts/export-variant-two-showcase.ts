/** Presentation export only: authentic saved cohorts; never breeds or trains. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {parseEvolution, stringifyEvolution} from "../src/evolution/serialization";
import {validGenome} from "../src/evolution/checkpoint";
import type {Genome} from "../src/evolution/genome";
import type {Config} from "../src/core/types";
import type {ExplorerCatalog, SequenceRecord} from "../src/visualization/explorer-data";
import {REPLAY_MAP_SEEDS} from "../src/visualization/explorer-sequence";
const root = "results/variants/variant-2";
const read = <T,>(file: string): T => JSON.parse(fs.readFileSync(file,"utf8"));
const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const write = (file: string, data: unknown) => {fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data)+"\n");};
const owner = read<{stage: string; promoted: unknown[]; currentRecordsHaveFullGenotypeProof: boolean}>(`${root}/native020-endpoint-closeout-001-status.json`);
assert.equal(owner.stage,"completed-comparison-and-objective-audit");
assert.equal(owner.promoted.length,0); assert.ok(owner.currentRecordsHaveFullGenotypeProof);
const best = read<{selectedDirectory: string; generation: number; genome: number; meanRow: number; maximumRow: number; simulation: Config; verificationFile: string}>(`${root}/best-development.json`);
assert.equal(best.genome,353089); // A different final record requires an explicit reviewed freeze.
const proofFile = `${best.selectedDirectory}/record-${best.genome}-learned-genotype-proof.json`;
const proof = read<{unchangedMatches: number; exact256NativeTraces: boolean; actualPeakRendererVerified: boolean; actual200ViewerGenomesExact: boolean}>(proofFile);
assert.equal(proof.unchangedMatches,0);assert.ok(proof.exact256NativeTraces && proof.actualPeakRendererVerified && proof.actual200ViewerGenomesExact);
const config = best.simulation; assert.equal(config.variantTwoRules,"clustered-traffic-v4");
const cohortAt = (directory: string, generation: number) => `${directory}/generations/${String(generation).padStart(5,"0")}.json.gz`;
const finalCohortFile = cohortAt(best.selectedDirectory,best.generation);
const finalText = gunzipSync(fs.readFileSync(finalCohortFile)).toString();
const finalGenomes = parseEvolution<{contenders: Genome[]}>(finalText).contenders;
const genome = finalGenomes.find(item=>item.id===best.genome)!; assert.ok(genome && validGenome(genome));
const freeze = {version:1, frozenAt:"2026-11-24T20:33:02.084555+00:00", trainingPermanentlyClosed:true,
  ordinaryInputNetworkOnly:true, selectedGenome:genome.id, sourceRun:best.selectedDirectory, sourceGeneration:best.generation,
  displayGeneration:150, genotypeSha256:sha(stringifyEvolution(genome)), cohortFile:finalCohortFile, cohortSha256:sha(finalText),
  verificationFile:best.verificationFile, verificationSha256:sha(fs.readFileSync(best.verificationFile)),
  learnedGenotypeProofFile:proofFile, learnedGenotypeProofSha256:sha(fs.readFileSync(proofFile)),
  developmentMean:best.meanRow, developmentOwnMaximum:best.maximumRow, evaluationMaps:256,
  independentFinalAssessment:false, reservedFinalMapsOpened:false,
  separatePeak:{mean:517.7109375,ownMaximum:2296,genome:319474,sourceGeneration:224,sourceRun:"v4-native013-rngn192-rng-o/focused"},
  simulation:config, finalBatchComparison:`${root}/native020-448-comparison-001.json`, finalNominationAudit:`${root}/native-objective-audit-v4-068.json`};
write(`${root}/showcase-final-policy-freeze-001.json`,freeze);
write("public/variant-2/final-policy.json",{genomes:[genome], selectedGenome:genome.id, simulation:config, generation:150,
  sourceGeneration:best.generation, sourceRun:best.selectedDirectory, meanRow:best.meanRow, maximumRow:best.maximumRow,
  freeze, freezeSha256:sha(JSON.stringify(freeze)), sourceCohortHash:sha(finalText)});
const interpolate = (position: number, count: number, from: number, to: number) => Math.round(from + position * (to-from)/(count-1));
const rows: SequenceRecord[] = [], provenance: unknown[] = [];
for(let generation=1;generation<=150;generation++) {
  let directory: string, sourceGeneration: number, phase: string;
  if(generation<=5) {directory=`${root}/paired-004/scratch`;sourceGeneration=generation;phase="random-start";}
  else if(generation<=25) {directory=`${root}/paired-004/scratch`;sourceGeneration=interpolate(generation-6,20,6,64);phase="early-selection";}
  else if(generation<=40) {directory=`${root}/transfer-river-001`;sourceGeneration=interpolate(generation-26,15,1,91);phase="transferred-road-skills";}
  else if(generation<=65) {directory=`${root}/transfer-restart-002`;sourceGeneration=interpolate(generation-41,25,1,256);phase="river-adaptation";}
  else if(generation<=85) {directory=`${root}/transfer-consistent64-001`;sourceGeneration=interpolate(generation-66,20,257,624);phase="consistent-crossings";}
  else if(generation<=110) {directory=`${root}/v4-focused64-rng-a-001/focused`;sourceGeneration=interpolate(generation-86,25,1,496);phase="native-guided-fitness";}
  else {directory=best.selectedDirectory;sourceGeneration=interpolate(generation-111,40,1,best.generation);phase="native-refinement";}
  const sourceFile=cohortAt(directory,sourceGeneration), bytes=fs.readFileSync(sourceFile), text=gunzipSync(bytes).toString();
  const genomes=parseEvolution<{contenders:Genome[]}>(text).contenders;
  assert.ok(genomes.length>=100 && genomes.every(validGenome)); assert.equal(new Set(genomes.map(g=>g.id)).size,genomes.length);
  const cohortFile=`/training-cohorts/variant-2-sequence/${String(generation).padStart(5,"0")}.json.gz`;
  fs.mkdirSync(path.dirname(`public${cohortFile}`),{recursive:true}); fs.writeFileSync(`public${cohortFile}`,bytes);
  rows.push({generation,populationSize:genomes.length,cohortFile,cohortHash:sha(text),seeds:[...REPLAY_MAP_SEEDS],
    config,sourceGeneration,sourcePhase:phase});
  const protocolFile=fs.existsSync(`${directory}/protocol.json`) ? `${directory}/protocol.json` : `${root}/paired-004/protocol.json`;
  provenance.push({displayGeneration:generation,sourceRun:directory,sourceGeneration,sourcePhase:phase,sourceCohortFile:sourceFile,
    sourceCompressedSha256:sha(bytes),cohortSha256:sha(text),population:genomes.length,allOriginalIds:genomes.map(g=>g.id),
    protocolFile,protocolSha256:sha(fs.readFileSync(protocolFile)),viewerRules:config.variantTwoRules,
    note:"Complete authentic archived population. Curated display positions span separate experiments and transfers; not150 uninterrupted native training generations. Earlier archives are replayed under the same final V4 viewing rules."});
}
assert.equal(rows.length,150);assert.equal(rows[149].cohortHash,freeze.cohortSha256);
const catalog=read<ExplorerCatalog>("public/explorer-catalog.json");
const variant=catalog.variants.find(v=>v.id===2)!;
variant.completed=true;variant.name="Cars, trains, and logs";variant.sequence=rows;
variant.phases=[{id:"development",name:"Historical development archive",note:"Historical source positions, retained for older links. The public sequence curates150 authentic populations.",source:"Archived experiments",config,records:variant.phases[0].records}];
write("public/explorer-catalog.json",catalog);
write("public/variant-2/showcase-provenance.json",{version:1,finalPolicyFreeze:freeze,displayGenerations:provenance,
  explanation:"Display1–150 curates authentic saved populations from multiple experiments. Training generations, populations, observations and starting states varied. These are presentation positions, not a new training run or an uninterrupted family tree. The original007 evaluated496 cohort reset remains part of the final policy ancestry; no training was performed for this export."});
console.log(JSON.stringify({populations:rows.length,policies:rows.reduce((n,r)=>n+r.populationSize,0),finalGenome:genome.id,finalDisplayGeneration:150,newTrainingEpisodes:0,newEvaluationEpisodes:0}));
