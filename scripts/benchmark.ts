import { performance } from "node:perf_hooks";
import os from "node:os";
import fs from "node:fs";
import { episode } from "../src/evolution/evaluation";
import { alwaysUp } from "../src/evolution/baselines";
const count = Number(process.argv[2] ?? 3000);
let ticks = 0;
const start = performance.now();
for (let i = 0; i < count; i++)
  ticks += episode(alwaysUp, i, {
    curriculum: i % 2 ? "roads" : "trains",
  }).ticks;
const seconds = (performance.now() - start) / 1000;
const result = {
  machine: os.cpus()[0].model,
  node: process.version,
  episodes: count,
  physicsTicks: ticks,
  seconds,
  simulationStepsPerSecond: Math.round(ticks / seconds),
  completedEpisodesPerSecond: Math.round(count / seconds),
  includes:
    "observation encoding, policy, collisions, procedural maps; excludes rendering",
};
fs.mkdirSync("results", { recursive: true });
fs.writeFileSync(
  "results/benchmark.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
