import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import type {Genome} from "../evolution/genome";
import {parseEvolution,stringifyEvolution} from "../evolution/serialization";
import {savedRacePolicy} from "../visualization/race-policy";
import {RaceSession,raceSeed} from "../visualization/race-session";
import {Replay} from "../evolution/replay";
import type {ExplorerCatalog} from "../visualization/explorer-data";
import {resolveEntry} from "../visualization/explorer-selection";
import {milestoneUrl,replayUrl,siteRoute} from "../visualization/replay-links";
import {VARIANT_TWO_MILESTONES} from "../visualization/site-content";
const read=(p:string)=>fs.readFileSync(p,"utf8");
const catalog=JSON.parse(read("public/explorer-catalog.json")) as ExplorerCatalog;
const saved=read("public/variant-2/final-policy.json"),policy=savedRacePolicy(saved,2);

test("all150 Variant2 URLs resolve complete original populations, including arbitrary uint32 seeds",()=>{
 const sequence=catalog.variants.find(v=>v.id===2)!.sequence!;
 const provenance=JSON.parse(read("public/variant-2/showcase-provenance.json"));
 assert.equal(sequence.length,150);
 for(const row of sequence){
  const source=provenance.displayGenerations[row.generation-1];
  const bytes=fs.readFileSync(`public${row.cohortFile}`);
  if(fs.existsSync(source.sourceCohortFile)) assert.deepEqual(gunzipSync(bytes),gunzipSync(fs.readFileSync(source.sourceCohortFile)));
  const text=gunzipSync(bytes).toString(),genomes=parseEvolution<{contenders:Genome[]}>(text).contenders;
  assert.equal(createHash("sha256").update(text).digest("hex"),row.cohortHash);
  assert.deepEqual(genomes.map(g=>g.id),source.allOriginalIds);
  assert.equal(genomes.length,row.populationSize);
  for(const seed of [0,4294967295]){
   const route=siteRoute(new URL(replayUrl(row.generation,seed,2),"https://example.com"));
   assert.deepEqual(route,{page:"explorer",variant:2,generation:row.generation,seed,phase:"sequence"});
   assert.equal(resolveEntry(catalog,{variant:2,phase:"sequence",generation:row.generation,seed})!.cohortHash,row.cohortHash);
  }
 }
 for(const m of VARIANT_TWO_MILESTONES){
  const route=siteRoute(new URL(milestoneUrl(m.id),"https://example.com"));
  assert.deepEqual(route,{page:"explorer",variant:2,generation:m.generation,seed:m.previewSeed,phase:"sequence"});
 }
});

test("the fixed race opponent is byte-equivalent to the frozen original019 genome, not a seed-selected policy",()=>{
 const final=JSON.parse(saved),freeze=final.freeze;
 assert.equal(policy.genome.id,353089);assert.equal(policy.generation,150);
 const source=parseEvolution<{contenders:Genome[]}>(gunzipSync(fs.readFileSync(`public${catalog.variants.find(v=>v.id===2)!.sequence![149].cohortFile}`)).toString()).contenders.find(g=>g.id===policy.genome.id)!;
 assert.equal(stringifyEvolution(policy.genome),stringifyEvolution(source));
 assert.deepEqual(policy.config,freeze.simulation);
 assert.equal(policy.config.variantTwoRules,"clustered-traffic-v4");assert.equal(policy.config.maxTicks,36000);
 assert.equal(freeze.reservedFinalMapsOpened,false);
});

test("Variant2 race and ordinary replay choose identical AI moves and share the human map",()=>{
 for(const seed of ["0","4294967295","showcase-race"]){
  const race=new RaceSession(policy,seed),native=new Replay([policy.genome],raceSeed(seed),policy.config,{sparseObservations:true});
  race.command("UP");native.advance();
  for(let i=0;i<60 && !native.finished;i++){
   assert.deepEqual(race.bot.current.sim.agent,native.current.sim.agent);
   for(const row of [0,8,25,50])assert.deepEqual(race.player.world.row(row),race.bot.current.sim.world.row(row));
   race.advanceTicks(race.ticksPerHop);
   while(native.decisions<race.bot.decisions && !native.finished)native.advance();
  }
 }
});
