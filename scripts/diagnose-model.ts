import fs from "node:fs";
import path from "node:path";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution } from "../src/evolution/serialization";
import { type Genome } from "../src/evolution/genome";
import { Network } from "../src/evolution/network";
import { episode, mean } from "../src/evolution/evaluation";
import { GLOBAL_OFFSET } from "../src/core/observation";

const output = process.argv[2] ?? "results/learned";
const checkpoint = parseCheckpoint(
  fs.readFileSync(path.join(output, "checkpoint.json"), "utf8"),
);
const selected = parseEvolution<{ genome: Genome }>(
  fs.readFileSync(path.join(output, "selected.json"), "utf8"),
);
const evaluation = JSON.parse(
  fs.readFileSync(path.join(output, "evaluation.json"), "utf8"),
);
const network = new Network(selected.genome);
const episodes = evaluation.evaluationSeeds.map((seed: number) =>
  episode(
    (o) => {
      for (let i = 0; i < GLOBAL_OFFSET; i += 9) {
        o[i + 4] = 0;
        o[i + 7] = 0;
      }
      for (let i = 3; i < 8; i++) o[GLOBAL_OFFSET + i] = 0;
      return network.decide(o);
    },
    seed,
    checkpoint.config.simulation,
    undefined,
    network,
  ),
);
const result = {
  purpose:
    "Post-selection diagnostic; it cannot select or modify the trained model.",
  intervention:
    "Zero current/landing hazard occupancy and five landing-risk inputs; keep terrain, bounds, velocity and clock unchanged.",
  maps: episodes.length,
  normalMeanRow: evaluation.summary.neat.meanRow,
  hazardBlindMeanRow: mean(episodes.map((e: { score: number }) => e.score)),
  episodes,
};
fs.writeFileSync(
  path.join(output, "ablation.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log({
  normalMeanRow: result.normalMeanRow,
  hazardBlindMeanRow: result.hazardBlindMeanRow,
});
