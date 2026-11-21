# Variant 2 — trains

**Prepared; training has not started.**

Add rail lanes, warning lights and fast trains to Variant1. The engine already supports these mechanics through `curriculum: "trains"`; existing smoke tests do not establish a trained result. Keep at most three consecutive road lanes initially. New runs also use the [eagle rule](../EAGLE_RULES.md): 10 seconds without a new highest row is fatal, with a warning after 7 seconds.

Next: use the frozen final Variant1 transfer parent; preserve its exact ancestry; version any sensor changes (version8 currently uses the rail-signal global for action memory); expose inactivity timing without changing old inputs; then train separate populations and evaluate on separate train-enabled development/final maps. Report transfer and fresh-start baselines separately.
