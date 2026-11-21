import assert from "node:assert/strict";
import { test } from "node:test";
import { INPUT_COUNT } from "../core/observation";
import { RNG } from "../core/rng";
import { GameSimulation } from "../core/simulation";
import { ACTIONS, type Config } from "../core/types";
import { episode, evaluateGenome, type Trace } from "../evolution/evaluation";
import { Innovations, minimalGenome, mutate } from "../evolution/genome";
import { Network } from "../evolution/network";
import { Replay } from "../evolution/replay";

test("sparse sensor encoding is bit-exact on requested channels for all sensor versions and terrain", () => {
  const rng = new RNG(59127);
  const masks = [
    new Uint8Array(INPUT_COUNT).fill(1),
    Uint8Array.from({ length: INPUT_COUNT }, () => +(rng.next() < .13)),
    new Uint8Array(INPUT_COUNT),
  ];
  const buffers=masks.map(()=>new Float32Array(INPUT_COUNT).fill(NaN));
  for (const curriculum of ["roads", "trains"] as const)
    for (const version of [1, 2, 3, 4, 5, 6, 7, 8] as const)
      for (let i = 0; i < 60; i++) {
        const sim = new GameSimulation({ curriculum, maxTicks: 36000, difficulty: .7 + rng.next() * 1.7 }, rng.int(0xffffffff));
        sim.agent.x = i % 4 === 0 ? -4 : i % 4 === 1 ? 4 : rng.range(-4, 4);
        sim.agent.row = i % 5 === 0 ? 0 : rng.range(0, 240);
        sim.agent.lastAction = ACTIONS[i % ACTIONS.length];
        sim.agent.blocked = i % 2 === 0;
        sim.tick = rng.int(36000);
        const dense = sim.getObservation(version);
        for (const [m,mask] of masks.entries()) {
          const sparse = sim.getObservation(version, mask);
          const reused=sim.getObservation(version,mask,buffers[m]);
          assert.equal(reused,buffers[m]);
          assert.deepEqual(reused,sparse);
          for (let c = 0; c < INPUT_COUNT; c++)
            assert.equal(sparse[c], mask[c] ? dense[c] : 0,
              `version=${version}, terrain=${curriculum}, state=${i}, channel=${c}`);
        }
      }
  const sim = new GameSimulation();
  assert.throws(() => sim.getObservation(1, new Uint8Array(3)), /mask/);
  assert.throws(() => sim.getObservation(1,undefined,new Float32Array(3)), /buffer/);
  const snapshot=sim.getObservation(3),before=snapshot.slice();
  sim.tick=197;sim.agent.x=3;sim.getObservation(3);
  assert.deepEqual(snapshot,before);
});
test("general episode callbacks retain distinct observation arrays unless reuse is explicitly requested",()=>{
 const observations:Float32Array[]=[];
 episode(o=>{observations.push(o);return "WAIT";},1,{maxTicks:60});
 assert.equal(observations.length,5);
 assert.equal(new Set(observations).size,observations.length);
});

test("network input mask follows enabled graph edges and preserves all scores and actions", () => {
  const rng = new RNG(713), tracker = new Innovations();
  for (const version of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    const genome = minimalGenome(1, rng, tracker, true, version === 1 ? undefined : version);
    for (let i = 0; i < 15; i++) mutate(genome, rng, tracker, true);
    const denseNetwork = new Network(genome), sparseNetwork = new Network(genome);
    for (let i = 0; i < INPUT_COUNT; i++)
      assert.equal(sparseNetwork.requiredInputs[i], +genome.connections.some((c) => c.enabled && c.from === i));
    const sim = new GameSimulation({ curriculum: "trains", maxTicks: 1200 }, 71939);
    for (let i = 0; i < 100; i++) {
      const dense = sim.getObservation(version), sparse = sim.getObservation(version, sparseNetwork.requiredInputs);
      assert.equal(denseNetwork.decide(dense), sparseNetwork.decide(sparse));
      assert.deepEqual(sparseNetwork.scores, denseNetwork.scores);
      assert.deepEqual(sparseNetwork.values, denseNetwork.values.map((v, id) =>
        id < INPUT_COUNT && !sparseNetwork.requiredInputs[id] ? 0 : v));
      // Sample diverse states independently of a weak fixture policy's lifetime.
      sim.agent.x = rng.int(9) - 4; sim.agent.row = rng.int(250); sim.tick = rng.int(36000);
    }
  }
});

test("sparse training episodes match dense traces and renderer replay exactly", () => {
  const rng = new RNG(63289), tracker = new Innovations();
  for (const version of [1, 2, 3, 4, 5, 6, 7, 8] as const)
    for (let i = 0; i < 6; i++) {
      const genome = minimalGenome(i, rng, tracker, true, version === 1 ? undefined : version);
      for (let j = 0; j < 8; j++) mutate(genome, rng, tracker, true);
      const config: Config = { curriculum: i % 2 ? "roads" : "trains", maxTicks: 1800, difficulty: 1 };
      const seed = rng.int(0xffffffff), network = new Network(genome), trace: Trace[] = [];
      const dense = episode((o) => network.decide(o), seed, config, trace, network);
      const [sparse] = evaluateGenome(genome, [seed], config);
      assert.deepEqual(sparse, dense);
      const replay = new Replay([genome], seed, config);
      const sparseSim = new GameSimulation(config, seed), sparseNetwork = new Network(genome);
      for (const frame of trace) {
        const o = sparseSim.getObservation(version, sparseNetwork.requiredInputs);
        const action = sparseNetwork.decide(o);
        assert.ok(ACTIONS.includes(action));
        assert.equal(action, frame.action);
        assert.deepEqual(Array.from(sparseNetwork.scores), frame.scores);
        for (let c = 0; c < INPUT_COUNT; c++)
          if (sparseNetwork.requiredInputs[c]) assert.equal(o[c], frame.observation[c]);
        sparseSim.step(action, false); replay.advance();
        assert.deepEqual(sparseSim.agent, replay.current.sim.agent);
        assert.equal(sparseSim.tick, replay.current.sim.tick);
      }
      assert.ok(replay.finished);
      assert.equal(replay.current.sim.agent.maxRow, dense.score);
      assert.equal(replay.current.sim.tick, dense.ticks);
      // Asking for a trace must continue to record the complete dense observation.
      const first = new GameSimulation(config, seed).getObservation(version);
      assert.deepEqual(trace[0].observation, Array.from(first));
    }
});
