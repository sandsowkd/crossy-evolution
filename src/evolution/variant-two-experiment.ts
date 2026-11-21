import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { hash } from "../core/rng";
import { type Config } from "../core/types";
import { HELD_OUT_SEEDS, mean, type Episode } from "./evaluation";
import { parseCheckpoint } from "./checkpoint";
import { type EvolutionParameters, type Genome } from "./genome";
import { parseEvolution, stringifyEvolution } from "./serialization";
import * as historicalSuites from "./suites";
import { type Checkpoint, type TrainingConfig } from "./trainer";

export type VariantTwoBranch = "scratch" | "transfer";
export const VARIANT_TWO_SEED = 20261121;
export const VARIANT_TWO_TRAINING_PREFIX = 0x40000000;
export const VARIANT_TWO_TRAINING_STREAM = 2307;
export const VARIANT_TWO_TRAINING_STRIDE = 19;
export const VARIANT_TWO_POPULATION = 100;
export const VARIANT_TWO_TRAINING_MAPS = 16;
export const VARIANT_TWO_GENERATION_CAP = 64;
export const VARIANT_TWO_DEVELOPMENT_SEEDS = Array.from({ length: 64 }, (_, i) => (0x94000000 + i * 65537) >>> 0);
/** Reserved only. The trainer never evaluates this array. */
export const VARIANT_TWO_RESERVED_FINAL_SEEDS = Array.from({ length: 512 }, (_, i) => (0x96000000 + i * 104729) >>> 0);
export const VARIANT_TWO_PARAMETERS: EvolutionParameters = {
  weightMutationRate: .22, weightMutationSigma: .12, weightResetRate: .001,
  addNodeRate: .04, addConnectionRate: .15, toggleConnectionRate: .005,
  crossoverRate: .35, parentFraction: .25,
};
export type VariantTwoProtocol = {
  format: "crossy-variant-two-pair";
  version: 1;
  branches: ["scratch", "transfer"];
  population: 100;
  trainingMaps: 16;
  generationCap: 64;
  seed: number;
  trainingSeedPrefix: number;
  trainingSeedStride: number;
  trainingSeedStream: number;
  observationVersion: NonNullable<TrainingConfig["observationVersion"]>;
  simulation: Config;
  evolutionParameters: EvolutionParameters;
  developmentSeeds: number[];
  reservedFinalSeeds: number[];
  selection: { every: 4; shortlist: 5; metric: "mean-row" };
  source: { directory: string; checkpointSha256: string; selectedSha256: string;
    cohortSha256: string; selectedGeneration: number; selectedGenome: number; inheritedPhasePositions: number };
  codeSha256: string;
};
export type VariantTwoMetrics = {
  meanRow: number; medianRow: number; maximumRow: number;
  reach100: number; reach300: number; reach1000: number;
  timeoutRate: number; deaths: Record<string, number>;
};
export type VariantTwoSelection = VariantTwoMetrics & {
  generation: number; genome: Genome; episodes: Episode[];
};
export type VariantTwoNomination = VariantTwoMetrics & { generation: number; genome: number };
export type VariantTwoSnapshot = {
  format: "crossy-variant-two-snapshot"; version: 1;
  branch: VariantTwoBranch; protocolSha256: string; previousSnapshotSha256: string | null;
  checkpoint: Checkpoint; selected: VariantTwoSelection | null;
  nominations: VariantTwoNomination[]; seconds: number;
  developmentEpisodes: number;
  knownRepeatedTrainingEpisodes: number;
};
export type VariantTwoHead = { generation: number; snapshotSha256: string };

export function sha256(data: string | Uint8Array) {
  return createHash("sha256").update(data).digest("hex");
}
export function variantTwoTrainingSeeds(generationIndex: number) {
  assert.ok(Number.isInteger(generationIndex) && generationIndex >= 0);
  return Array.from({ length: VARIANT_TWO_TRAINING_MAPS }, (_, i) =>
    ((hash(VARIANT_TWO_SEED, generationIndex * VARIANT_TWO_TRAINING_STRIDE + i,
      VARIANT_TWO_TRAINING_STREAM) & 0x3fffffff) | VARIANT_TWO_TRAINING_PREFIX) >>> 0);
}
export function assertVariantTwoSeedSeparation() {
  const prior = new Set([
    ...HELD_OUT_SEEDS,
    ...Object.values(historicalSuites).flatMap((value) => Array.isArray(value) ? value : []),
  ]);
  const training = Array.from({ length: VARIANT_TWO_GENERATION_CAP }, (_, g) => variantTwoTrainingSeeds(g)).flat();
  const all = [...training, ...VARIANT_TWO_DEVELOPMENT_SEEDS, ...VARIANT_TWO_RESERVED_FINAL_SEEDS];
  assert.equal(new Set(all).size, all.length, "New training/development/final maps overlap");
  assert.ok(all.every((seed) => !prior.has(seed)), "New experiment reuses a historical suite map");
  assert.ok(training.every((seed) => seed >= 0x40000000 && seed <= 0x7fffffff));
}
export function summarizeVariantTwo(episodes: Episode[]): VariantTwoMetrics {
  assert.ok(episodes.length > 0);
  const rows = episodes.map((e) => e.score).sort((a, b) => a - b), middle = Math.floor(rows.length / 2);
  const deaths: Record<string, number> = {};
  for (const e of episodes) deaths[e.deathReason ?? "unknown"] = (deaths[e.deathReason ?? "unknown"] ?? 0) + 1;
  return { meanRow: mean(rows), medianRow: rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2,
    maximumRow: rows.at(-1)!, reach100: rows.filter((r) => r >= 100).length / rows.length,
    reach300: rows.filter((r) => r >= 300).length / rows.length,
    reach1000: rows.filter((r) => r >= 1000).length / rows.length,
    timeoutRate: (deaths.timeout ?? 0) / rows.length, deaths };
}
export function variantTwoMilestones(nominations: VariantTwoNomination[]) {
  return Object.fromEntries([100, 300, 1000].map((threshold) => {
    const first = nominations.find((n) => n.meanRow >= threshold);
    return [threshold, first ? { generation: first.generation,
      newTrainingEpisodes: first.generation * VARIANT_TWO_POPULATION * VARIANT_TWO_TRAINING_MAPS,
      meanRow: first.meanRow } : null];
  }));
}
export function protocolSha256(protocol: VariantTwoProtocol) { return sha256(JSON.stringify(protocol)); }
export function writeVariantTwoAtomic(filename: string, data: string | Uint8Array) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, data, { flag: "wx" }); fs.renameSync(temporary, filename); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function writeVariantTwoImmutable(filename: string, data: string | Uint8Array) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (fs.existsSync(filename)) {
    assert.equal(sha256(fs.readFileSync(filename)), sha256(data), `Immutable artifact differs: ${filename}`);
    return;
  }
  // Link publishes a complete file with exclusive-create semantics.
  const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, data, { flag: "wx" }); fs.linkSync(temporary, filename); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
type LockRecord = { pid: number; host: string; token: string; branch: VariantTwoBranch; protocolSha256: string; startedAt: string };
export function acquireVariantTwoLock(directory: string, branch: VariantTwoBranch, protocolHash: string) {
  fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, "trainer.lock.json");
  if (fs.existsSync(filename)) {
    const old = JSON.parse(fs.readFileSync(filename, "utf8")) as LockRecord;
    assert.equal(old.host, os.hostname(), "Lock belongs to another host; cannot determine process liveness");
    let alive = true;
    try { process.kill(old.pid, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false; else throw error; }
    assert.equal(alive, false, `A trainer already holds this run: PID ${old.pid}`);
    fs.renameSync(filename, path.join(directory, `stale-lock-${old.token}.json`));
  }
  const record: LockRecord = { pid: process.pid, host: os.hostname(), token: randomUUID(), branch,
    protocolSha256: protocolHash, startedAt: new Date().toISOString() };
  const fd = fs.openSync(filename, "wx");
  try { fs.writeFileSync(fd, JSON.stringify(record)); } finally { fs.closeSync(fd); }
  return () => {
    const current = JSON.parse(fs.readFileSync(filename, "utf8")) as LockRecord;
    assert.equal(current.token, record.token, "Refusing to release a different trainer's lock");
    fs.unlinkSync(filename);
  };
}
export function archiveVariantTwoPopulation(directory: string, generation: number, genomes: Genome[]) {
  assert.equal(genomes.length, VARIANT_TWO_POPULATION);
  assert.equal(new Set(genomes.map((g) => g.id)).size, VARIANT_TWO_POPULATION);
  const name = `${String(generation).padStart(5, "0")}.json.gz`, file = path.join(directory, "generations", name);
  const payload = stringifyEvolution({ contenders: genomes });
  const reused = fs.existsSync(file);
  if (reused) assert.equal(gunzipSync(fs.readFileSync(file)).toString(), payload, "Orphan population does not reproduce");
  else writeVariantTwoImmutable(file, gzipSync(payload, { level: 3 }));
  return { file, hash: sha256(payload), reused };
}
export function commitVariantTwoSnapshot(directory: string, snapshot: VariantTwoSnapshot): VariantTwoHead {
  parseCheckpoint(stringifyEvolution(snapshot.checkpoint));
  const generation = snapshot.checkpoint.generation, encoded = stringifyEvolution(snapshot),
    head = { generation, snapshotSha256: sha256(encoded) };
  writeVariantTwoImmutable(path.join(directory, "snapshots", `${String(generation).padStart(5, "0")}.json`), encoded);
  writeVariantTwoMirrors(directory, snapshot);
  writeVariantTwoAtomic(path.join(directory, "HEAD.json"), JSON.stringify(head));
  return head;
}
export function writeVariantTwoMirrors(directory: string, snapshot: VariantTwoSnapshot) {
  const generation = snapshot.checkpoint.generation;
  writeVariantTwoAtomic(path.join(directory, "checkpoint.json"), stringifyEvolution(snapshot.checkpoint));
  writeVariantTwoAtomic(path.join(directory, "selected.json"), stringifyEvolution({ selected: snapshot.selected }));
  writeVariantTwoAtomic(path.join(directory, "training-summary.json"), JSON.stringify({
    branch: snapshot.branch, protocolSha256: snapshot.protocolSha256, generation,
    config: snapshot.checkpoint.config, trainingEpisodes: generation * VARIANT_TWO_POPULATION * VARIANT_TWO_TRAINING_MAPS,
    monitorEpisodes: generation * (snapshot.checkpoint.config.monitorSeeds?.length ?? 16),
    developmentEpisodes: snapshot.developmentEpisodes, knownRepeatedTrainingEpisodes: snapshot.knownRepeatedTrainingEpisodes,
    seconds: snapshot.seconds, selected: snapshot.selected ? { ...snapshot.selected, genome: snapshot.selected.genome.id, episodes: undefined } : null,
    meanScoreMilestones: variantTwoMilestones(snapshot.nominations), nominations: snapshot.nominations,
  }, null, 2));
}
export function readVariantTwoSnapshot(directory: string, protocolHash: string, branch: VariantTwoBranch) {
  const head = JSON.parse(fs.readFileSync(path.join(directory, "HEAD.json"), "utf8")) as VariantTwoHead;
  const file = path.join(directory, "snapshots", `${String(head.generation).padStart(5, "0")}.json`), text = fs.readFileSync(file, "utf8");
  assert.equal(sha256(text), head.snapshotSha256, "Committed snapshot checksum mismatch");
  const snapshot = parseEvolution<VariantTwoSnapshot>(text);
  assert.equal(snapshot.format, "crossy-variant-two-snapshot"); assert.equal(snapshot.version, 1);
  assert.equal(snapshot.protocolSha256, protocolHash, "Protocol changed since this checkpoint");
  assert.equal(snapshot.branch, branch, "Checkpoint belongs to the other experiment branch");
  assert.equal(snapshot.checkpoint.generation, head.generation);
  parseCheckpoint(stringifyEvolution(snapshot.checkpoint));
  for (const record of snapshot.checkpoint.history) {
    assert.equal(record.populationSize, VARIANT_TWO_POPULATION);
    const file = path.join(directory, "generations", `${String(record.generation).padStart(5, "0")}.json.gz`);
    const payload = gunzipSync(fs.readFileSync(file)).toString();
    assert.equal(sha256(payload), record.cohortHash, `Population checksum mismatch at generation ${record.generation}`);
    const cohort = parseEvolution<{ contenders: Genome[] }>(payload).contenders;
    assert.equal(cohort.length, VARIANT_TWO_POPULATION);
    assert.equal(new Set(cohort.map((g) => g.id)).size, VARIANT_TWO_POPULATION);
  }
  return { head, snapshot };
}
