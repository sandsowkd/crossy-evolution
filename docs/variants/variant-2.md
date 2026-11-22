# Variant 2 — trains and rivers

Open `http://127.0.0.1:5173/?variant=2` for mechanics demos, maps and actual saved population replays. Original Evan Bacon models, train assembly and the source support/collision behavior remain in use. [Source audit](variant-2-upstream-audit.md).

**Map approved for training:** the user confirmed the current map and requested both fresh and Variant 1 transfer training. The example map opens paused at row 0; use Opening, First river, First tracks or the row slider to inspect it. Play animates traffic and logs. [Review status](../../results/variants/variant-2/map-review-status.json).

The current **`clustered-traffic-v3`** rules are explicit project changes:

| Rule | Behavior |
| --- | --- |
| Opening | Rows 0–25 contain only cars and grass. Rivers and rails can start at row 26. |
| Density | After the opening, target 1/6 water rows and 1/24 rail rows: half the previous row densities. Fewer group starts offset the longer crossings. |
| Rivers | Crossings have 1–5 consecutive rows, averaging 2.5. A whole crossing uses moving logs (70%) or lily pads (30%), so pads do not break moving-log groups into single rows. |
| Tracks | Groups have 1–3 adjacent tracks, averaging 1.7. Every track has its own random train schedule: first center crossing at 4.2–12.6 seconds, then 8.4–16.8 seconds between crossings (30% shorter intervals). |
| Log coverage | At least 6 mixed-size original logs per moving row, on a shared conveyor loop. Edge gaps are 1 tile (70%), 2 tiles (25%) or 3 tiles (5%), including the wrap seam. Placement uses actual mesh widths. |
| Log motion | 0.96–3.36 tiles/s (20% slower). Adjacent moving rows differ by at least 0.64 tiles/s in absolute speed. At most two consecutive rows flow the same way. |
| Lily pads | A center pad is guaranteed in every lily row; the center column and neighboring grass have no static obstacles. |
| Other rules | At most 3 car lanes in a row; eagle capture after 10 seconds without a new highest row. |

## Results

**Best transfer policy: 223.80 average on 256 development maps**, median 160.5, longest run 1,330. It reaches 100 on 179/256 maps and 1,000 on 1/256. This is a 1.46% average improvement over the previous champion (220.58). The 1,000-average goal remains unmet. These are development-selection results; **all 512 final maps remain unopened**.

| Training stage | Best audited 256-map average |
| --- | ---: |
| Starting Variant 1 transfer | 48.28 |
| Normal NEAT: 128 more generations, 100 chickens | 51.83 |
| Initial river-focused phase, 200 chickens | 87.73 |
| Restart from audited river cohort, 16 training maps | 144.96 |
| Continued native population, 32 training maps | 164.47 |
| Smaller mutations plus consistency fitness | 181.01 |
| Continued consistency training, generation 496 | 208.61 |
| Consistency after exact native continuation, generation 540 | 214.59 |
| Consistency with 64 training maps, generation 592 | 220.58 |
| Continued 64-map consistency, generation 624 | **223.80** |

Winner: generation 624, genome 164315 in `transfer-consistent64-001`. Its ancestry contains **716 Variant 2 generation positions plus 1,174 inherited Variant 1 positions**. Sibling searches and repeated validation are counted separately. [Policy and evaluation](../../results/variants/variant-2/best-development.json), [matched iteration comparison](../../results/variants/variant-2/parameter-batch-001/comparison-00416.json), [search ledger](../../results/variants/variant-2/training-ledger-map-budget-start.json).

On the same 64 development maps, generation 416 populations average **149.43 control / 158.39 fine / 159.62 consistency**, compared with **52.74** for the initial 100-chicken transfer cohort. Every chicken in each current 200-chicken cohort averages at least 100. Consistency’s weakest chicken averages **129.09**. The separate plasticity generation 96 cohort averages 133.55; its training history differs. These population checks total 51,200 development episodes, counted separately from training. [All policies and distributions](../../results/variants/variant-2/population-comparison-003.json).

Random, road-only heuristic and hand-written water-aware baselines average 1.25, 50.62 and 100.46 on the same 256 maps. Trainers never use those policies. [Baselines](../../results/variants/variant-2/baselines.json).

## Current training

Work continues in the recovered chat. **Six 200-chicken native experiments are active**: consistency, fine64, adaptation of the best cohort, stronger consistency fitness, 64-map consistency, and a gentler 64-map mutation branch. The completed control is archived. The older plasticity run completed and passed native checkpoint, all 256 cohort hashes and exact replay verification; its best audited policy averaged 170.00, so the stronger consistency champion is preserved.

The 64-map consistency sibling has produced the strongest native policy at **223.80**. The archived generation 624 cohort matches all 200 viewer policies, and its audit reproduces the selected policy exactly. This is a development-selection result; all final maps stay unopened. [Verified iteration](../../results/variants/variant-2/iteration-2026-11-21-2205.json).

The control completed its 248-generation continuation and all 768 saved cohorts passed native archive and exact replay verification. Its whole-population average on 64 development maps changed from **143.24 to 144.17**, while its weakest policy fell from **91.20 to 76.73**. The separate consistency64 generation 640 population averages **197.29**, with minimum **144.89**. These 38,400 development episodes are separate from training. The freed slot now runs `transfer-gentle64-001`, initialized from exact native consistency generation 640; only river-input mutation step **0.12→0.06** changes. Its 128-generation budget is 1,638,400 training episodes. This sibling comparison has not established a speed advantage. [Complete population comparison](../../results/variants/variant-2/control-closeout-populations-001.json).

The new `transfer-consistent64-001` continues the exact native consistency generation 576 population for 256 more generations (3,276,800 training episodes). Only training maps **32→64** and stride **37→69** change. It is a distinct sibling experiment; the original consistency run continues. A sequential map-budget test does not yet establish faster learning.

At matched generation 568, all 200 policies average at least 100 on the same 64 development maps. Their whole-population means are **186.88** with risk weight 0.25 and **189.27** with risk weight 0.50; the weakest policies average **154.77 / 146.38**. The stronger risk weight improves the mean by 1.27% in this comparison but does not improve the weakest policy. The completed plasticity cohort averages **159.36**, versus **124.69** for its starting cohort; the separate adaptation generation 72 cohort averages **168.04**. These five complete-cohort comparisons cost 64,000 development episodes, recorded separately from training. [Matched comparison](../../results/variants/variant-2/risk50-population-comparison-001.json), [plasticity and adaptation](../../results/variants/variant-2/plasticity-closeout-populations-001.json).

The earlier generation 540 policy's 256-map exact failure replay finds 68 water deaths, 54 eagle captures (37 with a tree ahead) and 25 boundary deaths while on water. [Failure audit](../../results/variants/variant-2/failure-analysis-147485.json). A concurrent source change only adds optional inclusion of off-camera chickens in replay images; physics, training, observations, mutations and replay advancement are unchanged. The new run preserves its new source bundle; existing trainers retain their loaded frozen code. [Source audit](../../results/variants/variant-2/replay-display-source-audit-001.json).

See [recovered decisions and verification](variant-2-recovery.md), [current run metadata](../../results/variants/variant-2/optimization-status.json), and [iteration ledger](../../results/variants/variant-2/iteration-2026-11-21-2035.json). The same 30-minute follow-up targets this chat and reads all current monitor status files.

## Comparison history

Three lines began from the exact native generation 256 state, with **200 chickens and 32 changing training maps each**:

| Line | Mutation rate / step | Fitness |
| --- | --- | --- |
| Control | 0.30 / 0.35 | Mean rows |
| Fine steps | 0.15 / 0.12 | Mean rows |
| Consistency | 0.15 / 0.12 | 75% mean + 25% worst-half mean |

Each started with a bounded budget of **512 additional generations / 3,276,800 training episodes**. All three share their initial population, RNG, innovation state and training-map stream. Through generation 416, each completed 160 new generations / 1,024,000 training episodes. Their best audited 256-map policies average **169.53 control / 158.75 fine / 181.01 consistency**. Fine steps improve training means but do not produce the strongest broadly evaluated policy. [Matched comparison](../../results/variants/variant-2/parameter-batch-001/comparison-00416.json).

The fine-step line stopped safely at generation **438** after 182 new generations / 1,164,800 training episodes and continues as **`transfer-fine64-001`**. Its native population, RNG, innovations, species and history match exactly; only training-map count **32→64** and stride **37→69** change. The remaining 330 generations have a new planned budget of **4,224,000 episodes**. Its first two generations yield an audited **180.21** candidate, close to the saved champion. This tests more reliable selection at twice the episode cost per generation; a learning-speed benefit is not yet established. [Handoff](../../results/variants/variant-2/transfer-fine-001/continuation-handoff.json), [state verification](../../results/variants/variant-2/transfer-fine64-001/initialization-verification.json), [early audit](../../results/variants/variant-2/transfer-fine64-001/candidate-audit-00440.json).

The native monitor audits every 32 committed generations and publishes stronger actual cohorts. Follow-ups in this chat check every 30 minutes and can extend completed batches. [Current runs](../../results/variants/variant-2/optimization-status.json), [monitor](../../results/variants/variant-2/parameter-batch-001/monitor-status.json).

The three matched lines evolve new sensor weights and NEAT topology while freezing inherited weights. A fourth line, `transfer-plasticity-001`, restarts the previous champion’s generation 252 cohort and allows small inherited-weight mutations (rate 0.02, step 0.03), with gentler topology changes and 10% crossover. Its separate budget is 256 generations; this combined strategy is not a single-parameter comparison. Removing learned river inputs from the earlier 87.73 model drops it to 48.10. Earlier batch-size and mutation changes were combined, so their results do not isolate a batch-size effect.

All episodes retain approved physics, a 600-second horizon and the eagle rule. Selection uses 64 rapid maps and 256-map candidate audits. Checkpoints, actual populations and replays are verified. An earlier equivalent encoder measured 1.69× faster evaluation; all 88 tests, typecheck, lint and build pass. [Encoder proof](../../results/variants/variant-2/encoding-equivalence/verification.json), [mutation compatibility](../../results/variants/variant-2/residual-parameter-verification.json).

## Mechanics and earlier runs

A 400,000-row audit measured water and rail densities at **49.93% / 50.54%** of previous rules. Moving-log groups average **2.507 rows**; tracks average **1.701**. Log gaps stay within 1–3 tiles, with no opening or center-pad violations. [Full mechanics audit](../../results/variants/variant-2/rules-audit.json).

The first approved-map comparison, `paired-004`, trained fresh and transferred 100-chicken populations for 64 generations each: **204,800 total training episodes**. Their best 64-map development averages were **38.39 fresh / 58.28 transfer**. Transfer began with the actual Variant 1 generation 150 population. [Comparison](../../results/variants/variant-2/paired-004/comparison.json), [verification](../../results/variants/variant-2/paired-004/verification.json). Earlier timing experiments remain archived; their scores use different rules.

```sh
npx tsx scripts/audit-variant-two.ts
npx tsx scripts/continue-variant-two.ts verify --run=transfer-restart-002
```

Protocols, ancestry, selected policies and iteration summaries are in `results/variants/variant-2/`. Full native snapshots and every evaluated population are retained locally. The [development reference release](https://github.com/sandsowkd/crossy-evolution/releases/tag/variant-2-development-2026-11-21) also preserves the generation 256 native state and all 256 full cohorts in that lineage, with verified SHA-256 hashes. Git includes the fresh cohort and strongest confirmed transfer cohort in `public/variant-2/`. Replays use actual networks and original locally fetched, hash-verified assets.
