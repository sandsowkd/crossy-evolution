import assert from "node:assert/strict";
import { test } from "node:test";
import { sweptHit } from "../core/collision";
import { GameSimulation } from "../core/simulation";
import { RNG } from "../core/rng";
import { ACTIONS, TRAIN_START, type Config, type Row } from "../core/types";
import { Innovations, minimalGenome } from "../evolution/genome";
import { Network } from "../evolution/network";
import { sweptHit as referenceHit } from "./fixtures/reference-collision";
import { ReferenceSimulation } from "./fixtures/reference-simulation";

test("allocation-free scalar slabs match the frozen original at grazing, static and randomized boundaries", () => {
  const rng = new RNG(79340);
  for (let i = 0; i < 100000; i++) {
    const x0 = rng.range(-30, 30), y0 = rng.range(-4, 4),
      hx0 = rng.range(-35, 35), row = rng.int(9) - 4,
      length = i % 11 === 0 ? 1e-10 : rng.range(.01, 12);
    const args = [x0, y0, x0 + (i % 7 === 0 ? 0 : rng.range(-5, 5)),
      y0 + (i % 5 === 0 ? 0 : rng.range(-3, 3)), hx0,
      hx0 + (i % 3 === 0 ? 0 : rng.range(-40, 40)), row, length] as const;
    assert.equal(sweptHit(...args), referenceHit(...args));
  }
  for (const epsilon of [0, -Number.EPSILON, Number.EPSILON, -1e-12, 1e-12])
    for (const side of [-1, 1]) {
      const args = [side * (.5 + .22 + epsilon), .61 + epsilon,
        side * (.5 + .22 + epsilon), .61 + epsilon, 0, 0, 0, 1] as const;
      assert.equal(sweptHit(...args), referenceHit(...args));
    }
});

test("optimized road collisions match every frozen step across random states, extreme speeds, wraps and train reset edges", () => {
  const rng = new RNG(197541);
  for (let i = 0; i < 1600; i++) {
    const config: Config = { curriculum: i % 2 ? "roads" : "trains", maxTicks: 36000, difficulty: .1 + rng.next() * 2.9 };
    const seed = rng.int(0xffffffff), fast = new GameSimulation(config, seed),
      reference = new ReferenceSimulation(config, seed);
    const x = rng.int(9) - 4, row = rng.int(500), tick = rng.int(35985);
    for (const sim of [fast, reference]) {
      sim.agent.x = x; sim.agent.row = row; sim.agent.maxRow = row; sim.tick = tick;
    }
    if (i % 3 === 0) {
      const override: Partial<Row> = i % 6 === 0
        ? { type: "road", speed: rng.pick([-600, -20, -.000001, 0, .000001, 20, 600]),
          blocked: [], vehicles: [{ offset: rng.pick([-11.05, -10.95, -.00001, 0, .00001, 10.95, 11.05]), length: rng.pick([.01, 1.05, 1.85, 7]), variant: "car" }] }
        : { type: "rail", speed: rng.pick([-600, -20, 20, 600]),
          blocked: [], phase: 0, period: .2, length: rng.range(.1, 10) };
      for (const sim of [fast, reference]) {
        Object.assign(sim.world.row(row), structuredClone(override));
        if (override.type === "rail") sim.world.row(row).phase = (TRAIN_START - 4) / Math.abs(override.speed!);
      }
    }
    for (let step = 0; step < 8; step++) {
      const action = rng.pick(ACTIONS);
      assert.deepEqual(fast.step(action, false), reference.step(action, false));
      assert.deepEqual(fast.agent, reference.agent);
      assert.equal(fast.tick, reference.tick);
    }
    assert.deepEqual(fast.getState(), reference.getState());
  }
});

test("frozen and optimized physics produce identical neural traces for all four sensor versions", () => {
  const rng = new RNG(743193), tracker = new Innovations();
  for (const version of [1, 2, 3, 4] as const)
    for (let i = 0; i < 24; i++) {
      const genome = minimalGenome(i, rng, tracker, true, version === 1 ? undefined : version),
        a = new Network(genome), b = new Network(genome),
        config: Config = { curriculum: i % 2 ? "roads" : "trains", maxTicks: 1800, difficulty: 1 },
        seed = rng.int(0xffffffff), fast = new GameSimulation(config, seed),
        reference = new ReferenceSimulation(config, seed);
      while (fast.agent.alive) {
        const oa = fast.getObservation(version, a.requiredInputs), ob = reference.getObservation(version, b.requiredInputs);
        assert.deepEqual(oa, ob);
        const action = a.decide(oa), expected = b.decide(ob);
        assert.deepEqual(a.scores, b.scores); assert.equal(action, expected);
        assert.deepEqual(fast.step(action, false), reference.step(expected, false));
        assert.deepEqual(fast.agent, reference.agent); assert.equal(fast.tick, reference.tick);
      }
      assert.deepEqual(fast.getState(), reference.getState());
    }
});
test("whole-hop clear paths preserve partial timeout positions and conservative grazing contacts",()=>{
 for(const remaining of [...Array.from({length:12},(_,i)=>i+1),.5,1.5])for(const action of ACTIONS){
  const config:Config={curriculum:"roads",maxTicks:36000,difficulty:1};
  const fast=new GameSimulation(config,31),reference=new ReferenceSimulation(config,31);
  for(const sim of [fast,reference]){
   sim.tick=36000-remaining;sim.agent.x=.25;sim.agent.row=4.125;sim.agent.maxRow=4;
   for(let row=2;row<=7;row++)Object.assign(sim.world.row(row),{type:"road",blocked:[],speed:0,vehicles:[]});
  }
  assert.deepEqual(fast.step(action,false),reference.step(action,false));
  assert.deepEqual(fast.agent,reference.agent);assert.equal(fast.tick,reference.tick);
 }
 for(const epsilon of [-1e-8,-1e-12,0,1e-12,1e-8])for(const speed of [-1e-9,0,1e-9]){
  const fast=new GameSimulation({maxTicks:36000},32),reference=new ReferenceSimulation({maxTicks:36000},32);
  for(const sim of [fast,reference]){
   sim.agent.row=4;sim.agent.maxRow=4;
   for(let row=2;row<=6;row++)Object.assign(sim.world.row(row),{type:"grass",blocked:[],vehicles:[]});
   Object.assign(sim.world.row(4),{type:"road",speed,vehicles:[{offset:.5+.22+epsilon,length:1,variant:"car"}]});
  }
  assert.deepEqual(fast.step("WAIT",false),reference.step("WAIT",false));
  assert.deepEqual(fast.agent,reference.agent);assert.equal(fast.tick,reference.tick);
 }
});
