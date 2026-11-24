# Implementation record

## M0 — audit

Reference cloned and preserved under ignored `.reference/Expo-Crossy-Road`. Inspected original terrain, movement, collision, models, camera and licensing. Attempted original launch; missing Expo executable recorded in AUDIT.md. Kept original MIT copyright notice. Unclear artwork permissions resolved with original replaceable voxel geometry.

## M1 — minimal renderer

Vite + React + TypeScript + Three.js app opens directly into the world. Original procedural chicken, trees, boulders, grassy slabs, cars/trucks, tracks, trains and warning signals. Orthographic follow camera, shadows and keyboard debug. No Expo/mobile runtime or menu/store/audio/water dependencies. Build passed before engine integration.

## M2 — deterministic core

Seeded row functions and bounded caches, independent episodes, 60 Hz physics, 0.2 s hops, blocked moves, explicit bounds/timeouts, analytic traffic/trains, swept simultaneous-axis collisions. Renderer consumes core state. Tests and headless benchmark pass.

## M3 — policies

658-float local observation vector; random, always-up and timing-rule baselines. Real decision traces, pure policy evaluation, deterministic seek/replay. `npm run demo` exports five evaluated genomes and 39 recorded champion decisions from the bundled run.

## M4 — NEAT

Historical innovations, aligned crossover, node/connection/weight mutations, acyclic inference, compatibility species, adjusted fitness selection and elitism. 100-genome, three-seed training with fixed independent 16-seed evaluation. Browser worker batches, pause/resume, single generation, termination on reset, checkpoint export/import. Real seed-42 30-generation road run and separate ten-generation train-enabled experiment. Latest champion improves over random/always-up but remains below timing rule; README/results report this explicitly.

## M5 — visualization

One shared-geometry Three.js scene; synchronized cohort of up to eight, selected chicken inspector, real topology/weights/activations, raw chosen action, measured row/fitness charts, generation selection and deterministic decision scrubbing. Independent training/watch pacing, curriculum/population/seed configuration, reset confirmation, model download/import. Recorded run is labeled distinctly from live training; benchmark panel is explicitly the recorded 30-generation result.

## M6 — validation

21 automated tests, lint, typecheck, production build and npm audit pass. Fresh install verification recorded in VALIDATION.md. Benchmark saves actual CPU/time/throughput in results/benchmark.json. README documents formulas, normalization, algorithms, seeds, reproducible commands, comparisons and limits. Browser QA performed with native in-app browser controls at desktop and narrow viewport sizes.

Not included: optional IndexedDB autosave, multi-worker pool, water, optional play-against-AI. Only latest cohort retains eight candidates; older generation champions remain replayable. No dynamic solvability proof or repeated-run statistical claim. Replacement visuals are not asset-identical to the reference. See README for details.


## User-requested original visual implementation

The visual layer was subsequently replaced with the actual reference repository’s model, texture, title, font and button files. Camera/light/material/HUD values now come from the source, with evolution tools in a menu overlay instead of a dashboard. No core or evolution logic changed. The original procedural replacements described in the initial milestones are superseded. See ATTRIBUTION.md.

## Full-population generation batches

The viewer now keeps and replays every evaluated genome, including older generations. A new seed-42 run evaluates five generations of 200 chickens across three shared training seeds per generation (3,000 training episodes, plus 80 held-out champion episodes). Population playback is the default, uses one map/clock, advances chronologically, and stops at the end. Live worker results queue without replacing the current replay. Added five-generation automatic-stop control, actual alive/total HUD, quick pause/speed/next controls, and replay-all. Input/output node definitions use a lossless compact JSON convention; legacy archives still import.

The browser independently reproduced five generations with the same discrete evolution state and episode results as the CLI; connection-weight differences are at most 5e-16 across JS engines. Tests cover all 200 archived members against independent episode evaluation and compact archive continuation. The final held-out champion averaged 9.1875 rows (random 1.1875, always-up 4.9375, heuristic 12.125). Original assets are unchanged. Desktop framing now keeps the player visible, and generation changes/scrubbing reset camera follow directly before resuming source easing. Earlier subset-retention limitations above are superseded for new runs.

## Stronger learned policy and long-run archives

Completed a 300-generation, 200-chicken road run using eight shared maps per genome, gentler weight mutation, local random connectivity, robust mean/worst-half fitness, adaptive species compatibility and stagnation removal. Selection uses 64 validation maps; a frozen model from generation 290 averages 104.25 rows on 512 final unseen maps, beating the original timing rule (12.85) and stronger distance-input rule (81.53). It uses the original binary sensors. A version-tag mismatch was caught and corrected, with all champion outcomes rechecked. No scripted policy or action shield is attached to learned genomes.

Full cohorts are compressed on disk and loaded lazily with content hashes and bounded caching. The viewer starts at the validated model, preserves access to every population, and can resume the learned checkpoint for five more generations. Final validation: 28 tests, lint, typecheck/build, byte-identical original assets, browser/headless continuation agreement. This supersedes earlier statements that the current model trails the rule baseline; those remain historical results.
