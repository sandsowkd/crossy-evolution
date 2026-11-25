import { sitePath } from "./site-path";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ExplorerCatalog } from "./explorer-data";
import { ReplayStage } from "./Highlights";
import { HOMEPAGE_MILESTONES, MILESTONES, homepageMilestones } from "./site-content";
import { labUrl, milestonePhase, replayUrl, siteRoute, type VariantNumber } from "./replay-links";
import "./replay-menu.css";
import "./explorer.css";
import { closeOnBackdrop, ReplayButtons, ReplayHelpDialog } from "./ReplayChrome";

import { defaultSelection, mapSeedOptions, menuRecords, resolveEntry, type Selection } from "./explorer-selection";
function selectionFromUrl(): Selection | undefined {
  const route = siteRoute(new URL(window.location.href));
  if (route.page === "explorer" && route.generation !== undefined && route.seed !== undefined && route.phase !== undefined)
    return {variant: route.variant, phase: route.phase, generation: route.generation, seed: route.seed};
  if (route.page === "highlight") {
    const milestone = [...MILESTONES, ...HOMEPAGE_MILESTONES].find(item => item.id === route.milestone);
    return {variant: 1, phase: milestonePhase(route.milestone), generation: milestone?.generation ?? 50, seed: route.seed};
  }
}
function Navigation({ onMenu, variant, selection }: {onMenu: () => void; variant: VariantNumber; selection?: Selection}) {
  const [help, setHelp] = useState(false), [copied, setCopied] = useState(false);
  return <div className="replay-menu">
    <ReplayButtons onSettings={() => {setHelp(false); onMenu();}} onHelp={() => setHelp(!help)} helpOpen={help} />
    {help && <ReplayHelpDialog title={`Variant ${variant} replay`} onClose={() => setHelp(false)}>
      <p>Every saved chicken in this generation runs its own neural network on the same deterministic map. No networks are trained or changed here.</p>
      <p><b>Opacity shows group size.</b> Chickens at the same position share a white glyph. The largest group stays solid; smaller groups are more transparent. The camera holds its target through close density changes.</p>
      <p><b>Playback.</b> Press Space to play or pause. You can also restart, jump, or scrub. Jump keeps the current playing state. Auto spends five viewing seconds at 1×, five at 10×, five at 100×, then uses 500×, slowing near the final survivor’s ending. Choose a speed for Manual.</p>
      <p>{variant === 1 ? "Viewing replays end when all chickens die, with a ten-second no-progress eagle rule and no eagle animation. Benchmark evaluations used their recorded limits and no eagle." : "Variant 2 training is complete. Replays preserve frozen V4 timing, traffic, log, train, and eagle rules and the 600-second limit. Display 1–150 curates authentic saved populations from several experiments; source generations and transfers remain in the provenance."}</p>
      <p>Use the menu for six highlights, or open Advanced Replay to choose a generation and map.</p>
      <div className="replay-menu-links"><button onClick={() => {
        void navigator.clipboard.writeText(window.location.href).then(() => setCopied(true)).catch(() => setCopied(false));
      }}>{copied ? "Link copied" : "Copy replay link"}</button>
        <a href={variant === 1 ? labUrl(undefined, selection?.seed) : sitePath("/?variant=2")} target="_blank" rel="noreferrer">Neural networks & graphs ↗</a>
        <a href={sitePath("/#how-it-works")}>About the experiment ↗</a>
      </div>
    </ReplayHelpDialog>}
  </div>;
}

function Picker({catalog, selection, onChoose, onPreview, onClose}: {
  catalog: ExplorerCatalog; selection: Selection;
  onChoose: (selection: Selection) => void; onPreview: (selection: Selection) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [variant, setVariant] = useState(selection.variant);
  const [advanced, setAdvanced] = useState(false);
  const available = catalog.variants.find(item => item.id === variant)!;
  const records = useMemo(() => menuRecords(available), [available]);
  const initialRecord = records.find(row => row.generation === selection.generation) ?? records[0];
  const [generation, setGeneration] = useState(initialRecord.generation);
  const [seed, setSeed] = useState(selection.seed);
  const [seedText,setSeedText]=useState(String(selection.seed));
  const record = records.find(item => item.generation === generation) ?? records[0];
  const selected = {variant, phase: available.sequence ? "sequence" : available.phases[0].id, generation: record.generation, seed};
  const cards = homepageMilestones(variant).map(item => ({generation:item.generation,
    title:item.title,description:item.description,poster:sitePath(`/previews/${item.id}.jpg`)}));
  useEffect(() => {
    dialog.current!.showModal();
    dialog.current!.querySelector<HTMLElement>("#explorer-heading")!.focus({preventScroll: true});
  }, []);
  const preview = (nextGeneration: number, nextSeed = homepageMilestones(variant).find(item=>item.generation===nextGeneration)?.previewSeed ?? seed) => {
    setGeneration(nextGeneration);setSeed(nextSeed);setSeedText(String(nextSeed));
    onPreview({variant,phase:available.sequence ? "sequence" : available.phases[0].id,generation:nextGeneration,seed:nextSeed});
  };
  return <dialog ref={dialog} className="explorer-dialog" aria-labelledby="explorer-heading"
    onClick={event => closeOnBackdrop(event, onClose)}
    onCancel={event => {event.preventDefault(); onClose();}}>
    <div className="explorer-dialog-heading"><h1 id="explorer-heading" tabIndex={-1}>{advanced ? "Advanced Replay" : "Choose a replay"}</h1>
      <div className="explorer-heading-actions">
        <div className="explorer-variant-toggle" role="group" aria-label="Replay variant">
          {catalog.variants.map(item => <button type="button" key={item.id} aria-pressed={variant === item.id}
            onClick={() => {
              if (variant === item.id) return;
              const next = defaultSelection(item.id, catalog);
              setVariant(item.id); setGeneration(1); setSeed(next.seed);setSeedText(String(next.seed)); onPreview(next);
            }}>Variant {item.id}</button>)}
        </div>
        <span className="explorer-variant-info"><button type="button" aria-label="About the variants" aria-describedby="variant-explanation">?</button>
          <span role="tooltip" id="variant-explanation">Variant 1 has cars and roads. Variant 2 adds trains and floating logs. Both variants have150 curated saved generations.</span>
        </span>
        <button type="button" onClick={onClose} aria-label="Close replay menu">×</button>
      </div>
    </div>
    <div className="explorer-dialog-body">
      {advanced ? <div className="explorer-advanced">
        <p className="explorer-advanced-intro">Replay a specific generation</p>
        <p>Choose any saved generation from 1 to 150, then choose a map seed. Every chicken in the population plays the same map.</p>
        <div className="explorer-fields"><label>Generation<select aria-label="Replay generation" value={record.generation}
          onChange={event => preview(Number(event.target.value))}>
          {records.map(row => <option value={row.generation} key={row.generation}>Generation {row.generation}</option>)}
        </select></label>
        <label>Map seed<select aria-label="Replay map seed" value={seed} onChange={event => preview(record.generation, Number(event.target.value))}>
          {[...new Set([seed,...mapSeedOptions(record)])].map(value => <option key={value} value={value}>{value}</option>)}
        </select></label></div>
        <form className="explorer-custom-seed" onSubmit={event=>{event.preventDefault();if(/^\d+$/.test(seedText) && Number(seedText)<=0xffffffff) preview(record.generation,Number(seedText));}}>
          <label>Custom map seed<input aria-label="Custom replay map seed" inputMode="numeric" pattern="[0-9]+" value={seedText} onChange={event=>setSeedText(event.target.value)} /></label>
          <button type="submit" disabled={!/^\d+$/.test(seedText) || Number(seedText)>0xffffffff}>Load seed</button>
        </form>
        <div className="explorer-advanced-guide"><p><b>What is a seed?</b> The number recreates the same roads and traffic every time. {variant === 1 ? "Every generation uses the same eight numbered maps, so you can compare its behavior on identical roads. Custom seeds are also available." : "Every display generation is audited on the same eight maps under frozen V4 rules. You can also enter any seed from 0 to 4,294,967,295."}</p>
          <p><b>What changes?</b> A new generation loads different saved brains. A new seed keeps those brains and changes the map. Individual runs vary.</p>
          <p><b>Watch together.</b> Opacity shows how many chickens share a position. Press Play to start, or Space to pause and resume.</p></div>
        <p className="explorer-population-size">{record.populationSize} chickens · {mapSeedOptions(record).length} audited maps{<> · <a href={sitePath(variant===1 ? "/replay-audit.html" : "/variant-2/replay-audit.html")} target="_blank" rel="noreferrer">View all generation scores ↗</a></>}</p>
      </div> : <div className="explorer-highlight-grid" aria-label="Replay highlights">
        {cards.map(card => <button key={card.generation} type="button" className="explorer-highlight-card"
          aria-label={`Select generation ${card.generation}: ${card.title}`} aria-pressed={record.generation === card.generation}
          onClick={() => preview(card.generation)}>
          <img src={card.poster} alt={variant === 1 ? `Generation ${card.generation} replay` : "Variant 2 gameplay"} width="768" height="432" />
          <span className="explorer-card-copy"><strong>Gen {card.generation}: {card.title}</strong><span>{card.description}</span></span>
        </button>)}
      </div>}
    </div>
    <div className="explorer-dialog-footer">
      <button type="button" className="explorer-advanced-toggle" onClick={() => setAdvanced(!advanced)}>
        {advanced ? "‹ Main highlights" : <>Advanced Replay <span>(choose a generation & map)</span></>}</button>
      <button className="explorer-play" type="button" onClick={() => onChoose(selected)}>Play ▶</button>
    </div>
  </dialog>;
}

export function Explorer() {
  const initial = siteRoute(new URL(window.location.href));
  const initialVariant = initial.page === "explorer" ? initial.variant : 1;
  const [catalog, setCatalog] = useState<ExplorerCatalog>();
  const [selection, setSelection] = useState(selectionFromUrl);
  const [menu, setMenu] = useState(!selection);
  const [error, setError] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [runId, setRunId] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(sitePath("/explorer-catalog.json"), {signal: abort.signal}).then(async response => {
      if (!response.ok) throw new Error("Saved generation catalog unavailable");
      setCatalog(await response.json() as ExplorerCatalog);
    }).catch(e => {if (!abort.signal.aborted) setError(String(e));});
    const back = () => {const next = selectionFromUrl(); setSelection(next); setMenu(!next); setAutoStart(false);};
    window.addEventListener("popstate", back);
    return () => {abort.abort(); window.removeEventListener("popstate", back);};
  }, []);
  const shown = selection ?? defaultSelection(initialVariant, catalog);
  const entry = useMemo(() => catalog && resolveEntry(catalog, shown), [catalog, shown.variant, shown.phase, shown.generation]);
  useEffect(() => {
    if (selection && entry && !menu) window.history.replaceState(null, "", replayUrl(selection.generation, selection.seed, selection.variant, selection.phase));
  }, [selection, entry, menu]);
  const choose = (next: Selection) => {
    window.history.pushState(null, "", replayUrl(next.generation, next.seed, next.variant, next.phase));
    setRunId(id => id + 1); setAutoStart(true); setSelection(next); setMenu(false);
  };
  const navigation = <Navigation variant={shown.variant} selection={shown} onMenu={() => setMenu(true)} />;
  return <>
    {entry ? <ReplayStage key={`${shown.variant}/${shown.phase}/${shown.generation}/${shown.seed}/${runId}`}
      entry={entry} mapSeed={shown.seed} autoStart={autoStart} suspended={menu}>{navigation}</ReplayStage> :
      <main className="explorer-empty"><a className="explorer-empty-brand" href={sitePath()}>CROSSY EVOLUTION</a>{navigation}
        {(!catalog || !menu) && <div className="highlight-loading" role="status">{error || (catalog ? "This saved generation is unavailable." : "Loading saved generations…")}
          {catalog && <button onClick={() => setMenu(true)}>Choose another replay</button>}</div>}
      </main>}
    {menu && catalog && <Picker catalog={catalog} selection={shown}
      onChoose={choose} onPreview={next => {setAutoStart(false); setSelection(next);}} onClose={() => {setSelection(shown); setMenu(false);}} />}
  </>;
}
