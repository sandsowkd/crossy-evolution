# Crossy Evolution

Teach chickens to cross procedurally generated terrain using genuine NEAT. Simulation and learning run independently of the Three.js renderer.

| Variant | Mechanics | Status |
| --- | --- | --- |
| [1](docs/variants/variant-1.md) | Cars/roads; at most three consecutive road lanes | Complete: 1,361.21 independent-test average |
| [2](docs/variants/variant-2.md) | Add trains; enable eagle pressure | Mechanics present; training pending |
| [3](docs/variants/variant-3.md) | Add rivers, logs and lily pads | Planned |
| [4](docs/variants/variant-4.md) | Longer roads and broader full-game rules | Planned |

**Variant 1 is complete.** The frozen policy averages **1,361.21** on 512 separately reserved final maps (95% map-bootstrap interval **1,313.32–1,409.09**), with median 1,697; 392/512 runs reach 1,000. It was selected on 768 development maps, averaging 1,393.31, before the final assessment.

The selected warm-start lineage contains **1,174 phase generation positions**, including inherited training; this is not one uninterrupted run. Variant 1 uses 600-second roads episodes without eagle pressure. New manual games and training use the current eagle rule; historical replays preserve their saved rules.

## Run locally

Use Node 24 LTS.

```bash
npm ci
npm run setup:assets
npm run dev
```

Click the title to watch population replays. The menu opens neural networks, measured charts, generation controls and saved learning milestones. Reference artwork is fetched from the pinned Evan Bacon commit and hash-verified locally; it is not redistributed here. [Attribution](docs/ATTRIBUTION.md).

## Results and data

- [Concise project summary](docs/PROJECT_SUMMARY.md) and [Variant 1 report](docs/variants/variant-1.md).
- [Learning milestones and batch-size comparison](docs/variants/variant-1-highlights.md).
- [Eagle rule for new runs](docs/EAGLE_RULES.md). Open `/?highlights` locally for the six-policy replay gallery.
- [Frozen closing evaluation](results/variants/variant-1/final/evaluation.json) and [verification](results/variants/variant-1/final/verification.json).
- [Training data](docs/DATA_RELEASE.md): 116 dated phase summaries, 3,948 recorded generation rows and 4,608 final policy/map outcomes. Counts overlap across inherited/continued phases and are not a single training lineage.
- [Full checkpoint/population release](https://github.com/sandsowkd/crossy-evolution/releases/tag/training-snapshot-2026-11-21): 6.31 GB with SHA-256 manifests.
- [Final checkpoint and closing data supplement](https://github.com/sandsowkd/crossy-evolution/releases/tag/variant-1-final-2026-11-21): all 150 final populations and later experimental data.
- [Technical archive](docs/VARIANT_1_TECHNICAL_ARCHIVE.md) and [research log](docs/variants/variant-1-research-log.md).

```bash
npm test
npm run build
npm run lint
```

Higher development scores are not independent test claims. Each new variant keeps separate rules, observations, ancestry and evaluation maps.
