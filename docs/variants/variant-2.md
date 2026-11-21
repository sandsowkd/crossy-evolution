# Variant 2 — trains and rivers

Trains, moving logs and lily pads run in the deterministic headless simulator and original-asset viewer. Open `http://127.0.0.1:5173/?variant=2` for mechanics demos, different maps and saved population replays.

Original models, train assembly, car behavior, hops and support/collision rules come from the [pinned Evan Bacon source](variant-2-upstream-audit.md). **`varied-traffic-v1`** adds the user's requested rules:

| Rule | Behavior |
| --- | --- |
| Trains | Separate seeded schedule per track. First center crossing after 6–18 seconds; subsequent crossings 12–24 seconds apart, with a fresh random gap each time. Original 48 tiles/s speed; lights start 2 seconds before the center crossing. |
| Rivers | At most 5 consecutive water rows, including runs of 5 moving-log rows. Water independently chooses moving logs (70%) or static lily pads (30%). |
| Logs | 1.2–4.2 tiles/s. Adjacent moving-log rows differ in absolute speed by at least 0.8 tiles/s. At most 2 consecutive moving-log rows flow the same direction. Logs within a row share its speed. |
| Lily pads | Every row includes a center pad at x=0. The center column and neighboring grass have no trees or other static barriers. Traffic still needs to be avoided. |
| Other rules | Maximum 3 consecutive car lanes. Eagle capture after 10 seconds without a new highest row; the HUD shows capture only. |

These traffic, river and center-route rules are deliberate project changes. They do not reproduce the source's global random stream, 20-object pooling or wall-clock session timing. Configs without `variantTwoRules` preserve the earlier source-port behavior.

## Training

`results/variants/variant-2/paired-002/` contains separate **fresh** and **Variant1 transfer** experiments: 100 chickens, 16 common training maps/generation, observation version9, a 600-second horizon, and a bounded 64-generation budget each. Selection uses 64 development maps; 512 final maps remain reserved and unopened. Every evaluated population, native snapshot, protocol hash and ancestry record is saved locally.

The transfer branch starts from the actual final Variant1 generation150 population, preserving old weights and initializing new water/support inputs with zero effect. Its parent lineage contains 1,174 inherited phase positions; those are not new Variant2 generations. Scratch inherits no trained weights.

The initial `paired-001` experiment completed 64 generations per branch under the synchronized source-port clock. It is archived and superseded; its scores are not results for these new rules.

Both new branches completed their initial 64 generations. Each evaluated 102,400 training episodes; all 64 full population archives and the committed checkpoints were verified. The selected models reproduced their recorded development episodes and renderer-free viewer replays exactly.

| Branch | New generations | Best development generation | Mean score on 64 development maps | Training wall time |
| --- | ---: | ---: | ---: | ---: |
| Fresh | 64 | 28 | 5.22 | 46.7s |
| Variant1 transfer | 64 | 60 | 8.58 | 64.6s |

These are early river-learning results, far below the 1,000-average target. The selected fresh policy drowned on 51/64 development maps; transfer drowned on 63/64. No final evaluation has been opened. [Verification and counts](../../results/variants/variant-2/paired-002/verification.json).

```sh
npx tsx scripts/audit-variant-two.ts
npx tsx scripts/train-variant-two.ts prepare
# Run in separate terminals; --resume continues an interrupted branch.
npx tsx scripts/train-variant-two.ts scratch
npx tsx scripts/train-variant-two.ts transfer
```

See the [measured rule audit](../../results/variants/variant-2/rules-audit.json) and each branch's `training-summary.json` for actual counts and development scores. Generation count and simulation configuration must accompany any comparison with Variant1.

Git includes the two final 100-chicken preview populations in `public/variant-2/`, selected models, protocols and summaries. All native snapshots and every full generation archive remain locally preserved outside Git.
