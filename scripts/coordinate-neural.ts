/** Neural parameter search alongside NEAT; no action rules or safety shield. */
import fs from "node:fs";
import path from "node:path";
import { hash } from "../src/core/rng";
import { BIAS, OUTPUT_START, cloneGenome, type Genome } from "../src/evolution/genome";
import { GLOBAL_OFFSET } from "../src/core/observation";
import { evaluateGenome, mean, type Episode } from "../src/evolution/evaluation";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { EXPERIMENT_VALIDATION_SEEDS } from "../src/evolution/suites";

const output="results/experiments/coordinate";
const source="results/experiments/evolution/v3-ancestor";
const rounds=Number(process.argv[2]??8);
fs.mkdirSync(output,{recursive:true});
let current=parseEvolution<{genome:Genome}>(fs.readFileSync(`${source}/selected.json`,"utf8")).genome;
const simulation={curriculum:"roads" as const,maxTicks:36000,difficulty:1};
const initial=evaluateGenome(current,EXPERIMENT_VALIDATION_SEEDS,simulation);
let selected={genome:cloneGenome(current),generation:0,meanRow:mean(initial.map(e=>e.score)),criterion:mean(initial.map(e=>e.score)),episodes:initial};
const ledger:{round:number;trainingMean:number;validationMean:number;changed:string}[]=[];
let trainingEpisodes=0,validationEpisodes=192;
const started=performance.now();
function assess(g:Genome,seeds:number[]):{episodes:Episode[];score:number}{
  const episodes=evaluateGenome(g,seeds,simulation);
  return {episodes,score:mean(episodes.map(e=>e.score))};
}
for(let round=1;round<=rounds;round++){
  const seeds=Array.from({length:64},(_,i)=>hash(210043,round*101+i,173)&0x3fffffff);
  let best=assess(current,seeds),candidate=cloneGenome(current),changed="unchanged";
  trainingEpisodes+=seeds.length;
  const scale=round<=2?.8:round<=5?.4:.2;
  const edges=current.connections.filter(c=>c.enabled&&c.to>=OUTPUT_START&&c.to<OUTPUT_START+5&&
    (c.from===BIAS||c.from===GLOBAL_OFFSET||c.from===GLOBAL_OFFSET+1||c.from===GLOBAL_OFFSET+2||
     (c.from>=GLOBAL_OFFSET+3&&c.from<=GLOBAL_OFFSET+7&&c.to-OUTPUT_START===c.from-GLOBAL_OFFSET-3)));
  for(const edge of edges){
    for(const delta of [-scale,scale]){
      const g=cloneGenome(current);
      g.connections.find(c=>c.innovation===edge.innovation)!.weight=Math.max(-8,Math.min(8,edge.weight+delta));
      const result=assess(g,seeds);trainingEpisodes+=seeds.length;
      if(result.score>best.score){best=result;candidate=g;changed=`edge${edge.from}->${edge.to} delta${delta}`;}
    }
  }
  current=candidate;current.id=2000000+round;
  const validation=assess(current,EXPERIMENT_VALIDATION_SEEDS);validationEpisodes+=192;
  if(validation.score>selected.meanRow)selected={genome:cloneGenome(current),generation:round,criterion:validation.score,meanRow:validation.score,episodes:validation.episodes};
  ledger.push({round,trainingMean:best.score,validationMean:validation.score,changed});
  fs.writeFileSync(path.join(output,`round-${String(round).padStart(3,"0")}.json`),stringifyEvolution({genome:current,trainingSeeds:seeds,trainingEpisodes:best.episodes}));
  fs.writeFileSync(path.join(output,"selected.json"),stringifyEvolution({...selected,validationSeeds:EXPERIMENT_VALIDATION_SEEDS,selectionMetric:"mean-row-v1",method:"Coordinate refinement of learned neural weights; five argmax actions remain unfiltered",ancestry:{source,selectedGeneration:30,selectedGenome:2978}}));
  fs.writeFileSync(path.join(output,"summary.json"),JSON.stringify({method:"coordinate-neural",rounds:round,trainingEpisodes,validationEpisodes,seconds:(performance.now()-started)/1000,ledger},null,2));
  console.log(`round${round} train64=${best.score.toFixed(1)} validation192=${validation.score.toFixed(1)} best=${selected.meanRow.toFixed(1)} changed=${changed}`);
}
