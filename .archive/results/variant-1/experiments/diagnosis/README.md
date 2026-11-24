# Long-horizon diagnosis and alternative optimization

All simulation geometry, movement, traffic, collision detection, and difficulty are unchanged. These experiments use roads and a 36,000-tick (600-second) horizon. The former 3,600-tick horizon physically permits at most 299 credited forward rows, even with one successful UP decision every 12 ticks.

## Seed protocol

- D1: 256 diagnostic maps `0xd1000000 + i*65537`. These were subsequently used to construct the failure-state training curriculum, so they are **development training data**, not a final test set.
- D7: 64 model-selection maps `0xd7000000 + i*32771`. Anti-stall model selection and exploratory risk thresholds use this suite.
- B2: the existing shared validation suite, used for a cross-check after choosing a D7 winner. Also development data, not a final test.
- No F3 or C1 final-test maps were used by these experiments.

## Diagnosis

Original generation-470 policy #93863 on the 256 D1 maps: mean 344.52, median 246, maximum 1726, 10/256 scores at least 1000. Generation 290: mean 209.21. Distance heuristic: mean 136.11. These are comparisons on identical long-horizon maps.

Generation-470 endings: 176 car collisions, 67 stalled timeouts, 11 bounds deaths, and two progressing timeouts. It made 104,620 LEFT and 105,516 RIGHT decisions, 100,451 UP, 12,304 DOWN, and 248 WAIT decisions. Stalled episodes frequently oscillated between two columns behind trees for thousands of decisions.

Of its 187 fatal decisions, 113 had a zero original binary landing-risk input: 57 DOWN and 56 UP. The end-of-hop landing sensor misses hazards crossed during a vertical hop. Counterfactual one-decision physics checks found a surviving alternative at 97/176 car-fatal states; the other 79 car states required an earlier avoidance decision.

Frozen version-3 trajectory sensors with clearance support 0.35 signaled every one of those 187 fatal decisions at >=0.95714. This is conditional analysis of fatal states, not an unbiased sensor accuracy estimate. See `v3-calibration.json`.

## Weight-only anti-stall optimization

`npx tsx scripts/diagnose-long.ts tune 64 100`

Starts from #93863, retains binary-v1 observations and existing topology. Each generation evaluates 64 networks on eight shared rotating training maps, held for five generations. Weight mutation chooses perturbation fractions 0.03/0.1/0.25/0.6 and standard deviations 0.03/0.06/0.12/0.2. Selection keeps four elites and uses tournaments among the top fifth. There is no action filter, expert action, or heuristic fallback.

Training rollouts stop after 600 physics ticks without new maximum progress. Fitness is `maxRow - .002*ticks - .2*blockedMoves - 25*stalled`; this cutoff and objective affect training selection, not actual game physics or full validation episodes. Four leading candidates every ten generations are validated on all D7 maps for the complete 36,000-tick horizon. Selection is equally weighted mean and worst-half mean row.

100 generations / 64 candidates / eight maps = 51,200 training rollouts in 877.42 seconds, plus 2624 validation episodes. Initial D7 mean: 347.59. The best validation-selected candidate occurred at generation 60: mean 534.5, median 318, 14/64 scores at least 1000, maximum 1600, robust criterion 332.06. On B2 it scores mean 481.64, median 382, 7/64 at least 1000. Simply retagging this candidate to v3 reduces its B2 mean to 434.95, demonstrating that sensor semantics must be trained and stored with each genome.

This branch is a weight-only neuroevolution search, not a fresh full NEAT training run. Its topology and innovation IDs come from the original NEAT policy. It saves the actual selected genomes and final population. A published model must receive a proper resumed NEAT population/tracker checkpoint before browser continuation.

## Failure-state curriculum (negative result)

`npx tsx scripts/diagnose-long.ts rescue 64 60`

Constructs 443 training starts from D1 states: eight decisions before a fatal action, the fatal action state, and the final tree-loop state. Each candidate sees 24 rotating starts per generation, with up to 1200 ticks per start and a 600-tick no-progress cutoff. It uses v3 observations and the same weight search. No expert labels or action shield are used. Every ten generations, the top four networks are evaluated in complete games on D7.

60 generations / 64 candidates / 24 starts = 92,160 short training rollouts in 117.77 seconds. Full-run validation never improved over the initial v3-retagged candidate: mean 372.625, criterion 236.015625. The local objective overfit rescues and did not improve complete-game performance; discard this branch.

## Binary trajectory thresholds (diagnostic only)

Holding the old generation-470 weights fixed, six thresholds on v3 trajectory proximity produced D7 means 353.38, 391.75, 413.05, 415.22, 403.38, and 455.38 for thresholds 0.5, 0.7, 0.85, 0.9, 0.95, and 0.99. This is input-sensor exploration, not a deployed policy: the actual v3 observation is continuous and the browser does not implement these thresholds. The best threshold still sacrifices warning recall and has modest improvement, so continuous v3 training is preferable to adding another sensor version for this result.

Detailed episodes, traces, selected weights, and summaries are stored beside this report. `scripts/diagnose-long.ts` passed ESLint and TypeScript checking.

## Exact encoder optimization

Both dense and sparse v3/v4 trajectory paths now exclude hazards outside the candidate hop's row span, whose vertical clearance is at least 0.39, exceeding the sensor's 0.35 support. A conservative horizontal interval bound also skips wrap images that cannot approach the support at any sample. The nine-sample arithmetic remains unchanged for all potentially relevant hazards.

`src/tests/fixtures/reference-observation.ts` freezes the prior encoder. A differential test compares 4884 complete dense observations and 14,652 sparse observations across v1–v4, including random roads/trains, fractional and boundary agent states, speeds up to ±600, wrap/reset edges, and grazing epsilons. Every Float32 value is identical. Existing sparse-mask and neural replay tests also pass.

`npx tsx scripts/diagnose-long.ts benchmark` uses the frozen actual warm-v3 generation-20 model #1977 over 32 complete D7 games (680,935 total physics ticks per repeat, mean score 711.31). Five alternating repeats, following warmup, give median end-to-end times 0.33924 → 0.29613 seconds for sparse encoding (1.146× speedup) and 0.41766 → 0.37261 for dense encoding (1.121×). Sparse plus pruning versus unpruned dense is 1.410×. Both sides use the same current optimized physics, so these gains exclude the separate collision optimization. All episode scores, tick counts, and death reasons match exactly. The model and raw timing samples are saved beside this report.

## Native continuation of custom NEAT profiles

Optional `TrainingConfig.evolutionParameters` and `NeatState.parameters` now preserve the custom experiment's mutation, reset, topology, crossover, parent-pool, and stale-species bookkeeping settings. Optional `fitnessRiskWeight`, `trainingSeedStride`, `trainingSeedStream`, and `monitorSeeds` retain its objective, exact map schedule, and monitor suite. Config and state parameters must agree at checkpoint import. Undefined settings preserve the original legacy and robust behavior bit for bit.

`evolution-parameters.test.ts` compares twelve generations against frozen original NEAT for both historical profiles; compares ten generations of all four custom profiles against frozen experimental operators using shared-topology populations, crossovers, mutation and forced species stagnation; and verifies complete native training checkpoint continuation for the custom objectives and map protocols. Import tests reject malformed parameters and unsafe archive namespaces.

The actual `v3-refinement/precise-50` generation-50 checkpoint was also continued to 51 with both native `Trainer` and the frozen custom experiment. All 400 training episodes, champion #5601, every population weight and fitness, RNG, innovation tracker, and species/progress state were identical. The source and resulting state hashes are saved in `native-real-checkpoint-verification.json`.

Final shared-workspace verification at completion of this task: 41 tests passed, TypeScript passed, and global ESLint passed. Later integration may add further tests.
