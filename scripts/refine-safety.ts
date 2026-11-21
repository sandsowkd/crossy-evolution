/** Experimental supervised refinement of a NEAT genome, labeled separately from NEAT generations.
 * Simulator counterfactuals generate training targets only; runtime inference stays neural argmax.
 */
import fs from "node:fs";
import path from "node:path";
import { GameSimulation } from "../src/core/simulation";
import { hash, RNG } from "../src/core/rng";
import { ACTIONS, type AgentState, type Config } from "../src/core/types";
import { Network } from "../src/evolution/network";
import { cloneGenome, OUTPUT_START, type Genome } from "../src/evolution/genome";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { evaluateGenome, mean } from "../src/evolution/evaluation";
import { WIDE_DEVELOPMENT_SEEDS } from "../src/evolution/suites";

const source=process.argv[2]??"results/experiments/restarts/round-005";
const rounds=Number(process.argv[3]??12),output="results/experiments/safety-refinement";
if(fs.existsSync(output))throw new Error("Refinement exists; preserve it and use a new directory before repeating");
if(!Number.isInteger(rounds)||rounds<1)throw new Error("Invalid round count");
fs.mkdirSync(output,{recursive:true});
const ancestor=parseEvolution<{genome:Genome;generation:number}>(fs.readFileSync(path.join(source,"selected.json"),"utf8"));
const config:Config={curriculum:"roads",maxTicks:36000,difficulty:1};
const temperature=2;
type Sample={observation:Float32Array;target:number[]};
type Snapshot={agent:AgentState;tick:number;observation:Float32Array;scores:number[];action:number};
function probability(scores:ArrayLike<number>,allowed?:boolean[]):number[]{
 const maximum=Math.max(...Array.from(scores).filter((_,i)=>!allowed||allowed[i]));
 const exp=Array.from(scores,(s,i)=>(!allowed||allowed[i])?Math.exp((s-maximum)/temperature):0);
 const sum=exp.reduce((a,b)=>a+b,0);return exp.map(v=>v/sum);
}
function collect(genome:Genome,round:number){
 const hard:Sample[]=[],anchors:Sample[]=[],seeds:number[]=[];
 let counterfactuals=0,trainingEpisodes=0;
 for(let map=0;map<64;map++){
  const seed=hash(849217,(round-1)*64+map,451)&0x3fffffff;seeds.push(seed);
  const sim=new GameSimulation(config,seed),network=new Network(genome),recent:Snapshot[]=[];
  let decisions=0;
  while(sim.agent.alive){
   const observation=sim.getObservation(network.observationVersion,network.requiredInputs);
   const action=ACTIONS.indexOf(network.decide(observation));
   const snapshot:Snapshot={agent:{...sim.agent},tick:sim.tick,observation,scores:Array.from(network.scores),action};
   recent.push(snapshot);if(recent.length>8)recent.shift();
   if(decisions++%32===0)anchors.push({observation,target:probability(snapshot.scores)});
   sim.step(ACTIONS[action],false);
  }
  trainingEpisodes++;
  if(sim.agent.deathReason!=="car"&&sim.agent.deathReason!=="train"&&sim.agent.deathReason!=="bounds")continue;
  for(const snapshot of recent){
   const allowed=ACTIONS.map(action=>{
    const fork=new GameSimulation(config,seed);fork.tick=snapshot.tick;fork.agent={...snapshot.agent};fork.step(action,false);counterfactuals++;
    return fork.agent.alive||fork.agent.deathReason==="timeout";
   });
   if(allowed.every(Boolean)||!allowed.some(Boolean))continue;
   // Keep the original relative preferences among surviving alternatives.
   const sample={observation:snapshot.observation,target:probability(snapshot.scores,allowed)};
   hard.push(sample);
   if(!allowed[snapshot.action])hard.push(sample,sample,sample);
  }
 }
 return{hard,anchors,seeds,counterfactuals,trainingEpisodes};
}
function refine(genome:Genome,hard:Sample[],anchors:Sample[],learningRate:number,seed:number){
 const g=cloneGenome(genome),network=new Network(g),rng=new RNG(seed);
 const order=g.nodes.filter(n=>n.depth>0).sort((a,b)=>b.depth-a.depth||b.id-a.id);
 const incoming=new Map<number,number[]>();
 g.connections.forEach((c,i)=>{if(c.enabled){const list=incoming.get(c.to)??[];list.push(i);incoming.set(c.to,list);}});
 const first=new Float64Array(g.connections.length),second=new Float64Array(g.connections.length),original=g.connections.map(c=>c.weight);
 // Network compiles edge values, so refresh it for every minibatch after weights change.
 let compiled=network;
 for(let batch=1;batch<=300&&hard.length;batch++){
  const gradient=new Float64Array(g.connections.length);
  for(let sample=0;sample<32;sample++){
   const data=sample%2?rng.pick(hard):rng.pick(anchors),scores=compiled.activate(data.observation);
   const predicted=probability(scores),delta=new Float64Array(compiled.values.length);
   for(let a=0;a<5;a++)delta[OUTPUT_START+a]=(predicted[a]-data.target[a])/temperature;
   for(const node of order){
    const derivative=delta[node.id]*(node.kind==="hidden"?1-compiled.values[node.id]**2:1);
    for(const i of incoming.get(node.id)??[]){
     const edge=g.connections[i];gradient[i]+=derivative*compiled.values[edge.from]/32;
     delta[edge.from]+=derivative*edge.weight;
    }
   }
  }
  for(let i=0;i<g.connections.length;i++){
   const c=g.connections[i];if(!c.enabled)continue;
   const grad=gradient[i]+.01*(c.weight-original[i]);
   first[i]=.9*first[i]+.1*grad;second[i]=.999*second[i]+.001*grad*grad;
   const step=learningRate*(first[i]/(1-.9**batch))/(Math.sqrt(second[i]/(1-.999**batch))+1e-8);
   c.weight=Math.max(-8,Math.min(8,c.weight-step));
  }
  compiled=new Network(g);
 }
 return g;
}
function assess(genome:Genome){
 const episodes=evaluateGenome(genome,WIDE_DEVELOPMENT_SEEDS,config);
 return{meanRow:mean(episodes.map(e=>e.score)),mean192:mean(episodes.slice(0,192).map(e=>e.score)),episodes};
}
let best={genome:cloneGenome(ancestor.genome),generation:0,criterion:0,...assess(ancestor.genome)};best.criterion=best.meanRow;
const ledger:Record<string,unknown>[]=[],started=performance.now();
fs.copyFileSync(path.join(source,"checkpoint.json"),path.join(output,"ancestor-checkpoint.json"));
fs.writeFileSync(path.join(output,"selected.json"),stringifyEvolution({...best,method:"supervised-safety-refinement-v1",ancestry:{source},validationSeeds:WIDE_DEVELOPMENT_SEEDS}));
for(let round=1;round<=rounds;round++){
 const data=collect(best.genome,round),learningRate=[.0003,.001,.003][(round-1)%3];
 const genome=refine(best.genome,data.hard,data.anchors,learningRate,94321+round),assessment=assess(genome);
 const improved=assessment.meanRow>best.meanRow;
 if(improved)best={genome,generation:0,criterion:assessment.meanRow,...assessment};
 fs.writeFileSync(path.join(output,`candidate-${String(round).padStart(3,"0")}.json`),stringifyEvolution({genome,round,method:"supervised-safety-refinement-v1",...assessment}));
 ledger.push({round,learningRate,trainingSeeds:data.seeds,trainingEpisodes:data.trainingEpisodes,counterfactualHops:data.counterfactuals,
  unsafeTargetSamples:data.hard.length,retentionSamples:data.anchors.length,minibatches:300,batchSize:32,meanRow:assessment.meanRow,mean192:assessment.mean192,improved});
 fs.writeFileSync(path.join(output,"selected.json"),stringifyEvolution({...best,method:"supervised-safety-refinement-v1",ancestry:{source},validationSeeds:WIDE_DEVELOPMENT_SEEDS,
  selectionRule:"Highest mean on768developmentmaps. Counterfactual supervision uses only lower30-bittrainingmaps. This phase is not NEAT topology evolution."}));
 fs.writeFileSync(path.join(output,"training-summary.json"),JSON.stringify({method:"supervised-safety-refinement-v1",source,config,rounds:ledger,
  fullTrainingEpisodes:ledger.reduce((n,r)=>n+Number(r.trainingEpisodes),0),counterfactualHops:ledger.reduce((n,r)=>n+Number(r.counterfactualHops),0),
  developmentEpisodes:(round+1)*768,seconds:(performance.now()-started)/1000,selectedMeanRow:best.meanRow},null,2));
 console.log(`safety round=${round} targets=${data.hard.length} candidate768=${assessment.meanRow.toFixed(2)} candidate192=${assessment.mean192.toFixed(2)} best768=${best.meanRow.toFixed(2)} improved=${improved}`);
 await new Promise<void>(resolve=>setImmediate(resolve));
}
