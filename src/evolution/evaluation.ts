import { GameSimulation } from "../core/simulation";
import { type Config, type Action, type DeathReason } from "../core/types";
import { type Policy } from "./baselines";
import { type Genome } from "./genome";
import { Network } from "./network";
import { INPUT_COUNT } from "../core/observation";
export const HELD_OUT_SEEDS = Array.from(
  { length: 16 },
  (_, i) => (0xe1000000 + i * 7919) >>> 0,
);
export type Episode = {
  seed: number;
  score: number;
  fitness: number;
  ticks: number;
  deathReason?: DeathReason;
};
export type Trace = {
  tick: number;
  observation: number[];
  scores: number[];
  action: Action;
  x: number;
  row: number;
  alive: boolean;
  deathReason?: DeathReason;
};
export function fitness(score: number, ticks: number, death?: DeathReason) {
  return (
    10 * score - 0.01 * ticks - (death === "car" || death === "train" || death === "eagle" ? 2 : 0)
  );
}
export function episode(
  policy: Policy,
  seed: number,
  config: Partial<Config> = {},
  trace?: Trace[],
  network?: Network,
  observationVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 = network?.observationVersion ?? 1,
  observationBuffer?: Float32Array,
): Episode {
  const s = new GameSimulation(config, seed);
  // Full traces retain every sensor channel for inspection. Compiled networks
  // otherwise encode exactly the channels their enabled edges consume.
  const requiredInputs = trace ? undefined : network?.requiredInputs;
  let o = s.getObservation(observationVersion, requiredInputs,observationBuffer);
  while (s.agent.alive) {
    const before = s.tick,
      obs = trace ? Array.from(o) : [];
    const a = policy(o);
    s.step(a, false);
    o = s.getObservation(observationVersion, requiredInputs,observationBuffer);
    if (trace)
      trace.push({
        tick: before,
        observation: obs,
        scores: network ? Array.from(network.scores) : [],
        action: a,
        x: s.agent.x,
        row: s.agent.row,
        alive: s.agent.alive,
        deathReason: s.agent.deathReason,
      });
  }
  return {
    seed,
    score: s.agent.maxRow,
    fitness: fitness(s.agent.maxRow, s.tick, s.agent.deathReason),
    ticks: s.tick,
    deathReason: s.agent.deathReason,
  };
}
export function evaluateGenome(
  g: Genome,
  seeds: number[],
  config: Partial<Config> = {},
) {
  const n = new Network(g);
  // Only this fixed, synchronous native policy opts into buffer reuse. General
  // episode callbacks and inspection traces keep their existing ownership rules.
  const buffer=new Float32Array(INPUT_COUNT);
  return seeds.map((seed) => episode((o) => n.decide(o), seed, config, undefined, n,n.observationVersion,buffer));
}
export const mean = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
