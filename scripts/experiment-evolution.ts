/** Warm-start NEAT experiments. Development maps only; no final test suite. */
import fs from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { RNG, hash } from "../src/core/rng";
import { type Config } from "../src/core/types";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { evaluateGenome, mean, type Episode } from "../src/evolution/evaluation";
import {
  addConnection, addNode, cloneGenome, crossover,
  type Genome, type EvolutionParameters,
} from "../src/evolution/genome";
import { NEAT, type Species } from "../src/evolution/neat";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { type Checkpoint, type Generation, type TrainingConfig } from "../src/evolution/trainer";

type Profile = {
  name: string; population: 50 | 100 | 200; seeds: number; generations: number;
  sigma: number; fraction: number; reset: number; node: number; edge: number;
  crossover: number; risk: number; parentFraction: number;
};
const profiles: Profile[] = [
  { name: "precise-50", population: 50, seeds: 8, generations: 50, sigma: .045,
    fraction: .12, reset: 0, node: .01, edge: .04, crossover: .25, risk: .5, parentFraction: .25 },
  { name: "balanced-100", population: 100, seeds: 8, generations: 25, sigma: .09,
    fraction: .20, reset: .0025, node: .03, edge: .15, crossover: .5, risk: .5, parentFraction: .3 },
  { name: "diverse-200", population: 200, seeds: 8, generations: 13, sigma: .18,
    fraction: .25, reset: .015, node: .08, edge: .3, crossover: .75, risk: .5, parentFraction: .4 },
  { name: "risk-100", population: 100, seeds: 16, generations: 13, sigma: .065,
    fraction: .15, reset: .001, node: .02, edge: .1, crossover: .4, risk: .8, parentFraction: .25 },
];
const root = process.argv[2] ?? "results/experiments/evolution";
const source = process.argv[3] ?? "results/continued";
const choose = process.argv[4]?.startsWith("--") ? undefined : process.argv[4];
const resume = process.argv.includes("--resume");
const limitFlag = process.argv.indexOf("--generations");
if (limitFlag !== -1) {
  const limit = Number(process.argv[limitFlag + 1]);
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid generation limit");
  for (const profile of profiles) profile.generations = limit;
}
const simulation: Config = { curriculum: "roads", maxTicks: 36000, difficulty: 1 };
const developmentSeeds = Array.from({ length: 64 }, (_, i) => (0xa1000000 + i * 65537) >>> 0);
const ancestor = parseEvolution<{ genome: Genome; generation?: number }>(fs.readFileSync(path.join(source, "selected.json"), "utf8"));
const baseline = ancestor.genome;
const sourceCheckpoint = parseCheckpoint(fs.readFileSync(path.join(source, "checkpoint.json"), "utf8"));
const sourceInnovations = new Map(sourceCheckpoint.neat.tracker.connections);
if (baseline.connections.some((c) => sourceInnovations.get(`${c.from}:${c.to}`) !== c.innovation)
  || baseline.nodes.some((n) => n.kind === "hidden" && n.id >= sourceCheckpoint.neat.tracker.nextNode))
  throw new Error("Warm-start genome and innovation tracker are not from a coherent checkpoint");
const ancestry = { source, checkpointGeneration: sourceCheckpoint.generation,
  selectedGeneration: ancestor.generation, selectedGenome: baseline.id,
  observationVersion: baseline.observationVersion ?? 1, config: sourceCheckpoint.config };
type Selection = { genome: Genome; generation: number; criterion: number; meanRow: number; episodes: Episode[]; goalUtility: number };
type Validation = { generation: number; genome: number; criterion: number; meanRow: number; goalUtility: number };
type Run = { profile: Profile; neat: NEAT; history: Generation[]; selected: Selection; targetSelected: Selection;
  validation: Validation[]; generation: number; seconds: number; evaluations: number; validationEvaluations: number };

function mutate(g: Genome, n: NEAT, p: Profile) {
  for (const c of g.connections) {
    if (n.rng.next() >= p.fraction) continue;
    c.weight = Math.max(-8, Math.min(8, n.rng.next() < p.reset
      ? n.rng.normal() : c.weight + n.rng.normal() * p.sigma));
  }
  if (n.rng.next() < p.node) addNode(g, n.rng, n.tracker);
  if (n.rng.next() < p.edge) addConnection(g, n.rng, n.tracker, true);
  if (n.rng.next() < .005 && g.connections.length) {
    const c = n.rng.pick(g.connections); c.enabled = !c.enabled;
  }
}

function breed(n: NEAT, p: Profile) {
  const protectedIds = new Set([...n.species].sort((a, b) => b.members[0].fitness - a.members[0].fitness).slice(0, 2).map((s) => s.id));
  n.species = n.species.filter((s) => protectedIds.has(s.id) || n.generation - (n.progress.get(s.id)?.improved ?? n.generation) < 25);
  const min = Math.min(...n.population.map((g) => g.fitness));
  const weights = n.species.map((s) => mean(s.members.map((g) => g.fitness - min + 1)));
  const pickSpecies = () => {
    let x = n.rng.next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) return n.species[i]; }
    return n.species.at(-1)!;
  };
  const parent = (s: Species) => {
    const pool = s.members.slice(0, Math.max(1, Math.ceil(s.members.length * p.parentFraction)));
    const a = n.rng.pick(pool), b = n.rng.pick(pool);
    return a.fitness >= b.fitness ? a : b;
  };
  const next: Genome[] = [];
  for (const s of [...n.species].sort((a, b) => b.members[0].fitness - a.members[0].fitness).slice(0, n.size)) {
    const elite = cloneGenome(s.members[0]); elite.id = n.nextId++; elite.fitness = 0; next.push(elite);
  }
  while (next.length < n.size) {
    const s = pickSpecies(), a = parent(s);
    const child = n.rng.next() < p.crossover && s.members.length > 1
      ? crossover(a, parent(s), n.nextId++, n.rng)
      : { ...cloneGenome(a), id: n.nextId++, fitness: 0 };
    mutate(child, n, p); next.push(child);
  }
  n.population = next; n.generation++;
}

function select(g: Genome, generation: number): Selection {
  const episodes = evaluateGenome(g, developmentSeeds, simulation);
  const rows = episodes.map((e) => e.score).sort((a, b) => a - b), meanRow = mean(rows);
  const goalUtility = mean(rows.map((r) => Math.min(r, 1500)))
    + 500 * rows.filter((r) => r >= 1000).length / rows.length
    + .25 * mean(rows.slice(0, rows.length / 2));
  return { genome: cloneGenome(g), generation, criterion: .5 * meanRow + .5 * mean(rows.slice(0, rows.length / 2)), meanRow, episodes, goalUtility };
}

function config(p: Profile): TrainingConfig {
  return { population: p.population, seed: 712049, trainingSeeds: p.seeds,
    autoCurriculum: false, profile: "robust-v2", simulation,
    evolutionParameters: evolutionParameters(p), fitnessRiskWeight: p.risk,
    trainingSeedStride: 31, trainingSeedStream: 573, monitorSeeds: developmentSeeds.slice(0, 16),
    ...(baseline.observationVersion ? { observationVersion: baseline.observationVersion } : {}) };
}

function evolutionParameters(p: Profile): EvolutionParameters {
  return { weightMutationRate: p.fraction, weightMutationSigma: p.sigma,
    weightResetRate: p.reset, addNodeRate: p.node, addConnectionRate: p.edge,
    toggleConnectionRate: .005, crossoverRate: p.crossover,
    parentFraction: p.parentFraction, retainStaleSpeciesProgress: true };
}

function checkpoint(run: Run): Checkpoint {
  return { format: "crossy-evolution", version: 1, config: config(run.profile),
    generation: run.generation, neat: { ...run.neat.save(), parameters: evolutionParameters(run.profile) }, history: run.history };
}

function save(run: Run) {
  const dir = path.join(root, run.profile.name);
  fs.writeFileSync(path.join(dir, "checkpoint.json"), stringifyEvolution({ ...checkpoint(run),
    experiment: { profile: run.profile, ancestry, resumeCommand: `node --import tsx scripts/experiment-evolution.ts ${root} ${source} ${run.profile.name} --resume` } }));
  fs.writeFileSync(path.join(dir, "selected.json"), stringifyEvolution({ ...run.selected, developmentSeeds,
    ancestry, experimentProfile: run.profile,
    selectionRule: "Maximum equally weighted mean and lower-half mean on 64 development maps; top two every five generations and final generation; baseline retained" }));
  fs.writeFileSync(path.join(dir, "target-selected.json"), stringifyEvolution({ ...run.targetSelected, developmentSeeds,
    ancestry, experimentProfile: run.profile,
    selectionRule: "Maximum mean(min(row,1500)) + 500 * P(row>=1000) + 0.25 * lower-half mean on A1 development maps; top two every five generations and final generation; ancestor retained" }));
  fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify({ profile: run.profile, simulation,
    source, sourceGeneration: sourceCheckpoint.generation, sourceGenome: baseline.id, ancestry,
    generations: run.generation, trainingEpisodes: run.evaluations, validationEpisodes: run.validationEvaluations,
    seconds: run.seconds, selectedGeneration: run.selected.generation, selectedGenome: run.selected.genome.id,
    selectedMeanRow: run.selected.meanRow, selectedCriterion: run.selected.criterion,
    targetSelectedGeneration: run.targetSelected.generation, targetSelectedGenome: run.targetSelected.genome.id,
    targetSelectedMeanRow: run.targetSelected.meanRow, targetSelectedUtility: run.targetSelected.goalUtility,
    validation: run.validation,
    hidden: run.selected.genome.nodes.filter((n) => n.kind === "hidden").length,
    developmentSeeds, history: run.history.map(({ champion: _c, contenders: _p, ...h }) => h) }, null, 2) + "\n");
}

const baselineSelection = select(baseline, 0);
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, "baseline.json"), stringifyEvolution({ ...baselineSelection, simulation, developmentSeeds }));
const runs: Run[] = [];
for (const [index, profile] of profiles.entries()) {
  if (choose && !choose.split(",").includes(profile.name)) continue;
  const dir = path.join(root, profile.name);
  if (fs.existsSync(path.join(dir, "checkpoint.json")) && !resume) throw new Error(`Already exists: ${dir}; use --resume`);
  fs.mkdirSync(path.join(dir, "generations"), { recursive: true });
  let n: NEAT, history: Generation[] = [], selected = structuredClone(baselineSelection),
    targetSelected = structuredClone(baselineSelection), validation: Validation[] = [],
    generation = 0, seconds = 0, evaluations = 0, validationEvaluations = developmentSeeds.length;
  if (resume) {
    const c = parseCheckpoint(fs.readFileSync(path.join(dir, "checkpoint.json"), "utf8"));
    n = NEAT.load(c.neat); history = c.history; generation = c.generation;
    selected = parseEvolution<Selection>(fs.readFileSync(path.join(dir, "selected.json"), "utf8"));
    const s = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"));
    seconds = s.seconds; evaluations = s.trainingEpisodes; validationEvaluations = s.validationEpisodes;
    const targetPath = path.join(dir, "target-selected.json");
    if (fs.existsSync(targetPath)) {
      targetSelected = parseEvolution<Selection>(fs.readFileSync(targetPath, "utf8")); validation = s.validation ?? [];
    } else {
      // Reconstruct only the original scheduled development candidates; never
      // inspect final-test scores or select arbitrary historical genomes.
      for (const r of history.filter((r) => r.generation === 1 || r.generation % 5 === 0)) {
        const archive = parseEvolution<{ contenders: Genome[] }>(gunzipSync(fs.readFileSync(
          path.join(dir, "generations", `${String(r.generation).padStart(5, "0")}.json.gz`))).toString());
        for (const g of archive.contenders.slice(0, 2)) {
          const candidate = select(g, r.generation); validationEvaluations += developmentSeeds.length;
          validation.push({ generation: r.generation, genome: g.id, criterion: candidate.criterion,
            meanRow: candidate.meanRow, goalUtility: candidate.goalUtility });
          if (candidate.goalUtility > targetSelected.goalUtility) targetSelected = candidate;
        }
      }
    }
  } else {
    n = NEAT.load(sourceCheckpoint.neat); n.size = profile.population;
    n.rng = new RNG(hash(712049, index, 435)); n.generation = 0; n.species = []; n.progress.clear(); n.threshold = .5;
    n.population = Array.from({ length: profile.population }, (_, i) => {
      const g = cloneGenome(baseline); g.id = n.nextId++; g.fitness = 0; g.species = 0;
      if (i) mutate(g, n, profile); return g;
    });
  }
  runs.push({ profile, neat: n, history, selected, targetSelected, validation, generation, seconds, evaluations, validationEvaluations });
}
console.log(`Baseline development mean=${baselineSelection.meanRow.toFixed(2)}, criterion=${baselineSelection.criterion.toFixed(2)}, max=${Math.max(...baselineSelection.episodes.map((e) => e.score))}`);
let stopped = false;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });
while (!stopped && runs.some((r) => r.generation < r.profile.generations)) {
  for (const run of runs) {
    if (stopped || run.generation >= run.profile.generations) continue;
    const start = performance.now(), p = run.profile, n = run.neat;
    const seeds = Array.from({ length: p.seeds }, (_, i) => hash(712049, run.generation * 31 + i, 573) & 0x3fffffff);
    const all = n.population.map((g) => {
      const e = evaluateGenome(g, seeds, simulation), scores = e.map((r) => r.fitness).sort((a, b) => a - b);
      g.fitness = (1 - p.risk) * mean(scores) + p.risk * mean(scores.slice(0, Math.ceil(scores.length / 2)));
      return e;
    });
    run.evaluations += p.population * p.seeds; n.classify();
    const contenders = [...n.population].sort((a, b) => b.fitness - a.fitness || a.id - b.id).map(cloneGenome);
    const champion = contenders[0], championIndex = n.population.findIndex((g) => g.id === champion.id);
    run.generation++;
    if (run.generation % 5 === 0 || run.generation === 1 || run.generation === p.generations) {
      for (const g of contenders.slice(0, 2)) {
        const candidate = select(g, run.generation); run.validationEvaluations += developmentSeeds.length;
        run.validation.push({ generation: run.generation, genome: g.id, criterion: candidate.criterion,
          meanRow: candidate.meanRow, goalUtility: candidate.goalUtility });
        if (candidate.criterion > run.selected.criterion) run.selected = candidate;
        if (candidate.goalUtility > run.targetSelected.goalUtility) run.targetSelected = candidate;
      }
    }
    const monitor = evaluateGenome(champion, developmentSeeds.slice(0, 16), simulation);
    run.validationEvaluations += 16;
    const record: Generation = { generation: run.generation, curriculum: "roads", bestFitness: champion.fitness,
      meanFitness: mean(n.population.map((g) => g.fitness)), meanRow: mean(all.flat().map((e) => e.score)),
      maxRow: Math.max(...all.flat().map((e) => e.score)), evalRow: mean(monitor.map((e) => e.score)),
      species: n.species.length, nodes: champion.nodes.filter((g) => g.kind === "hidden").length,
      connections: champion.connections.filter((g) => g.enabled).length, seeds, champion,
      contenders: [champion], training: all[championIndex], evaluation: monitor, populationSize: p.population,
      cohortFile: `/training-cohorts/${String(run.generation).padStart(5, "0")}.json.gz` };
    fs.writeFileSync(path.join(root, p.name, "generations", path.basename(record.cohortFile!)), gzipSync(stringifyEvolution({ contenders }), { level: 3 }));
    run.history.push(record); breed(n, p); run.seconds += (performance.now() - start) / 1000;
    save(run);
    console.log(`${p.name} gen=${run.generation}/${p.generations} episodes=${run.evaluations} meanTrain=${record.meanRow.toFixed(1)} developmentBest=${run.selected.meanRow.toFixed(1)} criterion=${run.selected.criterion.toFixed(1)} goalBest=${run.targetSelected.meanRow.toFixed(1)} utility=${run.targetSelected.goalUtility.toFixed(1)} max=${record.maxRow} species=${record.species} seconds=${run.seconds.toFixed(1)}`);
    // Let pending signals run between deterministic generation boundaries.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
for (const run of runs) save(run);
console.log(`Saved ${runs.length} parameter experiments to ${root}`);
