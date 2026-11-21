/** Freeze and independently verify a development-selected model before final tests. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { parseCheckpoint } from "../src/evolution/checkpoint";
import { parseEvolution } from "../src/evolution/serialization";
import { type Genome } from "../src/evolution/genome";
import { evaluateGenome,mean,type Episode } from "../src/evolution/evaluation";
import { LONG_TEST_SEEDS, LONG_IMPROVEMENT_TEST_SEEDS, LONG_FURTHER_TEST_SEEDS,LONG_POST_FURTHER_TEST_SEEDS } from "../src/evolution/suites";
const source=process.argv[2],output=process.argv[3],archives=process.argv[4]??`${source}/generations`;
if(!source||!output)throw new Error("Usage: source new-output [archive-directory]");
if(fs.existsSync(output))throw new Error("Refusing to overwrite a frozen model");
const selectedText=fs.readFileSync(`${source}/selected.json`,"utf8"),checkpointText=fs.readFileSync(`${source}/checkpoint.json`,"utf8");
const checkpoint=parseCheckpoint(checkpointText),selected=parseEvolution<{genome:Genome;generation:number;meanRow:number;validationSeeds:number[];episodes:Episode[]}>(selectedText);
assert.equal(checkpoint.config.simulation.curriculum,"roads");assert.equal(checkpoint.config.simulation.maxTicks,36000);assert.equal(checkpoint.config.simulation.difficulty,1);
assert.ok(selected.generation>0&&selected.generation<=checkpoint.generation);
assert.ok(selected.validationSeeds.length>=768);
assert.equal(new Set(selected.validationSeeds).size,selected.validationSeeds.length);
assert.ok(selected.validationSeeds.every(seed=>!LONG_TEST_SEEDS.includes(seed)));
assert.ok(selected.validationSeeds.every(seed=>!LONG_IMPROVEMENT_TEST_SEEDS.includes(seed)));
assert.ok(selected.validationSeeds.every(seed=>!LONG_FURTHER_TEST_SEEDS.includes(seed)));
assert.ok(selected.validationSeeds.every(seed=>!LONG_POST_FURTHER_TEST_SEEDS.includes(seed)));
function policyHash(genome:Genome){
 return createHash("sha256").update(JSON.stringify({version:genome.observationVersion??1,nodes:genome.nodes,connections:genome.connections})).digest("hex");
}
const record=checkpoint.history.find(r=>r.generation===selected.generation);
assert.ok(record?.cohortFile);
const cohort=parseEvolution<{contenders:Genome[]}>(gunzipSync(fs.readFileSync(path.join(archives,path.basename(record.cohortFile)))).toString());
assert.equal(cohort.contenders.length,checkpoint.config.population);
const archived=cohort.contenders.find(g=>g.id===selected.genome.id);
assert.ok(archived);assert.equal(policyHash(archived),policyHash(selected.genome));
const verified=evaluateGenome(selected.genome,selected.validationSeeds,checkpoint.config.simulation);
assert.deepEqual(verified,selected.episodes);assert.equal(mean(verified.map(e=>e.score)),selected.meanRow);
fs.mkdirSync(`${output}/generations`,{recursive:true});
for(const r of checkpoint.history){
 assert.ok(r.cohortFile);const file=path.basename(r.cohortFile);
 fs.copyFileSync(path.join(archives,file),path.join(output,"generations",file));
}
fs.writeFileSync(`${output}/checkpoint.json`,checkpointText);fs.writeFileSync(`${output}/selected.json`,selectedText);
for(const filename of ["training-summary.json","provenance.json","ancestor-selected.json"])
 if(fs.existsSync(path.join(source,filename)))fs.copyFileSync(path.join(source,filename),path.join(output,filename));
const manifest={frozenAt:new Date().toISOString(),source,archiveSource:archives,selectedGeneration:selected.generation,selectedGenome:selected.genome.id,
 checkpointGeneration:checkpoint.generation,population:checkpoint.config.population,observationVersion:selected.genome.observationVersion??1,
 policySha256:policyHash(selected.genome),checkpointSha256:createHash("sha256").update(checkpointText).digest("hex"),
 verifiedDevelopmentEpisodes:verified.length,developmentMean:selected.meanRow,horizonSeconds:600,
 fullPopulationsCopied:checkpoint.history.length,
 reservedFinalSuite:"No final maps evaluated; use the unopened suite declared for this phase in docs/TRAINING_EXPERIMENTS.md"};
fs.writeFileSync(`${output}/freeze.json`,JSON.stringify(manifest,null,2));console.log(manifest);
