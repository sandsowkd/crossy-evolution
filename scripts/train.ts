import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { Trainer } from "../src/evolution/trainer";
import { stringifyEvolution } from "../src/evolution/serialization";
const generations = Number(process.argv[2] ?? 30),
  seed = Number(process.argv[3] ?? 42),
  curriculum = process.argv[4] === "trains" ? "trains" : "roads";
const output = process.argv[5] ?? "results";
const population = Number(process.argv[6] ?? 100);
if (
  !Number.isInteger(generations) ||
  generations < 1 ||
  ![50, 100, 200].includes(population)
)
  throw new Error(
    "Usage: npm run train -- <generations> <seed> <roads|trains> <output> <50|100|200>",
  );
const trainer = new Trainer({
  seed,
  population,
  simulation: { curriculum, maxTicks: 1800, difficulty: 1 },
});
const start = performance.now();
fs.mkdirSync(output, { recursive: true });
for (let i = 0; i < generations; i++) {
  const r = trainer.runGeneration();
  console.log(
    `gen=${r.generation} best=${r.bestFitness.toFixed(1)} mean=${r.meanFitness.toFixed(1)} meanRow=${r.meanRow.toFixed(2)} evalRow=${r.evalRow.toFixed(2)} species=${r.species} hidden=${r.nodes}`,
  );
}
fs.writeFileSync(
  `${output}/checkpoint.json`,
  stringifyEvolution(trainer.checkpoint()),
);
fs.writeFileSync(
  `${output}/training-summary.json`,
  JSON.stringify(
    {
      seed,
      generations,
      curriculum,
      population,
      trainingEpisodes: population * generations * trainer.config.trainingSeeds,
      heldOutEpisodes: generations * 16,
      seconds: (performance.now() - start) / 1000,
      history: trainer.history.map(
        ({ champion: _champion, contenders: _contenders, ...r }) => r,
      ),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Saved ${output}/checkpoint.json and ${output}/training-summary.json`,
);
