export const ACTIONS = ["UP", "DOWN", "LEFT", "RIGHT", "WAIT"] as const;
export type Action = (typeof ACTIONS)[number];
export type DeathReason = "car" | "train" | "tree" | "bounds" | "timeout";
export type Curriculum = "roads" | "trains";
export type Config = {
  curriculum: Curriculum;
  maxTicks: number;
  difficulty: number;
};
export type Vehicle = {
  offset: number;
  length: number;
  variant: "car" | "truck";
};
export type Row = {
  index: number;
  type: "grass" | "road" | "rail";
  blocked: number[];
  speed: number;
  vehicles: Vehicle[];
  period: number;
  phase: number;
  length: number;
  warning: number;
};
export type Hazard = {
  id: string;
  row: number;
  x: number;
  length: number;
  speed: number;
  kind: "car" | "train";
  variant: string;
};
export type AgentState = {
  x: number;
  row: number;
  maxRow: number;
  alive: boolean;
  lastAction: Action;
  blocked: boolean;
  deathReason?: DeathReason;
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
