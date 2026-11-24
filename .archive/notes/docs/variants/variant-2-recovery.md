# Variant 2 — recovered context and training handoff

Recovered all 44 turns of **Build Crossy Road neuroevolution** on November 21, 2026. Work and the existing 30-minute follow-up now continue in **Improve variant 2 training**. The local conversation archive is `results/variants/variant-2/recovered-conversation.json`; it is excluded from Git. Current process IDs, protocols and monitor files are in [recovery status](../../results/variants/variant-2/recovery-status.json) and [optimization status](../../results/variants/variant-2/optimization-status.json).

## Decisions carried forward

- Deterministic headless Crossy Road, real NEAT populations, and original Evan Bacon models, textures, camera and game presentation. Every displayed chicken is an actual saved neural policy.
- Variant 1 is closed: roads/cars, maximum three consecutive road lanes. Its final policy averaged **1,361.21 on 512 fresh maps under historical no-eagle rules**, with 1,174 inherited phase generation positions. Its training must remain closed.
- The user subsequently combined trains and rivers into Variant 2 and approved `clustered-traffic-v3`. Rows 0–25 contain cars/grass only. Afterward, water and track row densities are approximately half the earlier version. Rivers span 1–5 rows, average 2.5; tracks span 1–3, average 1.7. Mixed-size logs have 1–3 tile gaps, variable speeds and at most two successive rows flowing the same way. Center lily pads and neighboring center grass stay unobstructed.
- Variant 2 episodes last at most 600 seconds. An eagle catches a chicken after 10 seconds without a new highest row. The UI shows capture only. Training improvements must retain these physics.
- Continue the Variant 1 transfer lineage toward **1,000+ average**, improve the whole population, and keep improving afterward. Use bounded resumable batches and concise reports. Publishing verified project results to `sandsowkd/crossy-evolution` was authorized in the original conversation.
- Selection uses the opened 64-map and 256-map development suites. **All 512 reserved final maps remain unopened.** Development records are not independent final test estimates. Keep search, inherited lineage, repeated verification and new training counts separate.

## Result recovered and improved

The previous chat reported **181.01 average over 256 development maps**. Its still-running audit subsequently found **208.61**, median 137.5, maximum 1,312; 4/256 episodes reached 1,000. Winner: `transfer-consistent-001`, generation 496, genome 138658. Its ancestry has 588 Variant 2 generation positions plus 1,174 inherited Variant 1 positions. This is a **15.25% improvement over 181.01**, and the 1,000-average goal remains unmet. The verified cohort is saved in the viewer. [Current policy](../../results/variants/variant-2/best-development.json), [audit](../../results/variants/variant-2/transfer-consistent-001/candidate-audit-00504.json).

The earlier matched population comparison found whole-cohort means of 149.43 control, 158.39 fine and 159.62 consistency on the same 64 maps at generation 416; every one of the 200 chickens in each population averaged over 100. [Population comparison](../../results/variants/variant-2/population-comparison-003.json).

## Six active experiments

Four trainers and two monitors from the previous chat were identified. Trainers stopped and saved at completed generation boundaries; superseded monitors were stopped. No original training population was discarded. The resumed runs retain the exact complete checkpoint, including every weight, population member, RNG, innovation, species, parameter and history record.

| Current run | Initialization | Training maps | Remaining/new generations |
| --- | --- | ---: | ---: |
| `transfer-control-fast-001` | Exact control generation 520 | 32 | 248, to 768 |
| `transfer-consistent-fast-001` | Exact consistency generation 504 | 32 | 264, to 768 |
| `transfer-fine64-fast-001` | Exact fine64 generation 463 | 64 | 305, to 768 |
| `transfer-plasticity-fast-001` | Exact plasticity generation 188 | 32 | 68, to 256 |
| `transfer-adapt-best-001` | Actual best generation 496 cohort | 32 | 256 |
| `transfer-risk50-001` | Consistency generation 504; risk weight 0.25 → 0.50 | 32 | 256, to 760 |

Each run has 200 chickens. The combined remaining/new planned budget is **10,892,800 training episodes**; completed inherited work is separate. Adapt-best allows small all-weight mutations (rate 0.02, step 0.03), river-input mutations (0.15, 0.12), and consistency fitness 0.25. It is a combined exploratory strategy. Risk50 changes one fitness parameter from the same native consistency state and retains the map stream, allowing comparison at matching generations. Neither result is established yet.

## Verified implementation migration

Old snapshots were approaching the 128-million-character checkpoint bound. New immutable native protocols explicitly allow 256 million characters; ordinary UI imports retain 128 million. Monitors stop safely near 199.68 MB if another migration is needed. Source bundles, native snapshots and all complete generation cohorts are retained.

The V9 encoder now reuses the legacy observation prefix and caches numeric platform positions without allocating unused support objects. A frozen-encoder differential test covers 3,000 state/mask pairs. A full 200-chicken, 32-map generation reproduced **every result and all offspring, RNG, innovations, species and residual mutations exactly**. That generation measured 19.46 seconds before / 15.46 after, an observed 1.259× speedup under variable load. This is implementation speed, not evidence of better learning per episode. Verification evaluated 12,800 repeated episodes and added zero training lineage generations. [Proof](../../results/variants/variant-2/native-migration-001/verification.json).

All **90 tests**, typecheck, lint and production build pass. Initialization proofs are saved beside each exact continuation protocol. Native monitors audit every 32 committed generations and publish only stronger verified development policies under a shared lock. Keep hashed training code frozen while these runs execute. On completion, compare policies and whole populations, inspect failures, and continue from verified native states. Never relaunch a superseded parent alongside its continuation.


## Follow-up: completed plasticity and 64-map consistency

The best policy now averages **223.80 over 256 development maps**, median 160.5, maximum 1,330. Winner: 64-map consistency generation 624, genome 164315, with 716 Variant 2 lineage positions plus 1,174 inherited Variant 1 positions. The exact archived cohort and replay verification are recorded in [the latest iteration](../../results/variants/variant-2/iteration-2026-11-21-2205.json). The 1,000-average goal remains unmet.

The older plasticity strategy completed all 256 generations and passed native checkpoint, full archive and exact replay verification. Its best 256-map nominee averaged 170.00. Its final whole population averages 159.36 on 64 maps, up from the starting cohort's 124.69. All data remain preserved; its slot now runs `transfer-consistent64-001`, which resumes the exact consistency generation 576 native state with 64 rather than 32 training maps, for 256 new generations / 3,276,800 training episodes. The original consistency sibling continues, and no faster-learning claim is established.

Matched generation 568 populations average 186.88 with consistency risk weight 0.25 and 189.27 with risk weight 0.50. Their minimum policy averages are 154.77 and 146.38. Both have all 200 policies averaging 100+. The adaptation generation 72 population averages 168.04. These five population comparisons total 64,000 development episodes; the champion failure audit replays 256 additional development episodes. Neither is new training. [Iteration ledger](../../results/variants/variant-2/iteration-2026-11-21-2035.json).

A concurrent viewer edit changes only optional agent filtering in `Replay.snapshot`; the trainer and physics source remain exact. The new protocol captures the updated source bundle, while existing trainers keep their loaded frozen source. [Diff audit](../../results/variants/variant-2/replay-display-source-audit-001.json). Current run and monitor inventories in `optimization-status.json` supersede the recovery-time table above.


## Control closeout and gentler mutation comparison

The control completed its 248-generation continuation and all 768 saved cohorts passed native archive and exact replay verification. Its whole-population average on 64 development maps changed from **143.24 to 144.17**, while its weakest policy fell from **91.20 to 76.73**. The separate consistency64 generation 640 population averages **197.29**, with minimum **144.89**. These 38,400 development episodes are separate from training. The freed slot now runs `transfer-gentle64-001`, initialized from exact native consistency generation 640; only river-input mutation step **0.12→0.06** changes. Its 128-generation budget is 1,638,400 training episodes. This sibling comparison has not established a speed advantage. [Complete population comparison](../../results/variants/variant-2/control-closeout-populations-001.json).
