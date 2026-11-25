# Gameplay media

Every preview is recorded from saved project networks in the original Three.js world. The videos use the same actions and simulation as the replay viewer. Chickens retain their last deliberate facing direction while a log carries them, and the visual train light switches off when the rendered train clears the crossing. These presentation changes do not alter physics, network observations, or recorded results.

GitHub GIFs run at **1× simulation speed**. Generations 1 and 5 show their complete opening replays; later highlights show 15-second excerpts around early crossings. Each displayed high score describes the complete saved population on its linked map, rather than the excerpt's final row. Website highlight videos contain complete Auto runs.

Main and bloodline GIFs retain normal-speed score windows. Each bloodline recording samples ten unchanged networks from every one of its variant's 150 gallery populations, for 1,500 chickens on one map. The camera follows the densest group within ten rows of the leading living chicken and renders that group solid white. Variant 2 uses map 318 around rows 25–125, with logs beginning at 26 and trains at 31.

[Variant 1 timing and sources](timing.json) · [Variant 2 timing and sources](variant-2-timing.json) · [Recording workflow](../README.md#media-and-deployment) · [Visual attribution](../ATTRIBUTION.md)

The homepage starts only visible recordings, prioritizing the current section on phones. Both bloodline videos can play together when fully visible; the second starts after the first has buffered. Wider screens allow two visible previews. Other videos pause when they leave view; distant sources are released. Only the next nearby main preview warms its metadata. Phone-sized H.264 copies preserve each recording’s timing and frames while reducing transferred bytes; [encoding details](mobile-previews.json) list dimensions, sizes and hashes. If a browser declines autoplay, the preview offers a tap-to-play control.
