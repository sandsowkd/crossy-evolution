# Training data release

[Download the final Variant 1 supplement](https://github.com/sandsowkd/crossy-evolution/releases/tag/variant-1-final-2026-11-21): the frozen generation150/genome14920 native checkpoint, all150 complete populations of100, final evaluation and replay verification, lineage, and per-map CSV outcomes. Its independent512-map closing test averages1,361.21 rows, with1,697 median and76.6% scoring at least1000. These are the historical roads-only rules without an eagle; the new inactivity rule is a separate configuration.

The supplement contains a standalone final snapshot (~146MB) and a post-snapshot delta (~327MB). The delta preserves every eligible new or changed training-data file relative to the original release's per-file manifests, including all150 isolated viewer populations. Unchanged historical data remains in the original release below. Both releases exclude reference artwork and local media.

For the final native model alone, download `variant-1-final.tar.gz`, its manifest and `SHA256SUMS`. For the entire historical capture, restore the original release first, then extract both supplement archives into that fresh clone. Verify checksums before extraction; avoid overwriting a directory with newer training. The included `RELEASE_NOTES.md` gives exact paths and restore commands. [Final per-map outcomes](../results/published-variant-1-final-2026-11-21/final-map-outcomes.csv), [development outcomes](../results/published-variant-1-final-2026-11-21/development-map-outcomes.csv), and [lineage metadata](../results/published-variant-1-final-2026-11-21/lineage.json) are also in Git.

[Download the dated snapshot](https://github.com/sandsowkd/crossy-evolution/releases/tag/training-snapshot-2026-11-21). It contains6.31GB in seven archive files, plus file manifests, inventory, restoration instructions and SHA256 checksums. Code, measured SVG charts and CSV summaries are in Git.

| Group | Contents | Download format |
| --- | --- | --- |
| average-runs | All mean-score refinement experiments, exact native states and full populations | Concatenate parts001 and002 |
| other-experiments | Restarts, sensor/trajectory searches, diagnoses, frozen development snapshots and recovery evidence | Single tar.gz |
| historical-and-verified | Initial/continued training, held-out evaluations, frozen models, release verification and older checkpoints | Concatenate parts001 and002 |
| population-galleries | Every captured public full-population replay gallery | Single tar.gz |
| latest-protected-development | Verified generation100 genome9922,1370.984375 development mean; all100 full populations and native state | Single tar.gz |

The first four groups capture local data from November21,2026,12:48:29–12:48:41 PM America/Denver. The last group is a later verification supplement of a policy already present in that capture. It adds no training episodes. Population files, checkpoints, candidate outcomes and inherited training are retained honestly; these overlapping artifacts cannot be summed as independent training.

Download all assets into `downloaded-data/` inside a fresh clone, then follow `RELEASE_NOTES.md` from the release. Verify `SHA256SUMS` before concatenating and extracting. Every archive also has a per-file SHA256 manifest. Extract into a fresh directory to preserve newer training.

The public data contains no reference artwork. Run `npm run setup:assets` for the pinned102-file local download. The existing MIT notices remain included.
