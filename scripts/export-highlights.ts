import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { type Config } from "../src/core/types";
import { validGenome } from "../src/evolution/checkpoint";
import { evaluateGenome } from "../src/evolution/evaluation";
import { type Genome } from "../src/evolution/genome";
import { Replay } from "../src/evolution/replay";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { type Checkpoint } from "../src/evolution/trainer";
import { highlightReplayConfig, highlightAutoSpeedPlan, type HighlightAutoSpeedPlan,
  HIGHLIGHT_REPLAY_OPTIONS } from "../src/visualization/highlight-playback";

type Selection = {
  genome: Genome;
  generation: number;
  meanRow: number;
  validationSeeds?: number[];
};
type Highlight = {
  id: string;
  title: string;
  phaseGeneration: number;
  cumulativeGenerations?: number;
  developmentMean: number | null;
  developmentMaps: number | null;
  developmentMaxTicks: number | null;
  developmentLabel: string;
  config: Config;
  observationVersion: number;
  genome: Genome;
  source: string;
  sourceArchive: string;
  policySha256: string;
  populationSize: number;
  cohortFile: string;
  cohortHash: string;
  populationReplayDecisions: number;
  automaticPlayback: HighlightAutoSpeedPlan;
  mapSeed: number;
  totalScore: number;
  replayTicks: number;
  replayDeathReason?: string;
  independentFinalMean?: number;
  independentFinalMaps?: number;
  independentFinalMaxTicks?: number;
  independentFinalLabel?: string;
  independentFinalBootstrap95?: number[];
  note: string;
};
const mapSeed = 42;
const read = <T>(file: string): T => parseEvolution<T>(fs.readFileSync(file, "utf8"));
const checkpoint = (directory: string) => read<Checkpoint>(path.join(directory, "checkpoint.json"));
const entries: Highlight[] = [];

function add(
  metadata: Omit<Highlight, "policySha256" | "populationSize" | "cohortFile" | "cohortHash" | "populationReplayDecisions" | "automaticPlayback" | "mapSeed" | "totalScore" | "replayTicks" | "replayDeathReason" | "observationVersion">,
  archived: Genome[],
) {
  assert.ok(validGenome(metadata.genome), `Invalid saved policy: ${metadata.source}`);
  assert.deepEqual(archived.find((g) => g.id === metadata.genome.id), metadata.genome,
    `Policy does not match its actual population: ${metadata.source}`);
  assert.ok(archived.every(validGenome), "Invalid genome in the full population");
  assert.equal(new Set(archived.map(g => g.id)).size, archived.length);
  const cohortText = stringifyEvolution({ contenders: archived });
  const cohortFile = `/training-cohorts/highlight-${metadata.id}/${String(metadata.phaseGeneration).padStart(5, "0")}.json.gz`;
  const compressed = gzipSync(cohortText);
  assert.deepEqual(parseEvolution(gunzipSync(compressed).toString()), { contenders: archived });
  fs.mkdirSync(path.dirname(`public${cohortFile}`), { recursive: true });
  fs.writeFileSync(`public${cohortFile}`, compressed);
  // Variant 1's historical rules explicitly predate the eagle mechanic.
  assert.equal(metadata.config.eagle, undefined);
  const [episode] = evaluateGenome(metadata.genome, [mapSeed], metadata.config);
  const replay = new Replay([metadata.genome], mapSeed, metadata.config);
  while (!replay.finished) replay.advance();
  assert.equal(replay.current.sim.agent.maxRow, episode.score);
  assert.equal(replay.current.sim.tick, episode.ticks);
  assert.equal(replay.current.sim.agent.deathReason, episode.deathReason);
  // Freeze the full viewing replay's end once, so its timeline never rescales.
  const populationReplay = new Replay(archived, mapSeed, highlightReplayConfig(metadata.config), HIGHLIGHT_REPLAY_OPTIONS);
  while (!populationReplay.finished) populationReplay.advance();
  console.log(`${metadata.title}: ${archived.length} chickens, fixed timeline ${populationReplay.decisions / 5}s`);
  entries.push({ ...metadata,
    populationReplayDecisions: populationReplay.decisions,
    automaticPlayback: highlightAutoSpeedPlan(populationReplay),
    populationSize: archived.length, cohortFile,
    cohortHash: createHash("sha256").update(cohortText).digest("hex"),
    observationVersion: metadata.genome.observationVersion ?? 1,
    policySha256: createHash("sha256").update(JSON.stringify(metadata.genome)).digest("hex"),
    mapSeed, totalScore: episode.score, replayTicks: episode.ticks,
    replayDeathReason: episode.deathReason });
}

function cohort(directory: string, generation: number) {
  const file = path.join(directory, "generations", `${String(generation).padStart(5, "0")}.json.gz`);
  return { file, genomes: parseEvolution<{ contenders: Genome[] }>(gunzipSync(fs.readFileSync(file)).toString()).contenders };
}

const prototype = checkpoint("results/batch-200");
for (const generation of [1, 5]) {
  const record = prototype.history[generation - 1];
  add({
    id: generation === 1 ? "initial-population" : "early-five-generations",
    title: generation === 1 ? "First population" : "Five-generation prototype",
    phaseGeneration: generation,
    developmentMean: record.evalRow, developmentMaps: record.evaluation.length,
    developmentMaxTicks: prototype.config.simulation.maxTicks,
    developmentLabel: "Historical monitoring maps · 30 seconds",
    config: structuredClone(prototype.config.simulation), genome: record.champion,
    source: `results/batch-200/checkpoint.json#history[${generation - 1}].champion`,
    sourceArchive: `results/batch-200/checkpoint.json#history[${generation - 1}].contenders`,
    note: generation === 1
      ? "Champion of the first random population, evaluated before any breeding. This prototype is a separate experiment from the later 500-generation binary run."
      : "Five actual generations of 200 chickens with three training maps each. This prototype is a separate experiment, not five extra generations in the final policy's ancestry.",
  }, record.contenders);
}

const binaryDirectory = "results/continued";
const binary = read<Selection>(path.join(binaryDirectory, "selected.json"));
const binaryCohort = cohort(binaryDirectory, binary.generation);
add({ id: "binary-road-learner", title: "Binary road learner",
  phaseGeneration: binary.generation, cumulativeGenerations: 470,
  developmentMean: binary.meanRow, developmentMaps: binary.validationSeeds!.length,
  developmentMaxTicks: 3600, developmentLabel: "Validation maps · 60 seconds",
  config: structuredClone(checkpoint(binaryDirectory).config.simulation), genome: binary.genome,
  source: `${binaryDirectory}/selected.json`, sourceArchive: binaryCohort.file,
  note: "Selected native generation 470 of the original binary training and continuation. The historical 60-second episode limit is preserved.",
}, binaryCohort.genomes);

const lookaheadDirectory = "results/experiments/evolution/lookahead-ancestor";
const lookahead = read<Selection>(path.join(lookaheadDirectory, "selected.json"));
const lookaheadCohort = cohort("results/experiments/average/lookahead-100", lookahead.generation);
add({ id: "two-hop-lookahead", title: "Two-hop lookahead",
  phaseGeneration: lookahead.generation, cumulativeGenerations: 470 + 30 + 85,
  developmentMean: lookahead.meanRow, developmentMaps: lookahead.validationSeeds!.length,
  developmentMaxTicks: 36000, developmentLabel: "Wider development maps · 600 seconds",
  config: structuredClone(checkpoint(lookaheadDirectory).config.simulation), genome: lookahead.genome,
  source: `${lookaheadDirectory}/selected.json`, sourceArchive: lookaheadCohort.file,
  note: "Generation 85 of the lookahead branch, inheriting binary generation 470 and 30 motion-sensor generations. The cumulative 585 describes selected phase positions, not an uninterrupted run.",
}, lookaheadCohort.genomes);

const memoryDirectory = "results/experiments/frozen-development/lookahead-memory-g100-audit1370";
const memory = read<Selection>(path.join(memoryDirectory, "selected.json"));
const memoryCohort = cohort(memoryDirectory, memory.generation);
add({ id: "lookahead-memory", title: "Lookahead with memory",
  phaseGeneration: memory.generation, cumulativeGenerations: 470 + 30 + 490 + 30 + 1 + 3 + 100,
  developmentMean: memory.meanRow, developmentMaps: memory.validationSeeds!.length,
  developmentMaxTicks: 36000, developmentLabel: "Wider development maps · 600 seconds",
  config: structuredClone(checkpoint(memoryDirectory).config.simulation), genome: memory.genome,
  source: `${memoryDirectory}/selected.json`, sourceArchive: memoryCohort.file,
  note: "Actual generation-100 memory policy, selected by the recorded wider population audit. Earlier warm-start phases remain part of its ancestry.",
}, memoryCohort.genomes);

const strongestDirectory = "results/variants/variant-1/final";
const strongest = read<Selection>(path.join(strongestDirectory, "selected.json"));
const strongestCohort = cohort(strongestDirectory, strongest.generation);
const finalEvaluation = read<{ generation: number; evaluationSeeds: number[];
  simulation: Config; summary: { neat: { meanRow: number } } }>(path.join(strongestDirectory, "evaluation.json"));
const finalVerification = read<{ meanRow: number; meanBootstrap95: number[];
  checkpointUnchanged: boolean; testEpisodes: number }>(path.join(strongestDirectory, "verification.json"));
const finalLineage = read<{ selectedModelLineageGenerations: number }>("results/variants/variant-1/lineage.json");
assert.equal(finalVerification.checkpointUnchanged, true);
assert.equal(finalEvaluation.generation, strongest.generation);
assert.equal(finalVerification.meanRow, finalEvaluation.summary.neat.meanRow);
assert.equal(finalVerification.testEpisodes, finalEvaluation.evaluationSeeds.length);
add({ id: "variant-1-final", title: "Final Variant 1 policy",
  phaseGeneration: strongest.generation, cumulativeGenerations: finalLineage.selectedModelLineageGenerations,
  developmentMean: strongest.meanRow, developmentMaps: strongest.validationSeeds!.length,
  developmentMaxTicks: 36000, developmentLabel: "Wider development maps · 600 seconds",
  config: structuredClone(checkpoint(strongestDirectory).config.simulation), genome: strongest.genome,
  source: `${strongestDirectory}/selected.json`, sourceArchive: strongestCohort.file,
  independentFinalMean: finalEvaluation.summary.neat.meanRow,
  independentFinalMaps: finalEvaluation.evaluationSeeds.length,
  independentFinalMaxTicks: finalEvaluation.simulation.maxTicks,
  independentFinalLabel: "Reserved FB final maps · 600 seconds",
  independentFinalBootstrap95: finalVerification.meanBootstrap95,
  note: "Frozen memory generation 150, selected before the independent FB assessment. Its 1,174 cumulative selected phase positions include multiple warm starts and NEAT population crossover, not one uninterrupted run. Final mean and interval describe 512 held-out maps for this one policy.",
}, strongestCohort.genomes);

// Add a genuine early binary population for the homepage without changing the
// original six replay records, including existing generation-470 links.
const progressGeneration = 50;
const progressRecord = checkpoint(binaryDirectory).history[progressGeneration - 1];
const progressCohort = cohort(binaryDirectory, progressGeneration);
add({ id: "binary-road-progress", title: "Some progress", phaseGeneration: progressGeneration,
  developmentMean: progressRecord.evalRow, developmentMaps: progressRecord.evaluation.length,
  developmentMaxTicks: 3600, developmentLabel: "Historical monitoring maps · 60 seconds",
  config: structuredClone(checkpoint(binaryDirectory).config.simulation), genome: progressRecord.champion,
  source: `${binaryDirectory}/checkpoint.json#history[49].champion`, sourceArchive: progressCohort.file,
  note: "Actual generation 50 of the binary-sensor phase. The homepage uses this earlier population; the generation-470 replay remains separately available.",
}, progressCohort.genomes);
const homepageProgress = entries.pop()!;

const manifest = { format: "crossy-evolution-highlights", version: 4, mapSeed,
  interpretation: "Authentic policies from different recorded phases. Historical horizons and no-eagle rules are preserved. Monitoring, validation and wider-development means use different panels; the fixed-map replay score is an illustration, not a final-test result. Cumulative generations count selected warm-start phase positions only.",
  entries, additionalEntries: [homepageProgress] };
const encoded = stringifyEvolution(manifest);
assert.deepEqual(parseEvolution(encoded), manifest);
fs.writeFileSync("public/highlights.json", encoded + "\n");
console.log(entries.map(({ genome, ...entry }) => ({ ...entry, genome: genome.id })));
