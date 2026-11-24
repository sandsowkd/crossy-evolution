# Results data

- **[Variant 1](variant-1/):** frozen held-out assessment, policy verification, the population-size comparison and full-population replay measurements. [Report](../docs/results/variant-1.md).
- **[Variant 2](variant-2/):** default and peak development outcomes, final policy freeze, continuation comparisons and replay measurements. [Report](../docs/results/variant-2.md).

`final/` contains selected-policy results. `comparisons/` or `studies/` contains controlled or bounded run comparisons. `replays/` contains the gallery index and common-map measurements; it is separate from policy benchmark results.

Historical source files remain byte-preserved in `.archive/results/`. Their embedded paths describe the original working layout. [archive-index.json](archive-index.json) maps old tracked locations to the organized repository and records their hashes. Original working checkpoints and non-public native snapshots are not reconstructed or modified by this layout change.
