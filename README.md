# Crossy Evolution

A browser neuroevolution lab using Evan Bacon's actual Crossy Road models, textures, font and UI sprites. Deterministic physics and genuine NEAT training run independently of the renderer.

The current frozen model averages **1,261.07 rows on 512 fresh road maps**, with a median of **1,630**, using a 600-second limit. The previous champion averages **1,206.36 on those same maps**. The paired difference has a 95% interval of −9.40 to 116.27 rows, so this assessment does not establish a clear improvement. Model choice used 768 separate development maps before testing. The viewer contains **three new complete generations of 100 chickens**, inheriting extensive earlier training. Earlier full populations, checkpoints and verified releases remain preserved. [The experiment report](docs/TRAINING_EXPERIMENTS.md) records settings, ancestry, results and continuing work.


## Project report and complete training data

[Project summary](docs/PROJECT_SUMMARY.md) covers the implementation, training milestones, generation counts, honest ancestry and measured outcomes. [Training runs CSV](results/published-2026-11-21/training-runs.csv) and [generation data CSV](results/published-2026-11-21/generations.csv) contain the iteration data; [the JSON inventory](results/published-2026-11-21/inventory.json) records the capture time and accounting limits. The strongest protected development model in this snapshot averages **1,370.98 on 768 maps**; it has not had a fresh final test. The independently tested viewer model remains **1,261.07 on 512 maps**.

The [data release](https://github.com/sandsowkd/crossy-evolution/releases/tag/training-snapshot-2026-11-21) contains full native checkpoints, actual population archives, historical experiments and replay galleries, with SHA-256 checksums and restoration instructions. Large generated datasets are release downloads instead of Git blobs. Training continues locally after this dated snapshot.

The public repository excludes reference artwork and screenshots containing it. `npm run setup:assets` fetches and SHA-256 verifies the exact102 original files from the pinned Evan Bacon commit for local use. This preserves the local viewer appearance without treating the upstream source-code license as clearance to redistribute third-party artwork. The three current100-chicken replay populations and resumable viewer checkpoint are included in Git.

## Watch the trained model

Use Node 24 LTS, then:

```bash
npm ci
npm run setup:assets
npm run dev
```

Open the printed local URL. Click the original title to watch **100 evolved chickens from selected branch generation 3, genome #275**, with the development-selected model followed by default. These **three new generations** inherit the selected generation-40 model from a 200-chicken batch, which itself inherits earlier NEAT searches; the controls show that ancestry and the 19,200 new branch training episodes. Population members share the exact map, clock and physics; chickens occupying the same tile overlap. Only agents near the selected camera are visible.

The bottom controls pause playback, switch 1x/10x speed, and advance generations. The original menu sprite opens the neural network, measured charts, agent selector and replay controls. **Watch all generations** starts from branch generation 1; choose any generation or scrub its deterministic replay. All 100 genomes remain available in every bundled branch generation. The earlier 470- and 500-generation galleries are retained separately; for example, restore the previous release with `npm run bundle:learned -- results/releases/improved-1212-lookahead improved-1212-lookahead`. Archives load on demand, with SHA-256 verification and a three-population cache.

**Continue trained population +5** resumes the bundled checkpoint for five more generations, then pauses. **Start new training** starts from scratch. Pause/resume preserves unfinished worker batches. Population, seed, curriculum and training pace remain configurable; changing population/seed requires reset confirmation. Training pace and playback speed are independent. Export uses the last completed generation, and import validates evaluator and genome state. The bundled checkpoint preserves innovations, RNG, adaptive species state and the next population.

## Verified 1,000+ average

The selected policy was frozen before opening the 512-map F9 test suite. All policies used identical maps, traffic, collisions and 600-second limits.

| Policy | Mean rows | Median rows |
| --- | ---: | ---: |
| Random | 0.98 | 1 |
| Always forward | 4.22 | 3 |
| Distance timing rule | 114.35 | 85 |
| Previous verified champion | 1,206.36 | 1,454 |
| Inherited branch, first generation | 1,279.49 | 1,636 |
| **Current development-selected NEAT model** | **1,261.07** | **1,630** |

It reaches 1,000 on 70.12% of test maps, with a maximum of 1,788. The mean’s bootstrap 95% interval is 1,210.67–1,310.68; this describes map variation for one fixed policy. The paired point difference from the previous champion is 54.71 rows, about 4.54%, with a 95% interval of −9.40 to 116.27. The first-generation champion scores higher on this final panel; it does not replace the policy chosen beforehand on development maps. Removing traffic-position/proximity inputs while retaining static trees, bounds and lane information drops the frozen model's mean to 5.18. All five actions come directly from neural output scores. The default training-map replay stalls at 661 rows; individual failures remain visible.

The source model, checkpoint, full populations, freeze hashes, parent checkpoint, per-map outcomes and verification are in `results/frozen/further-1335-restart038/`. The viewer uses a separate release copy; bundling preserves the frozen checkpoint. Earlier verified models remain in `results/frozen/improved-1212-lookahead/` and `results/frozen/goal-1073-lookahead/`. F9 is historical. New work selects on development maps and reserves a fresh FA suite, gated at a frozen 1,450 development mean, for the next independent assessment.

## Earlier 300-generation learning result

The published roads-only run evaluated **300 generations × 200 chickens × 8 shared rotating maps = 480,000 training episodes**, taking approximately **488 seconds** on this Apple M5. Episode limits are 3,600 physics ticks (60 simulated seconds). The selected model has **14 hidden nodes and 185 enabled connections**.

The top three training genomes were checked every ten generations on **64 separate validation maps**. Selection maximized an equal blend of mean row and worst-half mean row; it chose genome **#57978 from generation 290**. Training stopped at the completed generation-300 checkpoint after validation exceeded a practical target (mean ≥75, median ≥50, lower quartile ≥25). Its validation mean was 109.95, median 135, lower quartile 61. The 16-map historical chart suite is a **monitor**, not the final test.

Only after model selection was frozen did we evaluate **512 unseen test maps**, using identical maps and 60-second limits for every policy:

| Policy | Mean row | Median row | Maximum row |
| --- | ---: | ---: | ---: |
| Seeded random | 0.93 | 0 | 8 |
| Always forward | 3.96 | 3 | 29 |
| Original timing rule | 12.85 | 9 | 84 |
| Stronger timing rule with distance inputs | 81.53 | 86 | 153 |
| Previous five-generation NEAT model | 8.56 | 6 | 33 |
| **Selected NEAT** | **104.25** | **124.5** | **188** |

NEAT reached **50+ rows on 76.56%** of test maps; its lower quartile was 54 rows and 90th percentile 158. Against the stronger timing rule it won 65.43% of paired maps, with a mean advantage of 22.72 rows (paired bootstrap 95% interval: 16.87–28.59). That interval describes map variability for these fixed policies, not variability across independently trained models. This is one training seed, not a claim of universal mastery or a score comparison with other games.

A post-selection ablation hid the current/landing hazard occupancy and five landing-risk features while retaining terrain, bounds, velocity and clock. The same network's average fell from **104.25 to 3.94 rows**. This supports that it uses traffic observations rather than only a memorized timer. No rules, move validator, search planner or safety shield chooses its actions; all five actions come directly from the learned network's argmax.

## Reproduce or continue

```bash
npm run train:long -- 300 results/reproduction 42
npm run evaluate:long -- results/reproduction
npx tsx scripts/diagnose-model.ts results/reproduction
npm run bundle:learned -- results/reproduction
```

The long-run command uses 200 chickens, eight training maps, robust fitness, and the original binary sensor layout. It writes every full generation as compact gzip JSON, periodic resumable checkpoints, model-selection data and a summary. The final evaluation additionally compares the older five-generation checkpoint in `results/batch-200/checkpoint.json` (bundled locally, ignored by Git). The reference copy can be regenerated with `npm run train -- 5 42 roads results/batch-200 200`.

To resume an existing long run, pass its directory as the fourth argument. The generation count is **additional** generations. Choose a new output directory; this preserves the source checkpoint, selected model and all population archives:

```bash
npm run train:long -- 200 results/continued 42 results/learned
npm run evaluate:long -- results/continued continued results/learned
npx tsx scripts/diagnose-model.ts results/continued
npm run bundle:learned -- results/continued
npx tsx scripts/verify-continuation.ts results/continued results/learned
```

Continuation restores RNG, innovations, adaptive species state and the next population. It first reproduces the previous validation winner, retains the validation-selection ledger, and only replaces that model when its validation criterion improves. The `continued` evaluation suite reserves 512 different maps for this continuation and re-evaluates the old model on those exact maps. Neither final suite selects models; reserve another fresh suite for a later independently assessed continuation.

Raw outcomes and verification evidence are in `results/learned/`. The initial run's sensor-version tag was corrected to match the binary observations actually used; **all 2,400 champion training episodes and 4,800 monitor episodes reproduced exactly after correction**. Validation selection was independently reconstructed and matched the saved model. `repair-training-metadata.ts` and `finalize-long.ts` record that one-time recovery; normal reproduction uses the fixed evaluator and needs neither. Some unused generations completed before the process was terminated; they were isolated and did not select the published model or enter its final test.

The main demo is about 10 MiB, checkpoint 14 MiB, and all 300 compressed population files about 188 MiB. Full archives are local generated data ignored by Git; retain or regenerate them to browse entire historical populations. The checkpoint alone remains sufficient to resume evolution and replay its archived champions. An unavailable or mismatched external cohort produces a visible error, not fabricated chickens.

## Earlier measured experiments

The earlier 100-chicken, 30-generation road experiment remains in `results/training-summary.json` and `results/evaluation.json`; the separate train-enabled experiment remains in `results/trains/`. Reproduce them with:

```bash
npm run train -- 30 42 roads results 100
npm run evaluate
npm run train -- 10 42 trains results/trains 100
npm run evaluate -- results/trains/checkpoint.json
npm run benchmark
```



Training uses 100 genomes, three shared rotating seeds per generation, 30 simulated seconds maximum per episode, difficulty 1. `results/checkpoint.json` is resumable. `training-summary.json` and `evaluation.json` contain per-seed outcomes and real statistics. `integration-demo.json` evaluates five real genomes and exports the champion's complete decision trace (observations, scores, action, position, survival and death). `npm run bundle-demo` rebuilds the viewer's static recording from these files after a training/evaluation run.

Results for seed 42, generation 30, on the fixed **16 held-out seeds**:

| Policy | Mean forward row | Maximum row | Mean fitness |
| --- | ---: | ---: | ---: |
| Seeded random | 1.1875 | 7 | 10.4113 |
| Always up | 4.9375 | 17 | 44.5981 |
| Simple timing rule | 12.1250 | 33 | 116.1925 |
| NEAT champion | 7.4375 | 26 | 67.0219 |

NEAT beat random and always-up; it **did not beat the heuristic**. Its population mean training row moved from 1.04 in generation 1 to 2.86 in generation 30; held-out champion mean row moved from 5.81 to 7.44. Intermediate values fluctuate; held-out scores never select parents, choose a champion, stop training, or control curriculum. We report the final generation, not a cherry-picked held-out winner. The visual charts preserve the fluctuations.

Likely limitations behind the gap: only three training seeds per generation produce noisy selection; sparse initial networks and short training leave obstacle avoidance and waiting behavior fragile. The rule baseline explicitly prefers forward motion when its landing cell is clear. More generations/seeds and repeated independent training runs are needed before claiming reliable superiority. Sixteen evaluation maps and one training run are a sanity check, not a statistically conclusive comparison.

A separate train-enabled smoke experiment also ran:

```bash
npm run train -- 10 42 trains results/trains
npm run evaluate -- results/trains/checkpoint.json
```

Held-out mean rows: random 1.00, always-up 5.00, timing rule 19.25, NEAT 6.8125. This verifies train-enabled training/evaluation, not mastery. Train mechanics are tested independently; the bundled demonstration is road-only.

## Architecture and deterministic rules

`src/core/` owns physics and observation encoding. `src/evolution/` owns genomes, NEAT, policies, evaluation, replay and the worker. `src/visualization/` owns React and exactly one Three.js scene. An architecture test guards these imports. No renderer can change game rules.

```ts
import { createSimulation } from './src/core/simulation';
const sim = createSimulation({ curriculum: 'roads', maxTicks: 1800 });
let observation = sim.reset(42);
const result = sim.step('UP');
observation = result.observation;
console.log(result.score, result.terminated, result.truncated, sim.getState());
```

- Mulberry32 PRNG with explicit serializable state, plus independent hashed world/evolution streams. Row descriptors are pure functions of `(seed, absolute row, curriculum, difficulty)`. Generation order, cache eviction and camera movement cannot affect terrain; each world caches at most 96 rows.
- Physics ticks at 1/60 second; one decision/hop consumes 12 ticks (0.20 s). `step` accepts exactly one cardinal hop or wait. Vehicles use tiles per simulated second. Invalid bounds actions terminate immediately; obstacles block a move and consume its time, rather than killing the chicken. A collision can interrupt a hop. Hazard death precedes timeout if both occur in a tick. A fatal or incomplete hop earns no new row.
- Relative swept AABB slabs check player and vehicle motion on **the same time interval** in both axes, at every physics tick. Wrapped road traffic checks neighboring periodic images. Train schedules reset off-map; their warnings and positions use simulation time only. Hopping never grants immunity.
- Car types, lengths, offsets, directions and speeds vary by seeded row; three vehicles per 22-tile circuit have generous gaps. Grass every fourth row breaks long hazard sequences. Sparse obstacles preserve a seed-dependent winding accessible route, rather than a permanently clear center column. This guarantees static connectivity; it does **not** prove every timed hazard sequence solvable.
- Rail speed is 15–23 tiles/s at default difficulty, periodic schedules 8–12 s, warning lead 1.6–2.4 s. Train motion starts 80 tiles away so default warning leads fit before arrival. No water, log riding, mobile stack, audio, ads, store or unrelated screens.
- `getState` returns serializable snapshots. The renderer interpolates snapshots and evaluates their analytic traffic positions; all policy decisions and death outcomes come from the core. Rendering/worker pacing cannot affect a replay. Dead bodies share the world's clock but no longer take actions.

### Observation encoding (658 floats)

Eight egocentric rows (`-2,-1,0,+1,+2,+3,+4,+5`) × nine columns (`-4..+4` relative to the chicken) × nine features = 648 floats. Row-major then column-major:

1. Grass / road / rail one-hot (three floats).
2. Static blocked square (one float).
3. Current hazard occupancy (one float).
4. Signed lane velocity, clipped to `[-1,1]` using 24 tiles/s (one float).
5. Current warning signal (one float).
6. Predicted occupancy at the next hop's landing time (one float).
7. Explicit unknown/out-of-bounds cell flag (one float).

Ten globals: horizontal position / 4; sin and cos of simulated clock (`tick/120`); predicted landing-cell risk for UP, DOWN, LEFT, RIGHT, WAIT (five floats); next-row tree blockage; current-row signal. Landing risk is local occupancy/static blockage, **not** a collision-free action oracle. Every value is finite in `[-1,1]`. Policies never see seed labels, distant rows, future RNG draws, pixel data or a solved route. Labels live in `core/observation.ts`. The earlier published binary model uses this layout. The current experimental viewer uses observation version 5: binary spatial cells, five approximate trajectory-proximity channels, and two-hop forward traffic/blockage inputs. New memory and lookahead sensor branches are explicitly versioned; see the experiment report. An explicitly versioned optional distance layout is also tested; its instantaneous proximity values are not a swept collision oracle. Sensor versions persist through evaluation, crossover, checkpoints and replay.

### NEAT implementation

Feed-forward genomes with input/bias/hidden/output nodes, historical connection innovations, shared split-node IDs, disabled genes, weight perturbation/reset, add-node and add-connection mutations, fitter-parent crossover with aligned genes, compatibility-distance speciation, fitness sharing by species, tournament selection within surviving species members and per-species elitism. Depth ordering prevents cycles. Initialization connects every global feature and a small random subset of spatial features to each output; spatial connectivity can grow by mutation. Topology actually changes (the earlier 30-generation champion has four hidden nodes). No hand-authored policy is inserted into the population. The robust-v2 training profile uses random local/global input connectivity, gentler weight mutation (25% of edges, standard deviation 0.18, 1.5% resets), 8% add-node mutation, adaptive compatibility and removal of species stagnant for 25 generations while protecting the best two. Original checkpoints retain the legacy behavior. The profile name describes training settings, not sensor version.

Per-episode fitness remains:

```text
10 * maximum_completed_forward_row - 0.01 * physics_ticks - 2 * hazard_death
```

Legacy training averages episode fitness. The robust profile uses 0.5 × mean fitness + 0.5 × mean fitness on the worst half of the shared seed suite, to reduce selection from one lucky map. Rows count once through a maximum, preventing backtracking reward exploits. Episode limits prevent eternal waits. Selection seeds are reproducibly generated in the lower 30-bit range. Development and final test maps occupy separate declared high ranges. Development maps select models; reserved final test maps never select models. Training uses the lower 30-bit range. Optional `autoCurriculum` in the TypeScript trainer requires five consecutive generations with population mean row ≥6; the default is explicit manual switching. Pauses keep the batch cursor; checkpoints are created only at completed generations and contain the next population ready to evaluate.

## Verification and performance

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run benchmark -- 3000
```

Tests cover deterministic snapshots/actions, row order and cache eviction, map variation, car wrapping/speed, train schedules/warnings, fast train and mid-hop collision, blocked trees, bounds precedence, truncation, observation ranges, genuine mutation/crossover/speciation, elitism, held-out separation, evaluation ordering, pause/batch independence, checkpoint continuation and exact champion replay. Browser checks exercise worker training, pause/reset, manual control, generation selection, and responsive layout.

Machine measurements are saved in `results/benchmark.json`. The benchmark completes 3,000 seeded episodes, alternating road-only/train-enabled curricula. It includes observation encoding, policy decisions, procedural maps and all collision work, and excludes rendering. A simulation “step” in that report means one **physics tick**, not one 12-tick policy decision. Numbers vary with load; trust the saved measured output and rerun locally.

## Limits and next work

- This is a working first implementation, not an assertion that evolution has solved the game. The roads-trained model beats both timing baselines on the final suite; train-enabled maps still need separate training and evaluation.
- The user requested the original repository’s visuals, so the local renderer now loads its actual OBJ/PNG artwork, font, title and buttons. Those files are isolated in `public/upstream/`; their public redistribution rights remain unclear. The factory remains replaceable. The original Expo app could not launch without its absent Expo dependencies; that exact blocker is recorded in `docs/AUDIT.md`.
- One worker batches evaluations; there is no multi-worker pool. Rendering uses shared original model geometry/materials, a bounded terrain window, sampled 30 Hz snapshots and one scene; it does not render a scene per genome. Complex populations can still consume CPU.
- Checkpoints are explicit JSON download/import; optional IndexedDB autosave is not implemented. Imports remain bounded at 128 MB, accommodating the verified 475-generation continuation export (53.49 MB). New histories retain complete populations, so long runs also consume more memory. Older imported checkpoints can contain only champion/subset replays; the UI reports their actual archived count. Scrubbing reconstructs from episode start (at most 3,000 decisions for 600-second games), rather than storing costly per-tick snapshots.
- No rivers or optional play-against-AI mode. No proof of dynamic map solvability or repeated-run statistical study. The original educational asset caveat is not treated as a public redistribution license. The local build includes reference assets; no public deployment was performed.

## Training references

[Crossy-Road-AI](https://github.com/alwyntan/Crossy-Road-AI) compares Unity Q-learning and minimax search; its high minimax score is produced by planning and is not a directly comparable training benchmark for this simulator. [Boxxy Roads source](https://github.com/unix2dossss/Boxxy-Roads/blob/main/main.py) uses three inputs and a forward/wait output, with a [100-member NEAT configuration](https://github.com/unix2dossss/Boxxy-Roads/blob/main/config-feedforward.txt). Our agent retains five learned actions. These projects informed the comparison and training approach; no implementation or assets were copied from them.
