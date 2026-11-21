/** Mean-score NEAT refinement. All selection uses development maps only. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { gzipSync, gunzipSync } from "node:zlib";
import { Trainer } from "../src/evolution/trainer";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { cloneGenome, Innovations, mutate, OUTPUT_START, type Genome, type EvolutionParameters } from "../src/evolution/genome";
import { evaluateGenome, mean, type Episode } from "../src/evolution/evaluation";
import { EXPERIMENT_VALIDATION_SEEDS, WIDE_DEVELOPMENT_SEEDS } from "../src/evolution/suites";
import { GLOBAL_OFFSET } from "../src/core/observation";
import { writeAtomic } from "./atomic-write";

const name = process.argv[2] ?? "mean-100";
const generations = Number(process.argv[3] ?? 100);
const resume = process.argv.includes("--resume");
const replicate=Number(process.argv.find(a=>a.startsWith("--replicate="))?.slice(12)??0);
if(!Number.isInteger(replicate)||replicate<0||replicate>1000)throw new Error("Invalid replicate index");
const source = process.argv.find((a) => a.startsWith("--source="))?.slice(9) ?? "results/experiments/evolution/v3-ancestor";
const runLabel=name+(replicate?`-r${replicate}`:"");
const output = `results/experiments/average/${runLabel}`;
const profiles = {
  "mean-100": { population: 100, seeds: 16, sigma: .08, rate: .18, node: .025, edge: .10, seed: 194420 },
  "precise-50": { population: 50, seeds: 16, sigma: .035, rate: .10, node: .01, edge: .04, seed: 194421 },
  "explore-200": { population: 200, seeds: 4, sigma: .14, rate: .22, node: .06, edge: .20, seed: 194422 },
  "balanced-100": { population: 100, seeds: 8, sigma: .07, rate: .16, node: .02, edge: .10, seed: 194423 },
  "stable-50": { population: 50, seeds: 64, sigma: .045, rate: .12, node: .01, edge: .04, seed: 194424 },
  "lookahead-100": { population: 100, seeds: 16, sigma: .12, rate: .22, node: .04, edge: .15, seed: 194425 },
  "hybrid-100": { population: 100, seeds: 16, sigma: .12, rate: .22, node: .04, edge: .15, seed: 194426 },
  "control-50": { population: 50, seeds: 64, sigma: .25, rate: .7, node: .01, edge: .04, seed: 194427 },
  "memory-100": { population: 100, seeds: 16, sigma: .15, rate: .25, node: .04, edge: .15, seed: 194428 },
  "wide-100": { population: 100, seeds: 64, sigma: .045, rate: .12, node: .01, edge: .04, seed: 194429 },
  "clock-memory-100": { population: 100, seeds: 32, sigma: .12, rate: .20, node: .025, edge: .10, seed: 194430 },
  "memory-focused-100": { population: 100, seeds: 32, sigma: .5, rate: .9, node: .005, edge: .02, seed: 194431 },
  "wide-lookahead-100": { population: 100, seeds: 64, sigma: .035, rate: .12, node: .01, edge: .04, seed: 194433 },
  "wide-score-100": { population: 100, seeds: 64, sigma: .035, rate: .12, node: .01, edge: .04, seed: 194433 },
  "wide-score-200": { population: 200, seeds: 32, sigma: .035, rate: .12, node: .01, edge: .04, seed: 194434 },
  "wide-global-100": { population: 100, seeds: 32, sigma: .12, rate: .20, node: .04, edge: 0, seed: 194435 },
  "wide-score-explore-100": { population: 100, seeds: 16, sigma: .12, rate: .22, node: .04, edge: .15, seed: 194436 },
  "wide-score-explore-200": { population: 200, seeds: 8, sigma: .12, rate: .22, node: .04, edge: .15, seed: 194437 },
  "wide-reward-explore-100": { population: 100, seeds: 16, sigma: .12, rate: .22, node: .04, edge: .15, seed: 194436 },
  "wide-species-100": { population: 100, seeds: 16, sigma: .12, rate: .22, node: .04, edge: .15, seed: 194438 },
  "wide-species-control-100": { population: 100, seeds: 16, sigma: .12, rate: .22, node: .04, edge: .15, seed: 194438 },
  "wide-score-batch-100": { population: 100, seeds: 32, sigma: .06, rate: .16, node: .02, edge: .10, seed: 194439 },
  "wide-score-batch-200": { population: 200, seeds: 16, sigma: .06, rate: .16, node: .02, edge: .10, seed: 194439 },
  "wide-score-memory-100": { population: 100, seeds: 32, sigma: .06, rate: .16, node: .02, edge: .10, seed: 194439 },
  "wide-score-memory-focused-100": { population: 100, seeds: 32, sigma: .5, rate: .9, node: 0, edge: 0, seed: 194439 },
  "wide-score-gentle-100": { population: 100, seeds: 64, sigma: .025, rate: .08, node: .01, edge: .04, seed: 194440 },
  "wide-score-gentle-200": { population: 200, seeds: 32, sigma: .025, rate: .08, node: .01, edge: .04, seed: 194440 },
};
const p = profiles[name as keyof typeof profiles];
const lookaheadMemory=name === "wide-score-memory-100" || name === "wide-score-memory-focused-100";
const selectionTop = lookaheadMemory || ["memory-focused-100","wide-score-200","wide-score-explore-100","wide-score-explore-200","wide-reward-explore-100","wide-species-100","wide-species-control-100","wide-score-batch-100","wide-score-batch-200","wide-score-gentle-100","wide-score-gentle-200"].includes(name) ? 10 : 3;
const validationSeeds = name.startsWith("wide-") ? WIDE_DEVELOPMENT_SEEDS : EXPERIMENT_VALIDATION_SEEDS;
if (!p || !Number.isInteger(generations) || generations < 1) throw new Error("Invalid profile or generation target");
if (fs.existsSync(path.join(output, "checkpoint.json")) && !resume) throw new Error("Run exists; use --resume");
fs.mkdirSync(path.join(output, "generations"), { recursive: true });
const ancestor = parseEvolution<{genome: Genome; generation:number; episodes?:Episode[]}>(fs.readFileSync(path.join(source, "selected.json"), "utf8"));
const inherited = parseCheckpoint(fs.readFileSync(path.join(source, "checkpoint.json"), "utf8"));
if (name === "lookahead-100" || name === "memory-100") {
  ancestor.genome.observationVersion=name === "memory-100" ? 6 : 5;
  for(const c of ancestor.genome.connections)
    if(c.from===GLOBAL_OFFSET+1||c.from===GLOBAL_OFFSET+2)c.weight=0;
}
if (name === "hybrid-100") ancestor.genome.observationVersion=4;
if (name === "wide-global-100") ancestor.genome.connections=ancestor.genome.connections.filter(c=>c.from>=GLOBAL_OFFSET);
if (name === "clock-memory-100" || name === "memory-focused-100") {
  ancestor.genome.observationVersion=7;
  for(const c of ancestor.genome.connections)if(c.from===GLOBAL_OFFSET+9)c.weight=0;
  if(name === "memory-focused-100") {
    const tracker=Innovations.load(inherited.neat.tracker);
    for(let a=0;a<5;a++){
      const to=OUTPUT_START+a,c=ancestor.genome.connections.find(c=>c.from===GLOBAL_OFFSET+9&&c.to===to);
      if(c){c.enabled=true;c.weight=0;}
      else ancestor.genome.connections.push({from:GLOBAL_OFFSET+9,to,weight:0,enabled:true,innovation:tracker.connection(GLOBAL_OFFSET+9,to)});
    }
    inherited.neat.tracker=tracker.save();
  }
}
if (lookaheadMemory) {
  if (ancestor.genome.observationVersion !== 5) throw new Error("Lookahead memory requires a version5 parent");
  ancestor.genome.observationVersion=8;
  // Roads have no current rail signal. Zeroing only these formerly silent
  // weights preserves the parent exactly before memory is learned by NEAT.
  for(const c of ancestor.genome.connections)if(c.from===GLOBAL_OFFSET+9)c.weight=0;
}
const parameters: EvolutionParameters = {
  weightMutationRate:p.rate, weightMutationSigma:p.sigma, weightResetRate:.001,
  addNodeRate:p.node, addConnectionRate:p.edge, toggleConnectionRate:.005,
  crossoverRate:.35, parentFraction:.25,
  ...(name === "control-50" ? {weightMutationScope:"action-control" as const} : {}),
  ...(name === "memory-focused-100" ? {weightMutationScope:"memory-input" as const} : {}),
  ...(name === "wide-species-100" ? {speciesThresholdFloor:.01,speciesThresholdStep:.0025} : {}),
  ...(name === "wide-score-memory-focused-100" ? {weightMutationScope:"memory-input" as const,weightResetRate:0,toggleConnectionRate:0} : {}),
};
const trainer = resume ? Trainer.restore(parseCheckpoint(fs.readFileSync(path.join(output,"checkpoint.json"),"utf8"))) : new Trainer({
  population:p.population, seed:p.seed+replicate*1009, trainingSeeds:p.seeds, profile:"robust-v2",
  observationVersion:ancestor.genome.observationVersion, evolutionParameters:parameters,
  ...(name.startsWith("wide-score-") || name.startsWith("wide-species-") ? {fitnessObjective:"rows" as const} : {}),
  ...(name.startsWith("wide-") ? {trainingSeedStride:p.seeds+3} : ["clock-memory-100","memory-focused-100"].includes(name) ? {trainingSeedStride:35} : {}),
  fitnessRiskWeight:0, simulation:{ curriculum:"roads", maxTicks:36000, difficulty:1 },
});
if (!resume) {
  trainer.neat.tracker = Innovations.load(inherited.neat.tracker);
  trainer.neat.population = Array.from({length:p.population},(_,id)=>{
    const g = cloneGenome(ancestor.genome); g.id=id; g.fitness=0; g.species=0;
    if (id) mutate(g,trainer.neat.rng,trainer.neat.tracker,true,parameters);
    return g;
  });
  trainer.neat.nextId=p.population;
  trainer.neat.threshold=name === "wide-species-100" ? .04 : .5;
}
type Selected = {genome: Genome; generation:number; criterion:number; meanRow:number; episodes:Episode[]};
function assess(g:Genome,generation:number):Selected {
  const episodes=evaluateGenome(g,validationSeeds,trainer.config.simulation);
  const meanRow=mean(episodes.map(e=>e.score));
  return {genome:cloneGenome(g),generation,criterion:meanRow,meanRow,episodes};
}
const prior = resume ? JSON.parse(fs.readFileSync(path.join(output,"training-summary.json"),"utf8")) : {seconds:0,validation:[],validationEpisodes:validationSeeds.length};
const recoveredArchiveGenerations:number[] = [];
const uncheckpointedArchives = resume ? fs.readdirSync(path.join(output,"generations"))
  .filter(file=>/^\d{5}\.json\.gz$/.test(file)).map(file=>Number(file.slice(0,5)))
  .filter(generation=>generation>trainer.generation) : [];
let selected:Selected = resume ? parseEvolution(fs.readFileSync(path.join(output,"selected.json"),"utf8")) : assess(ancestor.genome,0);
if(lookaheadMemory && !resume){
  assert.equal(ancestor.episodes?.length,validationSeeds.length);
  assert.deepEqual(selected.episodes,ancestor.episodes);
  writeAtomic(path.join(output,"migration-verification.json"),JSON.stringify({source,fromVersion:5,toVersion:8,
    verifiedAt:new Date().toISOString(),developmentEpisodes:validationSeeds.length,
    exactInheritedOutcomes:true,initialMeanRow:selected.meanRow,
    change:"Keep all v5 lookahead and traffic channels; replace the roads-silent current signal with previous horizontal action and zero its inherited outgoing weights. No action override or physics change."},null,2));
}
const validation:{generation:number;genome:number;meanRow:number}[] = prior.validation;
const priorValidationEntries=validation.length;
const started=performance.now();
let stopping=false;
for(const signal of ["SIGINT","SIGTERM"] as const) process.on(signal,()=>{stopping=true;});
function save(){
  writeAtomic(path.join(output,"checkpoint.json"),stringifyEvolution(trainer.checkpoint()));
  writeAtomic(path.join(output,"selected.json"),stringifyEvolution({...selected,validationSeeds,selectionMetric:"mean-row-v1",
    selectionRule:`Highest mean on ${validationSeeds.length} development maps. Actual nominee counts per generation are retained in the validation ledger; current shortlist ${selectionTop}, checked every5generations plusfirst/final. Final tests unopened.`,
    ancestry:{source,selectedGeneration:ancestor.generation,selectedGenome:ancestor.genome.id}}));
  writeAtomic(path.join(output,"training-summary.json"),JSON.stringify({config:trainer.config,generations:trainer.generation,
    requestedGenerations:generations,profile:name,replicate,trainingEpisodes:trainer.generation*p.population*p.seeds,
    validationEpisodes:prior.validationEpisodes+(validation.length-priorValidationEntries)*validationSeeds.length,
    validation,selectionTop,seconds:prior.seconds+(performance.now()-started)/1000,
    ancestry:{source,selectedGeneration:ancestor.generation,selectedGenome:ancestor.genome.id},
    repeatedRecoveryTrainingEpisodesKnownMinimum:(prior.repeatedRecoveryTrainingEpisodesKnownMinimum??0)+
      recoveredArchiveGenerations.length*trainer.config.population*trainer.config.trainingSeeds,
    recoveryHistory:[...(prior.recoveryHistory??[]),...(uncheckpointedArchives.length?[{
      fromGeneration:prior.generations,uncheckpointedArchives,verifiedReplayedGenerations:recoveredArchiveGenerations,
      note:"Saved generation counts exclude earlier uncheckpointed work; repeated episode count is a known minimum. Prior incomplete development work may be unavailable.",
    }]:[])],
    selectedGeneration:selected.generation,selectedMeanRow:selected.meanRow,
    history:trainer.history.map(({champion:_c,contenders:_p,...r})=>r)},null,2));
}
save();
while(trainer.generation<generations&&!stopping){
  const r=trainer.runGeneration();
  const filename=`${String(r.generation).padStart(5,"0")}.json.gz`;
  r.cohortFile=`/training-cohorts/${filename}`;
  const archive=path.join(output,"generations",filename),payload=stringifyEvolution({contenders:r.contenders});
  if(fs.existsSync(archive)){
    if(gunzipSync(fs.readFileSync(archive)).toString()!==payload)throw new Error(`Replayed population differs from preserved archive ${archive}`);
    recoveredArchiveGenerations.push(r.generation);
  }else writeAtomic(archive,gzipSync(payload,{level:3}));
  if(r.generation===1||r.generation%5===0||r.generation===generations){
    for(const g of r.contenders.slice(0,selectionTop)){
      const candidate=assess(g,r.generation);
      validation.push({generation:r.generation,genome:g.id,meanRow:candidate.meanRow});
      if(candidate.meanRow>selected.meanRow)selected=candidate;
    }
    console.log(`${runLabel} gen=${r.generation} train=${r.meanRow.toFixed(1)} development${validationSeeds.length}=${selected.meanRow.toFixed(2)} model=${selected.genome.id} bestGen=${selected.generation} >=1000=${selected.episodes.filter(e=>e.score>=1000).length}/${validationSeeds.length} elapsed=${((performance.now()-started)/1000).toFixed(1)}s`);
  }
  r.contenders=[r.champion];
  if(r.generation%5===0||r.generation===1||r.generation===generations)save();
  await new Promise<void>(resolve=>setImmediate(resolve));
}
save();
console.log(`Saved ${runLabel} at generation${trainer.generation}`);
