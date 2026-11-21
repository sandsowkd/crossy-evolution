import { RNG } from "../core/rng";
import { ACTIONS, type Action } from "../core/types";
import { GLOBAL_OFFSET } from "../core/observation";
export type Policy = (observation: Float32Array) => Action;
export const randomPolicy = (seed: number): Policy => {
  const rng = new RNG(seed);
  return () => rng.pick(ACTIONS);
};
export const alwaysUp: Policy = () => "UP";
/** Deliberately simple: avoid predicted landing occupancy, move up first, then sideways. */
export const heuristic: Policy = (o) => {
  const risk = (i: number) => o[GLOBAL_OFFSET + 3 + i];
  if (risk(0) < 0.5) return "UP";
  if (o[GLOBAL_OFFSET + 8] > 0.5) {
    if (risk(2) < 0.5 && o[GLOBAL_OFFSET] > -1) return "LEFT";
    if (risk(3) < 0.5 && o[GLOBAL_OFFSET] < 1) return "RIGHT";
  }
  if (risk(4) < 0.5) return "WAIT";
  if (risk(2) < 0.5 && o[GLOBAL_OFFSET] > -1) return "LEFT";
  if (risk(3) < 0.5 && o[GLOBAL_OFFSET] < 1) return "RIGHT";
  return "DOWN";
};
