# Training experiments

All historical training belongs to **Variant1: cars/roads, maximum three consecutive road lanes, no eagle**. Existing train smoke tests are engineering checks, not Variant2 learning results.

- [Variant1 results and closeout](variants/variant-1.md)
- [Variant2: trains](variants/variant-2.md)
- [Variant3: rivers/logs/lily pads](variants/variant-3.md)
- [Variant4: longer roads and broader rules](variants/variant-4.md)
- [Six replay highlights and population-size comparison](variants/variant-1-highlights.md)
- [Eagle rule for new runs](EAGLE_RULES.md)
- [Full Variant1 research log](variants/variant-1-research-log.md) — archival detail
- [Training tables and data restoration](DATA_RELEASE.md)

Variant1 training and the reserved closing assessment are complete: **1361.21 mean on512 fresh maps**, with1393.31 on768 development maps. The selected lineage totals1174 inherited phase positions. Its training monitor is paused; do not launch more runs from an old heartbeat. New eagle rules are separate from this historical benchmark. See `results/variants/variant-1/closeout-plan.json`.
