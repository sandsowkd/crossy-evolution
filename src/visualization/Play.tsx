import { applyPageMetadata } from "./page-metadata";
import { sitePath } from "./site-path";
import { useEffect, useRef, useState } from "react";
import type { Action } from "../core/types";
import { savedRacePolicy } from "./race-policy";
import { raceAction, raceSwipe, RaceSession, type RacePolicy } from "./race-session";
import { WorldView } from "./three/scene";
import { RaceCameraVisibility } from "./scene-visibility";
import { ReplayButtons, ReplayHelpDialog } from "./ReplayChrome";
import "./replay-menu.css";
import "./play.css";

const initialSeed = (url: string) => new URL(url).searchParams.get("seed")?.slice(0, 80) || "561909326";
const initialVariant = (url: string) => new URL(url).searchParams.get("variant") === "2" ? 2 as const : 1 as const;
const cause = (reason?: string) => ({car: "hit by a car", train: "hit by a train", water: "lost in the water", eagle: "caught by the eagle", bounds: "out of bounds", timeout: "out of time"}[reason ?? ""] ?? "out");
type Status = {you: number; ai: number; youAlive: boolean; aiAlive: boolean; death?: string; aiDeath?: string;
  waiting: boolean; trailing: boolean; capturing: boolean};
const initialStatus: Status = {you: 0, ai: 0, youAlive: true, aiAlive: true, waiting: true, trailing: false, capturing: false};

export function Play({initialUrl = window.location.href}: {initialUrl?: string}) {
  const shell = useRef<HTMLElement>(null), host = useRef<HTMLDivElement>(null), insetHost = useRef<HTMLDivElement>(null);
  const world = useRef<WorldView>(undefined), inset = useRef<WorldView>(undefined);
  const session = useRef<RaceSession>(undefined);
  const clock = useRef({running: false, credit: 0});
  const cameraVisibility = useRef(new RaceCameraVisibility());
  const controls = useRef({setup: true, started: false});
  const gesture = useRef<{id: number; x: number; y: number; moved: boolean}>(undefined);
  const [variant, setVariant] = useState<1 | 2>(() => initialVariant(initialUrl));
  const [policies, setPolicies] = useState<Partial<Record<1 | 2, RacePolicy>>>({});
  const policy = policies[variant];
  const [assetsReady, setAssetsReady] = useState(false), [errors, setErrors] = useState<Partial<Record<1 | 2, string>>>({});
  const ready = assetsReady && !!policy, error = errors[variant];
  const [setup, setSetup] = useState(true);
  const [draft, setDraft] = useState(() => initialSeed(initialUrl)), [seed, setSeed] = useState(() => initialSeed(initialUrl));
  const [running, setRunning] = useState(false), [started, setStarted] = useState(false);
  const [status, setStatus] = useState<Status>(initialStatus), [offscreen, setOffscreen] = useState(false);
  controls.current = {setup, started};
  const paused = started && !running && !setup && !!session.current && !session.current.finished;
  const currentSeed = useRef(seed);
  const pause = () => {clock.current.running = false; setRunning(false); session.current?.clearInput(); gesture.current = undefined;};
  const resume = () => {
    if (!session.current || session.current.finished) return;
    clock.current.running = true; setRunning(true); shell.current?.focus({preventScroll: true});
  };
  const reset = (text = seed, start = false) => {
    if (!policy || !ready) return;
    const normalized = text.trim() || "561909326";
    const keepPreview = start && session.current?.seedText === normalized && !session.current.hasStarted;
    if (!keepPreview) session.current = new RaceSession(policy, normalized);
    clock.current = {running: start, credit: keepPreview ? clock.current.credit : 0};
    gesture.current = undefined;
    cameraVisibility.current.reset();
    currentSeed.current = normalized;
    setSeed(normalized); setDraft(normalized); setStatus(initialStatus); setOffscreen(false); setStarted(start); setRunning(start);
    world.current!.clear(); inset.current!.clear();
    world.current!.update(session.current!.snapshot()); inset.current!.update(session.current!.snapshot(1, "bot"));
    history.replaceState(null, "", sitePath(`/play?${new URLSearchParams({seed: normalized, variant: String(variant)})}`));
    applyPageMetadata();
    if (start) {setSetup(false); shell.current?.focus({preventScroll: true});}
  };
  useEffect(() => {
    let active = true, frame = 0;
    const abort = new AbortController();
    const main = new WorldView(host.current!, undefined, {focusScreenY: -.35, focusScreenX: 0, responsiveFollow: true});
    const mini = new WorldView(insetHost.current!, undefined, {focusScreenY: -.3, focusScreenX: 0, responsiveFollow: true, zoom: 95});
    main.select(-1); mini.select(1); world.current = main; inset.current = mini;
    void Promise.all([main.ready, mini.ready]).then(()=>{if(active)setAssetsReady(true);})
      .catch(error=>{if(active)setErrors({1:String(error),2:String(error)});});
    for (const choice of [1,2] as const) void fetch(sitePath(choice === 1 ? "/highlights.json" : "/variant-2/final-policy.json"), {signal:abort.signal})
      .then(async response=>{
        if(!response.ok)throw new Error("Saved AI could not load");
        const saved=savedRacePolicy(await response.text(),choice);
        if(active)setPolicies(current=>({...current,[choice]:saved}));
      }).catch(error=>{if(active && !abort.signal.aborted)setErrors(current=>({...current,[choice]:String(error)}));});
    let previousTime = performance.now(), lastUi = 0;
    const animate = (now: number) => {
      if (!active) return;
      frame = requestAnimationFrame(animate);
      const elapsed = Math.min(.1, (now - previousTime) / 1000); previousTime = now;
      const race = session.current;
      if (!race) return;
      // Preview traffic stays live behind setup and while waiting for a first
      // move. Once racing, Pause freezes the entire shared clock.
      if (clock.current.running || (!race.hasStarted && (!controls.current.started || controls.current.setup))) {
        clock.current.credit += elapsed;
        while (clock.current.credit >= 1 / 60 && !race.finished) {
          clock.current.credit -= 1 / 60; race.advanceTicks();
        }
        if (race.finished) {clock.current.running = false; setRunning(false);}
      }
      // Freeze the current hop when paused; resuming must not rewind its pose.
      const subTick = race.finished ? 0 : Math.min(1, clock.current.credit * 60);
      main.update(race.snapshot(subTick)); mini.update(race.snapshot(subTick, "bot"));
      if (now - lastUi > 100) {
        lastUi = now;
        const you = race.playerState, ai = race.botState;
        setStatus({you: you.maxRow, ai: ai.maxRow, youAlive: you.alive, aiAlive: ai.alive, death: you.deathReason, aiDeath: ai.deathReason,
          waiting: !race.hasStarted, trailing: race.trailingWarning, capturing: race.eagleAnimating});
        if (!race.hasStarted) cameraVisibility.current.reset();
        setOffscreen(race.hasStarted && cameraVisibility.current.update(main.agentOnScreen(1), now));
        race.setPlayerOffscreen(!main.agentOnScreen(0));
      }
    };
    frame = requestAnimationFrame(animate);
    const key = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || (event.target as Element | null)?.closest("input,textarea,select,button,a,dialog,[contenteditable=true]")) return;
      if (event.key.toLowerCase() === "p") {event.preventDefault(); pause(); return;}
      if (event.key === " " && !clock.current.running && controls.current.started && !controls.current.setup && !session.current?.finished) {
        event.preventDefault(); if (!event.repeat) resume(); return;
      }
      const action = raceAction(event.key);
      if (action && clock.current.running) {event.preventDefault(); session.current?.command(action);}
    };
    const blur = () => pause();
    window.addEventListener("keydown", key); window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", blur);
    return () => {
      active = false; abort.abort(); cancelAnimationFrame(frame);
      window.removeEventListener("keydown", key); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", blur);
      main.dispose(); mini.dispose(); session.current = undefined;
    };
  }, []);
  useEffect(() => {
    if (!assetsReady || !policy) return;
    session.current = new RaceSession(policy,currentSeed.current);
    clock.current = {running:false,credit:0}; gesture.current = undefined;
    cameraVisibility.current.reset();
    setStatus(initialStatus);setOffscreen(false);setStarted(false);setRunning(false);
    world.current!.clear();inset.current!.clear();
    world.current!.update(session.current.snapshot());inset.current!.update(session.current.snapshot(0,"bot"));
    history.replaceState(null,"",sitePath(`/play?${new URLSearchParams({seed:currentSeed.current,variant:String(variant)})}`));
  },[assetsReady,policy,variant]);
  useEffect(() => {if (!setup && started) shell.current?.focus({preventScroll: true});}, [setup, started]);
  const toggle = () => {
    if (!session.current || !ready || session.current.finished) return;
    if (!started) setStarted(true);
    if (clock.current.running) pause();
    else resume();
  };
  const move = (action: Action) => {if (clock.current.running) session.current?.command(action);};
  return <main className={`race-page${paused ? " is-paused" : ""}`} ref={shell} tabIndex={-1} aria-label={`Race against the saved Variant ${variant} AI`}>
    <div ref={host} className="race-world" role="group" aria-label="Game area: tap to jump forward, swipe or drag to move"
      onPointerDown={event => {
        if (!clock.current.running || !event.isPrimary || event.button !== 0 || !session.current?.playerState.alive) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = {id: event.pointerId, x: event.clientX, y: event.clientY, moved: false};
        shell.current?.focus({preventScroll: true});
      }}
      onPointerMove={event => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId || start.moved) return;
        const action = raceSwipe(event.clientX - start.x, event.clientY - start.y);
        if (action) {start.moved = true; move(action);}
      }}
      onPointerUp={event => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        gesture.current = undefined;
        if (!start.moved) move(raceSwipe(event.clientX - start.x, event.clientY - start.y) ?? "UP");
      }}
      onPointerCancel={() => {gesture.current = undefined;}} onLostPointerCapture={() => {gesture.current = undefined;}} />
    <div className="race-label"><span>RACE THE AI · V{variant}</span><small title={seed}>MAP: {seed}</small></div>
    <div className="race-scores" aria-label="Race scores"><div><span>YOU</span><b>{status.you.toLocaleString()}</b></div><div><span>AI</span><b>{status.ai.toLocaleString()}</b></div>{!status.aiAlive && <small>AI {cause(status.aiDeath)}</small>}</div>
    <div className="replay-menu"><ReplayButtons onSettings={() => {pause(); setSetup(true);}} settingsOpen={setup} /></div>
    <aside className={`race-ai-inset${offscreen && started ? " is-visible" : ""}`} aria-label="AI camera when off screen" aria-hidden={!offscreen || !started}>
      <div>AI CAMERA <span>{status.ai.toLocaleString()}</span></div><div ref={insetHost} className="race-inset-world" />
    </aside>
    {started && status.waiting && <div className="race-start-note" role="status">MOVE TO START · THE AI IS WAITING</div>}
    {started && status.trailing && <div className="race-start-note race-trailing-note" role="status">KEEP UP WITH THE SCREEN</div>}
    {started && !status.youAlive && !status.capturing && <div className="race-result" role="status"><strong>{status.aiAlive ? "YOU’RE OUT" : status.you > status.ai ? "YOU WIN" : status.you < status.ai ? "AI WINS" : "TIE"}</strong><p>You were {cause(status.death)}. {status.aiAlive ? "The AI is still running." : `You: ${status.you} · AI: ${status.ai}`}</p><button onClick={() => reset(seed, true)}>Race again</button></div>}
    {paused && <div className="race-pause-overlay"><button type="button" onClick={resume} aria-label="Resume race (Space)">
      <svg width="44" height="48" viewBox="0 0 44 48" fill="currentColor" aria-hidden="true"><path d="M4 4h12v40H4zM28 4h12v40H28z" /></svg>
      <strong>PAUSED</strong><span>SPACE TO RESUME</span>
    </button></div>}
    <div className="race-touch-controls" aria-label="Touch movement controls">{([["UP", "↑"], ["LEFT", "←"], ["DOWN", "↓"], ["RIGHT", "→"]] as const).map(([action, label]) => <button key={action} className={`race-move-${action.toLowerCase()}`} aria-label={`Move ${action.toLowerCase()}`} disabled={!running || !status.youAlive} onPointerDown={event => {event.preventDefault(); move(action);}} onClick={event => {if (event.detail === 0) move(action);}}>{label}</button>)}</div>
    <div className="race-transport"><span>ARROWS / WASD · TAP / SWIPE</span><div><button disabled={!ready || (!status.youAlive && !status.aiAlive)} onClick={toggle}>{running ? "Pause" : started ? "Resume" : "Play"}</button><button disabled={!ready} onClick={() => reset(seed, true)}>Restart</button><button onClick={() => {pause(); setSetup(true);}}>Map</button></div></div>
    {!ready && <div className="race-loading" role="status">{error || "Loading the saved AI…"}</div>}
    {setup && <ReplayHelpDialog title="Race the AI" className="race-setup-dialog" closeLabel="Close race setup" onClose={() => setSetup(false)}>
      <div className="race-variant-toggle" role="group" aria-label="Race variant">{([1,2] as const).map(choice=><button type="button" key={choice} aria-pressed={variant===choice} onClick={()=>{pause();setVariant(choice);}}>Variant {choice}</button>)}</div>
      <p className="race-variant-summary">{variant === 1 ? "Cars & roads" : "Cars, trains & logs"}</p>
      <form className="race-setup-form" onSubmit={event => {event.preventDefault(); reset(draft, true);}}>
        <label htmlFor="race-seed">MAP SEED</label><div className="race-seed-entry"><input id="race-seed" value={draft} maxLength={80} onChange={event => setDraft(event.target.value)} placeholder="Any word or number" autoComplete="off" /><button className="race-start" disabled={!ready} type="submit">Play</button></div>
        <p>Any word or number. Move to start the AI.</p>
      </form>
      <p className="race-quick-controls"><b>Arrows / WASD</b> move · <b>Space / tap</b> forward<br /><b>Swipe / drag</b> to move · <b>P</b> pause · <b>Space</b> resume</p>
      <p className="race-quick-note">The transparent chicken is the AI. Keep up with the screen to avoid the eagle.</p>
    </ReplayHelpDialog>}
  </main>;
}
