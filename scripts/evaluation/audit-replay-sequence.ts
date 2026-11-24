/** Exhaustive viewing-rule audit: every real chicken, every selectable seed. */
import fs from "node:fs";
import assert from "node:assert/strict";
import {validGenome} from "../../src/evolution/checkpoint";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { Genome } from "../../src/evolution/genome";
import { parseEvolution } from "../../src/evolution/serialization";
import { GameSimulation } from "../../src/core/simulation";
import { Network } from "../../src/evolution/network";
import { sensorCount } from "../../src/core/sensor-version";
import { highlightReplayConfig } from "../../src/visualization/highlight-playback";
import type { ExplorerCatalog, SequenceRecord } from "../../src/visualization/explorer-data";
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const cacheDir = ".publication/replay-audit-cache";
fs.mkdirSync(cacheDir, {recursive: true});
type MapResult = {seed: number; mean: number; maximum: number; minimum: number; deaths: Record<string, number>; ticks: number};
export type AuditResult = {generation: number; sourceGeneration: number; sourcePhase: string; cohortHash: string;
  population: number; mean: number; maximum: number; maps: MapResult[]};
if (args.includes("--worker")) {
  const jobs = JSON.parse(fs.readFileSync(flag("--worker")!, "utf8")) as SequenceRecord[];
  for (const row of jobs) {
    const began = performance.now();
    const text = gunzipSync(fs.readFileSync(`public${row.cohortFile}`)).toString();
    const genomes = parseEvolution<{contenders: Genome[]}>(text).contenders;
    assert.equal(createHash("sha256").update(text).digest("hex"),row.cohortHash);
    assert.equal(genomes.length,row.populationSize);
    assert.ok(genomes.every(validGenome));
    assert.equal(new Set(genomes.map(genome=>genome.id)).size,genomes.length);
    const config = highlightReplayConfig(row.config);
    const maps: MapResult[] = [];
    // Only recorded training maps are selectable. No synthetic short seed 42.
    for (const seed of row.seeds.filter(seed => seed !== 42)) {
      const key = createHash("sha256").update(JSON.stringify({cohort: row.cohortHash, config, seed, rules: 1})).digest("hex");
      const cacheFile = `${cacheDir}/${key}.json`;
      let result: MapResult;
      if (fs.existsSync(cacheFile)) result = JSON.parse(fs.readFileSync(cacheFile,"utf8"));
      else {
        let sum = 0, maximum = 0, minimum = Infinity, ticks = 0;
        const deaths: Record<string, number> = {};
        for (const genome of genomes) {
          const network = new Network(genome), sim = new GameSimulation(config, seed);
          const buffer = new Float32Array(sensorCount(network.observationVersion));
          while (sim.agent.alive) sim.step(network.decide(sim.getObservation(network.observationVersion, network.requiredInputs, buffer)), false);
          const score = sim.agent.maxRow;
          sum += score; maximum = Math.max(maximum, score); minimum = Math.min(minimum, score); ticks = Math.max(ticks, sim.tick);
          const death = sim.agent.deathReason ?? "unknown";
          deaths[death] = (deaths[death] ?? 0) + 1;
        }
        result = {seed, mean: sum / genomes.length, maximum, minimum, deaths, ticks};
        fs.writeFileSync(cacheFile, JSON.stringify(result));
      }
      maps.push(result);
    }
    const result: AuditResult = {generation: row.generation, sourcePhase: row.sourcePhase, sourceGeneration: row.sourceGeneration,
      cohortHash: row.cohortHash, population: genomes.length,
      mean: maps.reduce((sum,m) => sum + m.mean,0) / maps.length, maximum: Math.max(...maps.map(m => m.maximum)), maps};
    fs.writeFileSync(`${flag("--out")}/${String(row.generation).padStart(3,"0")}.json`, JSON.stringify(result));
    console.log(`Gen ${row.generation}: mean ${result.mean.toFixed(1)}, top ${result.maximum}, ${maps.length} maps (${((performance.now()-began)/1000).toFixed(1)}s)`);
  }
} else {
  const input = flag("--catalog") ?? "public/explorer-catalog.json";
  const output = flag("--out") ?? ".publication/replay-audit-before";
  const catalog = JSON.parse(fs.readFileSync(input,"utf8")) as ExplorerCatalog;
  const variant = Number(flag("--variant") ?? 1);
  let rows = catalog.variants.find(item=>item.id===variant)?.sequence;
  assert.ok(rows?.length,"Curated sequence unavailable");
  if (args.includes("--generations")) rows = rows.filter(row => flag("--generations")!.split(",").map(Number).includes(row.generation));
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(`${output}/catalog.json`,JSON.stringify(catalog));
  const count = Number(flag("--workers") ?? 4);
  await Promise.all(Array.from({length: count}, (_,i) => new Promise<void>((resolve,reject) => {
    const jobs = `${output}/jobs-${i}.json`;
    fs.writeFileSync(jobs,JSON.stringify(rows.filter((_,index)=>index%count===i)));
    const child = spawn(process.execPath,["--import","tsx",path.resolve("scripts/evaluation/audit-replay-sequence.ts"),"--worker",jobs,"--out",output],{stdio:"inherit"});
    child.on("exit",code=>code===0?resolve():reject(new Error(`Audit worker exited ${code}`)));
  })));
  const results = rows.map(row=>JSON.parse(fs.readFileSync(`${output}/${String(row.generation).padStart(3,"0")}.json`,"utf8")) as AuditResult).sort((a,b)=>a.generation-b.generation);
  fs.writeFileSync(`${output}/results.json`,JSON.stringify({variant, rules:variant===1 ? "Full viewing rules: no timeout; ten-second inactivity eagle" : "Frozen clustered-traffic-v4; native600-second limit and ten-second inactivity eagle", evaluationOnly:true, trainingEpisodes:0, finalMapsOpened:false, results})+"\n");
  fs.writeFileSync(`${output}/generations.csv`,"generation,source_phase,source_generation,population,maps,mean,maximum\n"+results.map(r=>[r.generation,r.sourcePhase,r.sourceGeneration,r.population,r.maps.length,r.mean,r.maximum].join(",")).join("\n")+"\n");
  fs.writeFileSync(`${output}/maps.csv`,"generation,seed,population,mean,maximum,minimum,max_ticks\n"+results.flatMap(r=>r.maps.map(m=>[r.generation,m.seed,r.population,m.mean,m.maximum,m.minimum,m.ticks].join(","))).join("\n")+"\n");
  console.log(`Complete: ${results.length} generations, ${results.reduce((sum,r)=>sum+r.maps.length*r.population,0)} episodes.`);
}
