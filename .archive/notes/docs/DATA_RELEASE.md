# Training data

The GitHub releases and Git tags have been removed. Their complete local archives, manifests, and checksums are retained. The [website’s replay explorer](https://jeremyhua.ng/crossyroadai/explore?variant=1) includes the saved populations available through its menus.

Results retained in Git include [final map outcomes](../results/published-variant-1-final-2026-11-21/final-map-outcomes.csv), [development outcomes](../results/published-variant-1-final-2026-11-21/development-map-outcomes.csv), [lineage metadata](../results/published-variant-1-final-2026-11-21/lineage.json), training summaries, and evaluation reports.

## Local archive copies

| Archive | Contents |
| --- | --- |
| `training-snapshot-2026-11-21` | Historical training runs, native checkpoints, complete populations, and verification data |
| `variant-1-final-2026-11-21` | Frozen final checkpoint, all 150 native final-phase populations, closing evaluation, and subsequent data supplement |
| `variant-2-development-2026-11-21` | Preserved generation-256 native state and its 200-chicken cohorts |

For local restoration, use the matching archive’s `SHA256SUMS`, manifests, and `RELEASE_NOTES.md` in a fresh checkout. [Explorer export](explorer.md) and [preview generation](homepage-previews.md) describe how the saved populations feed the visualizer. Run `npm run setup:assets` separately for the pinned visual assets.
