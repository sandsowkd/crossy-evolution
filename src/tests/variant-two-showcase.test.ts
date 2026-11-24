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
import {platformsAt,logSlotAt} from "../core/upstream";
import {variantTwoRowPlan} from "../core/variant-two-rules";
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

test("replay and AI race snapshots carry idle chickens with logs without making them hop",()=>{
 const replay=new Replay([policy.genome],42,policy.config);
 const row=33,log=platformsAt(replay.current.sim.world.row(row),0).find(p=>p.kind==="log"&&Math.abs(p.x)<2&&p.length>=3)!;
 assert.ok(log);
 Object.assign(replay.current.sim.agent,{row,maxRow:row,x:logSlotAt(log,log.x),ridingOn:log.id,ridingSpeed:log.speed,visualY:.2});
 replay.advance("WAIT");
 assert.ok(replay.current.sim.agent.alive);
 assert.notEqual(replay.current.previous.x,replay.current.sim.agent.x,"The frozen log physics still move the chicken");
 const unchanged=stringifyEvolution(replay.current.sim.agent);
 for(const alpha of [.1,.5,.9]){
  const agent=replay.snapshot(alpha).agents[0];
  assert.equal(agent.hop,0);
  assert.ok(Math.abs(agent.x-(replay.current.previous.x+(replay.current.sim.agent.x-replay.current.previous.x)*alpha))<1e-12);
 }
 assert.equal(stringifyEvolution(replay.current.sim.agent),unchanged,"Rendering never alters simulation state");
 const race=new RaceSession(policy,"42");
 Object.assign(race.bot.current.sim.agent,replay.current.previous);
 race.bot.advance("WAIT");race.advanceTicks(5);
 assert.equal(race.botState.hop,0);
 assert.equal(race.snapshot(0,"bot").agents[0].hop,0);
 replay.advance("RIGHT");
 assert.ok(replay.snapshot(.5).agents[0].hop>0,"Active movement still has a jump arc");
});

test("the selected preview maps show early logs and trains without lily pads through150",()=>{
 for(const seed of new Set(VARIANT_TWO_MILESTONES.map(m=>m.previewSeed))){
  const rows=Array.from({length:151},(_,index)=>variantTwoRowPlan(seed,index));
  assert.ok(rows.findIndex(r=>r.waterKind==="log")<=37);
  assert.ok(rows.findIndex(r=>r.type==="rail")<=31);
  assert.equal(rows.filter(r=>r.waterKind==="lily").length,0);
 }
 const flock=JSON.parse(read("public/variant-2/flock-preview.json"));
 assert.equal(flock.seed,318);assert.equal(flock.population,1500);
 assert.equal(flock.scoreRange.start,25);
 assert.equal(flock.scoreRange.end,125);
 assert.ok(flock.decisionRange.start>0);
});
