# Variant 3 — rivers, logs and lily pads

**Planned; water mechanics are not implemented.**

Add deterministic rivers, moving logs, stable lily pads, current/carry motion, falling into water, and safe hopping between supports. Implement these in the headless simulator before rendering or training. Add water/support observations under a new version; never reinterpret old checkpoints.

Next: test swept support transitions, log wrapping, mid-hop drowning, bounds and deterministic replays; then train/evaluate on independent mixed road/rail/water maps. Preserve Variant2 as a separate baseline.
