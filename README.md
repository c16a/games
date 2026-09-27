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

## Render deployment

Deploy this branch as a Render **Web Service** so Bun can serve both the built
static site and `/api/quiz` from the same origin.

- Build command: `bun install --frozen-lockfile && bun run build`
- Start command: `bun run start`
- Runtime environment: add `OPENAI_KEY` in the service's **Environment** settings

Keep the OpenAI key in the Render service environment. Do not add its value to
the repository, `render.yaml`, or browser code. The API uses `gpt-6-luna` and
returns JSON for both generated quizzes and errors.
