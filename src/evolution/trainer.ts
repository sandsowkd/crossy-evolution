import { hash } from "../core/rng";
import { CURRENT_CONFIG, type Config } from "../core/types";
import { NEAT, type NeatState } from "./neat";
import { cloneGenome, type Genome, type EvolutionParameters } from "./genome";
import {
  HELD_OUT_SEEDS,
  evaluateGenome,
  mean,
  type Episode,
} from "./evaluation";
export type TrainingConfig = {
  population: number;
  seed: number;
  simulation: Config;
  trainingSeeds: number;
  autoCurriculum: boolean;
  profile?: "robust-v2";
  observationVersion?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  evolutionParameters?: EvolutionParameters;
  fitnessRiskWeight?: number;
  fitnessObjective?: "reward" | "rows";
  trainingSeedStride?: number;
  trainingSeedStream?: number;
  trainingSeedPrefix?: number;
  monitorSeeds?: number[];
};
export const DEFAULT_TRAINING: TrainingConfig = {
  population: 100,
  seed: 42,
  simulation: structuredClone(CURRENT_CONFIG),
  trainingSeeds: 3,
  autoCurriculum: false,
};
export type Generation = {
  generation: number;
  curriculum: Config["curriculum"];
  bestFitness: number;
  meanFitness: number;
  meanRow: number;
  maxRow: number;
  evalRow: number;
  species: number;
  nodes: number;
  connections: number;
  seeds: number[];
  champion: Genome;
  contenders: Genome[];
  training: Episode[];
  evaluation: Episode[];
  cohortFile?: string;
  cohortHash?: string;
  populationSize?: number;
};
export type Checkpoint = {
  format: "crossy-evolution";
  version: 1;
  config: TrainingConfig;
  generation: number;
  neat: NeatState;
  history: Generation[];
};
export class Trainer {
  neat: NEAT;
  generation = 0;
  history: Generation[] = [];
  private cursor = 0;
  private results: Episode[][] = [];
  private seeds: number[] = [];
  config: TrainingConfig;
  constructor(config: Partial<TrainingConfig> = {}) {
    this.config = structuredClone({ ...DEFAULT_TRAINING, ...config });
    this.neat = new NEAT(
      this.config.population,
      hash(this.config.seed, 0, 99),
      this.config.profile === "robust-v2",
      this.config.observationVersion,
      this.config.evolutionParameters,
    );
  }
  /** Small batches allow workers to process pause messages between evaluations. */
  batch(count = 2): { progress: number; record?: Generation } {
    if (this.cursor === 0) {
      this.seeds = Array.from(
        { length: this.config.trainingSeeds },
        (_, i) =>
          ((hash(this.config.seed,
            this.generation * (this.config.trainingSeedStride ?? 17) + i,
            this.config.trainingSeedStream ?? 33) & 0x3fffffff) | (this.config.trainingSeedPrefix ?? 0)) >>> 0,
      );
      this.results = [];
    }
    const end = Math.min(this.cursor + count, this.neat.size);
    for (; this.cursor < end; this.cursor++) {
      const g = this.neat.population[this.cursor],
        r = evaluateGenome(g, this.seeds, this.config.simulation);
      this.results.push(r);
      const scores = r.map((e) => this.config.fitnessObjective === "rows" ? e.score : e.fitness).sort((a, b) => a - b);
      g.fitness =
        this.config.fitnessRiskWeight !== undefined
          ? (1 - this.config.fitnessRiskWeight) * mean(scores) +
            this.config.fitnessRiskWeight * mean(scores.slice(0, Math.ceil(scores.length / 2)))
          : this.config.profile === "robust-v2"
          ? 0.5 * mean(scores) +
            0.5 * mean(scores.slice(0, Math.ceil(scores.length / 2)))
          : mean(scores);
    }
    if (this.cursor < this.neat.size)
      return { progress: this.cursor / this.neat.size };
    this.neat.classify();
    const bestIndex = this.neat.population.reduce(
        (best, g, i) =>
          g.fitness > this.neat.population[best].fitness ? i : best,
        0,
      ),
      champ = cloneGenome(this.neat.population[bestIndex]);
    const evaluation = evaluateGenome(
        champ,
        this.config.monitorSeeds ?? HELD_OUT_SEEDS,
        this.config.simulation,
      ),
      all = this.results.flat();
    const record: Generation = {
      generation: this.generation + 1,
      curriculum: this.config.simulation.curriculum,
      bestFitness: champ.fitness,
      meanFitness: mean(this.neat.population.map((g) => g.fitness)),
      meanRow: mean(all.map((e) => e.score)),
      maxRow: Math.max(...all.map((e) => e.score)),
      evalRow: mean(evaluation.map((e) => e.score)),
      species: this.neat.species.length,
      nodes: champ.nodes.filter((n) => n.kind === "hidden").length,
      connections: champ.connections.filter((c) => c.enabled).length,
      seeds: [...this.seeds],
      champion: champ,
      contenders: [...this.neat.population]
        .sort((a, b) => b.fitness - a.fitness || a.id - b.id)
        .map(cloneGenome),
      training: this.results[bestIndex],
      evaluation,
      populationSize: this.config.population,
    };
    this.history.push(record);
    this.generation++;
    this.cursor = 0;
    this.neat.breed();
    if (
      this.config.autoCurriculum &&
      this.config.simulation.curriculum === "roads" &&
      this.history.length >= 5 &&
      this.history.slice(-5).every((h) => h.meanRow >= 6)
    )
      this.config.simulation.curriculum = "trains";
    return { progress: 1, record };
  }
  runGeneration() {
    let result;
    do {
      result = this.batch(10);
    } while (!result.record);
    return result.record;
  }
  checkpoint(): Checkpoint {
    if (this.cursor !== 0)
      throw new Error("Checkpoint only at completed generation boundaries");
    return {
      format: "crossy-evolution",
      version: 1,
      config: structuredClone(this.config),
      generation: this.generation,
      neat: this.neat.save(),
      history: structuredClone(this.history),
    };
  }
  static restore(c: Checkpoint) {
    const t = new Trainer({ ...c.config, population: 0 });
    t.config = structuredClone(c.config);
    t.generation = c.generation;
    t.history = structuredClone(c.history);
    t.neat = NEAT.load(c.neat);
    return t;
  }
}
