import fs from "node:fs";
import assert from "node:assert/strict";
import { hash } from "../../src/core/rng";
import { parseEvolution } from "../../src/evolution/serialization";
import { parseCheckpoint } from "../../src/evolution/checkpoint";
import type { Checkpoint } from "../../src/evolution/trainer";
import { stringifyEvolution } from "../../src/evolution/serialization";
import { sha256, writeVariantTwoImmutable } from "../../src/evolution/variant-two-experiment";

const [source,run,mapsText="32",generationsText="128"]=process.argv.slice(2);
assert.match(run,/^transfer-[a-z0-9-]{1,48}$/);
const maps=Number(mapsText),additional=Number(generationsText);
assert.ok(Number.isInteger(maps)&&maps>=1&&maps<=64&&Number.isInteger(additional)&&additional>0&&additional<=512);
const parent=JSON.parse(fs.readFileSync(`${source}/protocol.json`,"utf8"));
assert.equal(parent.format,"crossy-v2-continuation");
const files=[...fs.readdirSync("src/core").filter(f=>f.endsWith(".ts")).map(f=>`src/core/${f}`),
  ...fs.readdirSync("src/evolution").filter(f=>f.endsWith(".ts")).map(f=>`src/evolution/${f}`),"scripts/training/continue-variant-two.ts"].sort();
assert.equal(parent.codeSha256,sha256(files.map(f=>`${f}:${sha256(fs.readFileSync(f))}`).join("\n")),"Source version changed");
const head=JSON.parse(fs.readFileSync(`${source}/HEAD.json`,"utf8")),file=`${source}/snapshots/${String(head.generation).padStart(5,"0")}.json`;
const raw=fs.readFileSync(file,"utf8");assert.equal(sha256(raw),head.snapshotSha256);
const checkpoint=parseCheckpoint(stringifyEvolution(parseEvolution<{checkpoint:Checkpoint}>(raw).checkpoint));
const config=structuredClone(checkpoint.config);config.trainingSeeds=maps;config.trainingSeedStride=maps+5;
const oldSeeds=new Set(checkpoint.history.flatMap(record=>record.seeds));
const seeds=Array.from({length:additional},(_,g)=>Array.from({length:maps},(_,i)=>
  ((hash(config.seed,(checkpoint.generation+g)*config.trainingSeedStride!+i,config.trainingSeedStream!)&0x3fffffff)|config.trainingSeedPrefix!)>>>0)).flat();
const evaluation=new Set([...parent.developmentSeeds,...parent.confirmationDevelopmentSeeds,...parent.finalMapsReserved]);
assert.ok(seeds.every(seed=>!evaluation.has(seed)));
const protocol={...parent,run,initialization:"resume",initialGeneration:checkpoint.generation,generationCap:checkpoint.generation+additional,
  parent:{directory:source,snapshotFile:file,snapshotSha256:head.snapshotSha256,checkpointGeneration:checkpoint.generation},config,
  inheritedSearchTrainingEpisodes:parent.inheritedSearchTrainingEpisodes+(checkpoint.generation-parent.initialGeneration)*checkpoint.config.population*checkpoint.config.trainingSeeds,
  reusedInheritedTrainingMapPositions:seeds.filter(seed=>oldSeeds.has(seed)).length,duplicateNewTrainingMapPositions:seeds.length-new Set(seeds).size,
  intervention:{type:"training-map-budget",previousMaps:checkpoint.config.trainingSeeds,newMaps:maps,
    previousStride:checkpoint.config.trainingSeedStride,newStride:config.trainingSeedStride,weightsPopulationRngAndInnovationsPreserved:true}};
delete protocol.selectionOverride;
writeVariantTwoImmutable(`.archive/results/variant-2/${run}/protocol.json`,JSON.stringify(protocol,null,2));
console.log(JSON.stringify({run,maps,population:config.population,startingGeneration:checkpoint.generation,stoppingGeneration:protocol.generationCap}));
