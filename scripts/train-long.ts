import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { Trainer } from "../src/evolution/trainer";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import {
  parseEvolution,
  stringifyEvolution,
} from "../src/evolution/serialization";
import { evaluateGenome, mean } from "../src/evolution/evaluation";
import { type Genome } from "../src/evolution/genome";
import { EXPERIMENT_VALIDATION_SEEDS, VALIDATION_SEEDS } from "../src/evolution/suites";
import { selectionScore, type SelectionMetric } from "../src/evolution/selection";

const generations = Number(process.argv[2] ?? 300);
const output = process.argv[3] ?? "results/learned";
const seed = Number(process.argv[4] ?? 42);
const resume = process.argv[5];
if (!Number.isInteger(generations) || generations < 1)
  throw new Error("Invalid generation count");
// This development suite may select a model. It is disjoint from training,
// the historical 16-map monitor, and the untouched final test suite.
let validationSeeds = VALIDATION_SEEDS;
let selectionMetric: SelectionMetric = "robust-row-v1";
if (fs.existsSync(path.join(output, "checkpoint.json")))
  throw new Error("Choose a new output directory to preserve the existing run");
const trainer = resume
  ? Trainer.restore(parseCheckpoint(
      fs.readFileSync(path.join(resume, "checkpoint.json"), "utf8"),
    ))
  : new Trainer({
      population: 200,
      seed,
      trainingSeeds: 8,
      profile: "robust-v2",
      simulation: { curriculum: "roads", maxTicks: 3600, difficulty: 1 },
    });
if (resume && trainer.config.seed !== seed)
  throw new Error("Resume seed must match the saved run");
const startingGeneration = trainer.generation;
fs.mkdirSync(path.join(output, "generations"), { recursive: true });
type Selected = {
  genome: Genome;
  generation: number;
  criterion: number;
  meanRow: number;
  episodes: ReturnType<typeof evaluateGenome>;
};
let selected: Selected | undefined;
type Validation = {
  generation: number;
  genome: number;
  criterion: number;
  meanRow: number;
};
let validation: Validation[] = [];
let priorSeconds = 0;
let priorValidationEpisodes = 0;
let priorValidationEntries = 0;
if (resume) {
  const saved = parseEvolution<Selected & { validationSeeds: number[]; selectionMetric?: SelectionMetric }>(
    fs.readFileSync(path.join(resume, "selected.json"), "utf8"),
  );
  if (![VALIDATION_SEEDS, EXPERIMENT_VALIDATION_SEEDS].some(
    (suite) => JSON.stringify(saved.validationSeeds) === JSON.stringify(suite),
  )) throw new Error("Unsupported development selection suite");
  validationSeeds = saved.validationSeeds;
  selectionMetric = saved.selectionMetric ?? "robust-row-v1";
  if (!["robust-row-v1", "goal-1000-v1", "mean-row-v1"].includes(selectionMetric))
    throw new Error("Unsupported selection objective");
  const episodes = evaluateGenome(
    saved.genome, validationSeeds, trainer.config.simulation,
  );
  const criterion = selectionScore(episodes, selectionMetric);
  if (criterion !== saved.criterion || mean(episodes.map((e) => e.score)) !== saved.meanRow)
    throw new Error("Saved selection does not reproduce on validation maps");
  selected = saved;
  const summary = JSON.parse(
    fs.readFileSync(path.join(resume, "training-summary.json"), "utf8"),
  );
  if (summary.generations !== startingGeneration)
    throw new Error("Resume summary and checkpoint generations differ");
  validation = summary.validation;
  priorValidationEntries = validation.length;
  priorValidationEpisodes = summary.validationEpisodes;
  priorSeconds = summary.seconds;
  for (const record of trainer.history) {
    if (!record.cohortFile) throw new Error("Missing full population archive");
    const name = path.basename(record.cohortFile);
    fs.copyFileSync(
      path.join(resume, "generations", name),
      path.join(output, "generations", name),
      fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE,
    );
  }
  console.log(`Resumed generation ${startingGeneration}; preserved validation winner #${saved.genome.id}; stopping at ${startingGeneration + generations}`);
}
const start = performance.now();
for (let i = 0; i < generations; i++) {
  const r = trainer.runGeneration();
  if (
    !r.contenders.every(
      (g) => g.observationVersion === trainer.config.observationVersion,
    )
  )
    throw new Error("Sensor version was lost during breeding");
  const filename = `${String(r.generation).padStart(5, "0")}.json.gz`;
  r.cohortFile = `/training-cohorts/${filename}`;
  fs.writeFileSync(
    path.join(output, "generations", filename),
    gzipSync(stringifyEvolution({ contenders: r.contenders }), { level: 3 }),
  );
  if (r.generation === 1 || r.generation % 10 === 0 || i === generations - 1) {
    for (const genome of r.contenders.slice(0, 3)) {
      const episodes = evaluateGenome(
        genome,
        validationSeeds,
        trainer.config.simulation,
      );
      const rows = episodes.map((e) => e.score).sort((a, b) => a - b);
      const meanRow = mean(rows), criterion = selectionScore(episodes, selectionMetric);
      validation.push({
        generation: r.generation,
        genome: genome.id,
        criterion,
        meanRow,
      });
      if (!selected || criterion > selected.criterion)
        selected = {
          genome: structuredClone(genome),
          generation: r.generation,
          criterion,
          meanRow,
          episodes,
        };
    }
    console.log(
      `gen=${r.generation} meanRow=${r.meanRow.toFixed(2)} monitor16=${r.evalRow.toFixed(2)} validationBest=${selected!.meanRow.toFixed(2)} species=${r.species} hidden=${r.nodes} elapsed=${((performance.now() - start) / 1000).toFixed(1)}s`,
    );
  }
  // Full cohorts are losslessly archived above. Keep only champions in RAM.
  r.contenders = [r.champion];
  if (r.generation % 50 === 0 || i === generations - 1) {
    fs.writeFileSync(
      path.join(output, "checkpoint.json"),
      stringifyEvolution(trainer.checkpoint()),
    );
    fs.writeFileSync(
      path.join(output, "selected.json"),
      stringifyEvolution({
        ...selected,
        validationSeeds,
        selectionMetric,
        selectionRule:
          `${selectionMetric}; top-three training genomes every ten generations; development maps only, no final test scores used`,
      }),
    );
  }
}
fs.writeFileSync(
  path.join(output, "training-summary.json"),
  JSON.stringify(
    {
      config: trainer.config,
      generations: trainer.generation,
      startingGeneration,
      additionalGenerations: generations,
      resumedFrom: resume,
      trainingEpisodes: trainer.generation * trainer.config.population * trainer.config.trainingSeeds,
      sessionTrainingEpisodes: generations * trainer.config.population * trainer.config.trainingSeeds,
      monitorEpisodes: trainer.generation * 16,
      validationEpisodes: priorValidationEpisodes + (validation.length - priorValidationEntries) * validationSeeds.length,
      selectionMetric,
      selectionSeeds: validationSeeds,
      seconds: priorSeconds + (performance.now() - start) / 1000,
      sessionSeconds: (performance.now() - start) / 1000,
      validation,
      history: trainer.history.map(
        ({ champion: _c, contenders: _p, ...r }) => r,
      ),
    },
    null,
    2,
  ) + "\n",
);
console.log(`Saved every population and resumable state to ${output}`);
