import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Replay} from "../evolution/replay";
import {savedRacePolicy} from "../visualization/race-policy";
import {platformsAt} from "../core/upstream";
import {scheduledTrainAt, scheduledTrainSignal} from "../core/variant-two-rules";
import {trainLightVisible} from "../visualization/train-light";

const policy = savedRacePolicy(fs.readFileSync(new URL("../../public/variant-2/transfer.json",import.meta.url),"utf8"),2);

test("replay facing follows intentional hops, not moving logs, and survives waits and seeks",()=>{
  const replay = new Replay([policy.genome],42,policy.config);
  const sim = replay.current.sim;
  const log = platformsAt(sim.world.row(33),10).find(p=>p.kind==="log"&&Math.abs(p.x)<2&&p.length>=3)!;
  assert.ok(log);
  sim.agent.row=32;sim.agent.x=Math.round(log.x);
  replay.advance("UP");
  assert.ok(sim.agent.alive&&sim.agent.ridingOn);
  assert.equal(replay.snapshot(.5).agents[0].facing,"UP");
  const before=sim.agent.x;
  replay.advance("WAIT");
  assert.notEqual(sim.agent.x,before);
  assert.equal(replay.snapshot(.5).agents[0].facing,"UP");
  assert.equal(replay.snapshot(.5).agents[0].hop,0);
  replay.advance("LEFT");
  assert.equal(replay.snapshot(.5).agents[0].facing,"LEFT");

  const ordinary = new Replay([policy.genome],318,policy.config);
  for(let i=0;i<160;i++)ordinary.advance();
  const snapshot=ordinary.snapshot(.6);
  ordinary.seek(160);
  assert.deepEqual(ordinary.snapshot(.6),snapshot,"Scrubbing reconstructs orientation as well as physics");
});

test("train lights stop at the rendered tail rather than the conservative simulation clearance",()=>{
  const sim = new Replay([policy.genome],318,policy.config).current.sim;
  const row=Array.from({length:80},(_,i)=>sim.world.row(i)).find(row=>row.type==="rail")!;
  const arrival=row.trainSchedule!.arrivals[0];
  const bounds={min:-2.4375,max:(row.trainMiddles!+1)*5+2.4375};
  const visible=(tick:number)=>trainLightVisible(scheduledTrainSignal(row,tick).active,scheduledTrainAt(row,tick)&&{...scheduledTrainAt(row,tick)!,speed:row.speed},bounds);
  assert.equal(visible(arrival-row.trainSchedule!.warningTicks-1),false);
  assert.equal(visible(arrival-row.trainSchedule!.warningTicks),true,"The advance warning stays intact");
  assert.equal(visible(arrival),true);
  const clearance=(4.5-bounds.min)/(Math.abs(row.speed)/60);
  assert.equal(visible(arrival+clearance-.01),true,"Keep flashing until the actual tail leaves the crossing");
  assert.equal(visible(arrival+clearance+.01),false);
  assert.equal(scheduledTrainSignal(row,arrival+clearance+1).active,true,"Network observations retain the original window");
});

test("visual train clearance handles either direction and keeps warnings before entry",()=>{
  const bounds={min:-10,max:10};
  for(const [speed,approach,depart] of [[-48,20,-20],[48,-20,20]]){
    assert.equal(trainLightVisible(true,{x:approach,speed},bounds),true);
    assert.equal(trainLightVisible(true,{x:0,speed},bounds),true);
    assert.equal(trainLightVisible(true,{x:depart,speed},bounds),false);
    assert.equal(trainLightVisible(false,{x:0,speed},bounds),false);
  }
});
