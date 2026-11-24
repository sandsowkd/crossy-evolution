import fs from "node:fs";
import assert from "node:assert/strict";
import { gunzipSync, gzipSync } from "node:zlib";
import { hash } from "../../src/core/rng";
import { VARIANT_TWO_CONFIG } from "../../src/core/upstream";
import type { Checkpoint } from "../../src/evolution/trainer";
import { parseCheckpoint, NATIVE_MAX_CHECKPOINT_CHARACTERS } from "../../src/evolution/checkpoint";
import { parseEvolution, stringifyEvolution } from "../../src/evolution/serialization";
import { sha256, writeVariantTwoImmutable } from "../../src/evolution/variant-two-experiment";

const run = process.argv[2] ?? "transfer-plasticity-001";
const generations = Number(process.argv[3] ?? "256");
const risk = Number(process.argv[4] ?? "0"), stream = Number(process.argv[5] ?? "2801");
assert.match(run, /^transfer-[a-z0-9-]{1,48}$/);
assert.ok(Number.isInteger(generations) && generations > 0 && generations <= 512);
assert.ok(Number.isFinite(risk) && risk >= 0 && risk <= 1);
assert.ok(Number.isInteger(stream) && stream >= 0 && stream <= 0xffffffff);
const best = JSON.parse(fs.readFileSync(".archive/results/variant-2/best-development.json", "utf8"));
assert.ok(best.selectedFile, "Use a fully audited selection");
const source = best.selectedDirectory, parent = JSON.parse(fs.readFileSync(`${source}/protocol.json`, "utf8"));
const head = JSON.parse(fs.readFileSync(`${source}/HEAD.json`, "utf8"));
const snapshotFile = `${source}/snapshots/${String(head.generation).padStart(5, "0")}.json`;
const raw = fs.readFileSync(snapshotFile, "utf8"); assert.equal(sha256(raw), head.snapshotSha256);
const cp = parseCheckpoint(stringifyEvolution(parseEvolution<{ checkpoint: Checkpoint }>(raw).checkpoint), NATIVE_MAX_CHECKPOINT_CHARACTERS);
assert.deepEqual(cp.config.simulation, VARIANT_TWO_CONFIG);
const selectionText = fs.readFileSync(best.selectedFile, "utf8");
const selected = parseEvolution<{ selected: { generation: number; lineageVariantTwoGenerations: number; genome: { id: number } } }>(selectionText).selected;
const cohort = gunzipSync(fs.readFileSync(`${source}/generations/${String(selected.generation).padStart(5, "0")}.json.gz`)).toString();
assert.equal(sha256(cohort), cp.history[selected.generation-1].cohortHash);
const config = structuredClone(cp.config);
config.trainingSeedStream = stream; config.fitnessRiskWeight = risk;
const previousParameters = config.evolutionParameters; assert.ok(previousParameters);
config.evolutionParameters = { ...previousParameters, weightMutationRate: .02, weightMutationSigma: .03,
  weightResetRate: 0, addNodeRate: .01, addConnectionRate: .05, crossoverRate: .1 };
const priorSeeds = new Set(cp.history.flatMap(record => record.seeds));
const seeds = Array.from({ length: generations }, (_, g) => Array.from({ length: config.trainingSeeds }, (_, i) =>
  ((hash(config.seed, g * config.trainingSeedStride! + i, config.trainingSeedStream!) & 0x3fffffff) | config.trainingSeedPrefix!) >>> 0)).flat();
const evaluation = new Set([...parent.developmentSeeds, ...parent.confirmationDevelopmentSeeds, ...parent.finalMapsReserved]);
assert.ok(seeds.every(seed => !evaluation.has(seed)));
const files = [...fs.readdirSync("src/core").filter(f => f.endsWith(".ts")).map(f => `src/core/${f}`),
  ...fs.readdirSync("src/evolution").filter(f => f.endsWith(".ts")).map(f => `src/evolution/${f}`), "scripts/training/continue-variant-two.ts"].sort();
const protocol = { ...parent, version: 2, nativeCheckpointMaxCharacters: NATIVE_MAX_CHECKPOINT_CHARACTERS,
  run, initialization: "selected-cohort", initialGeneration: 0, generationCap: generations,
  parent: { directory: source, snapshotFile, snapshotSha256: head.snapshotSha256, checkpointGeneration: cp.generation },
  selectionOverride: { file: best.selectedFile, sha256: sha256(selectionText) },
  lineageOffset: selected.lineageVariantTwoGenerations, config, residualMutation: { rate: .15, sigma: .12 },
  inheritedSearchTrainingEpisodes: parent.inheritedSearchTrainingEpisodes +
    (cp.generation-parent.initialGeneration) * cp.config.population * cp.config.trainingSeeds,
  reusedInheritedTrainingMapPositions: seeds.filter(seed => priorSeeds.has(seed)).length,
  duplicateNewTrainingMapPositions: seeds.length-new Set(seeds).size,
  codeSha256: sha256(files.map(file => `${file}:${sha256(fs.readFileSync(file))}`).join("\n")),
  intervention: { type: "selected-cohort-with-small-inherited-weight-plasticity", sourceSelectedGeneration: selected.generation,
    sourceSelectedGenome: selected.genome.id, sourceDevelopmentMean256: best.meanRow,
    inheritedWeightsFrozen: false, smallAllWeightMutationRate: .02, smallAllWeightMutationSigma: .03,
    residualMutationRate: .15, residualMutationSigma: .12, fitnessRiskWeight: risk, trainingSeedStream: stream, physicsChanged: false,
    comparisonIsCombinedStrategyNotSingleParameterAblation: true } };
const directory = `.archive/results/variant-2/${run}`;
writeVariantTwoImmutable(`${directory}/protocol.json`, JSON.stringify(protocol, null, 2));
writeVariantTwoImmutable(`${directory}/source-code.json.gz`, gzipSync(JSON.stringify({ codeSha256: protocol.codeSha256,
  files: Object.fromEntries(files.map(file => [file, fs.readFileSync(file, "utf8")])) })));
console.log(JSON.stringify({ run, source, selectedGeneration: selected.generation, lineageOffset: protocol.lineageOffset,
  population: config.population, trainingMaps: config.trainingSeeds, plannedNewGenerations: generations }));
