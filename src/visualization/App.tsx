import { useEffect, useRef, useState } from "react";
import { type Action } from "../core/types";
import { INPUT_COUNT } from "../core/observation";
import { hash } from "../core/rng";
import { NEAT } from "../evolution/neat";
import { Replay } from "../evolution/replay";
import { parseCheckpoint } from "../evolution/checkpoint";
import { parseEvolution, stringifyEvolution } from "../evolution/serialization";
import {
  DEFAULT_TRAINING,
  type Checkpoint,
  type Generation,
  type TrainingConfig,
} from "../evolution/trainer";
import { type Genome } from "../evolution/genome";
import { WorldView } from "./three/scene";
import { NeuralGraph } from "./components/NeuralGraph";
import { EvolutionChart } from "./components/EvolutionChart";
import { loadCohort } from "./cohorts";

type Inspector = {
  genome: Genome;
  values: Float32Array;
  score: number;
  action: Action;
  death?: string;
  tick: number;
  decision: number;
};
const initial = new NEAT(1, hash(42, 0, 99)).population[0];
const initialInfo: Inspector = {
  genome: initial,
  values: new Float32Array(INPUT_COUNT + 6),
  score: 0,
  action: "WAIT",
  tick: 0,
  decision: 0,
};
type Demo = {
  config: TrainingConfig;
  history: Generation[];
  evaluation: {
    kind?: "development" | "final";
    summary: Record<string, { meanRow: number }>;
    evaluationSeeds: number[];
    generation: number;
    previousModel?: { generation: number; genome: number };
    pairedPrevious?: { meanDifference: number; bootstrap95: [number, number] };
    simulation?: { maxTicks: number };
  };
  selectedModel?: {
    generation: number;
    genome: Genome;
    meanRow: number;
    validationSeeds?: number[];
  };
  provenance?: {
    label: string;
    initialization?: string;
    ancestry?: string | string[];
    trainingEpisodes?: number;
    priorTrainingEpisodes?: number;
  };
};
function isWarmStart(provenance: Demo["provenance"]) {
  return Boolean(
    provenance?.initialization?.toLowerCase().includes("warm") ||
    (provenance?.priorTrainingEpisodes ?? 0) > 0,
  );
}
export function App() {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<WorldView | undefined>(undefined),
    worker = useRef<Worker | undefined>(undefined),
    replay = useRef(new Replay([initial], 42, DEFAULT_TRAINING.simulation));
  const [config, setConfig] = useState<TrainingConfig>(
    structuredClone(DEFAULT_TRAINING),
  );
  const [history, setHistory] = useState<Generation[]>([]),
    [selected, setSelected] = useState(-1),
    [info, setInfo] = useState(initialInfo);
  const [running, setRunning] = useState(false),
    [progress, setProgress] = useState(0),
    [speed, setSpeed] = useState("max"),
    [population, setPopulation] = useState(true);
  const [playing, setPlaying] = useState(false),
    [replaySpeed, setReplaySpeed] = useState("1"),
    [source, setSource] = useState("Untrained"),
    [error, setError] = useState("");
  const [checkpoint, setCheckpoint] = useState<Checkpoint | undefined>(),
    [demo, setDemo] = useState<Demo | undefined>(),
    [provenance, setProvenance] = useState<Demo["provenance"]>(),
    [confirmReset, setConfirmReset] = useState(false),
    [debug, setDebug] = useState(false),
    [live, setLive] = useState(true),
    [pendingConfig, setPendingConfig] = useState(false),
    [switching, setSwitching] = useState(false),
    [curriculumMessage, setCurriculumMessage] = useState(""),
    [controlsOpen, setControlsOpen] = useState(false),
    [home, setHome] = useState(true),
    [assetsReady, setAssetsReady] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true),
    [cohort, setCohort] = useState({ alive: 1, total: 1 }),
    [cohortLoading, setCohortLoading] = useState(false);
  const [mapSeed, setMapSeed] = useState(42),
    [agentIndex, setAgentIndex] = useState(0);
  const historyRef = useRef<Generation[]>([]),
    liveRef = useRef(true),
    playingRef = useRef(false),
    homeRef = useRef(true),
    speedRef = useRef(1),
    debugRef = useRef(false),
    selectedRef = useRef(-1),
    configRef = useRef(config),
    autoAdvanceRef = useRef(true),
    runningRef = useRef(false),
    loadingRef = useRef(false),
    loadToken = useRef(0),
    featuredRef = useRef<Demo["selectedModel"]>(undefined),
    manual = useRef<Action>("WAIT"),
    populationRef = useRef(true),
    interacted = useRef(false);
  const publish = () => {
    setCohort({
      alive: replay.current.agents.filter((a) => a.sim.agent.alive).length,
      total: replay.current.agents.length,
    });
    const a = replay.current.current;
    if (a)
      setInfo({
        genome: a.genome,
        values: a.network.values.slice(),
        score: a.sim.agent.maxRow,
        action: a.sim.agent.lastAction,
        death: a.sim.agent.deathReason,
        tick: a.sim.tick,
        decision: replay.current.decisions,
      });
  };
  const selectAgent = (index: number) => {
    replay.current.selected = index;
    view.current?.select(index);
    setAgentIndex(index);
    publish();
  };
  const loadRecord = (
    r: Generation | undefined,
    many = populationRef.current,
    seed?: number,
  ) => {
    const token = ++loadToken.current;
    const install = (loaded: Generation | undefined) => {
      const featured = featuredRef.current;
      const champion =
        loaded && featured?.generation === loaded.generation
          ? featured.genome
          : loaded?.champion;
      const genomes = loaded
          ? many
            ? loaded.contenders
            : [champion!]
          : new NEAT(
              many ? configRef.current.population : 1,
              hash(configRef.current.seed, 0, 99),
              configRef.current.profile === "robust-v2",
              configRef.current.observationVersion,
            ).population,
        worldSeed = seed ?? r?.seeds[0] ?? configRef.current.seed;
      replay.current = new Replay(genomes, worldSeed, {
        ...configRef.current.simulation,
        curriculum: r?.curriculum ?? configRef.current.simulation.curriculum,
      });
      const index =
        featured && loaded && featured.generation === loaded.generation
          ? Math.max(
              0,
              genomes.findIndex((g) => g.id === featured.genome.id),
            )
          : 0;
      replay.current.selected = index;
      view.current?.clear();
      view.current?.select(index);
      setAgentIndex(index);
      setMapSeed(worldSeed);
      publish();
      loadingRef.current = false;
      setCohortLoading(false);
    };
    if (
      many &&
      r?.cohortFile &&
      r.contenders.length < (r.populationSize ?? 0)
    ) {
      loadingRef.current = true;
      setCohortLoading(true);
      void loadCohort(r)
        .then((loaded) => {
          if (token === loadToken.current) install(loaded);
        })
        .catch((error) => {
          if (token !== loadToken.current) return;
          loadingRef.current = false;
          setCohortLoading(false);
          setPlaying(false);
          setError(String(error));
        });
    } else install(r);
  };
  const chooseGeneration = (index: number) => {
    selectedRef.current = index;
    setSelected(index);
    setLive(false);
    liveRef.current = false;
    loadRecord(historyRef.current[index]);
  };
  const initialize = (c: TrainingConfig, saved?: Checkpoint) => {
    worker.current?.terminate();
    const w = new Worker(
      new URL("../evolution/trainer.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = w;
    w.onerror = (e) => {
      setError(e.message || "Training worker failed");
      setRunning(false);
      runningRef.current = false;
    };
    w.onmessage = ({ data }) => {
      if (worker.current !== w) return;
      if (data.type === "ready" || data.type === "checkpoint")
        setCheckpoint(data.checkpoint);
      if (data.type === "progress") setProgress(data.progress);
      if (data.type === "paused") {
        setRunning(false);
        runningRef.current = false;
      }
      if (data.type === "error") {
        setError(data.message);
        setRunning(false);
        runningRef.current = false;
      }
      if (data.type === "generation") {
        const r = data.record as Generation;
        historyRef.current = [...historyRef.current, r];
        setHistory(historyRef.current);
        setCheckpoint(data.checkpoint);
        if (
          liveRef.current &&
          (selectedRef.current < 0 || !autoAdvanceRef.current)
        ) {
          selectedRef.current = historyRef.current.length - 1;
          setSelected(historyRef.current.length - 1);
          const many = populationRef.current;
          replay.current = new Replay(
            many ? r.contenders : [r.champion],
            r.seeds[0],
            { ...data.checkpoint.config.simulation, curriculum: r.curriculum },
          );
          view.current?.clear();
          view.current?.select(0);
          setAgentIndex(0);
          setMapSeed(r.seeds[0]);
          publish();
        }
      }
    };
    w.postMessage({ type: "init", config: c, checkpoint: saved });
    w.postMessage({ type: "speed", value: speed });
  };
  useEffect(() => {
    let active = true;
    try {
      view.current = new WorldView(host.current!, (index) => {
        replay.current.selected = index;
        view.current?.select(index);
        setAgentIndex(index);
        const a = replay.current.current;
        setInfo({
          genome: a.genome,
          values: a.network.values.slice(),
          score: a.sim.agent.maxRow,
          action: a.sim.agent.lastAction,
          death: a.sim.agent.deathReason,
          tick: a.sim.tick,
          decision: replay.current.decisions,
        });
      });
    } catch (e) {
      setError(
        `3D preview unavailable: ${String(e)}. Headless training remains available.`,
      );
    }
    void view.current?.ready
      .then(() => {
        if (active) setAssetsReady(true);
      })
      .catch((e) => {
        if (active)
          setError(`Original game assets could not load: ${String(e)}`);
      });
    initialize(DEFAULT_TRAINING);
    fetch("/demo.json")
      .then(async (r) =>
        r.ok ? parseEvolution<Demo>(await r.text()) : undefined,
      )
      .then((d: Demo | undefined) => {
        if (!active || !d) return;
        setDemo(d);
        if (interacted.current) return;
        setHistory(d.history);
        historyRef.current = d.history;
        const startIndex = Math.max(
          0,
          d.history.findIndex(
            (r) => r.generation === d.selectedModel?.generation,
          ),
        );
        setSelected(startIndex);
        selectedRef.current = startIndex;
        setSource("Recorded run");
        setProvenance(d.provenance);
        setConfig(d.config);
        configRef.current = d.config;
        featuredRef.current = d.selectedModel;
        const record = d.history[startIndex];
        loadRecord(record, true);
        setPopulation(true);
        populationRef.current = true;
        setMapSeed(record.seeds[0]);
        publish();
      })
      .catch(() => {});
    let frame = 0,
      last = 0,
      elapsed = 0,
      lastDraw = 0,
      finishedFor = 0;
    let observed = replay.current;
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      const delta = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (observed !== replay.current) {
        observed = replay.current;
        elapsed = 0;
        finishedFor = 0;
      }
      if (playingRef.current && !loadingRef.current) {
        elapsed += delta * speedRef.current;
        if (replay.current.finished) {
          finishedFor += delta;
          if (finishedFor > 2) {
            const nextIndex = selectedRef.current + 1;
            const next = historyRef.current[nextIndex];
            if (
              autoAdvanceRef.current &&
              !debugRef.current &&
              selectedRef.current >= 0
            ) {
              if (next) {
                selectedRef.current = nextIndex;
                setSelected(nextIndex);
                loadRecord(next);
              } else if (!runningRef.current) {
                setPlaying(false);
                playingRef.current = false;
              }
            } else {
              replay.current.seek(0);
              publish();
            }
            elapsed = 0;
            finishedFor = 0;
          }
        } else if (elapsed >= 0.2) {
          let steps = 0;
          while (elapsed >= 0.2 && steps++ < 5 && !replay.current.finished) {
            elapsed -= 0.2;
            replay.current.advance(
              debugRef.current ? manual.current : undefined,
            );
            manual.current = "WAIT";
          }
          const a = replay.current.current;
          setCohort({
            alive: replay.current.agents.filter((a) => a.sim.agent.alive)
              .length,
            total: replay.current.agents.length,
          });
          setInfo({
            genome: a.genome,
            values: a.network.values.slice(),
            score: a.sim.agent.maxRow,
            action: a.sim.agent.lastAction,
            death: a.sim.agent.deathReason,
            tick: a.sim.tick,
            decision: replay.current.decisions,
          });
        }
      }
      if (now - lastDraw > 1000 / 30) {
        view.current?.update(
          replay.current.snapshot(
            playingRef.current ? Math.min(1, elapsed / 0.2) : 1,
          ),
        );
        lastDraw = now;
      }
    };
    frame = requestAnimationFrame(animate);
    const key = (e: KeyboardEvent) => {
      if (
        homeRef.current &&
        [" ", "Enter", "ArrowUp"].includes(e.key) &&
        !["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(
          (e.target as HTMLElement).tagName,
        )
      ) {
        homeRef.current = false;
        setHome(false);
        setPlaying(true);
        e.preventDefault();
        return;
      }

      if (
        !debugRef.current ||
        ["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(
          (e.target as HTMLElement).tagName,
        )
      )
        return;
      const actions: Record<string, Action> = {
        ArrowUp: "UP",
        ArrowDown: "DOWN",
        ArrowLeft: "LEFT",
        ArrowRight: "RIGHT",
        " ": "WAIT",
      };
      if (actions[e.key]) {
        e.preventDefault();
        if (replay.current.finished) {
          replay.current.seek(0);
          finishedFor = 0;
        }
        manual.current = actions[e.key];
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      active = false;
      loadToken.current++;
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", key);
      view.current?.dispose();
      worker.current?.terminate();
    };
    // This effect owns one renderer, worker and replay clock for the mounted app.
  }, []);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    speedRef.current = Number(replaySpeed);
  }, [replaySpeed]);
  useEffect(() => {
    debugRef.current = debug;
  }, [debug]);
  const start = (generations?: number) => {
    homeRef.current = false;
    setHome(false);
    setPlaying(true);
    interacted.current = true;
    setError("");
    if (source === "Untrained") setSource("Live run");
    setPopulation(true);
    populationRef.current = true;
    if (source === "Recorded run" || pendingConfig) {
      setProvenance(undefined);
      historyRef.current = [];
      setHistory([]);
      setSelected(-1);
      selectedRef.current = -1;
      setSource("Live run");
      initialize(config);
      featuredRef.current = undefined;
      loadRecord(undefined);
    }
    setPendingConfig(false);
    setLive(true);
    liveRef.current = true;
    setRunning(true);
    runningRef.current = true;
    setAutoAdvance(true);
    autoAdvanceRef.current = true;
    worker.current?.postMessage({ type: "run", generations });
  };
  const continueRecorded = async () => {
    setSwitching(true);
    interacted.current = true;
    try {
      const response = await fetch("/trained-checkpoint.json");
      if (!response.ok) throw new Error("Trained checkpoint unavailable");
      const saved = parseCheckpoint(await response.text());
      setConfig(saved.config);
      configRef.current = saved.config;
      historyRef.current = saved.history;
      setHistory(saved.history);
      setSource("Resumed run");
      setProvenance(demo?.provenance);
      setPendingConfig(false);
      setCheckpoint(saved);
      initialize(saved.config, saved);
      setRunning(true);
      runningRef.current = true;
      setPlaying(true);
      setHome(false);
      homeRef.current = false;
      setLive(true);
      liveRef.current = true;
      worker.current?.postMessage({ type: "run", generations: 5 });
    } catch (e) {
      setError(String(e));
    } finally {
      setSwitching(false);
    }
  };
  const reset = () => {
    interacted.current = true;
    setPendingConfig(false);
    historyRef.current = [];
    setHistory([]);
    setSelected(-1);
    selectedRef.current = -1;
    setSource("Live run");
    setProvenance(undefined);
    setProgress(0);
    setRunning(false);
    runningRef.current = false;
    setConfirmReset(false);
    setCurriculumMessage("");
    setLive(true);
    liveRef.current = true;
    initialize(config);
    featuredRef.current = undefined;
    loadRecord(undefined);
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    interacted.current = true;
    try {
      const c = parseCheckpoint(await file.text());
      setConfig(c.config);
      featuredRef.current = undefined;
      configRef.current = c.config;
      setHistory(c.history);
      historyRef.current = c.history;
      setSelected(c.history.length - 1);
      selectedRef.current = c.history.length - 1;
      setSource("Imported run");
      setProvenance(undefined);
      setPendingConfig(false);
      setRunning(false);
      runningRef.current = false;
      initialize(c.config, c);
      const r = c.history.at(-1);
      replay.current = new Replay(
        r
          ? population
            ? r.contenders
            : [r.champion]
          : population
            ? c.neat.population
            : [c.neat.population[0]],
        r?.seeds[0] ?? c.config.seed,
        {
          ...c.config.simulation,
          curriculum: r?.curriculum ?? c.config.simulation.curriculum,
        },
      );
      view.current?.clear();
      setMapSeed(r?.seeds[0] ?? c.config.seed);
      setAgentIndex(0);
      view.current?.select(0);
      publish();
      if (r?.cohortFile && population) loadRecord(r, true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const download = () => {
    if (source === "Recorded run") {
      const a = document.createElement("a");
      a.href = "/trained-checkpoint.json";
      a.download = "crossy-evolution-recorded.json";
      a.click();
      return;
    }
    if (!checkpoint) return;
    const url = URL.createObjectURL(
      new Blob([stringifyEvolution(checkpoint)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `crossy-evolution-gen-${checkpoint.generation}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const record = history[selected],
    maxDecisions = Math.ceil(config.simulation.maxTicks / 12),
    locked = running || switching;
  const warmStart = isWarmStart(provenance);
  const recordedWarmStart = isWarmStart(demo?.provenance);
  const validationMaps = demo?.selectedModel?.validationSeeds?.length;
  const evaluationSeconds = demo
    ? (demo.evaluation.simulation?.maxTicks ?? demo.config.simulation.maxTicks) / 60
    : undefined;
  const updateConfig = (patch: Partial<TrainingConfig>) => {
    const c = { ...config, ...patch };
    setConfig(c);
    configRef.current = c;
    interacted.current = true;
    if (history.length > 0) setPendingConfig(true);
    if (history.length === 0 && !running) {
      initialize(c);
      replay.current = new Replay(
        new NEAT(
          population ? c.population : 1,
          hash(c.seed, 0, 99),
          c.profile === "robust-v2",
          c.observationVersion,
        ).population,
        c.seed,
        c.simulation,
      );
      view.current?.clear();
      setMapSeed(c.seed);
      publish();
    }
  };
  const changeCurriculum = async (curriculum: "roads" | "trains") => {
    if (!history.length) {
      updateConfig({ simulation: { ...config.simulation, curriculum } });
      return;
    }
    interacted.current = true;
    setSwitching(true);
    try {
      const saved =
        source === "Recorded run"
          ? parseCheckpoint(
              await (await fetch("/trained-checkpoint.json")).text(),
            )
          : checkpoint;
      if (!saved) throw new Error("No completed generation is available yet");
      const c = {
        ...saved.config,
        simulation: { ...saved.config.simulation, curriculum },
      };
      setConfig(c);
      configRef.current = c;
      setSource("Resumed run");
      setPendingConfig(false);
      initialize(c, { ...saved, config: c });
      setCurriculumMessage(
        "Next generation will use the selected curriculum. Evolved population preserved.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwitching(false);
    }
  };
  const togglePopulation = (many: boolean) => {
    setPopulation(many);
    populationRef.current = many;
    loadRecord(record, many);
  };
  const beginViewing = () => {
    homeRef.current = false;
    setHome(false);
    setPlaying(true);
    if (replay.current.finished) {
      chooseGeneration(0);
    }
  };
  const watchGenerations = () => {
    setAutoAdvance(true);
    autoAdvanceRef.current = true;
    setPopulation(true);
    populationRef.current = true;
    chooseGeneration(0);
    setPlaying(true);
    homeRef.current = false;
    setHome(false);
    setControlsOpen(false);
  };
  return (
    <main className="crossy-game">
      <div
        className="game-world"
        ref={host}
        aria-busy={!assetsReady || cohortLoading}
      />
      <div className="original-score" aria-label="Forward score">
        <span>{info.score}</span>
        {history.length > 0 && (
          <small>TOP {Math.max(...history.map((r) => r.maxRow))}</small>
        )}
      </div>
      {!home && (
        <div className="generation-hud" aria-label="Population status">
          <strong>
            GEN {record?.generation ?? 0} / {history.length || "—"}
          </strong>
          <span>
            {cohort.alive} / {cohort.total} ALIVE
          </span>
          <small>
            {cohortLoading ? "Loading population…" : source}{" "}
            {running ? `· training ${Math.round(progress * 100)}%` : ""}
          </small>
        </div>
      )}
      {home && (
        <button
          className="original-home"
          aria-label="Start watching"
          disabled={!assetsReady || cohortLoading}
          onClick={beginViewing}
        >
          <img src="/upstream/images/title.png" alt="Crossy Road" />
          <span className="watch-caption">
            {demo?.selectedModel
              ? `WATCH TRAINED CHICKENS · GEN ${demo.selectedModel.generation}`
              : `WATCH ${history.length || "…"} GENERATIONS · ${config.population} CHICKENS`}
          </span>
        </button>
      )}
      {!assetsReady && (
        <div className="asset-loading" role="status">
          Loading original models…
        </div>
      )}
      <div className="original-buttons">
        <button
          className="sprite-button"
          aria-label={population ? "Show champion" : "Show population"}
          onClick={() => togglePopulation(!population)}
        >
          <img src="/upstream/images/buttons/character.png" alt="" />
        </button>
        <button
          className="sprite-button"
          aria-label="Evolution controls"
          onClick={() => setControlsOpen(true)}
        >
          <img src="/upstream/images/buttons/menu.png" alt="" />
        </button>
      </div>
      {!home && (
        <div className="quick-replay">
          <button
            aria-label={
              playing ? "Pause population playback" : "Play population playback"
            }
            onClick={() => setPlaying(!playing)}
          >
            {playing ? "Ⅱ" : "▶"}
          </button>
          <button
            aria-label="Toggle playback speed"
            onClick={() => setReplaySpeed(replaySpeed === "1" ? "10" : "1")}
          >
            {replaySpeed}×
          </button>
          <button
            disabled={selected >= history.length - 1}
            onClick={() => chooseGeneration(selected + 1)}
            aria-label="Next generation"
          >
            GEN →
          </button>
          {!playing && cohort.alive === 0 && (
            <button onClick={watchGenerations}>REPLAY ALL</button>
          )}
        </div>
      )}
      {error && !controlsOpen && (
        <button className="game-error" onClick={() => setControlsOpen(true)}>
          {error}
        </button>
      )}
      <section
        className="evolution-overlay"
        hidden={!controlsOpen}
        aria-label="Evolution controls"
      >
        <header className="overlay-heading">
          <button
            className="sprite-button"
            aria-label="Back to game"
            onClick={() => setControlsOpen(false)}
          >
            <img src="/upstream/images/buttons/back.png" alt="" />
          </button>
          <h1>EVOLUTION</h1>
          <span>
            {source} · {warmStart ? "branch generation" : "generation"}{" "}
            {record?.generation ?? 0}
          </span>
        </header>
        <div className="runbar">
          <div className="primary-controls">
            <button
              className="primary"
              disabled={
                switching ||
                running ||
                (pendingConfig && source !== "Recorded run")
              }
              onClick={() => start()}
            >
              <span className="play-icon" />
              {source === "Recorded run"
                ? "Start new training"
                : running
                  ? "Training…"
                  : "Start training"}
            </button>
            <button
              disabled={!running}
              onClick={() => worker.current?.postMessage({ type: "pause" })}
            >
              Pause
            </button>
            <button
              disabled={
                switching ||
                running ||
                (pendingConfig && source !== "Recorded run")
              }
              onClick={() => start(1)}
              title="Evaluate exactly one generation"
            >
              +1 generation
            </button>
            <button
              disabled={
                switching ||
                running ||
                (pendingConfig && source !== "Recorded run")
              }
              onClick={() => start(5)}
              title="Evaluate five generations, then pause automatically"
            >
              Run 5 generations
            </button>
            {source === "Recorded run" && (
              <button
                disabled={switching || running || pendingConfig}
                onClick={() => void continueRecorded()}
              >
                Continue trained population +5
              </button>
            )}
          </div>
          <label>
            Training pace
            <select
              aria-label="Training pace"
              value={speed}
              onChange={(e) => {
                setSpeed(e.target.value);
                worker.current?.postMessage({
                  type: "speed",
                  value: e.target.value,
                });
              }}
            >
              <option>1x</option>
              <option>10x</option>
              <option value="max">Max</option>
            </select>
          </label>
          <label>
            Population
            <select
              aria-label="Population"
              disabled={locked}
              value={config.population}
              onChange={(e) =>
                updateConfig({ population: Number(e.target.value) })
              }
            >
              {[50, 100, 200].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Run seed
            <input
              aria-label="Run seed"
              type="number"
              disabled={locked}
              value={config.seed}
              min="0"
              max="4294967295"
              onChange={(e) =>
                updateConfig({ seed: Number(e.target.value) >>> 0 })
              }
            />
          </label>
          <label>
            Curriculum
            <select
              aria-label="Curriculum"
              disabled={locked || pendingConfig}
              value={config.simulation.curriculum}
              onChange={(e) =>
                void changeCurriculum(
                  e.target.value === "trains" ? "trains" : "roads",
                )
              }
            >
              <option value="roads">Roads & cars</option>
              <option value="trains">Roads & trains</option>
            </select>
          </label>
          <button
            className="text-button reset"
            onClick={() => setConfirmReset(true)}
          >
            Reset run
          </button>
        </div>
        {provenance && (
          <div className="notice" aria-label="Training provenance">
            <span>
              <strong>{provenance.label}</strong>
              <br />
              {warmStart ? "Warm start" : provenance.initialization ?? "Training run"}
              {provenance.trainingEpisodes !== undefined &&
                ` · ${provenance.trainingEpisodes.toLocaleString()} branch training episodes`}
              {provenance.priorTrainingEpisodes !== undefined &&
                ` · ${provenance.priorTrainingEpisodes.toLocaleString()} prior training episodes`}
              {provenance.ancestry && (
                <>
                  <br />
                  {Array.isArray(provenance.ancestry)
                    ? provenance.ancestry.join(" · ")
                    : provenance.ancestry}
                </>
              )}
            </span>
          </div>
        )}
        {pendingConfig && source !== "Recorded run" && !confirmReset && (
          <div className="notice">
            New configuration selected. Reset the run to apply it.
            <button onClick={() => setConfirmReset(true)}>Reset run</button>
          </div>
        )}
        {curriculumMessage && (
          <div className="notice">
            {curriculumMessage}
            <button onClick={() => setCurriculumMessage("")}>Dismiss</button>
          </div>
        )}
        {confirmReset && (
          <div className="notice">
            Reset training with the selected configuration? Export first to keep
            this run. <button onClick={reset}>Reset training</button>
            <button onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        <div className="workspace">
          <section className="watch-settings" aria-label="Watch controls">
            <div>
              <h2>Watch the population</h2>
              <p>
                Map {mapSeed} · {(info.decision * 0.2).toFixed(1)}s ·{" "}
                {running ? `Evaluating ${Math.round(progress * 100)}%` : source}
              </p>
            </div>
            <div className="segmented">
              <button
                className={!population ? "active" : ""}
                onClick={() => togglePopulation(false)}
              >
                Champion
              </button>
              <button
                className={population ? "active" : ""}
                onClick={() => togglePopulation(true)}
              >
                Population
              </button>
            </div>
            <label className="debug-toggle">
              <input
                type="checkbox"
                checked={debug}
                onChange={(e) => {
                  setDebug(e.target.checked);
                  if (e.target.checked) {
                    togglePopulation(false);
                    replay.current = new Replay(
                      [record?.champion ?? initial],
                      mapSeed,
                      config.simulation,
                    );
                  }
                  e.currentTarget.blur();
                }}
              />
              Keyboard debug
            </label>
            <button disabled={!history.length} onClick={watchGenerations}>
              Watch all generations
            </button>
            <p>
              {cohort.alive} / {cohort.total} alive · all{" "}
              {record?.populationSize ??
                record?.contenders.length ??
                config.population}{" "}
              archived chickens share this map and clock. Chickens on the same
              tile overlap.
            </p>
          </section>
          <aside className="inspector">
            <div className="section-heading">
              <h2>The evolving brain</h2>
              <span className="small-badge">
                {debug ? "MANUAL CONTROL" : "LIVE ACTIVATIONS"}
              </span>
            </div>
            <div className="network-count">
              <strong>{INPUT_COUNT}</strong> inputs <b>·</b>{" "}
              <strong>
                {info.genome.nodes.filter((n) => n.kind === "hidden").length}
              </strong>{" "}
              hidden <b>·</b> <strong>5</strong> actions
            </div>
            <NeuralGraph
              genome={info.genome}
              values={info.values}
              action={info.action}
            />
            <div className="network-note">
              Connected inputs shown. Hover nodes and links to inspect. Outputs
              are action scores.
            </div>
            <div className="inspector-details">
              <div className="section-heading">
                <h2>Agent inspector</h2>
                <select
                  aria-label="Selected chicken"
                  value={agentIndex}
                  onChange={(e) => selectAgent(Number(e.target.value))}
                >
                  {replay.current.agents.map((a, i) => (
                    <option key={i} value={i}>
                      Chicken {i + 1} · #{a.genome.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="agent-metrics">
                <div>
                  <span>Forward score</span>
                  <strong>
                    {info.score}
                    <small> rows</small>
                  </strong>
                </div>
                <div>
                  <span>Training fitness</span>
                  <strong>{info.genome.fitness.toFixed(1)}</strong>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Species</dt>
                  <dd>{info.genome.species || "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Last action</dt>
                  <dd className="action-name">{info.action}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{info.death ? `Ended · ${info.death}` : "Alive"}</dd>
                </div>
                <div>
                  <dt>Connections</dt>
                  <dd>
                    {info.genome.connections.filter((c) => c.enabled).length}{" "}
                    enabled / {info.genome.connections.length}
                  </dd>
                </div>
              </dl>
            </div>
          </aside>
          <section className="timeline">
            <button
              aria-label={playing ? "Pause replay" : "Play replay"}
              onClick={() => setPlaying(!playing)}
            >
              {playing ? "Ⅱ" : "▶"}
            </button>
            <label>
              GENERATION
              <select
                aria-label="Replay generation"
                value={selected}
                onChange={(e) => chooseGeneration(Number(e.target.value))}
              >
                {!history.length && <option value="-1">Untrained</option>}
                {history.map((r, i) => (
                  <option key={i} value={i}>
                    {String(r.generation).padStart(3, "0")} · {r.curriculum}
                  </option>
                ))}
              </select>
            </label>
            <input
              aria-label="Replay position"
              type="range"
              disabled={debug}
              title={
                debug
                  ? "Manual debug runs are not archived"
                  : "Deterministic policy replay"
              }
              min="0"
              max={maxDecisions}
              value={Math.min(info.decision, maxDecisions)}
              onChange={(e) => {
                setPlaying(false);
                replay.current.seek(Number(e.target.value));
                view.current?.clear();
                publish();
              }}
            />
            <span className="replay-step">
              {info.decision} / {maxDecisions}
            </span>
            <select
              aria-label="Replay speed"
              value={replaySpeed}
              onChange={(e) => setReplaySpeed(e.target.value)}
            >
              <option value="1">Watch 1x</option>
              <option value="10">Watch 10x</option>
            </select>
            <button
              className={live ? "live-button active" : "live-button"}
              onClick={() => {
                setLive(true);
                liveRef.current = true;
                if (history.length) {
                  setSelected(history.length - 1);
                  selectedRef.current = history.length - 1;
                  loadRecord(history.at(-1));
                }
              }}
            >
              Follow latest
            </button>
            <label className="debug-toggle">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => {
                  setAutoAdvance(e.target.checked);
                  autoAdvanceRef.current = e.target.checked;
                }}
              />
              Auto-advance generations
            </label>
          </section>
          <EvolutionChart
            history={history}
            selected={selected}
            onSelect={chooseGeneration}
          />
          <section className="comparison">
            <div className="section-heading">
              <h2>{demo?.evaluation.kind === "development" ? "Development comparison" : "Held-out reality check"}</h2>
              <span>
                {demo?.evaluation.evaluationSeeds.length ?? 16} {demo?.evaluation.kind === "development" ? "development" : "test"} maps
              </span>
            </div>
            <p>
              Mean forward rows ·{" "}
              {evaluationSeconds !== undefined &&
                `${evaluationSeconds} simulated seconds per map · `}
              {demo?.selectedModel
                ? `model selected on ${validationMaps ? `${validationMaps} ` : ""}separate validation maps`
                : `recorded ${demo?.history.length ?? 0}-generation run`}
            </p>
            {demo ? (
              Object.entries(demo.evaluation.summary).map(([name, s]) => (
                <div className="comparison-row" key={name}>
                  <span>
                    {
                      (
                        {
                          random: "Random",
                          alwaysUp: "Always up",
                          heuristic: "Timing rule",
                          distanceHeuristic: "Timing rule · distance inputs",
                          trajectoryHeuristic: "Timing rule · motion inputs",
                          initial: recordedWarmStart
                            ? "Branch initial generation"
                            : "Initial generation",
                          previousFiveGenerations:
                            "Previous 5-generation model",
                          previousPublished: `Previous saved · gen ${demo.evaluation.previousModel?.generation ?? "—"}`,
                          neat: `NEAT · ${recordedWarmStart ? "branch " : ""}gen ${demo?.evaluation.generation ?? demo?.history.length ?? 0}`,
                        } as Record<string, string>
                      )[name] ?? name
                    }
                  </span>
                  <div>
                    <i
                      style={{
                        width: `${Math.min(100, (s.meanRow / Math.max(...Object.values(demo.evaluation.summary).map((v) => v.meanRow))) * 100)}%`,
                        background: name === "neat" ? "#d6e99b" : "#5b7869",
                      }}
                    />
                  </div>
                  <strong>{s.meanRow.toFixed(2)}</strong>
                </div>
              ))
            ) : (
              <p>
                Run <code>npm run evaluate</code> to compare policies.
              </p>
            )}
            <small>{demo?.evaluation.kind === "development"
              ? "These development maps select this experimental model. Fresh final tests remain separate."
              : "Fixed final evaluation seeds never affect selection."}</small>
            {demo?.evaluation.pairedPrevious && (
              <p>
                Same-map mean difference from previous saved model: {demo.evaluation.pairedPrevious.meanDifference.toFixed(2)} rows.
                {" "}95% interval: {demo.evaluation.pairedPrevious.bootstrap95[0].toFixed(2)} to {demo.evaluation.pairedPrevious.bootstrap95[1].toFixed(2)}.
                {demo.evaluation.pairedPrevious.bootstrap95[0] <= 0 && demo.evaluation.pairedPrevious.bootstrap95[1] >= 0
                  ? " This test does not establish a clear improvement."
                  : ""}
              </p>
            )}
          </section>
        </div>
        <footer>
          <span>
            Physics at 60 Hz <b>·</b> Decisions every 0.2s <b>·</b> Rendering
            independent of training
          </span>
          <div>
            <button
              className="text-button"
              title="Export the last completed generation; in-progress batches stay in memory"
              onClick={download}
            >
              Export checkpoint
            </button>
            <label className="import-button">
              Import checkpoint
              <input
                aria-label="Import checkpoint"
                type="file"
                accept="application/json,.json"
                onChange={(e) => void importFile(e.target.files?.[0])}
              />
            </label>
          </div>
        </footer>
      </section>
    </main>
  );
}
