# M0 audit

Reference: EvanBacon/Expo-Crossy-Road commit 6f2e84e580c9c8f2b432aa365f706d45d96d8bc9, cloned into ignored `.reference/Expo-Crossy-Road` (preserved intact).

Inspected CrossyGame.ts, GameEngine.ts, CrossyPlayer.ts, Row/{Road,RailRoad,Grass}.ts, Models/ModelLoader, asset inventory, README, package and license. Original launch attempted with `npm start -- --web --non-interactive`: fails `sh: expo: command not found` because dependencies are absent. Installing the whole Expo/native stack is unnecessary for the requested migration; no original runtime screenshot captured.

Preserve: orthographic follow camera, voxel chicken, thick grassy platforms, sparse trees/boulders, opposing traffic, multiple vehicle lengths, rails and warning lights, one-tile 0.2s hops, blocked movement. Rewrite: frame-based car additions, Math.random terrain, renderer-owned collisions, GSAP movement, timer-driven warnings, menus/mobile/audio/water. Existing road motion ignores dt; trains skip collisions while moving. These are unsuitable for headless learning.

Source code MIT copyright Evan Bacon retained in EVAN_BACON_LICENSE.txt. README explicitly describes copyrighted work and educational use; no clear independent redistribution grant for all artwork. The reference assets remain isolated and ignored. Production uses original procedural voxel geometry through visualization/three/assets.ts, a replaceable asset factory. No original OBJ/PNG, branding, or audio is bundled. Appearance is inspired rather than asset-identical. No affiliation with Hipster Whale or Evan Bacon.


## Visual-layer revision requested by the user

The user subsequently required the original repository’s visuals rather than replacement models. The local viewer now directly loads verbatim assets from `public/upstream/` and ports the reference camera, lighting and HUD. The initial replacement-asset decision above records the first implementation, not the current asset inventory. Core/evolution files were left unchanged. See ATTRIBUTION.md for current provenance and local-use caveats.
