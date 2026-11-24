import fs from "node:fs";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { observation, INPUT_COUNT, ROW_OFFSETS } from "../../src/core/observation";
import { sourceFramePosition } from "../../src/core/upstream";
import { RNG, modulo } from "../../src/core/rng";
import { signalAt, type World } from "../../src/core/world";
import { HOP_TICKS, type AgentState, type Row } from "../../src/core/types";
import { sensorCount } from "../../src/core/sensor-version";
import { parseEvolution } from "../../src/evolution/serialization";
import { Network } from "../../src/evolution/network";
import { GameSimulation } from "../../src/core/simulation";
import type { VariantTwoSelection } from "../../src/evolution/variant-two-experiment";
import { evaluateGenome } from "../../src/evolution/evaluation";

const prefixMasks = new WeakMap<Uint8Array, Uint8Array>();
const prefixViews = new WeakMap<Float32Array, Float32Array>();
/** Prototype only: frozen live trainers continue using the current native encoder. */
function fast(world: World, agent: AgentState, tick: number, mask: Uint8Array, out: Float32Array) {
  let prefix = prefixMasks.get(mask);
  if (!prefix) {prefix = mask.slice(0, INPUT_COUNT); prefixMasks.set(mask, prefix);}
  out.fill(0);
  let view = prefixViews.get(out);
  if (!view) {view = out.subarray(0, INPUT_COUNT); prefixViews.set(out, view);}
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
const directory = process.argv[2] ?? ".archive/results/variant-2/transfer-restart-002";
const selected = parseEvolution<{selected: VariantTwoSelection}>(fs.readFileSync(`${directory}/selected.json`,"utf8")).selected;
const protocol = JSON.parse(fs.readFileSync(`${directory}/protocol.json`,"utf8"));
const seeds = protocol.confirmationDevelopmentSeeds.slice(0,64) as number[];
const random = new RNG(192201), channels = sensorCount(9);
const randomMasks = [new Uint8Array(channels), new Uint8Array(channels).fill(1),
  Uint8Array.from({length: channels}, () => +(random.next() < .16))];
let randomStateMaskComparisons = 0;
for (let i = 0; i < 1000; i++) {
  const simulation = new GameSimulation(protocol.config.simulation, (0x50000000 + i * 7919) >>> 0);
  simulation.tick = random.int(36000); simulation.agent.x = random.range(-5.1, 5.1);
  simulation.agent.row = i % 5 === 0 ? 0 : random.range(26, 500);
  simulation.agent.ridingSpeed = random.range(-4.2, 4.2);
  simulation.agent.lastProgressTick = Math.max(0, simulation.tick - random.int(700));
  const output = new Float32Array(channels);
  for (const mask of randomMasks) {
    output.fill(NaN);
    assert.deepEqual(fast(simulation.world, simulation.agent, simulation.tick, mask, output),
      simulation.getObservation(9, mask));
    randomStateMaskComparisons++;
  }
}
let decisions = 0;
for (const seed of seeds) {
  const simulation = new GameSimulation(protocol.config.simulation,seed), network = new Network(selected.genome);
  const buffer = new Float32Array(sensorCount(9));
  while (simulation.agent.alive) {
    const expected = simulation.getObservation(9,network.requiredInputs);
    const actual = fast(simulation.world,simulation.agent,simulation.tick,network.requiredInputs,buffer);
    assert.deepEqual(actual,expected); decisions++;
    simulation.step(network.decide(actual),false);
  }
}
function timed(optimized: boolean) {
  const start = performance.now(), scores: number[] = [];
  for (const seed of seeds) {
    const simulation = new GameSimulation(protocol.config.simulation,seed), network = new Network(selected.genome);
    const buffer = new Float32Array(sensorCount(9));
    while (simulation.agent.alive) {
      const encoded = optimized ? fast(simulation.world,simulation.agent,simulation.tick,network.requiredInputs,buffer) :
        simulation.getObservation(9,network.requiredInputs,buffer);
      simulation.step(network.decide(encoded),false);
    }
    scores.push(simulation.agent.maxRow);
  }
  return {milliseconds: performance.now()-start,scores};
}
timed(false); timed(true);
const repetitions = Array.from({length: 4}, () => {const native = timed(false), optimized = timed(true);
  assert.deepEqual(native.scores,optimized.scores); return {nativeMs: native.milliseconds, optimizedMs: optimized.milliseconds};});
assert.deepEqual(timed(true).scores,evaluateGenome(selected.genome,seeds,protocol.config.simulation).map(e => e.score));
const nativeMs = repetitions.reduce((sum,r) => sum+r.nativeMs,0), optimizedMs = repetitions.reduce((sum,r) => sum+r.optimizedMs,0);
const report = {prototypeOnly: true, liveTrainingUnchanged: true, source:directory,genome:selected.genome.id,maps:seeds.length,exactDecisionObservations:decisions,randomStateMaskComparisons,
  nativeMs,optimizedMs,speedup:nativeMs/optimizedMs,repetitions,physicsChanged:false};
fs.writeFileSync(".archive/results/variant-2/buffer-reuse-benchmark-prototype.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
