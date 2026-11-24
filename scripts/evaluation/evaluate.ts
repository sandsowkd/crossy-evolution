import fs from "node:fs";
import path from "node:path";
import {
  HELD_OUT_SEEDS,
  episode,
  evaluateGenome,
  mean,
} from "../../src/evolution/evaluation";
import { alwaysUp, heuristic, randomPolicy } from "../../src/evolution/baselines";
import { parseCheckpoint } from "../../src/evolution/checkpoint";
const file = process.argv[2] ?? "results/checkpoint.json";
const c = parseCheckpoint(fs.readFileSync(file, "utf8"));
const record = c.history.at(-1);
if (!record) throw new Error("No evaluated champion");
const config = { ...c.config.simulation, curriculum: record.curriculum };
const scores = {
  random: HELD_OUT_SEEDS.map((seed) =>
    episode(randomPolicy(seed ^ 137), seed, config),
  ),
  alwaysUp: HELD_OUT_SEEDS.map((seed) => episode(alwaysUp, seed, config)),
  heuristic: HELD_OUT_SEEDS.map((seed) => episode(heuristic, seed, config)),
  neat: evaluateGenome(record.champion, HELD_OUT_SEEDS, config),
};
const summary = Object.fromEntries(
  Object.entries(scores).map(([name, episodes]) => [
    name,
    {
      meanRow: mean(episodes.map((e) => e.score)),
      meanFitness: mean(episodes.map((e) => e.fitness)),
      maxRow: Math.max(...episodes.map((e) => e.score)),
    },
  ]),
);
const result = {
  seed: c.config.seed,
  generation: record.generation,
  curriculum: record.curriculum,
  evaluationSeeds: HELD_OUT_SEEDS,
  summary,
  episodes: scores,
};
fs.writeFileSync(
  path.join(path.dirname(file), "evaluation.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
