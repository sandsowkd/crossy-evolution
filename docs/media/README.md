# README gameplay GIFs

All nine GIFs play at **1× simulation speed**. The two main GIFs and bloodline GIF use the full normal-speed website recordings. Generations 1 and 5 show their complete opening replays. The other four highlights show 15-second snippets centered around half their population’s final high score.

| Clip | Duration |
| --- | ---: |
| [Variant 1 main: full moves 0–100](variant-1-main-1x.gif) | 20.1 s |
| [Variant 2 main: full moves 50–150](variant-2-main-1x.gif) | 16.7 s |
| [Gen 1: complete opening replay](initial-population-1x.gif) | 19.9 s |
| [Gen 5: complete opening replay](early-five-generations-1x.gif) | 31.1 s |
| [Gen 50: score 452–493](lookahead-progress-1x.gif) | 15.1 s |
| [Gen 85: score 2,045–2,089](two-hop-lookahead-1x.gif) | 15.1 s |
| [Gen 100: score 4,730–4,781](lookahead-memory-1x.gif) | 15.1 s |
| [Gen 150: score 6,792–6,839](variant-1-final-1x.gif) | 15.1 s |
| [Bloodline: full score 0–100 run](all-generations-1x.gif) | 31.3 s |

Later highlights were re-recorded from the same saved populations and map seeds at fixed 1× timing, bypassing Auto speed changes. They retain all original genomes, including the deaths before capture begins. Main and bloodline clips retain their source video timing. GIF encoding reduces resolution and frame rate without accelerating playback.

Each GIF loops at 10 fps. [Timing metadata](timing.json) records simulation ranges, score windows, source/video durations, and population hashes where applicable. Encoded GIF durations match their source recordings within 0.1 seconds. Versioned `-1x.gif` filenames avoid stale cached previews.

Original visuals and source adaptations: [Evan Bacon’s Expo-Crossy-Road](https://github.com/EvanBacon/Expo-Crossy-Road). [Attribution](../ATTRIBUTION.md) · [Homepage recordings](../homepage-previews.md).


## Final Variant 2 GIFs

The completed Variant 2 showcase adds eight genuine recordings, each at 1× simulation speed: six full-population highlights, the frozen final AI, and its own1,500-chicken population mix. The six anchors are display1,5,50,85,100,150. Early highlights show the complete replay; later highlights show15-second excerpts. They preserve all original chickens and deaths before capture begins. Native V4 timing is six hops per second.

[Timing receipts](variant-2-timing.json) identify frame counts, exact decision ranges, encoded durations and source files. The source populations, map seeds and actual whole-map maxima are in `public/homepage-data.json`; the frozen default AI is genome353089. These recordings replace the earlier Variant2 development main clip and V1 placeholders. Variant1 GIFs remain unchanged.

The final Variant 2 GIFs use a 480-pixel width, 10fps, and a 96-color palette to reduce downloads while preserving 1× timing. Each is below 10MB. The original 15fps recordings remain unchanged.
