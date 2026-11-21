// Frozen before optional evolution parameters; protects historical breeding behavior.
import { RNG } from "../../core/rng";
import {
  Innovations,
  cloneGenome,
  crossover,
  distance,
  minimalGenome,
  mutate,
  type Genome,
  type InnovationState,
} from "./reference-genome";
export type Species = { id: number; representative: Genome; members: Genome[] };
export type NeatState = {
  population: Genome[];
  rng: number;
  tracker: InnovationState;
  nextId: number;
  nextSpecies: number;
  representatives: { id: number; representative: Genome }[];
  tuning?: {
    threshold: number;
    generation: number;
    progress: [number, { best: number; improved: number }][];
  };
};
export class NEAT {
  population: Genome[] = [];
  species: Species[] = [];
  rng: RNG;
  tracker = new Innovations();
  nextId = 0;
  nextSpecies = 1;
  threshold = 1.8;
  generation = 0;
  progress = new Map<number, { best: number; improved: number }>();
  constructor(
    public size: number,
    seed: number,
    public robust = false,
    observationVersion?: 2 | 3 | 4,
  ) {
    this.rng = new RNG(seed);
    for (let i = 0; i < size; i++)
      this.population.push(
        minimalGenome(
          this.nextId++,
          this.rng,
          this.tracker,
          robust,
          observationVersion,
        ),
      );
  }
  classify() {
    const groups: Species[] = this.species.map((s) => ({
      id: s.id,
      representative: s.representative,
      members: [],
    }));
    for (const g of this.population) {
      let s = groups.find(
        (s) =>
          distance(g, s.representative) < (this.robust ? this.threshold : 1.35),
      );
      if (!s) {
        s = {
          id: this.nextSpecies++,
          representative: cloneGenome(g),
          members: [],
        };
        groups.push(s);
      }
      g.species = s.id;
      s.members.push(g);
    }
    this.species = groups
      .filter((s) => s.members.length)
      .map((s) => {
        s.members.sort((a, b) => b.fitness - a.fitness || a.id - b.id);
        s.representative = cloneGenome(s.members[0]);
        return s;
      });
    if (this.robust) {
      this.threshold = Math.max(
        0.5,
        this.threshold +
          (this.species.length > 12
            ? 0.04
            : this.species.length < 8
              ? -0.04
              : 0),
      );
      for (const s of this.species) {
        const old = this.progress.get(s.id);
        if (!old || s.members[0].fitness > old.best)
          this.progress.set(s.id, {
            best: s.members[0].fitness,
            improved: this.generation,
          });
      }
    }
  }
  breed() {
    if (this.robust) {
      const protectedIds = new Set(
        [...this.species]
          .sort((a, b) => b.members[0].fitness - a.members[0].fitness)
          .slice(0, 2)
          .map((s) => s.id),
      );
      this.species = this.species.filter(
        (s) =>
          protectedIds.has(s.id) ||
          this.generation -
            (this.progress.get(s.id)?.improved ?? this.generation) <
            25,
      );
      const activeIds = new Set(this.species.map((s) => s.id));
      for (const id of this.progress.keys())
        if (!activeIds.has(id)) this.progress.delete(id);
    }
    const min = Math.min(...this.population.map((g) => g.fitness));
    const weights = this.species.map(
      (s) =>
        s.members.reduce((sum, g) => sum + g.fitness - min + 1, 0) /
        s.members.length,
    );
    const pickSpecies = () => {
      let x = this.rng.next() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < weights.length; i++) {
        x -= weights[i];
        if (x <= 0) return this.species[i];
      }
      return this.species.at(-1)!;
    };
    const next: Genome[] = [];
    for (const s of [...this.species]
      .sort((a, b) => b.members[0].fitness - a.members[0].fitness)
      .slice(0, this.size)) {
      const elite = cloneGenome(s.members[0]);
      elite.id = this.nextId++;
      elite.fitness = 0;
      next.push(elite);
    }
    const parent = (s: Species) => {
      const pool = s.members.slice(
        0,
        Math.max(1, Math.ceil(s.members.length * 0.4)),
      );
      const a = this.rng.pick(pool),
        b = this.rng.pick(pool);
      return a.fitness >= b.fitness ? a : b;
    };
    while (next.length < this.size) {
      const s = pickSpecies(),
        a = parent(s);
      let child: Genome;
      if (this.rng.next() < 0.75 && s.members.length > 1)
        child = crossover(a, parent(s), this.nextId++, this.rng);
      else {
        child = cloneGenome(a);
        child.id = this.nextId++;
        child.fitness = 0;
      }
      mutate(child, this.rng, this.tracker, this.robust);
      next.push(child);
    }
    this.population = next;
    this.generation++;
  }
  save(): NeatState {
    return {
      population: structuredClone(this.population),
      rng: this.rng.state,
      tracker: this.tracker.save(),
      nextId: this.nextId,
      nextSpecies: this.nextSpecies,
      representatives: this.species.map((s) => ({
        id: s.id,
        representative: cloneGenome(s.representative),
      })),
      ...(this.robust
        ? {
            tuning: {
              threshold: this.threshold,
              generation: this.generation,
              progress: [...this.progress],
            },
          }
        : {}),
    };
  }
  static load(s: NeatState) {
    const n = new NEAT(0, 1);
    n.size = s.population.length;
    n.population = structuredClone(s.population);
    n.rng.state = s.rng;
    n.tracker = Innovations.load(s.tracker);
    n.nextId = s.nextId;
    n.nextSpecies = s.nextSpecies;
    if (s.tuning) {
      n.robust = true;
      n.threshold = s.tuning.threshold;
      n.generation = s.tuning.generation;
      n.progress = new Map(structuredClone(s.tuning.progress));
    }
    n.species = s.representatives.map((s) => ({
      ...structuredClone(s),
      members: [],
    }));
    return n;
  }
}
