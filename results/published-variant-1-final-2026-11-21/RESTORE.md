# Variant 1 final data — November 21, 2026

Frozen generation 150, genome 14920: development mean 1393.30989583 on 768 maps; independent FB closing-test mean 1361.20898438, median 1697, and 76.6% scores >=1000 over 512 maps at 600 seconds. This historical model is roads-only and eagle-free. New eagle rules are a later configuration.

`variant-1-final.tar.gz` contains the exact native checkpoint, all 150 complete populations of 100 actual genomes, selected weights, freeze/evaluation/replay verification, lineage metadata and CSV tables (4608 final policy/map outcomes, 768 selected development outcomes, and 512 traffic-blind diagnostic outcomes). No further training or model selection occurred during packaging. Native checkpoint SHA256: `a93539e954369acf138a4a00e438ebf5e0d03ea5ba94df7de2548da7fbdbaa3b`.

`post-snapshot-delta` contains every eligible new or changed training-data file relative to the per-file manifests of [the original dated snapshot](https://github.com/sandsowkd/crossy-evolution/releases/tag/training-snapshot-2026-11-21). Unchanged historical files stay in that original release. Full final and delta archives have no overlapping paths. Together with the original snapshot, they preserve this final capture; `current-training.manifest.json` gives every captured eligible file's SHA256. Historical paths absent now are listed separately and are not deleted automatically. Repeated frozen copies, inherited states and cumulative histories must not be summed as independent training.

## Restore safely

Download assets into a separate directory. Run `shasum -a256 -c SHA256SUMS`. If an archive has numeric `.part-001` files, concatenate its parts in numeric order before extraction. Restore the original snapshot first if you want the complete historical data, then extract this supplement into that fresh clone with `tar -xzf variant-1-final.tar.gz -C /path/to/clone` and `tar -xzf post-snapshot-delta.tar.gz -C /path/to/clone`. The full-final archive also works independently for the final native state and its 150 populations. Do not extract into a working training directory; changed paths intentionally supersede dated versions.

The isolated `public/training-cohorts/variant-1-final/` gallery and distribution checkpoint are included in the delta. The frozen source checkpoint keeps its original bytes; viewer copies may use namespace and content-hash references. To resume natively, import `results/variants/variant-1/final/checkpoint.json` into the compatible application or use `Trainer.restore(parseCheckpoint(...))`. Exact continuation state and sensor/training parameters are preserved.

No upstream art, screenshots, local media, fonts or meshes are included. `npm ci && npm run setup:assets && npm run dev` installs the compatible code's dependencies and fetches hash-verified original assets locally. This data release grants no additional third-party artwork rights.
