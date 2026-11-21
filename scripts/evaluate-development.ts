/** Comparable 768-map development audit; never opens reserved final maps. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseEvolution,stringifyEvolution } from "../src/evolution/serialization";
import { type Genome } from "../src/evolution/genome";
import { evaluateGenome,mean } from "../src/evolution/evaluation";
import { WIDE_DEVELOPMENT_SEEDS } from "../src/evolution/suites";
const output="results/experiments/wide-comparison";
fs.mkdirSync(output,{recursive:true});
for(const source of process.argv.slice(2)){
 const selected=parseEvolution<{genome:Genome;generation:number}>(fs.readFileSync(source,"utf8"));
 const fingerprint=createHash("sha256").update(JSON.stringify({version:selected.genome.observationVersion,nodes:selected.genome.nodes,connections:selected.genome.connections})).digest("hex");
 const file=path.join(output,`${path.basename(path.dirname(source))}-g${selected.generation}-${fingerprint.slice(0,8)}.json`);
 if(fs.existsSync(file)){console.log(`Already audited ${file}`);continue;}
 const episodes=evaluateGenome(selected.genome,WIDE_DEVELOPMENT_SEEDS,{curriculum:"roads",maxTicks:36000,difficulty:1});
 const rows=episodes.map(e=>e.score).sort((a,b)=>a-b);
 const result={source,fingerprint,genome:selected.genome,generation:selected.generation,meanRow:mean(rows),medianRow:(rows[383]+rows[384])/2,
  mean192:mean(episodes.slice(0,192).map(e=>e.score)),atLeast1000:rows.filter(r=>r>=1000).length/768,
  episodes,validationSeeds:WIDE_DEVELOPMENT_SEEDS,kind:"development",simulation:{curriculum:"roads",maxTicks:36000,difficulty:1}};
 fs.writeFileSync(file,stringifyEvolution(result));
 console.log(`${source} gen=${selected.generation} mean768=${result.meanRow.toFixed(2)} mean192=${result.mean192.toFixed(2)} >=1000=${result.atLeast1000}`);
 await new Promise<void>(resolve=>setImmediate(resolve));
}
