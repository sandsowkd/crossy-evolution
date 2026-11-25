import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { hopTicks } from "../core/types";
import { Replay } from "../evolution/replay";
import { loadCohort } from "./cohorts";
import { populationFrame } from "./population-density";
import { highlightReplayConfig, highlightTimeline, highlightJumpSeconds, highlightJumpTarget, highlightBestScore,
  highlightAutomaticSpeed, type HighlightAutoSpeedPlan, HIGHLIGHT_SPEEDS, HIGHLIGHT_REPLAY_OPTIONS } from "./highlight-playback";
import { WorldView } from "./three/scene";
import { isReplaySpace } from "./explorer-sequence";
import type { ReplayEntry } from "./explorer-data";
import "./highlights.css";

const emptyStatus = { score: 0, tick: 0, decision: 0, alive: 0, total: 0, largest: 0, groups: 0, eagleDeaths: 0, finished: false };

/** Shared full-screen population replay; navigation is supplied by the explorer. */
export function ReplayStage({entry, mapSeed, children, autoStart = false, suspended = false}: {
  entry: ReplayEntry; mapSeed: number; children: ReactNode; autoStart?: boolean; suspended?: boolean;
}) {
  const hop = hopTicks(entry.config), stepSeconds = hop / 60;
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<WorldView | undefined>(undefined);
  const replay = useRef<Replay | undefined>(undefined);
  const bestScore = useRef(0);
  const playingRef = useRef(false), speedRef = useRef(1), seekToken = useRef(0);
  const seekingRef = useRef(false);
  const startPending = useRef(autoStart);
  const automaticRef = useRef(true), autoPlan = useRef<HighlightAutoSpeedPlan | undefined>(undefined);
  const [replayDecisions, setReplayDecisions] = useState(1);
  const [planning, setPlanning] = useState(false);
  const [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1);
  const [automatic, setAutomatic] = useState(true);
  const [ready, setReady] = useState(false), [cohortReady, setCohortReady] = useState(false);
  const [error, setError] = useState(""), [seeking, setSeeking] = useState<number>();
  const [status, setStatus] = useState(emptyStatus);
  const applyAutomaticSpeed = (decision: number) => {
    if (!automaticRef.current) return;
    const next = highlightAutomaticSpeed(decision, autoPlan.current, hop);
    if (next !== speedRef.current) { speedRef.current = next; setSpeed(next); }
  };
  const publish = (render = true) => {
    const r = replay.current;
    if (!r) return;
    applyAutomaticSpeed(r.decisions);
    const frame = populationFrame(r);
    bestScore.current = highlightBestScore(r, bestScore.current);
    setStatus({ score: bestScore.current,
      tick: r.decisions * hop, decision: r.decisions,
      ...frame.population, finished: r.finished });
    if (render) world.current?.update(frame);
  };
  const pause = () => { playingRef.current = false; setPlaying(false); };
  useEffect(() => {
    let active = true, frame = 0, last = 0, elapsed = 0, observedSpeed = 1;
    try {
      world.current = new WorldView(host.current!, undefined, { focusScreenY: -.05, responsiveFollow: true });
      world.current.select(-1);
      world.current.renderer.domElement.setAttribute("aria-label", "Archived chicken population, opacity shows group size");
      void world.current.ready.then(() => { if (active) setReady(true); }).catch(e => setError(String(e)));
    } catch (e) { setError(String(e)); }
    let observed: Replay | undefined;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const delta = last ? Math.min(.1, (now - last) / 1000) : 0;
      last = now;
      const r = replay.current;
      if (observed !== r) { observed = r; elapsed = 0; }
      if (!r) return;
      const syncSpeed = () => {
        applyAutomaticSpeed(r.decisions);
        // Pending simulation time belongs to the old speed. Preserve its real duration.
        if (observedSpeed !== speedRef.current) {
          elapsed *= speedRef.current / observedSpeed;
          observedSpeed = speedRef.current;
        }
      };
      syncSpeed();
      if (!playingRef.current || seekingRef.current) elapsed = 0;
      if (playingRef.current && !seekingRef.current && !r.finished) {
        elapsed += delta * speedRef.current;
        let stepped = false;
        // Yield between batches so a large generation cannot monopolize the UI.
        const workStarted = performance.now();
        while (elapsed >= stepSeconds && !r.finished) {
          elapsed -= stepSeconds; r.advance(); stepped = true;
          syncSpeed();
          if (performance.now() - workStarted >= 8) break;
        }
        if (stepped) publish(false);
        if (r.finished) pause();
      }
      world.current?.update(populationFrame(r, playingRef.current && !seekingRef.current ? Math.min(1, elapsed / stepSeconds) : 1));
    };
    frame = requestAnimationFrame(draw);
    return () => { active = false; seekToken.current++; cancelAnimationFrame(frame); world.current?.dispose(); };
  }, []);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { if (suspended) { startPending.current = false; pause(); } }, [suspended]);
  useEffect(() => {
    if (ready && cohortReady && startPending.current && !suspended) {
      startPending.current = false; playingRef.current = true; setPlaying(true);
    }
  }, [ready, cohortReady, suspended]);
  useEffect(() => {
    let active = true, planner: Worker | undefined;
    seekToken.current++;
    seekingRef.current = false;
    pause(); setSeeking(undefined); setCohortReady(false); setError("");
    replay.current = undefined;
    autoPlan.current = entry.automaticPlayback;
    setReplayDecisions(entry.populationReplayDecisions ?? 1);
    setPlanning(false);
    applyAutomaticSpeed(0);
    bestScore.current = 0;
    world.current?.clear();
    setStatus({ ...emptyStatus, total: entry.populationSize });
    // Document metadata follows the URL; replay statistics stay in the existing HUD.
    void loadCohort({ generation: entry.generation, contenders: [],
      populationSize: entry.populationSize, cohortFile: entry.cohortFile, cohortHash: entry.cohortHash,
    }).then(record => {
      if (!active) return;
      const install = () => {
        replay.current = new Replay(record.contenders, mapSeed,
          highlightReplayConfig(entry.config), HIGHLIGHT_REPLAY_OPTIONS);
        setPlanning(false); setCohortReady(true); publish();

      };
      if (mapSeed === (entry.planSeed ?? 42) && entry.populationReplayDecisions && entry.automaticPlayback) { install(); return; }
      setPlanning(true);
      planner = new Worker(new URL("./highlight-planner.worker.ts", import.meta.url), { type: "module" });
      planner.onmessage = ({ data }: MessageEvent<{ decisions: number; automaticPlayback: HighlightAutoSpeedPlan; error?: string }>) => {
        if (!active) return;
        planner?.terminate();
        if (data.error) { setError(data.error); return; }
        autoPlan.current = data.automaticPlayback; setReplayDecisions(data.decisions); install();
      };
      planner.onerror = () => { if (active) setError("This map could not be prepared. Choose another seed from the replay menu."); };
      planner.postMessage({ genomes: record.contenders, seed: mapSeed, config: entry.config });
    }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; planner?.terminate(); };
  }, [entry, mapSeed]);
  const restart = () => {
    seekToken.current++; setSeeking(undefined); pause();
    seekingRef.current = false;
    bestScore.current = 0;
    replay.current?.seek(0); world.current?.clear(); publish();
  };
  const seek = async (decision: number, fromStart = true, preservePlaying = false) => {
    if (!preservePlaying) pause();
    const r = replay.current;
    if (!r) return;
    const token = ++seekToken.current;
    const next = fromStart ? new Replay(r.agents.map(agent => agent.genome), r.seed, r.config, r.options) : r;
    const startDecision = next.decisions;
    replay.current = next;
    seekingRef.current = true;
    setSeeking(0);
    while (next.decisions < decision && !next.finished) {
      const start = performance.now();
      do { next.advance(); } while (next.decisions < decision && !next.finished && performance.now() - start < 10);
      if (token !== seekToken.current) return;
      setSeeking(Math.round((next.decisions - startDecision) / Math.max(1, decision - startDecision) * 100));
      publish();
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (token !== seekToken.current) return;
    }
    world.current?.clear(); publish();
    seekingRef.current = false; setSeeking(undefined);
    if (next.finished) pause();
  };
  const enabled = ready && cohortReady && seeking === undefined;
  const timeline = highlightTimeline(status.decision, replayDecisions);
  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (suspended || !enabled || status.finished || event.defaultPrevented || !isReplaySpace(event, event.target)) return;
      event.preventDefault();
      playingRef.current = !playingRef.current;
      setPlaying(playingRef.current);
    };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, [enabled, suspended, status.finished]);
  return <main className="highlight-page" aria-label={entry?.title ?? "Chicken replay"}>
    <section className="highlight-stage" aria-label="Milestone replay">
      <div ref={host} className="highlight-world" aria-busy={!ready || !cohortReady} />
      <div className="highlight-status">
        <strong aria-label="Chickens alive">{status.alive} / {status.total || entry?.populationSize || 0} chickens alive</strong>
        <span aria-label="Elapsed time">{(status.tick / 60).toFixed(1)}s</span>
      </div>
      <div className="highlight-score" aria-label="Best score"><strong>{status.score}</strong><span>BEST SCORE</span></div>
      {children}
      <div className="highlight-transport" aria-label="Replay controls">
        <div className="highlight-controls">
          <button disabled={!ready || !cohortReady} onClick={restart}>Restart</button>
          <button disabled={!enabled || status.finished} onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
          <button className="highlight-jump" disabled={!enabled || status.finished}
            onClick={() => { const r = replay.current; if (r) void seek(highlightJumpTarget(r.decisions, speed, hop), false, true); }}>
            {seeking !== undefined ? `Jumping… ${seeking}%` : `Jump ${highlightJumpSeconds(speed)} seconds`}
          </button>
          <select aria-label="Highlight replay speed" value={speed} onChange={event => {
            automaticRef.current = false; setAutomatic(false);
            speedRef.current = Number(event.target.value); setSpeed(speedRef.current);
          }}>
            {HIGHLIGHT_SPEEDS.map(multiplier => <option key={multiplier} value={multiplier}>{multiplier}× speed</option>)}
          </select>
          <button className="highlight-mode" aria-label="Automatic replay speed" aria-pressed={automatic}
            title="Auto: 5 viewing seconds at 1×, 5 at 10×, 5 at 100×, then 500×; slow down near the final chicken's best score"
            onClick={() => {
              const next = !automaticRef.current;
              automaticRef.current = next; setAutomatic(next);
              applyAutomaticSpeed(replay.current?.decisions ?? 0);
            }}>{automatic ? "Auto" : "Manual"}</button>
        </div>
        <div className="highlight-timeline-wrap" style={{ "--replay-progress": `${timeline.percent}%` } as CSSProperties}>
          <div className="highlight-timeline-track" aria-hidden="true"><div /></div>
          <input className="highlight-timeline" aria-label="Highlight replay time" type="range" min={0} max={timeline.max} value={timeline.value}
            disabled={!ready || !cohortReady} onChange={event => { void seek(Number(event.target.value)); }} />
        </div>
      </div>
      {(!ready || !cohortReady || error) && <div className="highlight-loading" role="status">{error || (planning ? `Preparing map ${mapSeed} for all ${entry?.populationSize} chickens…` : `Loading all ${entry?.populationSize ?? "archived"} chickens…`)}</div>}
    </section>
  </main>;
}
