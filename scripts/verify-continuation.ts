/** Reproduce archived outcomes without altering training or model selection. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { HOP_TICKS } from "../src/core/types";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution } from "../src/evolution/serialization";
import { type Genome } from "../src/evolution/genome";
import { evaluateGenome, HELD_OUT_SEEDS, mean } from "../src/evolution/evaluation";
import { VALIDATION_SEEDS } from "../src/evolution/suites";
import { Replay } from "../src/evolution/replay";

const output = process.argv[2] ?? "results/continued";
const source = process.argv[3] ?? "results/learned";
const checkpoint = parseCheckpoint(fs.readFileSync(path.join(output, "checkpoint.json"), "utf8"));
const previous = parseCheckpoint(fs.readFileSync(path.join(source, "checkpoint.json"), "utf8"));
assert.deepEqual(checkpoint.config, previous.config);
assert.deepEqual(checkpoint.history.slice(0, previous.generation), previous.history);
const selected = parseEvolution<{
  genome: Genome;
  generation: number;
  episodes: ReturnType<typeof evaluateGenome>;
}>(fs.readFileSync(path.join(output, "selected.json"), "utf8"));
assert.deepEqual(
  evaluateGenome(selected.genome, VALIDATION_SEEDS, checkpoint.config.simulation),
  selected.episodes,
);

// This reference was recorded before this continuation, independently in Node
// and in the browser worker. It verifies that the saved RNG/breeding state resumes.
const reference = JSON.parse(fs.readFileSync(path.join(source, "continuation-reference.json"), "utf8"));
for (const expected of reference) {
  const record = checkpoint.history[expected.generation - 1];
  assert.deepEqual({
    generation: record.generation,
    champion: record.champion.id,
    bestFitness: record.bestFitness,
    meanRow: record.meanRow,
    evalRow: record.evalRow,
    species: record.species,
  }, expected);
}
let championEpisodes = 0, populationEpisodes = 0;
const sampledGenerations = [previous.generation + 1,
  Math.floor((previous.generation + checkpoint.generation) / 2), checkpoint.generation];
for (const record of checkpoint.history.slice(previous.generation)) {
  const raw = gunzipSync(fs.readFileSync(path.join(output, "generations", path.basename(record.cohortFile!))));
  assert.equal(createHash("sha256").update(raw).digest("hex"), record.cohortHash);
  const { contenders } = parseEvolution<{ contenders: Genome[] }>(raw.toString("utf8"));
  assert.equal(contenders.length, checkpoint.config.population);
  assert.equal(new Set(contenders.map((g) => g.id)).size, contenders.length);
  assert.ok(contenders.every((g) => g.observationVersion === checkpoint.config.observationVersion));
  assert.deepEqual(contenders[0], record.champion);
  assert.deepEqual(evaluateGenome(record.champion, record.seeds, checkpoint.config.simulation), record.training);
  assert.deepEqual(evaluateGenome(record.champion, HELD_OUT_SEEDS, checkpoint.config.simulation), record.evaluation);
  championEpisodes += record.seeds.length + HELD_OUT_SEEDS.length;
  if (sampledGenerations.includes(record.generation)) {
    for (const genome of contenders) {
      const episodes = evaluateGenome(genome, record.seeds, checkpoint.config.simulation);
      const scores = episodes.map((e) => e.fitness).sort((a, b) => a - b);
      const fitness = checkpoint.config.profile === "robust-v2"
        ? 0.5 * mean(scores) + 0.5 * mean(scores.slice(0, Math.ceil(scores.length / 2)))
        : mean(scores);
      assert.equal(fitness, genome.fitness);
      populationEpisodes += episodes.length;
    }
    console.log(`Verified complete population ${record.generation}`);
  }
}
const record = checkpoint.history[selected.generation - 1];
const { contenders } = parseEvolution<{ contenders: Genome[] }>(gunzipSync(fs.readFileSync(
  path.join(output, "generations", path.basename(record.cohortFile!)),
)).toString("utf8"));
const agentIndex = contenders.findIndex((g) => g.id === selected.genome.id);
assert.ok(agentIndex >= 0);
assert.deepEqual(contenders[agentIndex], selected.genome);
const replay = new Replay(contenders, record.seeds[0], checkpoint.config.simulation);
replay.selected = agentIndex;
replay.seek(Math.ceil(checkpoint.config.simulation.maxTicks / HOP_TICKS));
const expected = evaluateGenome(selected.genome, [record.seeds[0]], checkpoint.config.simulation)[0];
assert.equal(replay.current.sim.agent.maxRow, expected.score);
assert.equal(replay.current.sim.tick, expected.ticks);
assert.equal(replay.current.sim.agent.deathReason, expected.deathReason);
const result = {
  sourceGeneration: previous.generation,
  generation: checkpoint.generation,
  previousHistoryUnchanged: true,
  firstFiveGenerationsMatchPriorReference: true,
  newPopulationsAndContentHashesVerified: checkpoint.generation - previous.generation,
  championEpisodes,
  sampledGenerations,
  populationEpisodes,
  validationEpisodes: VALIDATION_SEEDS.length,
  selectedReplay: {
    generation: selected.generation,
    genome: selected.genome.id,
    agentIndex,
    ...expected,
    cohortAliveAtEnd: replay.agents.filter((a) => a.sim.agent.alive).length,
    total: contenders.length,
  },
};
fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
