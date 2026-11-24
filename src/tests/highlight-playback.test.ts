import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { followCameraAxis, MAX_CAMERA_LAG } from "../visualization/camera-follow";
import { highlightReplayConfig, highlightTimeline, highlightJumpTarget, highlightBestScore, HIGHLIGHT_SPEEDS,
  highlightAutomaticSpeed, highlightAutoSpeedPlan, type HighlightAutoSpeedPlan,
  HIGHLIGHT_REPLAY_OPTIONS } from "../visualization/highlight-playback";
import { Replay } from "../evolution/replay";
import { parseEvolution } from "../evolution/serialization";
import { type Genome, BIAS, OUTPUT_START } from "../evolution/genome";
import { DEFAULT_CONFIG, HOP_TICKS, type Config } from "../core/types";

const manifest = parseEvolution<{ entries: { genome: Genome; config: Config; populationReplayDecisions: number;
  automaticPlayback: HighlightAutoSpeedPlan }[] }>(
  fs.readFileSync(new URL("../../public/highlights.json", import.meta.url), "utf8"));

test("highlight camera stays over loaded terrain at every speed through 500x, even with a low frame rate", () => {
  for (const fps of [10, 30, 60, 144]) for (const speed of HIGHLIGHT_SPEEDS) {
    let camera = 0;
    for (let frame = 1; frame <= fps * 10; frame++) {
      const focus = frame / fps * speed * 5;
      // The renderer constrains the camera before old terrain is removed.
      camera = -followCameraAxis(-camera, -focus, 0);
      const firstRow = Math.floor(focus) - HIGHLIGHT_REPLAY_OPTIONS.terrainBehind;
      const lastRow = Math.floor(focus) + HIGHLIGHT_REPLAY_OPTIONS.terrainAhead;
      assert.ok(Math.abs(camera - focus) <= MAX_CAMERA_LAG + 1e-10);
      assert.ok(firstRow < camera - 8 && lastRow > camera + 12,
        `Camera viewport left loaded rows at ${speed}x / ${fps}fps`);
      camera = -followCameraAxis(-camera, -focus, 1 / fps);
    }
  }
});

test("camera smoothing is time-based, and distant target changes cut straight to loaded terrain", () => {
  const sample = (fps: number) => {
    let current = 0;
    for (let frame = 0; frame < fps; frame++) current = followCameraAxis(current, 1, 1 / fps);
    return current;
  };
  assert.ok(Math.abs(sample(30) - sample(144)) < 1e-12);
  assert.equal(followCameraAxis(0, -1800, 0), -1800);
  assert.equal(followCameraAxis(-1800, -25, .016), -25);
});

test("efficient playback preserves actual archived policies' neural scores, actions, deaths and seeks", () => {
  for (const entry of manifest.entries) {
    const config = highlightReplayConfig(entry.config);
    const dense = new Replay([entry.genome], 42, config);
    const efficient = new Replay([entry.genome], 42, config, HIGHLIGHT_REPLAY_OPTIONS);
    for (let decision = 0; decision < 600 && !dense.finished; decision++) {
      dense.advance(); efficient.advance();
      assert.deepEqual(efficient.current.sim.agent, dense.current.sim.agent);
      assert.equal(efficient.current.sim.tick, dense.current.sim.tick);
      assert.deepEqual(efficient.current.network.scores, dense.current.network.scores);
    }
    efficient.seek(20); dense.seek(20);
    assert.deepEqual(efficient.current.sim.agent, dense.current.sim.agent);
    assert.equal(efficient.current.sim.tick, dense.current.sim.tick);
    assert.ok(efficient.current.observationBuffer);
    const snapshot = efficient.snapshot();
    assert.equal(snapshot.rows.at(-1)?.index, Math.floor(snapshot.focus) + HIGHLIGHT_REPLAY_OPTIONS.terrainAhead);
  }
});

test("highlight playback continues past 600 seconds without changing the archived timeout", () => {
  const archived = { ...DEFAULT_CONFIG, maxTicks: 36000 };
  const original = structuredClone(archived);
  const config = highlightReplayConfig(archived);
  const genome = structuredClone(manifest.entries[0].genome);
  genome.connections = genome.connections.filter(edge => edge.from === BIAS)
    .map(edge => ({ ...edge, enabled: true, weight: +(edge.to === OUTPUT_START) }));
  const replay = new Replay([genome], 42, config, HIGHLIGHT_REPLAY_OPTIONS);
  for (let decision = 0; decision < 3005; decision++) {
    // A clear test corridor isolates the episode deadline from traffic deaths.
    const sim = replay.current.sim;
    for (let row = sim.agent.row - 1; row <= sim.agent.row + 2; row++) {
      const terrain = sim.world.row(row); terrain.type = "grass"; terrain.blocked = [];
    }
    replay.advance();
  }
  assert.ok(replay.current.sim.tick > 36000);
  assert.equal(replay.current.sim.tick / 60, 601);
  assert.equal(replay.current.sim.agent.alive, true);
  assert.equal(replay.current.sim.agent.deathReason, undefined);
  assert.deepEqual(archived, original);
  assert.deepEqual(config.eagle, { afterTicks: 600, warningTicks: 0 });
});

test("the fixed timeline never moves backward or reaches its end before the final death", () => {
  const end = 12571;
  let previous = -1;
  for (let decision = 0; decision <= end; decision++) {
    const timeline = highlightTimeline(decision, end);
    assert.equal(timeline.max, end);
    assert.equal(timeline.value, decision);
    assert.ok(timeline.percent >= previous);
    if (decision < end) assert.ok(timeline.percent < 100);
    previous = timeline.percent;
  }
  assert.equal(highlightTimeline(end, end).percent, 100);
  assert.equal(highlightTimeline(0, end).percent, 0);
  assert.ok(highlightTimeline(0, 0).max > 0, "Loading must never create an invalid range");
});

test("every exported highlight has a complete, fixed population timeline at load time", () => {
  assert.equal(manifest.entries.length, 6);
  for (const entry of manifest.entries) {
    assert.ok(Number.isInteger(entry.populationReplayDecisions));
    assert.ok(entry.populationReplayDecisions > 0);
    assert.equal(highlightTimeline(0, entry.populationReplayDecisions).max,
      highlightTimeline(entry.populationReplayDecisions, entry.populationReplayDecisions).max);
  }
});

test("scaled jumps advance from the current time by 5, 50, 500 and 2500 seconds", () => {
  const replay = new Replay([manifest.entries[0].genome], 42, highlightReplayConfig(DEFAULT_CONFIG), HIGHLIGHT_REPLAY_OPTIONS);
  // Manual forward hops through a clear corridor isolate jump timing from deaths.
  const advanceTo = (target: number) => {
    while (replay.decisions < target && !replay.finished) {
      const sim = replay.current.sim;
      for (let row = sim.agent.row - 1; row <= sim.agent.row + 2; row++) {
        const terrain = sim.world.row(row); terrain.type = "grass"; terrain.blocked = [];
      }
      replay.advance("UP");
    }
  };
  advanceTo(10);
  for (const [speed, expectedSeconds] of [[1, 5], [10, 50], [100, 500], [500, 2500]]) {
    const before = replay.current.sim.tick;
    advanceTo(highlightJumpTarget(replay.decisions, speed));
    assert.equal((replay.current.sim.tick - before) / 60, expectedSeconds);
  }
  assert.equal(replay.current.sim.tick / 60, 3057);
});

test("best score keeps a dead leader's record, increases only when passed, and survives rewinding", () => {
  const replay = new Replay([manifest.entries[0].genome, manifest.entries[1].genome], 42,
    highlightReplayConfig(DEFAULT_CONFIG));
  replay.agents[0].sim.agent.maxRow = 200;
  replay.agents[0].sim.agent.alive = false;
  replay.agents[1].sim.agent.maxRow = 120;
  let record = highlightBestScore(replay);
  assert.equal(record, 200);
  replay.selected = 1;
  replay.agents[1].sim.agent.maxRow = 199;
  assert.equal(highlightBestScore(replay, record), 200);
  replay.agents[1].sim.agent.maxRow = 201;
  record = highlightBestScore(replay, record);
  assert.equal(record, 201);
  replay.seek(0);
  assert.equal(highlightBestScore(replay, record), 201, "Scrubbing back keeps the record");
  assert.equal(highlightBestScore(replay, 0), 0, "Restart can explicitly reset the record");
});

test("automatic playback spends five viewing seconds at 1x, 10x and 100x before reaching 500x, then slows for the ending", () => {
  const plan = { finalGenomeId: 1, finalScore: 10000, slowAtDecision: 10000, finishAtDecision: 11000 };
  for (const [decision, speed] of [[0, 1], [24, 1], [25, 10], [274, 10], [275, 100],
    [2774, 100], [2775, 500], [9999, 500], [10000, 10], [10999, 10], [11000, 1], [12000, 1], [0, 1]]) {
    assert.equal(highlightAutomaticSpeed(decision, plan), speed, `At decision ${decision}`);
  }
  const viewingSeconds = new Map<number, number>();
  for (let decision = 0; decision < 2775; decision++) {
    const speed = highlightAutomaticSpeed(decision, plan);
    viewingSeconds.set(speed, (viewingSeconds.get(speed) ?? 0) + HOP_TICKS / 60 / speed);
  }
  for (const [speed, duration] of [[1, 5], [10, 5], [100, 5]]) {
    assert.ok(Math.abs(viewingSeconds.get(speed)! - duration) < 1e-8, `${duration} viewing seconds at ${speed}x`);
  }
  const short = { ...plan, finalScore: 20, slowAtDecision: 0, finishAtDecision: 50 };
  assert.equal(highlightAutomaticSpeed(24, short), 1);
  assert.equal(highlightAutomaticSpeed(25, short), 10);
  assert.equal(highlightAutomaticSpeed(50, short), 10, "Short episodes preserve the requested opening ramp");
  assert.equal(highlightAutomaticSpeed(274, short), 10);
  assert.equal(highlightAutomaticSpeed(275, short), 1);
  const earlyEnding = { ...plan, slowAtDecision: 2000, finishAtDecision: 2200 };
  assert.equal(highlightAutomaticSpeed(1999, earlyEnding), 100);
  assert.equal(highlightAutomaticSpeed(2000, earlyEnding), 10, "The ending takes priority over the 500x ramp");
  assert.equal(highlightAutomaticSpeed(2200, earlyEnding), 1);
});

test("automatic speed follows the last survivor, even when an earlier chicken scored higher", () => {
  const genome = manifest.entries.at(-1)!.genome;
  const replay = new Replay([genome, { ...genome, id: genome.id + 1000 }], 42,
    highlightReplayConfig(DEFAULT_CONFIG), HIGHLIGHT_REPLAY_OPTIONS);
  // Identical archived policies give a real trajectory for both score thresholds.
  while (!replay.finished) replay.advance();
  const finalScore = replay.agents[1].sim.agent.maxRow;
  assert.ok(finalScore > 100, "The real archived policy exercises both score thresholds");
  // An earlier death's record must not determine the ending milestones.
  replay.agents[0].sim.tick = 0;
  replay.agents[0].sim.agent.maxRow = finalScore + 200;
  const plan = highlightAutoSpeedPlan(replay);
  assert.equal(plan.finalGenomeId, replay.agents[1].genome.id);
  assert.equal(plan.finalScore, finalScore);
  const solo = new Replay([replay.agents[1].genome], 42, replay.config, replay.options);
  while (solo.decisions < plan.finishAtDecision) {
    assert.equal(solo.current.sim.agent.maxRow >= finalScore - 100, solo.decisions >= plan.slowAtDecision);
    assert.ok(solo.current.sim.agent.maxRow < finalScore - 10);
    solo.advance();
  }
  assert.ok(solo.current.sim.agent.maxRow >= finalScore - 10);
  assert.ok(plan.slowAtDecision <= plan.finishAtDecision);
});

test("all six highlights have precomputed ending milestones within their fixed timelines", () => {
  for (const entry of manifest.entries) {
    const plan = entry.automaticPlayback;
    assert.ok(Number.isInteger(plan.finalGenomeId));
    assert.ok(Number.isInteger(plan.finalScore) && plan.finalScore >= 0);
    assert.ok(plan.slowAtDecision >= 0 && plan.slowAtDecision <= plan.finishAtDecision);
    assert.ok(plan.finishAtDecision <= entry.populationReplayDecisions);
    assert.equal(highlightAutomaticSpeed(entry.populationReplayDecisions, plan),
      entry.populationReplayDecisions < 275 ? 10 : 1);
  }
});
