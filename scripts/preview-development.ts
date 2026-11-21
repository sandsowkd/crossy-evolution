/** Prepare a truthful experimental replay without opening the final test suite. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution } from "../src/evolution/serialization";
import { type Genome } from "../src/evolution/genome";
import { alwaysUp,heuristic,randomPolicy } from "../src/evolution/baselines";
import { episode,evaluateGenome,mean,type Episode } from "../src/evolution/evaluation";
import { EXPERIMENT_VALIDATION_SEEDS } from "../src/evolution/suites";

const bestFile=fs.existsSync("results/experiments/wide-restarts/best.json")?"results/experiments/wide-restarts/best.json":"results/experiments/restarts/best.json";
const source=process.argv[2]??JSON.parse(fs.readFileSync(bestFile,"utf8")).source;
const name=`long-dev-${path.basename(path.dirname(source))}-${path.basename(source)}`;
const output=`results/previews/${name}`;
if(fs.existsSync(output))throw new Error(`Preview already exists: ${output}`);
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.cpSync(source,output,{recursive:true});
const checkpoint=parseCheckpoint(fs.readFileSync(`${output}/checkpoint.json`,"utf8"));
const selected=parseEvolution<{genome:Genome;generation:number;episodes:Episode[];meanRow:number;validationSeeds?:number[]}>(fs.readFileSync(`${output}/selected.json`,"utf8"));
assert.ok(selected.generation>0);
const previous=parseEvolution<{genome:Genome;generation:number}>(fs.readFileSync("results/continued/selected.json","utf8"));
const seeds=selected.validationSeeds??EXPERIMENT_VALIDATION_SEEDS,config=checkpoint.config.simulation;
const outcomes={
 random:seeds.map(seed=>episode(randomPolicy(seed^137),seed,config)),
 alwaysUp:seeds.map(seed=>episode(alwaysUp,seed,config)),
 heuristic:seeds.map(seed=>episode(heuristic,seed,config)),
 distanceHeuristic:seeds.map(seed=>episode(heuristic,seed,config,undefined,undefined,2)),
 trajectoryHeuristic:seeds.map(seed=>episode(heuristic,seed,config,undefined,undefined,3)),
 previousPublished:evaluateGenome(previous.genome,seeds,config),
 neat:evaluateGenome(selected.genome,seeds,config),
};
assert.deepEqual(outcomes.neat,selected.episodes);
const summary=Object.fromEntries(Object.entries(outcomes).map(([name,episodes])=>{
 const rows=episodes.map(e=>e.score).sort((a,b)=>a-b);
 return[name,{meanRow:mean(rows),medianRow:(rows[Math.floor((rows.length-1)/2)]+rows[Math.floor(rows.length/2)])/2,maxRow:rows.at(-1),atLeast1000:rows.filter(r=>r>=1000).length/rows.length}];
}));
fs.writeFileSync(`${output}/evaluation.json`,JSON.stringify({kind:"development",generation:selected.generation,trainedGenerations:checkpoint.generation,
 population:checkpoint.config.population,simulation:config,evaluationSeeds:seeds,previousModel:{generation:previous.generation,genome:previous.genome.id},
 selection:`These ${seeds.length} development maps WERE used to select this model. This is NOT an independent final test. D9 final maps remain unused.`,summary,episodes:outcomes},null,2));
fs.writeFileSync(`${output}/provenance.json`,JSON.stringify({label:"Experimental long-game chicken",initialization:"Warm start · actual NEAT refinement",
 ancestry:["Inherits the selected generation470 policy from an earlier500-generation search (800,000 training episodes)",
 "Motion-sensor adaptation selected branch generation30 after24,000 further training episodes; later mean-score branches and restart history are retained in results/experiments",
 ...(checkpoint.config.observationVersion===5?["Two-hop lookahead adaptation and subsequent warm refinement are recorded with their source checkpoints and episode counts in results/experiments"]:[]),
 `Recorded source: ${source}`],
 trainingEpisodes:checkpoint.generation*checkpoint.config.population*checkpoint.config.trainingSeeds},null,2));
console.log(JSON.stringify({output,namespace:name,summary},null,2));
