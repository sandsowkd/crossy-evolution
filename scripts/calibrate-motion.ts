/** Sensor calibration ablation: actions still come directly from the same network. */
import fs from "node:fs";
import { hash } from "../src/core/rng";
import { GLOBAL_OFFSET } from "../src/core/observation";
import { Network } from "../src/evolution/network";
import { episode, mean } from "../src/evolution/evaluation";
import { type Genome } from "../src/evolution/genome";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { EXPERIMENT_VALIDATION_SEEDS } from "../src/evolution/suites";
const input=process.argv[2]??"results/experiments/restarts/round-001/selected.json";
const {genome}=parseEvolution<{genome:Genome}>(fs.readFileSync(input,"utf8"));
const trainingSeeds=Array.from({length:128},(_,i)=>hash(142924,i,921)&0x3fffffff);
const results=[];
for(const gain of [.75,.85,.9,.95,1,1.025,1.05,1.075,1.1,1.15,1.25,1.5]){
 const n=new Network(genome);
 const policy=(o:Float32Array)=>{
  for(let i=3;i<8;i++)o[GLOBAL_OFFSET+i]=Math.min(1,o[GLOBAL_OFFSET+i]*gain);
  return n.decide(o);
 };
 const training=trainingSeeds.map(seed=>episode(policy,seed,{curriculum:"roads",maxTicks:36000,difficulty:1},undefined,n));
 const validation=EXPERIMENT_VALIDATION_SEEDS.map(seed=>episode(policy,seed,{curriculum:"roads",maxTicks:36000,difficulty:1},undefined,n));
 const result={gain,trainingMean:mean(training.map(e=>e.score)),meanRow:mean(validation.map(e=>e.score)),atLeast1000:validation.filter(e=>e.score>=1000).length/192,episodes:validation};
 results.push(result);console.log({gain,train128:result.trainingMean,validation192:result.meanRow,atLeast1000:result.atLeast1000});
 fs.writeFileSync("results/experiments/motion-calibration.json",stringifyEvolution({input,genome,trainingSeeds,validationSeeds:EXPERIMENT_VALIDATION_SEEDS,method:"Multiply motion-proximity sensor channels byconstantgain,clipto[0,1]. Neuralweights/actionsunchanged. Exploratory calibration, notyetnativegenomemetadata.",results}));
}
