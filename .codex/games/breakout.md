# Add Breakout to Happy Arcade

## Goal

Add a bright, kid-friendly version of classic Breakout. Players move a paddle to bounce a ball and clear a wall of bricks, practicing timing and prediction. Run entirely in the browser with no accounts or remote services.

## Player experience

- Add a **Breakout** card to the picker with a **Reflexes** badge and a short, playful description.
- Open on a playable board with a paddle, a ball resting on it, and five rows of eight bricks. Include brief instructions and an explicit **Launch ball** button.
- Move the paddle by dragging or tapping within the board, mouse movement within the board, arrow keys, or A/D. Also provide large on-screen left and right hold buttons for touch players who prefer them.
- Start with three lives. Award 10 points per destroyed brick and show score, remaining lives, and the device's best score.
- After a missed ball, deduct one life and return the ball to the paddle for another explicit launch. Never launch automatically after a miss.
- Clear every brick to win. Show a friendly game-over result when the final life is lost. Offer replay and return to the picker in either result.
- Include **Pause / Resume**, **New game**, and navigation back to the picker. New game resets bricks, score, and lives and returns to the launch state.
- Automatically pause when the page becomes hidden or the window loses focus; require explicit resume.
- Store only the best score in `localStorage`; a storage error must not interrupt play.
- Keep the first version to one complete board with a single ball and single-hit bricks. Do not introduce power-ups or additional levels.

## Physics and rules

- Use stable logical board coordinates independent of display size, and scale rendering and pointer coordinates to them.
- Clamp the paddle to the board edges. While waiting to launch, the ball follows the paddle.
- Launch upward with a nonzero horizontal component at a fixed, child-friendly speed.
- Reflect the ball at the left, right, and top walls. Crossing the bottom loss boundary consumes exactly one life.
- Bounce a descending ball off the paddle's top surface. Use its impact position relative to the paddle center to influence the outgoing angle, with a maximum of 60 degrees from vertical and a minimum vertical component to avoid flat, endless rallies.
- Destroy a brick on contact, add its score once, and reflect against the collision surface. Handle corner and adjacent-brick contacts consistently without repeated scoring or a ball becoming trapped inside a brick.
- Use a fixed simulation timestep with swept collision detection or bounded substeps sufficient to prevent tunneling through bricks and the paddle at the supported ball speed.
- Freeze physics while paused, waiting to launch, or showing a result. Reset the timing baseline on resume and bound catch-up work after a delayed frame.
- Resizing must preserve the live round, positions, velocities, and score.

## Interface and accessibility

- Match Happy Arcade's playful visual style with clear paddle, ball, and brick boundaries. Make all bricks equally breakable so no rule depends on color alone.
- Keep the board and primary controls usable at 320px wide with no horizontal scrolling. Use a board aspect ratio that leaves room for touch controls.
- Capture touch gestures only on the board and directional controls; retain normal page scrolling elsewhere and the site's existing double-tap behavior.
- Use pointer capture during paddle dragging and clear held controls on pointer cancellation, key release, pause, blur, and navigation.
- Provide semantic buttons with accessible names, visible focus, and large touch targets. Scope gameplay keys to the active game and preserve normal activation of focused buttons.
- Provide accessible instructions and announce life loss, pause, win, and game over. Avoid live announcements on every physics frame.
- Respect `prefers-reduced-motion` by removing decorative particles, screen shake, and transition effects while retaining essential ball movement. Avoid flashing effects.

## Architecture

- Put the module in `src/games/breakout/` and export `mount()` implementing the `GameModule` contract from `src/platform/game.ts`.
- Register its card and dynamic loader in `src/main.ts`; preserve existing game entries and load Breakout only when selected.
- Use KAPLAY for the game loop and canvas rendering, with semantic HTML controls around the canvas. Keep KAPLAY dynamically loaded with the Breakout module.
- Separate simulation state, collision resolution, scoring, lives, and paddle input from drawing. Make physics testable using explicit time steps and deterministic initial conditions.
- Own all animation frames and listeners within the mounted instance. `destroy()` must cancel the loop, remove window/document/pointer/keyboard listeners, release held input, and remove the game surface.
- Follow the repository's Bun commands and contributor instructions.

## Tests

Add focused Bun tests for:

1. Initial bricks, lives, score, and ball attachment before launch.
2. Paddle clamping and pointer-to-logical-coordinate mapping at different display sizes.
3. Wall reflection and preservation of supported ball speed.
4. Paddle bounces at center and edges, including a positive upward component and no bounce from beneath the paddle.
5. Brick removal and exactly-once scoring, including corner and neighboring-brick contacts.
6. Fast movement crossing a brick or paddle within one frame without tunneling.
7. Missing the ball deducting one life and returning to launch state, then ending the game on the final miss.
8. Clearing the final brick producing a win.
9. Pause and terminal states freezing physics; resuming without an accumulated time jump.
10. Restart resetting score, lives, bricks, ball, paddle, and held input.

## Acceptance criteria

- Breakout is independently accessible from the picker and directly through its hash route.
- Players can launch, steer the paddle, break bricks, lose a life, relaunch, pause, resume, win, lose, and replay with the rules above.
- Pointer, touch buttons, and keyboard input work consistently across responsive sizes; resizing preserves the round.
- Best score survives reload and storage failure does not prevent play.
- Navigation away and reopening leave only one active physics loop and no stale input handlers.
- `bun test` and `bun run build` pass.
- Exercise the flow in a browser on desktop and at a 320px mobile viewport, including collisions, touch/pointer and keyboard input, pause, restart, resize, navigation cleanup, and absence of horizontal scrolling. Record any touch-device verification limitations honestly.
