import type { Config } from "../core/types";
import { validGenome } from "../evolution/checkpoint";
import type { Genome } from "../evolution/genome";
import { parseEvolution } from "../evolution/serialization";
import type { RacePolicy } from "./race-session";

/** Pin the selected saved opponent for this visit, without touching development archives. */
export function savedRacePolicy(text: string, variant: 1 | 2): RacePolicy {
  if (variant === 1) {
    const saved = parseEvolution<{entries: (RacePolicy & {id: string; phaseGeneration: number})[]}>(text);
    const entry = saved.entries.find(entry=>entry.id === "variant-1-final");
    if (!entry || !validGenome(entry.genome)) throw new Error("Final saved AI is unavailable");
    return {genome: entry.genome, config: entry.config, generation: entry.phaseGeneration};
  }
  const saved = parseEvolution<{genomes: Genome[]; selectedGenome: number; simulation: Config; generation: number}>(text);
  const genome = saved.genomes.find(genome=>genome.id === saved.selectedGenome);
  if (!genome || !validGenome(genome) || saved.simulation.mechanics !== "upstream-v2")
    throw new Error("Frozen final AI is unavailable");
  return {genome, config: saved.simulation, generation: saved.generation};
}
