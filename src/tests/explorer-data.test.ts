import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import type { ExplorerCatalog } from "../visualization/explorer-data";
import { parseEvolution } from "../evolution/serialization";
import type { Genome } from "../evolution/genome";
import { HOMEPAGE_MILESTONES } from "../visualization/site-content";
import { milestonePhase, replayUrl, siteRoute } from "../visualization/replay-links";
import { highlightAutomaticSpeed, highlightJumpTarget, highlightReplayConfig } from "../visualization/highlight-playback";
import { defaultSelection, mapSeedOptions, menuRecords, resolveEntry } from "../visualization/explorer-selection";
import { sequenceSource, isReplaySpace, REPLAY_MAP_SEEDS } from "../visualization/explorer-sequence";
import { hopTicks } from "../core/types";
const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const catalog = JSON.parse(read("public/explorer-catalog.json")) as ExplorerCatalog;

test("the explorer publishes every final-run generation with its exact recorded training maps", () => {
  const final = catalog.variants.find(v => v.id === 1)!.phases.find(p => p.id === "memory")!;
  const original = JSON.parse(read(final.source)) as {history: {generation: number; seeds: number[]}[]};
  assert.deepEqual(final.records.map(row => row.generation), Array.from({length: 150}, (_,i) => i + 1));
  assert.deepEqual(final.records.map(row => row.seeds), original.history.map(row => row.seeds));
  assert.ok(final.records.every(row => row.populationSize === 100 && row.seeds.length === 32));
});

test("every selectable population is present, intact, complete, and reachable by its shared URL", () => {
  for (const variant of catalog.variants) for (const phase of variant.phases) for (const record of phase.records) {
    const text = gunzipSync(fs.readFileSync(new URL(`../../public${record.cohortFile}`, import.meta.url))).toString();
    assert.equal(createHash("sha256").update(text).digest("hex"), record.cohortHash);
    const population = parseEvolution<{contenders: Genome[]}>(text).contenders;
    assert.equal(population.length, record.populationSize);
    assert.equal(new Set(population.map(g => g.id)).size, record.populationSize);
    const link = new URL(replayUrl(record.generation, record.seeds[0], variant.id, phase.id), "https://crossy.example");
    assert.deepEqual(siteRoute(link), {page: "explorer", variant: variant.id, phase: phase.id,
      generation: record.generation, seed: record.seeds[0]});
  }
});

test("the curated 1–150 menu and six homepage anchors resolve to identical original populations", () => {
  const v1 = catalog.variants.find(v => v.id === 1)!;
  const sequence = menuRecords(v1);
  assert.deepEqual(sequence.map(row => row.generation), Array.from({length: 150}, (_,i) => i + 1));
  for (const item of HOMEPAGE_MILESTONES) {
    const phase = v1.phases.find(phase => phase.id === milestonePhase(item.id))!;
    const sourceGeneration = item.id === "lookahead-progress" ? 30 : item.generation;
    const native = phase.records.find(record => record.generation === sourceGeneration)!;
    const record = resolveEntry(catalog, {...defaultSelection(1), generation: item.generation})!;
    assert.equal(record.populationSize, item.population);
    assert.equal(record.cohortHash, native.cohortHash);
    assert.equal(record.milestone, item.id);
    assert.deepEqual(menuRecords(v1)[item.generation - 1].seeds, [...REPLAY_MAP_SEEDS]);
  }
  for (const row of sequence) {
    const source = sequenceSource(row.generation);
    assert.equal(row.sourceGeneration, source.generation);
    assert.equal(row.sourcePhase, source.phase);
    const text = gunzipSync(fs.readFileSync(new URL(`../../public${row.cohortFile}`, import.meta.url))).toString();
    assert.equal(createHash("sha256").update(text).digest("hex"), row.cohortHash);
    const genomes = parseEvolution<{contenders: Genome[]}>(text).contenders;
    assert.equal(genomes.length, row.populationSize);
  }
  assert.equal(resolveEntry(catalog, defaultSelection(1))!.populationSize, 200);
  assert.equal(defaultSelection(1, catalog).seed, HOMEPAGE_MILESTONES[0].previewSeed);
});

test("every sequence position offers the identical eight long map seeds, with no 42 or custom option", () => {
  for (const record of menuRecords(catalog.variants[0])) {
    const seeds = mapSeedOptions(record);
    assert.deepEqual(seeds, [...REPLAY_MAP_SEEDS]);
    assert.ok(seeds.every(seed => seed >= 10_000_000));
    assert.equal(new Set(seeds).size, seeds.length);
  }
});

test("Space toggles replay once per press and leaves editing and modified keys alone", () => {
  const space = {code: "Space", repeat: false, altKey: false, ctrlKey: false, metaKey: false};
  assert.equal(isReplaySpace(space, null), true);
  assert.equal(isReplaySpace({...space, repeat: true}, null), false);
  assert.equal(isReplaySpace({...space, code: "Enter"}, null), false);
  assert.equal(isReplaySpace({...space, ctrlKey: true}, null), false);
  assert.equal(isReplaySpace(space, {closest: () => ({})} as unknown as Element), false);
});

test("Variant2 completes its150-position showcase and preserves native playback and evaluation timing", () => {
  const v2 = catalog.variants.find(v => v.id === 2)!;
  const phase = v2.phases[0];
  assert.equal(v2.completed, true);
  assert.equal(v2.sequence!.length,150);
  assert.equal(resolveEntry(catalog,defaultSelection(2,catalog))!.generation,1);
  assert.equal(phase.records.length, 64);
  assert.deepEqual(phase.records.map(row => row.generation), Array.from({length: 64}, (_,i) => i + 1));
  assert.ok(phase.records.every(row => row.populationSize === 200 && row.seeds.length === 32));
  const viewing = highlightReplayConfig(phase.config);
  assert.deepEqual(viewing, phase.config);
  assert.equal(viewing.maxTicks, 36000);
  const ticks = hopTicks(viewing);
  assert.equal(ticks, 10);
  assert.equal(highlightAutomaticSpeed(29, undefined, ticks), 1);
  assert.equal(highlightAutomaticSpeed(30, undefined, ticks), 10);
  assert.equal(highlightAutomaticSpeed(330, undefined, ticks), 100);
  assert.equal(highlightAutomaticSpeed(3330, undefined, ticks), 500);
  assert.equal(highlightJumpTarget(0, 10, ticks), 300);
});
