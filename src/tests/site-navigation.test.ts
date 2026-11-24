import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { MILESTONES, HOMEPAGE_MILESTONES, PUBLIC_VARIANTS, VARIANT_ONE_RESULT } from "../visualization/site-content";
import { explorerUrl, milestoneUrl, milestonePhase, parseMapSeed, siteRoute } from "../visualization/replay-links";
import { sitePath } from "../visualization/site-path";
import { prepareHighlightMap } from "../visualization/highlight-map";
import { highlightAutoSpeedPlan, highlightReplayConfig, HIGHLIGHT_REPLAY_OPTIONS } from "../visualization/highlight-playback";
import { parseEvolution } from "../evolution/serialization";
import { Replay } from "../evolution/replay";
import type { Config } from "../core/types";
import type { Genome } from "../evolution/genome";

const manifest = parseEvolution<{ mapSeed: number; entries: { id: string; phaseGeneration: number;
  populationSize: number; cohortFile: string; config: Config; populationReplayDecisions: number;
  automaticPlayback: ReturnType<typeof highlightAutoSpeedPlan> }[] }>(fs.readFileSync(new URL("../../public/highlights.json", import.meta.url), "utf8"));
const url = (path: string) => new URL(path, "https://crossy.example");

test("all six homepage chapters link to their actual archived populations and generations", () => {
  assert.equal(MILESTONES.length, manifest.entries.length);
  for (const item of MILESTONES) {
    const archived = manifest.entries.find(entry => entry.id === item.id)!;
    assert.ok(archived);
    assert.equal(item.generation, archived.phaseGeneration);
    assert.equal(item.population, archived.populationSize);
    const link = url(milestoneUrl(item.id, 4294967295));
    assert.equal(link.pathname, "/");
    assert.equal(link.searchParams.get("generation"), String(item.generation));
    assert.equal(link.searchParams.get("seed"), "4294967295");
    assert.deepEqual(siteRoute(link), { page: "explorer", variant: 1, generation: item.generation, phase: HOMEPAGE_MILESTONES.some(chapter => chapter.id === item.id) ? "sequence" : milestonePhase(item.id), seed: 4294967295 });
  }
});

test("homepage, clean replay URLs, explorer links and legacy links resolve without changing Variant 2", () => {
  assert.deepEqual(siteRoute(url("/")), { page: "home" });
  assert.deepEqual(siteRoute(url("/#results")), { page: "home" });
  assert.deepEqual(siteRoute(url(explorerUrl(150, 0))), { page: "explorer", variant: 1, generation: 150, seed: 0, phase: "sequence" });
  assert.deepEqual(siteRoute(url(explorerUrl())), { page: "explorer", variant: 1 });
  assert.deepEqual(siteRoute(url(explorerUrl(undefined, undefined, 2))), { page: "explorer", variant: 2 });
  assert.deepEqual(siteRoute(url("/?variant=1")), { page: "lab" });
  assert.deepEqual(siteRoute(url("/?variant=2")), { page: "variant-two" });
  assert.deepEqual(siteRoute(url("/?highlights=&milestone=lookahead-memory&seed=12")),
    { page: "highlight", milestone: "lookahead-memory", seed: 12 });
  assert.deepEqual(siteRoute(url("/replay/variant-1/not-a-checkpoint?seed=oops")),
    { page: "highlight", milestone: "initial-population", seed: 42 });
  assert.equal(explorerUrl(100, 92), "/?generation=100&seed=92&variant=1");
});

test("new homepage generations resolve alongside the original saved replay URLs", () => {
  for (const item of HOMEPAGE_MILESTONES) {
    const link = url(milestoneUrl(item.id));
    assert.equal(link.pathname, "/");
    assert.equal(link.searchParams.get("generation"), String(item.generation));
    assert.equal(link.searchParams.get("seed"), String(item.previewSeed));
    assert.deepEqual(siteRoute(link), {page: "explorer", variant: 1, generation: item.generation, phase: "sequence", seed: item.previewSeed});
  }
  assert.equal(milestoneUrl("binary-road-learner"), "/?generation=470&seed=27099291&variant=1&phase=binary");
});

test("map seeds preserve all uint32 values, including zero, and reject invalid inputs", () => {
  for (const value of [0, 1, 42, 2147483648, 4294967295]) assert.equal(parseMapSeed(String(value)), value);
  for (const value of [null, undefined, "", "-1", "1.1", "NaN", "1e3", "4294967296", "9".repeat(50)])
    assert.equal(parseMapSeed(value), 42);
});

test("Variant1 benchmark stays frozen while both public showcases are complete", () => {
  const verification = JSON.parse(fs.readFileSync(new URL("../../results/variants/variant-1/final/verification.json", import.meta.url), "utf8"));
  assert.equal(VARIANT_ONE_RESULT.mean, verification.meanRow);
  assert.equal(VARIANT_ONE_RESULT.maps, verification.testEpisodes);
  assert.deepEqual(VARIANT_ONE_RESULT.interval, verification.meanBootstrap95);
  assert.equal(PUBLIC_VARIANTS.filter(variant => variant.status === "Complete").length, 2);
  assert.equal(PUBLIC_VARIANTS[1].status, "Complete");
  assert.equal(PUBLIC_VARIANTS[1].href, "/explore?variant=2");
});

test("new map plans are deterministic, have exact complete timelines, and keep archived genomes unchanged", () => {
  const entry = manifest.entries[0];
  const text = gunzipSync(fs.readFileSync(new URL(`../../public${entry.cohortFile}`, import.meta.url))).toString();
  const { contenders } = parseEvolution<{ contenders: Genome[] }>(text);
  const original = structuredClone({ contenders, config: entry.config });
  for (const seed of [0, 43]) {
    const plan = prepareHighlightMap(contenders, seed, entry.config);
    assert.deepEqual(plan, prepareHighlightMap(contenders, seed, entry.config));
    const replay = new Replay(contenders, seed, highlightReplayConfig(entry.config), HIGHLIGHT_REPLAY_OPTIONS);
    while (!replay.finished) { assert.ok(replay.decisions < plan.decisions); replay.advance(); }
    assert.equal(replay.decisions, plan.decisions);
    assert.deepEqual(plan.automaticPlayback, highlightAutoSpeedPlan(replay));
  }
  const originalMap = prepareHighlightMap(contenders, manifest.mapSeed, entry.config);
  assert.equal(originalMap.decisions, entry.populationReplayDecisions);
  assert.deepEqual(originalMap.automaticPlayback, entry.automaticPlayback);
  assert.deepEqual({ contenders, config: entry.config }, original);
});


test("query replays, race navigation, and assets work under the personal website subdirectory", () => {
  const base="/crossyroadai/";
  assert.equal(sitePath("/",base),"/crossyroadai/");
  assert.equal(sitePath("/upstream/models/chicken.obj",base),"/crossyroadai/upstream/models/chicken.obj");
  assert.equal(sitePath("/play?seed=friends&variant=2",base),"/crossyroadai/play?seed=friends&variant=2");
  assert.equal(sitePath("https://github.com/sandsowkd/crossy-evolution",base),"https://github.com/sandsowkd/crossy-evolution");
  assert.deepEqual(siteRoute(url("/crossyroadai"),base),{page:"home"});
  assert.deepEqual(siteRoute(url("/crossyroadai/?generation=1&seed=561909326&variant=1"),base),
    {page:"explorer",variant:1,generation:1,seed:561909326,phase:"sequence"});
  assert.deepEqual(siteRoute(url("/crossyroadai/?generation=64&seed=0&variant=2"),base),
    {page:"explorer",variant:2,generation:64,seed:0,phase:"sequence"});
  assert.deepEqual(siteRoute(url("/crossyroadai/explore?variant=2"),base),{page:"explorer",variant:2});
  assert.deepEqual(siteRoute(url("/crossyroadai/play?seed=friends&variant=1"),base),{page:"play"});
  assert.deepEqual(siteRoute(url("/generation/1/seed/561909326?variant=1")),
    {page:"explorer",variant:1,generation:1,seed:561909326,phase:"sequence"});
});
