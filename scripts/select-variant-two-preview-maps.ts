/** Terrain-only presentation search. No policies, evaluation, holdouts or evolution. */
import fs from "node:fs";
import {variantTwoRowPlan} from "../src/core/variant-two-rules";

const candidates = Array.from({length:16384},(_,seed)=>{
  const rows=Array.from({length:1001},(_,index)=>variantTwoRowPlan(seed,index));
  const count=(start:number,end:number)=>{
    const window=rows.slice(start,end+1);
    return {logs:window.filter(r=>r.waterKind==="log").length,
      lilyPads:window.filter(r=>r.waterKind==="lily").length,
      trains:window.filter(r=>r.type==="rail").length,
      roads:window.filter(r=>r.type==="road").length};
  };
  const early=count(26,150),opening=count(26,75),long=count(26,1000);
  const firstLog=rows.findIndex(r=>r.waterKind==="log"),firstTrain=rows.findIndex(r=>r.type==="rail");
  const score=opening.logs+opening.trains*3+early.logs+early.trains*3-
    early.lilyPads*12-long.lilyPads*1.5-Math.max(firstLog-35,0)-Math.max(firstTrain-40,0);
  return {seed,firstLog,firstTrain,opening,early,long,score};
}).filter(c=>c.firstLog<=40 && c.firstTrain<=45 && c.early.lilyPads===0 && c.opening.logs>=6 && c.opening.trains>=2)
  .sort((a,b)=>b.score-a.score||a.seed-b.seed);
fs.mkdirSync(".publication",{recursive:true});
const report={createdAt:new Date().toISOString(),search:{firstSeed:0,lastSeed:16383,rows:[0,1000],rules:"clustered-traffic-v4",terrainOnly:true},
  selectionGoal:"Early logs/trains after the unchanged25-row introduction, zero lily pads through150, fewer lily pads later",candidates:candidates.slice(0,16),
  trainingEpisodes:0,evaluationEpisodes:0,reservedFinalMapsOpened:0};
fs.writeFileSync(".publication/variant2-preview-terrain-search.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
