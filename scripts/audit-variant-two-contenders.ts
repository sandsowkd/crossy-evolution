import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { setImmediate, setTimeout as delay } from "node:timers/promises";
import { parseEvolution, stringifyEvolution } from "../src/evolution/serialization";
import { evaluateGenome } from "../src/evolution/evaluation";
import { Replay } from "../src/evolution/replay";
import type { Checkpoint } from "../src/evolution/trainer";
import type { Genome } from "../src/evolution/genome";
import type { Config } from "../src/core/types";
import { acquireVariantTwoLock, sha256, summarizeVariantTwo, writeVariantTwoAtomic as atomic,
  type VariantTwoNomination } from "../src/evolution/variant-two-experiment";

const directory = process.argv[2]; assert.ok(directory && fs.existsSync(`${directory}/protocol.json`));
const head = JSON.parse(fs.readFileSync(`${directory}/HEAD.json`, "utf8"));
const snapshotText = fs.readFileSync(`${directory}/snapshots/${String(head.generation).padStart(5,"0")}.json`, "utf8");
assert.equal(sha256(snapshotText),head.snapshotSha256);
const snapshot = parseEvolution<{checkpoint: Checkpoint; nominations: VariantTwoNomination[]}>(snapshotText);
const protocol = JSON.parse(fs.readFileSync(`${directory}/protocol.json`, "utf8")) as {
  config: {simulation: Config}; confirmationDevelopmentSeeds: number[]; developmentSeeds: number[]; lineageOffset: number};
assert.equal(protocol.confirmationDevelopmentSeeds.length,256);
const cohortOption = process.argv.find(arg => arg.startsWith("--all-cohort="));
const fullCohortGeneration = cohortOption ? Number(cohortOption.slice("--all-cohort=".length)) : undefined;
let nominations: {generation: number; genome: number; meanRow: number | null}[] = snapshot.nominations;
if (fullCohortGeneration !== undefined) {
  assert.ok(Number.isInteger(fullCohortGeneration) && fullCohortGeneration > 0 && fullCohortGeneration <= head.generation);
  const payload = gunzipSync(fs.readFileSync(`${directory}/generations/${String(fullCohortGeneration).padStart(5,"0")}.json.gz`)).toString();
  assert.equal(sha256(payload), snapshot.checkpoint.history[fullCohortGeneration-1].cohortHash);
  nominations = parseEvolution<{contenders: Genome[]}>(payload).contenders.map(g =>
    ({generation: fullCohortGeneration, genome: g.id, meanRow: null}));
}
const output = `${directory}/${cohortOption ? "full-cohort" : "candidate"}-audit-${String(fullCohortGeneration ?? head.generation).padStart(5,"0")}.json`;
assert.equal(fs.existsSync(output),false,"This audit snapshot was already evaluated");
type Metrics = ReturnType<typeof summarizeVariantTwo> & {generation:number;genome:number;fingerprint:string;rapidDevelopmentMean:number|null};
const previous = new Map<string,Metrics>(), reusedAuditSources = [];
for (const name of fs.readdirSync(directory).filter(name => /^(?:candidate|full-cohort)-audit-\d{5}\.json$/.test(name))) {
  const file = `${directory}/${name}`, text = fs.readFileSync(file,"utf8");
  const report = JSON.parse(text) as {results: Metrics[]};
  for (const result of report.results) previous.set(result.fingerprint,result);
  reusedAuditSources.push({file,sha256:sha256(text)});
}
const seen = new Set<string>(), results: Metrics[] = [];
let reusedCandidates = 0;
let genomes: Genome[] = [], lastGeneration = -1;
for (const nomination of nominations) {
  if (nomination.generation !== lastGeneration) {
    const file = `${directory}/generations/${String(nomination.generation).padStart(5,"0")}.json.gz`;
    const payload = gunzipSync(fs.readFileSync(file)).toString();
    assert.equal(sha256(payload),snapshot.checkpoint.history[nomination.generation-1].cohortHash);
    genomes = parseEvolution<{contenders: Genome[]}>(payload).contenders; lastGeneration = nomination.generation;
  }
  const genome = genomes.find(g=>g.id===nomination.genome); assert.ok(genome);
  const fingerprint = sha256(JSON.stringify({nodes:genome.nodes,connections:genome.connections,observationVersion:genome.observationVersion}));
  if (seen.has(fingerprint)) continue; seen.add(fingerprint);
  const cached = previous.get(fingerprint);
  if (cached) {results.push({...cached,generation:nomination.generation,genome:genome.id});reusedCandidates++;continue;}
  const episodes = evaluateGenome(genome,protocol.confirmationDevelopmentSeeds,protocol.config.simulation);
  results.push({generation:nomination.generation,genome:genome.id,fingerprint,rapidDevelopmentMean:nomination.meanRow,
    ...summarizeVariantTwo(episodes)});
  await setImmediate();
}
results.sort((a,b)=>b.meanRow-a.meanRow);
assert.ok(results.length);
const winner = results[0], payload = gunzipSync(fs.readFileSync(`${directory}/generations/${String(winner.generation).padStart(5,"0")}.json.gz`)).toString();
const population = parseEvolution<{contenders: Genome[]}>(payload).contenders;
const genome = population.find(g=>g.id===winner.genome)!;
const confirmationEpisodes = evaluateGenome(genome,protocol.confirmationDevelopmentSeeds,protocol.config.simulation);
const rapidEpisodes = evaluateGenome(genome,protocol.developmentSeeds,protocol.config.simulation);
winner.rapidDevelopmentMean = summarizeVariantTwo(rapidEpisodes).meanRow;
const [expected] = evaluateGenome(genome,[42],protocol.config.simulation), replay = new Replay([genome],42,protocol.config.simulation);
while(!replay.finished)replay.advance();
assert.equal(replay.current.sim.agent.maxRow,expected.score);assert.equal(replay.current.sim.tick,expected.ticks);
assert.equal(replay.current.sim.agent.deathReason,expected.deathReason);
const selected = {...summarizeVariantTwo(rapidEpisodes),generation:winner.generation,genome,episodes:rapidEpisodes,
  directory,lineageVariantTwoGenerations:protocol.lineageOffset+winner.generation};
atomic(output,JSON.stringify({sourceCheckpointSha256:head.snapshotSha256,sourceCheckpointGeneration:head.generation,
  candidateSource: cohortOption ? "entire-actual-cohort" : "training-nominees", fullCohortGeneration,
  candidateDevelopmentEpisodes:results.length*256,newCandidateDevelopmentEpisodes:(results.length-reusedCandidates)*256,
  reusedCandidates,reusedAuditSources,duplicateCandidatesSkipped:nominations.length-results.length,
  results,confirmationEpisodes,finalMapsOpened:false,replayMatched:true},null,2));
atomic(output.replace(/\.json$/,"-selected.json"),stringifyEvolution({selected,confirmationEpisodes}));
console.log(JSON.stringify({directory,candidates:results.length,winner,output},null,2));
if(process.argv.includes("--publish")) {
  let release: (() => void) | undefined;
  for (let attempt = 0; !release; attempt++) {
    try {release = acquireVariantTwoLock("results/variants/variant-2/promotion", "transfer", "development-publication");}
    catch (error) {
      if (attempt >= 100 || !(error instanceof Error) ||
        (!error.message.includes("already holds") && (error as NodeJS.ErrnoException).code !== "EEXIST")) throw error;
      await delay(50);
    }
  }
  try {
  const file="results/variants/variant-2/best-development.json";
  const old=JSON.parse(fs.readFileSync(file,"utf8")) as {meanRow:number};
  if(winner.meanRow>old.meanRow) {
    atomic(file,JSON.stringify({run:path.basename(directory),meanRow:winner.meanRow,selectedDirectory:directory,
      generation:winner.generation,genome:winner.genome,developmentMaps:protocol.confirmationDevelopmentSeeds,
      verificationFile:output,selectedFile:output.replace(/\.json$/,"-selected.json")},null,2));
    atomic("public/variant-2/transfer.json",stringifyEvolution({branch:`transfer · ${path.basename(directory)}`,generation:winner.generation,
      genomes:population,selectedGenome:winner.genome,seed:42,simulation:protocol.config.simulation,meanRow:winner.meanRow}));
    console.log("Promoted audited development winner; all final maps remain unopened.");
  }
  } finally {release();}
}
