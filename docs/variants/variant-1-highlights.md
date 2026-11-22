# Variant 1: recorded learning milestones

Six authentic archived policies were recorded on **map seed 42** with their historical episode limits, sensor versions, and rules without an eagle. The historical single-map scores below illustrate behavior; they do not replace evaluation across many maps.

The interactive gallery now loads each **entire archived generation** (200 chickens for the first three milestones, 100 for the last three) and resimulates them with the 10-second no-forward-progress eagle rule. Eagle deaths appear as a count, without animation. Chickens sharing a rendered position form one glyph: opacity runs from 20% for a singleton to 100% for the largest living group, including all tied maxima. If every group is a singleton, all are fully opaque. Historical results below remain the original champion assessments without the eagle; they are not scores for the new population replays. Each milestone has a persistent `/?highlights&milestone=<id>` link.

The camera tracks a particular living chicken through group merges and splits. It keeps that target when its group is tied for largest or only one chicken smaller; a voluntary switch requires a gap of at least two chickens. It makes at most two voluntary switches in any rolling five seconds of real viewing time, regardless of playback speed. A target's death allows an immediate replacement without using or clearing this budget. When choosing a new target, equally dense groups are ranked by their current forward position; a farther-ahead tie never displaces the existing target by itself. Decisions use completed simulation hops, so render interpolation cannot trigger extra switches. Restarting, seeking or changing milestones resets camera tracking.

Viewing replays have no practical time limit: they continue until all chickens die, including beyond the archived 600-second evaluation horizon. The exporter resimulates each entire population once to record its final decision, giving the timeline a fixed, complete extent before playback begins. Its thumb never rescales or moves backward as time advances. The historical configurations and results below are unchanged. The highlight renderer uses time-based tracking with at most two tiles of camera lag and a wider terrain buffer; distant target changes cut to their loaded terrain. Highlight-only sparse observation buffers preserve neural decisions while reducing playback work, and simulation batches yield to the UI after eight milliseconds.

The viewing UI fills the game viewport, using the original Crossy Road pixel font, outlined counters and blue-and-white square controls. Alive count and elapsed seconds appear at top left, with best score at top right. The bottom bar contains Restart, Play/Pause, a scaled forward jump and the speed selector, with a fully drawn timeline underneath. Speeds are 1×, 10×, 100× and 500×; their jumps advance the existing simulation by 5, 50, 500 and 2,500 seconds respectively, stopping earlier if every chicken dies. Jump preserves the playing or paused state; during the jump only the seek loop advances the simulation, then normal playback continues. Scrubbing the timeline still pauses. Each browser tab's title identifies its archived milestone.

The Auto/Manual toggle beside the speed selector defaults to Auto. It runs the first five simulation seconds at 1×, the next 150 simulation seconds at 10× (15 viewing seconds), and the next 1,500 at 100× (another 15 viewing seconds), then increases to 500×. Thus the speed boundaries are 5, 155 and 1,655 elapsed simulation seconds; pauses do not consume the schedule and jumps or seeks recalculate the speed from the replay position. The exporter also records when the last surviving chicken reaches 100 and 10 points below its eventual best score; after the opening ramp through 155 simulation seconds, Auto slows to 10× and then 1× at those milestones, including the final wait before death. Ending slowdowns take priority over accelerating to 500×. The two short prototype episodes finish during the opening ramp. Speed is recalculated after every simulation hop, so a fast frame cannot skip past a slowdown. The persistent best-score display does not affect it. Selecting a speed switches to Manual, and enabling Auto resumes the schedule at the current position.

| Saved policy | Phase generation | Recorded monitoring/development mean | Panel and limit | Map 42 score |
| --- | ---: | ---: | --- | ---: |
| First random population, before breeding | 1 | 5.81 | 16 monitoring maps, 30 seconds | 10 |
| Five-generation prototype | 5 | 9.19 | 16 monitoring maps, 30 seconds | 22 |
| Binary road learner | 470 | 144.13 | 64 validation maps, 60 seconds | 174 |
| Two-hop lookahead | 85 | 951.40 | 768 development maps, 600 seconds | 445 |
| Lookahead with memory, audited generation 100 | 100 | 1370.98 | 768 development maps, 600 seconds | 1706 |
| Frozen final memory policy | 150 | 1393.31 | 768 development maps, 600 seconds | 1804 |

The panels and episode lengths differ, so the means are not a controlled comparison. The final policy was frozen before a separate 512-map FB assessment: its independent mean is **1361.21** (95% map-bootstrap interval 1313.32–1409.09), median 1697, with 76.56% reaching 1000. The map-42 score is an illustration of that policy, not its independent-test average.

The first two entries belong to the separate prototype. The final winner's selected warm-start chain contains **1,174 phase generation positions**: 470 binary + 30 motion + 490 lookahead + 30 rows-fitness refinement + 1 restart 29 + 3 restart 30 + 150 memory. Multiple warm starts and population crossover connect these phases. This is not one uninterrupted 1,174-generation run or a count of all discarded searches. The earlier lookahead highlight sits at cumulative phase position 585; the generation 100 memory highlight at 1,124. Historical entries retain rules without an eagle; the app's new manual/training preset is a separate configuration.

## Did a larger batch learn faster?

The most direct completed budget comparison started both branches from the same **1304.71 development-mean parent**. Each ran 50 generations and **160,000 training episodes**, with the same mutation settings and top-10 development shortlist.

| Population × maps per chicken | Episodes per generation | Saved winner | Development mean, 768 maps | Recorded elapsed time |
| --- | ---: | ---: | ---: | ---: |
| 100 × 32 | 3,200 | Generation 45 | 1315.76 | 3,291.98 seconds |
| 200 × 16 | 3,200 | Generation 40 | 1307.56 | 3,334.96 seconds |

The 100-chicken branch finished about 43 seconds sooner and scored 8.20 points higher in this pair. The remaining five and ten generations, respectively, did not improve the saved winners. Increasing population alone therefore gave no advantage here: it traded more candidate chickens for fewer maps per candidate.

This was one matched-budget pair, not an isolated population-size experiment. Population size changes RNG consumption; seed strides 35 versus 19 also changed subsequent training panels. Concurrent training affected elapsed time. Both means selected models on development data, so neither is an independent final-test result.

Sources: [100 × 32 summary](../../results/experiments/average/wide-score-batch-100/training-summary.json), [200 × 16 summary](../../results/experiments/average/wide-score-batch-200/training-summary.json), [final policy freeze](../../results/variants/variant-1/final/freeze.json), [closing evaluation](../../results/variants/variant-1/final/evaluation.json), [selected phase lineage](../../results/variants/variant-1/lineage.json).

`scripts/export-highlights.ts` regenerates `public/highlights.json`, verifies that every exported genome matches its actual population archive, and checks each map-42 outcome against both headless evaluation and renderer replay. It performs no training and opens no reserved final maps.
