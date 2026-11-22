import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { setImmediate } from "node:timers/promises";
import { Trainer, type TrainingConfig, type Checkpoint } from "../src/evolution/trainer";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { type Genome } from "../src/evolution/genome";
import { Innovations } from "../src/evolution/genome";
import { RNG, hash } from "../src/core/rng";
import { VARIANT_TWO_CONFIG } from "../src/core/upstream";
import { evaluateGenome } from "../src/evolution/evaluation";
import { Replay } from "../src/evolution/replay";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { connectRiverInputs, mutateRiverInputs } from "../src/evolution/variant-two-residual";
import { acquireVariantTwoLock, sha256, writeVariantTwoAtomic as atomic, writeVariantTwoImmutable as immutable,
  summarizeVariantTwo, VARIANT_TWO_DEVELOPMENT_SEEDS, VARIANT_TWO_RESERVED_FINAL_SEEDS,
  type VariantTwoSelection, type VariantTwoNomination } from "../src/evolution/variant-two-experiment";

const option = (name: string, fallback = "") => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const command = process.argv[2], run = option("run");
assert.match(run, /^transfer-[a-z0-9-]{1,48}$/);
const directory = `results/variants/variant-2/${run}`, protocolFile = `${directory}/protocol.json`;
type Selection = VariantTwoSelection & {directory: string; lineageVariantTwoGenerations: number};
type Snapshot = {format: "crossy-v2-continuation-snapshot"; version: 1; protocolSha256: string;
  checkpoint: Checkpoint; selected: Selection; nominations: VariantTwoNomination[];
  seconds: number; developmentEpisodes: number; previousSnapshotSha256: string | null;
  knownRepeatedTrainingEpisodes: number};
type Protocol = {format: "crossy-v2-continuation"; version: 1; run: string; mode: "normal" | "river-inputs";
  initialization?: "resume" | "selected-cohort"; selectionOverride?: {file: string; sha256: string};
  parent: {directory: string; snapshotFile: string; snapshotSha256: string; checkpointGeneration: number};
  initialGeneration: number; generationCap: number; lineageOffset: number; inheritedVariantOnePhasePositions: number;
  inheritedSearchTrainingEpisodes: number; config: TrainingConfig; developmentSeeds: number[];
  reusedInheritedTrainingMapPositions?: number; duplicateNewTrainingMapPositions?: number;
  residualMutation?: {rate: number; sigma: number};
  confirmationDevelopmentSeeds: number[]; finalMapsReserved: number[]; checkpointEvery: number; codeSha256: string};
const codeFiles = [...fs.readdirSync("src/core").filter(f => f.endsWith(".ts")).map(f => `src/core/${f}`),
  ...fs.readdirSync("src/evolution").filter(f => f.endsWith(".ts")).map(f => `src/evolution/${f}`),
  "scripts/continue-variant-two.ts"].sort();
const codeHash = () => sha256(codeFiles.map(f => `${f}:${sha256(fs.readFileSync(f))}`).join("\n"));
function readHead(source: string) {
  const head = JSON.parse(fs.readFileSync(`${source}/HEAD.json`, "utf8")) as {generation: number; snapshotSha256: string};
  const file = `${source}/snapshots/${String(head.generation).padStart(5, "0")}.json`;
  const text = fs.readFileSync(file, "utf8"); assert.equal(sha256(text), head.snapshotSha256);
  return {head, file, snapshot: parseEvolution<Snapshot>(text)};
}
function cohort(source: string, generation: number) {
  const file = `${source}/generations/${String(generation).padStart(5, "0")}.json.gz`;
  return {file, text: gunzipSync(fs.readFileSync(file)).toString()};
}
function checkArchives(source: string, checkpoint: Checkpoint) {
  for (const record of checkpoint.history) {
    const data = cohort(source, record.generation);
    assert.equal(sha256(data.text), record.cohortHash);
    const genomes = parseEvolution<{contenders: Genome[]}>(data.text).contenders;
    assert.equal(genomes.length, record.populationSize);
    assert.equal(new Set(genomes.map(g => g.id)).size, genomes.length);
  }
}
function readSelection(saved: Snapshot, source: string, offset = 0): Selection {
  assert.ok(saved.selected);
  return {...saved.selected, directory: saved.selected.directory ?? source,
    lineageVariantTwoGenerations: saved.selected.lineageVariantTwoGenerations ?? offset + saved.selected.generation};
}
if (command === "prepare") {
  assert.equal(fs.existsSync(protocolFile), false, "Choose an unused continuation run ID");
  const source = option("parent", "results/variants/variant-2/paired-004/transfer");
  const mode = option("mode", "normal") as Protocol["mode"]; assert.ok(["normal", "river-inputs"].includes(mode));
  const additional = Number(option("generations", "128")); assert.ok(Number.isInteger(additional) && additional > 0 && additional <= 512);
  const {head, file, snapshot: parent} = readHead(source);
  const checkpoint = parseCheckpoint(stringifyEvolution(parent.checkpoint)); checkArchives(source, checkpoint);
  assert.deepEqual(checkpoint.config.simulation, VARIANT_TWO_CONFIG);
  const previousProtocolFile = fs.existsSync(`${source}/protocol.json`) ? `${source}/protocol.json` : `${path.dirname(source)}/protocol.json`;
  const previousProtocol = JSON.parse(fs.readFileSync(previousProtocolFile, "utf8")) as Partial<Protocol>;
  const offset = previousProtocol.lineageOffset ?? 0;
  let selected = readSelection(parent, source, offset);
  const initialization = option("initialize", mode === "normal" ? "resume" : "selected-cohort") as "resume" | "selected-cohort";
  assert.ok(["resume", "selected-cohort"].includes(initialization));
  const selectionFile = option("selection");
  let selectionOverride: Protocol["selectionOverride"];
  if (selectionFile) {
    assert.equal(initialization, "selected-cohort");
    const text = fs.readFileSync(selectionFile, "utf8"); selectionOverride = {file: selectionFile, sha256: sha256(text)};
    selected = parseEvolution<{selected: Selection}>(text).selected;
    const genomes = parseEvolution<{contenders: Genome[]}>(cohort(selected.directory, selected.generation).text).contenders;
    assert.deepEqual(genomes.find(g => g.id === selected.genome.id), selected.genome);
    assert.deepEqual(evaluateGenome(selected.genome, VARIANT_TWO_DEVELOPMENT_SEEDS, checkpoint.config.simulation), selected.episodes);
  }
  const config = structuredClone(checkpoint.config);
  if (mode === "river-inputs" && initialization === "selected-cohort") {
    config.population = 200;
    config.trainingSeedStream = Number(option("stream", "2401"));
    config.evolutionParameters = {weightMutationRate: 0, weightMutationSigma: 0, weightResetRate: 0,
      addNodeRate: .02, addConnectionRate: .15, toggleConnectionRate: 0, crossoverRate: 0, parentFraction: .3,
      speciesThresholdFloor: .05, speciesThresholdStep: .004};
  }
  if (mode === "river-inputs" && initialization === "resume") assert.equal(previousProtocol.mode, "river-inputs");
  const maps = Number(option("maps", String(config.trainingSeeds)));
  assert.ok(Number.isInteger(maps) && maps >= 1 && maps <= 64);
  if (maps !== config.trainingSeeds) {config.trainingSeeds = maps; config.trainingSeedStride = maps + 5;}
  config.fitnessRiskWeight = Number(option("risk", String(config.fitnessRiskWeight ?? 0)));
  assert.ok(Number.isFinite(config.fitnessRiskWeight) && config.fitnessRiskWeight >= 0 && config.fitnessRiskWeight <= 1);
  const residualMutation = {
    rate: Number(option("mutation-rate", String(previousProtocol.residualMutation?.rate ?? .3))),
    sigma: Number(option("mutation-sigma", String(previousProtocol.residualMutation?.sigma ?? .35))),
  };
  assert.ok(Number.isFinite(residualMutation.rate) && residualMutation.rate >= 0 && residualMutation.rate <= 1);
  assert.ok(Number.isFinite(residualMutation.sigma) && residualMutation.sigma > 0 && residualMutation.sigma <= 2);
  const initial = initialization === "resume" ? checkpoint.generation : 0;
  const confirmation = Array.from({length: 256}, (_, i) => (0x98000000 + i * 65537) >>> 0);
  assert.ok(confirmation.every(seed => !VARIANT_TWO_RESERVED_FINAL_SEEDS.includes(seed) && !VARIANT_TWO_DEVELOPMENT_SEEDS.includes(seed)));
  const priorSeeds = new Set(checkpoint.history.flatMap(record => record.seeds));
  const newSeeds = Array.from({length: additional}, (_, g) => Array.from({length: config.trainingSeeds}, (_, i) =>
    ((hash(config.seed, (initial + g) * config.trainingSeedStride! + i, config.trainingSeedStream!) & 0x3fffffff) | config.trainingSeedPrefix!) >>> 0)).flat();
  // Revisiting a training map is valid and does not change the deterministic seed stream.
  // Record it separately; training/development/final overlap remains forbidden.
  const reusedInheritedTrainingMapPositions = newSeeds.filter(seed => priorSeeds.has(seed)).length;
  const duplicateNewTrainingMapPositions = newSeeds.length - new Set(newSeeds).size;
  assert.ok(newSeeds.every(seed => !confirmation.includes(seed) && !VARIANT_TWO_DEVELOPMENT_SEEDS.includes(seed) &&
    !VARIANT_TWO_RESERVED_FINAL_SEEDS.includes(seed)), "Training and evaluation maps overlap");
  const p: Protocol = {format: "crossy-v2-continuation", version: 1, run, mode, initialization,
    ...(selectionOverride ? {selectionOverride} : {}),
    parent: {directory: source, snapshotFile: file, snapshotSha256: head.snapshotSha256, checkpointGeneration: checkpoint.generation},
    initialGeneration: initial, generationCap: initial + additional,
    lineageOffset: initialization === "resume" ? offset : selected.lineageVariantTwoGenerations,
    inheritedVariantOnePhasePositions: previousProtocol.inheritedVariantOnePhasePositions ?? 1174,
    inheritedSearchTrainingEpisodes: (previousProtocol.inheritedSearchTrainingEpisodes ?? 0) +
      (checkpoint.generation - (previousProtocol.initialGeneration ?? 0)) * checkpoint.config.population * checkpoint.config.trainingSeeds,
    reusedInheritedTrainingMapPositions, duplicateNewTrainingMapPositions,
    config, residualMutation, developmentSeeds: VARIANT_TWO_DEVELOPMENT_SEEDS, confirmationDevelopmentSeeds: confirmation,
    finalMapsReserved: VARIANT_TWO_RESERVED_FINAL_SEEDS, checkpointEvery: 8, codeSha256: codeHash()};
  immutable(protocolFile, JSON.stringify(p, null, 2));
  immutable(`${directory}/source-code.json.gz`, gzipSync(JSON.stringify({codeSha256: p.codeSha256,
    files: Object.fromEntries(codeFiles.map(file => [file, fs.readFileSync(file, "utf8")]))})));
  console.log(JSON.stringify({run, mode, startingGeneration: initial, stoppingGeneration: p.generationCap,
    lineageOffset: p.lineageOffset, population: config.population}));
  process.exit(0);
}
const protocol = JSON.parse(fs.readFileSync(protocolFile, "utf8")) as Protocol;
const protocolHash = sha256(JSON.stringify(protocol));
function commit(snapshot: Snapshot) {
  parseCheckpoint(stringifyEvolution(snapshot.checkpoint));
  const encoded = stringifyEvolution(snapshot), hash = sha256(encoded), generation = snapshot.checkpoint.generation;
  immutable(`${directory}/snapshots/${String(generation).padStart(5, "0")}.json`, encoded);
  atomic(`${directory}/checkpoint.json`, stringifyEvolution(snapshot.checkpoint));
  atomic(`${directory}/selected.json`, stringifyEvolution({selected: snapshot.selected}));
  atomic(`${directory}/summary.json`, JSON.stringify({run, mode: protocol.mode, generation,
    initialGeneration: protocol.initialGeneration, generationCap: protocol.generationCap,
    newGenerations: generation - protocol.initialGeneration, population: protocol.config.population,
    newTrainingEpisodes: (generation - protocol.initialGeneration) * protocol.config.population * protocol.config.trainingSeeds,
    residualMutation: protocol.residualMutation ?? {rate: .3, sigma: .35}, fitnessRiskWeight: protocol.config.fitnessRiskWeight,
    inheritedSearchTrainingEpisodes: protocol.inheritedSearchTrainingEpisodes,
    inheritedVariantOnePhasePositions: protocol.inheritedVariantOnePhasePositions,
    lineageVariantTwoGenerations: protocol.lineageOffset + generation,
    selected: {...snapshot.selected, genome: snapshot.selected.genome.id, episodes: undefined},
    seconds: snapshot.seconds, developmentEpisodes: snapshot.developmentEpisodes,
    knownRepeatedTrainingEpisodes: snapshot.knownRepeatedTrainingEpisodes, finalMapsOpened: false}, null, 2));
  atomic(`${directory}/HEAD.json`, JSON.stringify({generation, snapshotSha256: hash}));
  return hash;
}
if (command === "verify") {
  const {head, snapshot} = readHead(directory); assert.equal(snapshot.protocolSha256, protocolHash);
  const checkpoint = parseCheckpoint(stringifyEvolution(snapshot.checkpoint)); checkArchives(directory, checkpoint);
  const selected = snapshot.selected, data = cohort(selected.directory, selected.generation);
  const genomes = parseEvolution<{contenders: Genome[]}>(data.text).contenders;
  assert.deepEqual(genomes.find(g => g.id === selected.genome.id), selected.genome);
  const episodes = evaluateGenome(selected.genome, protocol.developmentSeeds, protocol.config.simulation);
  assert.deepEqual(episodes, selected.episodes);
  const [expected] = evaluateGenome(selected.genome, [42], protocol.config.simulation);
  const replay = new Replay([selected.genome], 42, protocol.config.simulation);
  while (!replay.finished) replay.advance();
  assert.equal(replay.current.sim.agent.maxRow, expected.score); assert.equal(replay.current.sim.tick, expected.ticks);
  assert.equal(replay.current.sim.agent.deathReason, expected.deathReason);
  const confirmation = evaluateGenome(selected.genome, protocol.confirmationDevelopmentSeeds, protocol.config.simulation);
  const report = {run, checkpointGeneration: head.generation, checkpointSha256: head.snapshotSha256,
    selected: {...selected, genome: selected.genome.id, episodes: undefined},
    development64: summarizeVariantTwo(episodes), confirmationDevelopment256: summarizeVariantTwo(confirmation),
    confirmationEpisodes: confirmation, allPopulationArchivesVerified: checkpoint.history.length,
    replayMatched: true, finalMapsOpened: false};
  atomic(`${directory}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({...report, confirmationEpisodes: undefined}, null, 2));
  if (process.argv.includes("--publish")) {
    const bestFile = "results/variants/variant-2/best-development.json";
    const old = fs.existsSync(bestFile) ? JSON.parse(fs.readFileSync(bestFile, "utf8")) as {meanRow: number} : null;
    if (!old || report.confirmationDevelopment256.meanRow > old.meanRow) {
      // Both are development suites. Reserved final maps are never evaluated here.
      atomic(bestFile, JSON.stringify({run, meanRow: report.confirmationDevelopment256.meanRow,
        selectedDirectory: selected.directory, generation: selected.generation, genome: selected.genome.id,
        developmentMaps: protocol.confirmationDevelopmentSeeds, verificationFile: `${directory}/verification.json`}, null, 2));
      atomic("public/variant-2/transfer.json", stringifyEvolution({branch: `transfer · ${run}`, generation: selected.generation,
        genomes, selectedGenome: selected.genome.id, seed: 42, simulation: protocol.config.simulation, meanRow: report.confirmationDevelopment256.meanRow}));
      console.log("Published stronger development-selected population.");
    } else console.log("Preserved stronger published population.");
  }
  process.exit(0);
}
assert.equal(command, "run"); assert.equal(protocol.codeSha256, codeHash(), "Continuation code changed; declare a new run");
const release = acquireVariantTwoLock(directory, "transfer", protocolHash);
let stopping = false; process.on("SIGTERM", () => {stopping = true;}); process.on("SIGINT", () => {stopping = true;});
try {
  let snapshot: Snapshot, trainer: Trainer, previous: string;
  if (process.argv.includes("--resume")) {
    const saved = readHead(directory); snapshot = saved.snapshot; previous = saved.head.snapshotSha256;
    assert.equal(snapshot.protocolSha256, protocolHash); checkArchives(directory, snapshot.checkpoint);
    trainer = Trainer.restore(parseCheckpoint(stringifyEvolution(snapshot.checkpoint)));
  } else {
    assert.equal(fs.existsSync(`${directory}/HEAD.json`), false, "Existing run requires --resume");
    const text = fs.readFileSync(protocol.parent.snapshotFile, "utf8"); assert.equal(sha256(text), protocol.parent.snapshotSha256);
    const parent = parseEvolution<Snapshot>(text), cp = parseCheckpoint(stringifyEvolution(parent.checkpoint));
    const parentProtocolPath = fs.existsSync(`${protocol.parent.directory}/protocol.json`) ? `${protocol.parent.directory}/protocol.json` : `${path.dirname(protocol.parent.directory)}/protocol.json`;
    const parentOffset = (JSON.parse(fs.readFileSync(parentProtocolPath, "utf8")) as Partial<Protocol>).lineageOffset ?? 0;
    let selected = readSelection(parent, protocol.parent.directory, parentOffset);
    if (protocol.selectionOverride) {
      const text = fs.readFileSync(protocol.selectionOverride.file, "utf8");
      assert.equal(sha256(text), protocol.selectionOverride.sha256);
      selected = parseEvolution<{selected: Selection}>(text).selected;
    }
    trainer = Trainer.restore(cp);
    trainer.config = structuredClone(protocol.config);
    trainer.neat.parameters = structuredClone(protocol.config.evolutionParameters);
    // Compact history is representational only: every full cohort remains losslessly archived.
    for (const record of trainer.history) record.contenders = [structuredClone(record.champion)];
    if ((protocol.initialization ?? (protocol.mode === "normal" ? "resume" : "selected-cohort")) === "resume") {
      fs.mkdirSync(`${directory}/generations`, {recursive: true});
      for (const record of trainer.history) {
        const original = cohort(protocol.parent.directory, record.generation);
        fs.copyFileSync(original.file, `${directory}/generations/${path.basename(original.file)}`, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE);
      }
    } else {
      const original = parseEvolution<{contenders: Genome[]}>(cohort(selected.directory, selected.generation).text).contenders;
      assert.ok(original.some(g => g.id === selected.genome.id));
      trainer.generation = 0; trainer.history = []; trainer.neat.generation = 0;
      trainer.neat.tracker = Innovations.load(cp.neat.tracker);
      trainer.neat.rng = new RNG(hash(cp.neat.rng, 0, 2701));
      trainer.neat.population = original.map(g => {const child = structuredClone(g); child.fitness = 0; return child;});
      for (const genome of trainer.neat.population) connectRiverInputs(genome, trainer.neat.tracker);
      for (let i = trainer.neat.population.length; i < protocol.config.population; i++) {
        const child = structuredClone(trainer.neat.population[i % original.length]); child.id = trainer.neat.nextId++;
        mutateRiverInputs(child, trainer.neat.rng, protocol.residualMutation?.rate, protocol.residualMutation?.sigma); trainer.neat.population.push(child);
      }
      trainer.neat.size = protocol.config.population; trainer.neat.species = []; trainer.neat.progress.clear();
      trainer.neat.threshold = .12;
    }
    snapshot = {format: "crossy-v2-continuation-snapshot", version: 1, protocolSha256: protocolHash,
      checkpoint: trainer.checkpoint(), selected, nominations: [], seconds: 0, developmentEpisodes: 0,
      previousSnapshotSha256: protocol.parent.snapshotSha256, knownRepeatedTrainingEpisodes: 0};
    previous = commit(snapshot);
  }
  const started = performance.now(), priorSeconds = snapshot.seconds;
  for (let g = trainer.generation; g < protocol.generationCap && !stopping; g++) {
    const record = trainer.runGeneration(), all = record.contenders;
    const payload = stringifyEvolution({contenders: all}), filename = `${String(record.generation).padStart(5, "0")}.json.gz`;
    assert.equal(all.length, protocol.config.population);
    const populationFile = `${directory}/generations/${filename}`;
    if (fs.existsSync(populationFile)) {
      assert.equal(gunzipSync(fs.readFileSync(populationFile)).toString(), payload, "Orphan population does not reproduce");
      snapshot.knownRepeatedTrainingEpisodes += all.length * protocol.config.trainingSeeds;
    } else immutable(populationFile, gzipSync(payload, {level: 3}));
    record.cohortFile = `/training-cohorts/${run}/${filename}`; record.cohortHash = sha256(payload);
    if (record.generation === protocol.initialGeneration + 1 || record.generation % 4 === 0 || record.generation === protocol.generationCap) {
      for (const genome of all.slice(0, 5)) {
        const episodes = evaluateGenome(genome, protocol.developmentSeeds, trainer.config.simulation);
        const metrics = summarizeVariantTwo(episodes); snapshot.developmentEpisodes += episodes.length;
        snapshot.nominations.push({...metrics, generation: record.generation, genome: genome.id});
        if (metrics.meanRow > snapshot.selected.meanRow) snapshot.selected = {...metrics, generation: record.generation,
          genome: structuredClone(genome), episodes, directory, lineageVariantTwoGenerations: protocol.lineageOffset + record.generation};
      }
    }
    record.contenders = [structuredClone(record.champion)];
    if (protocol.mode === "river-inputs")
      for (const genome of trainer.neat.population.slice(trainer.neat.species.length))
        mutateRiverInputs(genome, trainer.neat.rng, protocol.residualMutation?.rate, protocol.residualMutation?.sigma);
    const seconds = priorSeconds + (performance.now() - started) / 1000;
    atomic(`${directory}/progress.json`, JSON.stringify({generation: record.generation, stoppingAt: protocol.generationCap,
      trainMean: record.meanRow, bestDevelopment64: snapshot.selected.meanRow, seconds, updatedAt: new Date().toISOString()}));
    if (record.generation % protocol.checkpointEvery === 0 || stopping || record.generation === protocol.generationCap) {
      snapshot = {...snapshot, checkpoint: trainer.checkpoint(), seconds, previousSnapshotSha256: previous}; previous = commit(snapshot);
    }
    console.log(`${run} generation=${record.generation}/${protocol.generationCap} trainMean=${record.meanRow.toFixed(2)} development64=${snapshot.selected.meanRow.toFixed(2)} seconds=${seconds.toFixed(1)}`);
    await setImmediate(); // Deliver stop signals at completed generation boundaries.
  }
  if (snapshot.checkpoint.generation !== trainer.generation) {
    snapshot = {...snapshot, checkpoint: trainer.checkpoint(), seconds: priorSeconds + (performance.now() - started) / 1000,
      previousSnapshotSha256: previous}; commit(snapshot);
  }
  atomic(`${directory}/status.json`, JSON.stringify({status: stopping ? "paused-at-generation-boundary" : "completed-bounded-run",
    generation: trainer.generation, updatedAt: new Date().toISOString(), finalMapsOpened: false}));
} finally {release();}
