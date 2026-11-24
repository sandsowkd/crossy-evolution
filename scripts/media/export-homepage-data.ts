import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import type { Config } from "../../src/core/types";
import { hopTicks } from "../../src/core/types";
import type { Genome } from "../../src/evolution/genome";
import { Replay } from "../../src/evolution/replay";
import { parseEvolution } from "../../src/evolution/serialization";
import { highlightAutoSpeedPlan, highlightReplayConfig, HIGHLIGHT_REPLAY_OPTIONS } from "../../src/visualization/highlight-playback";
import type { HomepageData, TrainingPhase } from "../../src/visualization/homepage-data";
import type { ExplorerCatalog } from "../../src/visualization/explorer-data";
import { HOMEPAGE_MILESTONES } from "../../src/visualization/site-content";

const read = <T>(path: string): T => parseEvolution<T>(fs.readFileSync(path, "utf8"));
type Entry = {id: string; config: Config; cohortFile: string;
  genome: Genome; phaseGeneration: number; populationSize: number; sourceArchive: string};
const manifest = read<{mapSeed: number; entries: Entry[]; additionalEntries?: Entry[]}>("public/highlights.json");
const data: HomepageData = { version: 1, clips: [], phases: [] };
const onlyHighlights = process.argv.includes("--highlights");
const existing = onlyHighlights ? read<HomepageData>("public/homepage-data.json") : undefined;
const catalog = read<ExplorerCatalog>("public/explorer-catalog.json");
for (const milestone of HOMEPAGE_MILESTONES) {
  const entry = [...manifest.entries, ...(manifest.additionalEntries ?? [])].find(entry => entry.id === milestone.id)!;
  assert.ok(entry, `Missing homepage population ${milestone.id}`);
  const { contenders } = parseEvolution<{contenders: Genome[]}>(gunzipSync(fs.readFileSync(`public${entry.cohortFile}`)).toString());
  assert.equal(contenders.length, entry.populationSize);
  const seed = milestone.previewSeed;
  assert.ok(catalog.variants[0].sequence!.find(row => row.generation === milestone.generation)!.seeds.includes(seed), "Preview must use an audited map");
  const replay = new Replay(contenders, seed, highlightReplayConfig(entry.config), HIGHLIGHT_REPLAY_OPTIONS);
  while (!replay.finished) replay.advance();
  data.clips.push({ id: entry.id, variant: 1, generation: milestone.generation, sourceGeneration: entry.phaseGeneration, population: contenders.length,
    mapSeed: seed, highestScore: Math.max(...replay.agents.map(agent => agent.sim.agent.maxRow)),
    decisions: replay.decisions, seconds: replay.decisions * hopTicks(replay.config) / 60,
    sourceArchive: entry.sourceArchive, automaticPlayback: highlightAutoSpeedPlan(replay),
    video: `/previews/${entry.id}.mp4`, poster: `/previews/${entry.id}.jpg` });
  console.log(`${entry.id}: batch high ${data.clips.at(-1)!.highestScore}`);
}
if (!onlyHighlights) {
const v2 = read<{genomes: Genome[]; generation: number; seed: number; simulation: Config; sourceArchive: string;
  selectedGenome: number}>("public/variant-2/latest-population.json");
const final = manifest.entries.find(entry => entry.id === "variant-1-final")!;
for (const selected of [
  { id: "variant-1-main", variant: 1 as const, generation: final.phaseGeneration, genome: final.genome,
    config: highlightReplayConfig(final.config), seed: manifest.mapSeed, sourceArchive: final.sourceArchive, start: 0, end: 100 },
  { id: "variant-2-main", variant: 2 as const, generation: v2.generation, genome: v2.genomes.find(genome => genome.id === v2.selectedGenome)!,
    // Map zero includes cars, logs and an active train in this exact move range.
    config: v2.simulation, seed: 0, sourceArchive: v2.sourceArchive, start: 50, end: 150 },
]) {
  assert.ok(selected.genome, "Missing selected policy");
  const solo = new Replay([selected.genome], selected.seed, selected.config, HIGHLIGHT_REPLAY_OPTIONS);
  while (solo.decisions < selected.end && !solo.finished) solo.advance();
  assert.equal(solo.decisions, selected.end, `${selected.id} must survive the requested clip`);
  data.clips.push({ id: selected.id, variant: selected.variant, generation: selected.generation, population: 1,
    mapSeed: selected.seed, highestScore: solo.current.sim.agent.maxRow, decisions: selected.end - selected.start,
    seconds: (selected.end - selected.start) * hopTicks(selected.config) / 60, sourceArchive: selected.sourceArchive,
    decisionRange: { start: selected.start, end: selected.end }, policyGenomeId: selected.genome.id,
    video: `/previews/${selected.id}.mp4`, poster: `/previews/${selected.id}.jpg` });
}

} else {
  data.clips.push(...existing!.clips.filter(clip => clip.decisionRange));
}

type Summary = { config: {population: number; trainingSeeds: number; simulation: Config}; generations?: number;
  history: {generation: number; meanRow: number; maxRow: number}[] };
const phases: Omit<TrainingPhase, "generations" | "population" | "maps" | "episodeSeconds" | "history">[] = [
  { id: "prototype", name: "Early prototype", source: ".archive/results/variant-1/batch-200/training-summary.json", warmStart: false,
    changes: "Initial random networks and five generations of selection. Binary observations of local terrain and traffic." },
  { id: "binary", name: "Binary road learner", source: ".archive/results/variant-1/continued/training-summary.json", warmStart: false,
    changes: "Binary hazard inputs; 200 chickens evaluated on 8 generated training maps per generation. Topology and connection weights evolved together." },
  { id: "lookahead", name: "Lookahead branch", source: ".archive/results/variant-1/experiments/average/lookahead-100/training-summary.json", warmStart: true,
    changes: "Inherited networks with distance, motion and two-hop hazard inputs. Experiments varied the observation layout, objective and mutation settings." },
  { id: "memory", name: "Final memory branch", source: "results/variant-1/final/training-summary.json", warmStart: true,
    changes: "Two-hop lookahead plus the previous horizontal action. 100 chickens × 32 maps; row-based fitness, small weight mutations and a frozen final selection." },
];
for (const phase of onlyHighlights ? [] : phases) {
  const summary = read<Summary>(phase.source);
  // The original compact summary predates embedding its configuration.
  if (phase.id === "prototype") summary.config = read<Summary>(".archive/results/variant-1/batch-200/checkpoint.json").config;
  assert.ok(summary.history.length > 0);
  data.phases.push({ ...phase, generations: summary.history.length, population: summary.config.population,
    maps: summary.config.trainingSeeds, episodeSeconds: summary.config.simulation.maxTicks / 60,
    history: summary.history.map(row => ({generation: row.generation, mean: row.meanRow, maximum: row.maxRow})) });
}
if (existing) data.phases = existing.phases;
fs.mkdirSync(".publication/homepage-preview-input", {recursive: true});
// Freeze this illustrative development population so the clip and its data stay in sync.
if (!onlyHighlights) fs.copyFileSync("public/variant-2/latest-population.json", ".publication/homepage-preview-input/variant-2.json");
fs.writeFileSync("public/homepage-data.json", JSON.stringify(data) + "\n");
console.log(`Exported ${data.clips.length} previews and ${data.phases.length} measured training histories.`);
