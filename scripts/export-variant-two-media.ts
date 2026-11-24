/** Reproducible replay media inputs; evaluation/rendering only, never evolution. */
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import type {Genome} from "../src/evolution/genome";
import type {Config} from "../src/core/types";
import {hopTicks} from "../src/core/types";
import {parseEvolution, stringifyEvolution} from "../src/evolution/serialization";
import {Replay} from "../src/evolution/replay";
import {highlightBestScore, highlightAutoSpeedPlan, HIGHLIGHT_REPLAY_OPTIONS} from "../src/visualization/highlight-playback";
import {VARIANT_TWO_MILESTONES} from "../src/visualization/site-content";
import type {ExplorerCatalog} from "../src/visualization/explorer-data";
import type {HomepageData,PreviewClip} from "../src/visualization/homepage-data";
const read=<T,>(file:string)=>parseEvolution<T>(fs.readFileSync(file,"utf8"));
const write=(file:string,data:object)=>fs.writeFileSync(file,stringifyEvolution(data)+"\n");
const catalog=read<ExplorerCatalog>("public/explorer-catalog.json"),sequence=catalog.variants.find(v=>v.id===2)!.sequence!;
const data=read<HomepageData>("public/homepage-data.json"); data.clips=data.clips.filter(c=>c.variant!==2);
const ranges:{id:string;decisionRange:{start:number;end:number}}[]=[];
let evaluationEpisodes=0;
for(const m of VARIANT_TWO_MILESTONES) {
 const row=sequence[m.generation-1],text=gunzipSync(fs.readFileSync(`public${row.cohortFile}`)).toString();
 assert.equal(createHash("sha256").update(text).digest("hex"),row.cohortHash);
 const genomes=parseEvolution<{contenders:Genome[]}>(text).contenders;
 const replay=new Replay(genomes,m.previewSeed,row.config,HIGHLIGHT_REPLAY_OPTIONS);
 const scores=[0];while(!replay.finished){replay.advance();scores.push(highlightBestScore(replay));}evaluationEpisodes+=genomes.length;
 const high=highlightBestScore(replay),middle=scores.findIndex(s=>s>=high/2),half=45;
 const start=m.generation<=5?0:Math.max(0,Math.min(middle-half,replay.decisions-half*2));
 const end=m.generation<=5?replay.decisions:Math.min(replay.decisions,start+half*2);
 ranges.push({id:m.id,decisionRange:{start,end}});
 const clip:PreviewClip={id:m.id,variant:2,generation:m.generation,sourceGeneration:row.sourceGeneration,population:genomes.length,
   mapSeed:m.previewSeed,highestScore:high,decisions:replay.decisions,seconds:replay.decisions*hopTicks(row.config)/60,
   sourceArchive:row.cohortFile,automaticPlayback:highlightAutoSpeedPlan(replay),video:`/previews/${m.id}.mp4`,poster:`/previews/${m.id}.jpg`};
 evaluationEpisodes++;data.clips.push(clip);console.log(`${m.id}: ${high}, ${replay.decisions} moves`);
}
const final=read<{genomes:Genome[];simulation:Config;generation:number;sourceGeneration:number;sourceRun:string}>("public/variant-2/final-policy.json");
const solo=new Replay(final.genomes,0,final.simulation,HIGHLIGHT_REPLAY_OPTIONS);
while(solo.decisions<150 && !solo.finished)solo.advance();evaluationEpisodes++;
const mainEnd=solo.decisions,mainStart=Math.max(0,mainEnd-100);
assert.ok(mainEnd>mainStart);
const main:PreviewClip={id:"variant-2-main",variant:2,generation:150,sourceGeneration:final.sourceGeneration,population:1,mapSeed:0,
 highestScore:highlightBestScore(solo),decisions:mainEnd-mainStart,seconds:(mainEnd-mainStart)*hopTicks(final.simulation)/60,
 decisionRange:{start:mainStart,end:mainEnd},policyGenomeId:final.genomes[0].id,sourceArchive:"public/variant-2/final-policy.json",
 video:"/previews/variant-2-main.mp4",poster:"/previews/variant-2-main.jpg"};data.clips.push(main);ranges.push({id:main.id,decisionRange:main.decisionRange!});
const flock:Genome[]=[];
const sources=sequence.map(row=>{
 const text=gunzipSync(fs.readFileSync(`public${row.cohortFile}`)).toString();
 assert.equal(createHash("sha256").update(text).digest("hex"),row.cohortHash);
 const cohort=parseEvolution<{contenders:Genome[]}>(text).contenders;
 const selected=Array.from({length:10},(_,i)=>cohort[Math.floor((i+.5)*cohort.length/10)]);
 assert.equal(new Set(selected.map(g=>g.id)).size,10);flock.push(...selected);
 return{generation:row.generation,sourceGeneration:row.sourceGeneration,sourcePhase:row.sourcePhase,cohortFile:row.cohortFile,cohortHash:row.cohortHash,genomeIds:selected.map(g=>g.id)};
});assert.equal(flock.length,1500);
const mix=new Replay(flock,561909326,final.simulation,HIGHLIGHT_REPLAY_OPTIONS);
while(highlightBestScore(mix)<100 && !mix.finished)mix.advance();evaluationEpisodes+=flock.length;
assert.ok(highlightBestScore(mix)>=100);
const range={start:0,end:mix.decisions},seconds=mix.decisions*hopTicks(final.simulation)/60;
const input=".publication/homepage-preview-input";fs.mkdirSync(input,{recursive:true});
write(`${input}/variant-2.json`,final);write(`${input}/variant-2-flock.json`,{genomes:flock,config:final.simulation});
write("public/variant-2/flock-preview.json",{version:1,variant:2,population:1500,generations:150,samplePerGeneration:10,seed:mix.seed,
 decisions:mix.decisions,seconds,playbackSpeed:1,scoreRange:{start:0,end:highlightBestScore(mix)},sources});
data.clips.push({id:"variant-2-all-generations",variant:2,generation:150,population:1500,mapSeed:mix.seed,highestScore:highlightBestScore(mix),
 decisions:mix.decisions,seconds,decisionRange:range,previewKind:"population-mix",sourceArchive:"public/variant-2/flock-preview.json",
 video:"/previews/variant-2-all-generations.mp4",poster:"/previews/variant-2-all-generations.jpg"});
ranges.push({id:"variant-2-all-generations",decisionRange:range});
write("public/homepage-data.json",data);write(`${input}/variant-2-readme-plan.json`,{clips:ranges});
write("results/variants/variant-2/showcase-media-inputs-001.json",{createdAt:new Date().toISOString(),evaluationEpisodes,trainingEpisodes:0,finalMapsOpened:false,
 clips:data.clips.filter(c=>c.variant===2),readmePlan:`${input}/variant-2-readme-plan.json`,populationSampling:"10 original evenly sampled members per display generation; no blended or changed networks"});
console.log(`Prepared8 Variant2 clips; ${evaluationEpisodes} presentation evaluation episodes; no training.`);
