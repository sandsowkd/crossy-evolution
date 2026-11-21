import test from "node:test";
import assert from "node:assert/strict";
import { World, hazardsAt, signalAt } from "../core/world";
import { VARIANT_TWO_CONFIG, UPSTREAM_VARIANT_TWO_CONFIG, platformsAt } from "../core/upstream";
import { VARIANT_TWO_RULES, scheduledTrainSignal } from "../core/variant-two-rules";
import { GameSimulation } from "../core/simulation";

test("mixed maps allow five water/log rows, cap direction streaks and enforce meaningful speed differences", () => {
  const counts = {rows:0, logs:0, lilies:0, positive:0, fiveWater:0, fiveLogs:0};
  for (let seed = 0; seed < 180; seed++) {
    const world = new World(seed, VARIANT_TWO_CONFIG);
    let waters = 0, roads = 0, logs = 0, same = 0, previous = 0;
    for (let index = 0; index < 400; index++) {
      const row = world.row(index); counts.rows++;
      waters = row.type === "water" ? waters + 1 : 0;
      roads = row.type === "road" ? roads + 1 : 0;
      assert.ok(waters <= 5); assert.ok(roads <= 3);
      if (waters === 5) counts.fiveWater++;
      assert.equal(row.blocked.includes(0), false);
      if (row.platforms?.[0]?.kind === "log") {
        counts.logs++; if (row.speed > 0) counts.positive++;
        assert.ok(Math.abs(row.speed) >= 1.2 && Math.abs(row.speed) <= 4.2);
        assert.ok(row.platforms.every(p => p.speed === row.speed));
        if (logs) assert.ok(Math.abs(Math.abs(row.speed) - Math.abs(previous)) >= .8 - 1e-12);
        same = logs && Math.sign(previous) === Math.sign(row.speed) ? same + 1 : 1;
        assert.ok(same <= 2); logs++; if (logs === 5) counts.fiveLogs++;
        previous = row.speed;
      } else { logs = 0; same = 0; previous = 0; }
      if (row.platforms?.[0]?.kind === "lily") {
        counts.lilies++;
        assert.ok(row.platforms.some(p => p.offset === 0 && p.speed === 0));
        assert.equal(new Set(row.platforms.map(p => p.offset)).size, row.platforms.length);
        for (const neighbor of [index - 1, index + 1]) assert.equal(world.row(neighbor).blocked.includes(0), false);
      }
    }
  }
  assert.ok(counts.fiveWater > 0 && counts.fiveLogs > 0, JSON.stringify(counts));
  assert.ok(counts.positive / counts.logs > .47 && counts.positive / counts.logs < .53, JSON.stringify(counts));
  assert.ok(counts.lilies > 1000);
});

test("train arrivals are sparse, irregular, independent by track and shared by signals, hazards and physics", () => {
  const world = new World(42, VARIANT_TWO_CONFIG);
  const rails = Array.from({length:500}, (_, i) => world.row(i)).filter(r => r.type === "rail");
  assert.ok(rails.length > 20);
  const firstArrivals = new Set<number>(), gaps = new Set<number>();
  for (const row of rails) {
    const times = row.trainSchedule!.arrivals; firstArrivals.add(times[0]);
    assert.ok(times[0] >= 360 && times[0] <= 1080);
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i-1]; gaps.add(gap); assert.ok(gap >= 720 && gap <= 1440);
    }
    const tick = times[0], train = hazardsAt(row, tick)[0];
    assert.equal(train.x, 0); assert.equal(signalAt(row, tick), true);
    assert.equal(hazardsAt(row, tick - 138).length, 0);
    assert.equal(hazardsAt(row, tick + 138).length, 0);
    assert.equal(hazardsAt(row, tick + 300).length, 0);
    assert.equal(signalAt(row, tick - 121), false); assert.equal(signalAt(row, tick - 120), true);
    assert.equal(scheduledTrainSignal(row, tick - 120).phase, 0);
    assert.equal(scheduledTrainSignal(row, tick - 108).phase, 1);
    const sim = new GameSimulation(VARIANT_TWO_CONFIG, 42);
    sim.agent.row = row.index; sim.agent.maxRow = row.index; sim.agent.lastProgressTick = tick - 1;
    sim.tick = tick - 1; sim.step("WAIT", false);
    assert.equal(sim.agent.deathReason, "train");
  }
  assert.ok(firstArrivals.size > rails.length * .8); assert.ok(gaps.size > 100);
  // No common 276-tick train wrap schedule is used by the new rules.
  assert.equal(VARIANT_TWO_RULES.trainArrivalGapTicks[0] > 276 * 2, true);
});

test("new rules are independent of row query order, cache eviction and renderer; old experiments retain their clock", () => {
  const a = new World(57, VARIANT_TWO_CONFIG), b = new World(57, VARIANT_TWO_CONFIG);
  const rows = Array.from({length:300}, (_, i) => structuredClone(a.row(i)));
  for (let i = 299; i >= 0; i--) assert.deepEqual(b.row(i), rows[i]);
  for (let i = 0; i < 300; i++) assert.deepEqual(a.row(i), rows[i]);
  const old = new World(42, UPSTREAM_VARIANT_TWO_CONFIG);
  assert.equal(old.row(8).trainSchedule, undefined);
  assert.equal(hazardsAt(old.row(8), 100)[0].x, -80);
  assert.equal(old.row(7).platforms![0].kind, "log");
});

test("lily center is usable, log carry uses the generated speed, and inactivity still kills", () => {
  const world = new World(42, VARIANT_TWO_CONFIG), rows = Array.from({length:100}, (_, i) => world.row(i));
  const lily = rows.find(r => r.platforms?.[0]?.kind === "lily")!;
  const onLily = new GameSimulation(VARIANT_TWO_CONFIG, 42);
  Object.assign(onLily.agent, {row:lily.index, maxRow:lily.index, x:0});
  onLily.step("WAIT", false); assert.equal(onLily.agent.alive, true); assert.equal(onLily.agent.x, 0);
  while (onLily.agent.alive) onLily.step("WAIT", false);
  assert.equal(onLily.agent.deathReason, "eagle"); assert.equal(onLily.tick, 600);
  const log = rows.find(r => r.platforms?.[0]?.kind === "log")!;
  const p = platformsAt(log, 180).sort((a,b) => Math.abs(a.x) - Math.abs(b.x))[0];
  const rider = new GameSimulation(VARIANT_TWO_CONFIG, 42); rider.tick = 180;
  Object.assign(rider.agent, {row:log.index, maxRow:log.index, x:p.x, lastProgressTick:180});
  rider.step("WAIT", false);
  assert.equal(rider.agent.alive, true); assert.ok(Math.abs(rider.agent.x - p.x - log.speed * .2) < 1e-9);
});
