import type { Config } from "../core/types";
import type { HighlightAutoSpeedPlan } from "./highlight-playback";
import type { VariantNumber } from "./replay-links";
export type ExplorerRecord = {
  generation: number; populationSize: number; cohortFile: string; cohortHash: string; seeds: number[];
  milestone?: string; planSeed?: number; populationReplayDecisions?: number; automaticPlayback?: HighlightAutoSpeedPlan;
};
export type ExplorerPhase = {
  id: string; name: string; note: string; config: Config; source: string; records: ExplorerRecord[];
};
export type SequenceRecord = ExplorerRecord & { config: Config; sourceGeneration: number; sourcePhase: string };
export type ExplorerVariant = { sequence?: SequenceRecord[]; id: VariantNumber; name: string; completed: boolean; phases: ExplorerPhase[] };
export type ExplorerCatalog = { version: number; variants: ExplorerVariant[] };
export type ReplayEntry = ExplorerRecord & { config: Config; title: string };
