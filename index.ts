import index from "./index.html";

const STOCKFISH_ASSETS = {
  "/stockfish/stockfish-18-lite-single.js": "public/stockfish/stockfish-18-lite-single.js",
  "/stockfish/stockfish-18-lite-single.wasm": "public/stockfish/stockfish-18-lite-single.wasm",
  "/stockfish/COPYING.txt": "public/stockfish/COPYING.txt",
  "/stockfish/SOURCE.md": "public/stockfish/SOURCE.md",
  "/licenses/chess.js-LICENSE.txt": "public/licenses/chess.js-LICENSE.txt",
} as const;

const server = Bun.serve({
  routes: {
    "/": index,
    ...Object.fromEntries(Object.entries(STOCKFISH_ASSETS).map(([route, path]) => [
      route,
      () => new Response(Bun.file(path)),
    ])),
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Happy Arcade is ready at ${server.url}`);
