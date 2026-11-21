import { mean, type Episode } from "./evaluation";

export type SelectionMetric = "robust-row-v1" | "goal-1000-v1" | "mean-row-v1";
/** Development-only objectives; final test scores never enter model choice. */
export function selectionScore(episodes: Episode[], metric: SelectionMetric) {
  const rows = episodes.map((e) => e.score).sort((a, b) => a - b);
  const lower = mean(rows.slice(0, Math.ceil(rows.length / 2)));
  if (metric === "mean-row-v1") return mean(rows);
  if (metric === "goal-1000-v1")
    return mean(rows.map((r) => Math.min(r, 1500))) +
      500 * rows.filter((r) => r >= 1000).length / rows.length + 0.25 * lower;
  return 0.5 * mean(rows) + 0.5 * lower;
}
