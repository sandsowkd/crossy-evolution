export type PreviewClip = {
  id: string; variant: 1 | 2; generation: number; sourceGeneration?: number; population: number; mapSeed: number;
  highestScore: number; decisions: number; seconds: number; sourceArchive: string;
  video: string; poster: string;
  mobileVideo?: string;
  automaticPlayback?: { finalGenomeId: number; finalScore: number; slowAtDecision: number; finishAtDecision: number };
  /** A normal-speed population excerpt; the linked live replay remains complete. */
  videoDecisionRange?: { start: number; end: number };
  videoPlaybackSpeed?: 1;
  /** Normal-speed previews repeat this exact range; population-mix includes every sampled brain. */
  decisionRange?: { start: number; end: number };
  policyGenomeId?: number;
  /** Ten original networks per curated display generation, all on one map. */
  previewKind?: "population-mix";
};
export type TrainingPhase = {
  id: string; name: string; generations: number; population: number; maps: number; episodeSeconds: number;
  source: string; changes: string; warmStart: boolean;
  history: { generation: number; mean: number; maximum: number }[];
};
export type HomepageData = { version: 1; clips: PreviewClip[]; phases: TrainingPhase[] };
