# Saved-population explorer

[Variant 1](https://jeremyhua.ng/crossyroadai/explore?variant=1) and [Variant 2](https://jeremyhua.ng/crossyroadai/explore?variant=2) open a replay chooser over the default saved population. The chooser shows six highlight cards first. **Advanced replay** selects a specific generation and available training-map seed. The compact variant toggle switches experiments, and the replay settings button reopens the chooser. Clicking outside closes it.

Replay links use query parameters: `?generation=150&seed=561909326&variant=1`. The app also reads old `/generation/<generation>/seed/<seed>` and historical milestone links. The full-screen viewer preserves the existing HUD, density rendering, camera, timeline, playback speeds, and Auto schedule. Space pauses or resumes a replay when a form or modal is not focused.

## Curated Variant 1 sequence

The public 1–150 selector is a curated progression through authentic saved populations from several training phases. It is not a claim of 150 uninterrupted generations. No genomes, weights, or measured benchmark histories are interpolated or altered.

| Display positions | Native saved populations |
| --- | --- |
| 1–5 | Prototype generations 1–5 |
| 6–35 | Binary-input generations 6–470 |
| 36–43 | Motion-input generations 1–30 |
| 44–50 | Lookahead generations 1–30 |
| 51–85 | Lookahead generations 32–85 |
| 86–99 | Later lookahead generations 90–600 |
| 100 | Audited memory generation 100 |
| 101–150 | Final memory generations 101–150 |

Positions within these ranges sample original whole populations. The six public anchors are **1, 5, 50, 85, 100, and 150**; display generation 50 uses native lookahead generation 30. The common eight-map panel allows comparable viewing-rule audits across all display positions. Single-map outcomes still vary.

The catalog retains native source phases and generation numbers, real map seeds, simulation configurations, and population hashes. Historical phase-qualified links add `phase=prototype`, `binary`, `lookahead`, `memory-audit`, or `memory` to disambiguate overlapping native generation numbers. The completed native memory phase separately contains all 150 saved populations, with 100 original genomes and 32 training maps per generation.

## Variant 2 development snapshot

The public explorer includes generations 1–64 from the frozen `v4-mean-source-rng-b-003/pareto` development branch, with 200 original genomes per population. This is a saved snapshot rather than the latest ongoing training state. Native six-decisions-per-second timing, clustered-traffic-v4 mechanics, eagle rules, and its 600-second evaluation limit are preserved. The original development visualizer remains separate.

## Data and reproduction

`public/explorer-catalog.json` records full-population gzip archives and SHA-256 hashes of their uncompressed contents. Genomes are validated during export and loading. Only the selected population is loaded, with at most three populations cached. A cancellable worker plans the selected map’s fixed timeline and last-survivor slowdown. Variant 1 viewing replays use the ten-second inactivity eagle and no historical episode cutoff; benchmark data retains its original rules.

The selector lists available saved map seeds. URLs can address uint32 map seeds, and replays resimulate the same saved networks deterministically. The original inspectors remain at `/lab/variant-1` and `/?variant=2`. Static hosting needs an index fallback for `/explore`, `/play`, `/lab/*`, and supported legacy replay paths.

To reproduce the catalog, obtain the native archives from the project’s data releases, then run `npx tsx scripts/export-explorer.ts`. The same exporter includes the curated sequence. The optional common-map audit uses `scripts/audit-replay-sequence.ts` and publishes its existing results with `scripts/publish-replay-audit.ts`; rebuild homepage data and recordings as documented in [homepage previews](homepage-previews.md). Exports preserve source trainers, checkpoints, and saved genomes. The browser does not train networks when opening a replay.
