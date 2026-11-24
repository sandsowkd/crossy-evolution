/**
 * User-facing Variant 1 sequence (1–150), spliced from immutable native cohorts.
 * These are presentation positions, not a claim of 150 uninterrupted training
 * generations. Preserve native sourceGeneration/sourcePhase and all real genomes,
 * seeds, configs and hashes. Do not splice individuals, interpolate weights, or
 * alter benchmark histories. Milestone cards and the selector share this mapping.
 *
 * Positions 1–5: prototype generations 1–5.
 * Positions 6–35: binary generations 6–470.
 * Positions 36–43: motion-input generations 1–30.
 * Positions 44–50: lookahead generations 1–30.
 * Positions 51–85: lookahead generations 32–85.
 * Positions 86–99: later lookahead generations 90–600. Do not jump directly to
 * mature memory gen 86: an exhaustive viewing-rule audit found a threefold
 * mean-score discontinuity at that former source boundary.
 * Positions 100–150: earlier/final memory generations 100–150.
 * Every display position uses the SAME eight map seeds, so the mean and maximum
 * curves cover identical maps and sample sizes. No scores, weights, deaths or
 * horizons are changed to make a smoother curve. Random-map variance remains.
 *
 * The six public anchors are 1, 5, 50, 85, 100, 150. Legacy phase-qualified
 * links still resolve their exact source cohorts; research results stay native.
 */
export function sequenceSource(generation: number) {
  if (!Number.isInteger(generation) || generation < 1 || generation > 150)
    throw new Error("Sequence generation must be between 1 and 150");
  if (generation <= 5) return {phase: "prototype", generation};
  if (generation <= 35) return {phase: "binary", generation: Math.round(6 + (generation - 6) * 464 / 29)};
  if (generation <= 43) return {phase: "motion", generation: Math.round(1 + (generation - 36) * 29 / 7)};
  if (generation <= 50) return {phase: "lookahead", generation: Math.round(1 + (generation - 44) * 29 / 6)};
  if (generation <= 85) return {phase: "lookahead", generation: Math.round(30 + (generation - 50) * 55 / 35)};
  if (generation < 100) return {phase: "lookahead", generation: Math.round(90 + (generation - 86) * 510 / 13)};
  if (generation === 100) return {phase: "memory-audit", generation};
  return {phase: "memory", generation};
}
export function isReplaySpace(event: Pick<KeyboardEvent, "code" | "repeat" | "altKey" | "ctrlKey" | "metaKey">, target: EventTarget | null) {
  if (event.code !== "Space" || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return false;
  const element = target as Element | null;
  return !(typeof element?.closest === "function" && element.closest("input,select,textarea,[contenteditable=true],[role=textbox],[role=dialog],dialog"));
}

/** A fixed, pre-existing seeded-map panel, chosen independently of replay scores. */
export const REPLAY_MAP_SEEDS = [27099291, 561909326, 1065763094, 579527571, 627233379, 984306285, 576994168, 346364751] as const;
