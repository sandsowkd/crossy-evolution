/** Small read-only training inventory, also saved as a dated machine-readable snapshot. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { writeAtomic } from "../utils/atomic-write";
const root=".archive/results/variant-1/experiments";
function json(file:string):Record<string,unknown>|undefined{
 if(!fs.existsSync(file))return;
 try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch{return{readError:"Snapshot was being replaced; inspect again before acting"};}
}
const runs=fs.readdirSync(`${root}/average`).map(name=>{
 const directory=`${root}/average/${name}`,summary=json(`${directory}/training-summary.json`),selected=json(`${directory}/selected.json`);
 const config=summary?.config as Record<string,unknown>|undefined;
 return{name,generations:summary?.generations,target:summary?.requestedGenerations,population:config?.population,maps:config?.trainingSeeds,
  objective:config?.fitnessObjective??"reward",trainingEpisodes:summary?.trainingEpisodes,
  selectedMean:selected?.meanRow,selectedGeneration:selected?.generation,developmentMaps:(selected?.validationSeeds as unknown[])?.length};
});
const restarts=["restarts","wide-restarts"].map(name=>{
 const summary=json(`${root}/${name}/summary.json`),best=json(`${root}/${name}/best.json`);
 const directories=fs.existsSync(`${root}/${name}`)?fs.readdirSync(`${root}/${name}`).filter(n=>n.startsWith("round-")):[];
 const last=directories.sort().at(-1),checkpoint=last?json(`${root}/${name}/${last}/checkpoint.json`):undefined;
 const partialSelected=last?json(`${root}/${name}/${last}/selected.json`):undefined;
 return{name,completedRounds:(summary?.rounds as unknown[])?.length??0,trainingEpisodes:summary?.trainingEpisodes,
  latestRound:last,latestCompletedGeneration:checkpoint?.generation,latestSelectedMean:partialSelected?.meanRow,
  bestSource:best?.source,bestMean:best?.meanRow};
});
const processes=execFileSync("ps",["-axo","pid,etime,%cpu,command"],{encoding:"utf8"}).split("\n")
 .filter(line=>line.includes("/bin/node --require")&&
  /scripts\/(?:train-[a-z-]+|resume-restart|audit-contenders|evaluate-development|evaluate-long|freeze-winner)\.ts/.test(line));
const snapshot={asOf:new Date().toISOString(),horizonSeconds:600,runs,restarts,processes,
 instructions:"Compare like development panels. Preserve checkpoint/archives and warm ancestry. Keep the reserved final suite separate until a model is frozen. User requests further improvement after reaching1000."};
writeAtomic(path.join(root,"status.json"),JSON.stringify(snapshot,null,2));
console.log(JSON.stringify(snapshot,null,2));
