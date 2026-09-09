# Happy Arcade contributor guide

## Runtime and commands

Use Bun for this repository.

- Scaffold new packages with `bun init`.
- Install dependencies with `bun install` or `bun add`.
- Run package scripts with `bun run <script>`.
- Run tests with `bun test`.
- Bundle browser code with `bun build`; do not add Vite, Webpack, or another bundler.
- Use Bun-native APIs in server-side code. Prefer `Bun.serve`, `Bun.file`, `bun:sqlite`, `Bun.redis`, and `Bun.sql` over equivalent third-party packages.
- Do not add a dependency when a browser or Bun API already provides the required capability.

## Product architecture

Happy Arcade is a local-first collection of browser games for children.

- Keep the catalogue and navigation engine-independent.
- Put each game in `src/games/<game-id>/`.
- Every game exports the `GameModule` lifecycle defined in `src/platform/game.ts`.
- Load games and their engines dynamically so opening one game does not download another game's engine.
- A game may use semantic HTML, KAPLAY, Babylon.js, or another suitable renderer. Do not force all games onto one engine.
- Keep player data on the device unless a task explicitly introduces remote services.
- Game modules must remove their event listeners, animation loops, canvases, and audio resources in `destroy()`.

## Interface quality

- Design for touch first, then keyboard and pointer input.
- Use semantic controls with accessible names and visible focus states.
- Keep main text at least 16px and controls comfortably tappable.
- Respect `prefers-reduced-motion`.
- Keep layouts usable from 320px-wide phones through desktop screens.
- Avoid instructions that rely on color alone; pair colors with names, symbols, or text.

## Verification

Before considering a change complete:

1. Run `bun test` for game logic.
2. Run `bun run build` for type and bundle validation.
3. Exercise the affected flow in a browser when the task requests browser QA.
