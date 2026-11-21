import assert from "node:assert/strict";
import fs from "node:fs";
import { World } from "../src/core/world";
import { VARIANT_TWO_CONFIG, VARIED_VARIANT_TWO_CONFIG, platformsAt } from "../src/core/upstream";
import { VARIANT_TWO_RULES } from "../src/core/variant-two-rules";

const seeds=200, rowsPerSeed=2000, firstRow=26, endRow=firstRow+rowsPerSeed;
const counts={grass:0,road:0,rail:0,water:0,logRows:0,lilyRows:0,positiveLogs:0,negativeLogs:0};
const prior={rail:0,water:0,logRows:0};
const crossingLengths={log:[] as number[],water:[] as number[],rail:[] as number[]};
const gapCounts={1:0,2:0,3:0}, logCounts:number[]=[];
let maximumSameDirection=0,minimumLogSpeed=Infinity,maximumLogSpeed=0,minimumAdjacentSpeedDifference=Infinity;
let centerPadViolations=0,centerObstacleViolations=0,introViolations=0,minimumGap=Infinity,maximumGap=0;
const trainGaps=new Set<number>(),trainFirstArrivals=new Set<number>();
const examples:Record<string,{seed:number;startRow:number}>={};
for(let seed=0;seed<seeds;seed++){
  const world=new World(seed,VARIANT_TWO_CONFIG),old=new World(seed,VARIED_VARIANT_TWO_CONFIG);
  for(let index=0;index<=25;index++)if(!["grass","road"].includes(world.row(index).type))introViolations++;
  const active={log:{start:0,length:0},water:{start:0,length:0},rail:{start:0,length:0}};
  let same=0,previous=0;
  // Extra rows close crossing groups that start inside the measured interval.
  for(let index=firstRow;index<endRow+6;index++){
    const row=world.row(index),log=row.platforms?.[0]?.kind==="log";
    for(const kind of ["log","water","rail"] as const){
      const matches=kind==="log"?log:row.type===(kind==="water"?"water":"rail"),run=active[kind];
      if(matches){if(!run.length)run.start=index;run.length++;}
      else if(run.length){
        if(run.start<endRow){crossingLengths[kind].push(run.length);examples[`${kind}-${run.length}`]??={seed,startRow:run.start};}
        run.length=0;
      }
    }
    if(index>=endRow)continue;
    counts[row.type]++;
    const before=old.row(index);prior.water+=+(before.type==="water");prior.rail+=+(before.type==="rail");prior.logRows+=+(before.platforms?.[0]?.kind==="log");
    if(row.blocked.includes(0))centerObstacleViolations++;
    if(log){
      counts.logRows++;counts[row.speed>0?"positiveLogs":"negativeLogs"]++;
      minimumLogSpeed=Math.min(minimumLogSpeed,Math.abs(row.speed));maximumLogSpeed=Math.max(maximumLogSpeed,Math.abs(row.speed));
      if(previous)minimumAdjacentSpeedDifference=Math.min(minimumAdjacentSpeedDifference,Math.abs(Math.abs(row.speed)-Math.abs(previous)));
      same=previous&&Math.sign(previous)===Math.sign(row.speed)?same+1:1;maximumSameDirection=Math.max(maximumSameDirection,same);previous=row.speed;
      const supports=platformsAt(row,0).sort((a,b)=>a.x-b.x);logCounts.push(supports.length);
      for(let i=0;i<supports.length;i++){
        const a=supports[i],b=supports[(i+1)%supports.length];
        const gap=(i+1===supports.length?row.platformLoop!:0)+b.x-a.x-(a.visualLength!+b.visualLength!)/2;
        minimumGap=Math.min(minimumGap,gap);maximumGap=Math.max(maximumGap,gap);gapCounts[Math.round(gap) as 1|2|3]++;
      }
    }else{same=0;previous=0;}
    if(row.platforms?.[0]?.kind==="lily"){counts.lilyRows++;if(!row.platforms.some(p=>p.offset===0))centerPadViolations++;}
    if(row.trainSchedule){trainFirstArrivals.add(row.trainSchedule.arrivals[0]);for(let i=1;i<row.trainSchedule.arrivals.length;i++)trainGaps.add(row.trainSchedule.arrivals[i]-row.trainSchedule.arrivals[i-1]);}
  }
}
const mean=(a:number[])=>a.reduce((sum,n)=>sum+n,0)/a.length;
const histogram=(a:number[])=>Object.fromEntries([...new Set(a)].sort((a,b)=>a-b).map(n=>[n,a.filter(v=>v===n).length]));
const ratio={water:counts.water/prior.water,logRows:counts.logRows/prior.logRows,rail:counts.rail/prior.rail};
assert.equal(introViolations+centerPadViolations+centerObstacleViolations,0);assert.equal(maximumSameDirection,2);
assert.ok(minimumGap>=1-1e-9&&maximumGap<=3+1e-9);assert.ok(minimumAdjacentSpeedDifference>=VARIANT_TWO_RULES.logSpeedDifferenceMin-1e-9);
assert.ok(Math.abs(mean(crossingLengths.log)-2.5)<.04);assert.ok(Math.abs(mean(crossingLengths.rail)-1.7)<.04);
assert.ok(Object.values(ratio).every(r=>Math.abs(r-.5)<.035));
assert.ok(Math.min(...trainGaps)>=VARIANT_TWO_RULES.trainArrivalGapTicks[0]&&Math.max(...trainGaps)<=VARIANT_TWO_RULES.trainArrivalGapTicks[1]);
const report={rules:VARIANT_TWO_RULES,config:VARIANT_TWO_CONFIG,seeds,rowsPerSeed,measuredRowRange:[firstRow,endRow-1],totalMeasuredRows:seeds*rowsPerSeed,
  counts,previousRulesCountsOnSameRows:prior,densityRatioVsPrevious:ratio,
  meanLogCrossingLength:mean(crossingLengths.log),meanWaterCrossingLength:mean(crossingLengths.water),meanRailCrossingLength:mean(crossingLengths.rail),
  logCrossingLengths:histogram(crossingLengths.log),railCrossingLengths:histogram(crossingLengths.rail),
  logsPerMovingRow:{minimum:Math.min(...logCounts),maximum:Math.max(...logCounts),mean:mean(logCounts)},
  minimumGap,maximumGap,gapCounts,maximumSameDirection,minimumLogSpeed,maximumLogSpeed,minimumAdjacentSpeedDifference,
  centerPadViolations,centerObstacleViolations,introViolations,distinctFirstTrainArrivalTicks:trainFirstArrivals.size,
  distinctTrainGapTicks:trainGaps.size,minimumTrainGapSeconds:Math.min(...trainGaps)/60,maximumTrainGapSeconds:Math.max(...trainGaps)/60,examples};
fs.writeFileSync("results/variants/variant-2/rules-audit.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
