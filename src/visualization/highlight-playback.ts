import type { Config } from "../core/types";
import { HOP_TICKS } from "../core/types";
import { Replay } from "../evolution/replay";

/** Viewing replays run until death; archived evaluation limits stay untouched. */
export function highlightReplayConfig(archived: Config): Config {
  if (archived.mechanics === "upstream-v2") return { ...archived };
  return { ...archived, maxTicks: Number.MAX_SAFE_INTEGER,
    eagle: { afterTicks: 600, warningTicks: 0 } };
}

export const HIGHLIGHT_REPLAY_OPTIONS = {
  sparseObservations: true, terrainBehind: 14, terrainAhead: 24,
};

export const HIGHLIGHT_SPEEDS = [1, 10, 100, 500] as const;
export type HighlightAutoSpeedPlan = {
  finalGenomeId: number; finalScore: number; slowAtDecision: number; finishAtDecision: number;
};

/** Precompute the last survivor's score milestones without exposing future scores in the HUD. */
export function highlightAutoSpeedPlan(finished: Replay): HighlightAutoSpeedPlan {
  const last = finished.agents.reduce((latest, agent) =>
    agent.sim.tick > latest.sim.tick ||
    (agent.sim.tick === latest.sim.tick && agent.sim.agent.maxRow > latest.sim.agent.maxRow) ? agent : latest);
  const finalScore = last.sim.agent.maxRow;
  const solo = new Replay([last.genome], finished.seed, finished.config, finished.options);
  let slowAtDecision: number | undefined, finishAtDecision: number | undefined;
  for (;;) {
    const score = solo.current.sim.agent.maxRow;
    if (score >= finalScore - 100) slowAtDecision ??= solo.decisions;
    if (score >= finalScore - 10) { finishAtDecision = solo.decisions; break; }
    if (solo.finished) throw new Error("Final chicken did not reach its recorded score");
    solo.advance();
  }
  return { finalGenomeId: last.genome.id, finalScore, slowAtDecision: slowAtDecision!, finishAtDecision };
}

/** Five viewing seconds at 10x / 100x cover 50 / 500 simulation seconds. */
export function highlightAutomaticSpeed(decision: number, plan?: HighlightAutoSpeedPlan, ticksPerHop = HOP_TICKS) {
  const seconds = decision * ticksPerHop / 60;
  if (seconds < 5) return 1;
  if (seconds < 55) return 10;
  if (plan && decision >= plan.finishAtDecision) return 1;
  if (plan && decision >= plan.slowAtDecision) return 10;
  return seconds < 555 ? 100 : 500;
}

export const highlightJumpSeconds = (speed: number) => 5 * speed;
export const highlightJumpTarget = (decision: number, speed: number, ticksPerHop = HOP_TICKS) =>
  decision + highlightJumpSeconds(speed) * 60 / ticksPerHop;

/** Include dead chickens and keep the viewing session's record through seeks. */
export function highlightBestScore(replay: Pick<Replay, "agents">, record = 0) {
  return replay.agents.reduce((best, agent) => Math.max(best, agent.sim.agent.maxRow), record);
}

/** Fixed, precomputed episode extent: progress cannot jump back as time advances. */
export function highlightTimeline(decision: number, totalDecisions: number) {
  const max = Math.max(1, totalDecisions);
  const value = Math.max(0, Math.min(max, decision));
  return { max, value, percent: value / max * 100 };
}
