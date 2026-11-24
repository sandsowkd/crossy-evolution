# Validation

Local machine: Apple M5, initial runtime Node v23.6.0. Node 24 LTS recommended for supported development-tool engines.

- `npm ci`: fresh dependency installation checked against committed lockfile.
- `npm test`: 21 passing tests using Node's built-in test runner through tsx.
- `npm run lint`, `npm run typecheck`, `npm run build`: pass.
- `npm audit`: no known vulnerabilities after removing unnecessary Vitest dependencies; tests use the built-in runner.
- Build emits a nonfatal large-chunk advisory for the Three.js/React client (~794 KB uncompressed, ~215 KB gzip); worker code is a separate ~16 KB bundle. No rendering library is in the worker.
- `npm run benchmark -- 3000`: measured values saved in results/benchmark.json. Benchmark includes complete headless episodes and observation encoding.
- Seed-42 road-only run: 30 generations, population 100, 3 training seeds/gen, 16 fixed evaluation seeds, 1800 physics ticks/episode. Raw data, checkpoint and genuine recorded demo bundled. Held-out NEAT 7.4375 rows; random 1.1875, always-up 4.9375, rule 12.125.
- Separate train-enabled 10-generation smoke run and baseline evaluation saved in results/trains.

Browser QA in Codex's in-app browser:

- World/chicken/cars visible and animated. Desktop 1440×1000 and default narrow (~620 px) layouts checked. Train-enabled map visibly contains rails, warnings and moving train geometry.
- +1 generation evaluates and pauses at a generation boundary. Continuous training advances real statistics while the page remains interactive. Pause returns the worker to idle between batches.
- Imported public/trained-checkpoint.json restores generation 30, species and champion. +1 advances to generation 31: champion #3083, training fitness 130.2333333333, four hidden nodes, matching an independent Node continuation. No held-out result selected that champion.
- Curriculum/population edits show a pending configuration; confirmed reset applies trains + population 50 and resets to generation zero. Old worker is terminated, stale callbacks are guarded.
- Keyboard debug + canvas focus + ArrowUp moves from row 0 to row 1; replay pause freezes it. Manual mode is explicitly labeled.
- Generation selection and scrubbing replay archived policies, not video or fabricated scores. Population members share seed and clock; dead agents stop acting.
- Console inspected. Removed a deprecated Three.js shadow-map setting identified during QA.

Automated tests are deterministic core/evolution tests. Browser checks above are manual tool-driven QA, not a claim of a CI browser-test suite or a GPU memory leak profiler. No original Expo runtime screenshot is claimed; its exact launch blocker is in AUDIT.md.

Final curriculum check: switching the bundled road-trained population to trains retained generation 30 and resumed its evolved genomes. A single generation produced generation 31 on train-enabled maps (champion #3034, three hidden nodes, training fitness 270.8), rather than creating a new population. The transition also has an automated regression test. Population/seed changes still use confirmed reset.

## Original visual-layer revision

At the user's request, the recreated graphics/dashboard were replaced by a port of the reference game's visual layer. `npm run verify:visuals` verifies 102 copied files against their source SHA-256 hashes (pinned reference commit in docs/visual-source-manifest.json). The actual OBJ/PNG files, retro font, title and button sprites are used; Three.js is pinned to the reference version, 0.182.0. Camera, material, lighting, follow, score and source UI sizing constants are ported. The current artifact is a full-screen game with evolution tools behind the original menu button.

SHA-256 checks verified that all 15 files in core/ and evolution/ are unchanged by the visual revision. All 21 tests, lint, typecheck and production build pass; npm audit is clean. Browser single-generation training still produces generation 1 champion #84 with fitness 76.8, matching the headless reference run. Local browser console has no errors.

A direct visit to the reference's hosted demo did not yield a runnable image baseline: it remained on `modelsLoaded:null`, with a React #418 error and an asset event in its console. Therefore there is no claimed numerical pixel-equivalence score. Source-file identity and source rendering constants, rather than an invented percentage, are the verification evidence. Existing deterministic map generation, policies and learned checkpoints remain unchanged. Models are fitted longitudinally to their existing physics hitboxes; that renderer adapter is documented in ATTRIBUTION.md.

The revised renderer/HUD was also checked in a 615×735 embedded viewport and a 1280×720 desktop viewport. The original title click starts playback, the source menu sprite opens the preserved trainer controls, replay pause/scrubbing works, and Back returns to the full-screen game. Updated screenshots are docs/title-screen.png and docs/preview.png. The original score/font/title/button graphics are present; no dashboard surrounds the game. Static source-file identity and ported constants are verified; a numerical whole-frame pixel-equality percentage is not claimed because the hosted reference does not finish loading and maps intentionally remain generated by the unchanged deterministic core.

## Five generations × 200 chickens

- `npm run train -- 5 42 roads results/batch-200 200`: five complete populations, 3,000 actual training episodes and 80 separate held-out champion episodes; 1.12 seconds including compact checkpoint export on this machine.
- `npm run evaluate -- results/batch-200/checkpoint.json`: final held-out NEAT mean row 9.1875; random 1.1875, always-up 4.9375, timing rule 12.125. Generation-one champion 5.8125. Honest improvement, still below the rule baseline.
- `npm run demo -- results/batch-200/checkpoint.json`: five independently evaluated genomes and 96 actual champion decisions exported.
- `npm run bundle-demo -- results/batch-200`: all 200 members of all five generations packaged, with resumable checkpoint. Compact storage preserves every weight and hidden node, omitting only fixed base node definitions.
- Browser **Run 5 generations** independently evaluated five populations of 200, automatically paused, and chronological playback reached generation 5/5 and stopped. Every generation exposes 200 selectable chickens. No console errors/warnings. Pause/speed/scrubbing and original-asset rendering checked at 1280×720.
- Downloaded browser checkpoint compared with CLI checkpoint: identical discrete state, genomes/topology, innovations, seeds, fitness and episode outcomes. 7,623 floating weight values differ only by JS-engine roundoff (maximum 4.996e-16, comparison tolerance 1e-12). Details in results/batch-200/browser-validation.json. Do not claim bit-identical floating arithmetic across JS engines. Same-runtime seeded checkpoint continuation remains exact.
- 23 automated tests pass, including a full 200-agent synchronized replay versus 200 independent evaluations, retention across breeding, compact checkpoint round-trip and deterministic continuation.
- Updated headless benchmark: 3,000 episodes, 700,024 physics ticks in 0.4776 seconds; 1,465,726 ticks/s and 6,281 episodes/s. This run occurred while the browser preview was open; throughput varies with load.
- Original model/texture/UI files continue to pass 102 SHA-256 identity checks. Short desktop projection framing and immediate camera reset on generation/seek transitions keep actual chickens visible without changing simulation, source model geometry, camera angle or zoom.

## Learned roads policy: 300 generations

- Completed and published boundary: generation 300, population 200, eight shared training maps per generation, 60-second episodes, robust-v2 evolution profile with original binary observations. 480,000 training episodes; approximately 488 seconds to that boundary. The original process briefly ran beyond the published boundary; extra records are isolated under ignored results/unused-overrun and did not affect model choice or final results.
- Validation selects among the top three training genomes every ten generations on 64 separate maps. Saved model #57978, generation 290: validation mean 109.953125, median 135, lower quartile 61. Selection was reconstructed from saved populations and reproduced exactly across 5,952 validation episodes.
- The 512 final test maps were opened after the published model was frozen. NEAT mean 104.24609375, median 124.5, maximum 188, lower quartile 54, 50+ rows in 76.5625% of runs. Baseline means: random 0.931640625, always-forward 3.95703125, original timing rule 12.845703125, stronger distance-input rule 81.52734375, previous five-generation NEAT 8.5625. All use the same maps and 60-second limit.
- Paired advantage over the stronger rule: 22.71875 rows, bootstrap 95% interval [16.873046875, 28.59375], 65.4296875% wins. This measures map variation for one trained model, not training-seed variation.
- Post-selection hazard-input ablation: mean falls from 104.24609375 to 3.9375 on the same 512 maps. It changes only observations, not physics or action selection.
- An observation-version mismatch discovered by replay tests was corrected. This run actually learned with binary-v1 inputs, so saved metadata was corrected without changing weights. Every generation champion reproduces all eight training episodes and all 16 historical monitor episodes exactly: 2,400 + 4,800 checked outcomes. Future sensor-versioned training correctly passes that version through evaluation and replay; regression tests cover it.
- All 300 complete populations are saved as compact gzip JSON with SHA-256 hashes, loaded on demand with a three-population browser cache. Corrupt/wrong-run archives are rejected, including when another hash for the same filename was previously cached.
- Browser opens the validation-selected model and all 200 members of generation 290. Its replay reached 153 rows on seed 126036153, matching Node exactly. Generation selection, loading, pause, scrub and graph/inspector were exercised. Continue trained population +5 stopped at generation 305; champions, fitness, mean rows, monitor scores and species for generations 301–305 matched an independent Node continuation exactly. All five new cohorts contain 200 agents; console had no errors/warnings.
- 28 automated tests pass. Lint, typecheck/production build and original-asset verification pass. The client still emits the documented nonfatal large-chunk advisory. Renderer assets remain the same 102 byte-verified source files.
- Current benchmark: 700,024 physics ticks across 3,000 episodes in 0.44299 seconds = 1,580,212 ticks/s and 6,772 completed episodes/s on Apple M5 / Node 23.6.0.

Raw outcomes, selection ledger, archive/sensor checks, browser checks and continuation reference are in results/learned/. The final model was trained on roads; train-enabled policy learning remains a separate curriculum step. Screenshot: docs/learned-population.jpg.

Additional archive verification re-evaluated all 200 genomes on all eight training maps for generations 1, 150, 290 and 300: 6,400 episode outcomes reproduced stored fitness with zero difference. A fresh run matched all genome data for the first three complete populations. Details: results/learned/archive-validation.json.

## Continued training and long-game experiments

The historical500-generation run, its fresh512-map test (mean138.1328125 at60 seconds), archive replay checks and exact continuation evidence are in `results/continued/`. The new600-second road experiments are documented in `TRAINING_EXPERIMENTS.md`; development selection and final tests remain distinct.

The current100-chicken experimental preview contains five complete warm-start populations. The selected policy reproduces its959.296875 average on all192 development maps exactly, including every per-map outcome. Its first archived training-map replay reaches926 at600 seconds in both browser and Node. Browser scrubbing to480 seconds shows617 rows and92/100 alive, all100 genomes are selectable, and the controls disclose inherited training and the600-second horizon. No console errors/warnings were found. Screenshots are `docs/long-development.jpg` and `docs/long-development-metrics.jpg`. This is not a final held-out performance claim.

Latest checks:48/48 automated tests; lint; typecheck/production build;102 original-source asset hashes. Tests cover versions1–7, sparse/dense equality, native tuned checkpoint continuation,64-map batches, disjoint development/final maps, and frozen historical NEAT/physics equivalence. Production client801.40KB (219.89KB gzip), separate worker22.30KB; the client emits the existing nonfatal chunk-size advisory.

## Wider lookahead model and exact acceleration

The earlier development preview is `results/previews/long-dev-wide-restarts-round-001`:100 chickens in each of three complete generations,64 training maps/chicken,19,200 branch training episodes, and substantial disclosed prior search. Selected model#47 (generation1, observation5) has34 hidden nodes and321 enabled connections. It reproduces all768 saved development outcomes exactly: mean970.3033854166666, median1069, maximum1642,407/768 at1,000+. These maps selected it; final D9 tests remain unopened.

On the same768 maps at600 seconds, baseline means are random0.8568, always-up3.9544, original rule12.7565, distance rule127.1198, motion rule103.5013, previous generation470 model368.9948. Browser replay on map127936559 matches Node:1000 at387 seconds,1085 at420 seconds with99/100 alive,1588 at600 seconds. All100 genomes are selectable. Development labels, inherited-training disclosure, original art and no-console-error checks remain in place. Screenshot: `docs/lookahead-population.jpg`.

Latest52/52 tests pass after explicit observation-buffer reuse. The general callback API retains distinct array ownership. Sparse/dense values, network scores/actions, full traces and native continuation match exactly. The whole-hop broad phase additionally matches24 frozen real-policy episodes /56,038 decisions; grazing, wrapping, rails, extreme speeds and partial/fractional timeout cases use exact differential tests. End-to-end measurements under concurrent load: about1.35–1.36× for clear-hop acceleration, then1.14× for buffer reuse. See `hop-benchmark.json` and `buffer-benchmark.json` under results/experiments. These changes accelerate computation without changing the game or its rewards.

## Verified target reached: first independent long-game test

The model fromgeneration180 (genome#17934) was frozen at2026-11-21T11:53:03.678Z before opening D9. All768 development outcomes independently reproduced, and the selected genome matched its archived100-chicken population exactly. The frozen checkpoint contains190 complete generations and190 complete population archives.

On512 previously unseen D9 maps at600 seconds, mean score is **1091.92**, median **1419**, maximum **1646**, with **62.70%** reaching1,000. Bootstrap95% interval for the mean is **1048.21–1137.08**. This describes map variation for one frozen policy, not variability across training seeds.

The previous generation470 model averages350.82 on those same512 maps at the same600-second limit. Random averages0.96; the distance timing rule129.74; motion rule106.41. Removing traffic positions/proximities and warnings while retaining bounds, static trees, lane type/direction and static action blockage drops the same frozen network to5.29. No rule chooses its actions.

Raw final outcomes, freeze hashes and verification: `results/frozen/goal-1073-lookahead/`. The viewer uses the separate release `results/releases/goal-1073-lookahead/`, preserving the frozen checkpoint hash. Its default is the selected generation180, with100 selectable chickens per generation and190 complete generations available.


Final browser checks: the released generation180 model on map52656329 reaches1,018 at420 seconds (69/100 alive) and1,447 at600 seconds, matching Node exactly. The inspector shows34 hidden nodes and345 enabled connections. The comparison panel shows512 final maps,768 selection maps and1,091.92 mean. No console errors/warnings. Screenshots: `docs/verified-goal-population.jpg` and `docs/verified-goal-metrics.jpg`.

Continue trained population +5 imported the actual public generation190 checkpoint, computed generations191–195, and automatically paused. Every champion ID, fitness/row/monitor statistic, species and topology count matches the independent CLI records (aggregate tolerance1e-9). All five new populations contain100 real genomes. The browser-exported checkpoint and comparison report are preserved in `results/releases/goal-1073-lookahead/`. Source checkpoint SHA-256 remains unchanged after bundling.

## Verified independent improvement: generation460

Generation460 genome#45938 was selected on768 development maps (mean1212.740885), frozen before opening the fresh512-map E9 suite, and independently checked against its actual archived population. The generation470 checkpoint and all470 complete100-chicken populations are preserved. On E9 it averages1185.6484375, median1471.5, maximum1836, with63.48% reaching1,000. Mean bootstrap95% interval1132.92–1238.82. The prior verified model scores1068.076171875 on these same maps; paired improvement117.572265625,95% interval53.91–180.76. All use unchanged600-second roads physics. Traffic-position/proximity ablation drops the same frozen model to5.05078125. Raw outcomes, frozen hashes and verification are in `results/frozen/improved-1212-lookahead/`; viewer copies are separate.

Browser replay on training map810331122 matches native replay:1178 rows at420seconds,69/100 alive;1614 before car death, with the selected agent's final tick33887. Inspector topology is43 hidden nodes,404 enabled/410 total edges. The final comparison panel correctly shows1185.65 against1068.08,512 test maps and768 development maps. No console errors/warnings. Screenshots: `docs/improved-verified-population.png` and `docs/improved-verified-metrics.png`.

The browser worker resumed generation470 through475 and automatically paused. Every new champion/statistic and all500 new genotypes match native training archives; all prior history is unchanged. Across2,887,113 numeric comparisons the maximum absolute difference is4.44e-16 (tolerance1e-9). Its53.49MB export revealed the previous40MB importer limit. The bounded limit is now128MB, covered by a regression test, and the actual export reimported successfully with generation475 and its100-chicken populations intact. Source checkpoint hashes remain unchanged after bundling and browser QA.

Latest54/54 tests, typecheck, lint and production build pass. The prior client chunk advisory is nonfatal. E9 is historical; the next predeclared final suite is unopened F9, gated at a frozen768-map development mean of at least1325. Training continues on training/development maps only. See `TRAINING_EXPERIMENTS.md` for completed comparisons, interrupted-work accounting and current runs.

## Optional lookahead and action-memory experiment

The published model remains the independently tested generation460 policy (1185.6484375 on512 E9 maps). Its frozen checkpoint and the protected1304.7057291666667 development policy retain their original hashes. All102 original repository asset files still match their source commit byte-for-byte.

Observation version8 keeps all version5 traffic/two-hop channels and uses the final global channel for previous horizontal action. Its inherited outgoing weights start at zero. Both new100-chicken experimental branches independently reproduced every one of the parent's768 development outcomes before training: mean1304.7057291666667. Their `migration-verification.json` files retain this check. No final maps were used, and no action filtering or physics changes were introduced.

All55 automated tests pass. Added coverage checks unchanged inherited neural outputs and state, version8 exact64-map checkpoint continuation, nonzero previous-action sparse/dense equality on roads/trains, and native memory-only continuation. The extended targeted tests also pass. Typecheck, lint and production build pass; the existing nonfatal chunk-size advisory remains. F9 is unopened and requires freezing a development mean of at least1325 before assessment.

## F9 assessment and current viewer

Restart38 generation3 genome#275 was selected at1335.9348958333333 on768 development maps, with every outcome independently reproduced and the full archived population matched. It was frozen at18:06:21.616Z before F9 opened at18:06:52.439Z. On512 fresh600-second roads maps it averages1261.072265625, median1630,70.12% at1000+, maximum1788. Mean bootstrap95% interval1210.67–1310.68. The previous frozen model averages1206.357421875 on those same maps; paired point difference54.71484375,95% interval−9.40–116.27. This comparison does not establish a clear improvement. The inherited branch's first-generation champion averages1279.486328125 on F9 and remains a displayed post-selection diagnostic. It does not replace the development-selected model. Traffic-position/proximity ablation drops the frozen policy to5.18359375.

The source checkpoint, parent checkpoint, full three100-chicken populations and per-map results remain in `results/frozen/further-1335-restart038/`. Source hashes and all earlier frozen checkpoints are unchanged. The viewer uses a separate release and archive namespace. It shows47 hidden nodes and419 enabled/427 total edges, actual warm ancestry,19200 new branch episodes, and the paired interval. Its default map128631918 stalls at661 rows: native and browser agree at420seconds with94/100 alive, and the game remains a visible failure case. Screenshots are `docs/further-verified-population.png` and `docs/further-verified-metrics.png`.

Browser import/one-generation continuation automatically paused at4, with100 actual new genomes. All generation metrics, every new genotype and the entire next breeding state, including RNG, innovations and100 next-population genomes, match native execution within1e-9. Across654406 numeric comparisons the maximum difference is4.44e-16. The actual8060825-byte export successfully reimported at4. QA then restored the published recording. Console warnings/errors are absent. Evidence is in `results/releases/further-1335-restart038/`; test training did not select or replace the published model.

All55 tests pass after reserving the next FA suite. Typecheck, lint, build and102 source asset hash checks pass. F9 is historical. The FA512-map suite is unopened and guarded at a frozen development mean≥1450; a below-threshold staged model was rejected before creating a ledger or evaluating maps. Version8 memory and further NEAT experiments continue on training/development maps, with stronger development snapshots separately preserved. Those policies are never assessed on opened F9.


## Public source/data checkout verification

The public source publication preserves the existing MIT repository license and Evan Bacon notice, excludes reference artwork/screenshots, and retains the three complete current viewer populations plus its resumable checkpoint in Git. A clean `git archive` checkout successfully ran `npm ci`, downloaded all101 missing pinned artwork files (the license was already included), verified all102 SHA256 hashes, passed all55 tests and built successfully. The original local102 files still match byte-for-byte. Build/lint/typecheck also pass in the working project; the existing client chunk advisory remains nonfatal. Dated CSV tables contain116 phase summaries,3948 recorded generation rows and4608 final policy/map outcomes. Full native data is distributed as checksummed GitHub Release archives rather than oversized Git blobs.
