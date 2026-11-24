/** Verify gallery and native execution of a frozen policy on opened development cases. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { GameSimulation } from "../../src/core/simulation";
import { INPUT_COUNT } from "../../src/core/observation";
import { parseCheckpoint } from "../../src/evolution/checkpoint";
import { parseEvolution } from "../../src/evolution/serialization";
import { type Genome } from "../../src/evolution/genome";
import { type Episode } from "../../src/evolution/evaluation";
import { Network } from "../../src/evolution/network";
import { Replay } from "../../src/evolution/replay";
import { WIDE_DEVELOPMENT_SEEDS } from "../../src/evolution/suites";
import { writeAtomic } from "../utils/atomic-write";

const source = process.argv[2];
if (!source) throw new Error("Usage: frozen-directory [new-report-path]");
const output = process.argv[3] ?? path.join(source, "replay-verification.json");
if (fs.existsSync(output)) throw new Error("Refusing to overwrite a replay report");
const checkpointText = fs.readFileSync(path.join(source, "checkpoint.json"), "utf8");
const selectedText = fs.readFileSync(path.join(source, "selected.json"), "utf8");
const checkpoint = parseCheckpoint(checkpointText);
const selected = parseEvolution<{genome: Genome; generation: number; episodes: Episode[]; validationSeeds: number[]}>(selectedText);
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const freeze = JSON.parse(fs.readFileSync(path.join(source, "freeze.json"), "utf8"));
const policySha256 = digest(JSON.stringify({version: selected.genome.observationVersion ?? 1,
  nodes: selected.genome.nodes, connections: selected.genome.connections}));
assert.equal(digest(checkpointText), freeze.checkpointSha256);
assert.equal(policySha256, freeze.policySha256);
assert.equal(selected.episodes.length, selected.validationSeeds.length);
assert.ok(selected.validationSeeds.every(seed => WIDE_DEVELOPMENT_SEEDS.includes(seed)));
assert.ok(selected.episodes.every((episode, i) => episode.seed === selected.validationSeeds[i]));

const cases = [
  {name: "car", episode: selected.episodes.find(e => e.deathReason === "car")},
  {name: "bounds", episode: selected.episodes.find(e => e.deathReason === "bounds")},
  {name: "high-timeout", episode: selected.episodes.find(e => e.deathReason === "timeout" && e.score >= 1000)},
  {name: "low-timeout", episode: selected.episodes.find(e => e.deathReason === "timeout" && e.score < 1000)},
];
const results = [];
for (const {name, episode} of cases) {
  if (!episode) continue;
  const native = new GameSimulation(checkpoint.config.simulation, episode.seed);
  const network = new Network(selected.genome);
  const buffer = new Float32Array(INPUT_COUNT);
  const replay = new Replay([selected.genome], episode.seed, checkpoint.config.simulation);
  let decisions = 0;
  while (native.agent.alive) {
    const sparseAction = network.decide(native.getObservation(network.observationVersion, network.requiredInputs, buffer));
    const dense = replay.current;
    const denseAction = dense.network.decide(dense.sim.getObservation(dense.network.observationVersion));
    assert.equal(denseAction, sparseAction);
    assert.deepEqual(dense.network.scores, network.scores);
    native.step(sparseAction, false);
    replay.advance();
    assert.equal(replay.current.sim.tick, native.tick);
    assert.deepEqual(replay.current.sim.agent, native.agent);
    decisions++;
  }
  assert.equal(native.agent.maxRow, episode.score);
  assert.equal(native.tick, episode.ticks);
  assert.equal(native.agent.deathReason, episode.deathReason);
  assert.ok(replay.finished);
  results.push({name, seed: episode.seed, score: episode.score, ticks: episode.ticks,
    deathReason: episode.deathReason, decisions});
}
assert.ok(results.length > 0);
assert.equal(fs.readFileSync(path.join(source, "checkpoint.json"), "utf8"), checkpointText);
assert.equal(fs.readFileSync(path.join(source, "selected.json"), "utf8"), selectedText);
const report = {verifiedAt: new Date().toISOString(), source, selectedGeneration: selected.generation,
  selectedGenome: selected.genome.id, policySha256, checkpointSha256: digest(checkpointText),
  purpose: "Opened development cases only: exact dense-gallery versus sparse-native outputs, actions, states and ticks at every decision. No final maps or model selection.",
  unavailableCases: cases.filter(c => !c.episode).map(c => c.name),
  decisions: results.reduce((sum, r) => sum + r.decisions, 0), results};
fs.mkdirSync(path.dirname(output), {recursive: true});
writeAtomic(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
