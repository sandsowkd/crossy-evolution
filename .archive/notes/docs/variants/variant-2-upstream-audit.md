# Variant 2: pinned upstream river and train audit

> Implementation update: the original-asset port is now implemented and covered by source differential tests. The user subsequently requested custom train schedules, river limits, log speed/direction constraints and guaranteed center lily pads. Those versioned rules are described in [Variant2](variant-2.md); the audit below describes the pinned source, not the customized distributions.

Audited 2026-11-21 against the clean local reference at **EvanBacon/Expo-Crossy-Road commit `6f2e84e580c9c8f2b432aa365f706d45d96d8bc9`**. This is a source/geometry audit and port specification, not a claim that the new simulator already passes upstream differential fixtures. No training was run for this audit. The current-core comparison uses the Variant 1 final implementation at `8ce0a0559c7c323d0f59d68cdd258d9e488b9708`.

The repository implements both moving logs and static lily pads, plus trains with warning lights. Its rules are different from Crossy Evolution's existing `curriculum: "trains"`. Reusing the artwork while retaining those existing train speeds, lengths, scheduling, and collisions would not reproduce the supplied repository's mechanics.

## Source map

All upstream links below are immutable commit links:

- [Water row: generation, movement, support, drowning][water].
- [RailRoad row: train, collision, lights][rail].
- [Train assembly][train], [Log registration][log], [LilyPad registration][lily], [TrainLight registration][light].
- [River floor registration][river] and [rail floor registration][railnode].
- [GameMap, pooled rows, row selection and adjacency][game].
- [Engine tick, movement input, bounds and score][engine].
- [Player hop animation, riding and reset][player].
- [GameSettings][settings], [asset paths][models], [generic OBJ loading and model choice][generic], [texture/material setup][material], [procedural foam][foam].

The `Node/*` files register and clone meshes. Gameplay is primarily in `Row/Water.ts`, `Row/RailRoad.ts`, `GameEngine.ts`, and `CrossyPlayer.ts`; copying only the Node files would leave the mechanics unported.

## Common coordinate, time, and update rules

[GameSettings lines 1–12][settings] specifies `groundLevel=0.4`, `startingRow=8`, `maxRows=20`, `disableDriftwood=false`, `BASE_ANIMATION_TIME=0.1`, and camera easing `0.03`. [GameEngine setup lines 50–54][engine] passes **heroWidth=0.7** to every row. Upstream world `z` increases forward. Swipe left adds **+1 world x** and swipe right adds **−1 world x**. The existing browser adapter mirrors logical x; any direct port must apply that transform consistently to speed, meshes, observations, riding and input.

The engine runs one physics update per `requestAnimationFrame`, passing `Date.now()` as `dt`; water and rail ignore `dt`. Thus **0.8 means units per frame**, not units per second. At a declared canonical 60 Hz it corresponds to 48 units/second, but upstream behavior varies with actual render rate. GSAP hops and `setTimeout` lights use elapsed wall time independently of physics frames. A renderer-independent deterministic port therefore needs an explicit fixed-time convention; exact equivalence across all upstream frame rates is impossible. See the fixture plan below.

[CrossyGame tick lines 226–235][game] updates **all active rails, then all roads, then all water rows**, in pool-array order. [Engine tick lines 135–145][engine] then moves an idle rider by its platform speed, applies carried-car movement, checks bounds, and follows the player with the camera. Maintain this ordering, including the landing/idle transition boundary.

[PlayerPositionAnimation lines 51–76][player] uses two sequential 0.1-second GSAP tweens: initial→75% of the horizontal/forward displacement while rising to targetY+0.5, then →100% while descending. It is not the current simulator's linear 12-tick trajectory. New input calls `skipPendingMovement()` and snaps an in-progress hop to its previous target before starting another hop; a fixed one-decision-per-0.2s training interface is a documented input restriction. `WAIT` is absence of a new swipe, not an upstream fifth movement command.

## Rivers: exact algorithms and edge behavior

### Row choice and platform generation

[Water generate and parity, lines 23–35 and 189–192][water]: an **even absolute world-z row** is static lily pads; an odd row is moving logs unless driftwood is disabled. When the logical agent starts at zero but the visual world starts at eight, the parity offset must remain explicit (eight itself preserves parity).

Static generation ([lines 43–104][water]):

1. Draw `numItems=floor(random()*2)+2`: **2 or 3 pads**.
2. Draw initial integer x `floor(random()*2−4)`: **−4 or −3**.
3. Push the current x for each pad and increment by `floor(random()*2+2)`: **2 or 3**. The final unused increment still consumes a random draw.
4. If a preceding grass row supplied clear integer columns and no pad is in that set, replace `positions[0]` with one randomly selected clear column, then sort. Store the integer positions for the next grass row. This is a local adjacency repair, not a proof of globally solvable river sequences.
5. Clone the sole pad model through `getRandom()` (which still consumes a random draw), calculate `width=round(Box3 x span)`, and give each pad `top=0.2`, `min=0.01`, `mid=0.125`, `dir=0`, initial mesh y=0.125 and speed=0.
6. Animate pad y-rotation toward a random value in [0.5,2) over [2,4) seconds, yoyo/repeat forever with Power2 ease. These draws affect the upstream global random stream although they are cosmetic.

Dynamic generation ([lines 107–143][water]):

- One shared speed magnitude per row: **`random()*0.05+0.02` units/frame**, [0.02,0.07), or [1.2,4.2) units/second at canonical 60 Hz.
- **2 or 3 logs**, shared direction +1 unless a random draw is >0.5, then −1.
- First log x=−6×direction. Each next log starts another `(random()*3+5)×−direction` away: spacing [5,8). Each log independently selects model 0–3 uniformly through `Generic.getRandom()`.
- Each log has `top=0.3`, `min=−0.3`, `mid=−0.1`, initial mesh y=−0.1, and signed speed. No direction rotation is applied; that line is commented out.
- As with static generation, retain the trailing unused spacing draw in a literal random-tape port.

Each active water frame moves every entity by signed speed first, then uses **strict** `x>11` for right-moving wrap to −11, or `x<−11` for left-moving wrap to +11 ([lines 194–218][water]). Excess distance is discarded; this is a teleport, not a modulo retaining overshoot. That difference matters at the wrap boundary.

### Landing, carrying, and drowning

Both logs and pads use the same support half-width:

```text
collisionBox = 0.7/2 + round(original OBJ x span)/2 − 0.1
supported iff platformX−collisionBox < playerX < platformX+collisionBox
```

Equality is unsupported. `Math.round(player.z) === row.z` selects the water row. No separate z-extent, y-height, swept collision, or full-body containment is tested. [Water lines 255–290][water] supplies these exact tests.

[Water update lines 194–205][water] attempts attachment and drowning only when **`!player.moving && !player.ridingOn`**. It loops all entities without breaking: in overlapping support intervals the **last matching entity** becomes the rider. In contrast, the target-height helper `getCollisionLog()` returns the **first** match. The two choices need separate fixtures.

On attachment it sets `ridingOn`, records `ridingOnOffset=playerX−platformX`, and starts the bounce. [Player moveOnEntity lines 107–114][player] does **`player.x += ridingOn.speed` while idle**, and updates `initialPosition.x`; it does not recompute x from platform position+offset. `ridingOnOffset` is not subsequently used to carry the player. Rider attachment is not revalidated each frame, so a log's ±11 teleport does not teleport or detach its rider. The player continues drifting and may cross the ±5 bounds.

[Engine movement lines 188–205][engine] clears `ridingOn` at the start of **every** swipe before direction handling. Up/down always `Math.round(targetX)` ([lines 243–320][engine]); the later floor/ceil-by-rider-direction branches see the already-cleared reference during ordinary calls. Horizontal steps preserve fractional x. Do not silently restore the apparently intended floor/ceil behavior if compatibility with this commit is the requirement.

The engine chooses water target height using the platform's **current** x at input time, despite the comment saying prediction: supported targetY=`top+mid`, otherwise `sin(sineCount)*0.08−0.2` ([Engine lines 336–349][engine]; [Water lines 221–235][water]). Actual attachment happens on an idle update after the moving flag clears. While hopping, water neither attaches nor drowns the player. On an unsupported idle frame it calls `onCollide(floor,"water")`. After death, the visual body bobs, rotates by +0.01/frame, and drifts by the first platform's speed ([Water lines 238–250][water]).

Bounce timing is 0.18s down, followed by 0.2s back up beginning at 0.2s. A pad/player settles at 0.125/0.325 and a log/player at −0.1/0.2. These are visual heights; support remains the x/rounded-z test. Foam uses two procedural emitters at x±4.5, y0.2, z−0.5, six white plane particles each; there is no foam texture to fetch.

## Trains: exact algorithms and edge behavior

### Assembly, length, placement

[Rail constructor lines 20–50][rail] calls **`Train.withSize(random()*2+1)`** once when the pooled rail object is constructed, sets **speed=+0.8 units/frame**, and uses the same hero-width collision formula as water. There is no randomized train direction or speed in normal gameplay. The negative-speed branch exists but is not selected by construction.

[Train.withSize lines 13–35][train] adds the front at x0, sets offset to its rounded x width, loops `for(i=0; i<size; i++)`, adds a middle at offset, increments by its rounded width, then adds the back. Because size is a floating point number in [1,3), the loop normally creates **two or three middles**, not one or two. Exactly random=0 yields one middle; exactly random=0.5 yields two. This boundary deserves a fixture. The group is **not centered or scaled**.

Measured directly with the installed Three.js 0.182.0 `OBJLoader` and `Box3`, from the pinned OBJ files:

| Object | Original x span | Rounded width | Support/collision half-width |
| --- | ---: | ---: | ---: |
| Log 0 | 1 | 1 | 0.75 |
| Log 1 | 2 | 2 | 1.25 |
| Log 2 | 3 | 3 | 1.75 |
| Log 3 | 3.875 | 4 | 2.25 |
| Lily pad | 0.5 | 1 | 0.75 |
| Train front | 4.875 | 5 | — |
| Train middle | 4.5 | 5 | — |
| Train back | 4.875 | 5 | — |
| Train with 1 middle, rare exact-zero draw | 14.875 | 15 | 7.75 |
| Train with 2 middles | 19.875 | 20 | 10.25 |
| Train with 3 middles | 24.875 | 25 | 12.75 |

Train front bounds are [−2.4375,+2.4375], middle bounds [−2.25,+2.25]. A two-middle group spans **[−2.4375,+17.4375]**, a three-middle group [−2.4375,+22.4375], relative to the group's position. The upstream collision nevertheless centers its full rounded width at **group.position.x**. This creates a substantial visual/collision offset; preserving the source means retaining it, not recentering its mesh or hitbox. Train mesh y=0.4 and local z=0.1. Track top is 0.5. Lights sit z=−0.5 rotated by π.

### Movement, signal and collision

[Rail drive lines 80–103][rail]:

1. Add +0.8 to train group x each active frame.
2. If x>**110** (`22*5`), teleport x to −110, start the light ring, play the first train pass sound, and skip collision that frame. A symmetric negative branch exists.
3. Otherwise check collision **only if the player is not moving**.

From reset x=0, first wrap is update138 under repeated JavaScript +0.8. From exact −110 after a wrap, repeated +0.8 requires update276 to exceed +110 due to floating point accumulation; an idealized 220/0.8 period or closed-form modulo does not preserve these states. Use the source recurrence and verify the transition with a differential fixture. At canonical 60 Hz the recurrent sweep takes about 4.6 seconds.

[Rail collision lines 106–147][rail] requires `Math.round(player.z)==row.z`, alive, and the **strict** centered x inequality with half-width10.25/12.75. It is not swept. The method contains an airborne hit reaction, but the regular caller's `else if (!moving)` makes that inner moving branch unreachable. Normal collision squashes the player and calls `onCollide()` without a train argument/tag; the engine's special train death audio branch consequently is not selected by this normal path. A headless `deathReason:"train"` can accurately classify the physical cause while acknowledging this metadata repair.

[Rail lights lines 152–175][rail]: wrap invokes `startRingingLight()` immediately; ringCount starts at0, the inactive model is hidden, and active A/B alternate every **200ms**, with the first toggle immediate. There are **15 toggles**, then the inactive model returns at3000ms. First phase is A on/B off. No light starts merely because a train approaches; first activation at x0 has no warning. The literal alarm playback is commented out. `IS_MUTED=true` is unused; it does not suppress the pass sound.

## Map/lifecycle integration that affects fidelity

[CrossyGame lines 207–223,253–341,344–385][game] preconstructs **20 objects of each row kind**. The first ten absolute rows are forced grass; initial player is at8. Thereafter random rowKind is uniform `grass`, `roadtype`, `water`; `roadtype` chooses rail with probability1/4, otherwise road. Thus the unconstrained nominal rates are 1/3 grass,1/3 water,1/12 rail,1/4 road. There is **no three-road maximum**, every-fourth-row grass rule, or global safe-route proof.

If grass follows water, all prior static pad columns are excluded from obstacles. If static water follows grass, it receives clear columns from x−4…4 to perform the local repair above. Dynamic water stores an empty pad list. The grass generator always leaves x0 free, unlike the existing winding-road curriculum, and its purported `Fill.empty` mode still passes through the random obstacle path ([Grass lines 72–99][grass]). Treat these as source behavior, not guarantees implied by comments.

Road generation and its random vehicle models occur in the row **constructor**, not on every reuse; rail length likewise is constructed once. `newRow()` repositions and activates a rail but **does not reset train x or its light timer**. Already active pooled rows continue updating out of view. `init()` marks all rows inactive but does not reset existing train positions, log counters, or pending wall-clock light timers. Accordingly, exact long-session reuse and restart behavior cannot be reproduced from `(seed,row,tick)` alone without activation/pool/session state. A clean deterministic episode reset is a sensible versioned rule, but is a difference from reusing the same upstream Engine object.

New rows are created according to camera-follow progress, not immediately from integer player progress ([Engine forwardScene lines107–121][engine]). Grass obstacle lookup uses bitwise truncation `position.x|0` / `position.z|0`, which differs from rounding for negative fractional rider positions. Bounds death occurs only during idle updates at x<−5 or x>5; equality survives. [Engine score lines183–185][engine] reports max(floor(z)−8,0), and [app score handler lines130–133][app] only accepts increases, preserving maximum progress.

## Differences from the pre-port Crossy Evolution core

The comparisons below describe [world.ts][coreworld], [simulation.ts][coresim], [collision.ts][corecollision], [types.ts][coretypes], and [the asset adapter][coreassets] at the frozen Variant 1 final commit. Later implementation work should retain the old configuration's behavior so the archived Variant 1 checkpoint still replays identically.

| Area | Pinned upstream | Existing core/adapter |
| --- | --- | --- |
| River state | Water rows, pads/logs, fractional rider x, attachment, drowning | No water row, platform or water death type |
| Rail frequency | 1/4 of `roadtype`; lifecycle-generated pooled row | A seeded chance only at indices `index%4==2`; mandatory grass every4th row |
| Train speed/direction | +0.8/frame, normally +48/s at60Hz | Signed15–23/s ×difficulty |
| Train length/origin | 20/25 rounded units; uncentered original assembly | Random4–7 units; three centered pieces scaled to fit |
| Train schedule | Incremental x recurrence; strict±110 teleport; state survives pool reuse | Closed form from tick, x start−80, randomized8–12s period and phase |
| Signal | 15×200ms starting at wrap; first pass no ring | Enter/exit window with randomized1.6–2.4s lead time |
| Collision | Strict x overlap; rounded-z equality; rail/water skip moving player | Inclusive swept point/AABB with x padding0.22 and row extent0.61, including airborne movement |
| Hop | Two eased0.1s segments; input can snap previous hop | Linear12-tick path; actions every12ticks |
| Bounds | Idle x outside±5 ends game; grass walls usually limit±4 | Target x outside±4 dies immediately |
| Randomness/map | Global Math.random, adjacent-row repair,20-slot lifecycle | Pure seeded row generation plus96-row cache |
| Eagle | Absent in the upstream source | New runs explicitly use600-tick/180-warning rule |

## Direct-port plan and acceptance evidence

1. **Freeze rules and provenance.** Add an explicit mechanics version identifying this commit and a separate environment containing both water and rails. Keep historical roads/trains configs unchanged. Decide whether Variant2 is the two faithfully ported subsystems on the existing road curriculum or the full upstream map/physics; label the first a hybrid rather than asserting full-game equivalence. Eagle remains an explicit project addition and must appear in run metadata.
2. **Port arithmetic, not renderer dependencies.** Store platform kind/model ID, rounded source width, signed per-frame speed, current x, row, attachment ID and rider state as numbers. Keep rail rounded width, middle count, asymmetric mesh offsets, accumulated x, active status, ring toggle phase/deadline and pool identity. Use fixed60Hz ticks and a simulated light clock; perform literal `+=speed` and strict threshold teleports. Avoid a closed-form motion rewrite until bitwise fixtures prove it equivalent.
3. **Preserve observable quirks.** Keep strict overlap, last-support attachment vs first-support height, idle-only water/rail checks, no collision on a rail wrap frame, rounded vertical target x, detach-before-direction behavior, and origin-offset train collisions. Port the original assembly without length fitting. Make any later bug fixes a new mechanics version.
4. **Handle random draws deliberately.** Use injectable random tapes for source fixtures, including `getRandom()` for one pad variant and unused final spacing draws. Separate cosmetic RNG in the production simulator and serialize seeded gameplay RNG; this changes coupling to upstream foam/tween random draws, so report deterministic reproduction of specified generation algorithms rather than arbitrary upstream sessions. Exact upstream-session reproduction requires recording the original global draw/timing stream.
5. **Prove individual mechanics against pinned source.** Run the actual row methods through an adapter with original OBJ-derived dimensions, model/tween/audio stubs and an injected tape/clock. Compare source and headless traces for random boundaries0/0.5/near1; all log variants; lily repair/no-repair; ±11 exact/wrap; train first/recurrent wrap; all15 light toggles; equality vs epsilon support edges; rounded-z boundaries; overlapping supports; moving vs idle rail contact; unsupported landing; rider drift after platform teleport; forced pool reuse; and restart. Compare every position/state/death/callback and random draw count. Do not only test a second handwritten copy of the port's formulas.
6. **Prove complete execution.** Add renderer-free fixed-seed episode and checkpoint/replay continuation tests spanning river landings, riding, drowning, rail warnings/collisions and eagle deadline. Compare real browser/native inference and full state at a generation boundary. Include held-out maps and script baselines, but do not use held-out outcomes for selection. Warm and scratch runs must share the exact mechanics/configuration/selection-map budget and have separate ancestry/results/checkpoints.
7. **Version observations before training.** Existing658 inputs have no water/support channel; version8 also reuses the old current-signal global as action memory. Add explicit water/support and warning information with a new sensor version and a deterministic transfer mapping (old weights preserved for matching semantics, new channels initialized transparently). Supply the same observability to fresh and transfer agents. Use observations only; no hidden action shield, scripted rescue or future-map oracle.

A claim such as “same logs and trains as the pinned repository at fixed60Hz” becomes justified only after the source differential traces and full replay tests pass. Replacing wall clocks and global cosmetic randomness is necessary for accelerated headless training; retaining the original frame arithmetic and documenting this time convention keeps that change reviewable.

## Exact local asset integrity

The source registrations are in [Models lines23–112][models] and their corresponding Node classes. All **26 OBJ/PNG files below** were SHA256-checked against both the pinned reference and local `public/upstream/` on2026-11-21; all also match [visual-source-manifest.json](../visual-source-manifest.json). They already exist locally, although the current renderer does not yet register river/log/pad descriptors. The new renderer should load the exact models rather than regenerate approximate geometry. This audit does not add or publish artwork. Follow the existing [attribution/local asset policy](../ATTRIBUTION.md) and pinned fetch workflow.

Paths below are relative to upstream `assets/` and local `public/upstream/`:

```text
9c6085d63d7364a786f8af5e2f935956693958ebc9a3bcc6f04c26ccbf406a77  models/environment/log/0/0.obj
a2d243625c1f56c3b26f101d2ce68be97a332cec255f2b7fee0910c93407c1aa  models/environment/log/0/0.png
a4c7d46af0c7138f6dabed7c7220721b4f279f788e3bd1c195a7e08e19073837  models/environment/log/1/0.obj
9f8bb505fae5547448f82bb10d3b35456af2d9ea67e0fc6ca1f2162935198119  models/environment/log/1/0.png
0923609a88d73fc7adc5f531e33dcbae7f66ebecdbe2583656965b7b28d2e1b7  models/environment/log/2/0.obj
c84cf6a6100be3b5a12cc3654aa1368051d828a6b9860eb735a1189caa8df5a9  models/environment/log/2/0.png
8264499f94eac7013b577fe54ccc4378ad32b0af3b8cf7aae13389e8f3a116aa  models/environment/log/3/0.obj
faf49aecb03c3b0027263916ae7986efe58e936de3f240f42f026a3df6212b34  models/environment/log/3/0.png
f6cb007e347dc22e128da5ad11de5a3064455457987c558a4f9bbb132134052a  models/environment/lily_pad/0.obj
168ef35e96c37e667aeec7d15f277cce6ac4ecb1c3958d0e4a192e64d8db5cff  models/environment/lily_pad/0.png
63dd407670686c7590e77fd5f7cb70d970f54c61f2ea9c44f59b4a942334d9b9  models/environment/river/0.obj
dce9aa044683f4895d2244c1cf204cb102c627a449610c748bdc68e98906217e  models/environment/river/0.png
54faa74e1ec449f2ebf945f0404d637d1be37dd5189288a75d5b3b2da262083d  models/environment/railroad/0.obj
b3cd42dfcd28e9c13cec10bb62cfc1f36cb6325e809fa9e067716bb0035ff204  models/environment/railroad/0.png
00b0451f64b2ebb22fe27cec51d08217f96864f17dcd4de94e1da4ade16a7485  models/environment/train_light/active/0/0.obj
b73536a7911b95bfbe83b995f8501d9e44ed45e162a752df937a0d059e8f555c  models/environment/train_light/active/0/0.png
88de0d756ed66090b7e979767beac2b12515ed5446d3851411e18fe75068e961  models/environment/train_light/active/1/0.obj
8ede342e65aa1c61588a0854c89509828e8b4ce6aa1f1e7f8a01b53310434ace  models/environment/train_light/active/1/0.png
ae8e5a509c7ef11ceae802841fe6bc6848cb2e909c924e869f7c401890b90ab0  models/environment/train_light/inactive/0.obj
aee87d1d790ec083f09f8cf34b922f41545902ec71b8fe3e592f4904ac1d6681  models/environment/train_light/inactive/0.png
d716e8b3fb8bb6fb2e293fa284ccce1fc122a338fb21a78efa32364a8e695250  models/vehicles/train/back/0.obj
df9ff61943797cb04ccea2db74d0f7b947756da3a88e476d8a1457498938697a  models/vehicles/train/back/0.png
55a715ca11c359ff2402aee5d005b71cf2d37df7eff8cc65425730c5ef08a468  models/vehicles/train/front/0.obj
bac01b15bace8f79507b005bee582e36def618169918eb806ff352e20548b253  models/vehicles/train/front/0.png
f861fec148dbb58f90318907d9a3fdf1598fc5f66335efa13ae12432b3c0fc46  models/vehicles/train/middle/0.obj
d37df12f05a03ee19ddbeaddf4d22f0f88fa1e0afaeb9eeec6bbd9aa305517fa  models/vehicles/train/middle/0.png
```

If sound is ported, these are the exact source audio hashes. `train_pass_no_horn.wav` and `watersplashlow.mp3` have active source call sites; `trainsplat.wav` belongs to the special tagged train-collision branch; the alarm call is commented out and the shorter pass sound is registered but not chosen by normal rail driving. No audio is currently loaded by Crossy Evolution.

```text
4b47f71296dffe41bcd00c2d523cc34f2b0b6e41e48451e64ffeb87ba4752d3a  audio/train_pass_no_horn.wav
ecb5c1866b14034fea7aee8b5a3e1bbe7ccbedd669e91d878359339ffae6aeb4  audio/train_pass_shorter.wav
55c04330b6937374869ddde253bee8c8628fe06ea0770af8fb955c3c9f497055  audio/trainsplat.wav
16f7c96b6d178a1d4725f55c12df72e4b3d46131f89970de3afebff2ce0d6873  audio/Train_Alarm.wav
94fcb52be92e004b3817bae8898ef7bc3b0cd944e3fbcacd9ce289649517412a  audio/watersplashlow.mp3
```

[water]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/Row/Water.ts
[rail]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/Row/RailRoad.ts
[train]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/Node/Train.ts
[log]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/Node/Log.ts
[lily]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/Node/LilyPad.ts
[light]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/Node/TrainLight.ts
[river]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/Node/River.ts
[railnode]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/Node/RailRoad.ts
[game]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/CrossyGame.ts
[engine]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/GameEngine.ts
[player]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/CrossyPlayer.ts
[settings]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/GameSettings.ts
[models]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/Models.ts
[generic]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/Node/Generic.ts
[material]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/CrossyMaterial.ts
[foam]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/Particles/Foam.ts
[grass]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/Row/Grass.ts
[app]: https://github.com/EvanBacon/Expo-Crossy-Road/blob/6f2e84e580c9c8f2b432aa365f706d45d96d8bc9/src/app/index.tsx
[coreworld]: https://github.com/sandsowkd/crossy-evolution/blob/8ce0a0559c7c323d0f59d68cdd258d9e488b9708/src/core/world.ts
[coresim]: https://github.com/sandsowkd/crossy-evolution/blob/8ce0a0559c7c323d0f59d68cdd258d9e488b9708/src/core/simulation.ts
[corecollision]: https://github.com/sandsowkd/crossy-evolution/blob/8ce0a0559c7c323d0f59d68cdd258d9e488b9708/src/core/collision.ts
[coretypes]: https://github.com/sandsowkd/crossy-evolution/blob/8ce0a0559c7c323d0f59d68cdd258d9e488b9708/src/core/types.ts
[coreassets]: https://github.com/sandsowkd/crossy-evolution/blob/8ce0a0559c7c323d0f59d68cdd258d9e488b9708/src/visualization/three/assets.ts
