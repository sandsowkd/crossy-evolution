# Variant 2 — trains and rivers

Open `http://127.0.0.1:5173/?variant=2` for mechanics demos, maps and actual 100-chicken replays. Original Evan Bacon models, train assembly and the source support/collision behavior remain in use. [Source audit](variant-2-upstream-audit.md).

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

## Measured distribution

A reproducible audit of **400,000 rows after the opening**, on 200 seeds, measured:

| Metric | Result |
| --- | ---: |
| Moving-log row density vs previous rules | 50.14% |
| All-water row density vs previous rules | 49.93% |
| Track density vs previous rules | 50.54% |
| Mean moving-log crossing length | 2.507 |
| Mean consecutive tracks | 1.701 |
| Logs per moving row | 6–9 (mean 6.43) |
| Edge-to-edge gap range | Exactly 1–3 tiles |
| Early river/rail or missing center-pad violations | 0 |

[Full audit and crossing histograms](../../results/variants/variant-2/rules-audit.json). The row density comparison uses the same map seeds and post-opening row indices; the new opening reduces early hazards further.

## Training and provenance

**Transfer optimization is active: best average 128.88 on 256 development maps**, with median 94.5, maximum 628 and 121/256 runs reaching 100. Every action comes from the evolved network. This is a development result, not an independent final-test claim.

| Method | Best audited 256-map average |
| --- | ---: |
| Starting Variant 1 transfer | 48.28 |
| Normal NEAT: 128 more generations, 100 chickens | 51.83 |
| River-focused mutations: 200 chickens | 87.73 |
| Restart from the audited river cohort: 200 chickens | **128.88** |

The river phase adds zero-weight sensor connections and concentrates weight mutations on V9 inputs. Removing those learned inputs from its 87.73 model drops the average to 48.10. Population size, mutation strategy and training seed streams differ, so this does not isolate the effect of larger batches. The current winning lineage contains 156 Variant 2 generation positions plus 1,174 inherited Variant 1 positions; the larger search budget is recorded separately.

Two 200-chicken runs continue: `transfer-river-002` carries the exact native state from river generation 91 toward 347; `transfer-restart-001` starts from the audited generation 80 cohort and runs 128 new generations. The first river phase was checkpointed at 91 to migrate to faster, equivalent sensor encoding. The prototype measured a 1.69× speedup; the production encoder reproduced an entire 100-chicken generation and its offspring exactly. All 88 tests, typecheck, lint and build pass.

All runs retain approved physics and 600-second episodes. Selection uses 64 rapid development maps, followed by broader candidate audits on the 256-map development suite. All 512 final maps remain unopened. Random, road-only heuristic and hand-written water-aware baselines average 1.25, 50.62 and 100.46 on the same 256 maps; trainers never use these policies. [Current winner](../../results/variants/variant-2/best-development.json), [active runs and next steps](../../results/variants/variant-2/optimization-status.json), [baselines](../../results/variants/variant-2/baselines.json), [encoder verification](../../results/variants/variant-2/encoding-equivalence/verification.json).

**`paired-004`: first approved-map comparison complete.** Two concurrent NEAT lines each trained 100 chickens for 64 generations: **102,400 training episodes per line**, 204,800 total. Both use the same 16 changing training maps per generation, 600-second episodes and 64 development maps for selection. All 512 final maps remain unopened.

| Line | Generation 1 development mean | Best development mean | Best generation | Best single development-map score |
| --- | ---: | ---: | ---: | ---: |
| Fresh | 10.72 | 38.39 | 64 | 124 |
| Variant 1 transfer | 55.23 | 58.28 | 12 | 218 |

Fresh starts with random weights. Transfer starts with the actual final Variant 1 generation 150 population, preserving its weights/topology and adding zero-weight new sensors. It inherits 1,174 Variant 1 phase positions; both lines inherit **zero previous Variant 2 generations**. The training map seed stream matches `paired-003`, with the approved slower logs and shorter train intervals.

Transfer provides a strong head start, but this first batch has not learned reliable river crossing: 59/64 selected transfer episodes end in water. These development scores remain far below the 1,000-average goal. This is one paired experiment, not evidence that transfer always wins.

[Concise comparison](../../results/variants/variant-2/paired-004/comparison.json), [fresh generation data](../../results/variants/variant-2/paired-004/scratch/generation-metrics.csv), [transfer generation data](../../results/variants/variant-2/paired-004/transfer/generation-metrics.csv), [checkpoint/population/replay verification](../../results/variants/variant-2/paired-004/verification.json). All 128 full populations, native checkpoints and selected episodes were verified; 15 targeted mechanics/evolution tests passed. The viewer buttons replay the actual generation 64 populations, while the best selected policies are saved separately.

Earlier rules remain reproducible: `paired-003` used clustered-v2 timing (45.59 fresh / 54.91 transfer); `paired-002` used varied-traffic-v1 (5.22 / 8.58). Each ran 64 generations per line. Their scores are not directly comparable to the current timing. `paired-001` is the earlier synchronized-clock prototype. [Previous concise report](variant-2-varied-traffic-v1.md).

```sh
npx tsx scripts/audit-variant-two.ts
npx tsx scripts/verify-variant-two.ts --run=paired-004 --skip-public
# The current viewer has advanced beyond paired-004.
npx tsx scripts/continue-variant-two.ts verify --run=transfer-river-002
```

The initial paired runs stopped at their declared 64-generation budgets; continuation runs are separate. Protocols, ancestry, generation counts, selected policies and summaries live in `results/variants/variant-2/`. Every native snapshot and full evaluated generation is retained locally. Git includes the fresh population and strongest confirmed transfer cohort in `public/variant-2/`.
