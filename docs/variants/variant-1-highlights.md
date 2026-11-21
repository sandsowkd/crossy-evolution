# Variant 1: recorded learning milestones

The gallery replays six authentic archived policies on **map seed 42**. Each retains its historical episode limit, sensor version, and rules without an eagle. These single-map scores illustrate behavior; they do not replace evaluation across many maps.

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
