import assert from "node:assert/strict";
import { test } from "node:test";
import { GameSimulation } from "../core/simulation";
import { GLOBAL_OFFSET, inputLabel } from "../core/observation";
import { Trainer } from "../evolution/trainer";
import { parseCheckpoint } from "../evolution/checkpoint";
import { stringifyEvolution } from "../evolution/serialization";
import { selectionScore } from "../evolution/selection";
import { evaluateGenome,mean,type Episode } from "../evolution/evaluation";
import { EXPERIMENT_VALIDATION_SEEDS, WIDE_DEVELOPMENT_SEEDS, LONG_TEST_SEEDS,LONG_IMPROVEMENT_TEST_SEEDS,LONG_FURTHER_TEST_SEEDS,LONG_POST_FURTHER_TEST_SEEDS, CONTINUATION_TEST_SEEDS, FINAL_TEST_SEEDS } from "../evolution/suites";
import { BIAS, OUTPUT_START, Innovations, minimalGenome, mutate, type EvolutionParameters } from "../evolution/genome";
import { RNG } from "../core/rng";
import { Network } from "../evolution/network";

test("two-hop sensors expose local future traffic without changing existing motion sensors or physics",()=>{
 const sim=new GameSimulation({maxTicks:36000},591);
 sim.agent.row=8;sim.agent.maxRow=8;sim.agent.x=0;sim.tick=137;
 const state=sim.getState(),base=sim.getObservation(3),lookahead=sim.getObservation(5);
 assert.deepEqual(lookahead.slice(0,GLOBAL_OFFSET+1),base.slice(0,GLOBAL_OFFSET+1));
 assert.deepEqual(lookahead.slice(GLOBAL_OFFSET+3),base.slice(GLOBAL_OFFSET+3));
 assert.ok(lookahead[GLOBAL_OFFSET+1]>=0&&lookahead[GLOBAL_OFFSET+1]<=1);
 assert.equal(lookahead[GLOBAL_OFFSET+2],+sim.world.row(10).blocked.includes(0));
 assert.deepEqual(sim.getState(),state);
 assert.match(inputLabel(GLOBAL_OFFSET+1,5),/two-hop/);
});
test("memory sensors expose the previous action and blockage without changing simulation state",()=>{
 const sim=new GameSimulation({maxTicks:36000},591);
 for(const [action,horizontal,blocked] of [["LEFT",-1,false],["RIGHT",1,true],["UP",0,false],["WAIT",0,true]] as const){
  sim.agent.lastAction=action;sim.agent.blocked=blocked;
  const state=sim.getState(),base=sim.getObservation(3),memory=sim.getObservation(6);
  assert.deepEqual(memory.slice(0,GLOBAL_OFFSET+1),base.slice(0,GLOBAL_OFFSET+1));
  assert.deepEqual(memory.slice(GLOBAL_OFFSET+3),base.slice(GLOBAL_OFFSET+3));
  assert.equal(memory[GLOBAL_OFFSET+1],horizontal);
  assert.equal(memory[GLOBAL_OFFSET+2],+blocked);
  assert.deepEqual(sim.getState(),state);
 }
 assert.match(inputLabel(GLOBAL_OFFSET+1,6),/previous horizontal action/);
 assert.match(inputLabel(GLOBAL_OFFSET+2,6),/blocked/);
});
test("clock-preserving memory starts with exactly the inherited roads policy",()=>{
 const rng=new RNG(592),tracker=new Innovations(),g=minimalGenome(1,rng,tracker,true,3);
 const memory=structuredClone(g);memory.observationVersion=7;
 for(const c of memory.connections)if(c.from===GLOBAL_OFFSET+9)c.weight=0;
 const oldNetwork=new Network(g),memoryNetwork=new Network(memory);
 const sim=new GameSimulation({curriculum:"roads",maxTicks:36000},596);
 for(let row=0;row<100;row++){
  sim.agent.row=row;sim.agent.x=row%9-4;sim.tick=row*191;
  sim.agent.lastAction=row%2?"LEFT":"RIGHT";
  const base=sim.getObservation(3),observation=sim.getObservation(7);
  assert.deepEqual(observation.slice(0,GLOBAL_OFFSET+9),base.slice(0,GLOBAL_OFFSET+9));
  assert.equal(observation[GLOBAL_OFFSET+9],row%2?-1:1);
  assert.deepEqual(memoryNetwork.activate(observation),oldNetwork.activate(base));
 }
 assert.match(inputLabel(GLOBAL_OFFSET+9,7),/previous horizontal action/);
});
test("lookahead-preserving memory retains all learned roads channels and initial outputs",()=>{
 const rng=new RNG(59281),tracker=new Innovations(),g=minimalGenome(1,rng,tracker,true,5);
 const memory=structuredClone(g);memory.observationVersion=8;
 for(const c of memory.connections)if(c.from===GLOBAL_OFFSET+9)c.weight=0;
 const oldNetwork=new Network(g),memoryNetwork=new Network(memory);
 const sim=new GameSimulation({curriculum:"roads",maxTicks:36000},59681);
 for(let row=0;row<100;row++){
  sim.agent.row=row;sim.agent.x=row%9-4;sim.tick=row*191;
  sim.agent.lastAction=row%2?"LEFT":"RIGHT";
  const state=sim.getState(),base=sim.getObservation(5),observation=sim.getObservation(8);
  assert.deepEqual(observation.slice(0,GLOBAL_OFFSET+9),base.slice(0,GLOBAL_OFFSET+9));
  assert.equal(observation[GLOBAL_OFFSET+9],row%2?-1:1);
  assert.deepEqual(memoryNetwork.activate(observation),oldNetwork.activate(base));
  assert.deepEqual(sim.getState(),state);
 }
 assert.match(inputLabel(GLOBAL_OFFSET+1,8),/two-hop/);
 assert.match(inputLabel(GLOBAL_OFFSET+2,8),/two-hop/);
 assert.match(inputLabel(GLOBAL_OFFSET+9,8),/previous horizontal action/);
});
test("64-map, sensor-versioned training checkpoints preserve the exact next generation",()=>{
 for(const version of [5,8] as const){
 const trainer=new Trainer({population:50,seed:889,trainingSeeds:64,profile:"robust-v2",observationVersion:version,
   fitnessRiskWeight:0,simulation:{curriculum:"roads",maxTicks:24,difficulty:1}});
 trainer.runGeneration();
 const saved=parseCheckpoint(stringifyEvolution(trainer.checkpoint()));
 const resumed=Trainer.restore(saved);
 assert.deepEqual(resumed.runGeneration(),trainer.runGeneration());
 assert.deepEqual(resumed.neat.save(),trainer.neat.save());
 assert.ok(saved.neat.population.every(g=>g.observationVersion===version));
 }
});
test("average-score selection and the reserved long test suite are explicit and separate",()=>{
 const make=(scores:number[]):Episode[]=>scores.map((score,seed)=>({seed,score,ticks:36000,fitness:score*10-360,deathReason:"timeout"}));
 assert.equal(selectionScore(make([500,1500]),"mean-row-v1"),1000);
 assert.ok(selectionScore(make([800,800]),"robust-row-v1")>selectionScore(make([500,1500]),"robust-row-v1"));
 const all=[...EXPERIMENT_VALIDATION_SEEDS,...LONG_TEST_SEEDS,...LONG_IMPROVEMENT_TEST_SEEDS,...LONG_FURTHER_TEST_SEEDS,...LONG_POST_FURTHER_TEST_SEEDS,...CONTINUATION_TEST_SEEDS,...FINAL_TEST_SEEDS];
 assert.equal(new Set(all).size,all.length);
 assert.equal(LONG_TEST_SEEDS.length,512);
 assert.equal(LONG_FURTHER_TEST_SEEDS.length,512);
 assert.equal(LONG_POST_FURTHER_TEST_SEEDS.length,512);
 assert.equal(WIDE_DEVELOPMENT_SEEDS.length,768);
 assert.equal(new Set(WIDE_DEVELOPMENT_SEEDS).size,768);
 assert.deepEqual(WIDE_DEVELOPMENT_SEEDS.slice(0,192),EXPERIMENT_VALIDATION_SEEDS);
 const tests=new Set([...LONG_TEST_SEEDS,...LONG_IMPROVEMENT_TEST_SEEDS,...LONG_FURTHER_TEST_SEEDS,...LONG_POST_FURTHER_TEST_SEEDS,...CONTINUATION_TEST_SEEDS,...FINAL_TEST_SEEDS]);
 assert.ok(WIDE_DEVELOPMENT_SEEDS.every(seed=>!tests.has(seed)));
 assert.ok(all.every(seed=>seed>0x3fffffff));
});
test("row-objective training exactly optimizes mean score and persists through continuation",()=>{
 const trainer=new Trainer({population:50,seed:593,trainingSeeds:3,profile:"robust-v2",observationVersion:5,
  fitnessObjective:"rows",fitnessRiskWeight:0,simulation:{curriculum:"roads",maxTicks:240,difficulty:1}});
 const generation=trainer.runGeneration();
 for(const genome of generation.contenders){
  const episodes=evaluateGenome(genome,generation.seeds,trainer.config.simulation);
  assert.equal(genome.fitness,mean(episodes.map(e=>e.score)));
 }
 const saved=trainer.checkpoint(),restored=Trainer.restore(parseCheckpoint(stringifyEvolution(saved)));
 assert.deepEqual(restored.runGeneration(),trainer.runGeneration());
 assert.deepEqual(restored.neat.save(),trainer.neat.save());
 Reflect.set(saved.config,"fitnessObjective","bogus");
 assert.throws(()=>parseCheckpoint(stringifyEvolution(saved)),/Invalid evaluator configuration/);
});
test("focused mutation changes only the declared neural control weights and persists through restore",()=>{
 const rng=new RNG(50391),tracker=new Innovations(),g=minimalGenome(1,rng,tracker,true,3);
 const before=structuredClone(g);
 const parameters:EvolutionParameters={weightMutationRate:1,weightMutationSigma:.3,weightResetRate:0,
  addNodeRate:0,addConnectionRate:0,toggleConnectionRate:0,crossoverRate:.3,parentFraction:.25,weightMutationScope:"action-control"};
 mutate(g,rng,tracker,true,parameters);
 let changed=0;
 for(const [i,c] of g.connections.entries()){
  const inScope=c.to>=OUTPUT_START&&c.to<OUTPUT_START+5&&
   (c.from===BIAS||c.from===GLOBAL_OFFSET||c.from===GLOBAL_OFFSET+3+c.to-OUTPUT_START);
  if(inScope){if(c.weight!==before.connections[i].weight)changed++;}
  else assert.equal(c.weight,before.connections[i].weight);
 }
 assert.ok(changed>0);
 const trainer=new Trainer({population:50,trainingSeeds:1,profile:"robust-v2",observationVersion:3,evolutionParameters:parameters,
  simulation:{curriculum:"roads",maxTicks:24,difficulty:1}});
 trainer.runGeneration();const saved=trainer.checkpoint();
 assert.deepEqual(Trainer.restore(parseCheckpoint(stringifyEvolution(saved))).runGeneration(),trainer.runGeneration());
 saved.config.evolutionParameters!.weightMutationScope="all";
 assert.throws(()=>parseCheckpoint(stringifyEvolution(saved)),/inconsistent evolution parameters/);
});
test("memory-only weight mutations retain the learned controller and resume natively",()=>{
 const rng=new RNG(50392),tracker=new Innovations(),g=minimalGenome(1,rng,tracker,true,7),before=structuredClone(g);
 const parameters:EvolutionParameters={weightMutationRate:1,weightMutationSigma:.5,weightResetRate:0,
  addNodeRate:0,addConnectionRate:0,toggleConnectionRate:0,crossoverRate:.3,parentFraction:.25,weightMutationScope:"memory-input"};
 mutate(g,rng,tracker,true,parameters);
 let changed=0;
 for(const [i,c]of g.connections.entries()){
  if(c.from===GLOBAL_OFFSET+9){if(c.weight!==before.connections[i].weight)changed++;}
  else assert.equal(c.weight,before.connections[i].weight);
 }
 assert.equal(changed,5);
 for(const version of [7,8] as const){
 const trainer=new Trainer({population:50,trainingSeeds:1,profile:"robust-v2",observationVersion:version,evolutionParameters:parameters,
  simulation:{curriculum:"roads",maxTicks:24,difficulty:1}});
 trainer.runGeneration();
 const restored=Trainer.restore(parseCheckpoint(stringifyEvolution(trainer.checkpoint())));
 assert.deepEqual(restored.runGeneration(),trainer.runGeneration());
 assert.deepEqual(restored.neat.save(),trainer.neat.save());
 }
});
