import test from "node:test";
import assert from "node:assert/strict";
import { World, hazardsAt, signalAt } from "../core/world";
import { CLUSTERED_VARIANT_TWO_V3_CONFIG as VARIANT_TWO_CONFIG, CLUSTERED_VARIANT_TWO_V2_CONFIG, VARIED_VARIANT_TWO_CONFIG, UPSTREAM_VARIANT_TWO_CONFIG, platformsAt } from "../core/upstream";
import { VARIANT_TWO_RULES, scheduledTrainSignal } from "../core/variant-two-rules";
import { GameSimulation } from "../core/simulation";
import type { Row } from "../core/types";

test("mixed maps allow five water/log rows, cap direction streaks and enforce meaningful speed differences", () => {
  const counts = {rows:0, logs:0, lilies:0, positive:0, fiveWater:0, fiveLogs:0};
  for (let seed = 0; seed < 180; seed++) {
    const world = new World(seed, VARIANT_TWO_CONFIG);
    let waters = 0, roads = 0, logs = 0, same = 0, previous = 0;
    for (let index = 0; index < 400; index++) {
      const row = world.row(index); counts.rows++;
      waters = row.type === "water" ? waters + 1 : 0;
      roads = row.type === "road" ? roads + 1 : 0;
      assert.ok(waters <= 5); assert.ok(roads <= 3);
      if (waters === 5) counts.fiveWater++;
      assert.equal(row.blocked.includes(0), false);
      if (row.platforms?.[0]?.kind === "log") {
        counts.logs++; if (row.speed > 0) counts.positive++;
        assert.ok(Math.abs(row.speed) >= .96 && Math.abs(row.speed) <= 3.36);
        assert.ok(row.platforms.every(p => p.speed === row.speed));
        if (logs) assert.ok(Math.abs(Math.abs(row.speed) - Math.abs(previous)) >= .64 - 1e-12);
        same = logs && Math.sign(previous) === Math.sign(row.speed) ? same + 1 : 1;
        assert.ok(same <= 2); logs++; if (logs === 5) counts.fiveLogs++;
        previous = row.speed;
      } else { logs = 0; same = 0; previous = 0; }
      if (row.platforms?.[0]?.kind === "lily") {
        counts.lilies++;
        assert.ok(row.platforms.some(p => p.offset === 0 && p.speed === 0));
        assert.equal(new Set(row.platforms.map(p => p.offset)).size, row.platforms.length);
        for (const neighbor of [index - 1, index + 1]) assert.equal(world.row(neighbor).blocked.includes(0), false);
      }
    }
  }
  assert.ok(counts.fiveWater > 0 && counts.fiveLogs > 0, JSON.stringify(counts));
  assert.ok(counts.positive / counts.logs > .47 && counts.positive / counts.logs < .53, JSON.stringify(counts));
  assert.ok(counts.lilies > 1000);
});

test("train arrivals are sparse, irregular, independent by track and shared by signals, hazards and physics", () => {
  const world = new World(42, VARIANT_TWO_CONFIG);
  const rails = Array.from({length:2000}, (_, i) => world.row(i)).filter(r => r.type === "rail");
  assert.ok(rails.length > 20);
  const firstArrivals = new Set<number>(), gaps = new Set<number>();
  for (const row of rails) {
    const times = row.trainSchedule!.arrivals; firstArrivals.add(times[0]);
    assert.ok(times[0] >= 252 && times[0] <= 756);
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i-1]; gaps.add(gap); assert.ok(gap >= 504 && gap <= 1008);
    }
    const tick = times[0], train = hazardsAt(row, tick)[0];
    assert.equal(train.x, 0); assert.equal(signalAt(row, tick), true);
    assert.equal(hazardsAt(row, tick - 138).length, 0);
    assert.equal(hazardsAt(row, tick + 138).length, 0);
    assert.equal(hazardsAt(row, tick + 300).length, 0);
    assert.equal(signalAt(row, tick - 121), false); assert.equal(signalAt(row, tick - 120), true);
    assert.equal(scheduledTrainSignal(row, tick - 120).phase, 0);
    assert.equal(scheduledTrainSignal(row, tick - 108).phase, 1);
    const sim = new GameSimulation(VARIANT_TWO_CONFIG, 42);
    sim.agent.row = row.index; sim.agent.maxRow = row.index; sim.agent.lastProgressTick = tick - 1;
    sim.tick = tick - 1; sim.step("WAIT", false);
    assert.equal(sim.agent.deathReason, "train");
  }
  assert.ok(firstArrivals.size > rails.length * .8); assert.ok(gaps.size > 100);
  // No common 276-tick train wrap schedule is used by the new rules.
  assert.equal(VARIANT_TWO_RULES.trainArrivalGapTicks[0] > 276, true);
});

test("pace revision scales every log by 20% and train arrival clocks by 30% through the full horizon",()=>{
  let logs=0,rails=0;
  for(let seed=0;seed<12;seed++){
    const previous=new World(seed,CLUSTERED_VARIANT_TWO_V2_CONFIG),current=new World(seed,VARIANT_TWO_CONFIG);
    for(let index=0;index<400;index++){
      const before=previous.row(index),after=current.row(index);
      assert.equal(after.type,before.type);assert.deepEqual(after.blocked,before.blocked);
      if(after.platforms?.[0]?.kind==="log"){
        logs++;assert.equal(after.speed,before.speed*.8);
        assert.equal(after.platformLoop,before.platformLoop);
        for(let i=0;i<after.platforms.length;i++){
          const p:NonNullable<Row["platforms"]>[number]=after.platforms[i],old:NonNullable<Row["platforms"]>[number]=before.platforms![i];
          assert.deepEqual({...p,speed:old.speed},old);assert.equal(p.speed,old.speed*.8);
        }
        const slow=platformsAt(after,600),old=platformsAt(before,480);
        for(let i=0;i<slow.length;i++)assert.ok(Math.abs(slow[i].x-old[i].x)<1e-9);
      }else if(after.trainSchedule){
        rails++;const old=before.trainSchedule!.arrivals,next=after.trainSchedule.arrivals;
        assert.deepEqual(next.slice(0,old.length),old.map(tick=>Math.round(tick*7/10)));
        for(let i=1;i<next.length;i++)assert.ok(next[i]-next[i-1]>=504&&next[i]-next[i-1]<=1008);
        assert.ok(next.at(-1)!>36000+120,"Trains must continue through the 600-second horizon");
        const late=next.find(tick=>tick>34000)!;
        assert.ok(hazardsAt(after,late).some(h=>h.x===0));
      }else assert.deepEqual(after,before);
    }
  }
  assert.ok(logs>300&&rails>100);
});

test("new rules are independent of row query order, cache eviction and renderer; old experiments retain their clock", () => {
  const a = new World(57, VARIANT_TWO_CONFIG), b = new World(57, VARIANT_TWO_CONFIG);
  const rows = Array.from({length:300}, (_, i) => structuredClone(a.row(i)));
  for (let i = 299; i >= 0; i--) assert.deepEqual(b.row(i), rows[i]);
  for (let seed=1000;seed<1064;seed++)new World(seed,VARIANT_TWO_CONFIG).row(300);
  for (let i = 0; i < 300; i++) assert.deepEqual(a.row(i), rows[i]);
  const old = new World(42, UPSTREAM_VARIANT_TWO_CONFIG);
  assert.equal(old.row(8).trainSchedule, undefined);
  assert.equal(hazardsAt(old.row(8), 100)[0].x, -80);
  assert.equal(old.row(7).platforms![0].kind, "log");
  const v1 = new World(42,VARIED_VARIANT_TWO_CONFIG);
  assert.equal(v1.row(8).trainSchedule!.arrivals[0], 822);
  assert.equal(v1.row(7).platforms!.length,2);
});

test("lily center is usable, log carry uses the generated speed, and inactivity still kills", () => {
  const world = new World(42, VARIANT_TWO_CONFIG), rows = Array.from({length:1200}, (_, i) => world.row(i));
  const lily = rows.find(r => r.platforms?.[0]?.kind === "lily")!;
  const onLily = new GameSimulation(VARIANT_TWO_CONFIG, 42);
  Object.assign(onLily.agent, {row:lily.index, maxRow:lily.index, x:0});
  onLily.step("WAIT", false); assert.equal(onLily.agent.alive, true); assert.equal(onLily.agent.x, 0);
  while (onLily.agent.alive) onLily.step("WAIT", false);
  assert.equal(onLily.agent.deathReason, "eagle"); assert.equal(onLily.tick, 600);
  const log = rows.find(r => r.platforms?.[0]?.kind === "log")!;
  const p = platformsAt(log, 180).sort((a,b) => Math.abs(a.x) - Math.abs(b.x))[0];
  const rider = new GameSimulation(VARIANT_TWO_CONFIG, 42); rider.tick = 180;
  Object.assign(rider.agent, {row:log.index, maxRow:log.index, x:p.x, lastProgressTick:180});
  rider.step("WAIT", false);
  assert.equal(rider.agent.alive, true); assert.ok(Math.abs(rider.agent.x - p.x - log.speed * .2) < 1e-9);
});

test("first 25 rows are road/grass and grouped hazards halve row density with the requested crossing means",()=>{
  const counts={newWater:0,newLog:0,newRail:0,oldWater:0,oldLog:0,oldRail:0,rows:0};
  const lengths={log:[] as number[],rail:[] as number[]};
  for(let seed=0;seed<120;seed++){
    const world=new World(seed,VARIANT_TWO_CONFIG),old=new World(seed,VARIED_VARIANT_TWO_CONFIG);
    for(let index=0;index<=25;index++)assert.ok(["grass","road"].includes(world.row(index).type));
    let log=0,rail=0;
    for(let index=26;index<2026;index++){
      const row=world.row(index),prior=old.row(index);counts.rows++;
      counts.newWater+=+(row.type==="water");counts.newLog+=+(row.platforms?.[0]?.kind==="log");counts.newRail+=+(row.type==="rail");
      counts.oldWater+=+(prior.type==="water");counts.oldLog+=+(prior.platforms?.[0]?.kind==="log");counts.oldRail+=+(prior.type==="rail");
      if(row.platforms?.[0]?.kind==="log")log++;else if(log){lengths.log.push(log);log=0;}
      if(row.type==="rail")rail++;else if(rail){lengths.rail.push(rail);rail=0;}
    }
  }
  for(const kind of ["Water","Log","Rail"] as const){
    const ratio=counts[`new${kind}`]/counts[`old${kind}`];assert.ok(Math.abs(ratio-.5)<.035,`${kind} ratio ${ratio}`);
  }
  const average=(a:number[])=>a.reduce((s,v)=>s+v,0)/a.length;
  assert.ok(Math.abs(average(lengths.log)-2.5)<.04,`Log length ${average(lengths.log)}`);
  assert.ok(Math.abs(average(lengths.rail)-1.7)<.04,`Rail length ${average(lengths.rail)}`);
  for(const length of [1,2,3,4,5])assert.ok(lengths.log.includes(length));
  for(const length of [1,2,3])assert.ok(lengths.rail.includes(length));
});

test("dense log conveyors have mixed original sizes and 1/2/3-tile edge gaps, including the wrap seam",()=>{
  const gaps={1:0,2:0,3:0};let checked=0;
  for(let seed=0;seed<25;seed++){
    const world=new World(seed,VARIANT_TWO_CONFIG);
    for(let index=26;index<400;index++){
      const row=world.row(index);if(!row.platformLoop)continue;
      checked++;assert.ok(row.platforms!.length>=6);assert.ok(new Set(row.platforms!.map(p=>p.variant)).size>=2);
      for(const tick of [0,1,137,600,36000]){
        const supports=platformsAt(row,tick).sort((a,b)=>a.x-b.x);
        for(let i=0;i<supports.length;i++){
          const a=supports[i],b=supports[(i+1)%supports.length];
          const distance:number=(i+1===supports.length?row.platformLoop:0)+b.x-a.x;
          const gap:number=distance-(a.visualLength!+b.visualLength!)/2;
          assert.ok(gap>=1-1e-9&&gap<=3+1e-9,`Gap ${gap} at tick ${tick}`);
          assert.ok(Math.abs(gap-Math.round(gap))<1e-9);
          if(tick===0)gaps[Math.round(gap) as 1|2|3]++;
        }
      }
    }
  }
  assert.ok(checked>500);assert.ok(gaps[1]>gaps[2]&&gaps[2]>gaps[3]&&gaps[3]>0);
});
