/** Post-selection verification and signal ablation. Never selects or trains a policy. */
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseCheckpoint } from "../../src/evolution/checkpoint";
import { parseEvolution } from "../../src/evolution/serialization";
import { type Genome } from "../../src/evolution/genome";
import { episode,mean,type Episode } from "../../src/evolution/evaluation";
import { Network } from "../../src/evolution/network";
import { GLOBAL_OFFSET } from "../../src/core/observation";
import { ACTIONS,DELTA } from "../../src/core/types";
import { RNG } from "../../src/core/rng";
const input=process.argv[2];if(!input)throw new Error("Provide a frozen evaluated model");
const manifest=JSON.parse(fs.readFileSync(`${input}/freeze.json`,"utf8"));
const checkpointText=fs.readFileSync(`${input}/checkpoint.json`,"utf8"),checkpoint=parseCheckpoint(checkpointText);
assert.equal(createHash("sha256").update(checkpointText).digest("hex"),manifest.checkpointSha256);
const {genome}=parseEvolution<{genome:Genome}>(fs.readFileSync(`${input}/selected.json`,"utf8"));
const fingerprint=createHash("sha256").update(JSON.stringify({version:genome.observationVersion??1,nodes:genome.nodes,connections:genome.connections})).digest("hex");
assert.equal(fingerprint,manifest.policySha256);assert.ok(genome.observationVersion===5||genome.observationVersion===8);
const observationVersion=genome.observationVersion;
const evaluation=JSON.parse(fs.readFileSync(`${input}/evaluation.json`,"utf8"));
const seeds:number[]=evaluation.evaluationSeeds,scores:Episode[]=evaluation.episodes.neat;
assert.equal(seeds.length,512);assert.deepEqual(seeds,scores.map(e=>e.seed));
assert.equal(mean(scores.map(e=>e.score)),evaluation.summary.neat.meanRow);
const rng=new RNG(81213),bootstrap=Array.from({length:5000},()=>mean(Array.from({length:512},()=>rng.pick(scores).score))).sort((a,b)=>a-b);
const blind:Episode[]=[];
for(const seed of seeds){
 const network=new Network(genome);
 blind.push(episode(o=>{
  // Remove traffic position/proximity/warnings while retaining terrain,
  // lane velocity, bounds and static-tree information in every action risk.
  for(let cell=0;cell<72;cell++){o[cell*9+4]=0;o[cell*9+6]=0;o[cell*9+7]=0;}
  o[GLOBAL_OFFSET+1]=0;if(observationVersion===5)o[GLOBAL_OFFSET+9]=0;
  for(let action=0;action<5;action++){
   const [dx,dy]=DELTA[ACTIONS[action]],cell=((dy+2)*9+dx+4)*9;
   o[GLOBAL_OFFSET+3+action]=+(o[cell+3]>.5||o[cell+8]>.5);
  }
  return network.decide(o);
 },seed,checkpoint.config.simulation,undefined,undefined,observationVersion));
}
const result={kind:"post-selection verification",frozenAt:manifest.frozenAt,verifiedAt:new Date().toISOString(),policySha256:fingerprint,
 checkpointUnchanged:true,testEpisodes:512,meanRow:evaluation.summary.neat.meanRow,meanBootstrap95:[bootstrap[125],bootstrap[4874]],
 goalReached:evaluation.summary.neat.meanRow>=1000,trafficPositionBlindMean:mean(blind.map(e=>e.score)),trafficPositionBlindEpisodes:blind,
 note:"The same frozen model is tested with traffic locations/proximities removed. Static bounds, trees, lane type/direction remain. No action override or physics change. Interval describes map variation for one frozen policy, not independent training-seed variation."};
fs.writeFileSync(`${input}/verification.json`,JSON.stringify(result,null,2));console.log({...result,trafficPositionBlindEpisodes:undefined});
