/** Coupled neural-weight search; actual stored weights, unchanged observations/argmax. */
import fs from "node:fs";
import path from "node:path";
import { hash } from "../../src/core/rng";
import { GLOBAL_OFFSET } from "../../src/core/observation";
import { OUTPUT_START, cloneGenome, type Genome } from "../../src/evolution/genome";
import { evaluateGenome, mean } from "../../src/evolution/evaluation";
import { parseEvolution, stringifyEvolution } from "../../src/evolution/serialization";
import { WIDE_DEVELOPMENT_SEEDS } from "../../src/evolution/suites";

const source=process.argv[2]??".archive/results/variant-1/experiments/restarts/round-005";
const output=".archive/results/variant-1/experiments/coupled-output";
if(fs.existsSync(output))throw new Error("Output already exists");
fs.mkdirSync(output,{recursive:true});
const ancestor=parseEvolution<{genome:Genome}>(fs.readFileSync(path.join(source,"selected.json"),"utf8"));
const trainingSeeds=Array.from({length:128},(_,i)=>hash(329121,i,61)&0x3fffffff);
const config={curriculum:"roads"as const,maxTicks:36000,difficulty:1};
const ledger:Record<string,unknown>[]=[],started=performance.now();
let selected:object={},selectedMean=-Infinity;
for(const scale of [1,.98,.95,.9,.85,.8,.7,1.025,1.05,1.1]){
 const genome=cloneGenome(ancestor.genome);
 for(const c of genome.connections){
  if(c.to<OUTPUT_START||c.to>=OUTPUT_START+5)continue;
  if(c.from===GLOBAL_OFFSET+3+c.to-OUTPUT_START)continue;
  c.weight=Math.max(-8,Math.min(8,c.weight*scale));
 }
 const training=evaluateGenome(genome,trainingSeeds,config);
 const episodes=evaluateGenome(genome,WIDE_DEVELOPMENT_SEEDS,config);
 const meanRow=mean(episodes.map(e=>e.score));
 const candidate={genome,generation:0,criterion:meanRow,meanRow,mean192:mean(episodes.slice(0,192).map(e=>e.score)),episodes,scale,
  trainingMean:mean(training.map(e=>e.score)),method:"coupled-neural-output-weight-search",ancestry:{source},validationSeeds:WIDE_DEVELOPMENT_SEEDS};
 if(meanRow>selectedMean){selected=candidate;selectedMean=meanRow;}
 fs.writeFileSync(path.join(output,`scale-${scale}.json`),stringifyEvolution(candidate));
 fs.writeFileSync(path.join(output,"selected.json"),stringifyEvolution(selected));
 ledger.push({scale,trainingMean:candidate.trainingMean,meanRow,mean192:candidate.mean192});
 fs.writeFileSync(path.join(output,"summary.json"),JSON.stringify({source,config,trainingSeeds,ledger,trainingEpisodes:ledger.length*128,
  developmentEpisodes:ledger.length*768,seconds:(performance.now()-started)/1000,selection:"Highest768-mapdevelopmentmean. This is neural parameter search, not NEAT topology evolution. Final maps unused."},null,2));
 console.log(`output scale=${scale} train128=${candidate.trainingMean.toFixed(2)} dev768=${meanRow.toFixed(2)} dev192=${candidate.mean192.toFixed(2)} best=${selectedMean.toFixed(2)}`);
 await new Promise<void>(resolve=>setImmediate(resolve));
}
