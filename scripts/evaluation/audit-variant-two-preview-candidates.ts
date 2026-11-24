/** Fixed-policy presentation comparisons; no evolution or holdout maps. */
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import type {Genome} from "../../src/evolution/genome";
import {parseEvolution} from "../../src/evolution/serialization";
import {Replay} from "../../src/evolution/replay";
import type {ExplorerCatalog} from "../../src/visualization/explorer-data";
import {HIGHLIGHT_REPLAY_OPTIONS} from "../../src/visualization/highlight-playback";
const catalog=JSON.parse(fs.readFileSync("public/explorer-catalog.json","utf8")) as ExplorerCatalog;
const sequence=catalog.variants.find(v=>v.id===2)!.sequence!;
const comparisons=[];
let evaluationEpisodes=0;
for(const generation of [1,5,50,85,100,150]){
 const row=sequence[generation-1];
 const genomes=parseEvolution<{contenders:Genome[]}>(gunzipSync(fs.readFileSync(`public${row.cohortFile}`)).toString()).contenders;
 for(const seed of [4984,318,14232]){
  const replay=new Replay(genomes,seed,row.config,HIGHLIGHT_REPLAY_OPTIONS);
  while(!replay.finished)replay.advance();
  evaluationEpisodes+=genomes.length;
  const scores=replay.agents.map(a=>a.sim.agent.maxRow),maximum=Math.max(...scores);
  const result={generation,seed,population:genomes.length,maximum,mean:scores.reduce((a,b)=>a+b,0)/scores.length,
    reach26:scores.filter(s=>s>=26).length,reach50:scores.filter(s=>s>=50).length,reach100:scores.filter(s=>s>=100).length};
  comparisons.push(result);console.log(JSON.stringify(result));
 }
}
fs.writeFileSync(".publication/variant2-preview-candidate-replays.json",JSON.stringify({createdAt:new Date().toISOString(),comparisons,
 evaluationEpisodes,trainingEpisodes:0,reservedFinalMapsOpened:0,purpose:"Choose presentation maps; all saved networks and recorded evaluation panels remain fixed"},null,2)+"\n");
