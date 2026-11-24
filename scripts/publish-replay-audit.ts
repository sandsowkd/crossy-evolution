/** Ship raw simulation evidence and complete fixed timelines for the audited panel. */
import fs from "node:fs";
import type { ExplorerCatalog } from "../src/visualization/explorer-data";
import type { AuditResult } from "./audit-replay-sequence";
const source = ".publication/replay-audit-fixed";
const {results} = JSON.parse(fs.readFileSync(`${source}/results.json`,"utf8")) as {results: AuditResult[]};
if (results.length !== 150) throw new Error("All 150 generations must finish before publishing");
const episodes = results.reduce((sum,r)=>sum+r.population*r.maps.length,0);
const comparison = JSON.parse(fs.readFileSync(".publication/replay-audit-before-comparison/results.json","utf8")) as {results: AuditResult[]};
const report = {version: 1, generatedAt: new Date().toISOString(),
  kind: "Curated replay sequence, not a continuous training curve", rules: "Full viewing rules; no time cutoff; ten-second inactivity eagle",
  definition: {mean:"Mean forward rows over every original chicken and all eight maps",maximum:"Largest forward-row score of any original chicken on any of the eight maps"},
  seeds: results[0].maps.map(map=>map.seed), episodes, generations: results,
  previousBoundary: comparison.results.filter(row=>row.generation===85||row.generation===86)};
fs.mkdirSync("public/replay-audit",{recursive:true});
fs.writeFileSync("public/replay-audit/results.json",JSON.stringify(report)+"\n");
fs.copyFileSync(`${source}/generations.csv`,"public/replay-audit/generations.csv");
fs.copyFileSync(`${source}/maps.csv`,"public/replay-audit/maps.csv");
// Verify that the evidence belongs to the exact populations being published.
const catalog = JSON.parse(fs.readFileSync("public/explorer-catalog.json","utf8")) as ExplorerCatalog;
for (const row of catalog.variants[0].sequence!) {
  const audit = results.find(result=>result.generation===row.generation)!;
  if (row.cohortHash !== audit.cohortHash) throw new Error("Catalog changed after the audit");
}
const clips = JSON.parse(fs.readFileSync("public/homepage-data.json","utf8")) as {clips: {id: string; generation: number; mapSeed: number; decisions: number; automaticPlayback?: NonNullable<typeof catalog.variants[0]["sequence"]>[number]["automaticPlayback"]}[]};
for (const row of catalog.variants[0].sequence!) {
  const clip = clips.clips.find(clip => clip.id === row.milestone);
  if (clip?.automaticPlayback && row.seeds.includes(clip.mapSeed)) Object.assign(row,
    {planSeed: clip.mapSeed, populationReplayDecisions: clip.decisions, automaticPlayback: clip.automaticPlayback});
}
fs.writeFileSync("public/explorer-catalog.json",JSON.stringify(catalog)+"\n");
fs.writeFileSync("public/replay-audit/summary.json",JSON.stringify({episodes,generations:results.length,maps:report.seeds.length,
  boundaryBefore:report.previousBoundary.map(r=>({generation:r.generation,mean:r.mean,maximum:r.maximum})),
  boundaryAfter:results.filter(r=>r.generation===85||r.generation===86).map(r=>({generation:r.generation,mean:r.mean,maximum:r.maximum}))},null,2)+"\n");
console.log(`Published ${results.length} generations, ${episodes.toLocaleString()} full episodes.`);
