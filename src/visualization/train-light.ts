/** Extents of the rendered train relative to its world-space anchor. */
export type TrainBounds = {min: number; max: number};

/** End the visual warning as soon as the actual train clears the nine-tile crossing.
 * The simulation's conservative warning/observation window remains unchanged. */
export function trainLightVisible(warning: boolean, train?: {x: number; speed: number}, bounds?: TrainBounds) {
  if (!warning || !train || !bounds) return warning;
  const left = -train.x + bounds.min, right = -train.x + bounds.max;
  return train.speed < 0 ? left <= 4.5 : right >= -4.5;
}
