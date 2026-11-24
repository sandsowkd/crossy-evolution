import type { Config } from "../core/types";
import type { Genome } from "../evolution/genome";
import { Replay } from "../evolution/replay";
import { highlightAutoSpeedPlan, highlightReplayConfig, HIGHLIGHT_REPLAY_OPTIONS } from "./highlight-playback";

/** Run in a worker for new maps; frozen policies and historical configs are read-only. */
export function prepareHighlightMap(genomes: Genome[], seed: number, config: Config) {
  const replay = new Replay(genomes, seed, highlightReplayConfig(config), HIGHLIGHT_REPLAY_OPTIONS);
  while (!replay.finished) replay.advance();
  return { decisions: replay.decisions, automaticPlayback: highlightAutoSpeedPlan(replay) };
}
