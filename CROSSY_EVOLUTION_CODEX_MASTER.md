# CODEX MASTER INSTRUCTIONS — CROSSY EVOLUTION

## Mission

Transform the codebase at `https://github.com/EvanBacon/Expo-Crossy-Road` into **Crossy Evolution**, a fast, deterministic, browser-based neuroevolution experiment in which populations of chickens learn to survive procedurally generated Crossy Road–style roads and railways. The visual inspiration is Code Bullet: watch many agents fail, see generations improve, inspect their neural networks, and replay the best runs.

**Use the existing repository as the visual and gameplay reference, not as the final AI architecture.** Keep its recognizable low-poly/isometric world, chicken, cars, trains, grass, trees, camera feel, and animation style. Remove unrelated mobile app, menu, score-screen, character-store/selection, ads/settings, audio, and effects infrastructure. The game's core must work **without rendering anything**.

This is one coherent project. Implement it end-to-end in the milestone order below. Do not stop after scaffolding or deliver a static mockup. Do not spend time perfecting menus or generic dashboards. Prioritize a functioning trained agent and an impressive, truthful visualization of evolution.

## Repository reconnaissance and preservation

Before editing, inspect the existing files and run the project (or report the exact blocker). Relevant areas already identified:

- `src/CrossyGame.ts`: `CrossyGameMap`, terrain generation, row management.
- `src/Row/Road.ts`: random car count, directions, velocities, horizontal wrapping, road collisions.
- `src/Row/RailRoad.ts`: train geometry, movement, warning lights, collisions.
- `src/Row/Grass.ts`: trees/boulders and blocked squares.
- `src/CrossyPlayer.ts`: four-direction hopping and animation.
- `src/GameEngine.ts`: game loop, input, camera, collision handling.
- `src/app/index.tsx`, `src/screens/`, and much of `src/components/`: screens and UI to discard.
- `assets/models/`: chicken, grass, trees, road, railroad, cars, and train geometry/textures.

Preserve applicable MIT copyright notices and attribution. Verify rights to individual art/assets before public redistribution: the original README warns about educational use of copyrighted game content. If asset rights are unclear, isolate assets behind a replaceable loader, document this, and use original/replacement assets for a public release rather than assuming the MIT code license clears third-party imagery.

## Key architectural decision

I want a clean **web-first** project, not a bundled mobile Expo app. Prefer **Vite + React + TypeScript + Three.js** for the resulting browser visualization. Reuse or port the existing models, camera settings, world/vehicle appearance, and gameplay mechanics. Remove Expo, Expo GL, React Native, native gestures, and native audio from the production path if no longer necessary. Do not rewrite 3D assets unnecessarily. Do not keep expensive scene objects, animations, or React components in the training engine.

There must be three strictly separated layers:

1. **`core/`** — pure TypeScript, headless deterministic game simulation. No Three.js, GSAP, React, Expo, canvas, DOM, wall-clock timing, or `Math.random()`.
2. **`evolution/`** — neural-network inference, NEAT population/speciation/mutation/crossover, fitness, curriculum, evaluation, worker-based training, checkpoints, benchmark utilities. No renderer dependency.
3. **`visualization/`** — a single Three.js scene displaying a snapshot of the world and one or multiple agents, plus a minimal React shell, actual neural-network graph, progress charts, controls, and generation replays.

Public simulation interface (adjust types as needed while preserving the contract):

```ts
type Action = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'WAIT';

type Observation = Float32Array; // fixed size, normalized, documented
type GameState = { /* serializable world + agent state */ };

interface GameSimulation {
  reset(seed: number): Observation;
  step(action: Action): {
    observation: Observation;
    reward: number;
    terminated: boolean;
    truncated: boolean;
    score: number;
    deathReason?: 'car' | 'train' | 'tree' | 'bounds' | 'timeout';
  };
  getState(): GameState;
  getObservation(): Observation;
}
```

Support `createSimulation(config)` and ability to run many independent episodes concurrently without global mutable state. Ensure snapshots can be replayed in the renderer and serialized for recording.

## Phase A — Minimal game that still looks good

Implement a clean browser page that opens directly to the 3D world. No home screen, game-over overlay, store, character carousel, score popup, settings page, or restart workflow. Keep arrow-key controls as a temporary debug mode. Only one chicken model is needed.

Preserve these essential mechanics:

- Infinite/procedurally extended grid of **grass**, **roads**, and **rail tracks**.
- Obstacles on grass, such as trees and boulders, that block moves.
- Road lanes with multiple car/truck types, per-lane direction, varied speed, sensible spacing, and collision hitboxes.
- Rail lanes with fast-moving trains, realistic warning lead time/signals, and collisions.
- Four-direction one-tile chicken hops plus the ability to **WAIT**. Never allow diagonal movement. A hop should have a defined duration; rendering can animate it smoothly, but game logic cannot depend on animation callbacks.
- Follow-camera and isometric perspective with the existing project's low-poly visual vibe.

**Do not implement water/rivers/log riding initially.** Leave a clean lane-type extension point for phase two, but remove river-specific runtime requirements for the initial AI experiments. Start with easy, reachable grass and road configurations; add trains once learning works.

## Phase B — Procedural generation and exact determinism

Implement a reproducible PRNG such as mulberry32/xoshiro (or another documented seeded generator). Every randomized gameplay property must use seeded streams: lane types, obstacle placements, vehicle sizes/types, speeds, directions, spacings, start positions, train lengths, warning times, and schedules. Use separately derived RNG streams for evolution and world generation.

**Make row `r` a deterministic function of `(worldSeed, r, difficulty)`**, rather than relying on the order in which camera/rendering happens to request rows. Maintain a bounded cache of nearby rows for memory efficiency. For a given seed, the same absolute row must always have the same properties even if two agents reach it at different times.

Use a **fixed timestep** for simulation (e.g. 1/60 second or a consistent integer-tick equivalent). Vehicle velocity must be in world units per *simulated second*; the existing repo's per-frame additions and real-time `setTimeout`/GSAP behaviors are not suitable as simulation rules. Car positions, wrapped traffic, train schedules, signal lights, and collisions must derive only from simulation tick/time and world seed. No `Date.now`, `requestAnimationFrame`, timers, GSAP, or `Math.random` in `core/`.

Define the action cadence explicitly: e.g. one new movement decision every 0.20 simulated seconds, with exactly one cardinal hop or wait in each decision interval. Update hazards and test collisions at each physics substep, including during motion, using continuous/swept checks or sufficiently robust swept-interval tests. Agents must not become invulnerable while hopping. The same simulation must produce the same answer at 1x viewing speed and 100x headless training speed.

Ensure the static terrain does not create unavoidable dead ends. At minimum, preserve an accessible route through tree/boulder placements; cap vehicle densities/speeds such that crossings have feasible windows. Avoid baking a trivially safe corridor into every row. Ensure bounds and timeout rules are explicit.

**Tests:** identical seed/actions ⇒ identical row generation, object positions, collision outcomes, score, and death reason; different seeds ⇒ meaningful map variation; determinism holds regardless of rendering speed, row access order, and worker batch order. Add tests for edge wrapping, high-speed train crossing, simultaneous action/death, bounds, and hops colliding mid-flight.

## Phase C — AI observation and action interface

Do **not** use rendered pixels for the first version. Neural networks should observe a small, fixed-size structured vector computed from the same game state used for physics, with no peeking at future RNG outputs or unseen distant rows.

Define and document an observation encoder covering a local egocentric window (e.g. 2 rows behind, current row, and 5–7 ahead; 9–11 columns wide). Include: terrain one-hot encoding, static blocked squares, local car/train occupancy or approximate positions, relative hazard velocities, signal state, time-to-arrival or predicted occupancy at hop landing time, horizontal coordinate, and any meaningful normalized timing. Make unknown/unobserved cells explicit. Keep feature ranges stable and normalize numeric values. The policy should not have access to a perfect precomputed solution or held-out seed labels.

Network has exactly **five action outputs**: UP, DOWN, LEFT, RIGHT, WAIT. Interpret them as scores; argmax is enough for a deterministic policy. Never misleadingly label raw network activations as calibrated probabilities. Use a fixed policy evaluation cadence, distinguish blocked actions from successful hops, and assign an episode timeout to eliminate eternal waiting.

Create and test **baseline agents**: random; always-up; an intentionally simple rule-based road-timing heuristic. These provide sanity checks and show whether learning beats trivial behavior. Add debug traces for each decision containing observation, action scores, chosen action, position, survival status, and death cause.

## Phase D — NEAT neuroevolution (not a fake simulation)

Use real **NEAT** neuroevolution: individual neural-network genomes, innovation numbers, node/connection mutations, crossover, speciation, fitness-aware selection, elitism, and genuinely evolving topology. A suitable maintained browser-compatible library is fine if it supports serialization and instrumentation; otherwise build an appropriately tested TypeScript implementation. Prefer feed-forward, acyclic networks at first. No LLM decisions, no prompt-based action choices, and no hardcoded 'learning' progress graph.

Initial defaults (tunable, not guaranteed optimal):

- Population: **100** individuals; configurable 50/100/200.
- Generations: continuous until paused or configured cap.
- Start with **grass + cars**; introduce trains via an explicit curriculum only after sustained improvement or manual switch.
- Per-genome fitness evaluated on **multiple shared training seeds** so all agents in that generation face comparable situations. Rotate or sample training seeds reproducibly between generations.
- Keep a **separate fixed held-out evaluation suite** that does not affect selection or training. Report held-out performance honestly.
- Episode terminates on vehicle/train collision, boundary, or maximum simulation steps. No waiting forever.

Start with a transparent fitness formula such as:

```text
fitness = 10 * maxForwardRow
        - 0.01 * simulatedTicks
        - 2 * diedFromHazard
```

Adjust if necessary based on actual results; document changes and justify them. Reward maximum forward progress rather than net displacement so moving backward cannot erase previously earned progress. Guard against agents exploiting reward bugs, repeated row crossing, artificial stalling, and death/timeout loopholes. Consider robust aggregate fitness over seed suite rather than rewarding a single lucky crossing.

Training engine must run **headlessly** and many times faster than rendering. Use browser Web Workers for heavy evaluation, batching work to avoid React rerenders each tick. Do not create 100 Three.js scenes, renderer instances, or React roots. Reuse immutable map data where safe; isolate per-agent states. Support cancellation, pause/resume between evaluation batches, and deterministic training replays using saved RNG state and genomes.

Persist model checkpoints, generation stats, genome metadata, evaluator configuration, and seeds in versioned serializable JSON. Provide model download/import, plus optional IndexedDB persistence of the last session. Never claim a model is trained unless real evaluations have been run. Include a short bundled *genuinely trained* checkpoint only if you actually train and validate it; otherwise start from generation zero.

## Phase E — The Code Bullet–style interactive experience

**Main priority is watching evolution, not ordinary game UI.** Aim for one polished desktop-first screen; responsive enough for narrower widths, but desktop quality is more important. Use the existing game's nice isometric appearance. Keep controls concise and unobtrusive.

Primary layout:

- **Large 3D game viewport** as the focal point: show the currently best chicken, or a selected subset of the population playing concurrently. Camera follows the selected agent. Rendering is a view of simulation state, not the source of physics truth.
- **Real-time NEAT topology panel** for the selected genome: inputs, hidden neurons, output/action nodes; positive and negative weights distinguishable; line thickness = connection magnitude, opacity/brightness = activation; node colors show actual activations. Layout dynamically supports added nodes/connections, disabled connections, and skipped layers; hover to inspect precise weights and node labels. Highlight the actual chosen action at each decision.
- **Evolution chart** using actual recorded data: mean fitness, best fitness, average/max row reached, and **held-out seed** performance. Label clearly which plots are train vs eval; never fake increasing curves.
- **Compact run controls**: start, pause, single-generation advance, speed (1x/10x/max), population size, seed, training curriculum (road only / road + trains), show best vs show population, and reset training after confirmation. Keep training and renderer speeds independent.
- **Agent inspector**: select a chicken/genome, see generation, species, fitness, forward score, last action, death reason, and current neural-network diagram.
- **Generation timeline / replay**: select any recorded generation, watch the champion's deterministic run, compare early vs late champions, and see the exact map seed used. Scrubbing can use periodic snapshots plus replay if affordable.
- **Optional 'Play Against AI'** mode only after the core training is working; should not delay the first real result.

Important: show many chickens on a shared world only when their world/clock/seed are genuinely synchronized. For agents evaluated separately, show a clearly labeled montage or selected-agent replay instead of compositing physically inconsistent episodes. At fast training speeds, render only sampled snapshots (~15–30 visual updates/sec), while the worker may execute many simulation ticks per visual frame. Use efficient geometry reuse, object pooling, or instancing rather than creating fresh 3D meshes every update.

Design direction: dark neutral surrounding chrome, crisp technical typography, restrained color-coding for evolutionary species and neural weights, polished game lighting, subtle animation, clean spacing. No generic card-heavy SaaS dashboard, no game menu, and no fake AI gauges. The viewer should understand the project within five seconds of opening the page.

## Phase F — Verification and performance

Deliver working automated tests and an accessible README explaining setup, controls, simulation determinism, feature encoding, NEAT approach, fitness, training/evaluation separation, and reproduction of results.

Acceptance tests must cover:

1. Fresh install and `npm run dev` (or documented package manager equivalent) opens the world, car traffic and rail crossings work, and one chicken can be controlled via keyboard debug mode.
2. `reset(seed)` + same action sequence reproduces identical outcomes in tests; fixed seeds reproduce row content and moving hazard schedules.
3. Headless simulator runs thousands of episodes without instantiating Three.js or the browser renderer. Include a benchmark command reporting **simulation steps/sec** and **completed episodes/sec** on the actual machine; report measurements, don't make up performance numbers.
4. Cars at different speeds, train warning-to-arrival windows, tree collisions, boundary deaths, and mid-hop hazards are all verified.
5. NEAT genuinely generates different networks, mutations, crossovers, species, and generation-to-generation results; save/import replays champion behavior.
6. Progress and graphs reflect real logged training runs. Show comparison against random/always-up/heuristic baselines on held-out seeds. If training fails to improve, report it explicitly and diagnose rather than fabricating success.
7. No React component or browser rendering path is required to evaluate a policy.
8. Web Workers do not block the page; stopping/restarting runs does not leak resources or retain stale state.
9. The end product presents a polished 3D Crossy Road–style arena and a working neural-network visualization that updates with actual selected-genome activations.
10. No essential gameplay state relies on real-time GSAP, `setTimeout`, `Date.now`, animation completion, or frame rate.

Prefer reliable, testable core logic over achieving an arbitrary benchmark threshold. Add a small integration demo that evaluates several genomes and exports actual results. Set up `lint`, `typecheck`, `test`, and `build` scripts, and run them.

## Milestone order — execute, do not just propose

**M0. Audit and baseline:** inspect source/licensing, run original, document mechanics/asset dependencies, record baseline screenshot if practical. Do not delete assets prematurely.

**M1. Minimal render:** stripped-down Vite browser scene using preserved chicken, road, tree, vehicle, rail and train models; simple arrow-key debug controls; no home/restart/settings UI.

**M2. Pure deterministic core:** seeded map generator, movement/physics, fixed-time traffic/trains, collision, `reset/step/observe/getState`, headless tests and benchmark. Render snapshots directly from core state.

**M3. Functional policies:** random, always-up, heuristic baselines; observation encoder; end-to-end episodes; episode data capture and exact replay.

**M4. True NEAT:** population, speciation, mutation/crossover, multiple shared training seeds, held-out eval, worker-based learning, checkpoints. Verify with a small real training run and summarize measured results.

**M5. Visualization:** selected agent(s), neural topology/activations, generation chart, speed/pause/curriculum controls, replay timeline, clean responsive presentation.

**M6. Final validation:** test/typecheck/build, performance benchmark, README and attributions, fix blockers and report honest remaining limitations.

After each milestone, make the app runnable and tests green before moving on. If blocked, implement the simplest correct alternative and record the tradeoff. Do not defer core work while polishing presentation.

## Suggested final structure

```text
src/
  core/
    types.ts
    rng.ts
    config.ts
    generateRow.ts
    world.ts
    vehicles.ts
    trains.ts
    collision.ts
    observation.ts
    simulation.ts
  evolution/
    genome.ts
    network.ts
    neat.ts
    fitness.ts
    baselines.ts
    evaluation.ts
    trainer.ts
    trainer.worker.ts
    checkpoint.ts
  visualization/
    three/
      assets.ts
      scene.ts
      camera.ts
      worldRenderer.ts
      agentsRenderer.ts
    components/
      NeuralGraph.tsx
      EvolutionChart.tsx
      ControlBar.tsx
      AgentInspector.tsx
      GenerationTimeline.tsx
    App.tsx
  tests/
    determinism.test.ts
    collision.test.ts
    generation.test.ts
    evaluation.test.ts
    evolution.test.ts
    replay.test.ts
scripts/
  benchmark.ts
  evaluate.ts
public/
  models/
README.md
```

Feel free to adjust filenames and libraries to match the actual repository. The architectural boundaries are mandatory; the directory names are suggestions.

## Working style / definition of done

You are the implementing engineer, not a planning assistant. First inspect the current repository, then make code changes and run tests. Keep commits/changes reviewable by milestone. Pick sensible defaults instead of repeatedly asking for preferences. Do not quietly omit train mechanics, procedural generation, headless simulation, real learning, or real activations. If something cannot be completed, clearly identify the exact missing piece and leave the project in a working state.

Final response must include: what was implemented, how to run, tests/build status, measured headless benchmark, how to reproduce the training run, whether NEAT beat the baselines on held-out seeds, remaining limitations, and any licensing/asset issues.
