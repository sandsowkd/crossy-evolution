import { GameSimulation } from "../core/simulation";
import { DELTA, HALF_WIDTH, hopTicks, type Action, type AgentState, type Config } from "../core/types";
import type { Genome } from "../evolution/genome";
import { Replay } from "../evolution/replay";
import { hazardsAt, signalAt } from "../core/world";
import { advanceUpstream, platformsAt } from "../core/upstream";
import { highlightReplayConfig, HIGHLIGHT_REPLAY_OPTIONS } from "./highlight-playback";
import type { SceneAgent, SceneSnapshot } from "./three/scene";
import { RACE_EAGLE_TICKS } from "./race-eagle";

export type RacePolicy = {genome: Genome; config: Config; generation: number};
export const RACE_SCROLL_ROWS_PER_SECOND = .55;
export const RACE_TRAILING_ROWS = 3;
export const RACE_OFFSCREEN_GRACE_TICKS = 42;
export const RACE_INPUT_BUFFER_TICKS = 9;

/** Preserve numeric map IDs; hash any other seed text into the same uint32 space. */
export function raceSeed(text: string) {
  const normalized = text.trim().normalize("NFC");
  if (/^\d+$/.test(normalized) && Number(normalized) <= 0xffffffff) return Number(normalized);
  let seed = 2166136261;
  for (const character of new TextEncoder().encode(normalized)) seed = Math.imul(seed ^ character, 16777619);
  return seed >>> 0;
}

export function raceAction(key: string): Action | undefined {
  return ({ArrowUp: "UP", ArrowDown: "DOWN", ArrowLeft: "LEFT", ArrowRight: "RIGHT",
    w: "UP", s: "DOWN", a: "LEFT", d: "RIGHT", " ": "UP"} as Record<string, Action>)[key.length === 1 ? key.toLowerCase() : key];
}

/** A deliberate swipe/drag uses the same directions as the keyboard. */
export function raceSwipe(dx: number, dy: number): Action | undefined {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  return Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "RIGHT" : "LEFT" : dy > 0 ? "DOWN" : "UP";
}

/** Sample a forecast hop at its actual collision tick, never showing future scores or deaths. */
function sample(from: AgentState, to: AgentState, start: number, end: number, now: number): SceneAgent & {maxRow: number} {
  const duration = end - start;
  const progress = duration > 0 ? Math.max(0, Math.min(1, (now - start) / duration)) : 1;
  const alive = to.alive || (from.alive && now < end);
  return {id: 0, x: from.x + (to.x - from.x) * progress, row: from.row + (to.row - from.row) * progress,
    alive, maxRow: now >= end ? to.maxRow : from.maxRow,
    hop: alive && to.lastAction !== "WAIT" && !to.blocked &&
      (to.x !== from.x || to.row !== from.row) ? progress : 0,
    ...(to.visualY !== undefined ? {visualY: now >= end ? to.visualY : from.visualY} : {}),
    ...(!alive ? {deathReason: to.deathReason} : {})};
}

/**
 * Race-only clock: idle waits can be interrupted immediately by a human input.
 * Each hop is forecast with the original physics and sampled at 60 Hz; the AI
 * keeps its native policy cadence. No training/replay rules change.
 */
export class RaceSession {
  readonly player: GameSimulation;
  readonly bot: Replay;
  readonly config: Config;
  private previous: AgentState;
  private previousTick = 0;
  private action: Action = "WAIT";
  private pending?: {action: Action; expires: number};
  private active = false;
  private startTick = 0;
  private outsideCamera = false;
  private behindTicks = 0;
  private captureTick?: number;
  readonly ticksPerHop: number;
  tick = 0;
  cameraRow = 0;
  constructor(policy: RacePolicy, readonly seedText: string) {
    this.config = highlightReplayConfig(policy.config);
    this.ticksPerHop = hopTicks(this.config);
    const seed = raceSeed(seedText);
    // The human is removed by the moving screen boundary, not an idle timer.
    const humanConfig = {...this.config}; delete humanConfig.eagle;
    this.player = new GameSimulation(humanConfig, seed);
    this.previous = {...this.player.agent};
    this.bot = new Replay([policy.genome], seed, this.config, HIGHLIGHT_REPLAY_OPTIONS);
  }
  get hasStarted() { return this.active; }
  get playerState() { return sample(this.previous, this.player.agent, this.previousTick, this.player.tick, this.tick); }
  get botState() {
    const bot = this.bot.current;
    return sample(bot.previous, bot.sim.agent, bot.ticks, bot.sim.tick, this.tick);
  }
  get eagleAnimating() { return this.captureTick !== undefined && this.tick - this.captureTick < RACE_EAGLE_TICKS; }
  get finished() { return !this.playerState.alive && !this.botState.alive && !this.eagleAnimating; }
  get trailingWarning() { return this.playerState.alive && this.cameraRow - this.playerState.row > RACE_TRAILING_ROWS - 1; }
  clearInput() { this.pending = undefined; }
  setPlayerOffscreen(outside: boolean) { this.outsideCamera = outside; }
  /** A fresh move starts on this input, rather than waiting for a replay beat. */
  command(action: Action) {
    if (action === "WAIT" || !this.playerState.alive) return;
    if (!this.active) {
      this.active = true;
      // Traffic already runs in the preview. Both chickens start at that exact
      // traffic time, and the AI's idle/eagle timer starts with its first move.
      this.startTick = this.tick;
      this.player.tick = this.tick; this.previousTick = this.tick;
      this.bot.current.sim.tick = this.tick; this.bot.current.ticks = this.tick;
      // Native Variant 2's episode limit is a duration from race start, not
      // from opening the map preview. Preserve the saved duration for the AI.
      if (this.config.mechanics === "upstream-v2") {
        this.player.config.maxTicks += this.tick;
        this.bot.current.sim.config.maxTicks += this.tick;
      }
      if (this.bot.current.sim.config.eagle) this.bot.current.sim.agent.lastProgressTick = this.tick;
      this.bot.advance();
    }
    const moving = this.action !== "WAIT" && this.tick < this.player.tick;
    if (moving) {
      // Only the latest tap survives, for 150 ms. A burst cannot keep steering
      // the chicken for several hops after the player has stopped pressing.
      this.pending = {action, expires: this.tick + RACE_INPUT_BUFFER_TICKS};
    } else {
      this.clearInput(); this.beginHuman(action);
    }
  }
  private beginHuman(action: Action) {
    // Rewind only the unelapsed portion of an idle forecast. A moving hop must finish.
    if (this.action === "WAIT" && this.tick < this.player.tick) {
      this.player.agent = {...this.previous};
      this.player.tick = this.previousTick;
      if (this.config.mechanics === "upstream-v2" && this.tick > this.previousTick) {
        // Reconstruct elapsed log drift before interrupting a wait; rewinding
        // the entire wait would teleport a human standing on a moving log.
        advanceUpstream({agent: this.player.agent, world: this.player.world, tick: this.previousTick,
          config: {...this.player.config, maxTicks: this.tick}}, "WAIT");
        this.player.agent.alive = true; delete this.player.agent.deathReason;
      }
      this.player.tick = this.tick;
    }
    this.previous = {...this.player.agent}; this.previousTick = this.tick; this.action = action;
    this.stepHuman(action);
  }
  private stepHuman(action: Action) {
    const agent = this.player.agent, [dx, dy] = DELTA[action];
    const x = agent.x + dx, row = agent.row + dy;
    // The three grass rows behind the start end at the visible tree line in
    // WorldView. Human-only edges block a hop instead of killing the player.
    const blocked = Math.abs(x) > HALF_WIDTH || row < -3;
    if (agent.row < 0 || row < 0) {
      // This whole starting apron is grass, without traffic or hazards. Handle
      // it here because archived simulations deliberately forbid negative rows.
      agent.lastAction = action; agent.blocked = blocked;
      if (!blocked) { agent.x = x; agent.row = row; }
      this.player.tick += this.ticksPerHop;
    } else {
      // A blocked edge still consumes time and checks cars on the current tile.
      this.player.step(blocked ? "WAIT" : action, false);
      if (blocked) { agent.lastAction = action; agent.blocked = true; }
    }
  }
  advanceTicks(count = 1) {
    if (!this.active) { this.tick += count; return; }
    for (let i = 0; i < count && !this.finished; i++) {
      if (this.playerState.alive && this.tick >= this.player.tick) {
        const next = this.pending && this.pending.expires >= this.tick ? this.pending.action : "WAIT";
        this.clearInput(); this.beginHuman(next);
      }
      if (this.tick > this.startTick && (this.tick - this.startTick) % this.ticksPerHop === 0 && !this.bot.finished) this.bot.advance();
      this.tick++;
      const player = this.playerState;
      if (player.alive) {
        // Camera never retreats during play, including repeated backward hops.
        this.cameraRow = Math.max(this.cameraRow + RACE_SCROLL_ROWS_PER_SECOND / 60, player.row);
        const behind = this.cameraRow - player.row > RACE_TRAILING_ROWS || this.outsideCamera;
        this.behindTicks = behind ? this.behindTicks + 1 : 0;
        if (this.behindTicks >= RACE_OFFSCREEN_GRACE_TICKS) {
          this.player.agent = {...this.previous, x: player.x, row: player.row, maxRow: player.maxRow,
            alive: false, deathReason: "eagle"};
          this.player.tick = this.tick; this.previous = {...this.player.agent}; this.previousTick = this.tick;
          this.captureTick = this.tick; this.clearInput();
        }
      }
    }
  }
  /** Convenience for deterministic native-cadence comparison tests. */
  advance(action: Action = "WAIT") { if (action !== "WAIT") this.command(action); this.advanceTicks(this.ticksPerHop); }
  snapshot(subTick = 0, follow: "player" | "bot" = "player"): SceneSnapshot {
    const tick = this.tick + (!this.finished ? Math.max(0, Math.min(1, subTick)) : 0);
    const native = this.bot.current;
    const player: SceneAgent = sample(this.previous, this.player.agent, this.previousTick, this.player.tick, tick);
    const bot: SceneAgent = {...sample(native.previous, native.sim.agent, native.ticks, native.sim.tick, tick), id: 1, opacity: .7};
    if (this.captureTick !== undefined) player.eagle = {remainingTicks: 0, warning: false, captured: true,
      captureTicks: Math.max(0, tick - this.captureTick), swoopFromTop: true};
    const focus = follow === "bot" ? bot.row : this.cameraRow;
    const rows = [];
    for (let row = Math.max(0, Math.floor(focus) - 18); row <= Math.floor(focus) + 26; row++) rows.push(this.player.world.row(row));
    return {rows, tick, focus, focusX: follow === "bot" ? bot.x : player.x,
      hazards: rows.flatMap(row => hazardsAt(row, tick)),
      signals: rows.filter(row => signalAt(row, tick)).map(row => row.index),
      ...(this.config.mechanics === "upstream-v2" ? {supports: rows.flatMap(row=>platformsAt(row,tick))} : {}),
      agents: follow === "bot" ? [bot] : [player, bot]};
  }
}
