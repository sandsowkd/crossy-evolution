# Crossy Evolution

A deterministic headless Crossy Road simulator with genuine NEAT, population replays and a Three.js viewer using locally fetched reference assets.

| Variant | Scope | Status |
| --- | --- | --- |
| [1](variants/variant-1.md) | Cars/roads; maximum three consecutive road lanes; no eagle | Complete |
| [2](variants/variant-2.md) | Add trains | Engine mechanics present; training pending |
| [3](variants/variant-3.md) | Add rivers, logs and lily pads | Planned |
| [4](variants/variant-4.md) | Longer road stretches and eagle pressure | Planned |

Variant 1's frozen generation 150 memory policy averages **1,361.21 on 512 reserved final maps**, with median 1,697 and 76.56% reaching 1,000. Its 95% map-bootstrap mean interval is 1,313.32–1,409.09. The policy was selected beforehand using 768 development maps (mean 1,393.31); final results did not select or retrain it.

The selected warm-start chain contains **1,174 phase generation positions**, rather than one uninterrupted run. Side experiments and discarded generations are separate. The final memory phase adds 150 generations of 100 chickens × 32 maps: 480,000 training episodes, plus substantial inherited learning.

A matched 160,000-episode comparison narrowly favored 100 chickens × 32 maps over 200 × 16 (development means 1,315.76 versus 1,307.56). Different RNG consumption and concurrent workloads limit the conclusion. [Actual milestones and batch comparison](variants/variant-1-highlights.md).

Variant 1 scores and historical replays use 600-second roads rules without an eagle. The app's new manual/training preset enables eagle pressure; those games are a different configuration from the completed benchmark.

[Variant 1 report](variants/variant-1.md) · [closing evaluation](../results/variants/variant-1/final/evaluation.json) · [training data](DATA_RELEASE.md) · [technical archive](VARIANT_1_TECHNICAL_ARCHIVE.md).
