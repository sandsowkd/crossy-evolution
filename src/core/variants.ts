import { CURRENT_CONFIG, type Config } from "./types";

/** Named curricula keep later mechanics separate from the frozen roads baseline. */
export const VARIANTS = [
  { id: 1, name: "Cars and roads", status: "complete", curriculum: "roads",
    maxConsecutiveRoads: 3, eagle: false },
  { id: 2, name: "Trains", status: "mechanics-present", curriculum: "trains",
    maxConsecutiveRoads: 3, eagle: true },
  { id: 3, name: "Rivers, logs and lily pads", status: "planned", curriculum: null,
    maxConsecutiveRoads: 3, eagle: true },
  { id: 4, name: "Extended full-game rules", status: "planned", curriculum: null,
    maxConsecutiveRoads: null, eagle: true },
] as const;
export type VariantId = typeof VARIANTS[number]["id"];

export function variantSimulation(id: VariantId, maxTicks = 36000): Config {
  const variant = VARIANTS.find(v => v.id === id);
  if (!variant?.curriculum) throw new Error(`Variant ${id} mechanics are not implemented`);
  if (!Number.isInteger(maxTicks) || maxTicks < 1) throw new Error("Invalid episode horizon");
  return { curriculum: variant.curriculum, maxTicks, difficulty: 1,
    ...(variant.eagle ? { eagle: structuredClone(CURRENT_CONFIG.eagle) } : {}),
  };
}
