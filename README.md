# Happy Arcade

A local-first collection of small browser games for kids. Bun handles the
development server, hot reloading, TypeScript, and production bundling.

To install dependencies:

```bash
bun install
```

To start the development server:

```bash
bun run dev
```

Every game lives under `src/games` and implements the lifecycle contract in
`src/platform/game.ts`. A game can use the DOM, KAPLAY, Babylon.js, or another
renderer; its engine is loaded only when that game is opened.

This project was created using `bun init` in Bun 1.4.2.
