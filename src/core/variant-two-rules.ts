import { hash, modulo, RNG } from "./rng";
import type { Config, Row } from "./types";

/** User-requested Variant 2 rules, distinct from the pinned upstream mechanics. */
export const CLUSTERED_VARIANT_TWO_RULES_V2 = {
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
  const {waterRowFraction: water, railRowFraction: rail, meanWaterCrossingLength: waterMean, meanRailCrossingLength: railMean} = CLUSTERED_VARIANT_TWO_RULES_V2;
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
      if (row < CLUSTERED_VARIANT_TWO_RULES_V2.introLastRow) continue;
      const choice = plan.rng.next();
      if (choice < startWater + startRail) {
        const type = choice < startWater ? "water" : "rail";
        const length = weightedIndex(plan.rng, type === "water" ? CLUSTERED_VARIANT_TWO_RULES_V2.waterCrossingLengthWeights : CLUSTERED_VARIANT_TWO_RULES_V2.railCrossingLengthWeights) + 1;
        plan.pending = {type,start:row+1,length,left:length,
          ...(type==="water"?{waterKind:plan.rng.next()<CLUSTERED_VARIANT_TWO_RULES_V2.movingWaterProbability?"log":"lily"}:{})};
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
  const {logSpeedMin: min, logSpeedMax: max, logSpeedDifferenceMin: gap} = CLUSTERED_VARIANT_TWO_RULES_V2;
  const low = Math.max(0, previous - gap - min), high = Math.max(0, max - previous - gap);
  const distance = rng.next() * (low + high);
  return distance < low ? min + distance : previous + gap + distance - low;
}
function logMotion(seed: number, index: number, rareMatches = false) {
  let start = index;
  while (movingWater(seed, start - 1)) start--;
  let speed = 0, direction = 0, same = 0;
  for (let r = start; r <= index; r++) {
    const rng = new RNG(hash(seed, r, 744));
    speed = r === start ? rng.range(CLUSTERED_VARIANT_TWO_RULES_V2.logSpeedMin, CLUSTERED_VARIANT_TWO_RULES_V2.logSpeedMax) : differentSpeed(speed, rng);
    const choice = rng.next();
    let next = choice < .5 ? -1 : 1;
    if (rareMatches && r > start) {
      // Every adjacent pair has marginal match probability 15%. A forced flip
      // after a matching pair retains the historical maximum streak of two.
      const chance = r === start + 1 ? .15 : .15 / .85;
      next = same < 2 && choice < chance ? direction : -direction;
    } else if (same === CLUSTERED_VARIANT_TWO_RULES_V2.maxSameLogDirection && next === direction) next = -next;
    same = next === direction ? same + 1 : 1;
    direction = next;
  }
  return speed * direction;
}
const integerRange = (rng: RNG, range: readonly [number, number]) => range[0] + rng.int(range[1] - range[0] + 1);

function generateClusteredVariantTwoRow(seed: number, index: number, config: Config, sourceRow: (type: Row["type"]) => Row): Row {
  const row = sourceRow(variantTwoRowType(seed, index));
  if (row.type === "grass") row.blocked = row.blocked.filter(x => x !== 0);
  if (row.type === "rail") {
    const rng = new RNG(hash(seed, index, 745));
    const arrivals = [integerRange(rng, CLUSTERED_VARIANT_TWO_RULES_V2.trainFirstArrivalTicks)];
    while (arrivals.at(-1)! <= config.maxTicks + 180)
      arrivals.push(arrivals.at(-1)! + integerRange(rng, CLUSTERED_VARIANT_TWO_RULES_V2.trainArrivalGapTicks));
    row.trainSchedule = { arrivals, warningTicks: CLUSTERED_VARIANT_TWO_RULES_V2.trainWarningTicks };
    row.warning = CLUSTERED_VARIANT_TWO_RULES_V2.trainWarningTicks / 60;
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
      row.speed = logMotion(seed, index, config.variantTwoRules === "clustered-traffic-v4");
      const widths = [1,2,3,3.875], variants:number[] = [], gaps:number[] = [];
      let circumference = 0;
      while (variants.length < CLUSTERED_VARIANT_TWO_RULES_V2.minimumLogsPerRow || circumference < CLUSTERED_VARIANT_TWO_RULES_V2.minimumLogLoopLength) {
        let variant = weightedIndex(rng,CLUSTERED_VARIANT_TWO_RULES_V2.logLengthWeights);
        if (variants.length===CLUSTERED_VARIANT_TWO_RULES_V2.minimumLogsPerRow-1 && variants.every(v=>v===variant)) variant=(variant+1)%4;
        const gap = weightedIndex(rng,CLUSTERED_VARIANT_TWO_RULES_V2.logGapWeights)+1;
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


/** Current pace revision; historical clustered-v2 maps keep their exact velocities and clocks. */
export const CLUSTERED_VARIANT_TWO_RULES_V3 = {
  ...CLUSTERED_VARIANT_TWO_RULES_V2,
  version: "clustered-traffic-v3",
  logSpeedMin: .96,
  logSpeedMax: 3.36,
  logSpeedDifferenceMin: .64,
  trainFirstArrivalTicks: [252, 756],
  trainArrivalGapTicks: [504, 1008],
} as const;

export const VARIANT_TWO_RULES = {
  ...CLUSTERED_VARIANT_TWO_RULES_V3,
  version: "clustered-traffic-v4",
  logSpeedMin: .864,
  logSpeedMax: 3.024,
  logSpeedDifferenceMin: .576,
  adjacentLogDirectionMatchProbability: .15,
  hopTicks: 10,
  logLanding: "nearest-slot",
} as const;

export function generateVariantTwoRow(seed: number, index: number, config: Config, sourceRow: (type: Row["type"]) => Row): Row {
  const v4 = config.variantTwoRules === "clustered-traffic-v4";
  const revised = v4 || config.variantTwoRules === "clustered-traffic-v3";
  // Generate enough of the old timeline before compression to cover the entire new episode.
  const sourceConfig = revised ? {...config, maxTicks:Math.ceil(config.maxTicks * 10 / 7)} : config;
  const row = generateClusteredVariantTwoRow(seed,index,sourceConfig,sourceRow);
  if (!revised) return row;
  if (row.platforms?.[0]?.kind === "log") {
    row.speed *= .8;
    for (const platform of row.platforms) platform.speed *= .8;
    if (v4) {
      row.speed *= .9;
      for (const platform of row.platforms) platform.speed *= .9;
    }
  }
  if (row.trainSchedule) row.trainSchedule.arrivals = row.trainSchedule.arrivals.map(tick=>Math.floor((tick*7+5)/10));
  return row;
}
