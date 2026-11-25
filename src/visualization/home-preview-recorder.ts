/** Asset-generation entry point only; never imported by the production homepage. */
import { hopTicks, type Config } from "../core/types";
import type { Genome } from "../evolution/genome";
import { Replay } from "../evolution/replay";
import { parseEvolution } from "../evolution/serialization";
import { loadCohort } from "./cohorts";
import { highlightAutomaticSpeed, highlightBestScore, highlightReplayConfig, HIGHLIGHT_REPLAY_OPTIONS } from "./highlight-playback";
import type { HomepageData } from "./homepage-data";
import { FRONT_PACK_ROWS, populationFrame } from "./population-density";
import { WorldView } from "./three/scene";
import { renderExperimentIcons } from "./experiment-icon-recorder";

const sink = "http://127.0.0.1:8883", fps = 15;
const status = document.querySelector<HTMLElement>("#status")!;
document.querySelector<HTMLButtonElement>("#record")!.onclick = async event => {
  (event.currentTarget as HTMLButtonElement).disabled = true;
  let view: WorldView | undefined;
  try {
    if (new URL(location.href).searchParams.has("icons")) {
      await renderExperimentIcons(sink, status);
      return;
    }
    const font = new FontFace("PreviewRetro", "url(/upstream/fonts/retro.ttf)");
    document.fonts.add(await font.load());
    const output = document.createElement("canvas");
    output.width = 768; output.height = 432;
    const context = output.getContext("2d")!;
    const data: HomepageData = await fetch("/homepage-data.json").then(r => r.json());
    type Entry = {id: string; genome: Genome; config: Config; generation: number; contenders: Genome[];
      populationSize: number; cohortFile: string; cohortHash: string};
    const manifest = parseEvolution<{entries: Entry[]; additionalEntries?: Entry[]}>(await fetch("/highlights.json").then(r => r.text()));
    const entries = [...manifest.entries, ...(manifest.additionalEntries ?? [])];
    const params = new URL(location.href).searchParams;
    const readmePlan: {clips: {id: string; decisionRange: {start: number; end: number}}[]} | undefined = params.has("readme")
      ? await fetch(`${sink}/readme-plan.json`).then(response => response.json()) : undefined;
    const selectedId = params.get("clip");
    const selectedIds = params.get("clips")?.split(",");
    const clips = data.clips.filter(clip => (!params.has("variant2") || clip.variant===2) && (!selectedId || clip.id === selectedId) && (!selectedIds || selectedIds.includes(clip.id)) && (!params.has("highlights") || !clip.decisionRange)
      && (!readmePlan || readmePlan.clips.some(item => item.id === clip.id)));
    if (!clips.length) throw new Error("Unknown preview clip");
    for (const clip of clips) {
      status.textContent = `Loading ${clip.id}`;
      let genomes: Genome[], config: Config;
      if (clip.previewKind === "population-mix") {
        const input = parseEvolution<{genomes: Genome[]; config: Config}>(await fetch(`${sink}/${clip.variant===2 ? "variant-2-flock.json" : "flock.json"}`).then(r=>r.text()));
        genomes = input.genomes; config = input.config;
      } else if (clip.variant === 1) {
        const entry = entries.find(item => item.id === (clip.id === "variant-1-main" ? "variant-1-final" : clip.id))!;
        if (clip.decisionRange) genomes = [entry.genome];
        else genomes = (await loadCohort({ ...entry, contenders: entry.contenders ?? [] })).contenders;
        config = highlightReplayConfig(entry.config);
      } else if(clip.decisionRange) {
        const input=parseEvolution<{genomes:Genome[];simulation:Config}>(await fetch(`${sink}/variant-2.json`).then(r=>r.text()));
        genomes=input.genomes.filter(genome=>genome.id===clip.policyGenomeId);config=input.simulation;
      } else {
        const catalog=await fetch("/explorer-catalog.json").then(r=>r.json()) as import("./explorer-data").ExplorerCatalog;
        const row=catalog.variants.find(v=>v.id===2)!.sequence!.find(r=>r.generation===clip.generation)!;
        genomes=(await loadCohort({...row,contenders:[]})).contenders;config=row.config;
      }
      if (genomes.length !== clip.population) throw new Error(`Wrong population for ${clip.id}`);
      const replay = new Replay(genomes, clip.mapSeed, config, HIGHLIGHT_REPLAY_OPTIONS);
      // README snippets use fixed simulation ranges, bypassing Auto acceleration.
      // These ranges never replace the production homepage's clip metadata.
      const range = readmePlan?.clips.find(item => item.id === clip.id)?.decisionRange ?? clip.decisionRange ?? clip.videoDecisionRange;
      while (range && replay.decisions < range.start && !replay.finished) replay.advance();
      view = new WorldView(document.querySelector<HTMLDivElement>("#world")!, undefined, {focusScreenY: -.35, responsiveFollow: true});
      view.select(-1);
      view.renderer.setPixelRatio(1);
      await view.ready;
      // Frame at desktop scale, then record a smaller video without changing the camera.
      view.renderer.setSize(768, 432, false);
      const scale = hopTicks(config) / 12, hop = hopTicks(config) / 60;
      const plan = clip.automaticPlayback && { ...clip.automaticPlayback,
        slowAtDecision: clip.automaticPlayback.slowAtDecision * scale,
        finishAtDecision: clip.automaticPlayback.finishAtDecision * scale };
      const speed = () => range ? 1 : highlightAutomaticSpeed(replay.decisions * scale, plan);
      let credit = 0, observedSpeed = 1, terminal = 0, frame = 0;
      const recordedSpeeds = new Set<number>();
      const cameraFrames: {frame: number; decision: number; followedId: number; count: number; frontRow: number; focusRow: number; gap: number}[] = [];
      const lastFrame = range ? Math.round((range.end - range.start) * hop * fps) : Infinity;
      while (range ? frame <= lastFrame : terminal < 9) {
        let alpha: number;
        if (range) {
          // Include the exact starting and ending move at normal speed.
          const position = range.start + frame / (fps * hop);
          const decision = Math.floor(position + 1e-9);
          // Record the untouched initial population before forecasting its first hop.
          if(frame === 0 && range.start === 0) alpha = 1;
          else {
            while (replay.decisions < Math.min(range.end, decision + 1) && !replay.finished) replay.advance();
            alpha = decision >= range.end ? 1 : Math.max(0, position - decision);
          }
        } else {
          let currentSpeed = speed();
          if (currentSpeed !== observedSpeed) credit *= currentSpeed / observedSpeed;
          observedSpeed = currentSpeed;
          if (frame) credit += currentSpeed / fps;
          while (credit + 1e-10 >= hop && !replay.finished) {
            credit = Math.max(0, credit - hop); replay.advance();
            currentSpeed = speed();
            if (currentSpeed !== observedSpeed) { credit *= currentSpeed / observedSpeed; observedSpeed = currentSpeed; }
          }
          if (replay.finished) terminal++;
          alpha = replay.finished ? 1 : Math.min(1, credit / hop);
        }
        recordedSpeeds.add(range ? 1 : observedSpeed);
        const snapshot = populationFrame(replay, alpha, frame / fps * 1000, clip.previewKind === "population-mix");
        if (clip.previewKind === "population-mix" && snapshot.agents.length) {
          const frontRow = Math.max(...snapshot.agents.map(group => group.row));
          const tracked = snapshot.agents.find(group => group.memberIds.includes(replay.selected));
          const largestEligible = Math.max(...snapshot.agents.filter(group => frontRow - group.row <= FRONT_PACK_ROWS).map(group => group.populationCount));
          if (!tracked || frontRow - tracked.row > FRONT_PACK_ROWS || tracked.opacity !== 1 || tracked.populationCount !== largestEligible)
            throw new Error(`Bloodline front-pack camera invariant failed at frame ${frame}`);
          cameraFrames.push({frame, decision: replay.decisions, followedId: replay.selected,
            count: tracked.populationCount, frontRow, focusRow: tracked.row, gap: frontRow - tracked.row});
        }
        view.update(snapshot);
        const score = range && alpha < 1 ? Math.max(...replay.agents.map(agent => agent.previous.maxRow)) : highlightBestScore(replay);
        const blob = await new Promise<Blob>((resolve, reject) => requestAnimationFrame(() => {
          context.drawImage(view!.renderer.domElement, 0, 0);
          context.font = "40px PreviewRetro";
          context.textAlign = "right"; context.textBaseline = "top";
          context.lineJoin = "round"; context.lineWidth = 5;
          context.strokeStyle = "#273c3f"; context.fillStyle = "#ffffff";
          context.strokeText(String(score), output.width - 18, 16);
          context.fillText(String(score), output.width - 18, 16);
          if (clip.previewKind === "population-mix") {
            context.font = "17px PreviewRetro"; context.textAlign = "left"; context.lineWidth = 3;
            const label = `${replay.agents.filter(agent=>range && alpha < 1 ? agent.previous.alive : agent.sim.agent.alive).length} / 1500 ALIVE`;
            context.strokeText(label,18,18); context.fillText(label,18,18);
          }
          output.toBlob(value => value ? resolve(value) : reject(new Error("Empty frame")), "image/jpeg", .87);
        }));
        const response = await fetch(`${sink}/frame/${clip.id}/${String(frame).padStart(5, "0")}`, {method: "POST", body: blob});
        if (!response.ok) throw new Error(await response.text());
        if (frame % 30 === 0) status.textContent = `${clip.id} · frame ${frame} · move ${replay.decisions} · ${observedSpeed}×`;
        frame++;
      }
      status.textContent = `Encoding ${clip.id}`;
      const response = await fetch(`${sink}/finish/${clip.id}`, {method: "POST",
        body: JSON.stringify({fps, speed: range ? 1 : "auto", decisionRange: range, frameCount: frame,
          recordedSpeeds: [...recordedSpeeds], completed: replay.finished, decisions: replay.decisions,
          highestScore: highlightBestScore(replay), population: genomes.length, mapSeed: replay.seed,
          ...(cameraFrames.length ? {frontPackCamera: {maximumTrailingRows: FRONT_PACK_ROWS,
            verifiedFrames: cameraFrames.length, maximumObservedTrailingRows: Math.max(...cameraFrames.map(item => item.gap)),
            densestEligibleEveryFrame: true, followedGroupOpaqueEveryFrame: true}, cameraFrames} : {})})});
      if (!response.ok) throw new Error(await response.text());
      view.dispose(); view = undefined;
    }
    status.textContent = `All ${clips.length} clips complete.`;
  } catch (error) { status.textContent = String(error); console.error(error); }
  finally { view?.dispose(); }
};
