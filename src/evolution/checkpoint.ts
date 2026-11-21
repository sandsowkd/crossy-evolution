import { INPUT_COUNT } from "../core/observation";
import {
  BASE_NODES, BIAS, OUTPUT_START, EVOLUTION_NUMERIC_PARAMETERS,
  validEvolutionParameters, type Genome,
} from "./genome";
import { type Checkpoint } from "./trainer";
import { parseEvolution } from "./serialization";
import { sensorCount, sensorNodeId, VARIANT_TWO_INPUT_START } from "../core/sensor-version";
/** Accommodate resumed full-population histories while keeping imports bounded. */
export const MAX_CHECKPOINT_CHARACTERS = 128_000_000;
export function validGenome(g: Genome) {
  if (
    !g ||
    !Array.isArray(g.nodes) ||
    !Array.isArray(g.connections) ||
    g.nodes.length < BASE_NODES ||
    g.nodes.length > 2000 ||
    g.connections.length > 15000 ||
    !Number.isFinite(g.fitness) ||
    (g.observationVersion !== undefined && ![2, 3, 4, 5, 6, 7, 8, 9].includes(g.observationVersion))
  )
    return false;
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  if (nodes.size !== g.nodes.length) return false;
  for (let i = 0; i < INPUT_COUNT; i++)
    if (nodes.get(i)?.kind !== "input" || nodes.get(i)?.depth !== 0)
      return false;
  if(g.observationVersion===9)for(let i=INPUT_COUNT;i<sensorCount(9);i++)if(nodes.get(sensorNodeId(i))?.kind!=="input"||nodes.get(sensorNodeId(i))?.depth!==0)return false;
  if(g.nodes.some(n=>n.id>=VARIANT_TWO_INPUT_START&&(g.observationVersion!==9||n.kind!=="input"||n.id>=VARIANT_TWO_INPUT_START+sensorCount(9)-INPUT_COUNT)))return false;
  if (nodes.get(BIAS)?.kind !== "bias" || nodes.get(BIAS)?.depth !== 0)
    return false;
  for (let i = 0; i < 5; i++)
    if (
      nodes.get(OUTPUT_START + i)?.kind !== "output" ||
      nodes.get(OUTPUT_START + i)?.depth !== 1
    )
      return false;
  for (const n of g.nodes)
    if (
      !Number.isInteger(n.id) ||
      n.id < 0 ||
      n.id > 100000 ||
      !Number.isFinite(n.depth) ||
      n.depth < 0 ||
      n.depth > 1 ||
      !["input", "bias", "hidden", "output"].includes(n.kind)
    )
      return false;
  const innovations = new Set<number>(),
    pairs = new Set<string>();
  for (const c of g.connections) {
    const a = nodes.get(c.from),
      b = nodes.get(c.to),
      key = `${c.from}:${c.to}`;
    if (
      !a ||
      !b ||
      a.depth >= b.depth ||
      !Number.isInteger(c.innovation) ||
      c.innovation < 0 ||
      !Number.isFinite(c.weight) ||
      Math.abs(c.weight) > 8 ||
      typeof c.enabled !== "boolean" ||
      innovations.has(c.innovation) ||
      pairs.has(key)
    )
      return false;
    innovations.add(c.innovation);
    pairs.add(key);
  }
  return true;
}
export function parseCheckpoint(text: string): Checkpoint {
  if (text.length > MAX_CHECKPOINT_CHARACTERS)
    throw new Error("Checkpoint exceeds 128 MB limit");
  const c = parseEvolution<Checkpoint>(text);
  if (
    c?.format !== "crossy-evolution" ||
    c.version !== 1 ||
    !c.config ||
    !c.neat ||
    !Array.isArray(c.history) ||
    !Array.isArray(c.neat.population)
  )
    throw new Error("Unsupported checkpoint format");
  const s = c.config.simulation;
  if (
    ![50, 100, 200].includes(c.config.population) ||
    c.neat.population.length !== c.config.population ||
    !Number.isInteger(c.config.seed) ||
    !Number.isInteger(c.generation) ||
    c.generation < 0 ||
    !s ||
    !["roads", "trains", "mixed"].includes(s.curriculum) ||
    (s.mechanics !== undefined && s.mechanics !== "upstream-v2") ||
    (s.curriculum === "mixed" && s.mechanics !== "upstream-v2") ||
    (s.variantTwoRules !== undefined && (s.variantTwoRules !== "varied-traffic-v1" || s.mechanics !== "upstream-v2" || s.curriculum !== "mixed")) ||
    !Number.isInteger(s.maxTicks) ||
    s.maxTicks < 12 ||
    s.maxTicks > 36000 ||
    !Number.isFinite(s.difficulty) ||
    s.difficulty < 0.1 ||
    s.difficulty > 3 ||
    (s.eagle !== undefined && (!s.eagle || !Number.isInteger(s.eagle.afterTicks) ||
      s.eagle.afterTicks<12 || s.eagle.afterTicks>36000 || !Number.isInteger(s.eagle.warningTicks) ||
      s.eagle.warningTicks<0 || s.eagle.warningTicks>=s.eagle.afterTicks)) ||
    !Number.isInteger(c.config.trainingSeeds) ||
    c.config.trainingSeeds < 1 ||
    c.config.trainingSeeds > 64 ||
    (c.config.fitnessObjective !== undefined && !["reward","rows"].includes(c.config.fitnessObjective)) ||
    (c.config.profile !== undefined && c.config.profile !== "robust-v2") ||
    (c.config.observationVersion !== undefined &&
      ![2, 3, 4, 5, 6, 7, 8, 9].includes(c.config.observationVersion))
  )
    throw new Error("Invalid evaluator configuration");
  if (
    (c.config.evolutionParameters !== undefined && !validEvolutionParameters(c.config.evolutionParameters)) ||
    (c.neat.parameters !== undefined && !validEvolutionParameters(c.neat.parameters)) ||
    (c.config.evolutionParameters === undefined) !== (c.neat.parameters === undefined) ||
    (c.config.evolutionParameters && c.neat.parameters &&
      [...EVOLUTION_NUMERIC_PARAMETERS, "retainStaleSpeciesProgress" as const, "weightMutationScope" as const,
        "speciesThresholdFloor" as const, "speciesThresholdStep" as const].some(
        (key) => c.config.evolutionParameters![key] !== c.neat.parameters![key]))
  ) throw new Error("Invalid or inconsistent evolution parameters");
  if (
    (c.config.fitnessRiskWeight !== undefined &&
      (!Number.isFinite(c.config.fitnessRiskWeight) || c.config.fitnessRiskWeight < 0 || c.config.fitnessRiskWeight > 1)) ||
    (c.config.trainingSeedStride !== undefined &&
      (!Number.isInteger(c.config.trainingSeedStride) || c.config.trainingSeedStride < 1 || c.config.trainingSeedStride > 1_000_000)) ||
    (c.config.trainingSeedStream !== undefined &&
      (!Number.isInteger(c.config.trainingSeedStream) || c.config.trainingSeedStream < 0 || c.config.trainingSeedStream > 0xffffffff)) ||
    (c.config.trainingSeedPrefix !== undefined && ![0,0x40000000,0x80000000,0xc0000000].includes(c.config.trainingSeedPrefix)) ||
    (c.config.monitorSeeds !== undefined &&
      (!Array.isArray(c.config.monitorSeeds) || !c.config.monitorSeeds.length || c.config.monitorSeeds.length > 512 ||
        !c.config.monitorSeeds.every((seed) => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff)))
  ) throw new Error("Invalid training evaluation parameters");
  if (
    !c.neat.population.every(validGenome) ||
    !Array.isArray(c.neat.representatives) ||
    !c.neat.representatives.every((r) => validGenome(r.representative)) ||
    !c.neat.tracker ||
    !Array.isArray(c.neat.tracker.connections) ||
    !Array.isArray(c.neat.tracker.splits) ||
    !Number.isInteger(c.neat.rng)
  )
    throw new Error("Invalid genome or evolution state");
  const tuning = c.neat.tuning;
  if (
    tuning !== undefined &&
    (!Number.isFinite(tuning.threshold) ||
      tuning.threshold < (c.neat.parameters?.speciesThresholdFloor ?? 0.1) ||
      tuning.threshold > 100 ||
      !Number.isInteger(tuning.generation) ||
      tuning.generation !== c.generation ||
      !Array.isArray(tuning.progress) ||
      !tuning.progress.every(
        (entry) =>
          Array.isArray(entry) &&
          Number.isInteger(entry[0]) &&
          Number.isFinite(entry[1]?.best) &&
          Number.isInteger(entry[1]?.improved) &&
          entry[1].improved >= 0 &&
          entry[1].improved <= tuning.generation,
      ))
  )
    throw new Error("Invalid adaptive species state");
  if (
    c.history.length !== c.generation ||
    !c.history.every(
      (h, i) =>
        h.generation === i + 1 &&
        validGenome(h.champion) &&
        Array.isArray(h.contenders) &&
        h.contenders.length > 0 &&
        h.contenders.length <= c.config.population &&
        h.contenders.every(validGenome) &&
        (h.populationSize === undefined ||
          h.populationSize === c.config.population) &&
        (h.cohortHash === undefined || /^[0-9a-f]{64}$/.test(h.cohortHash)) &&
        (h.cohortFile === undefined ||
          /^\/training-cohorts\/(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\/)?\d{5}\.json\.gz$/.test(h.cohortFile)) &&
        ["roads", "trains", "mixed"].includes(h.curriculum) &&
        Array.isArray(h.seeds) &&
        h.seeds.every(Number.isInteger) &&
        [h.bestFitness, h.meanFitness, h.meanRow, h.maxRow, h.evalRow].every(
          Number.isFinite,
        ),
    )
  )
    throw new Error("Invalid generation history");
  return c;
}
