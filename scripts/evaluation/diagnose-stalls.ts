/** Inspect already-opened, low-scoring development timeouts without altering the policy. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { GameSimulation } from "../../src/core/simulation";
import { INPUT_COUNT } from "../../src/core/observation";
import { type Action } from "../../src/core/types";
import { parseCheckpoint } from "../../src/evolution/checkpoint";
import { parseEvolution } from "../../src/evolution/serialization";
import { type Genome } from "../../src/evolution/genome";
import { type Episode } from "../../src/evolution/evaluation";
import { Network } from "../../src/evolution/network";
import { WIDE_DEVELOPMENT_SEEDS } from "../../src/evolution/suites";
import { writeAtomic } from "../utils/atomic-write";

const source = process.argv[2];
if (!source) throw new Error("Usage: source-directory [new-output-file]");
const output = process.argv[3] ?? path.join(source, "stall-diagnosis.json");
if (fs.existsSync(output)) throw new Error("Refusing to overwrite diagnosis evidence");
const checkpoint = parseCheckpoint(fs.readFileSync(path.join(source, "checkpoint.json"), "utf8"));
const selected = parseEvolution<{genome: Genome; generation: number; episodes: Episode[]}>(
  fs.readFileSync(path.join(source, "selected.json"), "utf8"));
const cases = selected.episodes.filter(e => e.deathReason === "timeout" && e.score < 1000);
assert.ok(cases.every(e => WIDE_DEVELOPMENT_SEEDS.includes(e.seed)));
const results = [];
for (const expected of cases) {
  const sim = new GameSimulation(checkpoint.config.simulation, expected.seed), network = new Network(selected.genome);
  const buffer = new Float32Array(INPUT_COUNT);
  const tail: {action: Action; x: number; row: number; blocked: boolean}[] = [];
  let lastProgressTick = 0;
  while (sim.agent.alive) {
    const oldScore = sim.agent.maxRow;
    const action = network.decide(sim.getObservation(network.observationVersion, network.requiredInputs, buffer));
    sim.step(action, false);
    if (sim.agent.maxRow > oldScore) lastProgressTick = sim.tick;
    tail.push({action, x: sim.agent.x, row: sim.agent.row, blocked: sim.agent.blocked});
    if (tail.length > 240) tail.shift();
  }
  assert.equal(sim.agent.maxRow, expected.score);
  assert.equal(sim.tick, expected.ticks);
  assert.equal(sim.agent.deathReason, expected.deathReason);
  const actions: Record<string, number> = {};
  for (const step of tail) actions[step.action] = (actions[step.action] ?? 0) + 1;
  const positions = new Set(tail.map(step => `${step.x},${step.row}`)).size;
  const reversals = tail.slice(1).filter((step, i) =>
    (step.action === "LEFT" && tail[i].action === "RIGHT") ||
    (step.action === "RIGHT" && tail[i].action === "LEFT")).length;
  const blocked = tail.filter(step => step.blocked).length;
  const stalledTicks = sim.tick - lastProgressTick;
  const category = stalledTicks <= 3000 ? "recent-progress" :
    positions <= 2 && reversals >= tail.length * .9 ? "horizontal-two-cycle" :
    blocked >= tail.length * .9 ? "repeated-blocked-action" :
    (actions.WAIT ?? 0) >= tail.length * .9 ? "repeated-wait" : "other-stall";
  results.push({seed: expected.seed, score: expected.score, stalledTicks, category,
    last240Decisions: {actions, uniquePositions: positions, horizontalReversals: reversals, blocked},
    finalPosition: {x: sim.agent.x, row: sim.agent.row}});
}
const categories: Record<string, number> = {};
for (const result of results) categories[result.category] = (categories[result.category] ?? 0) + 1;
const report = {at: new Date().toISOString(), source, generation: selected.generation, genome: selected.genome.id,
  purpose: "Diagnosis of already-opened development timeouts below1000 only. No changed actions, training, final maps or model selection.",
  inspected: results.length, categories, results};
fs.mkdirSync(path.dirname(output), {recursive: true});
writeAtomic(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({...report, results: undefined}, null, 2));
