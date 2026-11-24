import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {parseEvolution} from "../evolution/serialization";
import {Replay} from "../evolution/replay";
import {GameSimulation} from "../core/simulation";
import type {Genome} from "../evolution/genome";
import {raceAction, raceSwipe, raceSeed, RaceSession, RACE_OFFSCREEN_GRACE_TICKS, RACE_TRAILING_ROWS, type RacePolicy} from "../visualization/race-session";
import {raceEaglePose, RACE_EAGLE_GRAB_TICK, RACE_EAGLE_TICKS} from "../visualization/race-eagle";
import {insideCamera, RaceCameraVisibility} from "../visualization/scene-visibility";
import {savedRacePolicy} from "../visualization/race-policy";
import {platformsAt} from "../core/upstream";
import {siteRoute} from "../visualization/replay-links";
import type {HomepageData} from "../visualization/homepage-data";
const read=<T>(path:string)=>parseEvolution<T>(fs.readFileSync(new URL(`../../${path}`,import.meta.url),"utf8"));
const manifest=read<{entries:(RacePolicy & {id:string})[]}>("public/highlights.json");
const policy=manifest.entries.find(entry=>entry.id==="variant-1-final")!;

test("numeric and arbitrary text seeds make repeatable, shareable maps",()=>{
  for(const seed of [0,42,561909326,4294967295])assert.equal(raceSeed(String(seed)),seed);
  for(const seed of ["my map","你好🐔","a/b?&=+", "4294967296"]){
    assert.equal(raceSeed(seed),raceSeed(seed));
    assert.ok(raceSeed(seed)>=0 && raceSeed(seed)<=0xffffffff);
    const shared=new URL(`/play?${new URLSearchParams({seed})}`,"https://crossy.example");
    assert.equal(shared.searchParams.get("seed"),seed);
    assert.deepEqual(siteRoute(shared),{page:"play"});
    assert.deepEqual(new RaceSession(policy,seed).player.world.row(8),new RaceSession(policy,shared.searchParams.get("seed")!).player.world.row(8));
  }
  assert.equal(raceSeed("  café  "),raceSeed("cafe\u0301"));
  assert.notEqual(raceSeed("chicken"),raceSeed("Chicken"));
});

test("WASD, arrow keys and Space map to movement without changing explorer controls",()=>{
  for(const [key,action] of [["ArrowUp","UP"],["w","UP"],["W","UP"],[" ","UP"],["s","DOWN"],["ArrowLeft","LEFT"],["D","RIGHT"]])assert.equal(raceAction(key),action);
  assert.equal(raceAction("Escape"),undefined);
});

test("screen swipes use a deliberate threshold and the same four directions as keys",()=>{
  assert.equal(raceSwipe(8,-12),undefined,"A small pointer wobble remains a tap");
  for(const [x,y,action] of [[0,-30,"UP"],[0,30,"DOWN"],[-30,4,"LEFT"],[30,-4,"RIGHT"]] as const)
    assert.equal(raceSwipe(x,y),action);
});

test("the ghost uses the exact frozen final policy independent of the human's decisions",()=>{
  const original=JSON.stringify(policy);
  const race=new RaceSession(policy,"42");
  const solo=new Replay([policy.genome],42,race.config,race.bot.options);
  for(let step=0;step<160;step++){
    race.advance(step%7===0?"UP":"WAIT"); solo.advance();
    assert.deepEqual(race.bot.current.sim.agent,solo.current.sim.agent);
  }
  assert.equal(JSON.stringify(policy),original,"Race must never train, mutate, or overwrite the saved brain");
  assert.equal(policy.config.maxTicks,36000);
  assert.equal(race.config.maxTicks,Number.MAX_SAFE_INTEGER);
  for(let row=0;row<30;row++)assert.deepEqual(race.player.world.row(row),race.bot.current.sim.world.row(row));
});

test("preview traffic runs while both chickens wait, and the first move starts at the current traffic time",()=>{
  const race=new RaceSession(policy,"561909326");
  const before=race.snapshot();
  race.advanceTicks(617);
  assert.equal(race.tick,617);
  assert.equal(race.bot.decisions,0);
  assert.equal(race.hasStarted,false);
  const preview=race.snapshot();
  assert.notDeepEqual(preview.hazards,before.hazards);
  assert.deepEqual(preview.agents,before.agents);
  assert.equal(race.cameraRow,0,"The screen must not leave the player behind before starting");
  race.command("UP");
  assert.deepEqual(race.snapshot().hazards,preview.hazards,"Starting never resets traffic");
  assert.equal(race.hasStarted,true);
  assert.equal(race.bot.decisions,1);
  assert.equal(race.bot.current.ticks,617);
  assert.ok(race.bot.current.sim.agent.lastProgressTick!>=617,"Preview time never counts against the AI's eagle timer");
  assert.equal(race.playerState.row,0,"Forecasting must not teleport either chicken");
  race.advanceTicks();
  assert.equal(race.playerState.row,1/12,"The first physics tick already moves the human");
  assert.equal(race.playerState.maxRow,0,"Score is awarded when the hop completes");
  race.advanceTicks(11);
  assert.equal(race.playerState.row,1);
  assert.equal(race.playerState.maxRow,1);
});

test("the AI still uses the original policy cadence after an arbitrary-length preview",()=>{
  const race=new RaceSession(policy,"42");
  race.advanceTicks(137);
  const solo=new Replay([policy.genome],42,race.config,race.bot.options);
  solo.current.sim.tick=137;
  solo.current.sim.agent.lastProgressTick=137;
  for(let i=0;i<100;i++){
    race.advance(i===0?"UP":"WAIT"); solo.advance();
    assert.deepEqual(race.bot.current.sim.agent,solo.current.sim.agent);
  }
});

test("Variant 2 races use the selected development brain with its original timing and physics",()=>{
  const text=fs.readFileSync(new URL("../../public/variant-2/transfer.json",import.meta.url),"utf8");
  const saved=parseEvolution<{selectedGenome:number;generation:number}>(text);
  const development=savedRacePolicy(text,2),original=JSON.stringify(development);
  assert.equal(development.genome.id,saved.selectedGenome);
  assert.equal(development.generation,saved.generation);
  const race=new RaceSession(development,"42"),previewTicks=137;
  race.advanceTicks(previewTicks);
  const solo=new Replay([development.genome],42,development.config,race.bot.options);
  solo.current.sim.tick=previewTicks;
  solo.current.sim.config.maxTicks+=previewTicks;
  solo.current.sim.agent.lastProgressTick=previewTicks;
  assert.equal(race.ticksPerHop,10);
  for(let i=0;i<180;i++){
    race.advance(i===0?"UP":"WAIT");solo.advance();
    assert.deepEqual(race.bot.current.sim.agent,solo.current.sim.agent);
    assert.equal(race.bot.current.sim.tick,solo.current.sim.tick);
  }
  assert.equal(JSON.stringify(development),original);
  assert.equal(race.bot.current.sim.config.maxTicks,development.config.maxTicks+previewTicks);
  const snapshot=race.snapshot(0,"bot");
  assert.ok(snapshot.rows.some(row=>row.type==="water"));
  assert.deepEqual(snapshot.supports,snapshot.rows.flatMap(row=>platformsAt(race.player.world.row(row.index),snapshot.tick!)));
  const final=savedRacePolicy(fs.readFileSync(new URL("../../public/highlights.json",import.meta.url),"utf8"),1);
  assert.equal(final.genome.id,policy.genome.id);
});

test("interrupting a Variant 2 wait on a log preserves the drift already elapsed",()=>{
  const development=savedRacePolicy(fs.readFileSync(new URL("../../public/variant-2/transfer.json",import.meta.url),"utf8"),2);
  const race=new RaceSession(development,"42");
  const log=platformsAt(race.player.world.row(33),10).find(p=>p.kind==="log"&&Math.abs(p.x)<2&&p.length>=3)!;
  assert.ok(log,"This deterministic case must include the recorded moving log");
  race.player.agent.row=32;race.player.agent.x=Math.round(log.x);
  race.command("UP");race.advanceTicks(10);
  assert.ok(race.playerState.alive);
  assert.ok(race.player.agent.ridingOn);
  const landed=race.playerState.x,drift=race.player.agent.ridingSpeed!;
  race.advanceTicks(3);
  assert.ok(Math.abs(race.playerState.x-(landed+drift*3/60))<1e-12);
  const before=race.playerState.x;
  race.command("LEFT");
  assert.ok(Math.abs(race.playerState.x-before)<1e-12,"A new input must not snap the chicken back along the log");
  race.advanceTicks();assert.ok(race.playerState.x<before);
});

test("human input interrupts idle immediately and only the latest extra tap can queue",()=>{
  const race=new RaceSession(policy,"561909326");
  race.command("UP"); race.advanceTicks(15);
  assert.equal(race.playerState.row,1);
  race.command("LEFT"); race.advanceTicks();
  assert.equal(race.playerState.x,-1/12,"No wait for the next 12-tick AI decision boundary");
  race.advanceTicks(3);
  race.command("RIGHT"); race.command("LEFT"); race.command("RIGHT");
  race.advanceTicks(8);
  assert.equal(race.playerState.x,-1);
  race.advanceTicks(12); assert.equal(race.playerState.x,0);
  race.advanceTicks(24); assert.equal(race.playerState.x,0,"A burst adds at most one hop after the current hop");
});

test("old taps expire and a fresh input on landing replaces any pending direction",()=>{
  const expired=new RaceSession(policy,"561909326");
  expired.command("UP"); expired.advanceTicks(); expired.command("LEFT");
  expired.advanceTicks(35);
  assert.equal(expired.playerState.x,0,"A 150 ms buffer must not execute an old early-hop tap");
  const landing=new RaceSession(policy,"561909326");
  landing.command("UP"); landing.advanceTicks(6); landing.command("LEFT");
  landing.advanceTicks(6); landing.command("RIGHT"); landing.advanceTicks(36);
  assert.equal(landing.playerState.x,1,"The superseded left input must never run later");
});

test("ten rapid taps during five hop durations produce at most one extra hop",()=>{
  const race=new RaceSession(policy,"561909326");
  let hops=0,lastForecast=0;
  for(let tick=0;tick<96;tick++){
    if(tick<60 && tick%6===0) race.command(tick%24<12?"LEFT":"RIGHT");
    race.advanceTicks();
    if(race.player.tick!==lastForecast){
      if(race.player.agent.lastAction!=="WAIT")hops++;
      lastForecast=race.player.tick;
    }
  }
  assert.equal(hops,6);
  assert.ok(race.playerState.alive);
});

test("race boundaries block sideways moves and allow the grass apron behind row zero",()=>{
  for(const direction of ["LEFT","RIGHT"] as const){
    const race=new RaceSession(policy,"561909326");
    for(let i=0;i<7;i++)race.advance(direction);
    assert.equal(race.playerState.x,direction==="LEFT"?-4:4);
    assert.ok(race.playerState.alive);
    assert.equal(race.player.agent.blocked,true);
  }
  const race=new RaceSession(policy,"561909326");
  for(let row=-1;row>=-3;row--){race.advance("DOWN");assert.equal(race.playerState.row,row);assert.ok(race.playerState.alive);}
  race.advance("DOWN");
  assert.equal(race.playerState.row,-3,"The visible trees block the fourth backward hop");
  assert.equal(race.player.agent.blocked,true);
  assert.ok(race.playerState.alive);
  race.advance("UP"); assert.equal(race.playerState.row,-2);
  const archived=new GameSimulation(policy.config,561909326);
  archived.step("DOWN",false);
  assert.equal(archived.agent.deathReason,"bounds","Archived training/replay physics are untouched");
});

test("backward hops never pull the camera back or reset its trailing boundary",()=>{
  const race=new RaceSession(policy,"561909326");
  race.command("UP"); race.advanceTicks(12);
  const front=race.cameraRow;
  race.command("DOWN"); race.advanceTicks(12);
  assert.equal(race.playerState.row,0);
  assert.ok(race.cameraRow>front);
  assert.ok(race.playerState.alive);
  for(let i=0;i<500 && race.playerState.alive;i++) {
    const previous=race.cameraRow;
    race.advanceTicks();
    assert.ok(race.cameraRow>=previous);
  }
  assert.equal(race.playerState.deathReason,"eagle");
  assert.ok(race.cameraRow-race.playerState.row>RACE_TRAILING_ROWS);
  assert.equal(race.player.config.eagle,undefined,"Screen pressure is confined to the Race human");
  assert.ok(race.bot.config.eagle,"The saved AI keeps the original viewing rules");
});

test("leaving the actual viewport gets a recoverable grace period before eagle capture",()=>{
  const race=new RaceSession(policy,"561909326");
  race.command("UP"); race.advanceTicks(12);
  race.setPlayerOffscreen(true); race.advanceTicks(RACE_OFFSCREEN_GRACE_TICKS-1);
  assert.ok(race.playerState.alive);
  race.setPlayerOffscreen(false); race.advanceTicks();
  race.setPlayerOffscreen(true); race.advanceTicks(RACE_OFFSCREEN_GRACE_TICKS-1);
  assert.ok(race.playerState.alive,"Returning to view resets the offscreen grace period");
  race.advanceTicks();
  assert.equal(race.playerState.deathReason,"eagle");
  assert.equal(race.snapshot().agents[0].eagle?.swoopFromTop,true);
  assert.equal(race.snapshot().agents[0].eagle?.captureTicks,0);
});

test("the shared clock keeps traffic aligned after capture and supports a separate AI camera",()=>{
  const race=new RaceSession(policy,"42");
  race.command("UP");
  race.advanceTicks(660);
  assert.equal(race.player.agent.deathReason,"eagle");
  assert.ok(race.player.tick<race.tick);
  assert.ok(race.bot.current.sim.agent.alive);
  const main=race.snapshot(),mini=race.snapshot(0,"bot");
  assert.equal(main.focus,race.cameraRow);
  assert.equal(mini.focus,race.botState.row);
  assert.ok(mini.focus>main.focus);
  assert.equal(main.agents.find(agent=>agent.id===1)!.opacity,.7);
  assert.equal(main.agents.find(agent=>agent.id===0)!.opacity,undefined);
  assert.equal(main.tick,mini.tick);
  assert.equal(main.tick,660,"Traffic uses the shared clock, never the dead player's stopped clock");
  assert.ok(main.agents[0].eagle?.captured);
  assert.equal(main.agents[1].eagle,undefined,"The ghost never takes over the human's eagle animation");
  assert.deepEqual(mini.agents.map(agent=>agent.id),[1]);
});

test("the race eagle descends before pickup, then lifts the chicken and departs",()=>{
  const entry=raceEaglePose(0),grab=raceEaglePose(RACE_EAGLE_GRAB_TICK);
  const departure=raceEaglePose(RACE_EAGLE_GRAB_TICK+30),exit=raceEaglePose(RACE_EAGLE_TICKS);
  assert.ok(entry.height>10); assert.equal(entry.lift,0);
  assert.equal(grab.x,0); assert.equal(grab.row,0); assert.equal(grab.lift,0);
  assert.ok(grab.height<entry.height);
  assert.ok(departure.lift>0); assert.ok(Math.abs(departure.height-grab.height-departure.lift)<1e-12);
  assert.equal(departure.finished,false); assert.equal(exit.finished,true);
});

test("the AI camera is triggered by actual projected camera bounds, including behind-camera positions",()=>{
  assert.ok(insideCamera({x:0,y:0,z:0}));
  for(const point of [{x:1,y:0,z:0},{x:0,y:-1,z:0},{x:0,y:0,z:2},{x:0,y:0,z:-2}])assert.equal(insideCamera(point),false);
});

test("the AI camera stays visible for at least five seconds, even if the chicken returns immediately",()=>{
  const camera=new RaceCameraVisibility();
  assert.equal(camera.update(true,0),false);
  assert.equal(camera.update(false,1000),true);
  assert.equal(camera.update(true,1100),true);
  assert.equal(camera.update(true,5999),true);
  assert.equal(camera.update(true,6000),false);
});

test("the AI camera needs two uninterrupted seconds on the main screen after any edge flicker",()=>{
  const camera=new RaceCameraVisibility();
  assert.equal(camera.update(false,0),true);
  assert.equal(camera.update(true,1000),true);
  assert.equal(camera.update(false,2900),true);
  assert.equal(camera.update(true,4000),true);
  assert.equal(camera.update(true,5999),true);
  assert.equal(camera.update(true,6000),false);
  assert.equal(camera.update(false,6100),true,"Going off screen opens a fresh five-second window");
  camera.reset();
  assert.equal(camera.update(true,6200),false,"A new race clears the previous camera timing");
});

test("the crowd contains exactly ten unmodified original chickens from each of the 150 displayed generations",()=>{
  const crowd=read<{population:number;generations:number;samplePerGeneration:number;playbackSpeed:number;scoreRange:{start:number;end:number};decisions:number;seconds:number;sources:{generation:number;cohortFile:string;cohortHash:string;genomeIds:number[]}[]}>("public/flock-preview.json");
  assert.equal(crowd.population,1500);assert.equal(crowd.generations,150);assert.equal(crowd.samplePerGeneration,10);
  assert.deepEqual(crowd.sources.map(row=>row.generation),Array.from({length:150},(_,i)=>i+1));
  for(const source of crowd.sources){
    const text=gunzipSync(fs.readFileSync(new URL(`../../public${source.cohortFile}`,import.meta.url))).toString();
    assert.equal(createHash("sha256").update(text).digest("hex"),source.cohortHash);
    const cohort=parseEvolution<{contenders:Genome[]}>(text).contenders;
    assert.equal(new Set(source.genomeIds).size,10);
    assert.deepEqual(source.genomeIds,Array.from({length:10},(_,i)=>cohort[Math.floor((i+.5)*cohort.length/10)].id));
  }
  const clip=read<HomepageData>("public/homepage-data.json").clips.find(clip=>clip.id==="all-generations")!;
  assert.equal(clip.population,1500);assert.equal(clip.previewKind,"population-mix");
  assert.equal(clip.highestScore,100);
  assert.equal(clip.decisions,156);
  assert.equal(clip.seconds,156*.2);
  assert.deepEqual(clip.decisionRange,{start:0,end:156});
  assert.equal(crowd.playbackSpeed,1);
  assert.deepEqual(crowd.scoreRange,{start:0,end:100});
  assert.equal(crowd.decisions,clip.decisions); assert.equal(crowd.seconds,clip.seconds);
});
