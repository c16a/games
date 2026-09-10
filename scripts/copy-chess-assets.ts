const assets = [
  "stockfish-18-lite-single.js",
  "stockfish-18-lite-single.wasm",
  "COPYING.txt",
  "SOURCE.md",
] as const;

await Bun.$`mkdir -p dist/stockfish`;
for (const asset of assets) {
  await Bun.write(`dist/stockfish/${asset}`, Bun.file(`public/stockfish/${asset}`));
}
await Bun.$`mkdir -p dist/licenses`;
await Bun.write("dist/licenses/chess.js-LICENSE.txt", Bun.file("public/licenses/chess.js-LICENSE.txt"));
