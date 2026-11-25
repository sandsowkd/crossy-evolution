import { test } from "node:test";
import assert from "node:assert/strict";
import { FRONT_PACK_ROWS, PopulationCamera, populationDensity, populationFrame, SINGLE_CHICKEN_OPACITY,
  type DensityGroup } from "../visualization/population-density";
import { Replay } from "../evolution/replay";
import { Trainer } from "../evolution/trainer";
import { DEFAULT_CONFIG } from "../core/types";
import type { SceneAgent } from "../visualization/three/scene";

function flock(sizes: number[]) {
  let id = 0;
  return sizes.flatMap((size, x) => Array.from({ length: size }, () => ({ id: id++, x, row: 0, alive: true })));
}

test("density preserves all living chickens, merges overlaps once and normalizes every tied maximum", () => {
  const agents: SceneAgent[] = [...flock([12, 6, 1, 12]), { id: 999, x: 2, row: 0, alive: false }];
  const { groups, largest, alive } = populationDensity(agents);
  assert.equal(alive, 31);
  assert.equal(largest, 12);
  assert.equal(groups.length, 4);
  assert.deepEqual(groups.map(group => group.populationCount), [12, 6, 1, 12]);
  assert.equal(groups[0].opacity, 1);
  assert.equal(groups[3].opacity, 1);
  assert.equal(groups[2].opacity, SINGLE_CHICKEN_OPACITY);
  assert.ok(groups[1].opacity! > groups[2].opacity! && groups[1].opacity! < 1);
  assert.equal(agents[0].opacity, undefined, "Presentation must not mutate simulation snapshots");
});

test("singletons tied for largest stay solid; empty populations have no ghost chickens", () => {
  assert.ok(populationDensity(flock([1, 1, 1])).groups.every(group => group.opacity === 1));
  assert.deepEqual(populationDensity([]), { groups: [], largest: 0, alive: 0 });
});

test("diverging sub-tile hops separate immediately while matching rendered heights merge", () => {
  const agents = flock([3]);
  const { groups } = populationDensity([
    { ...agents[0], x: .001 }, { ...agents[1], hop: .5 }, agents[2],
  ]);
  assert.equal(groups.length, 3);
  assert.equal(populationDensity([{ ...agents[0], hop: 0 }, { ...agents[1], hop: 1 }]).groups.length, 1);
});

test("population frames count living chickens behind the previous focus and follow the largest group", () => {
  const trainer = new Trainer({ population: 50, simulation: { ...DEFAULT_CONFIG, maxTicks: 24 } });
  const replay = new Replay(trainer.neat.population, 42, trainer.config.simulation);
  // A lone leader must not hide the 49 chickens far behind it.
  replay.agents[0].sim.agent.row = 100;
  replay.agents[0].previous.row = 100;
  const first = populationFrame(replay);
  assert.equal(first.population.alive, 50);
  assert.equal(first.population.largest, 49);
  assert.equal(first.focus, 0);
  assert.equal(first.agents.find(agent => agent.populationCount === 1)?.opacity, SINGLE_CHICKEN_OPACITY);
  const states = replay.agents.map(agent => structuredClone(agent.sim.agent));
  populationFrame(replay, .5);
  assert.deepEqual(replay.agents.map(agent => agent.sim.agent), states);
  replay.agents.forEach(agent => { agent.sim.agent.alive = false; });
  assert.equal(populationFrame(replay).agents.length, 0);
});

test("the 10-second rule ends stalled chickens, counts eagle deaths and omits eagle animation", () => {
  const trainer = new Trainer({ population: 50, simulation: { ...DEFAULT_CONFIG, maxTicks: 1800,
    eagle: { afterTicks: 600, warningTicks: 0 } } });
  const replay = new Replay(trainer.neat.population, 42, trainer.config.simulation);
  for (let i = 0; i < 49; i++) replay.advance("WAIT");
  const before = populationFrame(replay);
  assert.equal(before.population.alive, 50);
  assert.equal(before.population.eagleDeaths, 0);
  assert.ok(before.agents.every(agent => agent.eagle === undefined));
  replay.advance("WAIT");
  const after = populationFrame(replay);
  assert.equal(after.population.alive, 0);
  assert.equal(after.population.eagleDeaths, 50);
  assert.equal(after.agents.length, 0);
  assert.equal(replay.finished, true);
  assert.ok(replay.agents.every(agent => agent.sim.tick === 600));
});

function cameraGroup(id: number, count: number, row = 0): DensityGroup {
  return { id, populationCount: count, memberIds: Array.from({ length: count }, (_, i) => id + i),
    x: 0, row, alive: true };
}

test("bloodline camera selects the densest group within ten rows, ignoring a larger distant crowd", () => {
  const camera = new PopulationCamera(FRONT_PACK_ROWS);
  assert.equal(camera.follow([cameraGroup(0, 100, 70), cameraGroup(200, 2, 100),
    cameraGroup(300, 8, 90), cameraGroup(400, 20, 89.99)], 0, 0), 300);
});

test("front-pack membership and density take priority over old targets and switch caps", () => {
  const camera = new PopulationCamera(FRONT_PACK_ROWS);
  assert.equal(camera.follow([cameraGroup(0, 20, 95), cameraGroup(100, 2, 100)], 0, 0), 0);
  assert.equal(camera.follow([cameraGroup(0, 20, 95), cameraGroup(100, 2, 106)], 0, 10), 100,
    "An interpolated frame must replace a target outside the band, even in the same decision");
  for (let decision = 1; decision < 6; decision++) {
    const first = decision % 2 === 0;
    assert.equal(camera.follow([cameraGroup(0, first ? 21 : 20, 100),
      cameraGroup(100, first ? 20 : 21, 106)], decision, decision * 20), first ? 0 : 100);
  }
});

test("front-pack ties retain a living member, and a dead target is replaced", () => {
  const camera = new PopulationCamera(FRONT_PACK_ROWS);
  assert.equal(camera.follow([cameraGroup(0, 8, 95), cameraGroup(100, 8, 100)], 0, 0), 100);
  assert.equal(camera.follow([cameraGroup(0, 8, 101), cameraGroup(100, 8, 100)], 1, 100), 100);
  assert.equal(camera.follow([cameraGroup(0, 8, 101)], 2, 200), 0);
});

test("bloodline frames make the followed front group opaque without changing simulation", () => {
  const trainer = new Trainer({ population: 50, simulation: { ...DEFAULT_CONFIG, maxTicks: 24 } });
  const replay = new Replay(trainer.neat.population, 42, trainer.config.simulation);
  for (const [index, agent] of replay.agents.entries()) {
    agent.sim.agent.row = agent.previous.row = index < 40 ? 0 : index < 49 ? 95 : 100;
  }
  const states = replay.agents.map(agent => structuredClone(agent.sim.agent));
  const snapshot = populationFrame(replay, .5, 0, true);
  assert.equal(snapshot.focus, 95);
  assert.equal(snapshot.agents.find(group => group.memberIds.includes(replay.selected))?.opacity, 1);
  assert.equal(snapshot.population.alive, 50);
  assert.deepEqual(replay.agents.map(agent => agent.sim.agent), states);
});

test("camera holds ties and one-chicken deficits, then switches on a two-chicken gap", () => {
  const camera = new PopulationCamera();
  assert.equal(camera.follow([cameraGroup(0, 12), cameraGroup(100, 10, 20)], 0, 0), 0);
  assert.equal(camera.follow([cameraGroup(0, 10), cameraGroup(100, 10, 20)], 1, 100), 0);
  assert.equal(camera.follow([cameraGroup(0, 10), cameraGroup(100, 11, 20)], 2, 200), 0);
  assert.equal(camera.follow([cameraGroup(0, 9), cameraGroup(100, 11, 20)], 3, 300), 100);
});

test("when a new target is needed, equal densities favor the farthest forward current row", () => {
  const camera = new PopulationCamera();
  assert.equal(camera.follow([cameraGroup(0, 12, 8), cameraGroup(100, 12, 20)], 0, 0), 100);
  assert.equal(camera.follow([cameraGroup(0, 12, 30), cameraGroup(100, 12, 20)], 1, 100), 100);
  assert.equal(camera.follow([cameraGroup(0, 15, 30), cameraGroup(100, 10, 20), cameraGroup(200, 15, 40)], 2, 200), 200);
});

test("voluntary switches are capped at two in a rolling five viewing seconds, including fast playback", () => {
  const camera = new PopulationCamera();
  const aLeads = [cameraGroup(0, 20), cameraGroup(100, 8)];
  const bLeads = [cameraGroup(0, 8), cameraGroup(100, 20)];
  assert.equal(camera.follow(aLeads, 0, 0), 0);
  assert.equal(camera.follow(bLeads, 150, 100), 100);
  assert.equal(camera.follow(aLeads, 300, 200), 0);
  assert.equal(camera.follow(bLeads, 450, 300), 0);
  assert.equal(camera.follow(bLeads, 600, 5099), 0);
  assert.equal(camera.follow(bLeads, 601, 5100), 100);
  assert.equal(camera.follow(aLeads, 602, 5150), 100);
  assert.equal(camera.follow(aLeads, 603, 5200), 0);
});

test("target death bypasses the cap but does not spend or reset voluntary switches", () => {
  const camera = new PopulationCamera();
  assert.equal(camera.follow([cameraGroup(0, 20), cameraGroup(100, 8)], 0, 0), 0);
  assert.equal(camera.follow([cameraGroup(0, 8), cameraGroup(100, 20)], 1, 100), 100);
  assert.equal(camera.follow([cameraGroup(0, 20), cameraGroup(100, 8)], 2, 200), 0);
  assert.equal(camera.follow([cameraGroup(100, 20)], 3, 300), 100, "Dead target is replaced immediately");
  assert.equal(camera.follow([cameraGroup(100, 8), cameraGroup(200, 20)], 4, 400), 100, "Death must not clear the cap");
  assert.equal(camera.follow([cameraGroup(200, 20)], 5, 500), 200, "Another death still bypasses the cap");
  assert.equal(camera.follow([cameraGroup(100, 20), cameraGroup(200, 8)], 6, 5100), 100,
    "Forced replacement must not consume the newly available voluntary slot");
});

test("merging into a group with a different glyph representative keeps the tracked chicken", () => {
  const camera = new PopulationCamera();
  assert.equal(camera.follow([cameraGroup(100, 20), cameraGroup(0, 8)], 0, 0), 100);
  const merged = cameraGroup(0, 22);
  merged.memberIds.push(100);
  assert.equal(camera.follow([merged, cameraGroup(200, 22, 30)], 1, 100), 100);
  assert.equal(camera.follow([cameraGroup(100, 21), cameraGroup(200, 22, 30)], 2, 200), 100);
});

test("render calls do not switch between decision boundaries; rewinding resets the target and budget", () => {
  const camera = new PopulationCamera();
  const aLeads = [cameraGroup(0, 20), cameraGroup(100, 8)];
  const bLeads = [cameraGroup(0, 8), cameraGroup(100, 20)];
  assert.equal(camera.follow(aLeads, 10, 0), 0);
  assert.equal(camera.follow(bLeads, 10, 100), 0);
  assert.equal(camera.follow(bLeads, 11, 200), 100);
  assert.equal(camera.follow(aLeads, 12, 300), 0);
  assert.equal(camera.follow(bLeads, 13, 400), 0);
  assert.equal(camera.follow(bLeads, 0, 500), 100);
  assert.equal(camera.follow(aLeads, 1, 600), 0);
});

test("population frame follows member coordinates after merging, and restarting resets camera tracking", () => {
  const trainer = new Trainer({ population: 50, simulation: { ...DEFAULT_CONFIG, maxTicks: 24 } });
  const replay = new Replay(trainer.neat.population, 42, trainer.config.simulation);
  for (const agent of replay.agents.slice(0, 10)) {
    agent.sim.agent.row = agent.previous.row = 5;
  }
  populationFrame(replay, 1, 0);
  assert.equal(replay.selected, 10);
  // A lower-index member joins: the glyph ID becomes 0, but target 10 survives.
  replay.agents[0].sim.agent.row = replay.agents[0].previous.row = 0;
  replay.decisions = 1;
  populationFrame(replay, 1, 100);
  assert.equal(replay.selected, 10);
  assert.equal(populationFrame(replay, .5, 200).focus, 0);
  replay.seek(0);
  populationFrame(replay, 1, 300);
  assert.equal(replay.selected, 0);
});
