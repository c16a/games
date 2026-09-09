# Add Snake to Happy Arcade

## Goal

Add a cheerful, touch-friendly version of classic Snake. Players collect snacks while planning a safe path around their growing tail. Run entirely in the browser with no accounts or remote services.

## Player experience

- Add a **Snake** card to the picker with a **Reflexes** badge and a short, playful description.
- Open on a visible 16 × 16 board with brief instructions and a **Start** button. Start with a centered, three-cell snake facing right.
- Support swipes on the board, four large on-screen direction buttons, and arrow keys or WASD.
- Offer **Easy**, **Normal**, and **Fast** speeds before starting: one movement step every 220, 150, or 100 milliseconds respectively. Keep speed constant during a round.
- Show score and the best score for the selected speed on this device. Award 10 points for each snack.
- Include **Pause / Resume**, **New game**, and navigation back to the picker. New game returns to the ready screen with the selected speed retained.
- Automatically pause when the page becomes hidden or the window loses focus; require an explicit resume so returning players are not surprised.
- Show a friendly result after a collision and celebrate when the snake fills the board. Offer replay and return to the picker.
- Store only best scores in `localStorage`; continue playing normally if storage is unavailable.

## Rules

- Advance exactly one grid cell per simulation step in the current direction.
- A snack grows the snake by one cell. Place the next snack uniformly among unoccupied cells using injectable randomness.
- Hitting a wall or the snake's body ends the round; walls do not wrap.
- Reject a direct reversal into the neck. Buffer at most two valid turns, validating each against the last accepted direction, and consume at most one turn per step. Repeated keydown events must not fill the queue.
- Moving into the current tail cell is legal when the tail moves away on that step; it is a collision when that cell remains occupied.
- A full board is a win. Do not attempt to spawn food when no empty cells remain.
- Pause freezes simulation and clears pending turns. Resume resets the timing baseline so paused or background time never causes a burst of movement.
- Ignore gameplay input before starting and after the round ends.

## Interface and accessibility

- Match Happy Arcade's playful style using readable controls and clearly distinct snake head, body, and snack shapes. Do not use color alone to distinguish them.
- Keep the board and controls usable at 320px wide without horizontal scrolling. Scale the display without changing grid coordinates or game state.
- Capture swipes only within the board; retain normal page scrolling elsewhere and the site's existing double-tap behavior.
- Use semantic buttons, accessible names, visible focus states, and comfortably tappable targets. Handle movement keys only while this game is active and do not intercept keys intended for unrelated controls.
- Provide accessible board instructions and announce starts, pauses, results, and score milestones without announcing every movement step.
- Respect `prefers-reduced-motion` by disabling decorative effects while retaining the essential snake movement. Avoid flashing effects.

## Architecture

- Put the module in `src/games/snake/` and export `mount()` implementing the `GameModule` contract from `src/platform/game.ts`.
- Register the card and dynamic loader in `src/main.ts`; preserve all existing game entries and load Snake only when selected.
- Use browser APIs and TypeScript with HTML/CSS or Canvas 2D rendering. Do not add a game engine or dependencies.
- Separate grid simulation, input queue validation, collisions, spawning, and scoring from rendering. Accept explicit elapsed time and injectable randomness for deterministic tests.
- Own the movement loop within the mounted instance. Remove all event listeners, pending timers, and animation frames in `destroy()`, including window and document listeners.
- Follow the repository's Bun commands and contributor instructions.

## Tests

Add focused Bun tests for:

1. Initial snake placement, ordinary movement, and constant length without food.
2. Eating food, growth, and score increments.
3. Direct reversal rejection and two rapid valid turns executing on separate steps.
4. Wall and body collisions, including the vacating-tail exception.
5. Food spawning only in empty cells with deterministic random input.
6. A full-board win without a spawn loop or invalid food position.
7. Paused and terminal states ignoring simulation updates; resuming without catch-up movement.
8. Restart resetting the board, score, pending input, and timing state.

## Acceptance criteria

- Snake is independently accessible from the picker and directly through its hash route.
- Players can start, steer, eat, pause, resume, lose, replay, and fill the board to win with the rules above.
- Touch, on-screen controls, and keyboard all control the same game logic reliably.
- Best scores remain separate by speed and survive reload; storage failure does not prevent play.
- Navigation away and reopening leave only one active game loop and no stale input handlers.
- `bun test` and `bun run build` pass.
- Exercise the flow in a browser on desktop and at a 320px mobile viewport, including input, pause, restart, navigation cleanup, and absence of horizontal scrolling. Record any touch-device verification limitations honestly.
