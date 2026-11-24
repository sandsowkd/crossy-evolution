import { sitePath } from "./site-path";
import { useEffect, useRef, useState } from "react";
import { MILESTONES, HOMEPAGE_MILESTONES } from "./site-content";
import { explorerUrl, milestoneUrl, parseMapSeed } from "./replay-links";
import "./replay-menu.css";
import { ReplayButtons, ReplayHelpDialog } from "./ReplayChrome";

type Props = {
  milestone?: string; seed: number; disabled?: boolean; generation?: number;
  generations?: number[]; onGeneration?: (generation: number) => void;
  onSeed: (seed: number) => void; onInspect?: () => void;
};

/** An additive, small menu; it never changes the existing HUD or transport. */
export function ReplayMenu({ milestone, seed, disabled, generation, generations, onGeneration, onSeed, onInspect }: Props) {
  const [panel, setPanel] = useState<"navigation" | "help">();
  const [draft, setDraft] = useState(String(seed));
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { setDraft(String(seed)); setCopied(false); }, [seed, milestone, generation]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setPanel(undefined); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setPanel(undefined); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);
  const validSeed = /^\d+$/.test(draft) && Number(draft) <= 0xffffffff;
  const extraMilestone = HOMEPAGE_MILESTONES.find(item => item.id === milestone && !MILESTONES.some(saved => saved.id === item.id));
  return <div className="replay-menu" ref={root}>
    <ReplayButtons onSettings={() => setPanel(panel === "navigation" ? undefined : "navigation")}
      onHelp={() => setPanel(panel === "help" ? undefined : "help")} settingsOpen={panel === "navigation"} helpOpen={panel === "help"} />
    {panel === "navigation" && <section className="replay-menu-panel" aria-label="Replay navigation">
      <strong>VARIANT 1</strong>
      <label>Highlighted milestone
        <select aria-label="Highlighted milestone" value={milestone ?? ""} onChange={event => {
          if (event.target.value) window.location.assign(milestoneUrl(event.target.value, seed));
        }}>
          {!milestone && <option value="">General explorer</option>}
          {extraMilestone && <option value={extraMilestone.id}>Gen {extraMilestone.generation}: {extraMilestone.title}</option>}
          {MILESTONES.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.title}</option>)}
        </select>
      </label>
      {generations && onGeneration && <label>Saved generation
        <select aria-label="Saved generation" value={generation ?? ""} disabled={disabled || !generations.length}
          onChange={event => onGeneration(Number(event.target.value))}>
          {generation === undefined && <option value="">Choose generation</option>}
          {generations.map(value => <option key={value} value={value}>Generation {value}</option>)}
        </select>
      </label>}
      {generations && <p>Published snapshots of the final memory branch. The six milestones cover earlier phases.</p>}
      <form onSubmit={event => { event.preventDefault(); if (validSeed) onSeed(parseMapSeed(draft)); }}>
        <label htmlFor="replay-map-seed">Map seed</label>
        <div><input id="replay-map-seed" aria-label="Map seed" type="number" min="0" max="4294967295" required step="1"
          value={draft} onChange={event => setDraft(event.target.value)} />
          <button disabled={disabled || !validSeed} type="submit">Load</button>
          <button disabled={disabled} type="button" aria-label="Next map seed" onClick={() => onSeed((seed + 1) >>> 0)}>→</button>
        </div>
      </form>
      <p>The same saved brains, a different deterministic map. Loading a map restarts the replay.</p>
      <div className="replay-menu-links">
        {milestone ? <a href={explorerUrl(undefined, seed)}>Open generation explorer ↗</a> :
          <button onClick={() => { onInspect?.(); setPanel(undefined); }}>Neural network & graphs ↗</button>}
        <button onClick={() => {
          void navigator.clipboard.writeText(window.location.href).then(() => setCopied(true)).catch(() => setCopied(false));
        }}>{copied ? "Link copied" : "Copy replay link"}</button>
      </div>
    </section>}
    {panel === "help" && <ReplayHelpDialog title={milestone ? "Watching evolution" : "Variant 1 explorer"} onClose={() => setPanel(undefined)}>
      <p>These are saved neural networks from the completed cars-and-roads experiment. Their five action scores choose forward, back, left, right or wait.</p>
      {milestone ? <>
        <p><b>Opacity = group size.</b> Chickens in the same position share a glyph. The largest group is solid; smaller groups are fainter. The camera follows a living chicken with stable density tracking.</p>
        <p><b>Playback.</b> Play/Pause, Restart, or scrub the timeline. Jump keeps the current playing state. Auto uses 1×, 10×, 100×, then 500×, and slows near the last survivor’s ending. Choosing a speed enables Manual.</p>
        <p><b>Viewing rules.</b> Ten seconds without a new best row causes an eagle death, without animation. Replays continue until all chickens die. Published benchmark scores used a separate 600-second limit without an eagle.</p>
      </> : <>
        <p>Use the existing playback controls to watch. Select a saved generation and map here, or open Evolution controls for the neural network, activations, full generation timeline and result graphs.</p>
        <p>Archived generations use their recorded rules. New training and manual play are separate local sessions with the eagle rule. Local training or imported checkpoints are not included in shared URLs.</p>
      </>}
      <a href={sitePath("/#how-it-works")}>How NEAT works ↗</a>
    </ReplayHelpDialog>}
  </div>;
}
