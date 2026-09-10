# Chess playtest notes

Validated on 2026-09-10 using the bundled production code and Stockfish 18 lite single-threaded WASM.

## Difficulty tuning

| Profile | Settings | Observed local behavior |
| --- | --- | --- |
| Easy | Skill 0, UCI Elo limiter 1320, MultiPV 4, 300 ms | Responded promptly and used deterministic controlled selection among evaluated candidates. This can still challenge a new player and should be revisited with player feedback. |
| Medium | Skill 5, UCI Elo limiter 1600, MultiPV 2, 650 ms | Completed representative opening replies smoothly without blocking input or animation. |
| Hard | Skill 12, UCI Elo limiter 2100, MultiPV 1, 1500 ms | The thinking indicator remained animated and responsive; the reply transitioned directly into the move animation. |

These are experience labels, not measured or promised Elo ratings.

## Browser and layout checks

- Chromium-based in-app browser at 516 px and 1280 px viewport widths: setup, White and Black orientation, keyboard play, save/resume, complete-turn undo, pending-search undo, special-move presentation, and repeated exit cleanup.
- Production `dist` build: worker handshake, WASM load, and actual AI reply were verified from a static server.
- After the production assets loaded, the server was stopped and another complete human/AI turn succeeded, confirming move evaluation remained local.
- CSS constrains the board and controls to the available width with no Chess-page horizontal overflow; the minimum supported document width is 320 px.

## Device limitations

- First use downloads approximately 7.01 MiB of self-hosted Stockfish worker/WASM/license assets. Later reopening depends on normal browser caching; no offline cold-start guarantee is made.
- This build requires WebAssembly and a modern browser. It deliberately uses a single worker and no shared-memory/thread headers.
- Difficulty feel has only been smoke-playtested. Broader testing with beginners and experienced players should guide future tuning.
