/** Deterministic 60Hz adaptation of Evan Bacon's MIT Row/Water, Row/RailRoad,
 * Row/Road and GameEngine. Full attribution and compatibility limits are in docs/variants/variant-2-upstream-audit.md. */
import { RNG, hash } from "./rng";
import { DELTA, HOP_TICKS, type Action, type AgentState, type Config, type Row, type Hazard, type Support } from "./types";
import { generateVariantTwoRow, scheduledTrainAt, scheduledTrainSignal } from "./variant-two-rules";

export const UPSTREAM_VARIANT_TWO_CONFIG: Config = {
  curriculum: "mixed", mechanics: "upstream-v2", maxTicks: 36000, difficulty: 1,
  eagle: { afterTicks: 600, warningTicks: 180 },
};
export const VARIANT_TWO_CONFIG: Config = { ...UPSTREAM_VARIANT_TWO_CONFIG, variantTwoRules: "varied-traffic-v1" };
export const SOURCE_CARS = ["police_car", "blue_car", "blue_truck", "green_car", "orange_car", "purple_car", "red_truck", "taxi"] as const;
export const SOURCE_CAR_WIDTHS = [2, 1, 3, 2, 2, 2, 3, 2];
export const SOURCE_LOG_WIDTHS = [1, 2, 3, 4];
export function sourceFramePosition(offset: number, step: number, tick: number, bound = 11) {
  if (!step || tick <= 0) return offset;
  const sign = Math.sign(step), speed = Math.abs(step), initial = offset * sign;
  const firstWrap = Math.max(1, Math.floor((bound - initial) / speed) + 1);
  if (tick < firstWrap) return offset + step * tick;
  const period = Math.floor(2 * bound / speed) + 1;
  return sign * (-bound + speed * ((tick - firstWrap) % period));
}
export function sourceWrappedThisTick(offset: number, step: number, tick: number, bound = 11) {
  if (!step || tick < 1) return false;
  const first = Math.max(1, Math.floor((bound - offset * Math.sign(step)) / Math.abs(step)) + 1);
  return tick >= first && (tick - first) % (Math.floor(2 * bound / Math.abs(step)) + 1) === 0;
}
function rawType(seed: number, index: number): Row["type"] {
  if (index <= 1) return "grass";
  const r = new RNG(hash(seed, index, 720));
  const category = r.int(3);
  return category === 0 ? "grass" : category === 2 ? "water" : r.int(4) === 0 ? "rail" : "road";
}
export function generateUpstreamRow(seed: number, index: number, config: Config): Row {
  if (config.variantTwoRules === "varied-traffic-v1")
    return generateVariantTwoRow(seed, index, config, type => generateSourceRow(seed, index, config, type));
  return generateSourceRow(seed, index, config);
}
function generateSourceRow(seed: number, index: number, config: Config, override?: Row["type"]): Row {
  const rng = new RNG(hash(seed, index, 721));
  let type = override ?? rawType(seed, index);
  // Explicit Variant2 curriculum restriction; the source's unbounded road runs are deferred.
  if (!override && type === "road" && [1, 2, 3].every(d => rawType(seed, index - d) === "road")) type = "grass";
  const row: Row = { index, type, upstream: true, blocked: [], speed: 0, vehicles: [], period: 0, phase: 0, length: 0, warning: 3 };
  if (type === "grass" && index > 1) {
    const count = Math.round(rng.next() * 2) + 1;
    for (let sourceX = -4; sourceX <= 4 && row.blocked.length < count; sourceX++)
      if (sourceX !== 0 && rng.next() > .6) row.blocked.push(-sourceX);
    // Source grass preserves adjacent static-pad exits.
    if (rawType(seed, index - 1) === "water" && (index - 1) % 2 === 0) {
      const pads = generateSourceRow(seed, index - 1, config).platforms ?? [];
      row.blocked = row.blocked.filter(x => !pads.some(p => Math.trunc(p.offset) === x));
    }
  }
  if (type === "road") {
    const speed = rng.range(.02, .08), count = rng.int(2) + 1, direction = rng.next() > .5 ? -1 : 1;
    row.speed = -direction * speed * 60;
    let x = -6 * direction;
    for (let i = 0; i < count; i++) {
      const variant = rng.int(8);
      row.vehicles.push({ offset: -x, length: SOURCE_CAR_WIDTHS[variant], variant: SOURCE_CARS[variant] });
      x -= rng.range(5, 8) * direction;
    }
  }
  if (type === "rail") {
    row.trainMiddles = Math.ceil(rng.next() * 2 + 1);
    row.length = (row.trainMiddles + 2) * 5;
    row.speed = -48;
  }
  if (type === "water") {
    row.platforms = [];
    if (index % 2 === 0) {
      const count = rng.int(2) + 2, positions: number[] = [];
      let x = Math.floor(rng.next() * 2 - 4);
      for (let i = 0; i < count; i++) { positions.push(x); x += rng.int(2) + 2; }
      if (rawType(seed, index - 1) === "grass") {
        const previous = generateSourceRow(seed, index - 1, config);
        const clear = Array.from({length: 9}, (_, n) => n - 4).filter(sourceX => !previous.blocked.includes(-sourceX));
        if (!positions.some(sourceX => clear.includes(sourceX))) { positions[0] = rng.pick(clear); positions.sort((a, b) => a - b); }
      }
      row.platforms = positions.map(x => ({offset: -x, length: 1, speed: 0, kind: "lily", variant: 0}));
    } else {
      const speed = rng.range(.02, .07), count = rng.int(2) + 2, direction = rng.next() > .5 ? -1 : 1;
      let x = -6 * direction;
      for (let i = 0; i < count; i++) {
        const variant = rng.int(4);
        row.platforms.push({offset: -x, length: SOURCE_LOG_WIDTHS[variant], speed: -speed * direction * 60, kind: "log", variant});
        x -= rng.range(5, 8) * direction;
      }
      row.speed = -speed * direction * 60;
    }
  }
  return row;
}
export function upstreamHazardsAt(row: Row, tick: number): Hazard[] {
  if (row.type === "road") return row.vehicles.map((v, i) => ({id: `${row.index}:${i}`, row: row.index,
    x: sourceFramePosition(v.offset, row.speed / 60, tick), length: v.length, speed: row.speed,
    kind: "car", variant: v.variant, upstream: true}));
  if (row.type === "rail" && row.trainSchedule) {
    const train = scheduledTrainAt(row, tick);
    return train ? [{id: `${row.index}:train`, row: row.index, x: train.x,
      length: row.length, speed: row.speed, kind: "train", variant: "train", upstream: true,
      trainMiddles: row.trainMiddles}] : [];
  }
  if (row.type === "rail") return [{id: `${row.index}:train`, row: row.index,
    x: sourceFramePosition(0, row.speed / 60, tick, 110), length: row.length, speed: row.speed,
    kind: "train", variant: "train", upstream: true, trainMiddles: row.trainMiddles}];
  return [];
}
export function upstreamSignalAt(row: Row, tick: number) {
  if (row.type !== "rail") return false;
  if (row.trainSchedule) return scheduledTrainSignal(row, tick).active;
  const first = Math.floor(110 / .8) + 1, period = Math.floor(220 / .8) + 1;
  return tick >= first && (Math.floor(tick) - first) % period < 180;
}
export function platformsAt(row: Row, tick: number): Support[] {
  return (row.platforms ?? []).map((p, i) => ({...p, id: `${row.index}:support:${i}`, row: row.index,
    x: sourceFramePosition(p.offset, p.speed / 60, tick)}));
}
export function upstreamSupportAt(row: Row, tick: number, x: number) {
  // Source loops through all matches; last attachment wins.
  return platformsAt(row, tick).filter(p => Math.abs(x - p.x) < .25 + p.length / 2).at(-1);
}
export function sourceHopFraction(t: number) {
  const ease = (x: number) => 1 - (1 - x) * (1 - x);
  return t <= .5 ? .75 * ease(t * 2) : .75 + .25 * ease(t * 2 - 1);
}
type Context = {tick: number; agent: AgentState; config: Config; world: { row(index: number): Row }};
export function advanceUpstream(s: Context, action: Action) {
  const a = s.agent, old = a.maxRow, ox = a.x, oy = a.row, [dx, dy] = DELTA[action];
  let tx = dy ? -Math.round(-ox) : ox + dx, ty = oy + dy;
  a.lastAction = action; a.blocked = false;
  if (action !== "WAIT") { a.ridingOn = undefined; a.ridingSpeed = undefined; }
  if (ty < 0) { a.alive = false; a.deathReason = "bounds"; return -2; }
  if (s.world.row(ty).blocked.includes(Math.trunc(tx))) { tx = ox; ty = oy; a.blocked = true; }
  const moving = action !== "WAIT" && !a.blocked;
  const deadline = s.config.eagle ? (a.lastProgressTick ?? 0) + s.config.eagle.afterTicks : Infinity;
  let elapsed = 0;
  for (let n = 1; n <= HOP_TICKS; n++) {
    const f = sourceHopFraction(n / HOP_TICKS);
    if (moving) { a.x = ox + (tx - ox) * f; a.row = oy + (ty - oy) * f; }
    s.tick++; elapsed++;
    const row = s.world.row(Math.round(a.row)), idle = !moving || n === HOP_TICKS;
    if (row.type === "road" || (row.type === "rail" && idle)) {
      for (const h of upstreamHazardsAt(row, s.tick)) {
        const offset = row.type === "rail" ? 0 : row.vehicles[Number(h.id.split(":")[1])].offset;
        const wrapped = !row.trainSchedule && sourceWrappedThisTick(offset, h.speed / 60, s.tick, row.type === "rail" ? 110 : 11);
        if (!wrapped && Math.abs(a.x - h.x) < .25 + h.length / 2) {
          a.alive = false; a.deathReason = h.kind; break;
        }
      }
    }
    if (a.alive && idle && row.type === "water") {
      if (!a.ridingOn) {
        const p = upstreamSupportAt(row, s.tick, a.x);
        if (!p) { a.alive = false; a.deathReason = "water"; a.visualY = -.2; }
        else { a.ridingOn = p.id; a.ridingSpeed = p.speed; a.visualY = p.kind === "lily" ? .325 : .2; }
      }
      if (a.ridingOn) a.x += (a.ridingSpeed ?? 0) / 60;
    } else if (row.type !== "water") a.visualY = row.type === "road" ? .3 : row.type === "rail" ? .4 : .4;
    if (a.alive && Math.abs(a.x) > 5) { a.alive = false; a.deathReason = "bounds"; }
    if (a.alive && s.tick >= deadline) { a.alive = false; a.deathReason = "eagle"; }
    if (a.alive && s.tick >= s.config.maxTicks) { a.alive = false; a.deathReason = "timeout"; }
    if (!a.alive) break;
  }
  if (a.alive && Math.round(a.row) > a.maxRow) { a.maxRow = Math.round(a.row); if (s.config.eagle) a.lastProgressTick = s.tick; }
  return 10 * (a.maxRow - old) - .01 * elapsed - (["car", "train", "water", "eagle"].includes(a.deathReason ?? "") ? 2 : 0);
}
