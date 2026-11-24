import fs from "node:fs";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { ROW_OFFSETS } from "../../src/core/observation";
import { VARIANT_TWO_INPUT_START } from "../../src/core/sensor-version";
import { VARIANT_TWO_CONFIG } from "../../src/core/upstream";
import { OUTPUT_START, type Genome } from "../../src/evolution/genome";
import { validGenome } from "../../src/evolution/checkpoint";
import { evaluateGenome } from "../../src/evolution/evaluation";
import { parseEvolution } from "../../src/evolution/serialization";
import { summarizeVariantTwo } from "../../src/evolution/variant-two-experiment";

const best=JSON.parse(fs.readFileSync(".archive/results/variant-2/best-development.json","utf8"));
const file=`${best.selectedDirectory}/generations/${String(best.generation).padStart(5,"0")}.json.gz`;
const population=parseEvolution<{contenders:Genome[]}>(gunzipSync(fs.readFileSync(file)).toString()).contenders;
const original=population.find(g=>g.id===best.genome);assert.ok(original);
const factors:[string,(from:number,to:number)=>number][]=[
  ["unmodified",()=>1], ["remove-new-v9-inputs",from=>from>=VARIANT_TWO_INPUT_START?0:1],
  ["remove-distant-river-inputs",from=>{
    const extra=from-VARIANT_TWO_INPUT_START;if(extra<0||extra>=216)return 1;
    const cell=Math.floor(extra/3),dy=ROW_OFFSETS[Math.floor(cell/9)],dx=cell%9-4;
    return dy < -1 || dy > 2 || Math.abs(dx)>1 ? 0 : 1;
  }],
  ["remove-forward-river-lookahead-beyond-one-row",from=>{
    const extra=from-VARIANT_TWO_INPUT_START;
    return extra>=0&&extra<216&&ROW_OFFSETS[Math.floor(Math.floor(extra/3)/9)]>1?0:1;
  }],
  ["remove-new-input-to-hidden-connections",(from,to)=>from>=VARIANT_TWO_INPUT_START&&(to<OUTPUT_START||to>=OUTPUT_START+5)?0:1],
  ["river-input-weight-scale-0.8",from=>from>=VARIANT_TWO_INPUT_START?.8:1],
  ["river-input-weight-scale-1.2",from=>from>=VARIANT_TWO_INPUT_START?1.2:1],
  ["remove-inactivity-signal",from=>from===VARIANT_TWO_INPUT_START+216?0:1],
];
const results=factors.map(([name,factor])=>{
  const genome=structuredClone(original);let changedWeights=0;
  for(const connection of genome.connections){
    const scale=factor(connection.from,connection.to);if(scale!==1)changedWeights++;
    connection.weight=Math.max(-8,Math.min(8,connection.weight*scale));
  }
  assert.ok(validGenome(genome));
  const episodes=evaluateGenome(genome,best.developmentMaps,VARIANT_TWO_CONFIG);
  return {name,changedWeights,...summarizeVariantTwo(episodes),episodes};
});
assert.equal(results[0].meanRow,best.meanRow);
const report={source:{directory:best.selectedDirectory,generation:best.generation,genome:best.genome},
  diagnosticOnly:true,trainingAndViewerUnchanged:true,maps:best.developmentMaps.length,finalMapsOpened:false,results};
fs.writeFileSync(".archive/results/variant-2/input-ablation.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:results.map(r=>({...r,episodes:undefined}))},null,2));
