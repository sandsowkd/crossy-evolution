import fs from "node:fs";
import assert from "node:assert/strict";
import type {AuditResult} from "./audit-replay-sequence";
import type {ExplorerCatalog} from "../src/visualization/explorer-data";
import type {HomepageData} from "../src/visualization/homepage-data";
import {VARIANT_TWO_MILESTONES} from "../src/visualization/site-content";
const source=".publication/variant2-showcase-audit",destination="public/variant-2/replay-audit";
const audit=JSON.parse(fs.readFileSync(`${source}/results.json`,"utf8")) as {results:AuditResult[]};
assert.equal(audit.results.length,150);
const catalog=JSON.parse(fs.readFileSync("public/explorer-catalog.json","utf8")) as ExplorerCatalog;
const media=JSON.parse(fs.readFileSync("public/homepage-data.json","utf8")) as HomepageData;
for(const row of catalog.variants.find(v=>v.id===2)!.sequence!){
 const result=audit.results.find(r=>r.generation===row.generation)!;assert.equal(result.cohortHash,row.cohortHash);assert.equal(result.population,row.populationSize);
 const milestone=VARIANT_TWO_MILESTONES.find(m=>m.generation===row.generation),clip=media.clips.find(c=>c.id===milestone?.id);
 if(clip){row.milestone=clip.id;row.planSeed=clip.mapSeed;row.populationReplayDecisions=clip.decisions;row.automaticPlayback=clip.automaticPlayback;
  assert.equal(result.maps.find(m=>m.seed===clip.mapSeed)!.maximum,clip.highestScore);}
}
const report={version:1,generatedAt:new Date().toISOString(),variant:2,kind:"Curated replay sequence, not150 uninterrupted training generations",
 rules:"Frozen clustered-traffic-v4;600-second episode limit;10-second inactivity eagle; nativeV9 every action",
 definition:{mean:"Mean forward rows across every saved chicken and the same eight maps",maximum:"Highest single chicken score across these eight maps; not the default final AI benchmark"},
 seeds:audit.results[0].maps.map(m=>m.seed),episodes:audit.results.reduce((n,r)=>n+r.population*r.maps.length,0),
 trainingEpisodes:0,finalMapsOpened:false,generations:audit.results};
fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(`${destination}/results.json`,JSON.stringify(report)+"\n");
for(const file of ["generations.csv","maps.csv"])fs.copyFileSync(`${source}/${file}`,`${destination}/${file}`);
fs.writeFileSync("public/explorer-catalog.json",JSON.stringify(catalog)+"\n");
fs.writeFileSync("public/variant-2/replay-audit.html",`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Variant2 ·150 saved populations</title><style>body{max-width:1100px;margin:40px auto;padding:0 20px;background:#f7f5ec;color:#263b30;font:16px/1.6 system-ui}h1{line-height:1.2}img{width:100%;height:auto}a{color:#2f6145}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:right;padding:8px;border-bottom:1px solid #d4ded0}th:first-child,td:first-child{text-align:left}.table{overflow:auto}p{max-width:85ch}</style><a href="../explore?variant=2">← Explore Variant2</a><h1>150 authentic saved populations</h1><p>Every original chicken runs on the same eight maps under frozen V4 rules. The curve retains real variance. Display1–150 curates separate experiments, transfers and native continuations; it is not an uninterrupted150-generation training run.</p><p><b>${report.episodes.toLocaleString()} evaluation episodes ·0 training episodes · reserved finals unopened.</b> The population averages below are separate from the frozen final policy’s763.05 average on256 opened development maps.</p><img src="replay-audit/progression.png" alt="Measured population mean and highest score over150 curated positions"><p><a href="replay-audit/generations.csv">Generation CSV</a> · <a href="replay-audit/maps.csv">Map CSV</a> · <a href="replay-audit/results.json">Raw evidence</a> · <a href="showcase-provenance.json">Source populations and frozen policy</a></p><div class="table"><table><thead><tr><th>Display</th><th>Population</th><th>Mean rows</th><th>Highest score</th><th>Native source</th></tr></thead><tbody>${audit.results.map(r=>`<tr><td><a href="../?generation=${r.generation}&seed=561909326&variant=2">${r.generation}</a></td><td>${r.population}</td><td>${r.mean.toFixed(2)}</td><td>${r.maximum.toLocaleString()}</td><td>${r.sourcePhase} /${r.sourceGeneration}</td></tr>`).join("")}</tbody></table></div></html>`);
console.log(JSON.stringify({populations:150,episodes:report.episodes,training:0}));
