import index from "./index.html";

const server = Bun.serve({
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Happy Arcade is ready at ${server.url}`);
