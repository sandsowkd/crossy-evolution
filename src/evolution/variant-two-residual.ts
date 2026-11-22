import { INPUT_COUNT, ROW_OFFSETS } from "../core/observation";
import { sensorCount, sensorNodeId, VARIANT_TWO_INPUT_START } from "../core/sensor-version";
import { OUTPUT_START, type Genome, type Innovations } from "./genome";
import type { RNG } from "../core/rng";

/** Zero-effect topology, not an action rule: evolution learns all added weights. */
export function connectRiverInputs(genome: Genome, tracker: Innovations) {
  if (genome.observationVersion !== 9) throw new Error("River adaptation requires V9 sensors");
  const inputs: number[] = [];
  for (const dy of [-1, 0, 1, 2]) {
    const row = ROW_OFFSETS.indexOf(dy as typeof ROW_OFFSETS[number]);
    for (const dx of [-1, 0, 1]) for (const feature of [0, 2])
      inputs.push(sensorNodeId(INPUT_COUNT + (row * 9 + dx + 4) * 3 + feature));
  }
  for (let i = sensorCount(9) - 8; i < sensorCount(9); i++) inputs.push(sensorNodeId(i));
  const pairs = new Set(genome.connections.map(c => `${c.from}:${c.to}`));
  for (const from of inputs) for (let action = 0; action < 5; action++) {
    const to = OUTPUT_START + action;
    if (!pairs.has(`${from}:${to}`))
      genome.connections.push({from, to, innovation: tracker.connection(from, to), weight: 0, enabled: true});
  }
}

/** Residual weight mutations leave every inherited road-input weight untouched. */
export function mutateRiverInputs(genome: Genome, rng: RNG, rate = .3, sigma = .35) {
  for (const connection of genome.connections) {
    if (connection.from < VARIANT_TWO_INPUT_START || rng.next() >= rate) continue;
    connection.weight = Math.max(-8, Math.min(8, connection.weight + rng.normal() * sigma));
  }
}
