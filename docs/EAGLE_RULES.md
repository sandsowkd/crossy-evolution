# Eagle and inactivity

New browser training, fresh `train`/`train:long` runs, eagle transfer branches, manual play and the Variant 2 preset enable the eagle. Reach a **new highest row within 10 simulated seconds** or die. A warning and circling eagle appear after 7 seconds; at 10 seconds it swoops down and carries the chicken away. These are this project's chosen timings.

Waiting, blocked hops, sideways movement and returning to a previously reached row do not reset the deadline. Only a fully completed, surviving hop to a new best row does. A collision on the deadline takes priority; otherwise the eagle wins a simultaneous episode timeout or last-moment progress attempt. Capture is a terminal death, with the same −2 reward penalty as a traffic collision.

The timer lives in the headless simulator at 60 Hz. Pausing playback/training does not consume game time. Replays and checkpoint continuation reproduce its outcome. Renderer animation cannot change it. The voxel eagle is original geometry; the source asset set has no eagle model.

Historical Variant 1 checkpoints omit `simulation.eagle` and retain their exact original rules. `CURRENT_CONFIG` and fresh trainer defaults explicitly enable `{ afterTicks: 600, warningTicks: 180 }`. Importing/viewing an archive preserves its rules. The browser's **Train eagle transfer +5** starts a newly labelled branch from the saved population, resets branch generation counting and keeps historical reports separate. It is not a claim that the old score was earned under the harder rules.

The archived mean-score experiment drivers retain their explicit historical configurations for reproducibility; they are not the entry points for the next training phase. Native checkpoint resume also retains saved rules. New variant training needs newly declared development/final suites; the completed Variant1 tests must not guide its selection.

Use **Evolution controls → Watch with eagle** to replay the current trained chickens under the new rule, or **Play with eagle** for manual play on map42. Arrow keys move; taking no action demonstrates the warning and capture. Both are unassessed demonstrations and start no training. The historical test panel is labelled separately. Current sensor versions remain unchanged; a future learning phase should add a versioned inactivity input before comparing eagle-trained policies.
