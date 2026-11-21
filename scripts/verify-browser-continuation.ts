/** Compare an exported browser continuation with independent native records and populations. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution } from "../src/evolution/serialization";
import { type Genome } from "../src/evolution/genome";

const [root,exportFile,archives,nextCheckpointFile] = process.argv.slice(2);
if (!root || !exportFile || !archives) throw new Error("Usage: release-directory browser-export native-generation-directory [native-final-checkpoint]");
const browser = parseCheckpoint(fs.readFileSync(exportFile,"utf8"));
const source = parseCheckpoint(fs.readFileSync(path.join(root,"checkpoint.json"),"utf8"));
const reference = JSON.parse(fs.readFileSync(path.join(root,"browser-continuation-reference.json"),"utf8"));
assert.equal(browser.generation,source.generation+reference.length);
assert.deepEqual(browser.config,source.config);
let numbers=0,maxDifference=0,fullGenomesCompared=0;
function compare(a:unknown,b:unknown,label:string) {
  if(typeof a==="number"&&typeof b==="number"){
    const delta=Math.abs(a-b);maxDifference=Math.max(maxDifference,delta);numbers++;
    assert.ok(delta<=1e-9,`${label}: ${delta}`);return;
  }
  if(a&&b&&typeof a==="object"&&typeof b==="object"){
    assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),label);
    for(const key of Object.keys(a))compare(Reflect.get(a,key),Reflect.get(b,key),`${label}.${key}`);
    return;
  }
  assert.equal(a,b,label);
}
for(let i=0;i<source.generation;i++){
  const actual=browser.history[i],original=source.history[i];
  compare({generation:actual.generation,champion:actual.champion,bestFitness:actual.bestFitness,
    meanRow:actual.meanRow,evalRow:actual.evalRow,seeds:actual.seeds},
  {generation:original.generation,champion:original.champion,bestFitness:original.bestFitness,
    meanRow:original.meanRow,evalRow:original.evalRow,seeds:original.seeds},`prior generation ${i+1}`);
}
const checked=[];
for(const expected of reference){
  const r=browser.history[expected.generation-1];
  const actual={generation:r.generation,champion:r.champion.id,bestFitness:r.bestFitness,
    meanRow:r.meanRow,evalRow:r.evalRow,species:r.species,nodes:r.nodes,connections:r.connections,
    population:r.contenders.length};
  compare(actual,expected,`generation ${r.generation}`);
  assert.equal(r.contenders.length,source.config.population);
  const native=parseEvolution<{contenders:Genome[]}>(gunzipSync(fs.readFileSync(path.join(
    archives,`${String(r.generation).padStart(5,"0")}.json.gz`))).toString()).contenders;
  const byId=new Map(native.map(g=>[g.id,g]));
  assert.equal(byId.size,source.config.population);
  for(const g of r.contenders){compare(g,byId.get(g.id),`genome ${g.id}`);fullGenomesCompared++;}
  checked.push(actual);
}
if(nextCheckpointFile){
  const native=parseCheckpoint(fs.readFileSync(nextCheckpointFile,"utf8"));
  assert.equal(native.generation,browser.generation);
  assert.deepEqual(native.config,browser.config);
  compare(browser.neat,native.neat,"next breeding state");
}
const result={verifiedAt:new Date().toISOString(),sourceGeneration:source.generation,
  browserGeneration:browser.generation,population:source.config.population,newGenerations:checked,
  previousHistoryUnchanged:true,fullGenomesCompared,numericValuesCompared:numbers,
  maxAbsoluteDifference:maxDifference,tolerance:1e-9,exportCharacters:fs.statSync(exportFile).size,
  nextBreedingStateVerified:Boolean(nextCheckpointFile),nextPopulationGenomesCompared:nextCheckpointFile?browser.neat.population.length:0,
  note:"Browser continuation matches independent CLI records and complete native population archives. These are training/monitor checks; they do not select a final policy."};
fs.writeFileSync(path.join(root,"browser-validation.json"),JSON.stringify(result,null,2));
console.log(result);
