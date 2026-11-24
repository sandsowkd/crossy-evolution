# Homepage previews

The two main previews are muted, looping H.264 recordings of one saved chicken at normal speed. They play automatically when visible and pause while offscreen or while the page is hidden. Variant 1 uses the frozen final policy, moves 0–100 on map 42. Variant 2 uses the saved development policy from generation 37, moves 50–150 on map 0; that segment includes roads, logs and an active train. Neither recording changes the saved genome or simulation rules.

The six homepage highlight previews use the curated display generations **1, 5, 50, 85, 100, and 150**. Their exact native archives, populations, selected seeds, and whole-population high scores are recorded in `public/homepage-data.json`. Display generation 50 is native lookahead generation 30. The selected seeds are respectively 561909326, 627233379, 346364751, 27099291, 27099291, and 561909326; their population highs are 10, 34, 946, 4,140, 9,520, and 13,639. These are viewing-rule scores on individual maps, not benchmark means. The original binary generation-470 and weaker binary generation-50 archives remain available through historical links.

The previews use the existing density rendering, camera tracking and Auto schedule, with the inactivity eagle and no historical episode cutoff. Auto runs five viewing seconds each at 1×, 10× and 100×, then 500×, retaining the existing last-survivor slowdown. The same helper drives detailed replays and recordings. Every clip has a recorded, incrementing score number in its top-right corner; population clips keep the highest score across all chickens, including dead ones.

Highlight clips keep a subtly grayed JPEG poster until hovered, keyboard focused or tapped. The tint clears for playback, with no hover label. Leaving or blurring a clip restores its still, and only one highlighted clip plays at a time. Main clips continue independently. Desktop highlights form one horizontally scrollable row per variant, with previous/next controls; mobile stacks each variant above its own highlight grid. The Variant 2 highlight cards explicitly reuse Variant 1 clips as placeholders and link to those original replays.

`public/homepage-data.json` contains population maximum scores, the exact main-preview policy IDs and move ranges, and the original mean-row and maximum-row training histories. Training phases remain separate because their inputs, map panels, populations and limits differ. Preview scores are not the frozen policy's independent benchmark results.

To regenerate from the local research archives, with Node and ffmpeg installed:

1. Run `npx tsx scripts/export-explorer.ts`, then `npx tsx scripts/export-homepage-data.ts`. This also freezes the current local Variant 2 development population for recording.
2. Run `npm run dev` and `npx tsx scripts/render-homepage-previews.ts` in separate terminals. The receiver binds only to `127.0.0.1:8883` and temporarily creates the recording page.
3. Open `http://127.0.0.1:5173/_record-home-previews.html` and select **Record homepage clips**. The original renderer exports frames with the original pixel-font score, and the receiver encodes them. Wait for the completion message. To regenerate one clip, append `?clip=lookahead-progress` (or another clip ID) to the recording-page URL. Starting a clip clears its previous temporary frames.
4. Inspect `.publication/homepage-preview-output/`, then copy the eight corresponding `.mp4` and `.jpg` pairs to `public/previews/`. Stop the receiver to remove its temporary page.

The recording entry point is excluded from the production application. The generated videos and posters ship as static assets; training archives are only needed to regenerate them. Check with `npx tsx --test src/tests/homepage-data.test.ts src/tests/highlight-playback.test.ts` and `npm run build`.

The main preview column is approximately 20% narrower than the earlier layout. Its Explore button sits beside the heading, without an explanatory caption. Highlight cards use two-word factual titles and a one-sentence description. All replay links open in a new tab. The introductory framework description and inspiration credits occupy separate lines.

The bottom **The entire bloodline (10 chickens from each generation)** section shows two autoplaying population recordings side by side on desktop, stacking on small screens. Variant 2 is explicitly a placeholder using the Variant 1 recording. The source flock still contains ten unchanged networks from every curated display generation (1,500 total), rather than a reconstructed family tree. Regenerate its input and metadata with `npx tsx scripts/export-flock-preview.ts`, then record only `?clip=all-generations` through the same receiver. This clip repeats score 0–100 (decisions 0–156) entirely at 1× speed. The encoded 15 fps video lasts approximately 31.27 seconds, including both endpoint frames. Its source manifest remains in `public/flock-preview.json`.

The experiment uses standalone transparent icons. The car, hopping chicken, and nine-chicken formation use PNGs baked from the original models. The car faces down and left. The three model images are imported from `src/visualization/icons/` so the build versions their URLs with their contents, preventing stale or failed public-asset URLs from surviving an icon update. The formation renders nine closely spaced chickens on a true 3×3 world grid with overlapping silhouettes, using the same viewing angle as the hopping chicken. Arrow keys, a flat coin with a C, and a wide side-view brain are blocky SVGs. The enlarged icons alternate right, left, right in each experiment panel. The three yellow buttons below the population clips are centered. Regenerate the three PNGs with `?icons` on the recording page, then copy `blue-car-left.png`, `chicken.png`, and `population-formation.png` from `.publication/homepage-preview-output/icons/` into `src/visualization/icons/`. The recorder renders no roads, ground, or background for these assets.


## Friends preview deployment

The saved website lives at [jeremyhua.ng/crossyroadai](https://jeremyhua.ng/crossyroadai). Replay URLs use query parameters, for example `?generation=150&seed=561909326&variant=1`. The website is a saved preview deployed through the personal website repository. It does not require a password.

Build with `npm run build -- --base=/crossyroadai/ --outDir=.publication/friends-preview-build`, then run `npx tsx scripts/package-friends-preview.ts <personal-website-checkout>/crossyroadai`. The packager copies static assets and hash-verifies required population archives without modifying training files. It retains a timestamped copy of an existing destination. Publish the scoped `crossyroadai/` snapshot through the personal website repository’s existing Vercel integration, preserving its subpath rewrites and current SEO configuration.

The [README GIFs](media/README.md) play entirely at 1×. Main and bloodline GIFs use the full normal-speed recordings. Generations 1 and 5 use complete opening replays; the later highlights use dedicated 15-second recordings around half their final high score. The website videos and live replay controls remain separate.


## Completed Variant 2 media

Variant 2 placeholders have been replaced by genuine frozen-V4 recordings. Its six highlights use display positions1,5,50,85,100,150 and the exact source populations in `public/variant-2/showcase-provenance.json`. The main clip uses frozen final genome353089. Its separate bloodline clip samples ten original networks from all150 display positions, with all1,500 IDs/hashes recorded in `public/variant-2/flock-preview.json`.

Use `scripts/export-variant-two-media.ts` for the final Variant 2 media inputs. The recorder accepts `?variant2` for website clips and `?readme&variant2` for normal-speed README recordings. Start the receiver with `--readme --variant2` for the latter. The earlier Variant 2 development and placeholder instructions above remain historical; do not rerun those old exporters over the final release. The six Variant 2 website highlights show complete runs using the same Auto speed schedule as Variant 1. The README keeps its separate normal-speed early-crossing GIF excerpts. The main and bloodline recordings remain normal-speed score-window loops. Variant 1 Auto footage and assets remain unchanged. `public/variant-2/highlight-auto-timing.json` records each complete run’s final move, high score, frame count, and observed speed multipliers.

## Early-crossing Variant 2 refresh

Variant 2 previews now use maps318,4984,14232, each with no lily-pad rows through150. The main and population-mix recordings use map318 around rows25–125 (logs26, tracks31). Later README highlights capture early crossings rather than the midpoint of the whole-map high score. The same original networks, eight-map audit, frozen final opponent, and V4 rules are retained. Passive log drift no longer creates a jump animation.
