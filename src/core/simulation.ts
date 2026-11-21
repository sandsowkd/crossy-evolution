import { observation } from "./observation";
import { World, hazardsAt, signalAt } from "./world";
import { sweptHit } from "./collision";
import { modulo } from "./rng";
import { advanceUpstream, platformsAt } from "./upstream";
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
} from "./types";

export class GameSimulation {
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
    if (this.config.variantTwoRules !== undefined && (!["varied-traffic-v1", "clustered-traffic-v2", "clustered-traffic-v3"].includes(this.config.variantTwoRules) ||
      this.config.mechanics !== "upstream-v2" || this.config.curriculum !== "mixed"))
      throw new Error("Invalid Variant 2 rules");
    const eagle=this.config.eagle;
    if(eagle !== undefined && (!eagle || !Number.isInteger(eagle.afterTicks)||eagle.afterTicks<12||eagle.afterTicks>36000||
      !Number.isInteger(eagle.warningTicks)||eagle.warningTicks<0||eagle.warningTicks>=eagle.afterTicks))
      throw new Error("Invalid eagle configuration");
    if (eagle) this.config.eagle = { ...eagle };
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
      ...(this.config.eagle ? {lastProgressTick:0} : {}),
    };
  }
  reset(seed: number) {
    this.tick = 0;
    this.world = new World(seed >>> 0, this.config);
    this.agent = this.initial();
    return this.getObservation();
  }
  getObservation(version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 1, requiredInputs?: Uint8Array,target?:Float32Array) {
    return observation(this.world, this.agent, this.tick, version, requiredInputs,target);
  }
  /** One decision advances 12 physics ticks (0.2 simulated seconds), unless terminal. */
  step(action: Action, encode = true): StepResult {
    if (!this.agent.alive) return this.result(0, encode);
    if (this.config.mechanics === "upstream-v2") return this.result(advanceUpstream(this, action), encode);
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
    const eagleDeadline=this.config.eagle ? (a.lastProgressTick??0)+this.config.eagle.afterTicks : Infinity;
    const clearTicks = Math.min(HOP_TICKS, this.config.maxTicks - this.tick, eagleDeadline-this.tick);
    if (clearTicks > 0 && this.roadHopIsClear(ox, oy, tx, ty, clearTicks)) {
      a.x = ox + ((tx - ox) * clearTicks) / HOP_TICKS;
      a.row = oy + ((ty - oy) * clearTicks) / HOP_TICKS;
      this.tick += clearTicks;
      if (this.tick >= eagleDeadline) {
        a.alive=false; a.deathReason="eagle";
      } else if (this.tick >= this.config.maxTicks) {
        a.alive = false;
        a.deathReason = "timeout";
      }
      if (a.alive) this.recordProgress();
      return this.result(10 * (a.maxRow - old) - 0.01 * clearTicks -
        (a.deathReason === "car" || a.deathReason === "train" || a.deathReason === "eagle" ? 2 : 0), encode);
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
        const row = this.world.row(r);
        if (row.type === "road") {
          // Preserve hazardsAt's arithmetic and image order exactly, while
          // avoiding temporary hazard objects and arrays for every physics tick.
          const t = this.tick * DT;
          for (const vehicle of row.vehicles) {
            const x = modulo(vehicle.offset + row.speed * t + TRAFFIC_LOOP / 2,
              TRAFFIC_LOOP) - TRAFFIC_LOOP / 2;
            for (let image = -1; image <= 1; image++) {
              const shift = image * TRAFFIC_LOOP;
              if (sweptHit(a.x, a.row, nx, ny, x + shift,
                x + shift + row.speed * DT, r, vehicle.length)) {
                hit = "car";
                break;
              }
            }
            if (hit) break;
          }
          if (hit) break;
          continue;
        }
        for (const h of hazardsAt(row, this.tick)) {
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
      if (this.tick >= eagleDeadline) {
        a.alive=false; a.deathReason="eagle";
        break;
      }
      if (this.tick >= this.config.maxTicks) {
        a.alive = false;
        a.deathReason = "timeout";
        break;
      }
    }
    // Only fully completed, surviving hops earn forward progress.
    if (a.alive) this.recordProgress();
    return this.result(
      10 * (a.maxRow - old) -
        0.01 * elapsed -
        (a.deathReason === "car" || a.deathReason === "train" || a.deathReason === "eagle" ? 2 : 0),
      encode,
    );
  }
  private recordProgress() {
    const a=this.agent, score=Math.max(a.maxRow,Math.round(a.row));
    if(this.config.eagle && score>a.maxRow)a.lastProgressTick=this.tick;
    a.maxRow=score;
  }
  get eagleState() {
    const rule=this.config.eagle;
    if(!rule)return undefined;
    const idleTicks=this.tick-(this.agent.lastProgressTick??0),remainingTicks=Math.max(0,rule.afterTicks-idleTicks);
    return {idleTicks,remainingTicks,warning:remainingTicks<=rule.warningTicks,captured:this.agent.deathReason==="eagle"};
  }
  /** Conservative broad phase only. Any possible contact uses the original tick loop.
   * Road traffic and hops are linear over this interval. Padding covers roundoff;
   * rails, extreme states/speeds and multiple-wrap motion always use the tick loop.
   */
  private roadHopIsClear(ox:number,oy:number,tx:number,ty:number,ticks:number) {
    if (!Number.isInteger(this.tick) || Math.abs(oy)>100_000 || Math.abs(ox)>100_000 || Math.abs(this.tick)>1_000_000) return false;
    const nx=ox+((tx-ox)*ticks)/HOP_TICKS,ny=oy+((ty-oy)*ticks)/HOP_TICKS,
      duration=ticks*DT,time=this.tick*DT;
    for(let r=Math.floor(Math.min(oy,ny)-.61);r<=Math.ceil(Math.max(oy,ny)+.61);r++){
      const row=this.world.row(r);
      if(row.type==="grass")continue;
      if(row.type!=="road"||!Number.isFinite(row.speed)||Math.abs(row.speed*duration)>TRAFFIC_LOOP/4)return false;
      for(const vehicle of row.vehicles){
        if(!Number.isFinite(vehicle.offset)||Math.abs(vehicle.offset)>1_000_000)return false;
        const x=modulo(vehicle.offset+row.speed*time+TRAFFIC_LOOP/2,TRAFFIC_LOOP)-TRAFFIC_LOOP/2;
        for(let image=-1;image<=1;image++){
          const start=x+image*TRAFFIC_LOOP;
          if(sweptHit(ox,oy,nx,ny,start,start+row.speed*duration,r,vehicle.length,1e-8))return false;
        }
      }
    }
    return true;
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
      config: { ...this.config, ...(this.config.eagle ? { eagle: { ...this.config.eagle } } : {}) },
      agent: { ...this.agent },
      rows: structuredClone(rows),
      hazards: rows.flatMap((r) => hazardsAt(r, this.tick)),
      signals: rows.filter((r) => signalAt(r, this.tick)).map((r) => r.index),
      ...(this.config.mechanics === "upstream-v2" ? { supports: rows.flatMap(r => platformsAt(r, this.tick)) } : {}),
    };
  }
}
export const createSimulation = (config: Partial<Config> = {}) =>
  new GameSimulation(config);
