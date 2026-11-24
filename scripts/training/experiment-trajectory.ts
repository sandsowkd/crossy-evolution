import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { Trainer } from "../../src/evolution/trainer";
import { parseCheckpoint } from "../../src/evolution/checkpoint";
import { parseEvolution, stringifyEvolution } from "../../src/evolution/serialization";
import { Innovations, mutate, type Genome } from "../../src/evolution/genome";
import { GLOBAL_OFFSET } from "../../src/core/observation";
import { evaluateGenome, mean, type Episode } from "../../src/evolution/evaluation";
import { VALIDATION_SEEDS } from "../../src/evolution/suites";

const generations = Number(process.argv[2] ?? 100);
const resume = process.argv.includes("--resume");
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
const root = ".archive/results/variant-1/experiments/trajectory";
const source = parseCheckpoint(fs.readFileSync(".archive/results/variant-1/continued/checkpoint.json", "utf8"));
const inherited = parseEvolution<{genome: Genome}>(fs.readFileSync(".archive/results/variant-1/continued/selected.json", "utf8")).genome;
const simulation = { curriculum: "roads" as const, maxTicks: 36000, difficulty: 1 };
type Selected = { genome: Genome; generation: number; meanRow: number; criterion: number; episodes: Episode[] };
const requestedProfiles = process.argv.find((arg) => arg.startsWith("--profiles="))
  ?.split("=")[1].split(",") ?? ["compact-v3-200", "warm-v3-100"];
const profiles = [
  { name: "compact-v3-200", population: 200, seeds: 4, warm: false },
  { name: "warm-v3-100", population: 100, seeds: 8, warm: true },
  { name: "warm-v3-200-s2", population: 200, seeds: 2, warm: true },
  { name: "warm-v3-50-s8", population: 50, seeds: 8, warm: true },
].filter((profile) => requestedProfiles.includes(profile.name)).map((profile) => {
  const output = path.join(root, profile.name);
  if (fs.existsSync(output) && !resume) throw new Error(`Existing experiment ${output}`);
  fs.mkdirSync(path.join(output, "generations"), { recursive: true });
  const trainer = resume
    ? Trainer.restore(parseCheckpoint(fs.readFileSync(path.join(output, "checkpoint.json"), "utf8")))
    : new Trainer({ population: profile.population, seed: 1951,
      trainingSeeds: profile.seeds, profile: "robust-v2", observationVersion: 3, simulation });
  if (!resume && profile.warm) {
    trainer.neat.tracker = Innovations.load(source.neat.tracker);
    trainer.neat.population = Array.from({length: profile.population}, (_, id) => {
      const g = structuredClone(inherited);
      g.id = id; g.fitness = 0; g.species = 0; g.observationVersion = 3;
      if (id > 0) mutate(g, trainer.neat.rng, trainer.neat.tracker, true);
      return g;
    });
  } else if (!resume) {
    // A small random starting search space, not hand-selected actions/weights.
    // Standard NEAT can add every local sensor connection and hidden node later.
    for (const g of trainer.neat.population)
      g.connections = g.connections.filter((c) => c.from >= GLOBAL_OFFSET);
  }
  const prior = resume ? JSON.parse(fs.readFileSync(path.join(output, "training-summary.json"), "utf8")) : undefined;
  return { profile, trainer, output, start: performance.now(), seconds: prior?.seconds ?? 0,
    priorWall: prior?.wallSeconds ?? 0,
    selected: resume ? parseEvolution<Selected>(fs.readFileSync(path.join(output, "selected.json"), "utf8")) : undefined,
    validation: (prior?.validation ?? []) as {generation:number; genome:number; meanRow:number; criterion:number}[] };
});
function save(run: typeof profiles[number]) {
  fs.writeFileSync(path.join(run.output, "checkpoint.json"), stringifyEvolution(run.trainer.checkpoint()));
  fs.writeFileSync(path.join(run.output, "selected.json"), stringifyEvolution({ ...run.selected,
    validationSeeds: VALIDATION_SEEDS,
    selectionRule: "Best equal mean/worst-half row on64developmentvalidationmaps, top3traininggenomes every5generations; nofinaltests",
  }));
  fs.writeFileSync(path.join(run.output, "training-summary.json"), JSON.stringify({
    config: run.trainer.config, generations: run.trainer.generation,
    ancestry: run.profile.warm ? {source:".archive/results/variant-1/continued", inheritedGeneration:470, inheritedGenome:93863, priorTrainingEpisodes:800000} : undefined,
    initialization: run.profile.warm ? "Retagged learned binary policy; standard NEAT descendants" : "Random55global/biasedges; standard NEAT may add local connections and hidden nodes",
    trainingEpisodes: run.trainer.generation * run.profile.population * run.profile.seeds,
    validationEpisodes: run.validation.length * VALIDATION_SEEDS.length,
    monitorEpisodes: run.trainer.generation * 16, seconds: run.seconds, wallSeconds:run.priorWall+(performance.now()-run.start)/1000,
    validation: run.validation,
    history: run.trainer.history.map(({champion:_c,contenders:_p,...record}) => record),
  }, null, 2));
}
outer: for (let generation = Math.min(...profiles.map((p) => p.trainer.generation)) + 1; generation <= generations; generation++) {
  for (const run of profiles) {
    if (run.trainer.generation >= generation) continue;
    const start = performance.now(), r = run.trainer.runGeneration();
    const file = `${String(r.generation).padStart(5, "0")}.json.gz`;
    r.cohortFile = `/training-cohorts/${file}`;
    fs.writeFileSync(path.join(run.output, "generations", file),
      gzipSync(stringifyEvolution({ contenders: r.contenders }), { level: 3 }));
    if (generation === 1 || generation % 5 === 0 || generation === generations) {
      for (const genome of r.contenders.slice(0, 3)) {
        const episodes = evaluateGenome(genome, VALIDATION_SEEDS, simulation);
        const rows = episodes.map((e) => e.score).sort((a,b) => a-b);
        const meanRow = mean(rows), criterion = .5 * meanRow + .5 * mean(rows.slice(0, rows.length/2));
        run.validation.push({ generation, genome: genome.id, meanRow, criterion });
        if (!run.selected || criterion > run.selected.criterion)
          run.selected = {genome: structuredClone(genome), generation, meanRow, criterion, episodes};
      }
      const s = run.selected!;
      console.log(`${run.profile.name} gen=${generation} train=${r.meanRow.toFixed(1)} validation=${s.meanRow.toFixed(1)} >=1000=${s.episodes.filter(e=>e.score>=1000).length}/64 species=${r.species}`);
    }
    r.contenders = [r.champion];
    run.seconds += (performance.now() - start)/1000;
    if (generation === 1 || generation % 5 === 0 || generation === generations) {
      save(run);
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (stopping) { for (const profile of profiles) save(profile); break outer; }
  }
}
