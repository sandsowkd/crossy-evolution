/** Audit saved training contenders on the wider development panel, preserving their real generation. */
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { parseCheckpoint } from "../../src/evolution/checkpoint";
import { parseEvolution,stringifyEvolution } from "../../src/evolution/serialization";
import { type Genome } from "../../src/evolution/genome";
import { evaluateGenome,mean } from "../../src/evolution/evaluation";
import { WIDE_DEVELOPMENT_SEEDS } from "../../src/evolution/suites";
import { writeAtomic } from "../utils/atomic-write";
const source=process.argv[2],generations=(process.argv[3]??"1,5,10").split(",").map(Number),top=Number(process.argv[4]??10);
const firstRank=Number(process.argv.find(arg=>arg.startsWith("--from-rank="))?.slice(12)??1);
if(!source||!generations.every(g=>Number.isInteger(g)&&g>0)||!Number.isInteger(top)||top<1||
 !Number.isInteger(firstRank)||firstRank<1||firstRank>top)throw new Error("Usage: source generations top [--from-rank=1]");
const output=`.archive/results/variant-1/experiments/wide-candidates/${path.basename(source)}`;
fs.mkdirSync(output,{recursive:true});
const checkpointText=fs.readFileSync(`${source}/checkpoint.json`,"utf8"),checkpoint=parseCheckpoint(checkpointText);
writeAtomic(`${output}/checkpoint.json`,checkpointText);
const ledger:Record<string,unknown>[]=fs.existsSync(`${output}/summary.json`)?JSON.parse(fs.readFileSync(`${output}/summary.json`,"utf8")).candidates:[];
let best:Record<string,unknown>|undefined=fs.existsSync(`${output}/selected.json`)?parseEvolution(fs.readFileSync(`${output}/selected.json`,"utf8")):undefined;
for(const generation of generations){
 const record=checkpoint.history.find(r=>r.generation===generation);
 if(!record?.cohortFile)throw new Error(`Missing completed generation ${generation}`);
 const cohort=parseEvolution<{contenders:Genome[]}>(gunzipSync(fs.readFileSync(`${source}/generations/${path.basename(record.cohortFile)}`)).toString());
 for(const [index,genome] of cohort.contenders.slice(firstRank-1,top).entries()){
  if(ledger.some(r=>r.generation===generation&&r.genome===genome.id))continue;
  const episodes=evaluateGenome(genome,WIDE_DEVELOPMENT_SEEDS,checkpoint.config.simulation),meanRow=mean(episodes.map(e=>e.score));
  const candidate={genome,generation,meanRow,criterion:meanRow,episodes,validationSeeds:WIDE_DEVELOPMENT_SEEDS,
   source,selectionRule:`Highest768-mapdevelopmentmean amongtrainingranks${firstRank}-${top}fromdeclaredgenerations. No finalmaps.`};
  const file=`g${generation}-${genome.id}.json`;
  writeAtomic(`${output}/${file}`,stringifyEvolution(candidate));
  if(!best||meanRow>Number(best.meanRow)){best=candidate;writeAtomic(`${output}/selected.json`,stringifyEvolution(best));}
  ledger.push({generation,genome:genome.id,rank:firstRank+index,meanRow,mean192:mean(episodes.slice(0,192).map(e=>e.score)),file});
  writeAtomic(`${output}/summary.json`,JSON.stringify({source,candidates:ledger,developmentEpisodes:ledger.length*768},null,2));
  console.log(`${path.basename(source)} generation=${generation} genome=${genome.id} mean768=${meanRow.toFixed(2)} best=${Number(best.meanRow).toFixed(2)}`);
  await new Promise<void>(resolve=>setImmediate(resolve));
 }
}
