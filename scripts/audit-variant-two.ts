import assert from "node:assert/strict";
import fs from "node:fs";
import { World } from "../src/core/world";
import { VARIANT_TWO_CONFIG } from "../src/core/upstream";
import { VARIANT_TWO_RULES } from "../src/core/variant-two-rules";

const counts = {grass:0, road:0, rail:0, water:0, logRows:0, lilyRows:0, positiveLogs:0, negativeLogs:0};
let maximumWaterRun = 0, maximumLogRun = 0, maximumSameDirection = 0;
let minimumLogSpeed = Infinity, maximumLogSpeed = 0, minimumAdjacentSpeedDifference = Infinity;
let centerPadViolations = 0, centerObstacleViolations = 0;
const trainGaps = new Set<number>(), trainFirstArrivals = new Set<number>();
let fiveLogExample: {seed:number; startRow:number} | undefined;
for (let seed = 0; seed < 180; seed++) {
  const world = new World(seed, VARIANT_TWO_CONFIG);
  let waterRun = 0, logRun = 0, sameDirection = 0, previousSpeed = 0;
  for (let index = 0; index < 400; index++) {
    const row = world.row(index); counts[row.type]++;
    if (row.blocked.includes(0)) centerObstacleViolations++;
    waterRun = row.type === "water" ? waterRun + 1 : 0;
    maximumWaterRun = Math.max(maximumWaterRun, waterRun);
    if (row.platforms?.[0]?.kind === "log") {
      counts.logRows++; counts[row.speed > 0 ? "positiveLogs" : "negativeLogs"]++;
      minimumLogSpeed = Math.min(minimumLogSpeed, Math.abs(row.speed)); maximumLogSpeed = Math.max(maximumLogSpeed, Math.abs(row.speed));
      if (logRun) minimumAdjacentSpeedDifference = Math.min(minimumAdjacentSpeedDifference, Math.abs(Math.abs(row.speed)-Math.abs(previousSpeed)));
      sameDirection = logRun && Math.sign(previousSpeed) === Math.sign(row.speed) ? sameDirection + 1 : 1;
      logRun++; previousSpeed = row.speed;
      maximumLogRun = Math.max(maximumLogRun, logRun); maximumSameDirection = Math.max(maximumSameDirection, sameDirection);
      if (logRun === 5 && !fiveLogExample) fiveLogExample = {seed, startRow:index-4};
    } else {logRun = 0; sameDirection = 0; previousSpeed = 0;}
    if (row.platforms?.[0]?.kind === "lily") {
      counts.lilyRows++; if (!row.platforms.some(p=>p.offset===0)) centerPadViolations++;
    }
    if (row.trainSchedule) {
      trainFirstArrivals.add(row.trainSchedule.arrivals[0]);
      for (let i = 1; i < row.trainSchedule.arrivals.length; i++) trainGaps.add(row.trainSchedule.arrivals[i] - row.trainSchedule.arrivals[i-1]);
    }
  }
}
assert.equal(maximumWaterRun,5); assert.equal(maximumLogRun,5); assert.equal(maximumSameDirection,2);
assert.ok(minimumAdjacentSpeedDifference>=.8); assert.equal(centerPadViolations+centerObstacleViolations,0);
const report = {rules:VARIANT_TWO_RULES, config:VARIANT_TWO_CONFIG, seeds:180, rowsPerSeed:400, totalRows:72000, counts,
  maximumWaterRun, maximumLogRun, maximumSameDirection, minimumLogSpeed, maximumLogSpeed, minimumAdjacentSpeedDifference,
  centerPadViolations, centerObstacleViolations, distinctFirstTrainArrivalTicks:trainFirstArrivals.size,
  distinctTrainGapTicks:trainGaps.size, minimumTrainGapSeconds:Math.min(...trainGaps)/60,
  maximumTrainGapSeconds:Math.max(...trainGaps)/60, fiveLogExample};
const target = "results/variants/variant-2/rules-audit.json";
fs.mkdirSync("results/variants/variant-2",{recursive:true}); fs.writeFileSync(target,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
