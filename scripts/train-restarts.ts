/** Short NEAT branches retain a development-confirmed anchor between restarts. */
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { Trainer } from "../src/evolution/trainer";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { cloneGenome, Innovations, mutate, type Genome, type EvolutionParameters } from "../src/evolution/genome";
import { evaluateGenome, mean, type Episode } from "../src/evolution/evaluation";
import { EXPERIMENT_VALIDATION_SEEDS,WIDE_DEVELOPMENT_SEEDS } from "../src/evolution/suites";
import { writeAtomic } from "./atomic-write";

const rounds=Number(process.argv[2]??20),wide=process.argv.includes("--wide");
const rowObjective=process.argv.includes("--rows");
const root=wide?"results/experiments/wide-restarts":"results/experiments/restarts";
const validationSeeds=wide?WIDE_DEVELOPMENT_SEEDS:EXPERIMENT_VALIDATION_SEEDS;
const trainingMaps=wide?64:16,branchGenerations=wide?3:5;
if(!Number.isInteger(rounds)||rounds<1)throw new Error("Invalid round target");
fs.mkdirSync(root,{recursive:true});
type Selected={genome:Genome;generation:number;meanRow:number;criterion:number;episodes:Episode[]};
let stopping=false;
for(const signal of ["SIGINT","SIGTERM"]as const)process.on(signal,()=>{stopping=true;});
let globalBest:Selected|undefined,globalSource="";
const ledger:Record<string,unknown>[]=fs.existsSync(`${root}/summary.json`)?JSON.parse(fs.readFileSync(`${root}/summary.json`,"utf8")).rounds:[];
function assessment(g:Genome,generation:number):Selected{
 const episodes=evaluateGenome(g,validationSeeds,{curriculum:"roads",maxTicks:36000,difficulty:1});
 const meanRow=mean(episodes.map(e=>e.score));return{genome:cloneGenome(g),generation,meanRow,criterion:meanRow,episodes};
}
for(let round=ledger.length+1;round<=rounds&&!stopping;round++){
 const sources=wide?["results/experiments/evolution/lookahead-ancestor","results/experiments/average/wide-lookahead-100","results/experiments/average/wide-score-100","results/experiments/average/wide-score-200","results/experiments/average/wide-100"]:
 ["mean-100","precise-50","stable-50","lookahead-100","memory-100","clock-memory-100","memory-focused-100"].map(n=>`results/experiments/average/${n}`);
 if(fs.existsSync(`${root}/sources.json`)){
  const extra:unknown=JSON.parse(fs.readFileSync(`${root}/sources.json`,"utf8"));
  if(!Array.isArray(extra)||!extra.every(s=>typeof s==="string"))throw new Error("Invalid source registry");
  sources.push(...extra);
 }
 if(globalSource)sources.push(globalSource);
 if(fs.existsSync(`${root}/best.json`))sources.push(JSON.parse(fs.readFileSync(`${root}/best.json`,"utf8")).source);
 for(const source of sources){
  if(!fs.existsSync(`${source}/selected.json`))continue;
  const selected=parseEvolution<Selected&{validationSeeds:number[]}>(fs.readFileSync(`${source}/selected.json`,"utf8"));
  if(selected.validationSeeds.length!==validationSeeds.length||selected.validationSeeds.some((seed,i)=>seed!==validationSeeds[i]))
   throw new Error(`Incomparable development panel in ${source}`);
  if(!globalBest||selected.meanRow>globalBest.meanRow){globalBest=selected;globalSource=source;}
 }
 if(!globalBest)throw new Error("No development-selected ancestor");
 const source=globalSource,ancestor=cloneGenome(globalBest.genome),ancestorMean=globalBest.meanRow;
 const inheritedText=fs.readFileSync(`${source}/checkpoint.json`,"utf8"),inherited=parseCheckpoint(inheritedText);
 const output=path.join(root,`round-${String(round).padStart(3,"0")}`);
 if(fs.existsSync(output))throw new Error(`Existing round directory ${output}`);
 fs.mkdirSync(`${output}/generations`,{recursive:true});
 writeAtomic(`${output}/ancestor-checkpoint.json`,inheritedText);
 writeAtomic(`${output}/ancestor-selected.json`,stringifyEvolution(globalBest));
 const parameters:EvolutionParameters={weightMutationRate:.12,weightMutationSigma:wide?[.02,.05,.1][(round-1)%3]:round%3===0?.15:round%3===1?.035:.07,weightResetRate:0,
  addNodeRate:.01,addConnectionRate:.06,toggleConnectionRate:.003,crossoverRate:.2,parentFraction:.2};
 const trainer=new Trainer({population:100,seed:(wide?402400:302400)+round,trainingSeeds:trainingMaps,profile:"robust-v2",observationVersion:ancestor.observationVersion,
  ...(wide?{trainingSeedStride:67}:{}),
  ...(rowObjective?{fitnessObjective:"rows"as const}:{}),
  evolutionParameters:parameters,fitnessRiskWeight:0,simulation:{curriculum:"roads",maxTicks:36000,difficulty:1}});
 trainer.neat.tracker=Innovations.load(inherited.neat.tracker);
 trainer.neat.population=Array.from({length:100},(_,id)=>{
  const g=cloneGenome(ancestor);g.id=id;g.fitness=0;g.species=0;
  if(id)mutate(g,trainer.neat.rng,trainer.neat.tracker,true,parameters);return g;
 });
 trainer.neat.nextId=100;trainer.neat.threshold=.5;
 let selected:Selected={...globalBest,genome:ancestor,generation:0};
 const validation:{generation:number;genome:number;meanRow:number}[]=[];
 const start=performance.now();
 for(let generation=1;generation<=branchGenerations;generation++){
  const r=trainer.runGeneration();
  const file=`${String(generation).padStart(5,"0")}.json.gz`;r.cohortFile=`/training-cohorts/${file}`;
  writeAtomic(`${output}/generations/${file}`,gzipSync(stringifyEvolution({contenders:r.contenders}),{level:3}));
  if(generation===1||generation===branchGenerations){
   for(const genome of r.contenders.slice(0,10)){
    const candidate=assessment(genome,generation);validation.push({generation,genome:genome.id,meanRow:candidate.meanRow});
    if(candidate.meanRow>selected.meanRow)selected=candidate;
   }
  }
  r.contenders=[r.champion];
  writeAtomic(`${output}/checkpoint.json`,stringifyEvolution(trainer.checkpoint()));
  writeAtomic(`${output}/selected.json`,stringifyEvolution({...selected,validationSeeds,selectionMetric:"mean-row-v1",ancestry:{source,genome:ancestor.id,meanRow:ancestorMean},selectionRule:`Highest development${validationSeeds.length} mean, top10traininggenomes atbranch generations1and${branchGenerations}; nofinaltests`}));
  await new Promise<void>(resolve=>setImmediate(resolve));
  if(stopping)break;
 }
 const seconds=(performance.now()-start)/1000;
 writeAtomic(`${output}/training-summary.json`,JSON.stringify({config:trainer.config,generations:trainer.generation,trainingEpisodes:trainer.generation*100*trainingMaps,
  validationEpisodes:validation.length*validationSeeds.length,validation,seconds,ancestry:{source,genome:ancestor.id,meanRow:ancestorMean}},null,2));
 if(selected.meanRow>globalBest.meanRow){globalBest=selected;globalSource=output;}
 ledger.push({round,output,source,ancestorMean,objective:trainer.config.fitnessObjective??"reward",completedGenerations:trainer.generation,trainingEpisodes:trainer.generation*100*trainingMaps,validationEpisodes:validation.length*validationSeeds.length,seconds,selectedMeanRow:selected.meanRow});
 writeAtomic(`${root}/summary.json`,JSON.stringify({method:"Development-confirmed warm restarts of genuine NEAT; raw mean target atfixed600seconds",rounds:ledger,trainingEpisodes:ledger.reduce((sum,r)=>sum+Number(r.trainingEpisodes),0)},null,2));
 writeAtomic(`${root}/best.json`,stringifyEvolution({...globalBest,source:globalSource}));
 console.log(`round=${round} sigma=${parameters.weightMutationSigma} ancestor=${ancestorMean.toFixed(2)} best${validationSeeds.length}=${globalBest.meanRow.toFixed(2)} source=${globalSource} >=1000=${globalBest.episodes.filter(e=>e.score>=1000).length}/${validationSeeds.length} seconds=${seconds.toFixed(1)}`);
}
