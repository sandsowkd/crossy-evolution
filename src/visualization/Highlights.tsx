import { useEffect, useRef, useState } from "react";
import type { Config } from "../core/types";
import type { Genome } from "../evolution/genome";
import { Replay } from "../evolution/replay";
import { parseEvolution } from "../evolution/serialization";
import { WorldView } from "./three/scene";
import "./highlights.css";

type Highlight = {
  id: string; title: string; phaseGeneration: number; cumulativeGenerations?: number;
  developmentMean: number | null; developmentMaps?: number; developmentMaxTicks?: number;
  config: Config; observationVersion: number; genome: Genome; source: string; totalScore: number;
  independentFinalMean?: number; independentFinalMaps?: number;
};
type Manifest = { mapSeed: number; entries: Highlight[] };

/** A small set of real archived policies, played on the same declared map. */
export function Highlights() {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<WorldView | undefined>(undefined);
  const replay = useRef<Replay | undefined>(undefined);
  const playingRef = useRef(false), speedRef = useRef(1);
  const [manifest, setManifest] = useState<Manifest>();
  const [selected, setSelected] = useState(0), [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1), [ready, setReady] = useState(false), [error, setError] = useState("");
  const [status, setStatus] = useState({ score: 0, tick: 0, death: "", decision: 0 });
  const entry = manifest?.entries[selected];
  const publish = () => {
    const r = replay.current;
    if (!r) return;
    setStatus({ score: r.current.sim.agent.maxRow, tick: r.current.sim.tick,
      death: r.current.sim.agent.deathReason ?? "", decision: r.decisions });
    world.current?.update(r.snapshot());
  };
  useEffect(() => {
    let active = true, frame = 0, last = 0, elapsed = 0;
    try {
      world.current = new WorldView(host.current!);
      void world.current.ready.then(() => { if (active) setReady(true); }).catch(e => setError(String(e)));
    } catch (e) { setError(String(e)); }
    void fetch("/highlights.json").then(async response => {
      if (!response.ok) throw new Error("Highlight archive unavailable");
      return parseEvolution<Manifest>(await response.text());
    }).then(data => { if (active) setManifest(data); }).catch(e => setError(String(e)));
    let observed: Replay | undefined;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const delta = last ? Math.min(.1, (now - last) / 1000) : 0;
      last = now;
      const r = replay.current;
      if (observed !== r) { observed = r; elapsed = 0; }
      if (!r) return;
      if (playingRef.current && !r.finished) {
        elapsed += delta * speedRef.current;
        let stepped = false;
        while (elapsed >= .2 && !r.finished) { elapsed -= .2; r.advance(); stepped = true; }
        if (stepped) publish();
        if (r.finished) setPlaying(false);
      }
      world.current?.update(r.snapshot(playingRef.current ? Math.min(1, elapsed / .2) : 1));
    };
    frame = requestAnimationFrame(draw);
    return () => { active = false; cancelAnimationFrame(frame); world.current?.dispose(); };
  }, []);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => {
    if (!entry || !manifest) return;
    replay.current = new Replay([entry.genome], manifest.mapSeed, entry.config);
    world.current?.clear();
    setPlaying(false);
    publish();
  }, [entry, manifest]);
  const restart = () => {
    replay.current?.seek(0);
    world.current?.clear();
    setPlaying(false);
    publish();
  };
  const step = () => {
    setPlaying(false);
    const r = replay.current;
    if (!r) return;
    for (let i = 0; i < 5 && !r.finished; i++) r.advance();
    publish();
  };
  return <main className="highlight-page">
    <aside className="highlight-sidebar">
      <a className="highlight-back" href="/">← Return to game</a>
      <p className="highlight-kicker">VARIANT 1 · THE ARCHIVE</p>
      <h1>Six moments.<br />1,174 generations.</h1>
      <p className="highlight-intro">Real brains from the training archives. One shared replay map. Select a milestone to watch.</p>
      <nav aria-label="Training milestones">
        {manifest?.entries.map((item, index) => <button key={item.id}
          aria-current={selected === index ? "true" : undefined}
          onClick={() => setSelected(index)}>
          <span className="milestone-number">{String(index + 1).padStart(2, "0")}</span>
          <span><strong>{item.title}</strong><small>Branch generation {item.phaseGeneration.toLocaleString()}
            {item.cumulativeGenerations !== undefined ? ` · lineage ${item.cumulativeGenerations.toLocaleString()}` : ""}</small></span>
          <span aria-hidden="true">↗</span>
        </button>)}
      </nav>
      <p className="highlight-footnote">1,174 counts selected phase positions along warm starts; it excludes side experiments. Earlier checkpoints use shorter episode limits. Scores from different evaluation panels are not directly comparable.</p>
      <a href="https://github.com/sandsowkd/crossy-evolution/blob/main/docs/variants/variant-1-highlights.md">Read the short experiment writeup ↗</a>
    </aside>
    <section className="highlight-stage" aria-label="Milestone replay">
      <div ref={host} className="highlight-world" aria-busy={!ready} />
      <div className="highlight-title"><span>ARCHIVED POLICY / {String(selected + 1).padStart(2, "0")}</span><h2>{entry?.title ?? "Loading archive…"}</h2>
        <p>Map {manifest?.mapSeed ?? 42} · original rules · eagle off · {entry ? entry.config.maxTicks / 60 : "—"}s horizon</p>
      </div>
      <div className="highlight-score" aria-label="Replay score"><strong>{status.score}</strong><span>FORWARD SCORE</span></div>
      {entry && <div className="highlight-measurement">
        <span>{entry.independentFinalMean !== undefined ? "Independent final mean" : "Recorded monitoring / development mean"}</span>
        <strong>{(entry.independentFinalMean ?? entry.developmentMean)?.toLocaleString(undefined, {maximumFractionDigits: 2}) ?? "Not evaluated"}</strong>
        <small>{entry.independentFinalMaps ?? entry.developmentMaps ?? ""} maps · {(entry.developmentMaxTicks ?? entry.config.maxTicks) / 60}s episodes</small>
      </div>}
      <div className="highlight-transport">
        <div className="highlight-clock"><strong>{(status.tick / 60).toFixed(1)}s</strong><span>{status.death ? `Episode ended · ${status.death}` : "Deterministic replay · actual neural decisions"}</span></div>
        <div className="highlight-controls">
          <button disabled={!ready || !entry} onClick={restart}>Restart</button>
          <button disabled={!ready || !entry || Boolean(status.death)} onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
          <button disabled={!ready || !entry || Boolean(status.death)} onClick={step}>Step 1 second</button>
          <select aria-label="Highlight replay speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
            <option value={1}>1× speed</option><option value={10}>10× speed</option><option value={30}>30× speed</option>
          </select>
        </div>
        <input aria-label="Highlight replay time" type="range" min={0} max={Math.ceil((entry?.config.maxTicks ?? 1800) / 12)} value={status.decision}
          onChange={event => { setPlaying(false); replay.current?.seek(Number(event.target.value)); world.current?.clear(); publish(); }} />
        <small>Fixed map full-episode score: {entry?.totalScore ?? "—"} · {entry?.genome.nodes.filter(node => node.kind === "hidden").length ?? 0} hidden nodes · {entry?.genome.connections.filter(edge => edge.enabled).length ?? 0} active connections</small>
      </div>
      {(!ready || error) && <div className="highlight-loading" role="status">{error || "Loading original models…"}</div>}
    </section>
  </main>;
}
