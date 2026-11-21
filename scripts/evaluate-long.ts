import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution } from "../src/evolution/serialization";
import { type Genome } from "../src/evolution/genome";
import {
  episode,
  evaluateGenome,
  mean,
  type Episode,
} from "../src/evolution/evaluation";
import { alwaysUp, heuristic, randomPolicy } from "../src/evolution/baselines";
import { RNG } from "../src/core/rng";
import { CONTINUATION_TEST_SEEDS, FINAL_TEST_SEEDS, LONG_TEST_SEEDS,LONG_IMPROVEMENT_TEST_SEEDS,LONG_FURTHER_TEST_SEEDS,LONG_POST_FURTHER_TEST_SEEDS,VARIANT_ONE_CLOSE_SEEDS } from "../src/evolution/suites";
import { writeAtomic } from "./atomic-write";

const output = process.argv[2] ?? "results/learned";
const c = parseCheckpoint(
  fs.readFileSync(path.join(output, "checkpoint.json"), "utf8"),
);
const selected = parseEvolution<{ genome: Genome; generation: number; validationSeeds?: number[]; selectionMetric?: string }>(
  fs.readFileSync(path.join(output, "selected.json"), "utf8"),
);
// Only open this suite after training/validation and model choice have finished.
const suite = process.argv[3] ?? "original";
if (suite !== "original" && suite !== "continued" && suite !== "long" && suite !== "long-next" && suite !== "long-further" && suite !== "long-post-further" && suite !== "variant-1-close")
  throw new Error("Unknown test suite");
const seeds = suite === "variant-1-close" ? VARIANT_ONE_CLOSE_SEEDS : suite === "long-post-further" ? LONG_POST_FURTHER_TEST_SEEDS : suite === "long-further" ? LONG_FURTHER_TEST_SEEDS : suite === "long-next" ? LONG_IMPROVEMENT_TEST_SEEDS : suite === "long" ? LONG_TEST_SEEDS : suite === "continued" ? CONTINUATION_TEST_SEEDS : FINAL_TEST_SEEDS;
const config = c.config.simulation;
let reservedRecord:Record<string,unknown>|undefined;
const reservedFile=`results/experiments/final-tests/${suite}.json`;
const reservedSuite=suite==="variant-1-close"||suite==="long-next"||suite==="long-further"||suite==="long-post-further",minimumMean=suite==="variant-1-close"?0:suite==="long-post-further"?1450:suite==="long-further"?1325:1200;
if(suite === "variant-1-close") {
  const plan=JSON.parse(fs.readFileSync("results/variants/variant-1/closeout-plan.json","utf8"));
  if(plan.status!=="model-frozen" || path.resolve(plan.frozenDirectory)!==path.resolve(output))
    throw new Error("Variant1 closure requires completed training and the predeclared frozen winner");
}
if(reservedSuite){
  if(fs.existsSync(path.join(output,"evaluation.json")))throw new Error("Frozen final report already exists; preserve it");
  const frozen=JSON.parse(fs.readFileSync(path.join(output,"freeze.json"),"utf8"));
  const checkpointSha256=createHash("sha256").update(fs.readFileSync(path.join(output,"checkpoint.json"))).digest("hex");
  const policySha256=createHash("sha256").update(JSON.stringify({version:selected.genome.observationVersion??1,nodes:selected.genome.nodes,connections:selected.genome.connections})).digest("hex");
  if(!Number.isFinite(frozen.developmentMean)||frozen.developmentMean<minimumMean||
      config.curriculum!=="roads"||config.maxTicks!==36000||config.difficulty!==1||config.eagle!==undefined||
      frozen.checkpointSha256!==checkpointSha256||frozen.policySha256!==policySha256)
    throw new Error(`Reserved ${suite} test requires unchanged frozen roads physics and the declared ${minimumMean} development threshold`);
  reservedRecord={suite,openedAt:new Date().toISOString(),output:path.resolve(output),checkpointSha256,policySha256,
    developmentMean:frozen.developmentMean,simulation:config};
  fs.mkdirSync(path.dirname(reservedFile),{recursive:true});
  if(fs.existsSync(reservedFile)){
    const previous=JSON.parse(fs.readFileSync(reservedFile,"utf8"));
    if(previous.policySha256!==policySha256||previous.checkpointSha256!==checkpointSha256||previous.output!==path.resolve(output))
      throw new Error(`${suite} was already opened for a different frozen model; choose a newly reserved suite`);
    reservedRecord=previous;
  }else fs.writeFileSync(reservedFile,JSON.stringify(reservedRecord,null,2),{flag:"wx"});
}
const previous = parseCheckpoint(
  fs.readFileSync("results/batch-200/checkpoint.json", "utf8"),
).history.at(-1)!.champion;
const scores: Record<string, Episode[]> = {
  random: seeds.map((seed) => episode(randomPolicy(seed ^ 137), seed, config)),
  alwaysUp: seeds.map((seed) => episode(alwaysUp, seed, config)),
  heuristic: seeds.map((seed) => episode(heuristic, seed, config)),
  distanceHeuristic: seeds.map((seed) =>
    episode(heuristic, seed, config, undefined, undefined, 2),
  ),
  initial: evaluateGenome(c.history[0].champion, seeds, config),
  previousFiveGenerations: evaluateGenome(previous, seeds, config),
};
if (suite === "long" || reservedSuite) scores.trajectoryHeuristic = seeds.map((seed) =>
  episode(heuristic, seed, config, undefined, undefined, 3),
);
const previousRun = process.argv[4];
let previousModel: { genome: Genome; generation: number } | undefined;
if (previousRun) {
  const previousCheckpoint = parseCheckpoint(
    fs.readFileSync(path.join(previousRun, "checkpoint.json"), "utf8"),
  );
  if (
    previousCheckpoint.config.simulation.curriculum !== config.curriculum ||
    previousCheckpoint.config.simulation.difficulty !== config.difficulty
  )
    throw new Error("Before/after policies must share traffic difficulty and curriculum");
  previousModel = parseEvolution<{ genome: Genome; generation: number }>(
    fs.readFileSync(path.join(previousRun, "selected.json"), "utf8"),
  );
  scores.previousPublished = evaluateGenome(previousModel.genome, seeds, config);
}
scores.neat = evaluateGenome(selected.genome, seeds, config);
function summarize(episodes: Episode[]) {
  const rows = episodes.map((e) => e.score).sort((a, b) => a - b);
  const percentile = (p: number) => rows[Math.floor((rows.length - 1) * p)];
  return {
    meanRow: mean(rows),
    medianRow:
      (rows[Math.floor((rows.length - 1) / 2)] + rows[Math.ceil((rows.length - 1) / 2)]) / 2,
    p25: percentile(0.25),
    p90: percentile(0.9),
    maxRow: rows.at(-1),
    atLeast25: rows.filter((r) => r >= 25).length / rows.length,
    atLeast50: rows.filter((r) => r >= 50).length / rows.length,
    atLeast1000: rows.filter((r) => r >= 1000).length / rows.length,
    timeoutRate: episodes.filter((e) => e.deathReason === "timeout").length / episodes.length,
    meanFitness: mean(episodes.map((e) => e.fitness)),
  };
}
const summary = Object.fromEntries(
  Object.entries(scores).map(([name, episodes]) => [name, summarize(episodes)]),
);
function compare(baseline: string) {
  const differences = scores.neat.map((e, i) => e.score - scores[baseline][i].score);
  const rng = new RNG(71429),
    boot = Array.from({ length: 2000 }, () =>
      mean(Array.from({ length: seeds.length }, () => rng.pick(differences))),
    ).sort((a, b) => a - b);
  return {
    baseline,
    meanDifference: mean(differences),
    bootstrap95: [boot[50], boot[1949]],
    winRate: differences.filter((d) => d > 0).length / differences.length,
    ties: differences.filter((d) => d === 0).length / differences.length,
  };
}
const paired = compare("distanceHeuristic");
const pairedPrevious = previousRun ? compare("previousPublished") : undefined;
const result = {
  generation: selected.generation,
  trainedGenerations: c.generation,
  population: c.config.population,
  curriculum: config.curriculum,
  simulation: config,
  evaluationSeeds: seeds,
  suite,
  selectionSeeds: selected.validationSeeds,
  selectionMetric: selected.selectionMetric,
  previousModel: previousModel
    ? { generation: previousModel.generation, genome: previousModel.genome.id }
    : undefined,
  selection:
    `${selected.validationSeeds?.length ?? 64} separate development maps; final512maps not used to select model; all policies evaluated with identical${config.maxTicks/60}-second limits`,
  summary,
  paired,
  pairedPrevious,
  episodes: scores,
};
writeAtomic(
  path.join(output, "evaluation.json"),
  JSON.stringify(result, null, 2) + "\n",
);
if(reservedRecord)writeAtomic(reservedFile,JSON.stringify({...reservedRecord,completedAt:new Date().toISOString(),meanRow:summary.neat.meanRow},null,2));
console.log(JSON.stringify({ summary, paired, pairedPrevious }, null, 2));
