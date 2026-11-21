import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { type Genome } from "../src/evolution/genome";
import { evaluateGenome, mean } from "../src/evolution/evaluation";
import { EXPERIMENT_VALIDATION_SEEDS } from "../src/evolution/suites";

type Candidate={genome:Genome;generation:number;source:string;meanRow?:number};
const candidates:Candidate[]=[];
function walk(dir:string){
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    if(item.isDirectory()&&item.name!=="generations")walk(path.join(dir,item.name));
    if(item.isFile()&&["selected.json","target-selected.json","target-candidates.json"].includes(item.name)){
      const d=parseEvolution<{genome?:Genome;generation:number;candidates?:Candidate[]}>(fs.readFileSync(path.join(dir,item.name),"utf8"));
      for(const c of d.candidates??(d.genome?[d as Candidate]:[]))candidates.push({...c,source:dir});
    }
    if(item.isFile()&&["training-summary.json","summary.json"].includes(item.name)){
      const d=JSON.parse(fs.readFileSync(path.join(dir,item.name),"utf8"));
      const ledger:{generation:number;genome:number;meanRow:number}[]=d.validation??[];
      const best=[...ledger].sort((a,b)=>b.meanRow-a.meanRow).slice(0,5);
      for(const c of best){
        const archive=path.join(dir,"generations",`${String(c.generation).padStart(5,"0")}.json.gz`);
        if(!fs.existsSync(archive))continue;
        const genomes=parseEvolution<{contenders:Genome[]}>(gunzipSync(fs.readFileSync(archive)).toString()).contenders;
        const genome=genomes.find(g=>g.id===c.genome);
        if(genome)candidates.push({genome,generation:c.generation,source:dir});
      }
    }
  }
}
walk("results/experiments");
const seen=new Set<string>();
const unique=candidates.filter(c=>{
  const hash=createHash("sha256").update(JSON.stringify([c.genome.observationVersion,c.genome.connections,c.genome.nodes])).digest("hex");
  if(seen.has(hash))return false;seen.add(hash);return true;
});
const output=process.argv[2]??"results/experiments/development-comparison.json";
const evaluated=[];
for(const c of unique){
  const episodes=evaluateGenome(c.genome,EXPERIMENT_VALIDATION_SEEDS,{curriculum:"roads",maxTicks:36000,difficulty:1});
  const rows=episodes.map(e=>e.score).sort((a,b)=>a-b);
  const result={...c,meanRow:mean(rows),median:(rows[95]+rows[96])/2,p25:rows[47],atLeast1000:rows.filter(r=>r>=1000).length/192,maxRow:rows.at(-1),episodes};
  evaluated.push(result);
  console.log(`${c.source} gen${c.generation} #${c.genome.id} mean192=${result.meanRow.toFixed(2)} median=${result.median} 1k=${(result.atLeast1000*100).toFixed(1)}%`);
  fs.writeFileSync(output,stringifyEvolution({selectionMetric:"mean-row-v1",simulation:{curriculum:"roads",maxTicks:36000,difficulty:1},validationSeeds:EXPERIMENT_VALIDATION_SEEDS,candidates:evaluated.sort((a,b)=>b.meanRow-a.meanRow)}));
}
console.log(`Compared ${evaluated.length} actual policies on192developmentmaps; nofinaltests`);
