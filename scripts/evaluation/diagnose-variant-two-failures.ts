import fs from "node:fs";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { GameSimulation } from "../../src/core/simulation";
import { VARIANT_TWO_CONFIG } from "../../src/core/upstream";
import { observation, INPUT_COUNT, GLOBAL_OFFSET, ROW_OFFSETS } from "../../src/core/observation";
import type { Action, AgentState } from "../../src/core/types";
import { Network } from "../../src/evolution/network";
import type { Genome } from "../../src/evolution/genome";
import type { Episode } from "../../src/evolution/evaluation";
import { parseEvolution } from "../../src/evolution/serialization";
import { writeVariantTwoImmutable } from "../../src/evolution/variant-two-experiment";

const best = JSON.parse(fs.readFileSync(".archive/results/variant-2/best-development.json", "utf8"));
const file = `${best.selectedDirectory}/generations/${String(best.generation).padStart(5, "0")}.json.gz`;
const population = parseEvolution<{ contenders: Genome[] }>(gunzipSync(fs.readFileSync(file)).toString()).contenders;
const genome = population.find(g => g.id === best.genome); assert.ok(genome);
const expected = JSON.parse(fs.readFileSync(best.verificationFile, "utf8")).confirmationEpisodes as Episode[];
assert.equal(expected.length, 256);
const reports = expected.map(target => {
  const sim = new GameSimulation(VARIANT_TWO_CONFIG, target.seed), network = new Network(genome);
  const buffer = new Float32Array(network.requiredInputs.length);
  const tail: { agent: AgentState; tick: number; action: Action; scores: number[] }[] = [];
  while (sim.agent.alive) {
    const encoded = sim.getObservation(9, network.requiredInputs, buffer), action = network.decide(encoded);
    tail.push({ agent: { ...sim.agent }, tick: sim.tick, action, scores: Array.from(network.scores) });
    if (tail.length > 50) tail.shift();
    sim.step(action, false);
  }
  assert.equal(sim.agent.maxRow, target.score); assert.equal(sim.tick, target.ticks);
  assert.equal(sim.agent.deathReason, target.deathReason);
  const last = tail.at(-1)!;
  const dense = observation(sim.world, last.agent, last.tick, 9);
  const cell = (dx: number, dy: number) => ROW_OFFSETS.indexOf(dy as typeof ROW_OFFSETS[number]) * 9 + dx + 4;
  const dx = last.action === "LEFT" ? -1 : last.action === "RIGHT" ? 1 : 0;
  const dy = last.action === "UP" ? 1 : last.action === "DOWN" ? -1 : 0;
  return { ...target, lastAction: last.action, xBefore: last.agent.x, rowBefore: last.agent.row,
    currentTerrain: sim.world.row(Math.round(last.agent.row)).type,
    nextTerrain: sim.world.row(Math.round(last.agent.row) + 1).type,
    targetWaterIndicated: dense[INPUT_COUNT + cell(dx, dy) * 3] > .5,
    targetSupportAtRoundedLanding: dense[INPUT_COUNT + cell(dx, dy) * 3 + 2] > .5,
    fractionX: dense[INPUT_COUNT + 220], inactivityFraction: dense[INPUT_COUNT + 216],
    upBlocked: dense[GLOBAL_OFFSET + 8] > .5,
    blockedActionsInLast50: tail.filter(t => t.agent.blocked).length,
    waitsInLast50: tail.filter(t => t.action === "WAIT").length,
    uniquePositionsInLast50: new Set(tail.map(t => `${Math.round(t.agent.x * 10)}:${Math.round(t.agent.row)}`)).size,
    tailActions: tail.map(t => t.action), lastScores: last.scores };
});
const count = (predicate: (r: typeof reports[number]) => boolean) => reports.filter(predicate).length;
const summary = {
  eagle: count(r => r.deathReason === "eagle"),
  eagleWithWaterAhead: count(r => r.deathReason === "eagle" && r.nextTerrain === "water"),
  eagleWithTreeAhead: count(r => r.deathReason === "eagle" && r.upBlocked),
  eagleMostlyWaiting: count(r => r.deathReason === "eagle" && r.waitsInLast50 >= 40),
  water: count(r => r.deathReason === "water"),
  waterDespiteRoundedSupportSensor: count(r => r.deathReason === "water" && r.targetSupportAtRoundedLanding),
  boundsWhileOnWater: count(r => r.deathReason === "bounds" && r.currentTerrain === "water"),
  carWithWaterCurrentOrAhead: count(r => r.deathReason === "car" && (r.currentTerrain === "water" || r.nextTerrain === "water")),
  allEpisodesExactlyMatchedSavedAudit: true,
};
const report = { source: { directory: best.selectedDirectory, generation: best.generation, genome: genome.id },
  diagnosticOnly: true, policyAndPhysicsUnchanged: true, finalMapsOpened: false, summary, reports };
writeVariantTwoImmutable(`.archive/results/variant-2/failure-analysis-${genome.id}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(summary));
