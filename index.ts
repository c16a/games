import index from "./index.html";
import { resolve, sep } from "node:path";
import { createQuizHandler } from "./src/server/quiz";

const STOCKFISH_ASSETS = {
  "/stockfish/stockfish-18-lite-single.js": "public/stockfish/stockfish-18-lite-single.js",
  "/stockfish/stockfish-18-lite-single.wasm": "public/stockfish/stockfish-18-lite-single.wasm",
  "/stockfish/COPYING.txt": "public/stockfish/COPYING.txt",
  "/stockfish/SOURCE.md": "public/stockfish/SOURCE.md",
  "/licenses/chess.js-LICENSE.txt": "public/licenses/chess.js-LICENSE.txt",
} as const;

const production = Bun.env.NODE_ENV === "production" || Bun.env.RENDER === "true";
const distDirectory = resolve(import.meta.dir, "dist");
const notFound = new Response("Not found", { status: 404 });
const quizHandler = createQuizHandler();

async function serveBuiltAsset(request: Request): Promise<Response> {
  let requestedPath: string;
  try {
    requestedPath = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, "");
  } catch {
    return notFound;
  }
  if (!requestedPath) requestedPath = "index.html";
  const filePath = resolve(distDirectory, requestedPath);
  if (!filePath.startsWith(`${distDirectory}${sep}`)) return notFound;
  const file = Bun.file(filePath);
  if (!(await file.exists())) return notFound;
  return new Response(file, {
    headers: requestedPath === "index.html" ? { "cache-control": "no-cache" } : { "cache-control": "public, max-age=31536000, immutable" },
  });
}

let server: ReturnType<typeof Bun.serve>;
const routes = {
  "/api/quiz": (request: Request) => {
    const forwardedClientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return quizHandler(request, forwardedClientIp || server.requestIP(request)?.address || "unknown");
  },
  "/healthz": {
    GET: () => Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } }),
  },
  "/": production ? () => new Response(Bun.file(`${distDirectory}/index.html`), { headers: { "cache-control": "no-cache" } }) : index,
  ...Object.fromEntries(Object.entries(STOCKFISH_ASSETS).map(([route, path]) => [
    route,
    () => new Response(Bun.file(resolve(import.meta.dir, path))),
  ])),
};

server = Bun.serve({
  port: Number(Bun.env.PORT ?? 3000),
  hostname: "0.0.0.0",
  routes,
  ...(production
    ? { fetch: (request: Request) => new URL(request.url).pathname.startsWith("/api/")
      ? Response.json({ error: { code: "method_not_allowed", message: "Use POST to create a quiz." } }, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } })
      : serveBuiltAsset(request) }
    : { development: { hmr: true, console: true } }),
});

console.log(`Happy Arcade is ready at ${server.url}`);
