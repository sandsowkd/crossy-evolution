import { CURRENT_CONFIG } from "../core/types";
import type { Checkpoint } from "./trainer";

/** A new rules branch inherits the native population, not historical scores. */
export function eagleTransfer(checkpoint: Checkpoint): Checkpoint {
  const branch = structuredClone(checkpoint);
  branch.config.simulation.eagle = structuredClone(CURRENT_CONFIG.eagle);
  branch.generation = 0;
  branch.history = [];
  if (branch.neat.tuning) branch.neat.tuning = { ...branch.neat.tuning, generation: 0, progress: [] };
  return branch;
}
