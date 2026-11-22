import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../core/world";
import { GameSimulation } from "../core/simulation";
import { VARIANT_TWO_CONFIG, CLUSTERED_VARIANT_TWO_V3_CONFIG, platformsAt, upstreamSupportAt } from "../core/upstream";
import type { Row } from "../core/types";
import { ManualActions } from "../visualization/manual-actions";

test("V4 scales every log magnitude by 0.9, preserves other terrain, and matches 15% of neighboring directions", () => {
  let pairs=0,matches=0,logs=0;
  for(let seed=0;seed<250;seed++) {
    const old=new World(seed,CLUSTERED_VARIANT_TWO_V3_CONFIG),now=new World(seed,VARIANT_TWO_CONFIG);
    let previous=0,streak=0;
    for(let row=0;row<500;row++) {
      const before=old.row(row),after=now.row(row);
      if(after.platforms?.[0]?.kind!=="log") {assert.deepEqual(after,before);previous=0;streak=0;continue;}
      logs++;
      assert.equal(Math.abs(after.speed),Math.abs(before.speed)*.9);
      assert.deepEqual({...after,speed:before.speed,platforms:after.platforms.map((p,i)=>({...p,speed:before.platforms![i].speed}))},before);
      if(previous) {pairs++;matches+=+(Math.sign(previous)===Math.sign(after.speed));}
      streak=previous&&Math.sign(previous)===Math.sign(after.speed)?streak+1:1;
      assert.ok(streak<=2);previous=after.speed;
    }
  }
  assert.ok(logs>10000&&pairs>5000);
  assert.ok(Math.abs(matches/pairs-.15)<.012,`${matches}/${pairs}=${matches/pairs}`);
});

const water: Row={index:2,type:"water",upstream:true,blocked:[],speed:1.2,vehicles:[],period:0,phase:0,length:0,warning:0,
  platforms:[{offset:0,length:3,visualLength:3,speed:1.2,kind:"log",variant:2}]};
test("half-overlap landings snap to edge slots, horizontal hops follow the moving log's slots, and open water kills",()=>{
  const edge=new GameSimulation(VARIANT_TWO_CONFIG,42);
  const still:Row={...water,speed:0,platforms:[{...water.platforms![0],offset:-.5,speed:0}]};
  edge.world.row=(index:number)=>index===2?still:{...water,index,type:"grass",platforms:[],speed:0};
  Object.assign(edge.agent,{row:1,maxRow:1,x:1});
  edge.step("UP",false);
  assert.equal(edge.agent.alive,true);assert.equal(edge.agent.row,2);assert.equal(edge.agent.x,.5);
  const sim=new GameSimulation(VARIANT_TWO_CONFIG,42);
  sim.world.row=(index:number)=>index===2?water:{...water,index,type:"grass",platforms:[],speed:0};
  Object.assign(sim.agent,{row:1,maxRow:1,x:2});
  // At tick10 the log center is0.2; its right edge is1.7. x=2 misses the .25 tolerance.
  sim.step("UP",false);assert.equal(sim.agent.deathReason,"water");
  sim.reset(42);sim.world.row=(index:number)=>index===2?water:{...water,index,type:"grass",platforms:[],speed:0};
  Object.assign(sim.agent,{row:2,maxRow:2,x:1.5});
  sim.step("WAIT",false);assert.equal(sim.agent.alive,true);
  const p=platformsAt(water,sim.tick)[0];
  assert.ok(Math.abs(sim.agent.x-(p.x+1+water.speed/60))<1e-9);
  sim.step("LEFT",false);
  const moved=platformsAt(water,sim.tick)[0];
  assert.ok(Math.abs(sim.agent.x-(moved.x+water.speed/60))<1e-9);
  sim.step("LEFT",false);
  assert.ok(Math.abs(sim.agent.x-(platformsAt(water,sim.tick)[0].x-1+water.speed/60))<1e-9);
  assert.ok(upstreamSupportAt(water,0,1.5));
  assert.equal(upstreamSupportAt(water,0,1.75),undefined);
});

test("V4 completes six hops each second while V3 replays retain five",()=>{
  const now=new GameSimulation(VARIANT_TWO_CONFIG,0),old=new GameSimulation(CLUSTERED_VARIANT_TWO_V3_CONFIG,0);
  for(let n=0;n<6;n++){now.step("WAIT",false);old.step("WAIT",false);}
  assert.equal(now.tick,60);assert.equal(old.tick,72);
});

test("quick distinct taps are queued in order and held keys do not accumulate a backlog",()=>{
  const queue=new ManualActions();
  queue.enqueue("UP");queue.enqueue("UP");queue.enqueue("RIGHT");queue.enqueue("RIGHT",true);
  assert.deepEqual([queue.take(),queue.take(),queue.take(),queue.take()],["UP","UP","RIGHT","WAIT"]);
  queue.enqueue("LEFT");queue.clear();assert.equal(queue.take(),"WAIT");
});
