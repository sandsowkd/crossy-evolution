/** Freeze/evaluate Variant1 only after the user's already-running training has ended. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {parseEvolution} from "../../src/evolution/serialization";
import type {Genome} from "../../src/evolution/genome";
import {WIDE_DEVELOPMENT_SEEDS} from "../../src/evolution/suites";
const root="results/variants/variant-1",planFile=`${root}/closeout-plan.json`;
const plan=JSON.parse(fs.readFileSync(planFile,"utf8"));
const processes=execFileSync("ps",["-axo","pid=,command="],{encoding:"utf8"}).split("\n")
 .filter(line=>line.includes("/bin/node --require")&&/scripts\/(?:train-[a-z-]+|resume-restart|audit-contenders)\.ts/.test(line));
if(processes.length)throw new Error(`Existing training/audit must finish before Variant1 closure (${processes.length} active)`);
for(const [name,target]of Object.entries(plan.pendingAverageRuns)){
 const summary=JSON.parse(fs.readFileSync(`.archive/results/variant-1/experiments/average/${name}/training-summary.json`,"utf8"));
 assert.equal(summary.generations,target,`Incomplete final batch ${name}`);
}
const ledger=JSON.parse(fs.readFileSync(".archive/results/variant-1/experiments/wide-restarts/summary.json","utf8"));
assert.equal(ledger.rounds.length,plan.restartFinalRound);
assert.equal(ledger.rounds.at(-1).completedGenerations,3);
type Selected={genome:Genome;generation:number;meanRow:number;validationSeeds:number[];source?:string};
const candidates:{source:string;selected:Selected;archives:string}[]=[];
for(const parent of [".archive/results/variant-1/experiments/average",".archive/results/variant-1/experiments/wide-restarts",".archive/results/variant-1/experiments/frozen-development",".archive/results/variant-1/experiments/wide-candidates"]){
 for(const entry of fs.readdirSync(parent,{withFileTypes:true})){
  if(!entry.isDirectory())continue;const source=path.join(parent,entry.name),file=path.join(source,"selected.json");
  if(!fs.existsSync(file)||!fs.existsSync(path.join(source,"checkpoint.json")))continue;
  const selected=parseEvolution<Selected>(fs.readFileSync(file,"utf8"));
  if(selected.generation<=0||selected.validationSeeds?.length!==768||selected.validationSeeds.some((seed,i)=>seed!==WIDE_DEVELOPMENT_SEEDS[i]))continue;
  const archives=fs.existsSync(`${source}/generations`)?`${source}/generations`:`${selected.source}/generations`;
  if(fs.existsSync(archives))candidates.push({source,selected,archives});
 }
}
candidates.sort((a,b)=>b.selected.meanRow-a.selected.meanRow||a.source.localeCompare(b.source));
assert.ok(candidates.length);const winner=candidates[0],frozen=`${root}/final`;
function run(script:string,...args:string[]){execFileSync("npx",["tsx",`scripts/${script}.ts`,...args],{stdio:"inherit"});}
if(!fs.existsSync(`${frozen}/freeze.json`)){
 assert.equal(plan.status,"finishing-existing-runs");
 run("freeze-winner",winner.source,frozen,winner.archives);
 plan.status="model-frozen";plan.frozenDirectory=frozen;plan.selectedSource=winner.source;
 plan.developmentMean=winner.selected.meanRow;plan.selectedGeneration=winner.selected.generation;
 plan.selectedGenome=winner.selected.genome.id;plan.frozenAt=new Date().toISOString();
 fs.writeFileSync(planFile,JSON.stringify(plan,null,2)+"\n");
}
assert.equal(plan.status,"model-frozen");
execFileSync("python3",["scripts/data/variant-one-lineage.py",plan.selectedSource],{stdio:"inherit"});
if(!fs.existsSync(`${frozen}/replay-verification.json`))run("verify-policy-replay",frozen);
if(!fs.existsSync(`${frozen}/evaluation.json`))run("evaluate-long",frozen,"variant-1-close",".archive/results/variant-1/frozen/further-1335-restart038");
if(!fs.existsSync(`${frozen}/verification.json`))run("verify-frozen-evaluation",frozen);
plan.status="assessment-complete-report-pending";plan.assessedAt=new Date().toISOString();
fs.writeFileSync(planFile,JSON.stringify(plan,null,2)+"\n");
console.log("Variant1 final model frozen and independently assessed. Finish concise report/data supplement; no more training.");
