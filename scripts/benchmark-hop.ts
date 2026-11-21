/** Exact trace audit + alternating end-to-end timing of the clear-hop broad phase. */
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { GameSimulation } from "../src/core/simulation";
import { observation } from "../src/core/observation";
import { Network } from "../src/evolution/network";
import { type Genome } from "../src/evolution/genome";
import { parseEvolution } from "../src/evolution/serialization";
import { mean } from "../src/evolution/evaluation";
import { ReferenceSimulation } from "../src/tests/fixtures/reference-simulation";
const sources=process.argv.slice(2);
if(!sources.length)sources.push("results/continued/selected.json","results/experiments/evolution/lookahead-ancestor/selected.json");
const config={curriculum:"roads"as const,maxTicks:36000,difficulty:1};
const seeds=Array.from({length:32},(_,i)=>(0xa1000000+i*65537)>>>0);
const results=[];
for(const source of sources){
 const {genome}=parseEvolution<{genome:Genome}>(fs.readFileSync(source,"utf8"));
 const digest=createHash("sha256");let decisions=0;
 for(const seed of seeds.slice(0,12)){
  const fast=new GameSimulation(config,seed),frozen=new ReferenceSimulation(config,seed),a=new Network(genome),b=new Network(genome);
  while(fast.agent.alive){
   const oa=observation(fast.world,fast.agent,fast.tick,a.observationVersion,a.requiredInputs),
    ob=observation(frozen.world,frozen.agent,frozen.tick,b.observationVersion,b.requiredInputs);
   assert.deepEqual(oa,ob);const action=a.decide(oa),expected=b.decide(ob);
   assert.equal(action,expected);assert.deepEqual(a.scores,b.scores);
   assert.deepEqual(fast.step(action,false),frozen.step(expected,false));
   assert.deepEqual(fast.agent,frozen.agent);assert.equal(fast.tick,frozen.tick);
   digest.update(JSON.stringify([fast.tick,fast.agent,Array.from(a.scores)]));decisions++;
  }
  assert.deepEqual(fast.getState(),frozen.getState());
 }
 let expected:unknown;
 function run(tickOnly:boolean){
  const started=performance.now(),outcomes=[];
  for(const seed of seeds){
   const sim=new GameSimulation(config,seed),network=new Network(genome);
   // A benchmark-only instance override keeps the preexisting tick path intact.
   if(tickOnly)Object.defineProperty(sim,"roadHopIsClear",{value:()=>false});
   while(sim.agent.alive)sim.step(network.decide(sim.getObservation(network.observationVersion,network.requiredInputs)),false);
   outcomes.push({seed,ticks:sim.tick,agent:sim.agent});
  }
  const seconds=(performance.now()-started)/1000;
  if(expected)assert.deepEqual(outcomes,expected);else expected=outcomes;
  return seconds;
 }
 run(true);run(false);
 const tickSeconds:number[]=[],hopSeconds:number[]=[];
 for(let round=0;round<4;round++)for(const tickOnly of round%2?[false,true]:[true,false])
  (tickOnly?tickSeconds:hopSeconds).push(run(tickOnly));
 const result={source,genome:genome.id,observationVersion:genome.observationVersion??1,exactEpisodes:12,exactDecisions:decisions,
  traceSha256:digest.digest("hex"),timedEpisodesPerRound:32,tickSeconds,hopSeconds,speedup:mean(tickSeconds)/mean(hopSeconds)};
 results.push(result);console.log(result);
 fs.writeFileSync("results/experiments/hop-benchmark.json",JSON.stringify({config,seeds,results,
  note:"Frozen original physics traces match exactly using the same current sensor encoder on both worlds (including version5). Timing compares the existing scalar per-tick path with the new conservative clear-hop broad phase; alternating order, warmups excluded, concurrent training load."},null,2));
 await new Promise<void>(resolve=>setImmediate(resolve));
}
