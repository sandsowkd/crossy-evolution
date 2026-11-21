# Training data release

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
