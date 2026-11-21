/** Development-only sensor experiment. No candidate becomes a native policy until versioned. */
import fs from "node:fs";
import { parseEvolution } from "../src/evolution/serialization";
import { type Genome } from "../src/evolution/genome";
import { Network } from "../src/evolution/network";
import { GameSimulation } from "../src/core/simulation";
import { hash } from "../src/core/rng";
import { GLOBAL_OFFSET } from "../src/core/observation";
import { ACTIONS, DELTA, DT, HOP_TICKS, HALF_WIDTH, TRAFFIC_LOOP } from "../src/core/types";
import { hazardsAt } from "../src/core/world";
import { mean } from "../src/evolution/evaluation";
import { WIDE_DEVELOPMENT_SEEDS } from "../src/evolution/suites";

const source=process.argv[2]??"results/experiments/restarts/round-005/selected.json";
const {genome}=parseEvolution<{genome:Genome}>(fs.readFileSync(source,"utf8"));
if(genome.observationVersion!==3)throw new Error("Calibration expects the motion-v3 ancestor");
const trainingSeeds=Array.from({length:128},(_,i)=>hash(56491,i,17)&0x3fffffff);
const rows:Record<string,unknown>[]=[];
const started=performance.now();
for(const support of [.35,.4,.45,.5,.55,.65,.8,1]){
 const results:number[][]=[];
 for(const seeds of [trainingSeeds,WIDE_DEVELOPMENT_SEEDS]){
  const scores:number[]=[];
  for(const seed of seeds){
   const sim=new GameSimulation({curriculum:"roads",maxTicks:36000,difficulty:1},seed),network=new Network(genome);
   while(sim.agent.alive){
    const o=sim.getObservation(3,network.requiredInputs),cx=Math.round(sim.agent.x),cy=Math.round(sim.agent.row);
    const visible=[-2,-1,0,1,2].flatMap(dy=>hazardsAt(sim.world.row(cy+dy),sim.tick)).filter(h=>Math.abs(h.x-cx)<=4.5+h.length/2);
    for(let action=0;action<5;action++){
     const [dx,dy]=DELTA[ACTIONS[action]],tx=cx+dx,ty=cy+dy;
     if(Math.abs(tx)>HALF_WIDTH||ty<0||sim.world.row(ty).blocked.includes(tx)){o[GLOBAL_OFFSET+3+action]=1;continue;}
     let closest=Infinity;
     for(const h of visible){
      if(h.row<Math.min(cy,ty)-.61-support||h.row>Math.max(cy,ty)+.61+support)continue;
      for(const shift of h.kind==="car"?[-TRAFFIC_LOOP,0,TRAFFIC_LOOP]:[0]){
       const start=h.x+shift,end=start+h.speed*HOP_TICKS*DT,bound=h.length/2+.22+support;
       if(Math.min(cx,tx)-Math.max(start,end)>bound+1e-12||Math.min(start,end)-Math.max(cx,tx)>bound+1e-12)continue;
       for(let sample=0;sample<=8;sample++){
        const f=sample/8,x=cx+dx*f,y=cy+dy*f,hx=h.x+shift+h.speed*HOP_TICKS*DT*f;
        closest=Math.min(closest,Math.max(Math.abs(x-hx)-h.length/2-.22,Math.abs(y-h.row)-.61));
       }
      }
     }
     const risk=Math.max(0,Math.min(1,1-closest/support));
     if(support===.35&&network.requiredInputs[GLOBAL_OFFSET+3+action]&&Math.fround(risk)!==o[GLOBAL_OFFSET+3+action])throw new Error("Baseline motion sensor mismatch");
     o[GLOBAL_OFFSET+3+action]=risk;
    }
    sim.step(network.decide(o),false);
   }
   scores.push(sim.agent.maxRow);
  }
  results.push(scores);
 }
 const [train,development]=results;
 rows.push({support,visibleRowRadius:2,trainingMean:mean(train),development768Mean:mean(development),development192Mean:mean(development.slice(0,192)),trainingScores:train,developmentScores:development});
 fs.writeFileSync("results/experiments/extended-motion-calibration.json",JSON.stringify({source,trainingSeeds,developmentSeeds:WIDE_DEVELOPMENT_SEEDS,
  method:"Frozen learned weights; local motion-sensor support/range calibration. Native metadata not yet assigned. Development data only; no final tests.",rows,seconds:(performance.now()-started)/1000},null,2));
 console.log(`support=${support} train128=${mean(train).toFixed(2)} dev768=${mean(development).toFixed(2)} dev192=${mean(development.slice(0,192)).toFixed(2)}`);
 await new Promise<void>(resolve=>setImmediate(resolve));
}
