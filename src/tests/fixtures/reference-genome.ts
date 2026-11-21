// Frozen before optional evolution parameters; protects historical RNG trajectories.
import { RNG } from "../../core/rng";
import { INPUT_COUNT, GLOBAL_OFFSET } from "../../core/observation";
export const BIAS = INPUT_COUNT,
  OUTPUT_START = BIAS + 1,
  BASE_NODES = OUTPUT_START + 5;
export type NodeGene = {
  id: number;
  kind: "input" | "bias" | "hidden" | "output";
  depth: number;
};
export type Connection = {
  innovation: number;
  from: number;
  to: number;
  weight: number;
  enabled: boolean;
};
export type Genome = {
  id: number;
  nodes: NodeGene[];
  connections: Connection[];
  fitness: number;
  species: number;
  observationVersion?: 2 | 3 | 4;
};
export const LOCAL_INPUTS = Array.from(
  { length: GLOBAL_OFFSET },
  (_, i) => i,
).filter((i) => {
  const cell = Math.floor(i / 9),
    row = Math.floor(cell / 9),
    col = cell % 9;
  return (
    row >= 1 &&
    row <= 4 &&
    col >= 2 &&
    col <= 6 &&
    [3, 4, 5, 7, 8].includes(i % 9)
  );
});
export type InnovationState = {
  next: number;
  nextNode: number;
  connections: [string, number][];
  splits: [number, number][];
};
export const cloneGenome = (g: Genome): Genome => structuredClone(g);
export class Innovations {
  next = 0;
  nextNode = BASE_NODES;
  connections = new Map<string, number>();
  splits = new Map<number, number>();
  connection(from: number, to: number) {
    const key = `${from}:${to}`;
    let v = this.connections.get(key);
    if (v === undefined) {
      v = this.next++;
      this.connections.set(key, v);
    }
    return v;
  }
  split(c: Connection) {
    let v = this.splits.get(c.innovation);
    if (v === undefined) {
      v = this.nextNode++;
      this.splits.set(c.innovation, v);
    }
    return v;
  }
  save(): InnovationState {
    return {
      next: this.next,
      nextNode: this.nextNode,
      connections: [...this.connections],
      splits: [...this.splits],
    };
  }
  static load(s: InnovationState) {
    const t = new Innovations();
    t.next = s.next;
    t.nextNode = s.nextNode;
    t.connections = new Map(s.connections);
    t.splits = new Map(s.splits);
    return t;
  }
}
export function minimalGenome(
  id: number,
  rng: RNG,
  tracker: Innovations,
  robust = false,
  observationVersion?: 2 | 3 | 4,
): Genome {
  const nodes: NodeGene[] = Array.from({ length: INPUT_COUNT }, (_, i) => ({
    id: i,
    kind: "input",
    depth: 0,
  }));
  nodes.push({ id: BIAS, kind: "bias", depth: 0 });
  const connections: Connection[] = [];
  for (let a = 0; a < 5; a++) {
    const to = OUTPUT_START + a;
    nodes.push({ id: to, kind: "output", depth: 1 });
    const inputs = new Set([
      BIAS,
      ...Array.from({ length: 10 }, (_, i) => GLOBAL_OFFSET + i),
      ...Array.from({ length: robust ? 16 : 6 }, () =>
        robust ? rng.pick(LOCAL_INPUTS) : rng.int(GLOBAL_OFFSET),
      ),
    ]);
    for (const from of inputs)
      connections.push({
        innovation: tracker.connection(from, to),
        from,
        to,
        weight: rng.normal() * 0.6,
        enabled: true,
      });
  }
  return {
    id,
    nodes,
    connections,
    fitness: 0,
    species: 0,
    ...(observationVersion ? { observationVersion } : {}),
  };
}
export function addNode(g: Genome, rng: RNG, t: Innovations) {
  const choices = g.connections.filter((c) => c.enabled);
  if (!choices.length) return;
  const c = rng.pick(choices),
    id = t.split(c);
  if (g.nodes.some((n) => n.id === id)) return;
  const from = g.nodes.find((n) => n.id === c.from)!,
    to = g.nodes.find((n) => n.id === c.to)!;
  if (to.depth - from.depth < 1e-9) return;
  c.enabled = false;
  g.nodes.push({ id, kind: "hidden", depth: (from.depth + to.depth) / 2 });
  g.connections.push(
    {
      innovation: t.connection(c.from, id),
      from: c.from,
      to: id,
      weight: 1,
      enabled: true,
    },
    {
      innovation: t.connection(id, c.to),
      from: id,
      to: c.to,
      weight: c.weight,
      enabled: true,
    },
  );
}
export function addConnection(
  g: Genome,
  rng: RNG,
  t: Innovations,
  robust = false,
) {
  const targets = g.nodes.filter((n) => n.depth > 0);
  const sources = robust
    ? g.nodes.filter(
        (n) =>
          n.kind !== "input" ||
          n.id >= GLOBAL_OFFSET ||
          LOCAL_INPUTS.includes(n.id),
      )
    : g.nodes;
  for (let k = 0; k < 30; k++) {
    const from = rng.pick(sources),
      to = rng.pick(targets);
    if (from.depth >= to.depth) continue;
    const old = g.connections.find((c) => c.from === from.id && c.to === to.id);
    if (old) {
      if (!old.enabled) old.enabled = true;
      else continue;
    } else
      g.connections.push({
        innovation: t.connection(from.id, to.id),
        from: from.id,
        to: to.id,
        weight: rng.normal(),
        enabled: true,
      });
    return;
  }
}
export function mutate(g: Genome, rng: RNG, t: Innovations, robust = false) {
  for (const c of g.connections)
    if (rng.next() < (robust ? 0.25 : 0.8))
      c.weight = Math.max(
        -8,
        Math.min(
          8,
          rng.next() < (robust ? 0.015 : 0.06)
            ? rng.normal()
            : c.weight + rng.normal() * (robust ? 0.18 : 0.35),
        ),
      );
  if (rng.next() < (robust ? 0.08 : 0.14)) addNode(g, rng, t);
  if (rng.next() < 0.3) addConnection(g, rng, t, robust);
  if (rng.next() < 0.02 && g.connections.length) {
    const c = rng.pick(g.connections);
    c.enabled = !c.enabled;
  }
}
export function crossover(a: Genome, b: Genome, id: number, rng: RNG): Genome {
  if (b.fitness > a.fitness) [a, b] = [b, a];
  const matches = new Map(b.connections.map((c) => [c.innovation, c]));
  const connections = a.connections.map((c) => {
    const other = matches.get(c.innovation),
      gene = { ...(other && rng.next() < 0.5 ? other : c) };
    if (other && (!c.enabled || !other.enabled))
      gene.enabled = rng.next() >= 0.75;
    return gene;
  });
  const used = new Set(connections.flatMap((c) => [c.from, c.to]));
  const nodes = [
    ...new Map([...a.nodes, ...b.nodes].map((n) => [n.id, n])).values(),
  ]
    .filter((n) => n.kind !== "hidden" || used.has(n.id))
    .map((n) => ({ ...n }));
  return {
    id,
    nodes,
    connections,
    fitness: 0,
    species: 0,
    ...(a.observationVersion
      ? { observationVersion: a.observationVersion }
      : {}),
  };
}
export function distance(a: Genome, b: Genome) {
  const bm = new Map(b.connections.map((c) => [c.innovation, c]));
  let matching = 0,
    diff = 0;
  for (const c of a.connections) {
    const other = bm.get(c.innovation);
    if (other) {
      matching++;
      diff += Math.abs(c.weight - other.weight);
    }
  }
  return (
    (1.5 * (a.connections.length + b.connections.length - 2 * matching)) /
      Math.max(1, a.connections.length, b.connections.length) +
    0.5 * (matching ? diff / matching : 0)
  );
}
