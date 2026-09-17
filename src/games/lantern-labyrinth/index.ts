import type { GameContext, GameInstance } from "../../platform/game";
import {
  type Direction,
  type LabyrinthState,
  cellKey,
  createInitialState,
  lightPercent,
  movePlayer,
  nextLevel,
  pauseGame,
  restartGame,
  resumeGame,
  retryLevel,
  sameCell,
  startGame,
} from "./logic";

const CANVAS_SIZE = 720;
const BOARD_PADDING = 30;

const KEY_DIRECTIONS: Record<string, Direction | undefined> = {
  ArrowUp: "up",
  w: "up",
  W: "up",
  ArrowRight: "right",
  d: "right",
  D: "right",
  ArrowDown: "down",
  s: "down",
  S: "down",
  ArrowLeft: "left",
  a: "left",
  A: "left",
};

function stateSummary(state: LabyrinthState): string {
  return `Explorer at column ${state.player.x + 1}, row ${state.player.y + 1}. Lantern ${lightPercent(state)} percent. ${state.fireflies.length} fireflies remain. ${state.explored.length} of ${state.maze.cells.length} rooms explored.`;
}

export async function mount({ container, exit, kaplayReady, signal }: GameContext): Promise<GameInstance> {
  const { default: kaplay } = await (kaplayReady ?? import("kaplay"));
  if (signal?.aborted) return { destroy() {} };
  let state = createInitialState();
  let destroyed = false;
  let elapsed = 0;
  let pointerStart: { id: number; x: number; y: number } | undefined;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  container.innerHTML = `
    <main class="game-page labyrinth-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-labyrinth-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow labyrinth-eyebrow">A glowing forest quest</span>
          <h1>Lantern Labyrinth</h1>
        </div>
        <button class="icon-button" type="button" data-labyrinth-action="new" aria-label="Start a new Lantern Labyrinth expedition">↻</button>
      </header>

      <section class="labyrinth-game" aria-label="Lantern Labyrinth game">
        <div class="labyrinth-mission">
          <div class="labyrinth-mission-icon" aria-hidden="true">🏮</div>
          <div>
            <p class="mission-title">Follow the glow to the moon gate!</p>
            <p class="mission-copy">Explore carefully. Fireflies refill your lantern before it grows dim.</p>
          </div>
          <div class="labyrinth-scores" aria-label="Expedition status">
            <div><span>Trail</span><strong data-labyrinth-level>1</strong></div>
            <div><span>Score</span><strong data-labyrinth-score>0</strong></div>
            <div><span>Fireflies</span><strong data-labyrinth-fireflies>0</strong></div>
          </div>
        </div>

        <div class="labyrinth-workspace">
          <div class="labyrinth-lantern" role="progressbar" aria-label="Lantern glow" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
            <span aria-hidden="true">🏮</span>
            <div>
              <div class="labyrinth-lantern-label"><strong>Lantern glow</strong><b data-labyrinth-light>100%</b></div>
              <div class="labyrinth-light-track" aria-hidden="true"><i data-labyrinth-light-bar></i></div>
            </div>
          </div>

          <div class="labyrinth-board-shell">
            <canvas
              class="labyrinth-canvas"
              data-labyrinth-canvas
              width="${CANVAS_SIZE}"
              height="${CANVAS_SIZE}"
              tabindex="0"
              role="img"
              aria-label="Dark forest maze. Swipe or use the direction controls to explore."
            ></canvas>
          </div>

          <p class="visually-hidden" data-labyrinth-summary>${stateSummary(state)}</p>
          <p class="labyrinth-message" data-labyrinth-message aria-live="polite">Start when you are ready. Find fireflies, then reach the moon gate.</p>

          <div class="labyrinth-pad" aria-label="Move through the labyrinth">
            <button type="button" data-labyrinth-direction="up" aria-label="Move up">↑</button>
            <button type="button" data-labyrinth-direction="left" aria-label="Move left">←</button>
            <button type="button" data-labyrinth-direction="down" aria-label="Move down">↓</button>
            <button type="button" data-labyrinth-direction="right" aria-label="Move right">→</button>
          </div>

          <div class="labyrinth-actions">
            <button class="soft-button" type="button" data-labyrinth-action="pause" disabled>Pause</button>
            <button class="check-button labyrinth-start" type="button" data-labyrinth-action="start">Light the lantern</button>
            <button class="soft-button" type="button" data-labyrinth-action="new">New expedition</button>
          </div>
        </div>
      </section>

      <div class="celebration" data-labyrinth-result aria-live="assertive" hidden></div>
    </main>`;

  const canvas = container.querySelector<HTMLCanvasElement>("[data-labyrinth-canvas]");
  const levelElement = container.querySelector<HTMLElement>("[data-labyrinth-level]");
  const scoreElement = container.querySelector<HTMLElement>("[data-labyrinth-score]");
  const fireflyElement = container.querySelector<HTMLElement>("[data-labyrinth-fireflies]");
  const lightElement = container.querySelector<HTMLElement>("[data-labyrinth-light]");
  const lightBar = container.querySelector<HTMLElement>("[data-labyrinth-light-bar]");
  const lanternMeter = container.querySelector<HTMLElement>(".labyrinth-lantern");
  const messageElement = container.querySelector<HTMLElement>("[data-labyrinth-message]");
  const summaryElement = container.querySelector<HTMLElement>("[data-labyrinth-summary]");
  const pauseButton = container.querySelector<HTMLButtonElement>('[data-labyrinth-action="pause"]');
  const startButton = container.querySelector<HTMLButtonElement>('[data-labyrinth-action="start"]');
  const resultElement = container.querySelector<HTMLElement>("[data-labyrinth-result]");
  if (!canvas || !levelElement || !scoreElement || !fireflyElement || !lightElement || !lightBar || !lanternMeter || !messageElement || !summaryElement || !pauseButton || !startButton || !resultElement) {
    throw new Error("Lantern Labyrinth UI could not be created");
  }

  const k = kaplay({
    global: false,
    canvas,
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    background: [7, 11, 22],
    crisp: true,
    debug: false,
    focus: false,
    touchToMouse: false,
  });
  canvas.classList.add("labyrinth-canvas");

  function geometry(): { cellSize: number; offset: number } {
    const cellSize = (CANVAS_SIZE - BOARD_PADDING * 2) / state.maze.width;
    return { cellSize, offset: (CANVAS_SIZE - cellSize * state.maze.width) / 2 };
  }

  function drawFirefly(x: number, y: number, size: number, opacity = 1): void {
    const flutter = reducedMotion ? 0 : Math.sin(elapsed * 5 + x * 0.03) * size * 0.1;
    k.drawCircle({ pos: k.vec2(x, y), radius: size * 0.44, anchor: "center", color: k.rgb(255, 224, 102), opacity: opacity * 0.2 });
    k.drawCircle({ pos: k.vec2(x - size * 0.25, y + flutter), radius: size * 0.17, anchor: "center", color: k.rgb(170, 245, 255), opacity: opacity * 0.7 });
    k.drawCircle({ pos: k.vec2(x + size * 0.25, y - flutter), radius: size * 0.17, anchor: "center", color: k.rgb(170, 245, 255), opacity: opacity * 0.7 });
    k.drawCircle({ pos: k.vec2(x, y), radius: size * 0.13, anchor: "center", color: k.rgb(255, 239, 145), opacity });
  }

  function drawBoard(): void {
    const { cellSize, offset } = geometry();
    const explored = new Set(state.explored.map(cellKey));
    const glow = lightPercent(state) / 100;
    const visibleRadius = 1.45 + glow * 2.1;

    k.drawRect({ pos: k.vec2(0, 0), width: CANVAS_SIZE, height: CANVAS_SIZE, color: k.rgb(7, 11, 22) });
    for (const cell of state.maze.cells) {
      const distance = Math.hypot(cell.x - state.player.x, cell.y - state.player.y);
      const visible = distance <= visibleRadius;
      const wasExplored = explored.has(cellKey(cell));
      const x = offset + cell.x * cellSize;
      const y = offset + cell.y * cellSize;
      const color = visible
        ? (cell.x + cell.y) % 2 === 0 ? k.rgb(37, 61, 65) : k.rgb(32, 54, 60)
        : wasExplored ? k.rgb(19, 30, 43) : k.rgb(10, 15, 27);
      k.drawRect({ pos: k.vec2(x + 1, y + 1), width: cellSize - 2, height: cellSize - 2, color });

      if (visible) {
        const moss = ((cell.x * 7 + cell.y * 11) % 5) + 2;
        k.drawCircle({
          pos: k.vec2(x + cellSize * 0.22, y + cellSize * 0.74),
          radius: Math.max(1.5, cellSize / moss / 5),
          anchor: "center",
          color: k.rgb(91, 153, 105),
          opacity: 0.42,
        });
      }

      const wallOpacity = visible ? 0.95 : wasExplored ? 0.28 : 0.08;
      const wallColor = visible ? k.rgb(111, 153, 138) : k.rgb(72, 92, 101);
      const wallWidth = Math.max(2, cellSize * 0.07);
      if (cell.walls.up) k.drawLine({ p1: k.vec2(x, y), p2: k.vec2(x + cellSize, y), width: wallWidth, color: wallColor, opacity: wallOpacity });
      if (cell.walls.left) k.drawLine({ p1: k.vec2(x, y), p2: k.vec2(x, y + cellSize), width: wallWidth, color: wallColor, opacity: wallOpacity });
      if (cell.x === state.maze.width - 1 && cell.walls.right) k.drawLine({ p1: k.vec2(x + cellSize, y), p2: k.vec2(x + cellSize, y + cellSize), width: wallWidth, color: wallColor, opacity: wallOpacity });
      if (cell.y === state.maze.height - 1 && cell.walls.down) k.drawLine({ p1: k.vec2(x, y + cellSize), p2: k.vec2(x + cellSize, y + cellSize), width: wallWidth, color: wallColor, opacity: wallOpacity });
    }

    const exitDistance = Math.hypot(state.maze.exit.x - state.player.x, state.maze.exit.y - state.player.y);
    if (exitDistance <= visibleRadius || explored.has(cellKey(state.maze.exit))) {
      const exitX = offset + (state.maze.exit.x + 0.5) * cellSize;
      const exitY = offset + (state.maze.exit.y + 0.5) * cellSize;
      const opacity = exitDistance <= visibleRadius ? 1 : 0.3;
      k.drawCircle({ pos: k.vec2(exitX, exitY), radius: cellSize * 0.31, anchor: "center", color: k.rgb(173, 139, 255), opacity: opacity * 0.24 });
      k.drawRect({ pos: k.vec2(exitX - cellSize * 0.19, exitY - cellSize * 0.23), width: cellSize * 0.38, height: cellSize * 0.48, radius: cellSize * 0.18, color: k.rgb(119, 92, 187), opacity });
      k.drawCircle({ pos: k.vec2(exitX, exitY - cellSize * 0.03), radius: cellSize * 0.1, anchor: "center", color: k.rgb(255, 244, 184), opacity });
    }

    for (const firefly of state.fireflies) {
      const distance = Math.hypot(firefly.x - state.player.x, firefly.y - state.player.y);
      if (distance > visibleRadius) continue;
      drawFirefly(
        offset + (firefly.x + 0.5) * cellSize,
        offset + (firefly.y + 0.5) * cellSize,
        Math.max(11, cellSize * 0.28),
      );
    }

    const playerX = offset + (state.player.x + 0.5) * cellSize;
    const playerY = offset + (state.player.y + 0.5) * cellSize;
    const pulse = reducedMotion ? 1 : 0.94 + Math.sin(elapsed * 3) * 0.06;
    k.drawCircle({ pos: k.vec2(playerX, playerY), radius: cellSize * 0.48 * pulse, anchor: "center", color: k.rgb(255, 204, 91), opacity: 0.08 + glow * 0.08 });
    k.drawCircle({ pos: k.vec2(playerX, playerY), radius: cellSize * 0.25, anchor: "center", color: k.rgb(63, 43, 92), outline: { width: Math.max(2, cellSize * 0.045), color: k.rgb(225, 210, 255) } });
    k.drawCircle({ pos: k.vec2(playerX, playerY - cellSize * 0.05), radius: cellSize * 0.095, anchor: "center", color: k.rgb(255, 226, 184) });
    k.drawRect({ pos: k.vec2(playerX + cellSize * 0.08, playerY + cellSize * 0.04), width: cellSize * 0.14, height: cellSize * 0.18, radius: cellSize * 0.03, color: k.rgb(255, 190, 67), outline: { width: 2, color: k.rgb(96, 55, 30) } });
  }

  function hideResult(): void {
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
  }

  function showResult(): void {
    const won = state.status === "won";
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card labyrinth-result-card" role="dialog" aria-modal="true" aria-labelledby="labyrinth-result-title">
        <div class="labyrinth-result-icon" aria-hidden="true">${won ? "🌙" : "🏮"}</div>
        <p class="eyebrow labyrinth-eyebrow">${won ? "Moon gate discovered" : "The trail went quiet"}</p>
        <h2 id="labyrinth-result-title">${won ? `Trail ${state.level} complete!` : "The lantern grew dim"}</h2>
        <p>${won ? `You found ${state.collected} fireflies and reached the gate in ${state.moves} moves.` : "Try a new path and gather fireflies whenever your glow gets low."}</p>
        <div class="result-actions">
          <button class="check-button labyrinth-result-button" type="button" data-labyrinth-result-action="${won ? "next" : "retry"}">${won ? "Next trail" : "Relight this trail"}</button>
          <button class="text-button" type="button" data-labyrinth-result-action="exit">All games</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>("[data-labyrinth-result-action]")?.focus();
  }

  function renderState(previous?: LabyrinthState): void {
    const percent = lightPercent(state);
    levelElement!.textContent = String(state.level);
    scoreElement!.textContent = String(state.score);
    fireflyElement!.textContent = String(state.collected);
    lightElement!.textContent = `${percent}%`;
    lightBar!.style.width = `${percent}%`;
    lightBar!.classList.toggle("labyrinth-light-bar--low", percent <= 25);
    lanternMeter!.setAttribute("aria-valuenow", String(percent));
    canvas!.setAttribute("aria-label", `Dark forest maze, trail ${state.level}. Swipe or use the direction controls to explore. Lantern ${percent} percent.`);
    summaryElement!.textContent = stateSummary(state);
    pauseButton!.disabled = state.status === "ready" || state.status === "won" || state.status === "dimmed";
    pauseButton!.textContent = state.status === "paused" ? "Resume" : "Pause";
    startButton!.hidden = state.status !== "ready";

    if (state.status === "ready") messageElement!.textContent = `Trail ${state.level}: ${state.maze.width} by ${state.maze.height} rooms. Light the lantern when ready.`;
    else if (state.status === "paused") messageElement!.textContent = "Expedition paused. The lantern is safe while you rest.";
    else if (state.status === "running" && state.collected > (previous?.collected ?? state.collected)) messageElement!.textContent = "Firefly found! Your lantern shines brighter.";
    else if (state.status === "running" && percent <= 25) messageElement!.textContent = "The glow is low—listen for nearby fireflies!";
    else if (state.status === "running") messageElement!.textContent = "Explore the forest and look for the moon gate.";

    if ((state.status === "won" || state.status === "dimmed") && state.status !== previous?.status) showResult();
  }

  function start(): void {
    const previous = state;
    state = startGame(state);
    hideResult();
    renderState(previous);
    canvas!.focus();
  }

  function move(direction: Direction): void {
    const previous = state;
    state = movePlayer(state, direction);
    if (state !== previous) renderState(previous);
  }

  function restart(): void {
    state = restartGame();
    hideResult();
    renderState();
    canvas!.focus();
  }

  function advanceTrail(): void {
    state = nextLevel(state);
    hideResult();
    renderState();
    canvas!.focus();
  }

  function retryTrail(): void {
    state = retryLevel(state);
    hideResult();
    renderState();
    canvas!.focus();
  }

  function togglePause(): void {
    const previous = state;
    state = state.status === "paused" ? resumeGame(state) : pauseGame(state);
    renderState(previous);
    canvas!.focus();
  }

  function autoPause(): void {
    if (state.status !== "running") return;
    const previous = state;
    state = pauseGame(state);
    renderState(previous);
  }

  function onVisibilityChange(): void {
    if (document.hidden) autoPause();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const direction = KEY_DIRECTIONS[event.key];
    if (!direction) return;
    event.preventDefault();
    move(direction);
  }

  function onPointerDown(event: PointerEvent): void {
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas!.setPointerCapture(event.pointerId);
  }

  function onPointerUp(event: PointerEvent): void {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    pointerStart = undefined;
    if (canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId);
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 20) return;
    move(Math.abs(deltaX) > Math.abs(deltaY) ? (deltaX > 0 ? "right" : "left") : (deltaY > 0 ? "down" : "up"));
  }

  function onPointerCancel(event: PointerEvent): void {
    if (pointerStart?.id === event.pointerId) pointerStart = undefined;
  }

  function onClick(event: MouseEvent): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-labyrinth-action], [data-labyrinth-direction], [data-labyrinth-result-action]")
      : null;
    if (!target) return;
    const direction = target.dataset.labyrinthDirection as Direction | undefined;
    if (direction) move(direction);
    const action = target.dataset.labyrinthAction;
    const resultAction = target.dataset.labyrinthResultAction;
    if (action === "exit" || resultAction === "exit") exit();
    else if (action === "start") start();
    else if (action === "pause") togglePause();
    else if (action === "new") restart();
    else if (resultAction === "next") advanceTrail();
    else if (resultAction === "retry") retryTrail();
  }

  k.onDraw(drawBoard);
  k.onUpdate(() => {
    if (destroyed) return;
    elapsed += Math.min(k.dt(), 1 / 20);
  });
  container.addEventListener("click", onClick);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("blur", autoPause);
  document.addEventListener("visibilitychange", onVisibilityChange);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  renderState();

  return {
    destroy(): void {
      destroyed = true;
      pointerStart = undefined;
      container.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", autoPause);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      k.quit();
      container.innerHTML = "";
    },
  };
}
