import fs from "node:fs";
import { parseEvolution } from "../src/evolution/serialization";
import { type Genome } from "../src/evolution/genome";
import { Network } from "../src/evolution/network";
import { GameSimulation } from "../src/core/simulation";
import { EXPERIMENT_VALIDATION_SEEDS } from "../src/evolution/suites";
import { mean } from "../src/evolution/evaluation";
const input=process.argv[2]??"results/experiments/evolution/v3-ancestor/selected.json";
const {genome}=parseEvolution<{genome:Genome}>(fs.readFileSync(input,"utf8"));
const episodes:{seed:number;score:number;death?:string;x:number;row:number;tick:number;stalledTicks:number;actions:Record<string,number>;blocked:number}[]=[];
for(const seed of EXPERIMENT_VALIDATION_SEEDS){
 const s=new GameSimulation({curriculum:"roads",maxTicks:36000,difficulty:1},seed),n=new Network(genome);
 const actions:Record<string,number>={};let lastProgress=0,blocked=0,lastRow=0;
 while(s.agent.alive){
  const a=n.decide(s.getObservation(n.observationVersion,n.requiredInputs));actions[a]=(actions[a]??0)+1;
  s.step(a,false);if(s.agent.maxRow>lastRow){lastProgress=s.tick;lastRow=s.agent.maxRow;}
  if(s.agent.blocked)blocked++;
 }
 episodes.push({seed,score:s.agent.maxRow,death:s.agent.deathReason,x:s.agent.x,row:s.agent.row,tick:s.tick,stalledTicks:s.tick-lastProgress,actions,blocked});
}
const deaths=Object.fromEntries([...new Set(episodes.map(e=>e.death))].map(death=>[death,episodes.filter(e=>e.death===death).length]));
const actions:Record<string,number>={};for(const e of episodes)for(const[a,c]of Object.entries(e.actions))actions[a]=(actions[a]??0)+c;
const result={input,genome:genome.id,meanRow:mean(episodes.map(e=>e.score)),deaths,actions,stalledTimeouts:episodes.filter(e=>e.death==="timeout"&&e.stalledTicks>3000).length,progressingTimeouts:episodes.filter(e=>e.death==="timeout"&&e.stalledTicks<=3000).length,episodes};
fs.writeFileSync("results/experiments/policy-inspection.json",JSON.stringify(result,null,2));
console.log({...result,episodes:undefined});
