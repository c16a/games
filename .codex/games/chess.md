# Chess with local AI

## Goal and agreed stack

Add Chess to Happy Arcade with Easy, Medium, and Hard computer opponents. Use **KAPLAY** to render the board, pieces, highlights, and move animations; **chess.js** for rules and legal moves; and **Stockfish** for AI search and evaluation running entirely on the player's device.

This file is an implementation plan. No server-side AI, accounts, or remote move-evaluation service is required.

## Player experience

- Add a Chess catalogue tile and a direct `#chess` route.
- Before a new game, choose Easy, Medium, or Hard and White, Black, or Random. Orient the board with the human player's pieces at the bottom.
- Support tap-to-select then tap-to-move, pointer/touch dragging, and keyboard square navigation and selection.
- Highlight the selected piece, legal destinations, captures, the last move, and a checked king. Use shapes or symbols alongside color.
- Provide a promotion picker for queen, rook, bishop, and knight, including underpromotion.
- Show whose turn it is and a clear thinking indicator while Stockfish searches.
- Provide New game, Undo turn, Resign, and Back controls with accessible names. Confirm abandoning an unfinished game.
- Undo returns to the previous human decision point, usually undoing both the human move and the AI reply. If the AI is still thinking, cancel its search and undo just the pending human move.
- Show checkmate, stalemate, and supported draw outcomes clearly. Define the initial casual-play draw policy explicitly: automatically end on chess.js draw detection, including repetition and the fifty-move rule, rather than implementing tournament claim procedures.
- Save the move history, starting position, chosen side, and difficulty locally. Restore by replaying history so repetition information is preserved; a final FEN alone is insufficient. Handle unavailable storage and invalid saves gracefully.

## Rules and state

- Treat chess.js as the authoritative position and rules source. Do not reimplement move legality inside KAPLAY or trust an AI response without validation.
- Cover castling, en passant, promotion, check, checkmate, stalemate, repetition, the fifty-move rule, and insufficient-material detection supported by the selected chess.js version.
- Use explicit loading, human-turn, promotion-selection, animating, AI-thinking, and finished states to prevent duplicate or out-of-turn moves.
- Preserve the complete starting position and move sequence when sending positions to Stockfish, including promotion suffixes.
- Keep rules integration, AI communication, and visual interpolation separate and testable.

## Animated moves — required

- Animate both human and AI moves smoothly between squares using elapsed time and easing, independent of frame rate. Start with roughly 180–280 ms per ordinary move, then tune by browser testing.
- During dragging, the piece follows the pointer smoothly. On legal release, animate only the remaining distance to its destination; do not jump back to the source first. On an invalid release or cancellation, animate back to its original square.
- For tap and keyboard moves, animate from the source square to the destination square.
- Keep moving pieces above stationary pieces and retain stable piece identities through animation.
- Coordinate capture removal with arrival. Handle the off-destination captured pawn in en passant explicitly.
- Animate the king and rook together during castling. Animate a promoted pawn's travel and replacement with the selected piece without a position jump.
- Prevent another move while a move animation resolves. Show the AI response only after the preceding visual transition completes.
- Cancel obsolete tweens on restart, undo, restore, or exit. Resize and board orientation must preserve logical squares and recompute visual positions without altering the game.
- Honor `prefers-reduced-motion` with immediate or very short transitions; functionality must not depend on animation completion callbacks alone.

## Stockfish integration and difficulty

- Use a pinned Stockfish.js lite, single-threaded WebAssembly build in a dedicated Web Worker. This keeps search off the UI thread and avoids requiring a multi-threaded engine setup.
- Bundle and self-host the worker, WASM, and any required evaluation assets. Load them only when Chess opens, following the catalogue's existing lazy-loading architecture.
- Verify Bun's development and production asset paths, WASM serving, and worker startup. Show loading progress/state and a retry option if engine initialization fails.
- Initialize through the engine's UCI handshake and use the options advertised by that exact build. Keep skill settings and search limits in one configuration module.
- Proposed initial profiles, subject to playtesting:

  | Difficulty | Intended experience | Search budget per move |
  | --- | --- | --- |
  | Easy | Forgiving play with plausible mistakes and missed tactics | 200–400 ms |
  | Medium | Defends pieces and spots straightforward combinations | 500–800 ms |
  | Hard | Stronger tactical and positional decisions | 1–2 seconds |

- Tune engine strength settings as well as search budgets; shorter thinking time alone is not sufficient to make Easy approachable. Do not present these labels as calibrated Elo ratings.
- First evaluate Stockfish's built-in strength reduction. If Easy remains too strong, add a bounded, reproducible selection policy among evaluated legal candidates, with controlled mistakes rather than arbitrary random moves. Keep this decision subject to playtesting.
- Apply a finite search deadline and recovery timeout. Stop background search when the page is hidden; resume appropriately when visible without allowing stale results to play.
- Serialize searches. Tag application requests with a game generation and position, and correctly drain or discard outstanding UCI responses on cancellation. Restart, undo, and exit must never allow an old `bestmove` to alter the new position.
- Validate every returned move through chess.js. Handle terminal positions, invalid output, engine failure, and retry without corrupting the board.
- Include the selected Stockfish distribution's license notices and corresponding-source distribution arrangements. Verify redistribution requirements for the exact bundled version.
- AI play requires no network calls after its assets load. Cold-start offline availability requires deliberate asset caching and is separate from local computation; do not claim offline reopening unless it is implemented and tested.

## Architecture and interface quality

- Implement under `src/games/chess/`, following the shared `GameModule` lifecycle and existing Bun tooling.
- Suggested separation: `index.ts` for mounting and UI coordination, `logic.ts` for game state and chess.js integration, `engine.ts` for the worker/UCI adapter, `difficulty.ts` for AI profiles, and `render.ts` for KAPLAY rendering and animation.
- Reuse the existing KAPLAY dependency. Add chess.js and the selected Stockfish distribution through Bun; do not introduce another bundler.
- Use recognizable, licensed SVG or raster piece assets rendered by KAPLAY, with clear silhouettes for both sides.
- Fit the board and controls at 320px width without horizontal scrolling. Prevent unwanted text selection and double-tap zoom during game interaction using existing project conventions.
- Provide semantic HTML controls, an accessible representation of the board and legal choices, visible keyboard focus, and move/status announcements alongside the canvas.
- Terminate the AI worker and remove KAPLAY resources, animations, listeners, and audio in `destroy()`.

## Implementation sequence

1. Add the catalogue entry, chess.js state integration, KAPLAY board, side selection, and legal human interaction.
2. Complete animated moves and special-move presentation, including promotion, castling, captures, and invalid drag return.
3. Integrate local Stockfish, worker lifecycle, search cancellation, and the three difficulty profiles.
4. Add undo, save/resume, game-ending flows, accessibility, and responsive polish.
5. Verify rules integration, asynchronous lifecycle behavior, production asset loading, animation quality, and difficulty feel before considering implementation complete.

## Verification and acceptance

- Add focused Bun tests for application behavior: special-move integration, terminal-state transitions, history-preserving restore, undo around pending searches, invalid/stale AI responses, and cancellation after restart or exit. Avoid duplicating the rules library's entire test suite.
- Run `bun test` and `bun run build`.
- Exercise tap, drag, and keyboard play in a browser at narrow phone and desktop widths, with both board orientations.
- Visually verify human and AI movement, capture timing, castling, en passant, promotion, invalid-drop return, resize during animation, and reduced motion.
- Exercise actual Stockfish worker initialization and moves from the production build, not just a mocked engine adapter.
- Verify the UI remains responsive during Hard searches, and repeated navigation leaves no running workers or animations.
- Check that AI computation makes no remote evaluation requests. Test continued play without a network connection after the engine assets have loaded.
- Playtest Easy, Medium, and Hard on representative mobile and desktop browsers. Record any difficulty tuning and device limitations rather than claiming unmeasured ratings or universal performance.
