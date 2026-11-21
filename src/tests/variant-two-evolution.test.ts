import test from "node:test";
import assert from "node:assert/strict";
import { GameSimulation } from "../core/simulation";
import { VARIANT_TWO_CONFIG as UPSTREAM_VARIANT_TWO_CONFIG } from "../core/upstream";
import { sensorCount } from "../core/sensor-version";
import { Trainer } from "../evolution/trainer";
import { parseCheckpoint } from "../evolution/checkpoint";
import { stringifyEvolution } from "../evolution/serialization";
import { Innovations, minimalGenome } from "../evolution/genome";
import { RNG } from "../core/rng";
import { Network } from "../evolution/network";
import { Replay } from "../evolution/replay";
import { evaluateGenome } from "../evolution/evaluation";
import { upgradeToVariantTwo } from "../evolution/variant-two-transfer";
import { assertVariantTwoSeedSeparation, variantTwoTrainingSeeds } from "../evolution/variant-two-experiment";

test("V9 preserves the legacy input prefix and adds explicit bounded support/rail/eagle channels",()=>{
  const sim=new GameSimulation(UPSTREAM_VARIANT_TWO_CONFIG,42);sim.tick=120;
  const old=sim.getObservation(8),next=sim.getObservation(9);
  assert.equal(next.length,sensorCount(9));assert.deepEqual(next.slice(0,old.length),old);
  assert.ok(next.every(n=>Number.isFinite(n)&&n>=-1&&n<=1));
  const tracker=new Innovations(),genome=minimalGenome(0,new RNG(51),tracker,true,9),net=new Network(genome);
  const sparse=sim.getObservation(9,net.requiredInputs),dense=sim.getObservation(9);
  net.activate(dense);const scores=net.scores.slice();net.activate(sparse);assert.deepEqual(net.scores,scores);
  assert.ok(dense.slice(658).some(x=>x!==0));
});
test("transfer preserves all inherited outputs with zero-initialized new connections",()=>{
  const tracker=new Innovations(),rng=new RNG(2),genome=minimalGenome(0,rng,tracker,true,8);
  const before=structuredClone(genome),migrated=upgradeToVariantTwo(genome,tracker,rng),sim=new GameSimulation({},42);
  assert.deepEqual(genome,before);assert.deepEqual(migrated.connections.slice(0,genome.connections.length),genome.connections);
  const old=new Network(genome),next=new Network(migrated);
  assert.deepEqual(next.activate(sim.getObservation(9)),old.activate(sim.getObservation(8)));
});
test("V9 native checkpoint resumes exact NEAT state and headless population replay",()=>{
  const trainer=new Trainer({population:50,seed:20261121,trainingSeeds:1,profile:"robust-v2",observationVersion:9,
    trainingSeedPrefix:0x40000000,simulation:{...UPSTREAM_VARIANT_TWO_CONFIG,maxTicks:240}});
  const first=trainer.runGeneration();
  assert.ok(first.seeds.every(s=>s>=0x40000000&&s<=0x7fffffff));
  const saved=parseCheckpoint(stringifyEvolution(trainer.checkpoint())),restored=Trainer.restore(saved);
  assert.deepEqual(restored.runGeneration(),trainer.runGeneration());assert.deepEqual(restored.neat.save(),trainer.neat.save());
  const genome=first.champion,[expected]=evaluateGenome(genome,[42],trainer.config.simulation);
  const replay=new Replay([genome],42,trainer.config.simulation);while(!replay.finished)replay.advance();
  assert.equal(replay.current.sim.agent.maxRow,expected.score);assert.equal(replay.current.sim.tick,expected.ticks);
  assert.equal(replay.current.sim.agent.deathReason,expected.deathReason);
});
test("paired runs share training maps and use separately reserved unobserved final seeds",()=>{
  assertVariantTwoSeedSeparation();
  const trainer=new Trainer({population:50,seed:20261121,trainingSeeds:16,trainingSeedPrefix:0x40000000,trainingSeedStream:2307,trainingSeedStride:19,
    observationVersion:9,simulation:{...UPSTREAM_VARIANT_TWO_CONFIG,maxTicks:12}});
  assert.deepEqual(trainer.runGeneration().seeds,variantTwoTrainingSeeds(0));
});
