# Crossy Evolution

Teach chickens to cross procedurally generated terrain using genuine NEAT. Simulation and learning run independently of the Three.js renderer.

| Variant | Mechanics | Status |
| --- | --- | --- |
| [1](docs/variants/variant-1.md) | Cars/roads; at most three consecutive road lanes | Closing after final training batches |
| [2](docs/variants/variant-2.md) | Add trains | Mechanics present; training pending |
| [3](docs/variants/variant-3.md) | Add rivers, logs and lily pads | Planned |
| [4](docs/variants/variant-4.md) | Longer roads and eagle/inactivity pressure | Planned |

**Variant1:** protected development mean **1386.56** on768 maps; current viewer mean **1261.07** on512 independent maps, median1630. The provisional winning phase lineage is **1127 generations**, including inherited training. The final batches will determine the closing model/count. There is no eagle mechanic in Variant1; only the overall600-second episode limit.

## Run locally

Use Node24 LTS.

```bash
npm ci
npm run setup:assets
npm run dev
```

Click the title to watch100 trained chickens. The menu opens neural networks, measured charts and generation controls. Reference artwork is fetched from the pinned Evan Bacon commit and hash-verified locally; it is not redistributed here. [Attribution](docs/ATTRIBUTION.md).

## Results and data

- [Concise project summary](docs/PROJECT_SUMMARY.md) and [Variant1 report](docs/variants/variant-1.md).
- [Training data](docs/DATA_RELEASE.md):116 dated phase summaries,3948 recorded generation rows and4608 final policy/map outcomes. Counts overlap across inherited/continued phases and are not a single training lineage.
- [Full checkpoint/population release](https://github.com/sandsowkd/crossy-evolution/releases/tag/training-snapshot-2026-11-21):6.31GB with SHA256 manifests.
- [Technical archive](docs/VARIANT_1_TECHNICAL_ARCHIVE.md) and [research log](docs/variants/variant-1-research-log.md).

```bash
npm test
npm run build
npm run lint
```

Higher development scores are not independent test claims. Each new variant keeps separate rules, observations, ancestry and evaluation maps.
