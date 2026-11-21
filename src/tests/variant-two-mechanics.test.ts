/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamically executed upstream classes have no exported TS interfaces. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { GameSimulation } from "../core/simulation";
import { World, hazardsAt, generateRow, signalAt } from "../core/world";
import { sourceFramePosition, platformsAt, upstreamSupportAt, UPSTREAM_VARIANT_TWO_CONFIG as config } from "../core/upstream";
import type { Row } from "../core/types";

// Execute the pinned upstream methods themselves, rather than a second handwritten formula.
function upstreamClass(name: string) {
  const source=fs.readFileSync(new URL(`./fixtures/upstream/${name}.source.txt`,import.meta.url),"utf8").replace(/^import[\s\S]*?;\s*/gm,"");
  class Object3D { position={x:0,y:0,z:0}; children:unknown[]=[]; add(x:unknown){this.children.push(x);} }
  const module={exports:{} as {default: new (...args:unknown[])=>Record<string,unknown>}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module.exports,module,Object3D,Math,groundLevel:.4,AudioManager:{playAsync(){},sounds:{train:{move:{0:""}}}},TweenMax:{to(){}},clearTimeout(){},setTimeout(){},console});
  return module.exports.default;
}
test("source water frame arithmetic, strict supports and last-match attachment agree",()=>{
  const Water=upstreamClass("Water");
  // Arrow methods live on the instance; use a constructor adapter with just its dependencies.
  const source=fs.readFileSync(new URL("./fixtures/upstream/Water.source.txt",import.meta.url),"utf8").replace(/^import[\s\S]*?;\s*/gm,"");
  class Object3D { position={x:0,y:0,z:0};add(){} }
  const module={exports:{} as {default:new (...args:unknown[])=>Record<string,any>}};
  const tween={to(){}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module.exports,module,Object3D,Math,ModelLoader:{_river:{getNode:()=>({add(){},remove(){}})}},Foam:class{position={set(){}};visible=false;run(){}},TweenMax:tween,TweenLite:tween,Power2:{easeInOut:0},disableDriftwood:false});
  assert.ok(Water);
  const row=new module.exports.default(.7,()=>{});
  for(const speed of [-.07,-.02,.02,.07])for(const initial of [-15,-11,-6,0,11,15]){
    const entity={mesh:{position:{x:initial}},speed};
    for(let tick=1;tick<=1000;tick++){
      row.move({entity});
      assert.ok(Math.abs(entity.mesh.position.x-sourceFramePosition(initial,speed,tick))<1e-9);
    }
  }
  row.position.z=3;
  row.entities=[{mesh:{position:{x:0}},collisionBox:.75},{mesh:{position:{x:.1}},collisionBox:.75}];
  for(const x of [-.75,-.749,0,.85]){
    const first=row.getCollisionLog({x,z:3});
    const expected=row.entities.find((e:{mesh:{position:{x:number}},collisionBox:number})=>Math.abs(x-e.mesh.position.x)<e.collisionBox);
    assert.equal(first,expected);
  }
  const p={position:{x:0,z:3},isAlive:true};row.bounce=()=>{};
  for(const entity of row.entities)row.shouldCheckCollision({player:p,entity});
  assert.equal((p as typeof p & {ridingOn:unknown}).ridingOn,row.entities[1]);
});
test("source train drive and 15-flash signal interval agree at canonical60Hz",()=>{
  const source=fs.readFileSync(new URL("./fixtures/upstream/RailRoad.source.txt",import.meta.url),"utf8").replace(/^import[\s\S]*?;\s*/gm,"");
  class Object3D { position={x:0,y:0,z:0};add(){} }
  class Box3{min={x:0};max={x:20};setFromObject(){return this;}}
  const node=()=>({position:{x:0,y:0,z:0},rotation:{y:0},visible:true,add(){}});
  const module={exports:{} as {default:new (...args:unknown[])=>Record<string,any>}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module.exports,module,Object3D,Box3,Math,ModelLoader:{_railroad:{getNode:node},_trainLight:{getNode:node},_train:{withSize:node}},groundLevel:.4,clearTimeout(){},setTimeout(){},AudioManager:{playAsync(){},sounds:{train:{move:{0:""}}}}});
  const rail=new module.exports.default(.7,()=>{});rail.active=true;rail.startRingingLight=()=>{};
  const r:Row={index:3,type:"rail",blocked:[],vehicles:[],speed:-48,length:20,period:0,phase:0,warning:3,upstream:true,trainMiddles:2};
  for(let tick=1;tick<=1200;tick++){rail.drive({player:{position:{},moving:true}});assert.ok(Math.abs(hazardsAt(r,tick)[0].x+rail.train.mesh.position.x)<1e-9);}
  assert.equal(signalAt(r,137),false);assert.equal(signalAt(r,138),true);assert.equal(signalAt(r,317),true);assert.equal(signalAt(r,318),false);
});
test("seeded mixed worlds contain source-sized logs, lily pads and long trains without changing legacy maps",()=>{
  for(let seed=0;seed<20;seed++){
    const world=new World(seed,config);let roads=0;
    for(let i=0;i<200;i++){
      const row=world.row(i);assert.deepEqual(row,generateRow(seed,i,config));
      roads=row.type==="road"?roads+1:0;assert.ok(roads<=3);
      if(row.type==="water"){assert.ok([2,3].includes(row.platforms!.length));assert.ok(row.platforms!.every(p=>p.kind===(i%2===0?"lily":"log")));}
      if(row.type==="rail"){assert.equal(row.speed,-48);assert.ok([20,25].includes(row.length));}
    }
  }
});
test("water landing, idle drift, rounding, drowning and exact replays are deterministic",()=>{
  const s=new GameSimulation(config,42),row=s.world.row(7);s.tick=180;s.agent.row=7;s.agent.maxRow=7;s.agent.lastProgressTick=180;
  const p=platformsAt(row,s.tick).sort((a,b)=>Math.abs(a.x)-Math.abs(b.x))[0];s.agent.x=p.x;
  assert.equal(upstreamSupportAt(row,s.tick,p.x)?.id,p.id);
  s.step("WAIT",false);assert.equal(s.agent.alive,true);assert.equal(s.agent.ridingOn,p.id);assert.ok(Math.abs(s.agent.x-(p.x+p.speed*.2))<1e-9);
  const a=new GameSimulation(config,42),b=new GameSimulation(config,42);
  for(const action of ["UP","UP","WAIT","RIGHT","UP"] as const){a.step(action,false);b.step(action,false);assert.deepEqual(a.getState(),b.getState());}
  const drown=new GameSimulation(config,42);drown.agent.row=2;drown.agent.x=-4;drown.step("WAIT",false);assert.equal(drown.agent.deathReason,"water");
});
