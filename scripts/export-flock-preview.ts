/** Sample immutable whole-run archives; never modify policies or training results. */
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import type { Genome } from "../src/evolution/genome";
import { parseEvolution } from "../src/evolution/serialization";
import { Replay } from "../src/evolution/replay";
import type { ExplorerCatalog } from "../src/visualization/explorer-data";
import type { HomepageData } from "../src/visualization/homepage-data";
import { highlightBestScore, highlightReplayConfig, HIGHLIGHT_REPLAY_OPTIONS } from "../src/visualization/highlight-playback";
const read = <T>(path: string) => parseEvolution<T>(fs.readFileSync(path,"utf8"));
const catalog = read<ExplorerCatalog>("public/explorer-catalog.json");
const sequence = catalog.variants[0].sequence!;
const genomes: Genome[] = [];
const sources = sequence.map(row => {
  const text = gunzipSync(fs.readFileSync(`public${row.cohortFile}`)).toString();
  assert.equal(createHash("sha256").update(text).digest("hex"), row.cohortHash);
  const cohort = parseEvolution<{contenders: Genome[]}>(text).contenders;
  assert.equal(cohort.length,row.populationSize);
  assert.equal(row.config.curriculum,"roads"); assert.equal(row.config.difficulty,1);
  // Evenly sample the stored population order, with ten distinct members per
  // display position. Keep native origins rather than claiming a continuous run.
  const selected = Array.from({length:10},(_,i)=>cohort[Math.floor((i+.5)*cohort.length/10)]);
  assert.equal(new Set(selected.map(genome=>genome.id)).size,10);
  genomes.push(...selected);
  return {generation:row.generation,sourcePhase:row.sourcePhase,sourceGeneration:row.sourceGeneration,
    cohortFile:row.cohortFile,cohortHash:row.cohortHash,genomeIds:selected.map(genome=>genome.id)};
});
assert.equal(genomes.length,1500);
const config = highlightReplayConfig(sequence.at(-1)!.config), seed = 561909326;
const replay = new Replay(genomes, seed, config, HIGHLIGHT_REPLAY_OPTIONS);
while(highlightBestScore(replay)<100 && !replay.finished) replay.advance();
assert.equal(highlightBestScore(replay),100,"The saved flock must actually reach the last recorded score");
const decisions=replay.decisions, seconds=decisions*.2;
const decisionRange={start:0,end:decisions};
fs.mkdirSync(".publication/homepage-preview-input",{recursive:true});
fs.writeFileSync(".publication/homepage-preview-input/flock.json",JSON.stringify({genomes,config})+"\n");
fs.writeFileSync("public/flock-preview.json",JSON.stringify({version:1,variant:1,seed,population:1500,
  generations:150,samplePerGeneration:10,decisions,seconds,playbackSpeed:1,scoreRange:{start:0,end:100},sources})+"\n");
const data=read<HomepageData>("public/homepage-data.json");
data.clips=data.clips.filter(clip=>clip.id!=="all-generations");
data.clips.push({id:"all-generations",variant:1,generation:150,population:1500,mapSeed:seed,
  highestScore:highlightBestScore(replay),decisions,seconds,decisionRange,
  sourceArchive:"public/flock-preview.json",previewKind:"population-mix",
  video:"/previews/all-generations.mp4?v=score-100-normal",poster:"/previews/all-generations.jpg?v=score-100-normal"});
fs.writeFileSync("public/homepage-data.json",JSON.stringify(data)+"\n");
console.log(`Sampled ${genomes.length} original chickens; score 100 at decision ${decisions}; ${seconds.toFixed(2)} second loop at 1x.`);
