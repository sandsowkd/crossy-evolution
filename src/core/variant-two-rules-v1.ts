import { hash, RNG } from "./rng";
import type { Config, Row } from "./types";

/** User-requested Variant 2 rules, distinct from the pinned upstream mechanics. */
export const VARIANT_TWO_RULES = {
  version: "varied-traffic-v1",
  trainFirstArrivalTicks: [360, 1080],
  trainArrivalGapTicks: [720, 1440],
  trainWarningTicks: 120,
  logSpeedMin: 1.2,
  logSpeedMax: 4.2,
  logSpeedDifferenceMin: .8,
  maxWaterRows: 5,
  maxSameLogDirection: 2,
  movingWaterProbability: .7,
} as const;

function rawType(seed: number, index: number): Row["type"] {
  if (index <= 1) return "grass";
  const rng = new RNG(hash(seed, index, 720)), category = rng.int(3);
  return category === 0 ? "grass" : category === 2 ? "water" : rng.int(4) === 0 ? "rail" : "road";
}
export function variantTwoRowType(seed: number, index: number): Row["type"] {
  const type = rawType(seed, index);
  if (type !== "road" && type !== "water") return type;
  let run = 1;
  for (let previous = index - 1; rawType(seed, previous) === type; previous--) run++;
  const maximum = type === "road" ? 3 : VARIANT_TWO_RULES.maxWaterRows;
  return run % (maximum + 1) === 0 ? "grass" : type;
}
function movingWater(seed: number, index: number) {
  return variantTwoRowType(seed, index) === "water" &&
    new RNG(hash(seed, index, 743)).next() < VARIANT_TWO_RULES.movingWaterProbability;
}
/** Uniform over the allowed speed intervals; no clamping or repeated random retries. */
function differentSpeed(previous: number, rng: RNG) {
  const {logSpeedMin: min, logSpeedMax: max, logSpeedDifferenceMin: gap} = VARIANT_TWO_RULES;
  const low = Math.max(0, previous - gap - min), high = Math.max(0, max - previous - gap);
  const distance = rng.next() * (low + high);
  return distance < low ? min + distance : previous + gap + distance - low;
}
function logMotion(seed: number, index: number) {
  let start = index;
  while (movingWater(seed, start - 1)) start--;
  let speed = 0, direction = 0, same = 0;
  for (let r = start; r <= index; r++) {
    const rng = new RNG(hash(seed, r, 744));
    speed = r === start ? rng.range(VARIANT_TWO_RULES.logSpeedMin, VARIANT_TWO_RULES.logSpeedMax) : differentSpeed(speed, rng);
    let next = rng.next() < .5 ? -1 : 1;
    if (same === VARIANT_TWO_RULES.maxSameLogDirection && next === direction) next = -next;
    same = next === direction ? same + 1 : 1;
    direction = next;
  }
  return speed * direction;
}
const integerRange = (rng: RNG, range: readonly [number, number]) => range[0] + rng.int(range[1] - range[0] + 1);

export function generateVariantTwoRow(seed: number, index: number, config: Config, sourceRow: (type: Row["type"]) => Row): Row {
  const row = sourceRow(variantTwoRowType(seed, index));
  if (row.type === "grass") row.blocked = row.blocked.filter(x => x !== 0);
  if (row.type === "rail") {
    const rng = new RNG(hash(seed, index, 745));
    const arrivals = [integerRange(rng, VARIANT_TWO_RULES.trainFirstArrivalTicks)];
    while (arrivals.at(-1)! <= config.maxTicks + 180)
      arrivals.push(arrivals.at(-1)! + integerRange(rng, VARIANT_TWO_RULES.trainArrivalGapTicks));
    row.trainSchedule = { arrivals, warningTicks: VARIANT_TWO_RULES.trainWarningTicks };
    row.warning = VARIANT_TWO_RULES.trainWarningTicks / 60;
  }
  if (row.type === "water") {
    const rng = new RNG(hash(seed, index, 746)), count = rng.int(2) + 2;
    row.platforms = [];
    if (!movingWater(seed, index)) {
      const positions: number[] = [];
      let x = Math.floor(rng.next() * 2 - 4);
      for (let i = 0; i < count; i++) { positions.push(x); x += rng.int(2) + 2; }
      if (!positions.includes(0)) {
        const closest = positions.reduce((best, x, i) => Math.abs(x) < Math.abs(positions[best]) ? i : best, 0);
        positions[closest] = 0;
      }
      row.platforms = positions.sort((a, b) => a - b).map(x => ({offset: -x, length: 1, speed: 0, kind: "lily", variant: 0}));
      row.speed = 0;
    } else {
      row.speed = logMotion(seed, index);
      const direction = Math.sign(row.speed);
      let x = -6 * direction;
      for (let i = 0; i < count; i++) {
        const variant = rng.int(4);
        row.platforms.push({offset: x, length: variant + 1, speed: row.speed, kind: "log", variant});
        x -= rng.range(5, 8) * direction;
      }
    }
  }
  return row;
}

function closestArrival(row: Row, tick: number) {
  const arrivals = row.trainSchedule?.arrivals;
  if (!arrivals?.length) return undefined;
  let low = 0, high = arrivals.length;
  while (low < high) { const middle = (low + high) >>> 1; if (arrivals[middle] < tick) low = middle + 1; else high = middle; }
  const before = arrivals[Math.max(0, low - 1)], after = arrivals[Math.min(low, arrivals.length - 1)];
  return Math.abs(tick - before) <= Math.abs(tick - after) ? before : after;
}
export function scheduledTrainAt(row: Row, tick: number) {
  const arrivalTick = closestArrival(row, tick);
  if (arrivalTick === undefined) return undefined;
  const x = (tick - arrivalTick) * row.speed / 60 || 0;
  return Math.abs(x) <= 110 ? { x, arrivalTick } : undefined;
}
export function scheduledTrainSignal(row: Row, tick: number) {
  const arrival = closestArrival(row, tick), warning = row.trainSchedule?.warningTicks ?? 0;
  const start = (arrival ?? 0) - warning;
  const clear = (arrival ?? 0) + Math.ceil((5 + row.length / 2 + .25) / (Math.abs(row.speed) / 60));
  const active = arrival !== undefined && tick >= start && tick <= clear;
  return {active, phase: Math.floor((tick - start) / 12) % 2};
}
