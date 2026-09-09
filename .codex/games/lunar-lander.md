# Add Lunar Lander to Happy Arcade

## Goal

Add a polished, physics-driven Lunar Lander game that runs locally in the browser and loads only when selected from the game picker.

## Player experience

- Fly a lander using left/right rotation and a hold-to-thrust main engine.
- Manage momentum and a finite fuel supply while aiming for a marked landing pad.
- Show altitude, vertical speed, horizontal speed, angle, fuel, score, best score, and mission level.
- Land safely only when the craft is upright, slow, and fully inside the pad.
- Clearly distinguish a successful touchdown from a crash.
- Continue to progressively harder missions with smaller pads and stronger gravity.
- Pause, resume, restart, and exit cleanly.

## Controls and accessibility

- Support arrow keys or A/D for rotation and Arrow Up, W, or Space for thrust.
- Provide large semantic hold buttons for touch and pointer input.
- Pause automatically when the page loses focus or becomes hidden.
- Keep the complete layout usable without horizontal scrolling at 320px.
- Provide accessible control names, status announcements, and a textual flight summary.
- Respect reduced-motion preferences in surrounding UI effects.

## Architecture

- Keep deterministic physics, terrain generation, landing rules, scoring, and lifecycle state in `logic.ts`.
- Use KAPLAY for canvas rendering and its frame loop.
- Dynamically load the game through the catalogue.
- Persist only the best score in local storage.
- Remove all listeners and stop KAPLAY in `destroy()`.

## Verification

- Test gravity, thrust, rotation, fuel, pausing, terrain, safe landing, crash cases, progression, and restart.
- Run the full Bun test suite and production build.
- Exercise flight controls, pausing, result flow, responsive layout, and navigation cleanup in a browser.
