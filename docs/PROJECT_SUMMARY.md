# Crossy Evolution: project and training summary

Snapshot: **November 21, 2026, 12:48–12:49 PM America/Denver** (raw UTC capture times are in the inventory). Training continues after this snapshot.

## What was built

A Vite/React/TypeScript/Three.js game laboratory with a deterministic, renderer-independent Crossy Road simulator; five learned actions; seeded roads, cars, obstacles and train mechanics; genuine feed-forward NEAT; resumable population/RNG/innovation checkpoints; actual population replays; live network diagrams and measured charts. The local visual layer loads the pinned Evan Bacon models, textures, title, font and buttons. The public repository includes the source loader and102-file SHA256 manifest; `npm run setup:assets` retrieves the reference artwork locally. The artwork is not redistributed in this repository or its data release.

Physics uses60 ticks/second and12 ticks per hop. Long-run comparisons use the same 600-second roads horizon, traffic, collisions and map rules. Rendering cannot change observations, actions or deaths. All five actions are the neural network's direct argmax: no planner, rule-based move veto or safety shield chooses them.

## Results and what they mean

| Model or policy | Evaluation panel | Average rows | Notes |
| --- | --- | ---: | --- |
| Random |512 fresh F9 maps |0.98 | Same physics and horizon |
| Always forward | Same512 |4.22 | Baseline |
| Distance timing rule | Same512 |114.35 | Stronger hand-written baseline |
| Previous verified NEAT | Same512 |1206.36 | Paired comparison |
| **Current viewer NEAT** | **Same512** | **1261.07** | Median1630;70.12% reach1000 |
| Warm branch's first-generation champion | Same512 |1279.49 | Post-selection diagnostic; not substituted for the frozen winner |
| **Wider-audit memory generation100** | **768 development maps** | **1370.98** | Selection result; no fresh final test |

The current viewer policy was chosen on768 development maps and frozen before F9 was opened. Its paired difference from the previous verified policy is54.71 rows, with 95% interval **−9.40 to116.27**; this does not establish a clear improvement between these two models. Its own mean bootstrap95% interval is1210.67–1310.68. These intervals describe map variability for fixed policies, not uncertainty over independent training seeds. Hiding traffic information drops the frozen model's average to5.18. Individual failures remain visible: the viewer's default map stalls at661.

F9 is now historical and never chooses another parent, parameter or stopping rule. A separate512-map FA suite remains unopened until a development-selected model is frozen at mean ≥1450. The stronger development snapshot is not presented as a fresh-test record.

## Iterations and training budgets

Generation numbers below identify their actual branch; warm-start generations are not learning from scratch. There is deliberately no grand sum of all JSON counts: native continuation checkpoints can contain cumulative history, frozen snapshots duplicate earlier runs, and interrupted/recovery work has separate accounting.

| Phase | Completed or protected boundary | Population × maps | Training accounting |
| --- | ---: | ---: | --- |
| Initial binary-observation training |300 generations |200 ×8 |480000 episodes,60-second horizon |
| Binary continuation |Checkpoint500 |200 ×8 |Cumulative800000 positions;320000 additional after generation300 |
| Later lookahead search |600 generations |100 ×16 |960000 new phase episodes,600-second horizon |
| Short restarts, preserved first50-round endpoint |50 rounds;148 actual generations |100 ×64 |947200 saved episode positions; round2 had1 generation, others3 |
| Memory branch, protected record |100 generations |100 ×32 |320000 new episodes; inherited1304.71 parent and earlier search |
| Population exploration replica7 |50 generations per branch |100 ×16 and200 ×8 |80000 per branch; neither beat its1349.02 parent |
| Matched memory/control replica9 |Ongoing in dated data |100 ×32 |Bounded50 generations/160000 per branch; shared seed203520 |
| Gentle refinements |Ongoing in dated data |100 ×64 and200 ×32 |Bounded50 generations/320000 per branch |

The 100-generation memory winner is genome9922, observation version8. Its checkpoint contains all100 full populations and the next breeding state. All 768 development outcomes reproduced exactly, and replay verification is retained beside the protected checkpoint. A wider development audit selected genome 9922 from the same generation100 population; this adds development evaluations rather than new training episodes. The earlier shortlist winner scored1363.34. Its version8 representation preserves the two-hop traffic channels and learns previous horizontal action through the formerly roads-silent signal input. Initial migration exactly reproduced the parent before training.

The 100/200 population experiments vary maps per chicken as well as population and sometimes seeds, so they are budget/strategy comparisons, not isolated causal population-size tests. Reward/rows objective pairs had inconsistent winners. Memory-only tuning failed in its bounded comparison; ordinary memory evolution improved. Wider archived-contender audits check policies outside training shortlists. All negative outcomes and inherited baselines are retained.

The left curve shows the original top10 shortlist selection before the wider audit found1370.98 in the same generation100 population.

![Measured development curves](training-progress.svg)

## Included evidence and data

- [Run inventory CSV](../results/published-2026-11-21/training-runs.csv): **116 phase summaries**, generation boundaries, population, map counts, selected generation/mean, horizon, sensor version and ancestry.
- [Generation CSV](../results/published-2026-11-21/generations.csv): **3948 recorded generation rows**, including training means, monitor scores, species and topology statistics. These rows are records across phases, not one population's generation count.
- [Final per-map CSV](../results/published-2026-11-21/final-map-outcomes.csv): **4608 policy/map outcomes**, including every baseline on the same final maps.
- [Restart ledger](../results/published-2026-11-21/restart-rounds.json): 50 completed rounds at capture, with actual source, objective, episodes and selected score.
- [Inventory and accounting](../results/published-2026-11-21/inventory.json): capture interval and release checksums.
- [Full chronological experiments](TRAINING_EXPERIMENTS.md), [validation evidence](VALIDATION.md), [source attribution](ATTRIBUTION.md), and [original master instructions](../CROSSY_EVOLUTION_CODEX_MASTER.md).

Download full native checkpoints, populations, all historical experiments and replay galleries from the [training data release](https://github.com/sandsowkd/crossy-evolution/releases/tag/training-snapshot-2026-11-21). Each archive has a SHA256 digest and a per-file manifest. Average-run checkpoint/selection/summary metadata was captured coherently without stopping trainers; the overall capture has an interval rather than a globally simultaneous instant. Uncheckpointed populations, where present, remain raw evidence.

## Reproduce and inspect

```bash
npm ci
npm run setup:assets
npm test
npm run build
npm run dev
```

The three current100-chicken cohorts and resumable viewer checkpoint are in Git. To restore larger historical datasets, download release assets, check `shasum -a256 -c SHA256SUMS`, then extract each archive group from the project root. Concatenate numerically ordered `.part-*` files into their `.tar.gz` first; see the release notes. The post-capture protected copy is a verification supplement; the winning policy and outcomes were already present in the raw capture. Extract into a fresh clone or separate directory to preserve newer local training. The archives contain `results/...` and `public/training-cohorts/...` paths.

To continue the protected memory checkpoint after restoring data:

```bash
npx tsx scripts/train-average.ts wide-score-memory-100 150 --resume --source=results/experiments/frozen-development/restart-030
```

This targets150 total branch generations in the restored existing run, not150 additional generations. The immutable generation100 protected copy remains separate. For the next independent evaluation, freeze the qualifying model first and use the guarded `long-post-further` suite; never reuse F9 for selection.

## Remaining limits

Roads-only long-run learning is measured; train-enabled mechanics have smoke tests but need their own mature training study. Rivers, IndexedDB autosave and a multi-worker browser pool are not implemented. Scores are not directly comparable with other Crossy Road implementations. Artwork rights remain separate from the MIT code license; the source/data release does not include reference artwork or claim official affiliation.
