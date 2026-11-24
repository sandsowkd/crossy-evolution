import fs from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { GLOBAL_OFFSET } from "../../src/core/observation";
import { type Config } from "../../src/core/types";
import { parseCheckpoint } from "../../src/evolution/checkpoint";
import { episode, evaluateGenome, mean, type Episode } from "../../src/evolution/evaluation";
import { heuristic } from "../../src/evolution/baselines";
import { BIAS, OUTPUT_START, cloneGenome, mutate, type Genome } from "../../src/evolution/genome";
import { Innovations } from "../../src/evolution/genome";
import { parseEvolution, stringifyEvolution } from "../../src/evolution/serialization";
import { VALIDATION_SEEDS } from "../../src/evolution/suites";
import { Trainer, type Checkpoint } from "../../src/evolution/trainer";
import { Replay } from "../../src/evolution/replay";

type Selected = { genome: Genome; generation: number; criterion: number; meanRow: number; episodes: Episode[] };
const ROOT = ".archive/results/variant-1/experiments/sensors";
const simulation: Config = { curriculum: "roads", maxTicks: 36000, difficulty: 1 };
let sourceModel: Selected | undefined;
function inheritedModel() {
  sourceModel ??= parseEvolution<Selected>(fs.readFileSync(".archive/results/variant-1/continued/selected.json", "utf8"));
  return sourceModel;
}
function summarize(e: Episode[]) {
  const scores = e.map((x) => x.score).sort((a, b) => a - b);
  return { mean: mean(scores), median: scores[Math.floor(scores.length / 2)], worst: scores[0], best: scores.at(-1), above1000: e.filter((x) => x.score >= 1000).length, timeouts: e.filter((x) => x.deathReason === "timeout").length, trees: e.filter((x) => x.deathReason === "tree").length, cars: e.filter((x) => x.deathReason === "car").length, bounds: e.filter((x) => x.deathReason === "bounds").length };
}
function validation(genome: Genome, generation: number): Selected {
  const episodes = evaluateGenome(genome, VALIDATION_SEEDS, simulation);
  const rows = episodes.map((e) => e.score).sort((a, b) => a - b);
  return { genome: cloneGenome(genome), generation, criterion: 0.5 * mean(rows) + 0.5 * mean(rows.slice(0, rows.length / 2)), meanRow: mean(rows), episodes };
}
function compactInitialization(trainer: Trainer) {
  // Random weights, deliberately compact sensor wiring; no rule or policy is inserted.
  for (const genome of trainer.neat.population) {
    genome.connections = [];
    const sensors = [BIAS, ...Array.from({ length: 10 }, (_, i) => GLOBAL_OFFSET + i)];
    for (const row of [2, 3, 4]) for (const col of [3, 4, 5]) for (const feature of [3, 4, 5, 7, 8]) sensors.push((row * 9 + col) * 9 + feature);
    for (let action = 0; action < 5; action++) for (const from of sensors) genome.connections.push({ innovation: trainer.neat.tracker.connection(from, OUTPUT_START + action), from, to: OUTPUT_START + action, weight: trainer.neat.rng.normal() * 0.3, enabled: true });
  }
}
function warmInitialization(trainer: Trainer, version: 1 | 2 | 3 | 4) {
  const original = inheritedModel();
  const source = parseCheckpoint(fs.readFileSync(".archive/results/variant-1/continued/checkpoint.json", "utf8"));
  trainer.neat.tracker = Innovations.load(source.neat.tracker);
  trainer.neat.population = Array.from({ length: trainer.config.population }, (_, i) => {
    const g = cloneGenome(original.genome);
    g.id = i;
    g.fitness = 0;
    g.species = 0;
    if (version !== 1) g.observationVersion = version;
    else delete g.observationVersion;
    if (i) mutate(g, trainer.neat.rng, trainer.neat.tracker, true);
    return g;
  });
  trainer.neat.nextId = trainer.config.population;
}
fs.mkdirSync(ROOT, { recursive: true });
const mode = process.argv[2] ?? "diagnose";
if (mode === "report") {
  const reports = fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((dir) => {
    const folder = path.join(ROOT, dir.name);
    if (!fs.existsSync(path.join(folder, "summary.json"))) return [];
    const summary = JSON.parse(fs.readFileSync(path.join(folder, "summary.json"), "utf8"));
    const crosscheckFile = path.join(folder, "crosscheck.json");
    const crosscheck = fs.existsSync(crosscheckFile) ? JSON.parse(fs.readFileSync(crosscheckFile, "utf8")) : undefined;
    return [{ run: dir.name, strategy: summary.strategy, config: summary.config, generations: summary.generations, trainingEpisodes: summary.trainingEpisodes, seconds: summary.seconds, originalValidation: summary.selected, A1Development: crosscheck ? { generation: crosscheck.generation, genome: crosscheck.genome, mean: crosscheck.mean, median: crosscheck.median, best: crosscheck.best, above1000: crosscheck.above1000, timeouts: crosscheck.timeouts, bounds: crosscheck.bounds, matchesCurrentOriginalSelection: crosscheck.genome === summary.selected.genome } : undefined }];
  });
  const controls = [];
  for (const strategy of ["compact-binary", "compact-distance", "compact-v3", "compact-v4"]) {
    const folder = path.join(ROOT, `${strategy}-p50-s8-r3002`);
    const summary = JSON.parse(fs.readFileSync(path.join(folder, "summary.json"), "utf8")) as { validation: { generation: number; genome: number; criterion: number }[] };
    const selected = summary.validation.filter((e) => e.generation <= 100).sort((a, b) => b.criterion - a.criterion)[0];
    const file = path.join(folder, "generations", `${String(selected.generation).padStart(5, "0")}.json.gz`);
    const genome = parseEvolution<{ contenders: Genome[] }>(gunzipSync(fs.readFileSync(file)).toString()).contenders.find((g) => g.id === selected.genome)!;
    const developmentSeeds = Array.from({ length: 64 }, (_, i) => (0xa1000000 + i * 65537) >>> 0);
    controls.push({ strategy, totalGenerations: 100, trainingEpisodes: 40000, initialSeed: 3002, selectedGeneration: selected.generation, genome: genome.id, ...summarize(evaluateGenome(genome, developmentSeeds, simulation)) });
  }
  const report = { uniqueTrainingEpisodes: reports.reduce((n, r) => n + r.trainingEpisodes, 0), evaluatedPopulations: reports.reduce((n, r) => n + r.generations, 0), evaluatedGenomes: reports.reduce((n, r) => n + r.generations * r.config.population, 0), reports, matched100GenerationSensorControls: controls, limitations: "Exploratory validation/development results, not untouched final tests. One shared initialization for four sensor controls; the second distance-sensor training seed was substantially worse. Wall times span parallel workloads and exact runtime optimizations, so compare episode budgets rather than treating timings as controlled benchmarks." };
  fs.writeFileSync(path.join(ROOT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} else if (mode === "target-select") {
  const folder = process.argv[3];
  if (!folder || !folder.startsWith(`${ROOT}/`)) throw new Error("Provide a sensor experiment directory");
  const checkpoint = parseCheckpoint(fs.readFileSync(path.join(folder, "checkpoint.json"), "utf8"));
  const summary = JSON.parse(fs.readFileSync(path.join(folder, "summary.json"), "utf8")) as { validation: { generation: number; genome: number; meanRow: number; criterion: number }[] };
  const candidates = [];
  let cohortGeneration = -1;
  let cohort: Genome[] = [];
  for (const entry of summary.validation) {
    if (entry.generation !== cohortGeneration) {
      const file = path.join(folder, "generations", `${String(entry.generation).padStart(5, "0")}.json.gz`);
      cohort = parseEvolution<{ contenders: Genome[] }>(gunzipSync(fs.readFileSync(file)).toString()).contenders;
      cohortGeneration = entry.generation;
    }
    const genome = cohort.find((g) => g.id === entry.genome);
    assert.ok(genome, `Missing archived genome ${entry.genome}`);
    const episodes = evaluateGenome(genome, VALIDATION_SEEDS, checkpoint.config.simulation);
    const rows = episodes.map((e) => e.score).sort((a, b) => a - b);
    const meanRow = mean(rows), clippedMean = mean(rows.map((s) => Math.min(s, 1500))), successRate = rows.filter((s) => s >= 1000).length / rows.length, lowerHalf = mean(rows.slice(0, rows.length / 2));
    assert.equal(meanRow, entry.meanRow, `Archived evaluation changed at generation ${entry.generation}, genome ${entry.genome}`);
    const utility = clippedMean + 500 * successRate + 0.25 * lowerHalf;
    candidates.push({ genome: cloneGenome(genome), generation: entry.generation, criterion: utility, legacyCriterion: entry.criterion, meanRow, clippedMean, successRate, lowerHalf, episodes });
  }
  candidates.sort((a, b) => b.criterion - a.criterion || b.meanRow - a.meanRow || a.generation - b.generation || a.genome.id - b.genome.id);
  const selectionRule = "mean(min(score,1500)) + 500 * P(score>=1000) + 0.25 * mean(worst half scores), on the existing64 B2 validation maps; goal-aware selection declared before fresh final testing";
  fs.writeFileSync(path.join(folder, "target-selected.json"), stringifyEvolution({ ...candidates[0], validationSeeds: VALIDATION_SEEDS, selectionRule, trainedGenerations: checkpoint.generation }));
  fs.writeFileSync(path.join(folder, "target-candidates.json"), stringifyEvolution({ candidates: candidates.slice(0, 5), validationSeeds: VALIDATION_SEEDS, selectionRule, trainedGenerations: checkpoint.generation }));
  fs.writeFileSync(path.join(folder, "target-selection-ledger.json"), JSON.stringify({ selectionRule, candidates: candidates.map(({ genome, episodes: _episodes, ...c }) => ({ ...c, genome: genome.id })) }, null, 2));
  console.log(JSON.stringify({ folder, candidates: candidates.length, top: candidates.slice(0, 5).map(({ genome, episodes, ...c }) => ({ ...c, genome: genome.id, ...summarize(episodes) })) }));
} else if (mode === "audit") {
  const reports = [];
  for (const dir of fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const folder = path.join(ROOT, dir.name);
    if (!fs.existsSync(path.join(folder, "checkpoint.json"))) continue;
    const checkpoint = parseCheckpoint(fs.readFileSync(path.join(folder, "checkpoint.json"), "utf8"));
    const selected = parseEvolution<Selected>(fs.readFileSync(path.join(folder, "selected.json"), "utf8"));
    const file = path.join(folder, "generations", `${String(selected.generation).padStart(5, "0")}.json.gz`);
    const cohort = parseEvolution<{ contenders: Genome[] }>(gunzipSync(fs.readFileSync(file)).toString()).contenders;
    assert.equal(cohort.length, checkpoint.config.population);
    assert.deepEqual(cohort.find((g) => g.id === selected.genome.id), selected.genome);
    const expected = selected.episodes[0];
    const actual = evaluateGenome(selected.genome, [expected.seed], checkpoint.config.simulation)[0];
    assert.deepEqual(actual, expected);
    const replay = new Replay([selected.genome], expected.seed, checkpoint.config.simulation);
    while (!replay.finished) replay.advance();
    assert.equal(replay.current.sim.agent.maxRow, expected.score);
    assert.equal(replay.current.sim.tick, expected.ticks);
    assert.equal(replay.current.sim.agent.deathReason, expected.deathReason);
    const report = { run: dir.name, completedGeneration: checkpoint.generation, selectedGeneration: selected.generation, selectedGenome: selected.genome.id, population: cohort.length, checkpointValid: true, archiveGenomeExact: true, evaluationExact: true, rendererReplayExact: true };
    reports.push(report);
    console.log(JSON.stringify(report));
  }
  fs.writeFileSync(path.join(ROOT, "archive-audit.json"), JSON.stringify(reports, null, 2));
} else if (mode === "verify-initialization") {
  const strategies = ["compact-binary", "compact-distance", "compact-v3", "compact-v4"];
  const cohorts = strategies.map((strategy) => {
    const file = path.join(ROOT, `${strategy}-p50-s8-r3002`, "generations", "00001.json.gz");
    const genomes = parseEvolution<{ contenders: Genome[] }>(gunzipSync(fs.readFileSync(file)).toString()).contenders;
    return { strategy, genomes: genomes.sort((a, b) => a.id - b.id).map((g) => ({ id: g.id, nodes: g.nodes, connections: g.connections })) };
  });
  const reference = JSON.stringify(cohorts[0].genomes);
  const matches = cohorts.map((c) => ({ strategy: c.strategy, exactInitialNodesConnectionsAndWeights: JSON.stringify(c.genomes) === reference, population: c.genomes.length }));
  if (matches.some((m) => !m.exactInitialNodesConnectionsAndWeights)) throw new Error("Initial network arrays differ across sensor versions");
  fs.writeFileSync(path.join(ROOT, "initialization-verification.json"), JSON.stringify({ seed: 3002, population: 50, trainingSeeds: 8, matches }, null, 2));
  console.log(JSON.stringify(matches));
} else if (mode === "crosscheck") {
  const input = process.argv[3];
  if (!input) throw new Error("A selected.json path is required");
  const selected = parseEvolution<Selected>(fs.readFileSync(input, "utf8"));
  const developmentSeeds = Array.from({ length: 64 }, (_, i) => (0xa1000000 + i * 65537) >>> 0);
  const episodes = evaluateGenome(selected.genome, developmentSeeds, simulation);
  const result = { input, generation: selected.generation, genome: selected.genome.id, developmentSeeds, simulation, ...summarize(episodes), episodes };
  fs.writeFileSync(path.join(path.dirname(input), "crosscheck.json"), JSON.stringify(result));
  console.log(JSON.stringify({ ...result, episodes: undefined, developmentSeeds: undefined }));
} else if (mode === "ablate") {
  const original = inheritedModel();
  const candidates: [string, Genome][] = [];
  for (const version of [1, 2] as const) for (const mode of ["no-clock", "globals-only", "no-side-sensors", "no-old-rows"]) {
    const genome = cloneGenome(original.genome);
    if (version === 2) genome.observationVersion = 2;
    for (const edge of genome.connections) {
      if ((mode === "no-clock" && [GLOBAL_OFFSET + 1, GLOBAL_OFFSET + 2].includes(edge.from)) ||
          (mode === "globals-only" && edge.from < GLOBAL_OFFSET) ||
          (mode === "no-side-sensors" && edge.from < GLOBAL_OFFSET && Math.abs((Math.floor(edge.from / 9) % 9) - 4) > 1) ||
          (mode === "no-old-rows" && edge.from < 2 * 9 * 9)) edge.enabled = false;
    }
    candidates.push([`v${version}-${mode}`, genome]);
  }
  const results = [];
  for (const [name, genome] of candidates) {
    const selected = validation(genome, 0);
    results.push({ name, ...selected });
    console.log(JSON.stringify({ name, criterion: selected.criterion, ...summarize(selected.episodes) }));
  }
  fs.writeFileSync(path.join(ROOT, "ablation-candidates.json"), stringifyEvolution(results));
} else if (mode === "diagnose") {
  const original = inheritedModel();
  const distance = cloneGenome(original.genome);
  distance.observationVersion = 2;
  const output = {
    simulation,
    seeds: VALIDATION_SEEDS,
    binary: evaluateGenome(original.genome, VALIDATION_SEEDS, simulation),
    distance: evaluateGenome(distance, VALIDATION_SEEDS, simulation),
    distanceRule: VALIDATION_SEEDS.map((seed) => episode(heuristic, seed, simulation, undefined, undefined, 2)),
  };
  fs.writeFileSync(path.join(ROOT, "initial-diagnostic.json"), JSON.stringify(output));
  console.log(JSON.stringify(Object.fromEntries(["binary", "distance", "distanceRule"].map((key) => [key, summarize(output[key as "binary"])]))));
} else {
  const strategy = process.argv[2], population = Number(process.argv[3] ?? 100), trainingSeeds = Number(process.argv[4] ?? 4), generations = Number(process.argv[5] ?? 100), seed = Number(process.argv[6] ?? 3001);
  if (!["warm-binary", "warm-distance", "fresh-distance", "compact-distance", "compact-binary", "compact-v3", "warm-v3", "compact-v4", "warm-v4"].includes(strategy) || ![50, 100, 200].includes(population)) throw new Error("Invalid experiment strategy or population");
  if (!Number.isInteger(trainingSeeds) || trainingSeeds < 1 || trainingSeeds > 16 || !Number.isInteger(generations) || generations < 1 || !Number.isInteger(seed)) throw new Error("Training maps must be 1–16, generations positive, and seed an integer");
  const runName = `${strategy}-p${population}-s${trainingSeeds}-r${seed}`, output = path.join(ROOT, runName);
  fs.mkdirSync(path.join(output, "generations"), { recursive: true });
  const resume = process.argv.includes("--resume");
  const checkpointFile = path.join(output, "checkpoint.json");
  if (!resume && fs.existsSync(checkpointFile)) throw new Error("Run exists; use --resume with a larger total generation target");
  const trainer = resume
    ? Trainer.restore(parseCheckpoint(fs.readFileSync(checkpointFile, "utf8")))
    : new Trainer({ population, seed, trainingSeeds, simulation, autoCurriculum: false, profile: "robust-v2", ...(!strategy.endsWith("binary") ? { observationVersion: strategy.endsWith("v4") ? 4 as const : strategy.endsWith("v3") ? 3 as const : 2 as const } : {}) });
  if (!resume && strategy.startsWith("warm")) warmInitialization(trainer, strategy === "warm-binary" ? 1 : strategy === "warm-distance" ? 2 : strategy.endsWith("v4") ? 4 : 3);
  else if (!resume && strategy.startsWith("compact")) compactInitialization(trainer);
  let best: Selected | undefined = resume ? parseEvolution<Selected>(fs.readFileSync(path.join(output, "selected.json"), "utf8")) : undefined;
  const priorSummary = resume ? JSON.parse(fs.readFileSync(path.join(output, "summary.json"), "utf8")) as { seconds: number; validation: { generation: number; genome: number; meanRow: number; criterion: number }[] } : { seconds: 0, validation: [] };
  const ledger = priorSummary.validation;
  const started = performance.now();
  let stopRequested = false;
  process.on("SIGINT", () => { stopRequested = true; });
  process.on("SIGTERM", () => { stopRequested = true; });
  function save() {
    const checkpoint: Checkpoint = trainer.checkpoint();
    fs.writeFileSync(path.join(output, "checkpoint.json"), stringifyEvolution(checkpoint));
    fs.writeFileSync(path.join(output, "selected.json"), stringifyEvolution({ ...best, validationSeeds: VALIDATION_SEEDS, selectionRule: "0.5 mean + 0.5 lower-half mean score on 64 validation maps; 600-second road episodes", provenance: { strategy, sourceGenome: strategy.startsWith("warm") ? inheritedModel().genome.id : undefined, sourceGeneration: strategy.startsWith("warm") ? inheritedModel().generation : undefined } }));
    fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify({ run: runName, strategy, config: trainer.config, requestedGenerations: generations, generations: trainer.generation, seconds: priorSummary.seconds + (performance.now() - started) / 1000, trainingEpisodes: trainer.generation * population * trainingSeeds, validation: ledger, selected: best && { generation: best.generation, genome: best.genome.id, criterion: best.criterion, ...summarize(best.episodes) } }, null, 2));
  }
  for (let i = trainer.generation; i < generations; i++) {
    const record = trainer.runGeneration();
    const file = `${String(record.generation).padStart(5, "0")}.json.gz`;
    fs.writeFileSync(path.join(output, "generations", file), gzipSync(stringifyEvolution({ contenders: record.contenders })));
    record.cohortFile = `/training-cohorts/${file}`;
    if (record.generation === 1 || record.generation % 10 === 0 || i === generations - 1) {
      for (const genome of record.contenders.slice(0, 3)) {
        const candidate = validation(genome, record.generation);
        ledger.push({ generation: record.generation, genome: genome.id, meanRow: candidate.meanRow, criterion: candidate.criterion });
        if (!best || candidate.criterion > best.criterion) best = candidate;
      }
      console.log(JSON.stringify({ run: runName, generation: record.generation, trainMean: record.meanRow, trainMax: record.maxRow, monitor: record.evalRow, selected: best && summarize(best.episodes), selectedGeneration: best?.generation, criterion: best?.criterion, seconds: priorSummary.seconds + (performance.now() - started) / 1000 }));
    }
    record.contenders = [record.champion];
    if (record.generation % 10 === 0 || i === generations - 1) save();
    // Give termination signals a completed-generation boundary for a resumable save.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (stopRequested) { save(); break; }
  }
}
