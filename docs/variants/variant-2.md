# Variant 2 — trains and rivers

Open `http://127.0.0.1:5173/?variant=2` for mechanics demos, maps and actual 100-chicken replays. Original Evan Bacon models, train assembly and the source support/collision behavior remain in use. [Source audit](variant-2-upstream-audit.md).

**Map review pending:** further training must wait for the user's confirmation. The example map opens paused at row0; use Opening, First river, First tracks or the row slider to inspect it. Play animates traffic and logs. [Review status](../../results/variants/variant-2/map-review-status.json).

The current **`clustered-traffic-v2`** rules are explicit project changes:

| Rule | Behavior |
| --- | --- |
| Opening | Rows 0–25 contain only cars and grass. Rivers and rails can start at row 26. |
| Density | After the opening, target 1/6 water rows and 1/24 rail rows: half the previous row densities. Fewer group starts offset the longer crossings. |
| Rivers | Crossings have 1–5 consecutive rows, averaging 2.5. A whole crossing uses moving logs (70%) or lily pads (30%), so pads do not break moving-log groups into single rows. |
| Tracks | Groups have 1–3 adjacent tracks, averaging 1.7. Every track has its own random train schedule: first center crossing at 6–18 seconds, then 12–24 seconds between crossings. |
| Log coverage | At least 6 mixed-size original logs per moving row, on a shared conveyor loop. Edge gaps are 1 tile (70%), 2 tiles (25%) or 3 tiles (5%), including the wrap seam. Placement uses actual mesh widths. |
| Log motion | 1.2–4.2 tiles/s. Adjacent moving rows differ by at least 0.8 tiles/s in absolute speed. At most two consecutive rows flow the same way. |
| Lily pads | A center pad is guaranteed in every lily row; the center column and neighboring grass have no static obstacles. |
| Other rules | At most 3 car lanes in a row; eagle capture after 10 seconds without a new highest row. |

## Measured distribution

A reproducible audit of **400,000 rows after the opening**, on 200 seeds, measured:

| Metric | Result |
| --- | ---: |
| Moving-log row density vs previous rules | 50.14% |
| All-water row density vs previous rules | 49.93% |
| Track density vs previous rules | 50.54% |
| Mean moving-log crossing length | 2.507 |
| Mean consecutive tracks | 1.701 |
| Logs per moving row | 6–9 (mean 6.43) |
| Edge-to-edge gap range | Exactly 1–3 tiles |
| Early river/rail or missing center-pad violations | 0 |

[Full audit and crossing histograms](../../results/variants/variant-2/rules-audit.json). The row density comparison uses the same map seeds and post-opening row indices; the new opening reduces early hazards further.

## Training and provenance

`paired-003` is the new paired experiment for these rules: separate fresh and Variant1-transfer populations, 100 chickens × 16 common training maps/generation, a 600-second horizon and 64-generation budgets. Selection uses 64 development maps. The 512 final maps remain reserved and unopened. The transfer branch inherits the actual final Variant1 generation150 population and its 1,174 parent phase positions; fresh inherits no trained weights.

Earlier results remain reproducible under their saved configurations. `paired-002` used **`varied-traffic-v1`**; its selected development means were 5.22 fresh and 8.58 transfer after 64 new generations each. Those scores do not describe the new clustered maps. [Previous concise report](variant-2-varied-traffic-v1.md). `paired-001` is the earlier synchronized-clock prototype.

Both branches completed 64 new generations (102,400 training episodes each). Full population archives, native checkpoints, saved viewer populations and selected development episodes were verified.

| Branch | New generations | Best development generation | Development mean | Training episodes |
| --- | ---: | ---: | ---: | ---: |
| scratch | 64 | 60 | 45.59 | 102,400 |
| transfer | 64 | 16 | 54.91 | 102,400 |

These preliminary scores use the new map rules and remain below the 1,000-average goal. [Counts and replay verification](../../results/variants/variant-2/paired-003/verification.json).

```sh
npx tsx scripts/audit-variant-two.ts
npx tsx scripts/train-variant-two.ts prepare
# Separate terminals; --resume continues an interrupted branch.
npx tsx scripts/train-variant-two.ts scratch
npx tsx scripts/train-variant-two.ts transfer
npx tsx scripts/verify-variant-two.ts
```

Protocols, ancestry, generation counts, selected policies and summaries live in `results/variants/variant-2/`. Every native snapshot and full evaluated generation is retained locally. Git includes both final 100-chicken viewer populations in `public/variant-2/`.
