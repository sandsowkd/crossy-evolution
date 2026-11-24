# README gameplay GIFs

These nine looping GIFs are excerpts from the actual homepage recordings in `public/previews/`. They are used as relative image links in the main GitHub README. The full videos and interactive population replays remain on [the website](https://jeremyhua.ng/crossyroadai).

| GIF | Source MP4 | Start / duration | Width |
| --- | --- | --- | --- |
| `variant-1-main.gif` | `variant-1-main.mp4` | 0 s / 8 s | 384 px |
| `variant-2-main.gif` | `variant-2-main.mp4` | 0 s / 8 s | 384 px |
| `initial-population.gif` | `initial-population.mp4` | 0 s / 7.1 s | 280 px |
| `early-five-generations.gif` | `early-five-generations.mp4` | 0 s / 8.2 s | 280 px |
| `lookahead-progress.gif` | `lookahead-progress.mp4` | 4 s / 8 s | 280 px |
| `two-hop-lookahead.gif` | `two-hop-lookahead.mp4` | 5 s / 8 s | 280 px |
| `lookahead-memory.gif` | `lookahead-memory.mp4` | 5 s / 8 s | 280 px |
| `variant-1-final.gif` | `variant-1-final.mp4` | 5 s / 8 s | 280 px |
| `all-generations.gif` | `all-generations.mp4` | 0 s / 8 s | 480 px |

Conversion uses FFmpeg at 8 fps, a 64-color palette, Bayer dithering, and infinite looping. The source clips retain the actual rendered score and population behavior. Later-generation excerpts include the original Auto playback speed changes; the mixed-generation excerpt stays at 1×. No networks or gameplay outcomes were changed for these GIFs.

The Variant 2 main clip is an actual development policy. Its six placeholder highlights and mixed-population clip on the website reuse Variant 1 recordings and are explicitly labeled there.

Original visual assets and source adaptations: [Evan Bacon’s Expo-Crossy-Road](https://github.com/EvanBacon/Expo-Crossy-Road). See [attribution and retained license notices](../ATTRIBUTION.md). See [homepage preview generation](../homepage-previews.md) to reproduce the source videos.
