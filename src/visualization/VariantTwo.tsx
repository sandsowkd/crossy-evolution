import { useEffect, useRef, useState } from "react";
import { GameSimulation } from "../core/simulation";
import { VARIANT_TWO_CONFIG, platformsAt } from "../core/upstream";
import { hazardsAt, signalAt } from "../core/world";
import { hopTicks, type Action, type Config } from "../core/types";
import { ManualActions } from "./manual-actions";
import type { Genome } from "../evolution/genome";
import { Replay } from "../evolution/replay";
import { parseEvolution } from "../evolution/serialization";
import { WorldView } from "./three/scene";
import { variantTwoRowPlan } from "../core/variant-two-rules";

type Mode = "map" | "logs" | "lilies" | "trains" | "scratch" | "transfer" | "peak";
type Preview = { branch: string; generation: number; genomes: Genome[]; seed: number; simulation: Config; meanRow?: number; maximumRow?: number; selectedGenome?: number };
export function VariantTwo() {
  const host = useRef<HTMLDivElement>(null), world = useRef<WorldView | undefined>(undefined);
  const querySeed=Number(new URLSearchParams(window.location.search).get("seed")??0);
  const initialSeed=Number.isInteger(querySeed)&&querySeed>=0&&querySeed<=0xffffffff?querySeed:0;
  const sim = useRef(new GameSimulation(VARIANT_TWO_CONFIG, initialSeed));
  const previewSeed = useRef(initialSeed), inspectedRowRef=useRef<number|null>(null);
  const replay = useRef<Replay | undefined>(undefined), actions = useRef(new ManualActions());
  const modeRef = useRef<Mode>("map"), playingRef = useRef(false), speedRef = useRef(1), displayTick = useRef(0);
  const [mode, setMode] = useState<Mode>("map"), [playing, setPlaying] = useState(false), [speed,setSpeed] = useState(1);
  const [ready,setReady] = useState(false), [message,setMessage] = useState(""), [record,setRecord] = useState<Preview>(), [seed,setSeed] = useState(initialSeed);
  const [inspectedRow,setInspectedRow]=useState<number|null>(null);
  const inspect=(row:number|null)=>{inspectedRowRef.current=row;setInspectedRow(row);};
  const inspectFeature=(kind:"log"|"rail")=>{
    for(let row=26;row<=400;row++){
      const plan=variantTwoRowPlan(previewSeed.current,row);
      if(plan.crossingStart===row&&plan.crossingLength!>=2&&(kind==="rail"?plan.type==="rail":plan.waterKind==="log")){
        inspect(row);return;
      }
    }
  };
  const [status,setStatus] = useState({score:0, tick:0, alive:1, total:1, death:""});
  const install = async (choice: Mode) => {
    modeRef.current = choice; setMode(choice); setRecord(undefined); setMessage(""); replay.current = undefined;
    world.current?.clear();
    actions.current.clear();
    inspect(null);
    setStatus({score:0,tick:0,alive:1,total:1,death:""});
    if(choice==="map"){
      sim.current=new GameSimulation(VARIANT_TWO_CONFIG,previewSeed.current);displayTick.current=0;
      setPlaying(false);playingRef.current=false;return;
    }
    if (choice === "scratch" || choice === "transfer" || choice === "peak") {
      try {
        const response = await fetch(`/variant-2/${choice}.json?t=${Date.now()}`);
        if (!response.ok) throw new Error("This training branch has not saved its first generation yet. Use the mechanics demos while it starts.");
        const saved = parseEvolution<Preview>(await response.text());
        if (saved.simulation.variantTwoRules !== VARIANT_TWO_CONFIG.variantTwoRules)
          throw new Error("This saved training run uses earlier rules. Use the mechanics demos to see the current map and log spacing.");
        if (modeRef.current !== choice) return;
        replay.current = new Replay(saved.genomes, saved.seed, saved.simulation);
        if (saved.selectedGenome !== undefined) {
          const selected = saved.genomes.findIndex(genome => genome.id === saved.selectedGenome);
          if (selected < 0) throw new Error("Selected chicken is missing from its saved population.");
          replay.current.selected = selected;
        }
        setRecord(saved);
      } catch (e) { setMessage(String(e)); }
    } else {
      const s = new GameSimulation(VARIANT_TWO_CONFIG,previewSeed.current);
      const rows = Array.from({length:1200},(_,i)=>s.world.row(i+2));
      const row = rows.find(r => {
        const plan=variantTwoRowPlan(previewSeed.current,r.index);
        return choice === "trains" ? r.type === "rail" && plan.crossingStart===r.index && plan.crossingLength!>=2 :
          r.platforms?.[0]?.kind === (choice === "logs" ? "log" : "lily") && (choice!=="logs" || plan.crossingLength!>=2);
      });
      if (!row) {setMessage("No matching crossing found on this map. Choose New map.");return;}
      s.tick = choice === "trains" ? row.trainSchedule!.arrivals[0] - 180 : 180;
      s.agent.row = choice === "trains" ? rows.filter(r=>r.type==="grass").sort((a,b)=>Math.abs(a.index-row.index)-Math.abs(b.index-row.index))[0].index : row.index;
      s.agent.maxRow = s.agent.row; s.agent.lastProgressTick = s.tick;
      s.agent.x = choice !== "logs" ? 0 : platformsAt(row,s.tick).sort((a,b)=>Math.abs(a.x)-Math.abs(b.x))[0].x;
      if (choice !== "trains") {
        const p = platformsAt(row,s.tick).find(p=>p.x===s.agent.x)!;
        s.agent.ridingOn=p.id; s.agent.ridingSpeed=p.speed; s.agent.visualY=choice==="logs"?.2:.325;
      }
      sim.current=s; displayTick.current=s.tick;
      setStatus({score:s.agent.maxRow,tick:s.tick,alive:1,total:1,death:""});
    }
    const autoPlay=choice==="scratch"||choice==="transfer"||choice==="peak";
    setPlaying(autoPlay); playingRef.current=autoPlay;
  };
  useEffect(()=>{
    let active=true,frame=0,last=0,elapsed=0;
    world.current=new WorldView(host.current!);
    void world.current.ready.then(()=>{if(active)setReady(true);}).catch(e=>setMessage(String(e)));
    void install("map");
    const draw=(now:number)=>{
      frame=requestAnimationFrame(draw);
      const delta=last?Math.min(.1,(now-last)/1000):0;last=now;
      if(playingRef.current)elapsed+=delta*speedRef.current;
      let changed=false;
      const ticks=hopTicks(replay.current?.config??sim.current.config),duration=ticks/60;
      while(elapsed>=duration){
        elapsed-=duration;changed=true;
        if(replay.current)replay.current.advance();
        else {if(sim.current.agent.alive)sim.current.step(actions.current.take(),false);displayTick.current+=ticks;}
      }
      const r=replay.current,s=r?.current.sim??sim.current;
      if(changed)setStatus({score:s.agent.maxRow,tick:s.tick,alive:r?r.agents.filter(a=>a.sim.agent.alive).length:+s.agent.alive,total:r?.agents.length??1,death:s.agent.deathReason??""});
      if(r)world.current?.update(r.snapshot());
      else {
        const browsing=modeRef.current==="map"&&inspectedRowRef.current!==null,focus=browsing?inspectedRowRef.current!:s.agent.row;
        const center=Math.round(focus),rows=Array.from({length:22},(_,i)=>s.world.row(Math.max(0,center-6)+i)),tick=displayTick.current;
        world.current?.update({tick,focus,rows,hazards:rows.flatMap(row=>hazardsAt(row,tick)),supports:rows.flatMap(row=>platformsAt(row,tick)),signals:rows.filter(row=>signalAt(row,tick)).map(row=>row.index),agents:browsing?[]:[{id:0,x:s.agent.x,row:s.agent.row,alive:s.agent.alive,visualY:s.agent.visualY,deathReason:s.agent.deathReason}]});
      }
    };
    frame=requestAnimationFrame(draw);
    const key=(event:KeyboardEvent)=>{const a:Record<string,Action>={ArrowUp:"UP",ArrowDown:"DOWN",ArrowLeft:"LEFT",ArrowRight:"RIGHT"," ":"WAIT"};if(a[event.key]&&!(event.target instanceof HTMLElement&&event.target.closest("input,select,textarea,[contenteditable=true]"))){event.preventDefault();if(!replay.current)actions.current.enqueue(a[event.key],event.repeat);}};
    const blur=()=>{actions.current.clear();setPlaying(false);playingRef.current=false;};
    window.addEventListener("keydown",key);window.addEventListener("blur",blur);
    return()=>{active=false;cancelAnimationFrame(frame);window.removeEventListener("keydown",key);window.removeEventListener("blur",blur);world.current?.dispose();};
  },[]);
  useEffect(()=>{playingRef.current=playing;if(!playing)actions.current.clear();},[playing]);
  useEffect(()=>{speedRef.current=speed;},[speed]);
  return <main className="crossy-game">
    <div className="game-world" ref={host}/>
    <div className="original-score" aria-label={mode==="map"?"Map row":"Forward score"}><span>{mode==="map"?inspectedRow??status.score:status.score}</span><small>VARIANT 2</small></div>
    <div className="generation-hud"><strong>{record?`GEN ${record.generation}`:mode==="map"?"MAP PREVIEW":"MECHANICS DEMO"}</strong><span>{mode==="map"?`SEED ${seed}`:`${status.alive} / ${status.total} ALIVE`}</span><small>{record?`${record.branch} · actual saved population`:mode==="map"?"Browse terrain or play with arrow keys":"Scripted starting state · original assets"}</small></div>
    <div className="v2-modes" style={{position:"absolute",top:110,left:12,right:12,display:"flex",gap:6,flexWrap:"wrap",zIndex:4}}>
      {([['map','Example map'],['logs','Moving logs'],['lilies','Lily pads'],['trains','Train crossing'],['scratch','Fresh training'],['transfer','Best average'],['peak','Highest score']] as const).map(([id,label])=><button key={id} aria-pressed={mode===id} onClick={()=>void install(id)}>{label}</button>)}
    </div>
    {mode==="map"&&<div className="map-inspector">
      <label>Inspect row {inspectedRow??Math.round(sim.current.agent.row)}<input aria-label="Inspect map row" type="range" min="0" max="400" value={inspectedRow??Math.round(sim.current.agent.row)} onChange={e=>inspect(Number(e.target.value))}/></label>
      <div><button onClick={()=>inspect(0)}>Opening</button><button onClick={()=>inspectFeature("log")}>First river</button><button onClick={()=>inspectFeature("rail")}>First tracks</button><button onClick={()=>inspect(null)}>Follow chicken</button></div>
    </div>}
    {status.death&&!(mode==="map"&&inspectedRow!==null)&&<div className="eagle-capture" style={{top:mode==="map"?285:175}} role="status">{status.death==="eagle"?"CAUGHT BY THE EAGLE":status.death==="water"?"FELL INTO THE WATER":`EPISODE ENDED · ${status.death.toUpperCase()}`}</div>}
    {!ready&&<div className="asset-loading">Loading original models…</div>}
    <p className="watch-caption" style={{fontSize:12,bottom:110}}>{record?`Map ${record.seed} · ${record.meanRow===undefined?"First saved generation":`Development mean ${record.meanRow.toFixed(2)} · peak ${record.maximumRow??"—"}`} · no final tests opened`:`Map ${seed} · ${mode==="map"?"V4 · six hops/s · train intervals 30% shorter":mode==="trains"?"Grouped tracks · independent trains every 8.4–16.8s":mode==="logs"?"Logs: 0.864–3.024 tiles/s · 1–3 tile gaps":"Lily pads: guaranteed clear center · arrows to hop"}`}</p>
    {message&&<div className="game-error" role="alert">{message}</div>}
    <div className="quick-replay">
      <button onClick={()=>setPlaying(!playing)}>{playing?"Pause":"Play"}</button><button onClick={()=>void install(mode)}>Restart / refresh</button>
      {mode!=="scratch"&&mode!=="transfer"&&<button onClick={()=>{previewSeed.current++;setSeed(previewSeed.current);void install(mode);}}>New map</button>}
      <button onClick={()=>setSpeed(speed===1?10:1)}>{speed}×</button><a href="/" style={{color:"white",padding:8}}>Variant 1</a>
    </div>
  </main>;
}
