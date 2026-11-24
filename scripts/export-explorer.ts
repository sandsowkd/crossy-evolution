/** Publish immutable copies of native populations; never modify a training run. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Config } from "../src/core/types";
import type { Genome } from "../src/evolution/genome";
import { validGenome } from "../src/evolution/checkpoint";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { Replay } from "../src/evolution/replay";
import { highlightReplayConfig, highlightAutoSpeedPlan, HIGHLIGHT_REPLAY_OPTIONS } from "../src/visualization/highlight-playback";
import type { ExplorerCatalog, ExplorerPhase, ExplorerRecord, SequenceRecord } from "../src/visualization/explorer-data";
import { sequenceSource, REPLAY_MAP_SEEDS } from "../src/visualization/explorer-sequence";
import { HOMEPAGE_MILESTONES } from "../src/visualization/site-content";
import { milestonePhase } from "../src/visualization/replay-links";
const read = <T>(file: string): T => parseEvolution<T>(fs.readFileSync(file, "utf8"));
const hash = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
type History = {generation: number; seeds: number[]; champion: Genome; contenders: Genome[]};
type Checkpoint = {config: {simulation: Config}; history: History[]};
type Highlight = {id: string; title: string; phaseGeneration: number; config: Config; genome: Genome;
  sourceArchive: string; populationSize: number; cohortFile: string; cohortHash: string;
  populationReplayDecisions: number; automaticPlayback: ReturnType<typeof highlightAutoSpeedPlan>};
const manifest = read<{mapSeed: number; entries: Highlight[]; additionalEntries: Highlight[]}>("public/highlights.json");
// Picked by measuring real map-42 populations: gen 30 = 1,506, gen 85 = 3,460.
const lookaheadDir = "results/experiments/average/lookahead-100";
const lookahead = read<Checkpoint>(`${lookaheadDir}/checkpoint.json`);
const progressGeneration = 30;
const progressArchive = `${lookaheadDir}/generations/00030.json.gz`;
const progressText = gunzipSync(fs.readFileSync(progressArchive)).toString();
const { contenders } = parseEvolution<{contenders: Genome[]}>(progressText);
const progressReplay = new Replay(contenders, 42, highlightReplayConfig(lookahead.config.simulation), HIGHLIGHT_REPLAY_OPTIONS);
while (!progressReplay.finished) progressReplay.advance();
const source = manifest.entries.find(entry => entry.id === "two-hop-lookahead")!;
const progress = { ...source, id: "lookahead-progress", title: "Traffic timing", phaseGeneration: progressGeneration,
  genome: lookahead.history[progressGeneration - 1].champion, config: lookahead.config.simulation,
  source: `${lookaheadDir}/checkpoint.json#history[29].champion`, sourceArchive: progressArchive,
  cohortFile: "/training-cohorts/highlight-lookahead-progress/00030.json.gz", cohortHash: hash(progressText),
  populationSize: contenders.length, populationReplayDecisions: progressReplay.decisions,
  automaticPlayback: highlightAutoSpeedPlan(progressReplay), cumulativeGenerations: undefined,
  developmentMean: null, developmentMaps: null, developmentMaxTicks: 36000,
  note: "Actual lookahead generation 30; full population. Illustrative map-42 batch high is 1,506, not a benchmark result." };
// Do not copy the next milestone's champion score or monitoring statistics.
const championReplay = new Replay([progress.genome], 42, progress.config);
while (!championReplay.finished) championReplay.advance();
Object.assign(progress, {totalScore: championReplay.current.sim.agent.maxRow,
  replayTicks: championReplay.current.sim.tick, replayDeathReason: championReplay.current.sim.agent.deathReason,
  policySha256: hash(JSON.stringify(progress.genome))});
assert.deepEqual(contenders.find(genome => genome.id === progress.genome.id), progress.genome);
fs.mkdirSync(path.dirname(`public${progress.cohortFile}`), {recursive: true});
fs.copyFileSync(progressArchive, `public${progress.cohortFile}`);
manifest.additionalEntries = [...manifest.additionalEntries.filter(entry => entry.id !== progress.id), progress];
fs.writeFileSync("public/highlights.json", stringifyEvolution(manifest) + "\n");
console.log(`New middle highlight: gen 30, ${contenders.length} chickens, high ${Math.max(...progressReplay.agents.map(a => a.sim.agent.maxRow))}`);
const finalDir = "results/variants/variant-1/final";
const final = read<Checkpoint>(`${finalDir}/checkpoint.json`);
function exportRecords(directory: string, namespace: string, history: History[]): ExplorerRecord[] {
  return history.map(row => {
    const file = `${directory}/generations/${String(row.generation).padStart(5, "0")}.json.gz`;
    const compressed = fs.readFileSync(file), text = gunzipSync(compressed).toString();
    const {contenders} = parseEvolution<{contenders: Genome[]}>(text);
    assert.ok(contenders.length && contenders.every(validGenome));
    assert.equal(new Set(contenders.map(g => g.id)).size, contenders.length);
    assert.ok(row.seeds.length > 0);
    const cohortFile = `/training-cohorts/${namespace}/${path.basename(file)}`;
    fs.mkdirSync(path.dirname(`public${cohortFile}`), {recursive: true});
    fs.writeFileSync(`public${cohortFile}`, compressed);
    return {generation: row.generation, populationSize: contenders.length, seeds: row.seeds,
      cohortFile, cohortHash: hash(text)};
  });
}
const memory: ExplorerPhase = {id: "memory", name: "Final memory run", config: final.config.simulation,
  note: "All 150 saved generations. This run starts from inherited networks; the six highlights span earlier phases too.",
  source: `${finalDir}/training-summary.json`, records: exportRecords(finalDir, "explorer-variant-1", final.history)};
// Retain exact historical highlight populations and their original training-map lists.
const phases: ExplorerPhase[] = [memory];
const phaseSources: Record<string, {directory: string; name: string}> = {
  prototype: {directory: "results/batch-200", name: "Early prototype"},
  binary: {directory: "results/continued", name: "Binary traffic inputs"},
  motion: {directory: "results/experiments/trajectory/warm-v3-100", name: "Traffic motion"},
  lookahead: {directory: lookaheadDir, name: "Traffic lookahead"},
  "memory-audit": {directory: "results/experiments/frozen-development/lookahead-memory-g100-audit1370", name: "Earlier memory run"},
};
for (const [id, spec] of Object.entries(phaseSources)) {
  const checkpoint = id === "lookahead" ? lookahead : read<Checkpoint>(`${spec.directory}/checkpoint.json`);
  const highlights = [...manifest.entries, ...manifest.additionalEntries].filter(entry => milestonePhase(entry.id) === id);
  phases.push({id, name: spec.name, config: checkpoint.config.simulation,
    note: "Historical highlighted snapshots from this separate training phase.", source: spec.directory,
    records: highlights.map(entry => ({generation: entry.phaseGeneration, populationSize: entry.populationSize,
      cohortFile: entry.cohortFile, cohortHash: entry.cohortHash,
      seeds: checkpoint.history.find(row => row.generation === entry.phaseGeneration)!.seeds,
      milestone: entry.id, populationReplayDecisions: entry.populationReplayDecisions, automaticPlayback: entry.automaticPlayback}))
      .sort((a,b) => a.generation - b.generation)});
}
const finalEntry = manifest.entries.find(entry => entry.id === "variant-1-final")!;
Object.assign(memory.records[149], {milestone: finalEntry.id, populationReplayDecisions: finalEntry.populationReplayDecisions,
  automaticPlayback: finalEntry.automaticPlayback});
// Freeze a coherent development branch. Do not follow files changing under a trainer.
const v2Dir = "results/variants/variant-2/v4-mean-source-rng-b-003/pareto";
const protocol = read<{simulation: Config}>(`${v2Dir}/protocol.json`);
const head = read<{generation: number}>(`${v2Dir}/HEAD.json`);
const snapshotFile = `${v2Dir}/snapshots/${String(head.generation).padStart(5,"0")}.json.gz`;
const snapshot = parseEvolution<{history: History[]}>(gunzipSync(fs.readFileSync(snapshotFile)).toString());
const development: ExplorerPhase = {id: "development", name: "Saved development run", config: protocol.simulation,
  note: "An in-progress experiment, not a completed public result. Complete saved populations from one native run.",
  source: v2Dir, records: exportRecords(v2Dir, "explorer-variant-2", snapshot.history)};
const catalog: ExplorerCatalog = {version: 1, variants: [
  {id: 1, name: "Variant 1 · Cars and roads", completed: true, phases},
  {id: 2, name: "Variant 2 · Cars, trains, and logs", completed: false, phases: [development]},
]};
// Source mapping is documented in explorer-sequence.ts. Publish complete real
// cohorts, never blended genomes, and retain native identities in the catalog.
const sourceCheckpoints = new Map<string, Checkpoint>([["memory", final], ["lookahead", lookahead]]);
const sequence: SequenceRecord[] = [];
for (let position = 1; position <= 150; position++) {
  const source = sequenceSource(position);
  const phase = phases.find(item => item.id === source.phase)!;
  let record = phase.records.find(item => item.generation === source.generation);
  if (!record) {
    const directory = source.phase === "memory" ? finalDir : phaseSources[source.phase].directory;
    let checkpoint = sourceCheckpoints.get(source.phase);
    if (!checkpoint) { checkpoint = read<Checkpoint>(`${directory}/checkpoint.json`); sourceCheckpoints.set(source.phase, checkpoint); }
    const row = checkpoint.history.find(item => item.generation === source.generation)!;
    const text = source.phase === "prototype" ? stringifyEvolution({contenders: row.contenders}) :
      gunzipSync(fs.readFileSync(`${directory}/generations/${String(source.generation).padStart(5,"0")}.json.gz`)).toString();
    const genomes = parseEvolution<{contenders: Genome[]}>(text).contenders;
    assert.ok(genomes.length && genomes.every(validGenome));
    const cohortFile = `/training-cohorts/sequence-${source.phase}/${String(source.generation).padStart(5,"0")}.json.gz`;
    fs.mkdirSync(path.dirname(`public${cohortFile}`), {recursive: true});
    fs.writeFileSync(`public${cohortFile}`, gzipSync(text));
    record = {generation: source.generation, seeds: row.seeds, populationSize: genomes.length, cohortFile, cohortHash: hash(text)};
  }
  const chapter = HOMEPAGE_MILESTONES.find(item => item.generation === position);
  sequence.push({...record, generation: position, config: phase.config, seeds: [...REPLAY_MAP_SEEDS],
    populationReplayDecisions: undefined, automaticPlayback: undefined,
    sourceGeneration: source.generation, sourcePhase: source.phase, milestone: chapter?.id});
}
catalog.version = 2;
catalog.variants[0].sequence = sequence;
fs.writeFileSync("public/explorer-catalog.json", JSON.stringify(catalog) + "\n");
console.log(`Exported ${memory.records.length} Variant 1 and ${development.records.length} Variant 2 populations.`);
