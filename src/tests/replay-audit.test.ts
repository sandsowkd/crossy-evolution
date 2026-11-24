import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import type { AuditResult } from "../../scripts/evaluation/audit-replay-sequence";
import type { ExplorerCatalog } from "../visualization/explorer-data";
import { REPLAY_MAP_SEEDS } from "../visualization/explorer-sequence";
import { highlightReplayConfig, HIGHLIGHT_REPLAY_OPTIONS } from "../visualization/highlight-playback";
import { Replay } from "../evolution/replay";
import type { Genome } from "../evolution/genome";
import { parseEvolution } from "../evolution/serialization";
const read = (file: string) => fs.readFileSync(new URL(`../../${file}`,import.meta.url),"utf8");
const report = JSON.parse(read("public/replay-audit/results.json")) as {episodes: number; generations: AuditResult[]};
const catalog = JSON.parse(read("public/explorer-catalog.json")) as ExplorerCatalog;

test("the evidence logs every full population on every selectable map for all 150 positions", () => {
  assert.equal(report.generations.length,150);
  assert.equal(report.episodes,148000);
  assert.equal(report.generations.reduce((sum,row)=>sum+row.maps.length*row.population,0),report.episodes);
  for (const row of report.generations) {
    const source = catalog.variants[0].sequence![row.generation-1];
    assert.equal(row.cohortHash,source.cohortHash);
    assert.equal(row.population,source.populationSize);
    assert.deepEqual(row.maps.map(map=>map.seed),[...REPLAY_MAP_SEEDS]);
    assert.equal(row.mean,row.maps.reduce((sum,map)=>sum+map.mean,0)/row.maps.length);
    assert.equal(row.maximum,Math.max(...row.maps.map(map=>map.maximum)));
    for (const map of row.maps) assert.equal(Object.values(map.deaths).reduce((a,b)=>a+b,0),row.population);
  }
});

test("generation 86 continues lookahead instead of jumping to the mature memory cohort", () => {
  const [a,b] = catalog.variants[0].sequence!.slice(84,86);
  assert.equal(a.sourcePhase,"lookahead");
  assert.equal(b.sourcePhase,"lookahead");
  assert.equal(b.sourceGeneration,90);
  assert.deepEqual(a.config,b.config);
  const [before,after] = report.generations.slice(84,86);
  assert.ok(after.mean < before.mean*1.3);
  assert.ok(after.maximum < before.maximum*1.3);
  // Preserve the established uncapped simulation; no timeout was added to hide high scores.
  assert.equal(highlightReplayConfig(b.config).maxTicks,Number.MAX_SAFE_INTEGER);
});

test("an independent full-population replay reproduces each logged map maximum and mean", () => {
  const source = catalog.variants[0].sequence![0];
  const text = gunzipSync(fs.readFileSync(new URL(`../../public${source.cohortFile}`,import.meta.url))).toString();
  const {contenders} = parseEvolution<{contenders: Genome[]}>(text);
  for (const map of report.generations[0].maps) {
    const replay = new Replay(contenders,map.seed,highlightReplayConfig(source.config),HIGHLIGHT_REPLAY_OPTIONS);
    while(!replay.finished) replay.advance();
    const scores = replay.agents.map(agent=>agent.sim.agent.maxRow);
    assert.equal(map.mean,scores.reduce((a,b)=>a+b,0)/scores.length);
    assert.equal(map.maximum,Math.max(...scores));
    assert.equal(map.ticks,Math.max(...replay.agents.map(agent=>agent.sim.tick)));
  }
});
