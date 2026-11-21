# Variant 1 — cars and roads

**Complete.** The final frozen policy averages **1,361.21 on 512 separately reserved FB maps**, exceeding the 1,000-average target. Its median is 1,697; 392/512 runs (76.56%) reach 1,000, and the best score is 1,867. The 95% map-bootstrap interval for its mean is **1,313.32–1,409.09**. This interval describes map variation for one frozen policy, not variation across independent training runs.

The policy was selected first on the unchanged 768-map development panel, averaging **1,393.31**. Its weights, native checkpoint and 150 full population archives were frozen before the closing assessment; verification confirms that the checkpoint remained unchanged. The earlier FA suite remains unopened. Authorized training has ended, with no new Variant 1 search planned.

## Rules and comparison

All closing comparisons use identical 600-second episodes: roads and grass, at most three consecutive road lanes, three vehicles per road, difficulty 1, original traffic/collision rules and five neural actions. **There is no eagle/inactivity death in this benchmark.** New manual games and training can use the app's current eagle rule; historical replays retain their saved configuration.

| Policy | Mean on the same 512 final maps |
| --- | ---: |
| Random | 0.97 |
| Simple rule | 13.08 |
| Distance rule | 111.97 |
| Previous published policy | 1297.03 |
| Final NEAT policy | **1361.21** |

The paired gain over the previous published policy is 64.18 rows, with 95% bootstrap interval 0.31–129.60. Removing traffic-location/proximity observations from the frozen network reduces its mean to 5.36, supporting that its behavior depends on learned hazard responses. These checks did not change the selected model.

## Training lineage

The selected model is **memory-branch generation 150, genome 14920**, trained with 100 chickens × 32 maps per generation. That phase adds 480,000 training episodes. Its selected warm-start chain contains **1,174 phase generation positions**:

470 binary + 30 motion + 490 lookahead + 30 rows-fitness refinement + 1 restart 29 + 3 restart 30 + 150 memory.

This spans successive warm starts and a population ancestry graph with crossover. It is not one uninterrupted 1,174-generation run, a single-parent mutation count, or the total work across side experiments. The dated public export's 3,948 generation rows across 116 summaries include overlapping cumulative histories.

The completed matched-budget batch comparison slightly favored 100 × 32 over 200 × 16 at 160,000 episodes each: 1,315.76 versus 1,307.56 on development maps. RNG consumption, training panels and concurrent timing prevent attributing the difference solely to population size. The [milestone gallery and concise comparison](variant-1-highlights.md) retain authentic earlier policies and historical limits.

[Frozen final evaluation](../../results/variants/variant-1/final/evaluation.json) · [verification and interval](../../results/variants/variant-1/final/verification.json) · [raw lineage](../../results/variants/variant-1/lineage.json) · [closeout plan](../../results/variants/variant-1/closeout-plan.json) · [data release](https://github.com/sandsowkd/crossy-evolution/releases/tag/training-snapshot-2026-11-21) · [research log](variant-1-research-log.md).
