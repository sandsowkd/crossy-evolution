import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { VARIANT_TWO_CONFIG } from "../src/core/upstream";
import { Trainer, type TrainingConfig } from "../src/evolution/trainer";
import { Innovations, type Genome } from "../src/evolution/genome";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { evaluateGenome } from "../src/evolution/evaluation";
import { upgradeToVariantTwo } from "../src/evolution/variant-two-transfer";
import { acquireVariantTwoLock, archiveVariantTwoPopulation, assertVariantTwoSeedSeparation, commitVariantTwoSnapshot,
  protocolSha256, readVariantTwoSnapshot, sha256, summarizeVariantTwo, writeVariantTwoAtomic, writeVariantTwoImmutable,
  VARIANT_TWO_SEED, VARIANT_TWO_TRAINING_PREFIX, VARIANT_TWO_TRAINING_STREAM, VARIANT_TWO_TRAINING_STRIDE,
  VARIANT_TWO_PARAMETERS, VARIANT_TWO_DEVELOPMENT_SEEDS, VARIANT_TWO_RESERVED_FINAL_SEEDS,
  type VariantTwoProtocol, type VariantTwoSnapshot, type VariantTwoBranch } from "../src/evolution/variant-two-experiment";

const run = process.argv.find(a => a.startsWith("--run="))?.slice(6) ?? "paired-002";
assert.match(run, /^paired-\d{3}$/);
const root=`results/variants/variant-2/${run}`,source="results/variants/variant-1/final";
const branch=process.argv[2] as VariantTwoBranch;
if(!["prepare","scratch","transfer"].includes(branch))throw new Error("Usage: train-variant-two.ts prepare|scratch|transfer [--resume]");
const protocolFile=path.join(root,"protocol.json");
const sourceHash=(file:string)=>sha256(fs.readFileSync(`${source}/${file}`));
const codeFiles=["src/core/types.ts","src/core/world.ts","src/core/upstream.ts","src/core/variant-two-rules.ts","src/core/simulation.ts","src/core/observation.ts","src/core/sensor-version.ts","src/evolution/neat.ts","src/evolution/genome.ts","src/evolution/network.ts","src/evolution/trainer.ts","src/evolution/evaluation.ts","src/evolution/variant-two-transfer.ts","src/evolution/variant-two-experiment.ts","scripts/train-variant-two.ts"];
const codeHash=()=>sha256(codeFiles.map(f=>`${f}:${sha256(fs.readFileSync(f))}`).join("\n"));
const config:TrainingConfig={population:100,seed:VARIANT_TWO_SEED,simulation:structuredClone(VARIANT_TWO_CONFIG),
  trainingSeeds:16,autoCurriculum:false,profile:"robust-v2",observationVersion:9,evolutionParameters:VARIANT_TWO_PARAMETERS,
  fitnessObjective:"rows",fitnessRiskWeight:0,trainingSeedPrefix:VARIANT_TWO_TRAINING_PREFIX,
  trainingSeedStream:VARIANT_TWO_TRAINING_STREAM,trainingSeedStride:VARIANT_TWO_TRAINING_STRIDE,
  monitorSeeds:VARIANT_TWO_DEVELOPMENT_SEEDS.slice(0,16)};
if(branch as string ==="prepare"){
  assertVariantTwoSeedSeparation();
  const protocol:VariantTwoProtocol={format:"crossy-variant-two-pair",version:1,branches:["scratch","transfer"],population:100,
    trainingMaps:16,generationCap:64,seed:VARIANT_TWO_SEED,trainingSeedPrefix:VARIANT_TWO_TRAINING_PREFIX,
    trainingSeedStride:VARIANT_TWO_TRAINING_STRIDE,trainingSeedStream:VARIANT_TWO_TRAINING_STREAM,observationVersion:9,
    simulation:structuredClone(VARIANT_TWO_CONFIG),evolutionParameters:VARIANT_TWO_PARAMETERS,
    developmentSeeds:VARIANT_TWO_DEVELOPMENT_SEEDS,reservedFinalSeeds:VARIANT_TWO_RESERVED_FINAL_SEEDS,
    selection:{every:4,shortlist:5,metric:"mean-row"},
    source:{directory:source,checkpointSha256:sourceHash("checkpoint.json"),selectedSha256:sourceHash("selected.json"),
      cohortSha256:sourceHash("generations/00150.json.gz"),selectedGeneration:150,selectedGenome:14920,inheritedPhasePositions:1174},codeSha256:codeHash()};
  writeVariantTwoImmutable(protocolFile,JSON.stringify(protocol,null,2));
  console.log("Prepared paired experiment; final maps reserved and unopened.");process.exit(0);
}
const protocol=JSON.parse(fs.readFileSync(protocolFile,"utf8")) as VariantTwoProtocol,protocolHash=protocolSha256(protocol);
assert.equal(protocol.codeSha256,codeHash(),"Experiment code changed; preserve this run and declare a new protocol");
assert.equal(protocol.source.checkpointSha256,sourceHash("checkpoint.json"));
assert.equal(protocol.source.selectedSha256,sourceHash("selected.json"));
assert.equal(protocol.source.cohortSha256,sourceHash("generations/00150.json.gz"));
assert.deepEqual(protocol.simulation,config.simulation);
const directory=path.join(root,branch),release=acquireVariantTwoLock(directory,branch,protocolHash);
let stopping=false;process.on("SIGTERM",()=>{stopping=true;});process.on("SIGINT",()=>{stopping=true;});
try {
  let trainer:Trainer,snapshot:VariantTwoSnapshot,previous:string|null=null;
  if(process.argv.includes("--resume")){
    const saved=readVariantTwoSnapshot(directory,protocolHash,branch);snapshot=saved.snapshot;previous=saved.head.snapshotSha256;
    trainer=Trainer.restore(snapshot.checkpoint);
  }else{
    assert.equal(fs.existsSync(path.join(directory,"HEAD.json")),false,"Existing run requires --resume");
    trainer=new Trainer(config);
    if(branch==="transfer"){
      const parent=parseCheckpoint(fs.readFileSync(`${source}/checkpoint.json`,"utf8"));
      const cohort=parseEvolution<{contenders:Genome[]}>(gunzipSync(fs.readFileSync(`${source}/generations/00150.json.gz`)).toString()).contenders;
      assert.equal(cohort.length,100);assert.ok(cohort.some(g=>g.id===14920));
      trainer.neat.tracker=Innovations.load(parent.neat.tracker);
      trainer.neat.population=cohort.map(g=>upgradeToVariantTwo(g,trainer.neat.tracker,trainer.neat.rng));
      trainer.neat.nextId=Math.max(parent.neat.nextId,...cohort.map(g=>g.id+1));
      trainer.neat.species=[];trainer.neat.nextSpecies=1;trainer.neat.progress.clear();trainer.neat.generation=0;
    }
    snapshot={format:"crossy-variant-two-snapshot",version:1,branch,protocolSha256:protocolHash,previousSnapshotSha256:null,
      checkpoint:trainer.checkpoint(),selected:null,nominations:[],seconds:0,developmentEpisodes:0,knownRepeatedTrainingEpisodes:0};
    previous=commitVariantTwoSnapshot(directory,snapshot).snapshotSha256;
    writeVariantTwoAtomic(path.join(directory,"ancestry.json"),JSON.stringify({branch,newGenerations:0,
      initialization:branch==="scratch"?"Random minimal NEAT population; no inherited weights":"Actual100 generation150 Variant1 population; exact old weights/topology plus zero-weight new sensors; fitness/species history reset",
      inheritedPhasePositions:branch==="scratch"?0:1174,source:branch==="scratch"?null:protocol.source},null,2));
  }
  const started=performance.now(),priorSeconds=snapshot.seconds;
  for(let generation=trainer.generation;generation<protocol.generationCap&&!stopping;generation++){
    const record=trainer.runGeneration();
    const archived=archiveVariantTwoPopulation(directory,record.generation,record.contenders);
    record.cohortFile=`/training-cohorts/v2-${branch}/${path.basename(archived.file)}`;record.cohortHash=archived.hash;
    const all=record.contenders;
    if(record.generation===1||record.generation%protocol.selection.every===0||record.generation===protocol.generationCap){
      for(const g of all.slice(0,protocol.selection.shortlist)){
        const episodes=evaluateGenome(g,protocol.developmentSeeds,trainer.config.simulation),metrics=summarizeVariantTwo(episodes);
        snapshot.nominations.push({...metrics,generation:record.generation,genome:g.id});snapshot.developmentEpisodes+=episodes.length;
        if(!snapshot.selected||metrics.meanRow>snapshot.selected.meanRow)snapshot.selected={...metrics,generation:record.generation,genome:structuredClone(g),episodes};
      }
    }
    // Full100 are immutable in the archive; a small native history keeps checkpoints manageable.
    record.contenders=all.slice(0,5);
    snapshot={...snapshot,checkpoint:trainer.checkpoint(),previousSnapshotSha256:previous,seconds:priorSeconds+(performance.now()-started)/1000};
    previous=commitVariantTwoSnapshot(directory,snapshot).snapshotSha256;
    const preview={branch,generation:record.generation,genomes:all,seed:42,simulation:trainer.config.simulation,meanRow:snapshot.selected?.meanRow};
    writeVariantTwoAtomic(`public/variant-2/${branch}.json`,stringifyEvolution(preview));
    console.log(`${branch} generation=${record.generation}/64 trainMean=${record.meanRow.toFixed(2)} development=${snapshot.selected?.meanRow.toFixed(2)} bestGeneration=${snapshot.selected?.generation} episodes=${record.generation*1600} seconds=${snapshot.seconds.toFixed(1)}`);
  }
  writeVariantTwoAtomic(path.join(directory,"status.json"),JSON.stringify({status:stopping?"paused-at-generation-boundary":"completed-bounded-run",generation:trainer.generation,protocolSha256:protocolHash,updatedAt:new Date().toISOString(),finalMapsOpened:false}));
}finally{release();}
