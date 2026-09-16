import { brotliCompressSync, constants } from "node:zlib";
import { join, resolve } from "node:path";

interface BuildOutput {
  bytes: number;
  entryPoint?: string;
  cssBundle?: string;
  imports?: Array<{ path: string; kind: string }>;
}

interface BuildMetadata {
  outputs: Record<string, BuildOutput>;
}

interface Sizes {
  raw: number;
  brotli: number;
}

const repositoryRoot = resolve(import.meta.dir, "..");
const outputDirectory = join(repositoryRoot, "dist");
const metadataPath = join(repositoryRoot, ".build", "bundle-meta.json");
const metadata = await Bun.file(metadataPath).json() as BuildMetadata;
const outputs = Object.entries(metadata.outputs);

function outputForEntry(entryPoint: string, extension: string): string {
  const found = outputs.find(([path, output]) => output.entryPoint === entryPoint && path.endsWith(extension));
  if (!found) throw new Error(`Build metadata has no ${extension} output for ${entryPoint}`);
  return found[0];
}

function outputFile(path: string): string {
  return join(outputDirectory, path.replace(/^\.\//, ""));
}

function staticClosure(initial: Iterable<string>): Set<string> {
  const files = new Set(initial);
  const pending = [...files];
  while (pending.length > 0) {
    const path = pending.pop()!;
    const output = metadata.outputs[path];
    for (const dependency of output?.imports ?? []) {
      if (dependency.kind !== "import-statement" || files.has(dependency.path)) continue;
      files.add(dependency.path);
      pending.push(dependency.path);
    }
  }
  return files;
}

async function measureFiles(paths: Iterable<string>): Promise<Sizes> {
  const sizes: Sizes = { raw: 0, brotli: 0 };
  for (const path of new Set(paths)) {
    const data = new Uint8Array(await Bun.file(path).arrayBuffer());
    sizes.raw += data.byteLength;
    sizes.brotli += brotliCompressSync(data, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength;
  }
  return sizes;
}

function mergePaths(...groups: Iterable<string>[]): string[] {
  return [...new Set(groups.flatMap((group) => [...group]))];
}

function format(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

const entryJavaScript = outputForEntry("index.html", ".js");
const entryOutput = metadata.outputs[entryJavaScript]!;
const shellOutputs = staticClosure([
  entryJavaScript,
  outputForEntry("index.html", ".html"),
  ...(entryOutput.cssBundle ? [entryOutput.cssBundle] : []),
]);
const shellFiles = [...shellOutputs].map(outputFile);

const kaplayOutput = outputForEntry("node_modules/kaplay/dist/kaplay.mjs", ".js");
const kaplayOutputs = staticClosure([kaplayOutput]);
const kaplayFiles = [...kaplayOutputs].map(outputFile);

const gameEntries = outputs
  .filter(([, output]) => output.entryPoint?.match(/^src\/games\/[^/]+\/index\.ts$/))
  .map(([path, output]) => ({
    id: output.entryPoint!.split("/")[2]!,
    path,
  }))
  .sort((left, right) => left.id.localeCompare(right.id));

const rows: Array<{ name: string; sizes: Sizes }> = [];
rows.push({ name: "initial shell", sizes: await measureFiles(shellFiles) });
for (const game of gameEntries) {
  const gameOutputs = staticClosure([game.path]);
  for (const shared of shellOutputs) gameOutputs.delete(shared);
  for (const engine of kaplayOutputs) gameOutputs.delete(engine);
  rows.push({ name: `game:${game.id}`, sizes: await measureFiles([...gameOutputs].map(outputFile)) });
}
rows.push({ name: "engine:kaplay", sizes: await measureFiles(kaplayFiles) });

const stockfishFiles = [
  join(outputDirectory, "stockfish", "stockfish-18-lite-single.js"),
  join(outputDirectory, "stockfish", "stockfish-18-lite-single.wasm"),
];
rows.push({ name: "engine:stockfish (on intent)", sizes: await measureFiles(stockfishFiles) });

const carromEntry = gameEntries.find(({ id }) => id === "carrom");
if (!carromEntry) throw new Error("Build metadata has no Carrom entry");
const carromOutputs = staticClosure([carromEntry.path]);
const coldCarromFiles = mergePaths(shellFiles, [...carromOutputs].map(outputFile), kaplayFiles);
const coldCarrom = await measureFiles(coldCarromFiles);
rows.push({ name: "route:carrom cold", sizes: coldCarrom });

const nameWidth = Math.max(...rows.map(({ name }) => name.length), "Asset".length);
console.log(`${"Asset".padEnd(nameWidth)}  ${"Raw".padStart(10)}  ${"Brotli".padStart(10)}`);
for (const { name, sizes } of rows) {
  console.log(`${name.padEnd(nameWidth)}  ${format(sizes.raw).padStart(10)}  ${format(sizes.brotli).padStart(10)}`);
}

const budgets = [
  { name: "initial shell", actual: rows[0]!.sizes.brotli, limit: 20 * 1024 },
  { name: "cold Carrom route", actual: coldCarrom.brotli, limit: 90 * 1024 },
];
let failed = false;
for (const budget of budgets) {
  const passed = budget.actual <= budget.limit;
  console.log(`${passed ? "PASS" : "FAIL"} ${budget.name}: ${format(budget.actual)} / ${format(budget.limit)} Brotli`);
  failed ||= !passed;
}
if (failed) process.exitCode = 1;
