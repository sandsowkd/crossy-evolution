# Development guide

Crossy Road AI separates the deterministic game, neural-network evolution and rendering. Saved networks can be replayed or raced without running training.

## Code layout

| Directory | Responsibility |
| --- | --- |
| `src/core/` | World generation, collision rules, observations and deterministic simulation |
| `src/evolution/` | Genomes, NEAT, network inference, checkpoints and replay state |
| `src/visualization/` | React pages, replay controls, human races and Three.js rendering |
| `scripts/training/` | Training and checkpoint tools, retained for reproduction |
| `scripts/evaluation/` | Fixed-policy evaluations, integrity checks and benchmarks |
| `scripts/data/` | Population exports, result figures and deployment packaging |
| `scripts/media/` | Gameplay recordings, GIF inputs and preview exports |
| `public/training-cohorts/variant-1/` | Variant 1 final, sequence, highlight and release populations |
| `public/training-cohorts/variant-2/` | Variant 2 sequence and historical development populations |
| `results/variant-1/`, `results/variant-2/` | Final evaluations, comparisons and replay measurements |

## Run and check

Use Node 24 LTS and ffmpeg for media work.

```bash
npm ci
npm run setup:assets
npm run dev
npm test
npm run lint
npm run build
```

The public build uses the included population exports. It does not need the original working training directories. Both experiments have ended; development, rendering and tests do not resume training.

## Simulation and controls

The headless game advances at 60 Hz. Networks choose among wait, forward, backward, left and right. The final Variant 2 rules add trains, rivers, moving logs, lily pads, and a ten-second no-progress eagle. Waiting or returning to an old row does not reset that deadline. Collisions and progress are resolved in the simulator, independently of renderer frames.

Arrow keys and WASD move the human chicken. Restart, pause and focus changes clear queued input. The human and frozen AI share a map seed. The AI always uses its saved network and native decision cadence.

Historical checkpoints retain their own rules. In particular, Variant 1's closing benchmark is eagle-free. Full viewing replays can use different horizons from historical evaluations; the [results reports](results/) distinguish them.

## Saved populations

`public/explorer-catalog.json` is the replay selector's index. Each entry identifies its complete cohort, SHA-256, source generation, map panel and simulation configuration. The loader decompresses on demand, verifies hashes and unique member IDs, and keeps a small memory cache. Archive paths permit bounded variant/category/run folders and reject traversal, query strings and invalid names.

The viewer uses the same network and simulation as evaluation. Changing map seeds resimulates the saved networks; it does not retrain them. All 150 selector positions are exported for both variants. Original phase-qualified links remain available.

## Results and figures

The two [results reports](results/) link the released measurements. `scripts/data/plot-results.py` draws distributions, population replay curves and the final continuation comparison from those files. It performs no evaluation or training. Use a Python environment with matplotlib and NumPy.

Historical evaluation files retain their original contents and source paths. [The archive index](../results/archive-index.json) resolves moved tracked files. `.archive/` holds prior notes, historical experiments and operational records; it is separate from the current developer guide and results reports.

## Media and deployment

The homepage serves recordings so it does not run several WebGL simulations at once. Highlight videos contain complete Auto replays, including final-survivor slowdown. GitHub GIFs are normal-speed excerpts. Main and 1,500-chicken recordings loop the requested early-crossing score windows. [Media sources](media/README.md) identify their populations and timing.

For recording, run the dev server and `npx tsx scripts/media/render-homepage-previews.ts`, then open its temporary recording page. Use `--readme --variant2` with `?readme&variant2` for Variant 2 GIF sources. `?clips=id,id` selects specific recordings. The recorder exports real gameplay frames through the local receiver; it does not synthesize actions.

Build the deployed subpath with:

```bash
npm run build -- --base=/crossyroadai/ --outDir=.publication/friends-preview-build
npx tsx scripts/data/package-friends-preview.ts /path/to/website/crossyroadai
```

The packager verifies every required population archive. The personal website serves this static snapshot through its existing Vercel configuration. Its homepage has a canonical URL and search/social metadata; parameterized replay pages and large data paths retain their crawler exclusions.

[Visual attribution and license](ATTRIBUTION.md)
