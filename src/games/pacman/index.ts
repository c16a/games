import type { GameContext, GameInstance } from "../../platform/game";
import { createState, HEIGHT, key, MAZE, nextLevel, step, stepSeconds, togglePause, WIDTH, type Direction } from "./logic";

const CELL = 30;
const keys: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
export async function mount({ container, exit, kaplayReady, signal }: GameContext): Promise<GameInstance> {
  const { default: kaplay } = await (kaplayReady ?? import("kaplay"));
  if (signal?.aborted) return { destroy() {} };
  let state = createState();
  let accumulator = 0;
  const events = new AbortController();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  container.innerHTML = `
    <main class="game-page pacman-page">
      <header class="game-header">
        <button class="icon-button" data-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading"><span class="eyebrow">One more pellet!</span><h1>Pacman</h1></div>
        <button class="icon-button" data-action="restart" aria-label="Restart Pacman">↻</button>
      </header>
      <section class="pacman-game" aria-label="Pacman game">
        <div class="pacman-stats"><div>Score <strong data-score>0</strong></div><div>Lives <strong data-lives>3</strong></div><div>Level <strong data-level>1</strong></div><div>Pellets <strong data-pellets></strong></div></div>
        <div class="pacman-board"><canvas tabindex="0" role="img" aria-label="Pacman maze. Use arrow keys, WASD, swipe, or direction buttons." width="570" height="480"></canvas></div>
        <p class="pacman-message" aria-live="polite" data-message></p>
        <div class="pacman-actions"><button class="check-button" data-action="start">Start game</button><button class="soft-button" data-action="pause" disabled>Pause</button></div>
        <div class="pacman-pad" aria-label="Direction controls"><button data-direction="up" aria-label="Move up">↑</button><button data-direction="left" aria-label="Move left">←</button><button data-direction="down" aria-label="Move down">↓</button><button data-direction="right" aria-label="Move right">→</button></div>
        <p class="pacman-help">Eat every pellet. Big pellets let you chase the ghosts!<br>Arrow keys / WASD · Swipe or tap to steer · P to pause</p>
      </section>
    </main>`;
  const canvas = container.querySelector<HTMLCanvasElement>("canvas")!;
  const element = (selector: string) => container.querySelector<HTMLElement>(selector)!;
  const start = container.querySelector<HTMLButtonElement>('[data-action="start"]')!;
  const pause = container.querySelector<HTMLButtonElement>('[data-action="pause"]')!;
  const k = kaplay({ global: false, canvas, width: WIDTH * CELL, height: HEIGHT * CELL, background: [9, 13, 32], debug: false, focus: false, touchToMouse: false });
  function sync(): void {
    element("[data-score]").textContent = String(state.score);
    element("[data-lives]").textContent = String(state.lives);
    element("[data-level]").textContent = String(state.level);
    element("[data-pellets]").textContent = String(state.pellets.size);
    start.hidden = state.status === "running" || state.status === "paused";
    start.textContent = state.status === "won" ? "Next level" : state.status === "lost" ? "Play again" : state.lives < 3 ? "Continue" : "Start game";
    pause.disabled = state.status !== "running" && state.status !== "paused";
    pause.textContent = state.status === "paused" ? "Resume" : "Pause";
    const message = state.status === "won" ? "Maze cleared! Ready for a faster round?" : state.status === "lost" ? `Game over. You scored ${state.score}! Try again?` : state.status === "paused" ? "Paused. Take your time." : state.status === "ready" ? (state.lives < 3 ? "A ghost caught you. Press Continue when ready." : "Ready? Clear the maze and watch for ghosts.") : state.power > 0 ? "Power pellet! Chase the blue ghosts with the white rings." : state.shield > 0 ? "Your white ring protects you for a moment." : "Keep munching! Big pellets turn the tables.";
    if (element("[data-message]").textContent !== message) element("[data-message]").textContent = message;
  }
  function steer(direction: Direction): void { state.queued = direction; canvas.focus({ preventScroll: true }); }
  function autoPause(): void { if (state.status === "running") { togglePause(state); accumulator = 0; sync(); } }
  container.addEventListener("click", event => {
    const target = (event.target as Element).closest<HTMLElement>("button");
    if (!target) return;
    if (target.dataset.direction) steer(target.dataset.direction as Direction);
    const action = target.dataset.action;
    if (action === "exit") { exit(); return; }
    if (action === "restart") state = createState();
    if (action === "pause") togglePause(state);
    if (action === "start") {
      if (state.status === "won") state = nextLevel(state);
      if (state.status === "lost") state = createState();
      state.status = "running";
      canvas.focus({ preventScroll: true });
    }
    accumulator = 0; sync();
  }, { signal: events.signal });
  window.addEventListener("keydown", event => {
    if (event.metaKey || event.ctrlKey || event.altKey || (event.target instanceof HTMLElement && event.target.matches("input, textarea, select"))) return;
    const direction = keys[event.key] ?? keys[event.key.toLowerCase()];
    if (direction) { event.preventDefault(); steer(direction); }
    if (!event.repeat && (event.key.toLowerCase() === "p" || event.key === "Escape")) { event.preventDefault(); togglePause(state); accumulator = 0; sync(); }
  }, { signal: events.signal });
  window.addEventListener("blur", autoPause, { signal: events.signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) autoPause(); }, { signal: events.signal });
  let pointer: { x: number; y: number; id: number } | undefined;
  canvas.addEventListener("pointerdown", event => { pointer = { x: event.clientX, y: event.clientY, id: event.pointerId }; canvas.setPointerCapture(event.pointerId); }, { signal: events.signal });
  canvas.addEventListener("pointerup", event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    pointer = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 12) steer(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up");
  }, { signal: events.signal });
  canvas.addEventListener("pointercancel", () => { pointer = undefined; }, { signal: events.signal });
  k.onUpdate(() => {
    if (state.status !== "running") return;
    accumulator += Math.min(k.dt(), 0.1);
    if (accumulator >= stepSeconds(state.level)) { accumulator -= stepSeconds(state.level); step(state); sync(); }
  });
  k.onDraw(() => {
    MAZE.forEach((row, y) => [...row].forEach((tile, x) => {
      const pos = k.vec2((x + 0.5) * CELL, (y + 0.5) * CELL);
      if (tile === "#") k.drawRect({ pos: k.vec2(x * CELL + 3, y * CELL + 3), width: CELL - 6, height: CELL - 6, radius: 6, color: k.rgb(20, 34, 76), outline: { width: 2, color: k.rgb(70, 111, 236) } });
      else if (state.pellets.has(key({ x, y }))) k.drawCircle({ pos, radius: state.powers.has(key({ x, y })) ? 7 : 2.5, color: k.rgb(255, 226, 163) });
    }));
    const p = k.vec2((state.player.x + 0.5) * CELL, (state.player.y + 0.5) * CELL);
    const angle = { right: 0, down: 90, left: 180, up: 270 }[state.direction];
    const mouth = reducedMotion || state.status !== "running" ? 32 : state.tick % 2 ? 38 : 16;
    k.drawCircle({ pos: p, radius: 12, start: mouth + angle, end: 360 - mouth + angle, color: k.rgb(255, 218, 60) });
    if (state.shield > 0) k.drawCircle({ pos: p, radius: 14, fill: false, outline: { width: 1, color: k.rgb(255, 255, 255) } });
    const colors = [[255, 105, 128], [111, 227, 233], [249, 170, 231], [255, 172, 91]];
    state.ghosts.forEach((ghost, i) => {
      const x = (ghost.x + 0.5) * CELL, y = (ghost.y + 0.5) * CELL;
      const color = state.power > 0 ? k.rgb(75, 107, 237) : k.rgb(...colors[i]! as [number, number, number]);
      k.drawRect({ pos: k.vec2(x - 11, y - 11), width: 22, height: 23, radius: 9, color });
      for (const offset of [-4, 4]) { k.drawCircle({ pos: k.vec2(x + offset, y - 2), radius: 4, color: k.rgb(255, 255, 255) }); k.drawCircle({ pos: k.vec2(x + offset, y - 1), radius: 2, color: k.rgb(9, 13, 32) }); }
      if (state.power > 0) k.drawCircle({ pos: k.vec2(x, y), radius: 14, fill: false, outline: { width: 2, color: k.rgb(255, 255, 255) } });
    });
    if (state.status !== "running") k.drawRect({ pos: k.vec2(0, 0), width: WIDTH * CELL, height: HEIGHT * CELL, color: k.rgb(9, 13, 32), opacity: 0.3 });
  });
  sync();
  return { destroy() { events.abort(); k.quit(); container.innerHTML = ""; } };
}
