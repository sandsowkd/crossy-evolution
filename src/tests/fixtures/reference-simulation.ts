// Frozen pre-optimization physics oracle. Keep its allocation-heavy collision
// path unchanged so optimized production code is checked against independent code.
import { observation } from "../../core/observation";
import { World, hazardsAt, signalAt } from "../../core/world";
import { sweptHit } from "./reference-collision";
import {
  DEFAULT_CONFIG,
  DELTA,
  DT,
  HALF_WIDTH,
  HOP_TICKS,
  TRAFFIC_LOOP,
  type Config,
  type Action,
  type AgentState,
  type GameState,
  type StepResult,
} from "../../core/types";

export class ReferenceSimulation {
  world: World;
  tick = 0;
  agent: AgentState;
  readonly config: Config;
  constructor(config: Partial<Config> = {}, seed = 1) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (
      !Number.isInteger(this.config.maxTicks) ||
      this.config.maxTicks < 1 ||
      !Number.isFinite(this.config.difficulty) ||
      this.config.difficulty <= 0
    )
      throw new Error("Invalid simulation configuration");
    this.world = new World(seed >>> 0, this.config);
    this.agent = this.initial();
  }
  private initial(): AgentState {
    return {
      x: 0,
      row: 0,
      maxRow: 0,
      alive: true,
      lastAction: "WAIT",
      blocked: false,
    };
  }
  reset(seed: number) {
    this.tick = 0;
    this.world = new World(seed >>> 0, this.config);
    this.agent = this.initial();
    return this.getObservation();
  }
  getObservation(version: 1 | 2 | 3 | 4 = 1, requiredInputs?: Uint8Array) {
    return observation(this.world, this.agent, this.tick, version, requiredInputs);
  }
  /** One decision advances 12 physics ticks (0.2 simulated seconds), unless terminal. */
  step(action: Action, encode = true): StepResult {
    if (!this.agent.alive) return this.result(0, encode);
    const old = this.agent.maxRow,
      [dx, dy] = DELTA[action],
      a = this.agent,
      ox = a.x,
      oy = a.row;
    let tx = ox + dx,
      ty = oy + dy;
    a.lastAction = action;
    a.blocked = false;
    if (Math.abs(tx) > HALF_WIDTH || ty < 0) {
      a.alive = false;
      a.deathReason = "bounds";
      return this.result(-2, encode);
    }
    if (this.world.row(ty).blocked.includes(tx)) {
      tx = ox;
      ty = oy;
      a.blocked = true;
    }
    let elapsed = 0;
    for (let s = 1; s <= HOP_TICKS; s++) {
      const nx = ox + ((tx - ox) * s) / HOP_TICKS,
        ny = oy + ((ty - oy) * s) / HOP_TICKS;
      let hit: "car" | "train" | undefined;
      for (
        let r = Math.floor(Math.min(a.row, ny) - 0.61);
        r <= Math.ceil(Math.max(a.row, ny) + 0.61);
        r++
      ) {
        for (const h of hazardsAt(this.world.row(r), this.tick)) {
          const shifts =
            h.kind === "car" ? [-TRAFFIC_LOOP, 0, TRAFFIC_LOOP] : [0];
          for (const shift of shifts)
            if (
              sweptHit(
                a.x,
                a.row,
                nx,
                ny,
                h.x + shift,
                h.x + shift + h.speed * DT,
                r,
                h.length,
              )
            ) {
              hit = h.kind;
              break;
            }
          if (hit) break;
        }
        if (hit) break;
      }
      a.x = nx;
      a.row = ny;
      this.tick++;
      elapsed++;
      if (hit) {
        a.alive = false;
        a.deathReason = hit;
        break;
      }
      if (this.tick >= this.config.maxTicks) {
        a.alive = false;
        a.deathReason = "timeout";
        break;
      }
    }
    // Only fully completed, surviving hops earn forward progress.
    if (a.alive) a.maxRow = Math.max(a.maxRow, Math.round(a.row));
    return this.result(
      10 * (a.maxRow - old) -
        0.01 * elapsed -
        (a.deathReason === "car" || a.deathReason === "train" ? 2 : 0),
      encode,
    );
  }
  private result(reward: number, encode: boolean): StepResult {
    return {
      observation: encode ? this.getObservation() : new Float32Array(0),
      reward,
      terminated: !this.agent.alive && this.agent.deathReason !== "timeout",
      truncated: this.agent.deathReason === "timeout",
      score: this.agent.maxRow,
      blocked: this.agent.blocked,
      deathReason: this.agent.deathReason,
    };
  }
  getState(): GameState {
    const rows = [];
    const center = Math.round(this.agent.row);
    for (let i = Math.max(0, center - 6); i <= center + 15; i++)
      rows.push(this.world.row(i));
    return {
      version: 1,
      seed: this.world.seed,
      tick: this.tick,
      config: { ...this.config },
      agent: { ...this.agent },
      rows: structuredClone(rows),
      hazards: rows.flatMap((r) => hazardsAt(r, this.tick)),
      signals: rows.filter((r) => signalAt(r, this.tick)).map((r) => r.index),
    };
  }
}
export const createSimulation = (config: Partial<Config> = {}) =>
  new ReferenceSimulation(config);
