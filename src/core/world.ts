import { RNG, hash, modulo } from "./rng";
import { generateUpstreamRow, upstreamHazardsAt, upstreamSignalAt } from "./upstream";
export { platformsAt } from "./upstream";
import {
  DT,
  TRAFFIC_LOOP,
  TRAIN_START,
  type Config,
  type Row,
  type Hazard,
} from "./types";

export function generateRow(seed: number, index: number, config: Config): Row {
  if (config.mechanics === "upstream-v2") return generateUpstreamRow(seed, index, config);
  const rng = new RNG(
    hash(seed, index, config.curriculum === "trains" ? 19 : 13),
  );
  const type =
    index <= 1 || index % 4 === 0
      ? "grass"
      : config.curriculum === "trains" && index % 4 === 2 && rng.next() < 0.32
        ? "rail"
        : rng.next() < 0.22
          ? "grass"
          : "road";
  const row: Row = {
    index,
    type,
    blocked: [],
    speed:
      (rng.next() < 0.5 ? -1 : 1) * rng.range(1.5, 3.4) * config.difficulty,
    vehicles: [],
    period: rng.range(8, 12),
    phase: rng.range(0, 8),
    length: rng.range(4, 7),
    warning: rng.range(1.6, 2.4),
  };
  if (type === "grass" && index > 1) {
    // Seed-dependent winding clear route. Adjacent reserved spans overlap; no fixed safe column.
    const phase = (hash(seed, 0, 7) / 4294967296) * Math.PI * 2;
    const a = Math.round(3 * Math.sin((index - 1) * 0.32 + phase)),
      b = Math.round(3 * Math.sin(index * 0.32 + phase));
    for (let x = -4; x <= 4; x++)
      if (
        (x < Math.min(a, b) || x > Math.max(a, b)) &&
        rng.next() < 0.2 &&
        row.blocked.length < 2
      )
        row.blocked.push(x);
  }
  if (type === "road") {
    const offset = rng.range(0, TRAFFIC_LOOP);
    for (let i = 0; i < 3; i++) {
      const truck = rng.next() < 0.25;
      row.vehicles.push({
        offset: modulo(
          offset + (i * TRAFFIC_LOOP) / 3 + rng.range(-0.3, 0.3),
          TRAFFIC_LOOP,
        ),
        length: truck ? 1.85 : 1.05,
        variant: truck ? "truck" : "car",
      });
    }
  }
  if (type === "rail")
    row.speed =
      (row.speed < 0 ? -1 : 1) * rng.range(15, 23) * config.difficulty;
  return row;
}
export function hazardsAt(row: Row, tick: number): Hazard[] {
  if (row.upstream) return upstreamHazardsAt(row, tick);
  const t = tick * DT;
  if (row.type === "road")
    return row.vehicles.map((v, i) => ({
      id: `${row.index}:${i}`,
      row: row.index,
      x:
        modulo(v.offset + row.speed * t + TRAFFIC_LOOP / 2, TRAFFIC_LOOP) -
        TRAFFIC_LOOP / 2,
      length: v.length,
      speed: row.speed,
      kind: "car",
      variant: v.variant,
    }));
  if (row.type === "rail") {
    const elapsed = modulo(t + row.phase, row.period),
      x = Math.sign(row.speed) * (-TRAIN_START + Math.abs(row.speed) * elapsed);
    return [
      {
        id: `${row.index}:train`,
        row: row.index,
        x,
        length: row.length,
        speed: row.speed,
        kind: "train",
        variant: "train",
      },
    ];
  }
  return [];
}
export function signalAt(row: Row, tick: number) {
  if (row.upstream) return upstreamSignalAt(row, tick);
  if (row.type !== "rail") return false;
  const elapsed = modulo(tick * DT + row.phase, row.period);
  const enter = (TRAIN_START - 4.5 - row.length / 2) / Math.abs(row.speed),
    exit = (TRAIN_START + 4.5 + row.length / 2) / Math.abs(row.speed);
  return elapsed >= Math.max(0, enter - row.warning) && elapsed <= exit;
}
export class World {
  private cache = new Map<number, Row>();
  constructor(
    public seed: number,
    public config: Config,
  ) {}
  row(index: number) {
    let r = this.cache.get(index);
    if (!r) {
      r = generateRow(this.seed, index, this.config);
      if (this.cache.size >= 96)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(index, r);
    }
    return r;
  }
  get cacheSize() {
    return this.cache.size;
  }
}
