import assert from "node:assert/strict";
import fs from "node:fs";
import { INPUT_COUNT } from "../../src/core/observation";
import { Network } from "../../src/evolution/network";
import { parseEvolution } from "../../src/evolution/serialization";
import { type Genome } from "../../src/evolution/genome";
import { episode,mean,type Episode } from "../../src/evolution/evaluation";
const sources=[".archive/results/variant-1/continued/selected.json",".archive/results/variant-1/previews/long-dev-wide-restarts-round-001/selected.json"];
const seeds=Array.from({length:64},(_,i)=>(0xa1000000+i*65537)>>>0),results=[];
const config={curriculum:"roads"as const,maxTicks:36000,difficulty:1};
for(const source of sources){
 const {genome}=parseEvolution<{genome:Genome}>(fs.readFileSync(source,"utf8"));
 let reference:Episode[]|undefined;
 function run(reuse:boolean){
  const network=new Network(genome),buffer=reuse?new Float32Array(INPUT_COUNT):undefined,started=performance.now();
  const episodes=seeds.map(seed=>episode(o=>network.decide(o),seed,config,undefined,network,network.observationVersion,buffer));
  const seconds=(performance.now()-started)/1000;
  if(reference)assert.deepEqual(episodes,reference);else reference=episodes;
  return seconds;
 }
 run(false);run(true);
 const freshSeconds:number[]=[],reusedSeconds:number[]=[];
 for(let round=0;round<6;round++)for(const reuse of round%2?[true,false]:[false,true])
  (reuse?reusedSeconds:freshSeconds).push(run(reuse));
 results.push({source,genome:genome.id,observationVersion:genome.observationVersion??1,episodesPerRound:64,freshSeconds,reusedSeconds,
  speedup:mean(freshSeconds)/mean(reusedSeconds),outcomes:reference});
 console.log({source,speedup:mean(freshSeconds)/mean(reusedSeconds)});
 fs.writeFileSync(".archive/results/variant-1/experiments/buffer-benchmark.json",JSON.stringify({config,seeds,results,
  note:"Same clear-hop physics, encoder and neural policy. Only explicit observation-array reuse differs. Warmups excluded; alternating order; concurrent training load. Every per-map outcome is identical."},null,2));
 await new Promise<void>(resolve=>setImmediate(resolve));
}
