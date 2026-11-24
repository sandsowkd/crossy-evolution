import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { HomepageData } from "../visualization/homepage-data";
import { HOMEPAGE_MILESTONES, VARIANT_TWO_MILESTONES } from "../visualization/site-content";
import { parseEvolution } from "../evolution/serialization";
import { Replay } from "../evolution/replay";
import type { Config } from "../core/types";
import type { Genome } from "../evolution/genome";
import { highlightAutoSpeedPlan, highlightReplayConfig, HIGHLIGHT_REPLAY_OPTIONS } from "../visualization/highlight-playback";
import { milestoneUrl, siteRoute } from "../visualization/replay-links";

const read = <T>(path: string) => parseEvolution<T>(fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
const data = read<HomepageData>("public/homepage-data.json");
type Entry = {id: string; config: Config; genome: Genome; cohortFile: string; populationReplayDecisions: number;
  automaticPlayback: ReturnType<typeof highlightAutoSpeedPlan>};
const manifest = read<{entries: Entry[]; additionalEntries: Entry[]}>("public/highlights.json");

test("homepage previews identify the full archived generations and their automatic playback plans", () => {
  for (const item of HOMEPAGE_MILESTONES) {
    const clip = data.clips.find(clip => clip.id === item.id)!;
    assert.equal(clip.population, item.population);
    assert.equal(clip.generation, item.generation);
    assert.equal(clip.sourceGeneration, item.id === "lookahead-progress" ? 30 : item.generation);
    assert.equal(clip.mapSeed, item.previewSeed);
    assert.ok(clip.decisions > 0 && clip.automaticPlayback);
  }
  assert.equal(data.clips.filter(clip => clip.variant === 2).length, 8);
});

test("Variant 2 website highlights retain complete Auto runs independently of README excerpts", () => {
  const github = read<{speed: number; clips: {id: string; timing: {speed: number; decisionRange: {start: number; end: number}}}[]}>("docs/media/variant-2-timing.json");
  assert.equal(github.speed, 1);
  for (const item of VARIANT_TWO_MILESTONES) {
    const clip = data.clips.find(row => row.id === item.id)!;
    assert.ok(clip.automaticPlayback);
    assert.equal(clip.decisionRange, undefined);
    assert.equal(clip.videoDecisionRange, undefined);
    assert.equal(clip.videoPlaybackSpeed, undefined);
    assert.equal(clip.mapSeed, item.previewSeed);
    assert.ok(clip.automaticPlayback!.finishAtDecision <= clip.decisions);
    const excerpt = github.clips.find(row => row.id === item.id)!;
    assert.equal(excerpt.timing.speed, 1);
    assert.ok(excerpt.timing.decisionRange.end <= clip.decisions);
    if (item.generation > 5) assert.ok(excerpt.timing.decisionRange.end < clip.decisions);
  }
});

test("the middle highlight is an authentic population with performance between its neighboring chapters", () => {
  assert.deepEqual(HOMEPAGE_MILESTONES.map(item => item.generation), [1, 5, 50, 85, 100, 150]);
  const middle = manifest.additionalEntries.find(entry => entry.id === "lookahead-progress")!;
  const preserved = manifest.entries.find(entry => entry.id === "binary-road-learner")!;
  const cohortText = gunzipSync(fs.readFileSync(new URL(`../../public${middle.cohortFile}`, import.meta.url))).toString();
  const population = parseEvolution<{contenders: Genome[]}>(cohortText);
  const archive = read<{history: {generation: number; cohortHash: string}[]}>("results/experiments/average/lookahead-100/training-summary.json");
  assert.equal(archive.history[29].generation, 30);
  assert.equal(createHash("sha256").update(cohortText).digest("hex"), "13f87e946c5395d802d88f7211a3fde797bfd16875751e98f1adcd114273a5c5");
  assert.equal(population.contenders.length, 100);
  assert.ok(preserved.cohortFile.endsWith("/00470.json.gz"));
  const preview = data.clips.find(clip => clip.id === middle.id)!;
  const replay = new Replay(population.contenders, preview.mapSeed, highlightReplayConfig(middle.config), HIGHLIGHT_REPLAY_OPTIONS);
  while (!replay.finished) replay.advance();
  assert.equal(preview.highestScore, Math.max(...replay.agents.map(agent => agent.sim.agent.maxRow)));
  assert.equal(preview.decisions, replay.decisions);
  assert.equal(preview.highestScore, 946);
  assert.ok(preview.highestScore > data.clips.find(clip => clip.id === "early-five-generations")!.highestScore);
  assert.ok(preview.highestScore < data.clips.find(clip => clip.id === "two-hop-lookahead")!.highestScore);
  for (const item of HOMEPAGE_MILESTONES) {
    assert.equal(item.title.split(" ").length, 2);
    assert.ok(item.description.length > 40);
  }
});

test("curated highlight scores and links match their complete audited populations on the selected maps", () => {
  const audit = read<{generations: {generation: number; population: number; maps: {seed: number; maximum: number}[]}[]}>("public/replay-audit/results.json");
  let previous = -1;
  for (const item of HOMEPAGE_MILESTONES) {
    const clip = data.clips.find(clip => clip.id === item.id)!;
    const measured = audit.generations.find(row => row.generation === item.generation)!;
    assert.equal(clip.population, measured.population);
    assert.equal(clip.highestScore, measured.maps.find(map => map.seed === clip.mapSeed)!.maximum);
    assert.deepEqual(siteRoute(new URL(milestoneUrl(item.id), "https://crossy.example")),
      {page: "explorer", variant: 1, generation: clip.generation, phase: "sequence", seed: clip.mapSeed});
    assert.ok(clip.highestScore > previous, "Featured maps should show distinct increases without changing measured scores");
    previous = clip.highestScore;
  }
});

test("preview scores report the population maximum even when the last survivor scores less", () => {
  const entry = manifest.entries[0];
  const text = gunzipSync(fs.readFileSync(new URL(`../../public${entry.cohortFile}`, import.meta.url))).toString();
  const { contenders } = parseEvolution<{contenders: Genome[]}>(text);
  const replay = new Replay(contenders, data.clips.find(clip => clip.id === entry.id)!.mapSeed, highlightReplayConfig(entry.config), HIGHLIGHT_REPLAY_OPTIONS);
  while (!replay.finished) replay.advance();
  const high = Math.max(...replay.agents.map(agent => agent.sim.agent.maxRow));
  const clip = data.clips.find(clip => clip.id === entry.id)!;
  assert.equal(clip.highestScore, high);
  assert.ok(clip.highestScore > clip.automaticPlayback!.finalScore);
});

test("the main loops use one frozen policy and the requested exact move ranges", () => {
  const first = data.clips.find(clip => clip.id === "variant-1-main")!;
  const second = data.clips.find(clip => clip.id === "variant-2-main")!;
  assert.deepEqual(first.decisionRange, {start: 0, end: 100});
  assert.equal(second.mapSeed,318);
  assert.ok(second.decisionRange!.start>0,"Variant2 starts at its early log/train crossings");
  for (const clip of [first, second]) {
    assert.equal(clip.population, 1);
    assert.equal(clip.decisions, clip.decisionRange!.end-clip.decisionRange!.start);
    assert.equal(clip.automaticPlayback, undefined, "Main loops run at normal speed");
    assert.ok(Number.isInteger(clip.policyGenomeId));
  }
  const entry = manifest.entries.at(-1)!;
  assert.equal(first.policyGenomeId, entry.genome.id);
  const replay = new Replay([entry.genome], first.mapSeed, highlightReplayConfig(entry.config), HIGHLIGHT_REPLAY_OPTIONS);
  while (replay.decisions < 100) replay.advance();
  assert.equal(replay.finished, false);
  assert.equal(first.highestScore, replay.current.sim.agent.maxRow);
});

test("recorded training histories remain intact when the homepage omits the score graphs", () => {
  assert.equal(data.phases.length, 4);
  for (const phase of data.phases) {
    const original = read<{history: {generation: number; meanRow: number; maxRow: number}[]}>(phase.source);
    assert.equal(phase.generations, original.history.length);
    assert.deepEqual(phase.history, original.history.map(row => ({generation: row.generation, mean: row.meanRow, maximum: row.maxRow})));
    assert.ok(phase.population > 0 && phase.maps > 0 && phase.episodeSeconds > 0);
  }
});

test("every preview has a real video and still poster available in the distribution", () => {
  for (const clip of data.clips) {
    const video = fs.readFileSync(new URL(`../../public${clip.video}`, import.meta.url));
    const poster = fs.readFileSync(new URL(`../../public${clip.poster}`, import.meta.url));
    assert.equal(video.toString("ascii", 4, 8), "ftyp");
    assert.equal(poster.readUInt16BE(0), 0xffd8);
    assert.ok(video.length > 20_000);
    assert.ok(poster.length > 5_000);
  }
});
