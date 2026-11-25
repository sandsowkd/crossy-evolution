import { formatMapSeed } from "./map-seed";
import { sitePath } from "./site-path";
import { useEffect, useRef, useState } from "react";
import { AUTHOR_WEBSITE, homepageMilestones, REPOSITORY } from "./site-content";
import { explorerUrl, milestoneUrl } from "./replay-links";
import type { HomepageData, PreviewClip } from "./homepage-data";
import { HomepagePlayback, type PreviewState } from "./homepage-playback";
import { ExperimentIcon } from "./ExperimentIcon";
import "./homepage.css";

const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 0 });

function Chicken() {
  return <svg width="40" height="44" viewBox="0 0 40 44" fill="none" aria-hidden="true">
    <path fill="#b4442d" d="M17 1h9v8h-9z" /><path fill="#fffdf4" d="M13 8h18v20h-5v8H5V20h8z" />
    <path fill="#d5dbcf" d="M5 28h21v8H5zM2 22h11v8H2z" /><path fill="#253b31" d="M26 13h4v5h-4z" />
    <path fill="#e2a438" d="M31 18h8v6h-8zM9 36h5v7H6v-4h3zM22 36h5v7h-8v-4h3z" />
    <path fill="#c55a40" d="M27 24h6v8h-6z" />
  </svg>;
}

function AuthorCredit() {
  return <span className="home-author">Built by <a href={AUTHOR_WEBSITE} target="_blank" rel="noreferrer">Jeremy Huang</a></span>;
}

function GithubLink() {
  return <a className="home-github" href={REPOSITORY} target="_blank" rel="noreferrer" aria-label="GitHub repository"><svg width="25" height="25" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.4-1.22.71-1.5-2.5-.28-5.12-1.25-5.12-5.54 0-1.23.44-2.23 1.16-3.01-.12-.29-.5-1.43.11-2.98 0 0 .94-.3 3.08 1.15A10.8 10.8 0 0 1 12 6.15c.95 0 1.9.13 2.8.38 2.14-1.45 3.07-1.15 3.07-1.15.61 1.55.23 2.69.12 2.98.72.78 1.15 1.78 1.15 3.01 0 4.3-2.63 5.26-5.13 5.54.4.35.76 1.03.76 2.08v3.1c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z" /></svg></a>;
}

function usePreviewVideo<T extends HTMLElement>(clip: PreviewClip, playback: HomepagePlayback, automatic: boolean, onHidden?: ()=>void) {
  const host=useRef<T>(null),video=useRef<HTMLVideoElement>(null);
  const control=useRef<ReturnType<HomepagePlayback["register"]>>(undefined);
  const [state,setState]=useState<PreviewState>("idle");
  const hidden=useRef(onHidden);hidden.current=onHidden;
  useEffect(()=>{
    const registration=playback.register({host:host.current!,media:video.current!,source:sitePath(clip.video),
      mobileSource:clip.mobileVideo&&sitePath(clip.mobileVideo),poster:sitePath(clip.poster),paired:clip.previewKind==="population-mix",automatic,onState:setState,onHidden:()=>hidden.current?.()});
    control.current=registration;
    return ()=>{registration.dispose();control.current=undefined;};
  },[playback,clip.video,clip.mobileVideo,automatic]);
  return {host,video,control,state};
}

/** Recordings share a small decoder budget; highlights play only on request. */
function Clip({ clip, title, active, activate, playback, eager = false }: {
  clip: PreviewClip; title: string; active: boolean; activate: (active: boolean) => void; playback: HomepagePlayback; eager?: boolean;
}) {
  const {host,video,control,state}=usePreviewVideo<HTMLButtonElement>(clip,playback,false,()=>activate(false));
  useEffect(()=>{control.current?.request(active);},[active,clip.video,control]);
  const change=(next: boolean)=>{
    control.current?.request(next);
    if(next)control.current?.retry();
    else if(video.current!.readyState)video.current!.currentTime=0;
    activate(next);
  };
  return <button ref={host} type="button" className={`home-clip${active ? " is-active" : ""}${active && state==="playing" ? " is-playing" : ""}`}
    data-preview-id={clip.id} data-playback-state={state}
    aria-label={`${active ? "Pause" : "Play"} preview: ${title}`} aria-pressed={active}
    onPointerEnter={event => { if (event.pointerType === "mouse") change(true); }}
    onPointerLeave={event => { if (event.pointerType === "mouse") change(false); }}
    onFocus={event => { if (event.currentTarget.matches(":focus-visible")) change(true); }}
    onBlur={() => change(false)} onClick={() => change(!active||state==="blocked"||state==="error")} onKeyDown={event => { if (event.key === "Escape") change(false); }}>
    <img src={sitePath(clip.poster)} alt={`${title}, saved generation ${clip.generation} on map ${formatMapSeed(clip.mapSeed)}`} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} width="768" height="432" />
    <video ref={video} muted loop playsInline preload="none" aria-hidden="true" />
    {active&&(state==="blocked"||state==="error")&&<span className="home-clip-error">{state==="blocked"?"Tap to play":"Tap to retry"}</span>}
  </button>;
}

function ClipStats({ clip }: { clip: PreviewClip }) {
  return <div className="home-clip-stats"><b>High Score: {number(clip.highestScore)}</b></div>;
}

function MainClip({ clip, title, playback, eager = false }: {clip: PreviewClip; title: string; playback: HomepagePlayback; eager?: boolean}) {
  const {host,video,control,state}=usePreviewVideo<HTMLDivElement>(clip,playback,true);
  return <div ref={host} className={`home-clip home-main-clip${state==="playing" ? " is-playing" : ""}`}
    data-preview-id={clip.id} data-playback-state={state} aria-label={`${title}, looping gameplay`}>
    <img src={sitePath(clip.poster)} alt={`${title}, ${clip.population === 1 ? "one saved chicken" : `${number(clip.population)} saved chickens`} on map ${formatMapSeed(clip.mapSeed)}`} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} width="768" height="432" />
    <video ref={video} autoPlay muted loop playsInline preload="none" aria-label={`${title} gameplay`} />
    {(state==="blocked"||state==="error")&&<button type="button" className="home-video-retry" onClick={()=>control.current?.retry()} aria-label={`Play ${title} gameplay`}>{state==="blocked"?"Tap to play":"Retry preview"}</button>}
  </div>;
}

function HighlightRail({ variant, clips, active, setActive, playback }: {
  variant: 1 | 2; clips: Map<string, PreviewClip>; active?: string; playback: HomepagePlayback;
  setActive: React.Dispatch<React.SetStateAction<string | undefined>>;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({previous: false, next: false});
  useEffect(() => {
    const element = track.current!;
    const update = () => setEdges({previous: element.scrollLeft > 2,
      next: element.scrollLeft < element.scrollWidth - element.clientWidth - 2});
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, {passive: true});
    update();
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, [clips.size]);
  const scroll = (direction: number) => {
    const element = track.current!;
    const card = element.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(element).columnGap) || 0;
    element.scrollBy({left: direction * ((card?.offsetWidth ?? 240) + gap),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
  };
  return <section className="home-highlights" id={variant === 1 ? "milestones" : "variant-two-highlights"} aria-label={`Variant ${variant} highlights`}>
    <div className="home-card-heading"><h2>Highlights</h2><div className="home-rail-controls">
      <button type="button" aria-label={`Scroll Variant ${variant} highlights left`} disabled={!edges.previous} onClick={() => scroll(-1)}>‹</button>
      <button type="button" aria-label={`Scroll Variant ${variant} highlights right`} disabled={!edges.next} onClick={() => scroll(1)}>›</button>
    </div></div>
    <div className="home-highlight-track" ref={track} tabIndex={0} aria-label={`Scrollable Variant ${variant} highlights`}>
      {homepageMilestones(variant).map(item => {
        const clip = clips.get(item.id), key = `${variant}-${item.id}`;
        const title = `Gen ${item.generation}: ${item.title}`;
        return <article className="home-highlight" key={item.id}>
          <div className="home-highlight-media">{clip ? <Clip clip={clip} title={title} active={active === key} playback={playback}
            activate={playing => setActive(current => playing ? key : current === key ? undefined : current)} /> : <div className="home-clip-placeholder">Loading preview…</div>}
          </div>
          <div className="home-highlight-copy"><h3 title={item.note}>{title}</h3>{clip && <ClipStats clip={clip} />}<p className="home-highlight-description">{item.description}</p>
            <a className="home-link" href={milestoneUrl(item.id)} target="_blank" rel="noreferrer"
              aria-label={`Open replay: ${title}`}>Open replay</a>
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function Experiment() {
  return <section className="home-experiment" id="how-it-works" aria-labelledby="experiment-title">
    <div className="home-section-head"><div><h2 id="experiment-title">The experiment</h2></div></div>
    <div className="home-experiment-panels">
      <article className="home-experiment-panel"><h3>Choosing a move</h3>
        <div className="home-experiment-step"><ExperimentIcon kind="surroundings" /><div><h4>Read the surroundings</h4><p>Each chicken receives numbers describing nearby tiles, obstacles, traffic positions and movement. Variant 2 also includes train warnings and whether floating logs support a landing.</p></div></div>
        <div className="home-experiment-step"><ExperimentIcon kind="action" /><div><h4>Choose an action</h4><p>Its neural network gives each of five actions a score. The highest output decides the next move.</p><div className="home-actions" aria-label="Five possible actions">{["Wait", "Forward", "Back", "Left", "Right"].map(action => <span key={action}>{action}</span>)}</div></div></div>
        <div className="home-experiment-step"><ExperimentIcon kind="decision" /><div><h4>Run the decision</h4><p>The game executes the move while traffic keeps moving. It checks the whole jump path for collisions, then passes an updated view of the surroundings back to the network for its next decision.</p></div></div>
      </article>
      <article className="home-experiment-panel"><h3>Training a population</h3>
        <div className="home-experiment-step"><ExperimentIcon kind="population" /><div><h4>Population and maps</h4><p>Standard training runs evaluate <b>100 chickens on 32 randomly generated maps per generation</b>. Every chicken faces the same maps in that generation. Variant 2’s final batches evaluated 200 chickens on 64 changing maps per generation. Earlier runs used smaller map panels.</p></div></div>
        <div className="home-experiment-step"><ExperimentIcon kind="score" /><div><h4>Reward forward progress</h4><p>A chicken’s score is the furthest row it reaches before dying or running out of time. Selection rewards forward progress across each run’s map panel.</p></div></div>
        <div className="home-experiment-step"><ExperimentIcon kind="evolution" /><div><h4>Breed and change</h4><p>Better-performing brains are more likely to become parents. NEAT combines their networks, changes connection weights, and can add neurons or connections. The next population is evaluated again.</p></div></div>
      </article>
    </div>
  </section>;
}

export function Homepage({initialData}: {initialData?: HomepageData}) {
  const host=useRef<HTMLElement>(null),manager=useRef<HomepagePlayback>(null);
  if(!manager.current)manager.current=new HomepagePlayback();
  const playback=manager.current;
  useEffect(()=>playback.connect(host.current!),[playback]);
  const [data, setData] = useState<HomepageData | undefined>(initialData);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState<string>();
  useEffect(() => {
    if (initialData && attempt === 0) return;
    const controller = new AbortController();
    setError(false);
    void fetch(sitePath("/homepage-data.json"), {signal: controller.signal}).then(async response => {
      if (!response.ok) throw new Error("Preview data unavailable");
      setData(await response.json() as HomepageData);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt, initialData]);
  useEffect(() => {
    const stop = () => { if (document.hidden) setActive(undefined); };
    document.addEventListener("visibilitychange", stop);
    return () => document.removeEventListener("visibilitychange", stop);
  }, []);
  const clips = new Map(data?.clips.map(clip => [clip.id, clip]));
  return <main className="home-page" ref={host}>
    <a className="home-skip" href="#variants">Skip to previews</a>
    <div className="home-container" id="top">
      <section className="home-intro" aria-labelledby="home-heading">
        <header className="home-banner">
          <div className="home-intro-copy"><div className="home-title"><Chicken /><h1 id="home-heading">Crossy Road AI</h1></div><p className="home-subtitle">Teaching the chicken to cross the road.</p></div>
          <div className="home-intro-aside"><div className="home-launch-actions"><a className="home-button" href={sitePath("/play")} target="_blank" rel="noreferrer">Race against the AI</a><a className="home-button home-button-secondary" href={explorerUrl()} target="_blank" rel="noreferrer">Explore replays</a><GithubLink /></div><AuthorCredit /></div>
        </header>
        <div className="home-overview"><p className="home-description">An interactive machine learning experiment that teaches AI to play Crossy Road through neuroevolution. Watch neural networks evolve from random movement to navigating traffic, trains, and rivers over hundreds of generations. Or race against the AI yourself!</p><p className="home-inspiration">Inspired by <a href="https://www.youtube.com/watch?v=Dw3BZ6O_8LY" target="_blank" rel="noreferrer">Trackmania AI experiments</a> and <a href="https://www.youtube.com/@CodeBullet" target="_blank" rel="noreferrer">Code Bullet’s AI projects</a>.</p></div>
      </section>
      {error && <p className="home-load-error" role="alert">The preview data could not load. <button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></p>}
      <div className="home-variant-rows" id="variants">
        <section className="home-variant-row" aria-labelledby="variant-one-title">
          <article className="home-variant"><div className="home-card-heading"><h2 id="variant-one-title">Variant 1: Just cars and roads</h2><a className="home-button home-explore-button" href={explorerUrl()} target="_blank" rel="noreferrer" aria-label="Explore V1">Explore V1</a></div>
            {clips.has("variant-1-main") ? <MainClip playback={playback} clip={clips.get("variant-1-main")!} title="Variant 1" eager /> : <div className="home-clip-placeholder">Loading preview…</div>}
          </article>
          <HighlightRail playback={playback} variant={1} clips={clips} active={active} setActive={setActive} />
        </section>
        <section className="home-variant-row" aria-labelledby="variant-two-title">
          <article className="home-variant"><div className="home-card-heading"><h2 id="variant-two-title">Variant 2: Cars, trains, and logs</h2><a className="home-button home-explore-button" href={explorerUrl(undefined, undefined, 2)} target="_blank" rel="noreferrer" aria-label="Explore V2">Explore V2</a></div>
            {clips.has("variant-2-main") ? <MainClip playback={playback} clip={clips.get("variant-2-main")!} title="Variant 2" /> : <div className="home-clip-placeholder">Loading preview…</div>}
          </article>
          <HighlightRail playback={playback} variant={2} clips={clips} active={active} setActive={setActive} />
        </section>
      </div>
      <section className="home-future-variant" aria-labelledby="variant-three-title"><div><h2 id="variant-three-title">Variant 3: Speedruns (Coming soon!!!)</h2></div><p>Reach 100, 500, or 1,000 rows, or collect 10, 50, or 100 coins, as fast as possible, with time penalties for deaths.</p></section>
      <Experiment />
      <section className="home-crowd" aria-labelledby="crowd-title"><div className="home-section-head"><div><h2 id="crowd-title">The entire bloodline (10 chickens from each generation)</h2></div></div>
        <div className="home-crowd-grid">{([1,2] as const).map(variant => <article key={variant}>
          <div className="home-card-heading"><h3>Variant {variant}</h3></div>
          {clips.has(variant===1 ? "all-generations" : "variant-2-all-generations") ? <MainClip playback={playback} clip={clips.get(variant===1 ? "all-generations" : "variant-2-all-generations")!} title={`Variant ${variant} chickens from 150 saved generations`} /> : <div className="home-clip-placeholder">Loading population preview…</div>}
        </article>)}</div>
        <div className="home-launch-actions home-bottom-actions">
          <a className="home-button" href={sitePath("/play")} target="_blank" rel="noreferrer">Race against the AI</a>
          <a className="home-button" href={explorerUrl()} target="_blank" rel="noreferrer">Explore replays</a>
          <a className="home-button" href={REPOSITORY} target="_blank" rel="noreferrer">See the source code</a>
        </div>
      </section>
      <footer className="home-footer"><span>Original Crossy Road assets by Evan Bacon.</span><div><a href={REPOSITORY} target="_blank" rel="noreferrer">Source code</a><a href={`${REPOSITORY}/blob/main/docs/ATTRIBUTION.md`} target="_blank" rel="noreferrer">Credits</a><a href="#top">Back to top</a><AuthorCredit /></div></footer>
      <p className="home-affiliation">Independent educational AI project. Not affiliated with, sponsored by, or endorsed by Hipster Whale. Crossy Road is a trademark of Hipster Whale Pty Ltd.</p>
    </div>
  </main>;
}
