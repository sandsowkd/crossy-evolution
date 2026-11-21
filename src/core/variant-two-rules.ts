import { hash, modulo, RNG } from "./rng";
import type { Config, Row } from "./types";

/** User-requested Variant 2 rules, distinct from the pinned upstream mechanics. */
export const VARIANT_TWO_RULES = {
  version: "clustered-traffic-v2",
  introLastRow: 25,
  waterRowFraction: 1 / 6,
  railRowFraction: 1 / 24,
  waterCrossingLengthWeights: [.20, .35, .25, .15, .05],
  railCrossingLengthWeights: [.45, .40, .15],
  meanWaterCrossingLength: 2.5,
  meanRailCrossingLength: 1.7,
  trainFirstArrivalTicks: [360, 1080],
  trainArrivalGapTicks: [720, 1440],
  trainWarningTicks: 120,
  logSpeedMin: 1.2,
  logSpeedMax: 4.2,
  logSpeedDifferenceMin: .8,
  maxWaterRows: 5,
  maxSameLogDirection: 2,
  movingWaterProbability: .7,
  logLengthWeights: [.10, .25, .35, .30],
  logGapWeights: [.70, .25, .05],
  minimumLogsPerRow: 6,
  minimumLogLoopLength: 24,
} as const;

type RowPlan = Readonly<{type:Row["type"]; waterKind?:"log"|"lily"; crossingStart?:number; crossingLength?:number}>;
type Plan = {rng:RNG; rows:RowPlan[]; pending?:{type:"water"|"rail"; waterKind?:"log"|"lily"; start:number; length:number; left:number}};
// Generation is deterministic; this bounded cache only avoids rebuilding a shared map for every chicken.
const plans = new Map<number, Plan>();
function weightedIndex(rng: RNG, weights: readonly number[]) {
  let choice = rng.next();
  for (let i = 0; i < weights.length - 1; i++) { choice -= weights[i]; if (choice < 0) return i; }
  return weights.length - 1;
}
export function variantTwoRowPlan(seed: number, index: number): RowPlan {
  if (index < 0) return {type:"grass"};
  let plan = plans.get(seed);
  if (!plan) {
    if (plans.size >= 32) plans.delete(plans.keys().next().value!);
    plan = {rng:new RNG(hash(seed,0,747)),rows:[]};
  } else plans.delete(seed);
  plans.set(seed,plan);
  const {waterRowFraction: water, railRowFraction: rail, meanWaterCrossingLength: waterMean, meanRailCrossingLength: railMean} = VARIANT_TWO_RULES;
  // Mandatory baseline row between groups. These initiation rates target total ROW fractions,
  // rather than accidentally multiplying density when crossing lengths increase.
  const baseline = 1 - water - rail, startWater = water / (waterMean * baseline), startRail = rail / (railMean * baseline);
  while (plan.rows.length <= index) {
    const row = plan.rows.length, pending = plan.pending;
    if (pending) {
      plan.rows.push(Object.freeze({type:pending.type,waterKind:pending.waterKind,crossingStart:pending.start,crossingLength:pending.length}));
      if (--pending.left === 0) plan.pending = undefined;
    } else {
      const road = row > 1 && new RNG(hash(seed,row,748)).next() < 3 / 7 && !plan.rows.slice(-3).every(r=>r.type==="road");
      plan.rows.push(Object.freeze({type:road?"road":"grass"}));
      if (row < VARIANT_TWO_RULES.introLastRow) continue;
      const choice = plan.rng.next();
      if (choice < startWater + startRail) {
        const type = choice < startWater ? "water" : "rail";
        const length = weightedIndex(plan.rng, type === "water" ? VARIANT_TWO_RULES.waterCrossingLengthWeights : VARIANT_TWO_RULES.railCrossingLengthWeights) + 1;
        plan.pending = {type,start:row+1,length,left:length,
          ...(type==="water"?{waterKind:plan.rng.next()<VARIANT_TWO_RULES.movingWaterProbability?"log":"lily"}:{})};
      }
    }
  }
  return plan.rows[index];
}
export const variantTwoRowType = (seed:number,index:number) => variantTwoRowPlan(seed,index).type;
function movingWater(seed: number, index: number) {
  return variantTwoRowPlan(seed,index).waterKind === "log";
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
      const widths = [1,2,3,3.875], variants:number[] = [], gaps:number[] = [];
      let circumference = 0;
      while (variants.length < VARIANT_TWO_RULES.minimumLogsPerRow || circumference < VARIANT_TWO_RULES.minimumLogLoopLength) {
        let variant = weightedIndex(rng,VARIANT_TWO_RULES.logLengthWeights);
        if (variants.length===VARIANT_TWO_RULES.minimumLogsPerRow-1 && variants.every(v=>v===variant)) variant=(variant+1)%4;
        const gap = weightedIndex(rng,VARIANT_TWO_RULES.logGapWeights)+1;
        variants.push(variant); gaps.push(gap); circumference += widths[variant]+gap;
      }
      row.platformLoop = circumference;
      const phase = rng.range(0,circumference);
      let center = 0;
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        row.platforms.push({offset:modulo(center+phase+circumference/2,circumference)-circumference/2,
          length:variant+1,visualLength:widths[variant],speed:row.speed,kind:"log",variant});
        const next = variants[(i+1)%variants.length];
        center += widths[variant]/2+gaps[i]+widths[next]/2;
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
