import { hazardsAt, signalAt, type World } from "./world";
import { platformsAt, sourceFramePosition } from "./upstream";
import { modulo } from "./rng";
import { sensorIndex, sensorCount, VARIANT_TWO_EXTRA_INPUTS, VARIANT_TWO_INPUT_START } from "./sensor-version";
import {
  DELTA,
  ACTIONS,
  HALF_WIDTH,
  HOP_TICKS,
  DT,
  TRAFFIC_LOOP,
  type AgentState,
  type Hazard,
  type Row,
} from "./types";
export const ROW_OFFSETS = [-2, -1, 0, 1, 2, 3, 4, 5] as const;
export const CELL_FEATURES = [
  "grass",
  "road",
  "rail",
  "blocked",
  "occupancy",
  "velocity",
  "warning",
  "landing occupancy",
  "unknown",
] as const;
export const CELL_COUNT = 8 * 9,
  GLOBAL_OFFSET = CELL_COUNT * 9,
  INPUT_COUNT = GLOBAL_OFFSET + 10;
export const GLOBAL_LABELS = [
  "x",
  "clock sin",
  "clock cos",
  "up risk",
  "down risk",
  "left risk",
  "right risk",
  "wait risk",
  "up blocked",
  "current signal",
];
function observationBuffer(target?:Float32Array){
  if(!target)return new Float32Array(INPUT_COUNT);
  if(target.length!==INPUT_COUNT)throw new Error(`Observation buffer must contain ${INPUT_COUNT} channels`);
  target.fill(0);
  return target;
}
export function inputLabel(i: number, version = 1) {
  if (version === 9 && i >= VARIANT_TWO_INPUT_START) {
    const extra = sensorIndex(i) - INPUT_COUNT;
    if (extra >= CELL_COUNT * 3) return ["inactivity fraction","current rail signal","next rail signal","riding velocity","fractional x","up landing support","down landing support","current water"][extra-CELL_COUNT*3];
    const cell = Math.floor(extra / 3);
    return `r${ROW_OFFSETS[Math.floor(cell/9)]} c${cell%9-4} ${["water","support now","support at landing"][extra%3]}`;
  }
  if (i >= GLOBAL_OFFSET) {
    const global = i - GLOBAL_OFFSET;
    if ((version === 5 || version === 8) && global === 1) return "two-hop forward hazard proximity";
    if ((version === 5 || version === 8) && global === 2) return "two-hop forward blocked";
    if (version === 6 && global === 1) return "previous horizontal action";
    if (version === 6 && global === 2) return "previous action blocked";
    if ((version === 7 || version === 8) && global === 9) return "previous horizontal action";
    if (version >= 3 && global >= 3 && global < 8)
      return `${ACTIONS[global - 3].toLowerCase()} trajectory proximity`;
    return GLOBAL_LABELS[global];
  }
  const cell = Math.floor(i / 9),
    dy = ROW_OFFSETS[Math.floor(cell / 9)],
    dx = (cell % 9) - 4;
  const feature =
    (version === 2 || version === 4) && i % 9 === 4
      ? "hazard proximity"
      : (version === 2 || version === 4) && i % 9 === 7
        ? "landing proximity"
        : CELL_FEATURES[i % 9];
  return `r${dy >= 0 ? "+" : ""}${dy} c${dx >= 0 ? "+" : ""}${dx} ${feature}`;
}
export function observation(
  world: World,
  agent: AgentState,
  tick: number,
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 1,
  requiredInputs?: Uint8Array,
  target?: Float32Array,
): Float32Array {
  if (version === 9 && requiredInputs)
    return sparseVariantTwoObservation(world, agent, tick, requiredInputs, target);
  if (version === 9) {
    const size = sensorCount(9);
    if (target && target.length !== size) throw new Error(`Observation buffer must contain ${size} channels`);
    const out = target ?? new Float32Array(size);
    out.fill(0);
    out.set(observation(world,agent,tick,8));
    const cx=Math.round(agent.x),cy=Math.round(agent.row);
    let extra=INPUT_COUNT;
    const supported=(row:Row,time:number,x:number)=>+platformsAt(row,time).some(p=>Math.abs(p.x-x)<p.length/2+.25);
    for(const dy of ROW_OFFSETS){const row=world.row(cy+dy);for(let dx=-4;dx<=4;dx++){
      const x=cx+dx;
      if(Math.abs(x)<=5&&cy+dy>=0){out[extra]=+(row.type==="water");out[extra+1]=supported(row,tick,x);out[extra+2]=supported(row,tick+HOP_TICKS,x);}
      extra+=3;
    }}
    out[extra++]=world.config.eagle?Math.min(1,(tick-(agent.lastProgressTick??0))/world.config.eagle.afterTicks):0;
    out[extra++]=+signalAt(world.row(cy),tick);
    out[extra++]=+signalAt(world.row(cy+1),tick);
    out[extra++]=(agent.ridingSpeed??0)/4.2;
    out[extra++]=agent.x-Math.round(agent.x);
    out[extra++]=supported(world.row(cy+1),tick+HOP_TICKS,Math.round(agent.x));
    out[extra++]=supported(world.row(cy-1),tick+HOP_TICKS,Math.round(agent.x));
    out[extra++]=+(world.row(cy).type==="water");
    if(extra!==INPUT_COUNT+VARIANT_TWO_EXTRA_INPUTS)throw new Error("V9 layout mismatch");
    for(let n=0;n<out.length;n++){out[n]=Math.max(-1,Math.min(1,out[n]));if(requiredInputs&&!requiredInputs[n])out[n]=0;}
    return out;
  }
  if (requiredInputs)
    return sparseObservation(world, agent, tick, version, requiredInputs,target);
  const o = observationBuffer(target),
    cx = Math.round(agent.x),
    cy = Math.round(agent.row);
  let i = 0;
  // A local distance sensor, not a move validator: it sees only instantaneous
  // positions now/at landing and deliberately does not simulate a hop or solve a route.
  const occupancy = (
    hazards: ReturnType<typeof hazardsAt>,
    x: number,
    margin: number,
  ) => {
    if ((version !== 2 && version !== 4))
      return +hazards.some((h) => Math.abs(h.x - x) < h.length / 2 + margin);
    const clearance = Math.min(
      ...hazards.map((h) => Math.abs(h.x - x) - h.length / 2 - margin),
    );
    return Math.max(0, Math.min(1, 1 - clearance / 1.5));
  };
  const risk = (x: number, y: number) => {
    if (Math.abs(x) > HALF_WIDTH || y < 0) return 1;
    const row = world.row(y);
    if (row.blocked.includes(x)) return 1;
    return occupancy(hazardsAt(row, tick + HOP_TICKS), x, 0.35);
  };
  // Version 3 adds a local motion sensor. Extrapolate only currently visible
  // hazards along each 0.2s candidate hop, at nine samples. This is approximate
  // clearance, not a route solver or an action mask; the network chooses all actions.
  // Spatial channels keep their binary-v1 meanings so old networks can adapt.
  const visible = version >= 3
    ? [-1, 0, 1].flatMap((dy) => hazardsAt(world.row(cy + dy), tick))
      .filter((h) => Math.abs(h.x - cx) <= 4.5 + h.length / 2)
    : [];
  const trajectoryRisk = (dx: number, dy: number) => {
    const tx = cx + dx, ty = cy + dy;
    if (Math.abs(tx) > HALF_WIDTH || ty < 0 || world.row(ty).blocked.includes(tx))
      return 1;
    let closest = Infinity;
    for (const h of visible) {
      // Outside this hop's row span, vertical clearance is at least 0.39:
      // greater than the 0.35 sensor support, so its risk contribution is zero.
      if (h.row < Math.min(cy, ty) || h.row > Math.max(cy, ty)) continue;
      const shifts = h.kind === "car" ? [-TRAFFIC_LOOP, 0, TRAFFIC_LOOP] : [0];
      for (const shift of shifts) {
        const start = h.x + shift,
          end = start + h.speed * HOP_TICKS * DT,
          support = h.length / 2 + 0.22 + 0.35;
        // A conservative interval bound, including wrap images and fast traffic.
        // Skipped images cannot enter the positive-risk support at any sample.
        if (
          Math.min(cx, tx) - Math.max(start, end) > support + 1e-12 ||
          Math.min(start, end) - Math.max(cx, tx) > support + 1e-12
        ) continue;
        for (let sample = 0; sample <= 8; sample++) {
          const f = sample / 8;
          const x = cx + dx * f, y = cy + dy * f;
          const hx = h.x + shift + h.speed * HOP_TICKS * DT * f;
          const clearance = Math.max(
            Math.abs(x - hx) - h.length / 2 - 0.22,
            Math.abs(y - h.row) - 0.61,
          );
          closest = Math.min(closest, clearance);
        }
      }
    }
    return Math.max(0, Math.min(1, 1 - closest / 0.35));
  };
  for (const dy of ROW_OFFSETS) {
    const y = cy + dy,
      row = world.row(y),
      now = hazardsAt(row, tick),
      future = hazardsAt(row, tick + HOP_TICKS);
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx,
        unknown = Math.abs(x) > HALF_WIDTH || y < 0;
      if (unknown) {
        o[i + 8] = 1;
        i += 9;
        continue;
      }
      o[i] = +(row.type === "grass");
      o[i + 1] = +(row.type === "road");
      o[i + 2] = +(row.type === "rail");
      o[i + 3] = +row.blocked.includes(x);
      o[i + 4] = occupancy(now, x, 0.3);
      o[i + 5] =
        row.type === "grass" ? 0 : Math.max(-1, Math.min(1, row.speed / 24));
      o[i + 6] = +signalAt(row, tick);
      o[i + 7] = occupancy(future, x, 0.3);
      i += 9;
    }
  }
  o[i++] = cx / 4;
  if (version === 6) {
    o[i++] = DELTA[agent.lastAction][0];
    o[i++] = +agent.blocked;
  } else if (version === 5 || version === 8) {
    const next = world.row(cy + 2), hazards = hazardsAt(next, tick + 2 * HOP_TICKS);
    const clearance = Math.min(...hazards.map((h) => Math.abs(h.x-cx)-h.length/2-.35));
    o[i++] = Math.max(0, Math.min(1, 1-clearance/1.5));
    o[i++] = +next.blocked.includes(cx);
  } else {
    o[i++] = Math.sin(tick / 120);
    o[i++] = Math.cos(tick / 120);
  }
  for (const a of ACTIONS) {
    const [dx, dy] = DELTA[a];
    o[i++] = version >= 3 ? trajectoryRisk(dx, dy) : risk(cx + dx, cy + dy);
  }
  o[i++] = +world.row(cy + 1).blocked.includes(cx);
  o[i] = version === 7 || version === 8 ? DELTA[agent.lastAction][0] : +signalAt(world.row(cy), tick);
  return o;
}

const variantTwoPrefixMasks = new WeakMap<Uint8Array, Uint8Array>();
const variantTwoPrefixViews = new WeakMap<Float32Array, Float32Array>();
/** Same V9 channels and arithmetic; skip unused inputs and share platform positions. */
function sparseVariantTwoObservation(world: World, agent: AgentState, tick: number,
  mask: Uint8Array, target?: Float32Array): Float32Array {
  const size = sensorCount(9);
  if (mask.length !== size) throw new Error(`Observation mask must contain ${size} channels`);
  if (target && target.length !== size) throw new Error(`Observation buffer must contain ${size} channels`);
  let prefix = variantTwoPrefixMasks.get(mask);
  if (!prefix) {prefix = mask.slice(0, INPUT_COUNT); variantTwoPrefixMasks.set(mask, prefix);}
  const out = target ?? new Float32Array(size);
  out.fill(0);
  let view = variantTwoPrefixViews.get(out);
  if (!view) {view = out.subarray(0, INPUT_COUNT); variantTwoPrefixViews.set(out, view);}
  observation(world, agent, tick, 8, prefix, view);
  const now = new Map<Row, number[]>(), later = new Map<Row, number[]>();
  const supported = (row: Row, future: boolean, x: number) => {
    if (!row.platforms?.length) return 0;
    const cache = future ? later : now;
    let positions = cache.get(row);
    if (!positions) {
      const time = tick + (future ? HOP_TICKS : 0);
      positions = row.platforms.map(p => row.platformLoop ?
        modulo(p.offset + p.speed * time / 60 + row.platformLoop / 2, row.platformLoop) - row.platformLoop / 2 :
        sourceFramePosition(p.offset, p.speed / 60, time));
      cache.set(row, positions);
    }
    for (let i = 0; i < positions.length; i++)
      if (Math.abs(positions[i] - x) < row.platforms[i].length / 2 + .25) return 1;
    return 0;
  };
  const cx = Math.round(agent.x), cy = Math.round(agent.row);
  let index = INPUT_COUNT;
  for (const dy of ROW_OFFSETS) {
    let row: Row | undefined;
    for (let dx = -4; dx <= 4; dx++, index += 3) {
      if ((!mask[index] && !mask[index+1] && !mask[index+2]) || Math.abs(cx+dx) > 5 || cy+dy < 0) continue;
      row ??= world.row(cy+dy);
      if (mask[index]) out[index] = +(row.type === "water");
      if (mask[index+1]) out[index+1] = supported(row, false, cx+dx);
      if (mask[index+2]) out[index+2] = supported(row, true, cx+dx);
    }
  }
  if (mask[index]) out[index] = world.config.eagle ? Math.min(1,(tick-(agent.lastProgressTick??0))/world.config.eagle.afterTicks) : 0; index++;
  if (mask[index]) out[index] = +signalAt(world.row(cy),tick); index++;
  if (mask[index]) out[index] = +signalAt(world.row(cy+1),tick); index++;
  if (mask[index]) out[index] = (agent.ridingSpeed??0)/4.2; index++;
  if (mask[index]) out[index] = agent.x-Math.round(agent.x); index++;
  if (mask[index]) out[index] = supported(world.row(cy+1),true,cx); index++;
  if (mask[index]) out[index] = supported(world.row(cy-1),true,cx); index++;
  if (mask[index]) out[index] = +(world.row(cy).type === "water");
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1,Math.min(1,out[i]));
  return out;
}

type ObservationPlan = {
  rows: { dy: number; cells: { dx: number; index: number; features: number }[] }[];
  globals: number;
};
const observationPlans = new WeakMap<Uint8Array, ObservationPlan>();
/** Masks are immutable for their lifetime; Network constructs one per frozen graph. */
function observationPlan(requiredInputs: Uint8Array): ObservationPlan {
  const cached = observationPlans.get(requiredInputs);
  if (cached) return cached;
  if (requiredInputs.length !== INPUT_COUNT)
    throw new Error(`Observation mask must contain ${INPUT_COUNT} channels`);
  const rows: ObservationPlan["rows"] = [];
  for (const [row, dy] of ROW_OFFSETS.entries()) {
    const cells: ObservationPlan["rows"][number]["cells"] = [];
    for (let col = 0; col < 9; col++) {
      const index = (row * 9 + col) * 9;
      let features = 0;
      for (let f = 0; f < 9; f++)
        if (requiredInputs[index + f]) features |= 1 << f;
      if (features) cells.push({ dx: col - 4, index, features });
    }
    if (cells.length) rows.push({ dy, cells });
  }
  let globals = 0;
  for (let i = 0; i < 10; i++)
    if (requiredInputs[GLOBAL_OFFSET + i]) globals |= 1 << i;
  const plan = { rows, globals };
  observationPlans.set(requiredInputs, plan);
  return plan;
}

/** Exact optional encoding fast path: unconsumed channels remain zero. */
function sparseObservation(
  world: World,
  agent: AgentState,
  tick: number,
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
  requiredInputs: Uint8Array,
  target?: Float32Array,
): Float32Array {
  const o = observationBuffer(target),
    cx = Math.round(agent.x), cy = Math.round(agent.row),
    plan = observationPlan(requiredInputs),
    nowCache = new Map<number, Hazard[]>(), futureCache = new Map<number, Hazard[]>();
  const nowAt = (row: Row) => {
    let hazards = nowCache.get(row.index);
    if (!hazards) { hazards = hazardsAt(row, tick); nowCache.set(row.index, hazards); }
    return hazards;
  };
  const futureAt = (row: Row) => {
    let hazards = futureCache.get(row.index);
    if (!hazards) { hazards = hazardsAt(row, tick + HOP_TICKS); futureCache.set(row.index, hazards); }
    return hazards;
  };
  // Keep the same arithmetic, feature meanings, and floating-point rounding as
  // the dense encoder. No physics query, route search, or action filtering occurs.
  const occupancy = (hazards: Hazard[], x: number, margin: number) => {
    if ((version !== 2 && version !== 4))
      return +hazards.some((h) => Math.abs(h.x - x) < h.length / 2 + margin);
    const clearance = Math.min(...hazards.map((h) => Math.abs(h.x - x) - h.length / 2 - margin));
    return Math.max(0, Math.min(1, 1 - clearance / 1.5));
  };
  for (const { dy, cells } of plan.rows) {
    const y = cy + dy;
    let row: Row | undefined;
    for (const { dx, index: i, features: f } of cells) {
      const x = cx + dx;
      if (Math.abs(x) > HALF_WIDTH || y < 0) {
        if (f & 256) o[i + 8] = 1;
        continue;
      }
      row ??= world.row(y);
      if (f & 1) o[i] = +(row.type === "grass");
      if (f & 2) o[i + 1] = +(row.type === "road");
      if (f & 4) o[i + 2] = +(row.type === "rail");
      if (f & 8) o[i + 3] = +row.blocked.includes(x);
      if (f & 16) o[i + 4] = occupancy(nowAt(row), x, 0.3);
      if (f & 32) o[i + 5] = row.type === "grass" ? 0 : Math.max(-1, Math.min(1, row.speed / 24));
      if (f & 64) o[i + 6] = +signalAt(row, tick);
      if (f & 128) o[i + 7] = occupancy(futureAt(row), x, 0.3);
    }
  }
  const globals = plan.globals;
  if (globals & 1) o[GLOBAL_OFFSET] = cx / 4;
  if (version === 6) {
    if (globals & 2) o[GLOBAL_OFFSET+1]=DELTA[agent.lastAction][0];
    if (globals & 4) o[GLOBAL_OFFSET+2]=+agent.blocked;
  } else if (version === 5 || version === 8) {
    if (globals & 2) {
      const hazards=hazardsAt(world.row(cy+2),tick+2*HOP_TICKS);
      const clearance=Math.min(...hazards.map((h)=>Math.abs(h.x-cx)-h.length/2-.35));
      o[GLOBAL_OFFSET+1]=Math.max(0,Math.min(1,1-clearance/1.5));
    }
    if (globals & 4) o[GLOBAL_OFFSET+2]=+world.row(cy+2).blocked.includes(cx);
  } else {
    if (globals & 2) o[GLOBAL_OFFSET + 1] = Math.sin(tick / 120);
    if (globals & 4) o[GLOBAL_OFFSET + 2] = Math.cos(tick / 120);
  }
  const visible = version >= 3 && (globals & 248)
    ? [-1, 0, 1].flatMap((dy) => nowAt(world.row(cy + dy)))
      .filter((h) => Math.abs(h.x - cx) <= 4.5 + h.length / 2)
    : [];
  const risk = (dx: number, dy: number) => {
    const tx = cx + dx, ty = cy + dy;
    if (Math.abs(tx) > HALF_WIDTH || ty < 0) return 1;
    const row = world.row(ty);
    if (row.blocked.includes(tx)) return 1;
    if (version < 3) return occupancy(futureAt(row), tx, 0.35);
    let closest = Infinity;
    for (const h of visible) {
      if (h.row < Math.min(cy, ty) || h.row > Math.max(cy, ty)) continue;
      const shifts = h.kind === "car" ? [-TRAFFIC_LOOP, 0, TRAFFIC_LOOP] : [0];
      for (const shift of shifts) {
        const start = h.x + shift,
          end = start + h.speed * HOP_TICKS * DT,
          support = h.length / 2 + 0.22 + 0.35;
        if (
          Math.min(cx, tx) - Math.max(start, end) > support + 1e-12 ||
          Math.min(start, end) - Math.max(cx, tx) > support + 1e-12
        ) continue;
        for (let sample = 0; sample <= 8; sample++) {
          const f = sample / 8;
          const x = cx + dx * f, y = cy + dy * f;
          const hx = h.x + shift + h.speed * HOP_TICKS * DT * f;
          const clearance = Math.max(
            Math.abs(x - hx) - h.length / 2 - 0.22,
            Math.abs(y - h.row) - 0.61,
          );
          closest = Math.min(closest, clearance);
        }
      }
    }
    return Math.max(0, Math.min(1, 1 - closest / 0.35));
  };
  for (let a = 0; a < ACTIONS.length; a++) {
    if (!(globals & (1 << (a + 3)))) continue;
    const [dx, dy] = DELTA[ACTIONS[a]];
    o[GLOBAL_OFFSET + a + 3] = risk(dx, dy);
  }
  if (globals & 256) o[GLOBAL_OFFSET + 8] = +world.row(cy + 1).blocked.includes(cx);
  if (globals & 512) o[GLOBAL_OFFSET + 9] = version === 7 || version === 8
    ? DELTA[agent.lastAction][0] : +signalAt(world.row(cy), tick);
  return o;
}
