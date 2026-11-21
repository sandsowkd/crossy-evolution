import { mkdir, readFile, writeFile } from "node:fs/promises";
import { GameSimulation } from "../src/core/simulation";
import { ACTIONS, type Action, type Config } from "../src/core/types";
import { GLOBAL_OFFSET } from "../src/core/observation";
import { heuristic } from "../src/evolution/baselines";
import { Network } from "../src/evolution/network";
import { BIAS, cloneGenome, type Genome } from "../src/evolution/genome";
import { mean, evaluateGenome } from "../src/evolution/evaluation";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { RNG, hash } from "../src/core/rng";

if (process.argv[2] === "benchmark") {
  const { observation: referenceObservation } = await import("../src/tests/fixtures/reference-observation");
  const { observation } = await import("../src/core/observation");
  const directory = "results/experiments/diagnosis";
  await mkdir(directory, { recursive: true });
  const raw = await readFile("results/experiments/trajectory/warm-v3-100/selected.json", "utf8");
  const model = parseEvolution<{ genome: Genome; generation: number }>(raw);
  await writeFile(`${directory}/trajectory-benchmark-model.json`, raw);
  const config: Config = { curriculum: "roads", maxTicks: 36000, difficulty: 1 };
  const seeds = Array.from({ length: 32 }, (_, i) => (0xd7000000 + i * 32771) >>> 0);
  const run = (encoder: typeof referenceObservation, sparse: boolean, maps: number[]) => {
    const network = new Network(model.genome);
    const version=network.observationVersion;
    if(version===5||version===6||version===7||version===8||version===9)throw new Error("Frozen encoder benchmark covers sensor versions1–4");
    return maps.map((seed) => {
      const sim = new GameSimulation(config, seed);
      while (sim.agent.alive) {
        const o = encoder(sim.world, sim.agent, sim.tick, version,
          sparse ? network.requiredInputs : undefined);
        sim.step(network.decide(o), false);
      }
      return { seed, score: sim.agent.maxRow, ticks: sim.tick, deathReason: sim.agent.deathReason };
    });
  };
  const variants = [
    { name: "unprunedDense", encoder: referenceObservation, sparse: false },
    { name: "prunedDense", encoder: observation, sparse: false },
    { name: "unprunedSparse", encoder: referenceObservation, sparse: true },
    { name: "prunedSparse", encoder: observation, sparse: true },
  ];
  for (const variant of variants) run(variant.encoder, variant.sparse, seeds.slice(0, 4));
  const expected = run(referenceObservation, true, seeds);
  const measurements: Record<string, number[]> = {};
  for (let repeat = 0; repeat < 5; repeat++) {
    for (const variant of repeat % 2 ? [...variants].reverse() : variants) {
      const started = performance.now();
      const episodes = run(variant.encoder, variant.sparse, seeds);
      const seconds = (performance.now() - started) / 1000;
      if (JSON.stringify(episodes) !== JSON.stringify(expected))
        throw new Error(`Trajectory optimization changed actual policy episodes: ${variant.name}`);
      (measurements[variant.name] ??= []).push(seconds);
    }
  }
  const median = (a: number[]) => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
  const medians = Object.fromEntries(Object.entries(measurements).map(([name, values]) => [name, median(values)]));
  const result = {
    model: { source: "warm-v3-100", generation: model.generation, genome: model.genome.id, observationVersion: model.genome.observationVersion },
    config, seeds, mapsPerRepeat: seeds.length, repeats: 5,
    physics: "Same current optimized physics for both frozen encoder and pruned encoder",
    methodology: "32 complete actual learned-policy episodes; four warmup maps; alternating variant order; medians of five repeats; all episode scores/ticks/deaths identical",
    measurements, medians,
    denseSpeedup: medians.unprunedDense / medians.prunedDense,
    sparseSpeedup: medians.unprunedSparse / medians.prunedSparse,
    combinedSparsePrunedVersusDense: medians.unprunedDense / medians.prunedSparse,
    physicsTicksPerRepeat: expected.reduce((sum, r) => sum + r.ticks, 0),
    meanRow: mean(expected.map((r) => r.score)),
    episodes: expected,
  };
  await writeFile(`${directory}/trajectory-benchmark.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, episodes: undefined, seeds: undefined }, null, 2));
  process.exit(0);
}

type Selected = { genome: Genome; generation: number };
const output = "results/experiments/diagnosis";
const config: Config = { curriculum: "roads", maxTicks: 36000, difficulty: 1 };
const rescue = process.argv[2] === "rescue";
const tuning = process.argv[2] === "tune" || rescue;
const seeds = Array.from({ length: Number(tuning ? 256 : (process.argv[2] ?? 256)) }, (_, i) =>
  (0xd1000000 + i * 65537) >>> 0,
);

type Decision = {
  tick: number;
  row: number;
  x: number;
  action: Action;
  risks: number[];
  trajectoryRisks?: number[];
  scores?: number[];
  blocked: boolean;
  alternatives?: { action: Action; alive: boolean; blocked: boolean }[];
};
type Result = {
  seed: number;
  score: number;
  ticks: number;
  deathReason?: string;
  actionCounts: Record<Action, number>;
  blocked: number;
  stallDecisions: number;
  fatalChoiceAvoidable: boolean;
  fatalRisk?: number;
  recent: Decision[];
};

function run(
  seed: number,
  policy: (o: Float32Array, s: GameSimulation) => Action,
  version: 1 | 2 | 3,
  network?: Network,
): Result {
  const s = new GameSimulation(config, seed);
  const actionCounts = Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<
    Action,
    number
  >;
  const recent: Decision[] = [];
  let blocked = 0;
  let lastProgress = 0;
  let fatalChoiceAvoidable = false;
  let fatalRisk: number | undefined;
  while (s.agent.alive) {
    const o = s.getObservation(version);
    const old = { ...s.agent };
    const tick = s.tick;
    const action = policy(o, s);
    const d: Decision = {
      tick,
      row: s.agent.row,
      x: s.agent.x,
      action,
      risks: Array.from(o.subarray(GLOBAL_OFFSET + 3, GLOBAL_OFFSET + 8)),
      ...(network ? { scores: Array.from(network.scores) } : {}),
      blocked: false,
    };
    actionCounts[action]++;
    s.step(action, false);
    d.blocked = s.agent.blocked;
    blocked += +s.agent.blocked;
    if (s.agent.maxRow > old.maxRow) lastProgress = s.tick;
    if (!s.agent.alive && s.agent.deathReason !== "timeout") {
      const before = new GameSimulation(config, seed);
      before.tick = tick;
      before.agent = { ...old };
      d.trajectoryRisks = Array.from(before.getObservation(3).subarray(GLOBAL_OFFSET + 3, GLOBAL_OFFSET + 8));
      d.alternatives = ACTIONS.map((a) => {
        const alternative = new GameSimulation(config, seed);
        alternative.tick = tick;
        alternative.agent = { ...old };
        alternative.step(a, false);
        return {
          action: a,
          alive: alternative.agent.alive,
          blocked: alternative.agent.blocked,
        };
      });
      fatalChoiceAvoidable = d.alternatives.some((a) => a.alive);
      fatalRisk = d.risks[ACTIONS.indexOf(action)];
    }
    recent.push(d);
    if (recent.length > 20) recent.shift();
  }
  return {
    seed,
    score: s.agent.maxRow,
    ticks: s.tick,
    deathReason: s.agent.deathReason,
    actionCounts,
    blocked,
    stallDecisions: Math.floor((s.tick - lastProgress) / 12),
    fatalChoiceAvoidable,
    fatalRisk,
    recent,
  };
}

function summary(rows: Result[]) {
  const sorted = rows.map((r) => r.score).sort((a, b) => a - b);
  const deaths: Record<string, number> = {};
  for (const r of rows) {
    const reason =
      r.deathReason === "timeout" && r.stallDecisions > 100
        ? "stalled-timeout"
        : (r.deathReason ?? "unknown");
    deaths[reason] = (deaths[reason] ?? 0) + 1;
  }
  const actionCounts = Object.fromEntries(
    ACTIONS.map((a) => [a, rows.reduce((s, r) => s + r.actionCounts[a], 0)]),
  );
  const n = rows.length;
  return {
    maps: n,
    mean: mean(sorted),
    median: sorted[Math.floor(n / 2)],
    p10: sorted[Math.floor(n * 0.1)],
    p90: sorted[Math.floor(n * 0.9)],
    max: sorted.at(-1),
    atLeast1000: rows.filter((r) => r.score >= 1000).length,
    deaths,
    meanTicks: mean(rows.map((r) => r.ticks)),
    blocked: rows.reduce((s, r) => s + r.blocked, 0),
    avoidableFatalChoices: rows.filter((r) => r.fatalChoiceAvoidable).length,
    fatalActionsWithZeroRisk: rows.filter((r) => r.fatalRisk === 0).length,
    fatalActionsWithLowTrajectoryRisk: rows.filter((r) => {
      const last = r.recent.at(-1)!;
      return last.trajectoryRisks && last.trajectoryRisks[ACTIONS.indexOf(last.action)] < .99;
    }).length,
    actionCounts,
  };
}

await mkdir(output, { recursive: true });
const selected = parseEvolution<Selected>(
  await readFile("results/continued/selected.json", "utf8"),
);
const old = parseEvolution<Selected>(
  await readFile("results/learned/selected.json", "utf8"),
);
if (tuning) {
  const rng = new RNG(831211);
  const prefix = rescue ? "failure-curriculum" : "anti-stall";
  const rescueStarts = rescue ? (JSON.parse(await readFile(`${output}/continued-gen470.json`, "utf8")) as Result[])
    .flatMap((r) => (r.deathReason === "timeout" ? [r.recent[0]] : [r.recent[Math.max(0, r.recent.length - 8)], r.recent.at(-1)!]).map((d) => ({ seed: r.seed, tick: d.tick, x: d.x, row: d.row }))) : [];
  if (rescue) selected.genome.observationVersion = 3;
  const populationSize = Number(process.argv[3] ?? 64);
  const generations = Number(process.argv[4] ?? 100);
  const validationSeeds = Array.from({ length: 64 }, (_, i) => (0xd7000000 + i * 32771) >>> 0);
  const validation = (g: Genome) => {
    const episodes = evaluateGenome(g, validationSeeds, config);
    const scores = episodes.map((r) => r.score).sort((a, b) => a - b);
    return { episodes, meanRow: mean(scores), criterion: .5 * mean(scores) + .5 * mean(scores.slice(0, 32)) };
  };
  const initial = validation(selected.genome);
  let best = { generation: 0, genome: cloneGenome(selected.genome), ...initial };
  let population = Array.from({ length: populationSize }, () => cloneGenome(selected.genome));
  let nextId = 10000000;
  const history: object[] = [];
  const started = Date.now();
  const trainingEpisode = (g: Genome, seed: number) => {
    const n = new Network(g);
    const start = rescue ? rescueStarts[seed % rescueStarts.length] : undefined;
    const s = new GameSimulation(start ? { ...config, maxTicks: start.tick + 1200 } : config, start?.seed ?? seed);
    if (start) {
      s.tick = start.tick;
      s.agent = { x: start.x, row: start.row, maxRow: Math.round(start.row), alive: true, blocked: false, lastAction: "WAIT" };
    }
    const initialTicks = s.tick, initialRow = s.agent.maxRow;
    let lastProgress = s.tick, blocked = 0;
    while (s.agent.alive && s.tick - lastProgress < 600) {
      const oldScore = s.agent.maxRow;
      s.step(n.decide(s.getObservation(n.observationVersion)), false);
      blocked += +s.agent.blocked;
      if (s.agent.maxRow > oldScore) lastProgress = s.tick;
    }
    const stalled = s.agent.alive;
    const f = rescue
      ? s.agent.maxRow - initialRow - .001 * (s.tick - initialTicks) - .1 * blocked - (s.agent.deathReason === "car" || s.agent.deathReason === "bounds" ? 5 : 0)
      : s.agent.maxRow - .002 * s.tick - .2 * blocked - (stalled ? 25 : 0);
    return { score: s.agent.maxRow, fitness: f, ticks: s.tick, stalled };
  };
  const mutateWeights = (g: Genome, generation: number) => {
    const fraction = rng.pick([.03, .1, .25, .6]);
    const sigma = rng.pick([.03, .06, .12, .2]);
    for (const c of g.connections) {
      if (c.enabled && rng.next() < fraction)
        c.weight = Math.max(-8, Math.min(8, c.weight + rng.normal() * sigma));
      if (c.enabled && c.from === BIAS && rng.next() < .3)
        c.weight = Math.max(-8, Math.min(8, c.weight + rng.normal() * .2));
      // Occasional removal of absolute-clock dependence tests whether it is noise.
      if (generation < 3 && (c.from === GLOBAL_OFFSET + 1 || c.from === GLOBAL_OFFSET + 2) && rng.next() < .2)
        c.weight *= .5;
    }
    g.id = nextId++;
  };
  for (let generation = 1; generation <= generations; generation++) {
    const trainSeeds = Array.from({ length: rescue ? 24 : 8 }, (_, i) => hash(92176, Math.floor((generation - 1) / 5) * (rescue ? 31 : 11) + i, 73) & 0x3fffffff);
    for (let i = 0; i < population.length; i++) {
      const g = population[i];
      if (generation === 1 && i > 0) mutateWeights(g, generation);
      const episodes = trainSeeds.map((seed) => trainingEpisode(g, seed));
      const scores = episodes.map((r) => r.fitness).sort((a, b) => a - b);
      g.fitness = .5 * mean(scores) + .5 * mean(scores.slice(0, Math.ceil(scores.length / 2)));
    }
    population.sort((a, b) => b.fitness - a.fitness || a.id - b.id);
    if (generation % 10 === 0 || generation === generations) {
      const candidates = population.slice(0, 4);
      for (const g of candidates) {
        const result = validation(g);
        if (result.criterion > best.criterion) {
          best = { generation, genome: cloneGenome(g), ...result };
          await writeFile(`${output}/${prefix}-selected.json`, stringifyEvolution({ ...best, sourceModel: { generation: selected.generation, id: selected.genome.id }, validationSeeds, simulation: config, strategy: rescue ? "weight-only neuroevolution; v3 sensor; reset training episodes into 443 pre-collision/tree-loop states from D1 development maps, rotating 24 starts; full runs for validation" : "weight-only neuroevolution; rotating 8 maps, 600-tick no-progress training cutoff, unchanged binary-v1 observations" }));
        }
      }
      console.log(JSON.stringify({ generation, fitness: population[0].fitness, validationBest: best.meanRow, criterion: best.criterion, selectedGeneration: best.generation, seconds: (Date.now() - started) / 1000 }));
    }
    history.push({ generation, bestFitness: population[0].fitness, meanFitness: mean(population.map((g) => g.fitness)), seeds: trainSeeds });
    const parents = population.slice(0, Math.max(2, Math.floor(populationSize / 5)));
    const next = parents.slice(0, 4).map(cloneGenome);
    while (next.length < populationSize) {
      const a = rng.pick(parents), b = rng.pick(parents);
      const g = cloneGenome(a.fitness > b.fitness ? a : b);
      mutateWeights(g, generation);
      next.push(g);
    }
    population = next;
  }
  await writeFile(`${output}/${prefix}-summary.json`, JSON.stringify({ initial: { meanRow: initial.meanRow, criterion: initial.criterion }, best: { generation: best.generation, meanRow: best.meanRow, criterion: best.criterion }, populationSize, generations, history, seconds: (Date.now() - started) / 1000 }, null, 2));
  await writeFile(`${output}/${prefix}-population.json`, stringifyEvolution({ population, rng: rng.state, nextId, generation: generations, sourceModel: selected, config }));
  process.exit(0);
}
const results: Record<string, ReturnType<typeof summary>> = {};
for (const [name, model, version] of [
  ["continued-gen470", selected.genome, 1],
  ["previous-gen290", old.genome, 1],
  ["distanceHeuristic", undefined, 2],
] as const) {
  const network = model ? new Network(model) : undefined;
  const rows = seeds.map((seed) =>
    run(seed, network ? (o) => network.decide(o) : heuristic, version, network),
  );
  results[name] = summary(rows);
  await writeFile(`${output}/${name}.json`, JSON.stringify(rows));
  console.log(name, JSON.stringify(results[name]));
}
await writeFile(
  `${output}/summary.json`,
  JSON.stringify({ config, seeds, results }, null, 2),
);
