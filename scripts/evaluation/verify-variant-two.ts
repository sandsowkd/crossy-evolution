import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseEvolution } from "../../src/evolution/serialization";
import { evaluateGenome } from "../../src/evolution/evaluation";
import { Replay } from "../../src/evolution/replay";
import type { Genome } from "../../src/evolution/genome";
import { protocolSha256, readVariantTwoSnapshot, sha256, summarizeVariantTwo, writeVariantTwoAtomic,
  type VariantTwoProtocol } from "../../src/evolution/variant-two-experiment";

const run=process.argv.find(a=>a.startsWith("--run="))?.slice(6)??"paired-003";
assert.match(run,/^paired-\d{3}$/);
const root = `.archive/results/variant-2/${run}`;
const skipPublic = process.argv.includes("--skip-public");
const protocol = JSON.parse(fs.readFileSync(`${root}/protocol.json`, "utf8")) as VariantTwoProtocol;
const hash = protocolSha256(protocol);
const results = [];
for (const branch of ["scratch", "transfer"] as const) {
  // Validates committed native snapshot and every full evaluated population archive.
  const {head, snapshot} = readVariantTwoSnapshot(`${root}/${branch}`, hash, branch);
  assert.equal(head.generation, protocol.generationCap);
  assert.equal(snapshot.checkpoint.config.simulation.variantTwoRules, protocol.simulation.variantTwoRules);
  const selected = snapshot.selected!; assert.ok(selected);
  const cohortFile = `${root}/${branch}/generations/${String(selected.generation).padStart(5,"0")}.json.gz`;
  const cohort = parseEvolution<{contenders:Genome[]}>(gunzipSync(fs.readFileSync(cohortFile)).toString()).contenders;
  assert.deepEqual(cohort.find(g=>g.id===selected.genome.id), selected.genome);
  const episodes = evaluateGenome(selected.genome, protocol.developmentSeeds, protocol.simulation);
  assert.deepEqual(episodes, selected.episodes);
  assert.equal(summarizeVariantTwo(episodes).meanRow, selected.meanRow);
  const [expected] = evaluateGenome(selected.genome, [42], protocol.simulation);
  const replay = new Replay([selected.genome],42,protocol.simulation);
  while (!replay.finished) replay.advance();
  assert.equal(replay.current.sim.agent.maxRow, expected.score);
  assert.equal(replay.current.sim.tick, expected.ticks);
  assert.equal(replay.current.sim.agent.deathReason, expected.deathReason);
  if (!skipPublic) {
    const preview = parseEvolution<{generation:number; genomes:Genome[]; simulation:unknown}>(fs.readFileSync(`public/variant-2/${branch}.json`,"utf8"));
    const last = parseEvolution<{contenders:Genome[]}>(gunzipSync(fs.readFileSync(`${root}/${branch}/generations/00064.json.gz`)).toString());
    assert.equal(preview.generation, head.generation);
    assert.deepEqual(preview.simulation, protocol.simulation);
    assert.deepEqual(preview.genomes, last.contenders);
  }
  const ancestry = JSON.parse(fs.readFileSync(`${root}/${branch}/ancestry.json`,"utf8"));
  ancestry.newGenerationsAtInitialization = 0;
  ancestry.newGenerations = head.generation;
  writeVariantTwoAtomic(`${root}/${branch}/ancestry.json`, JSON.stringify(ancestry,null,2));
  results.push({branch,newGenerations:head.generation,population:100,trainingMapsPerGeneration:16,
    trainingEpisodes:head.generation*1600,inheritedPhasePositions:ancestry.inheritedPhasePositions,
    bestDevelopment:{generation:selected.generation,genome:selected.genome.id,...summarizeVariantTwo(episodes)},
    snapshotSha256:head.snapshotSha256,selectedPopulationSha256:sha256(fs.readFileSync(cohortFile)),
    fullPopulationsVerified:snapshot.checkpoint.history.length,developmentReplayMatched:true,publicPopulationMatched:skipPublic?null:true,
    viewerReplay:{seed:42,score:expected.score,ticks:expected.ticks,deathReason:expected.deathReason},
    seconds:snapshot.seconds});
}
const report = {protocolSha256:hash,rules:protocol.simulation.variantTwoRules,finalMapsOpened:false,results};
writeVariantTwoAtomic(`${root}/${skipPublic?"archive-verification":"verification"}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
