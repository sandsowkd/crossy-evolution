export const ACTIONS = ["UP", "DOWN", "LEFT", "RIGHT", "WAIT"] as const;
export type Action = (typeof ACTIONS)[number];
export type DeathReason = "car" | "train" | "tree" | "bounds" | "timeout" | "eagle" | "water";
export type Curriculum = "roads" | "trains" | "mixed";
export type Config = {
  curriculum: Curriculum;
  maxTicks: number;
  difficulty: number;
  mechanics?: "upstream-v2";
  /** Explicit project rules; absent preserves the initial source-port experiment. */
  variantTwoRules?: "varied-traffic-v1" | "clustered-traffic-v2";
  /** Missing means historical rules. New games explicitly opt in. */
  eagle?: { afterTicks: number; warningTicks: number };
};
export type Vehicle = {
  offset: number;
  length: number;
  variant: string;
};
export type Row = {
  index: number;
  type: "grass" | "road" | "rail" | "water";
  blocked: number[];
  speed: number;
  vehicles: Vehicle[];
  period: number;
  phase: number;
  length: number;
  warning: number;
  upstream?: true;
  trainMiddles?: number;
  trainSchedule?: { arrivals: number[]; warningTicks: number };
  platformLoop?: number;
  platforms?: { offset: number; length: number; visualLength?: number; speed: number; kind: "log" | "lily"; variant: number }[];
};
export type Hazard = {
  id: string;
  row: number;
  x: number;
  length: number;
  speed: number;
  kind: "car" | "train";
  variant: string;
  upstream?: true;
  trainMiddles?: number;
};
export type Support = { id: string; row: number; x: number; length: number; visualLength?: number; speed: number; kind: "log" | "lily"; variant: number };
export type AgentState = {
  x: number;
  row: number;
  maxRow: number;
  alive: boolean;
  lastAction: Action;
  blocked: boolean;
  deathReason?: DeathReason;
  lastProgressTick?: number;
  ridingOn?: string;
  ridingSpeed?: number;
  visualY?: number;
};
export type GameState = {
  version: 1;
  seed: number;
  tick: number;
  config: Config;
  agent: AgentState;
  rows: Row[];
  hazards: Hazard[];
  signals: number[];
  supports?: Support[];
};
export type StepResult = {
  observation: Float32Array;
  reward: number;
  terminated: boolean;
  truncated: boolean;
  score: number;
  blocked: boolean;
  deathReason?: DeathReason;
};
export const DEFAULT_CONFIG: Config = {
  curriculum: "roads",
  maxTicks: 1800,
  difficulty: 1,
};
/** New runs use this preset; archived configs without eagle remain unchanged. */
export const CURRENT_CONFIG: Config = {
  ...DEFAULT_CONFIG,
  eagle: { afterTicks: 600, warningTicks: 180 },
};
export const TRAIN_START = 80;
export const DT = 1 / 60,
  HOP_TICKS = 12,
  HALF_WIDTH = 4,
  TRAFFIC_LOOP = 22;
export const DELTA: Record<Action, readonly [number, number]> = {
  UP: [0, 1],
  DOWN: [0, -1],
  LEFT: [-1, 0],
  RIGHT: [1, 0],
  WAIT: [0, 0],
};
