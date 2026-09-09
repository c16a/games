# Endless Space Shooter

## Goal

Create a portrait-friendly, endless space shooter for Happy Arcade. The pilot earns points by shooting down enemies and upgrades their plane through sustained play. There are no campaign stages or final level.

## Endless play and scoring

- Enemies continue spawning while the pilot is alive.
- Award points when the pilot shoots down an enemy, exactly once per enemy destroyed.
- Enemy point values are configurable; larger, tougher enemies should reward more points.
- Keep score separate from pilot progression so the two can be balanced independently.

## Pilot progression

- The pilot begins at plane level 1.
- Destroying enemies advances the pilot toward the next plane level.
- Use geometric progression for the number of additional kills required for each upgrade:

  `killsRequired(level) = ceil(baseKills × growthFactor^(level - 1))`

- `level` is the current plane level, `baseKills` is the requirement for the first upgrade, and `growthFactor` must be greater than 1.
- Proposed starting values: `baseKills = 10` and `growthFactor = 1.5`, giving successive upgrade requirements of 10, 15, 23, 34, and 51 additional kills.
- Track kills toward the current upgrade separately from lifetime kills; carry any excess progress into the next upgrade.
- Every upgrade increases the plane's bolt firepower, firing rate, and health.
- Firing rate must always equal the pilot's current level: `boltsPerSecond = level`.
- Firepower per bolt must always be ten times the pilot's current level: `boltDamage = 10 × level`.
- For example, level 1 fires 1 bolt per second dealing 10 damage; level 4 fires 4 bolts per second dealing 40 damage; level 5 fires 5 bolts per second dealing 50 damage.
- Apply these formulas on every upgrade. Keep health upgrade amounts configurable. Geometric growth applies to upgrade thresholds.
- Proposed health behavior: increase both maximum health and current health by the upgrade's health bonus, preserving existing damage rather than fully healing the plane.
- Show the current plane level, health, score, and progress toward the next upgrade.

## Enemy collisions and pilot health

- Contact with an enemy damages the pilot's plane.
- Smaller enemies deal less collision damage; larger enemies deal more.
- Each enemy type defines its own collision damage and starting health.
- Apply collision damage once per contact event, not once per rendered frame.
- Clamp the pilot's health to zero after damage.
- The pilot dies when health reaches zero. Stop active combat and show the final score with a restart option.

## Bolts and enemy health

- Every enemy has its own current health.
- Every pilot bolt has a firepower value representing its damage.
- Evaluate a hit against the enemy's health immediately before that hit.
- Each hit subtracts the bolt's firepower from the enemy's current health, clamped to zero. Surviving enemies retain the damage for subsequent hits.
- Destroy the enemy when bolt firepower is **greater than or equal to** its remaining health before the hit; equivalently, when health reaches zero after damage.
- Five bolts dealing 40 damage each can destroy five separate enemies with 40 remaining health each, provided one bolt hits each enemy. Firing rate controls bolt frequency, not the number of targets damaged by one bolt.
- That combat example illustrates damage resolution; the level formulas above determine actual firing rate and firepower together.
- Resolve each bolt hit once and award destruction points only once, including when multiple bolts hit in quick succession.

## Enemy difficulty progression

- As the pilot's level increases, enemies become more powerful and more numerous.
- Scale enemy health and collision damage with pilot level, while preserving differences between small and large enemy types.
- Increase enemy spawn frequency and/or wave size with pilot level.
- Keep the exact enemy scaling curves configurable for playtesting; the pilot's firing-rate and firepower formulas remain fixed.
- These changes happen continuously during endless play, without campaign stages or level transitions.

## Controls and presentation

- Portrait-first vertical playfield, with enemies approaching from above.
- Proposed controls: drag to steer on touch screens, keyboard steering on desktop, and automatic firing.
- Make damage, upgrades, and enemy destruction visually clear without relying on color alone.
- Keep primary controls comfortably tappable and layouts usable from 320px wide.
- Respect reduced-motion preferences.

## Architecture

- Use the existing KAPLAY dependency for rendering and gameplay effects.
- Put implementation in `src/games/space-shooter/` and follow the shared `GameModule` lifecycle.
- Keep combat, progression, and scoring logic separate from rendering and testable with deterministic inputs.
- Load the game dynamically from the catalogue.
- Keep play and any personal best on the device; no accounts or remote services.
- Remove listeners, animation loops, canvases, and audio resources in `destroy()`.

## Verification and acceptance

- Verify geometric upgrade thresholds, progress carryover, and all three stat increases.
- Verify different collision damage for small and large enemies, and pilot death at zero health.
- Verify firing rate equals pilot level and bolt damage equals ten times pilot level after each upgrade.
- Test bolt firepower below, equal to, and above enemy health, including accumulated damage from multiple hits.
- Verify five separate 40-damage hits destroy five enemies with 40 remaining health each.
- Verify higher pilot levels produce tougher enemies and more frequent or larger enemy waves.
- Verify one-time scoring for destruction and no duplicate damage from the same bolt.
- Verify endless spawning stops on death and resets correctly on restart.
- Exercise touch and keyboard play, navigation cleanup, and narrow-screen layout in a browser.
- Run `bun test` and `bun run build` before considering implementation complete.
