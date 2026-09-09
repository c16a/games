# Add Tetris to Happy Arcade

## Goal

Add a bright, kid-friendly falling-block puzzle using KAPLAY. Players practice spatial reasoning, planning, and quick decisions. The game runs locally with no accounts or remote services.

## Player experience

- Add a **Tetris** card with a **Spatial** badge and direct `#tetris` route.
- Use a 10 × 20 board and all seven standard tetrominoes.
- Support left/right movement, clockwise rotation, soft drop, and hard drop through touch controls and keyboard.
- Show the next piece, a ghost landing guide, score, cleared lines, level, and device best score.
- Increase falling speed as levels rise, with a new level every ten lines.
- Include Start, Pause / Resume, New game, and navigation back to the picker.
- Pause automatically when the page is hidden or loses focus and require explicit resume.
- Store only the best score in `localStorage`; storage failures must not interrupt play.

## Architecture and quality

- Put deterministic board, bag, movement, rotation, collision, line-clear, scoring, level, and timing logic in `src/games/tetris/logic.ts` with focused Bun tests.
- Use KAPLAY for the loop and canvas rendering, dynamically imported from the game module.
- Keep touch targets comfortable, controls semantic, and the layout usable at 320px without horizontal scrolling.
- Respect reduced motion, clean up all listeners and KAPLAY resources in `destroy()`, and keep state intact across responsive resizing.
- Run `bun test`, `bun run build`, and browser QA before completion.
