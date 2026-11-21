// Frozen custom search operators before moving parameters into native checkpoints.
import { addConnection, addNode, cloneGenome, crossover, type Genome } from "../../evolution/genome";
import { NEAT, type Species } from "../../evolution/neat";
import { mean } from "../../evolution/evaluation";
export type Profile = {
  fraction: number; sigma: number; reset: number; node: number; edge: number;
  crossover: number; parentFraction: number;
};
export function experimentalMutation(g: Genome, n: NEAT, p: Profile) {
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

export function experimentalBreed(n: NEAT, p: Profile) {
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
    experimentalMutation(child, n, p); next.push(child);
  }
  n.population = next; n.generation++;
}

