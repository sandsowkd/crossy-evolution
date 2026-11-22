import fs from "node:fs";
import { ACTIONS, DELTA, type Action } from "../src/core/types";
import { GLOBAL_OFFSET, INPUT_COUNT, ROW_OFFSETS } from "../src/core/observation";
import { VARIANT_TWO_CONFIG } from "../src/core/upstream";
import { episode } from "../src/evolution/evaluation";
import { randomPolicy, heuristic, alwaysUp, type Policy } from "../src/evolution/baselines";
import { summarizeVariantTwo } from "../src/evolution/variant-two-experiment";

/** Diagnostic hand-written baseline only. Trainers never import or execute it. */
const riverRule: Policy = observation => {
  const cell = (dx: number, dy: number) => ROW_OFFSETS.indexOf(dy as typeof ROW_OFFSETS[number])*9+dx+4;
  const water = (dx: number, dy: number) => observation[INPUT_COUNT+cell(dx,dy)*3]>.5;
  const support = (dx: number, dy: number) => observation[INPUT_COUNT+cell(dx,dy)*3+2]>.5;
  const risk = (action: Action) => observation[GLOBAL_OFFSET+3+ACTIONS.indexOf(action)];
  const blocked = (dx: number,dy: number) => observation[cell(dx,dy)*9+3]>.5;
  const safe = (action: Action) => {
    const [dx,dy]=DELTA[action];
    return risk(action)<.5 && !blocked(dx,dy) && (!water(dx,dy)||support(dx,dy));
  };
  const x = observation[GLOBAL_OFFSET]*4+observation[INPUT_COUNT+216+4];
  const inward = x>0?"LEFT":"RIGHT";
  if(water(0,0)&&Math.abs(x)>3&&safe(inward))return inward;
  if(safe("UP"))return "UP";
  if(blocked(0,1)){
    const first = observation[GLOBAL_OFFSET+9]<0?"LEFT":"RIGHT";
    if(safe(first))return first;
    const other = first==="LEFT"?"RIGHT":"LEFT";
    if(safe(other))return other;
  }
  if(risk("WAIT")<.5)return "WAIT";
  if(safe(inward))return inward;
  if(safe(inward==="LEFT"?"RIGHT":"LEFT"))return inward==="LEFT"?"RIGHT":"LEFT";
  return "DOWN";
};
const seeds=Array.from({length:256},(_,i)=>(0x98000000+i*65537)>>>0);
const policies: [string,(seed:number)=>Policy][]=[
  ["random",seed=>randomPolicy(seed^0x12345)], ["always-up",()=>alwaysUp],
  ["road-heuristic",()=>heuristic], ["water-aware-handwritten-baseline",()=>riverRule],
];
const results=policies.map(([name,create])=>{
  const episodes=seeds.map(seed=>episode(create(seed),seed,VARIANT_TWO_CONFIG,undefined,undefined,9));
  return {name,...summarizeVariantTwo(episodes),episodes};
});
const report={maps:256,suite:"confirmation-development",simulation:VARIANT_TWO_CONFIG,
  trainingUsesThesePolicies:false,finalMapsOpened:false,results};
fs.writeFileSync("results/variants/variant-2/baselines.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:results.map(r=>({...r,episodes:undefined}))},null,2));
