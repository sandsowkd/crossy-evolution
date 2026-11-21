import { useEffect, useRef, useState } from "react";
import { GameSimulation } from "../core/simulation";
import { VARIANT_TWO_CONFIG, platformsAt } from "../core/upstream";
import { hazardsAt, signalAt } from "../core/world";
import type { Action, Config } from "../core/types";
import type { Genome } from "../evolution/genome";
import { Replay } from "../evolution/replay";
import { parseEvolution } from "../evolution/serialization";
import { WorldView } from "./three/scene";
import { variantTwoRowPlan } from "../core/variant-two-rules";

type Mode = "logs" | "lilies" | "trains" | "scratch" | "transfer";
type Preview = { branch: string; generation: number; genomes: Genome[]; seed: number; simulation: Config; meanRow?: number };
export function VariantTwo() {
  const host = useRef<HTMLDivElement>(null), world = useRef<WorldView | undefined>(undefined);
  const sim = useRef(new GameSimulation(VARIANT_TWO_CONFIG, 42));
  const previewSeed = useRef(42);
  const replay = useRef<Replay | undefined>(undefined), action = useRef<Action>("WAIT");
  const modeRef = useRef<Mode>("logs"), playingRef = useRef(true), speedRef = useRef(1), displayTick = useRef(0);
  const [mode, setMode] = useState<Mode>("logs"), [playing, setPlaying] = useState(true), [speed,setSpeed] = useState(1);
  const [ready,setReady] = useState(false), [message,setMessage] = useState(""), [record,setRecord] = useState<Preview>(), [seed,setSeed] = useState(42);
  const [status,setStatus] = useState({score:0, tick:0, alive:1, total:1, death:""});
  const install = async (choice: Mode) => {
    modeRef.current = choice; setMode(choice); setRecord(undefined); setMessage(""); replay.current = undefined;
    world.current?.clear();
    action.current = "WAIT";
    setStatus({score:0,tick:0,alive:1,total:1,death:""});
    if (choice === "scratch" || choice === "transfer") {
      try {
        const response = await fetch(`/variant-2/${choice}.json?t=${Date.now()}`);
        if (!response.ok) throw new Error("This training branch has not saved its first generation yet. Use the mechanics demos while it starts.");
        const saved = parseEvolution<Preview>(await response.text());
        if (saved.simulation.variantTwoRules !== VARIANT_TWO_CONFIG.variantTwoRules)
          throw new Error("This saved training run uses earlier rules. Use the mechanics demos to see the current map and log spacing.");
        if (modeRef.current !== choice) return;
        replay.current = new Replay(saved.genomes, saved.seed, saved.simulation); setRecord(saved);
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
    setPlaying(true); playingRef.current=true;
  };
  useEffect(()=>{
    let active=true,frame=0,last=0,elapsed=0;
    world.current=new WorldView(host.current!);
    void world.current.ready.then(()=>{if(active)setReady(true);}).catch(e=>setMessage(String(e)));
    void install("logs");
    const draw=(now:number)=>{
      frame=requestAnimationFrame(draw);
      const delta=last?Math.min(.1,(now-last)/1000):0;last=now;
      if(playingRef.current)elapsed+=delta*speedRef.current;
      let changed=false;
      while(elapsed>=.2){
        elapsed-=.2;changed=true;
        if(replay.current)replay.current.advance();
        else {if(sim.current.agent.alive)sim.current.step(action.current,false);displayTick.current+=12;action.current="WAIT";}
      }
      const r=replay.current,s=r?.current.sim??sim.current;
      if(changed)setStatus({score:s.agent.maxRow,tick:s.tick,alive:r?r.agents.filter(a=>a.sim.agent.alive).length:+s.agent.alive,total:r?.agents.length??1,death:s.agent.deathReason??""});
      if(r)world.current?.update(r.snapshot());
      else {
        const center=Math.round(s.agent.row),rows=Array.from({length:22},(_,i)=>s.world.row(Math.max(0,center-6)+i)),tick=displayTick.current;
        world.current?.update({tick,focus:s.agent.row,rows,hazards:rows.flatMap(row=>hazardsAt(row,tick)),supports:rows.flatMap(row=>platformsAt(row,tick)),signals:rows.filter(row=>signalAt(row,tick)).map(row=>row.index),agents:[{id:0,x:s.agent.x,row:s.agent.row,alive:s.agent.alive,visualY:s.agent.visualY,deathReason:s.agent.deathReason}]});
      }
    };
    frame=requestAnimationFrame(draw);
    const key=(event:KeyboardEvent)=>{const a:Record<string,Action>={ArrowUp:"UP",ArrowDown:"DOWN",ArrowLeft:"LEFT",ArrowRight:"RIGHT"," ":"WAIT"};if(a[event.key]&&!(event.target instanceof HTMLSelectElement)){event.preventDefault();action.current=a[event.key];}};
    window.addEventListener("keydown",key);
    return()=>{active=false;cancelAnimationFrame(frame);window.removeEventListener("keydown",key);world.current?.dispose();};
  },[]);
  useEffect(()=>{playingRef.current=playing;},[playing]);
  useEffect(()=>{speedRef.current=speed;},[speed]);
  return <main className="crossy-game">
    <div className="game-world" ref={host}/>
    <div className="original-score" aria-label="Forward score"><span>{status.score}</span><small>VARIANT 2</small></div>
    <div className="generation-hud"><strong>{record?`GEN ${record.generation}`:"MECHANICS DEMO"}</strong><span>{status.alive} / {status.total} ALIVE</span><small>{record?`${record.branch} · actual saved population`:"Scripted starting state · original assets"}</small></div>
    <div className="v2-modes" style={{position:"absolute",top:110,left:12,right:12,display:"flex",gap:6,flexWrap:"wrap",zIndex:4}}>
      {([['logs','Moving logs'],['lilies','Lily pads'],['trains','Train crossing'],['scratch','Fresh training'],['transfer','Variant 1 transfer']] as const).map(([id,label])=><button key={id} aria-pressed={mode===id} onClick={()=>void install(id)}>{label}</button>)}
    </div>
    {status.death&&<div className="eagle-capture" style={{top:175}} role="status">{status.death==="eagle"?"CAUGHT BY THE EAGLE":status.death==="water"?"FELL INTO THE WATER":`EPISODE ENDED · ${status.death.toUpperCase()}`}</div>}
    {!ready&&<div className="asset-loading">Loading original models…</div>}
    <p className="watch-caption" style={{fontSize:12,bottom:110}}>{record?`Map ${record.seed} · ${record.meanRow===undefined?"First saved generation":`Best development mean ${record.meanRow.toFixed(2)}`} · no final tests opened`:`Map ${seed} · ${mode==="trains"?"Grouped tracks · independent trains every 12–24s":mode==="logs"?"Grouped rivers · mixed logs · 1–3 tile gaps":"Lily pads: guaranteed clear center · arrows to hop"}`}</p>
    {message&&<div className="game-error" role="alert">{message}</div>}
    <div className="quick-replay">
      <button onClick={()=>setPlaying(!playing)}>{playing?"Pause":"Play"}</button><button onClick={()=>void install(mode)}>Restart / refresh</button>
      {mode!=="scratch"&&mode!=="transfer"&&<button onClick={()=>{previewSeed.current++;setSeed(previewSeed.current);void install(mode);}}>New map</button>}
      <button onClick={()=>setSpeed(speed===1?10:1)}>{speed}×</button><a href="/" style={{color:"white",padding:8}}>Variant 1</a>
    </div>
  </main>;
}
