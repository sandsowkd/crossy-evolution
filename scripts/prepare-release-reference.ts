/** Native replay and continuation references for UI verification; never selects a model. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { gzipSync, gunzipSync } from "node:zlib";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { type Genome } from "../src/evolution/genome";
import { Trainer } from "../src/evolution/trainer";
import { Replay } from "../src/evolution/replay";
import { evaluateGenome } from "../src/evolution/evaluation";

const root = process.argv[2], additional = Number(process.argv[3] ?? 1);
if (!root || !Number.isInteger(additional) || additional < 1 || additional > 5)
  throw new Error("Usage: release-directory [1..5 additional generations]");
const output = path.join(root, "native-continuation");
if (fs.existsSync(output)) throw new Error("Refusing to overwrite native UI references");
const checkpoint = parseCheckpoint(fs.readFileSync(path.join(root, "checkpoint.json"), "utf8"));
const selected = parseEvolution<{genome: Genome; generation: number}>(fs.readFileSync(path.join(root, "selected.json"), "utf8"));
const record = checkpoint.history.find(r => r.generation === selected.generation);
assert.ok(record?.cohortFile);
const {contenders} = parseEvolution<{contenders: Genome[]}>(gunzipSync(fs.readFileSync(
  path.join(root, "generations", path.basename(record.cohortFile)))).toString());
assert.equal(contenders.length, checkpoint.config.population);
const agentIndex = contenders.findIndex(g => g.id === selected.genome.id);
assert.ok(agentIndex >= 0);
const replay = new Replay(contenders, record.seeds[0], checkpoint.config.simulation);
replay.selected = agentIndex;
const samples = [], sampleDecisions = new Set([0, 1000, 1750, 2100, 3000]);
let first1000: {decision: number; ticks: number} | null = null;
for (let decision = 0; decision <= 3000; decision++) {
  if (decision) replay.advance();
  if (!first1000 && replay.current.sim.agent.maxRow >= 1000)
    first1000 = {decision, ticks: replay.current.sim.tick};
  if (sampleDecisions.has(decision)) samples.push({decision, tick: replay.current.sim.tick,
    score: replay.current.sim.agent.maxRow, alive: replay.agents.filter(a => a.sim.agent.alive).length,
    selectedAlive: replay.current.sim.agent.alive});
}
const expected = evaluateGenome(selected.genome, [record.seeds[0]], checkpoint.config.simulation)[0];
assert.equal(replay.current.sim.agent.maxRow, expected.score);
assert.equal(replay.current.sim.tick, expected.ticks);
assert.equal(replay.current.sim.agent.deathReason, expected.deathReason);
fs.mkdirSync(path.join(output, "generations"), {recursive: true});
fs.writeFileSync(path.join(root, "browser-replay-expected.json"), JSON.stringify({sourceGeneration: selected.generation,
  genome: selected.genome.id, agentIndex, population: contenders.length, seed: record.seeds[0],
  first1000, samples, final: expected,
  hidden: selected.genome.nodes.filter(n => n.kind === "hidden").length,
  enabledConnections: selected.genome.connections.filter(c => c.enabled).length,
  totalConnections: selected.genome.connections.length}, null, 2));
console.log("Replay reference", {seed: record.seeds[0], first1000, samples, final: expected});
const trainer = Trainer.restore(checkpoint), references = [];
for (let i = 0; i < additional; i++) {
  const r = trainer.runGeneration();
  fs.writeFileSync(path.join(output, "generations", `${String(r.generation).padStart(5, "0")}.json.gz`),
    gzipSync(stringifyEvolution({contenders: r.contenders}), {level: 3}));
  references.push({generation: r.generation, champion: r.champion.id, bestFitness: r.bestFitness,
    meanRow: r.meanRow, evalRow: r.evalRow, species: r.species, nodes: r.nodes,
    connections: r.connections, population: r.contenders.length});
  r.contenders = [r.champion];
}
fs.writeFileSync(path.join(output, "checkpoint.json"), stringifyEvolution(trainer.checkpoint()));
fs.writeFileSync(path.join(root, "browser-continuation-reference.json"), JSON.stringify(references, null, 2));
console.log("Continuation references", references);
