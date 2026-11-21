/** Recover a checkpointed short restart without discarding its population or archives. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { Trainer } from "../src/evolution/trainer";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { cloneGenome, type Genome } from "../src/evolution/genome";
import { evaluateGenome, mean, type Episode } from "../src/evolution/evaluation";
import { EXPERIMENT_VALIDATION_SEEDS, WIDE_DEVELOPMENT_SEEDS } from "../src/evolution/suites";
import { writeAtomic } from "./atomic-write";

const root = process.argv[2];
if (!["results/experiments/wide-restarts", "results/experiments/restarts"].includes(root))
  throw new Error("Pass one existing restart experiment root; inspect actual processes first");
const wide = root.endsWith("/wide-restarts"), target = wide ? 3 : 5;
const seeds = wide ? WIDE_DEVELOPMENT_SEEDS : EXPERIMENT_VALIDATION_SEEDS;
type Selected = { genome:Genome; generation:number; meanRow:number; criterion:number; episodes:Episode[];
  validationSeeds:number[]; ancestry:{source:string;genome:number;meanRow:number}; selectionRule:string };
const report = JSON.parse(fs.readFileSync(`${root}/summary.json`, "utf8"));
const round = report.rounds.length + 1;
const output = path.join(root, `round-${String(round).padStart(3, "0")}`);
const checkpointText = fs.readFileSync(`${output}/checkpoint.json`, "utf8");
const selectedText = fs.readFileSync(`${output}/selected.json`, "utf8");
const checkpoint = parseCheckpoint(checkpointText), trainer = Trainer.restore(checkpoint);
let selected = parseEvolution<Selected>(selectedText);
if (trainer.generation < 1 || trainer.generation > target || trainer.config.population !== 100 ||
    trainer.config.seed !== (wide ? 402400 : 302400) + round ||
    trainer.config.trainingSeeds !== (wide ? 64 : 16) ||
    trainer.config.simulation.curriculum !== "roads" || trainer.config.simulation.maxTicks !== 36000 ||
    trainer.config.simulation.difficulty !== 1 || selected.validationSeeds.length !== seeds.length ||
    selected.validationSeeds.some((seed,i) => seed !== seeds[i]) || selected.generation > trainer.generation)
  throw new Error("Partial round does not match its declared experiment");
if (selected.generation > 0) {
  const cohort = parseEvolution<{contenders:Genome[]}>(gunzipSync(fs.readFileSync(
    `${output}/generations/${String(selected.generation).padStart(5,"0")}.json.gz`)).toString());
  const archived = cohort.contenders.find(g => g.id === selected.genome.id);
  if (!archived || stringifyEvolution(archived) !== stringifyEvolution(selected.genome))
    throw new Error("Selected genome differs from its actual archived population");
}
const verified = evaluateGenome(selected.genome, seeds, trainer.config.simulation);
if (JSON.stringify(verified) !== JSON.stringify(selected.episodes) || mean(verified.map(e=>e.score)) !== selected.meanRow)
  throw new Error("Checkpointed development result failed independent reproduction");
const startGeneration = trainer.generation;
const digest = (text:string) => createHash("sha256").update(text).digest("hex");
for (const [name,text] of [["checkpoint",checkpointText],["selected",selectedText]]) {
  const file = `${output}/recovery-${name}-g${startGeneration}.json`;
  if (fs.existsSync(file) && fs.readFileSync(file,"utf8") !== text) throw new Error(`Different recovery snapshot ${file}`);
  if (!fs.existsSync(file)) writeAtomic(file,text);
}
const uncheckpointed = Array.from({length:target-startGeneration},(_,i)=>startGeneration+i+1)
  .filter(g=>fs.existsSync(`${output}/generations/${String(g).padStart(5,"0")}.json.gz`));
const validation: {generation:number;genome:number;meanRow:number}[] = [];
const started = performance.now();
while (trainer.generation < target) {
  const r = trainer.runGeneration(), filename = `${String(r.generation).padStart(5,"0")}.json.gz`;
  r.cohortFile = `/training-cohorts/${filename}`;
  const payload = stringifyEvolution({contenders:r.contenders}), archive = `${output}/generations/${filename}`;
  if (fs.existsSync(archive)) {
    if (gunzipSync(fs.readFileSync(archive)).toString() !== payload)
      throw new Error("Replayed population differs from the preserved uncheckpointed archive");
  } else writeAtomic(archive,gzipSync(payload,{level:3}));
  if (r.generation === target) for (const genome of r.contenders.slice(0,10)) {
    const episodes = evaluateGenome(genome,seeds,trainer.config.simulation), meanRow = mean(episodes.map(e=>e.score));
    validation.push({generation:r.generation,genome:genome.id,meanRow});
    if (meanRow > selected.meanRow) selected = {...selected,genome:cloneGenome(genome),generation:r.generation,meanRow,criterion:meanRow,episodes};
  }
  r.contenders = [r.champion];
  writeAtomic(`${output}/checkpoint.json`,stringifyEvolution(trainer.checkpoint()));
  writeAtomic(`${output}/selected.json`,stringifyEvolution(selected));
  console.log(`recovered round=${round} generation=${r.generation} best${seeds.length}=${selected.meanRow.toFixed(2)}`);
}
const seconds = (performance.now()-started)/1000;
const trainingEpisodes = trainer.generation*100*trainer.config.trainingSeeds;
const repeatedRecoveryTrainingEpisodes = uncheckpointed.length*100*trainer.config.trainingSeeds;
const priorNominees = startGeneration === target ? 20 : 10;
const validationEpisodes = (priorNominees + validation.length + 1)*seeds.length;
const recovery = {startGeneration,checkpointSha256:digest(checkpointText),selectedSha256:digest(selectedText),
  uncheckpointedGenerationsReproducedExactly:uncheckpointed,repeatedRecoveryTrainingEpisodes,
  validationEpisodesAreKnownMinimum:true,priorNonwinningNomineeScoresUnavailable:true,
  priorUncheckpointedDevelopmentWorkMayHaveOccurred:uncheckpointed.length>0,
  secondsScope:"Recovery only; original partial-run timing unavailable",checkpointVerificationEpisodes:seeds.length};
writeAtomic(`${output}/training-summary.json`,JSON.stringify({config:trainer.config,generations:trainer.generation,
  trainingEpisodes,repeatedRecoveryTrainingEpisodes,knownTrainingEpisodesIncludingRecovery:trainingEpisodes+repeatedRecoveryTrainingEpisodes,
  validationEpisodes,validation,seconds,recovery,ancestry:selected.ancestry},null,2));
report.rounds.push({round,output,source:selected.ancestry.source,ancestorMean:selected.ancestry.meanRow,
  objective:trainer.config.fitnessObjective??"reward",completedGenerations:trainer.generation,trainingEpisodes,
  repeatedRecoveryTrainingEpisodes,validationEpisodes,seconds,recovery,selectedMeanRow:selected.meanRow});
report.trainingEpisodes = report.rounds.reduce((sum:number,r:{trainingEpisodes:number})=>sum+r.trainingEpisodes,0);
report.repeatedRecoveryTrainingEpisodes = report.rounds.reduce((sum:number,r:{repeatedRecoveryTrainingEpisodes?:number})=>sum+(r.repeatedRecoveryTrainingEpisodes??0),0);
writeAtomic(`${root}/summary.json`,JSON.stringify(report,null,2));
const best = parseEvolution<{meanRow:number}>(fs.readFileSync(`${root}/best.json`,"utf8"));
if (selected.meanRow > best.meanRow) writeAtomic(`${root}/best.json`,stringifyEvolution({...selected,source:output}));
