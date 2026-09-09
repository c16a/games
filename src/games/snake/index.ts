import type { GameContext, GameInstance } from "../../platform/game";
import {
  BOARD_SIZE,
  type Direction,
  type SnakeState,
  advanceSnake,
  createInitialState,
  pauseGame,
  queueDirection,
  restartGame,
  resumeGame,
  startGame,
} from "./logic";

type Speed = "easy" | "normal" | "fast";

const SPEEDS: Record<Speed, { label: string; milliseconds: number }> = {
  easy: { label: "Easy", milliseconds: 220 },
  normal: { label: "Normal", milliseconds: 150 },
  fast: { label: "Fast", milliseconds: 100 },
};

const KEY_DIRECTIONS: Record<string, Direction | undefined> = {
  ArrowUp: "up",
  w: "up",
  W: "up",
  ArrowDown: "down",
  s: "down",
  S: "down",
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
};

function bestScoreKey(speed: Speed): string {
  return `happy-arcade:snake-best:${speed}`;
}

function loadBestScore(speed: Speed): number {
  try {
    const value = Number.parseInt(localStorage.getItem(bestScoreKey(speed)) ?? "0", 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(speed: Speed, score: number): void {
  try {
    localStorage.setItem(bestScoreKey(speed), String(score));
  } catch {
    // Storage is optional; play continues normally when it is unavailable.
  }
}

function boardDescription(state: SnakeState): string {
  const head = state.snake[0]!;
  const snack = state.food ? `Snack at column ${state.food.x + 1}, row ${state.food.y + 1}.` : "No snack remains.";
  return `Snake head at column ${head.x + 1}, row ${head.y + 1}. ${snack} Length ${state.snake.length}.`;
}

export async function mount({ container, exit }: GameContext): Promise<GameInstance> {
  const { default: kaplay } = await import("kaplay");
  let speed: Speed = "normal";
  let state = createInitialState();
  let bestScore = loadBestScore(speed);
  let destroyed = false;
  let pointerStart: { id: number; x: number; y: number } | undefined;

  container.innerHTML = `
    <main class="game-page snake-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-snake-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow snake-eyebrow">Reflexes + planning</span>
          <h1>Snake</h1>
        </div>
        <button class="icon-button" type="button" data-snake-action="new" aria-label="Start a new Snake game">↻</button>
      </header>

      <section class="snake-game" aria-label="Snake game">
        <div class="snake-mission">
          <div class="snake-mission-icon" aria-hidden="true">🐍</div>
          <div>
            <p class="mission-title">Nibble snacks. Dodge your tail!</p>
            <p class="mission-copy">Swipe, use the arrow pad, or press arrow keys and WASD.</p>
          </div>
          <div class="snake-scores" aria-label="Scores">
            <div><span>Score</span><strong data-snake-score>0</strong></div>
            <div><span>Best</span><strong data-snake-best>${bestScore}</strong></div>
          </div>
        </div>

        <div class="snake-workspace">
          <div class="snake-speed" aria-label="Choose speed">
            ${Object.entries(SPEEDS).map(([id, option]) => `
              <button type="button" data-snake-speed="${id}" aria-pressed="${id === speed}">
                ${option.label}<span>${option.milliseconds} ms</span>
              </button>`).join("")}
          </div>

          <div class="snake-board-shell">
            <canvas
              class="snake-canvas"
              data-snake-canvas
              width="640"
              height="640"
              tabindex="0"
              role="img"
              aria-label="Snake board. Swipe or use controls to steer."
            ></canvas>
          </div>

          <p class="snake-message" data-snake-message aria-live="polite">Choose a speed, then start your snack hunt!</p>
          <p class="visually-hidden" data-snake-summary>${boardDescription(state)}</p>

          <div class="snake-pad" aria-label="Steer Snake">
            <button type="button" data-snake-direction="up" aria-label="Steer up">↑</button>
            <button type="button" data-snake-direction="left" aria-label="Steer left">←</button>
            <button type="button" data-snake-direction="down" aria-label="Steer down">↓</button>
            <button type="button" data-snake-direction="right" aria-label="Steer right">→</button>
          </div>

          <div class="snake-controls">
            <button class="soft-button" type="button" data-snake-action="pause" disabled>Pause</button>
            <button class="check-button snake-start" type="button" data-snake-action="start">Start</button>
            <button class="soft-button" type="button" data-snake-action="new">New game</button>
          </div>
        </div>
      </section>

      <div class="celebration" data-snake-result aria-live="assertive" hidden></div>
    </main>`;

  const canvas = container.querySelector<HTMLCanvasElement>("[data-snake-canvas]");
  const scoreElement = container.querySelector<HTMLElement>("[data-snake-score]");
  const bestElement = container.querySelector<HTMLElement>("[data-snake-best]");
  const messageElement = container.querySelector<HTMLElement>("[data-snake-message]");
  const summaryElement = container.querySelector<HTMLElement>("[data-snake-summary]");
  const pauseButton = container.querySelector<HTMLButtonElement>('[data-snake-action="pause"]');
  const startButton = container.querySelector<HTMLButtonElement>('[data-snake-action="start"]');
  const resultElement = container.querySelector<HTMLElement>("[data-snake-result]");
  if (!canvas || !scoreElement || !bestElement || !messageElement || !summaryElement || !pauseButton || !startButton || !resultElement) {
    throw new Error("Snake UI could not be created");
  }

  const k = kaplay({
    global: false,
    canvas,
    width: 640,
    height: 640,
    background: [25, 67, 64],
    crisp: true,
    debug: false,
    focus: false,
    touchToMouse: false,
  });
  canvas.classList.add("snake-canvas");

  function drawBoard(): void {
    const cellSize = 640 / BOARD_SIZE;
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        k.drawRect({
          pos: k.vec2(x * cellSize + 1, y * cellSize + 1),
          width: cellSize - 2,
          height: cellSize - 2,
          radius: 6,
          color: (x + y) % 2 === 0 ? k.rgb(38, 91, 82) : k.rgb(43, 101, 88),
        });
      }
    }

    if (state.food) {
      const center = k.vec2((state.food.x + 0.5) * cellSize, (state.food.y + 0.54) * cellSize);
      k.drawCircle({ pos: center, radius: cellSize * 0.27, color: k.rgb(255, 92, 122), anchor: "center", outline: { width: 3, color: k.rgb(36, 31, 69) } });
      k.drawRect({ pos: k.vec2(center.x - 2, center.y - cellSize * 0.38), width: 4, height: 9, radius: 2, color: k.rgb(91, 54, 18) });
      k.drawCircle({ pos: k.vec2(center.x + 6, center.y - cellSize * 0.31), radius: 5, color: k.rgb(81, 207, 102), anchor: "center" });
    }

    state.snake.toReversed().forEach((cell, reversedIndex) => {
      const index = state.snake.length - 1 - reversedIndex;
      const isHead = index === 0;
      const inset = isHead ? 3 : 5;
      const position = k.vec2(cell.x * cellSize + inset, cell.y * cellSize + inset);
      k.drawRect({
        pos: position,
        width: cellSize - inset * 2,
        height: cellSize - inset * 2,
        radius: isHead ? 12 : 10,
        color: isHead ? k.rgb(255, 212, 59) : k.rgb(81, 207, 102),
        outline: { width: 3, color: k.rgb(36, 31, 69) },
      });
      if (!isHead) {
        k.drawCircle({ pos: k.vec2((cell.x + 0.5) * cellSize, (cell.y + 0.5) * cellSize), radius: 4, color: k.rgb(22, 101, 52), anchor: "center" });
      }
    });

    const head = state.snake[0]!;
    const centerX = (head.x + 0.5) * cellSize;
    const centerY = (head.y + 0.5) * cellSize;
    const horizontal = state.direction === "left" || state.direction === "right";
    const forward = state.direction === "left" || state.direction === "up" ? -1 : 1;
    for (const side of [-1, 1]) {
      const eyeX = horizontal ? centerX + forward * 9 : centerX + side * 8;
      const eyeY = horizontal ? centerY + side * 8 : centerY + forward * 9;
      k.drawCircle({ pos: k.vec2(eyeX, eyeY), radius: 3.5, color: k.rgb(36, 31, 69), anchor: "center" });
    }
  }

  function hideResult(): void {
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
  }

  function showResult(): void {
    const won = state.status === "won";
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card snake-result-card" role="dialog" aria-modal="true" aria-labelledby="snake-result-title">
        <div class="snake-result-icon" aria-hidden="true">${won ? "🏆" : "🌟"}</div>
        <p class="eyebrow snake-eyebrow">${won ? "Board filled!" : "Great snack run!"}</p>
        <h2 id="snake-result-title">${won ? "Snake superstar!" : `You scored ${state.score}`}</h2>
        <p>${won ? "You planned every turn perfectly." : "Every run makes your reflexes sharper. Ready again?"}</p>
        <div class="result-actions">
          <button class="check-button snake-result-button" type="button" data-snake-result-action="again">Play again</button>
          <button class="text-button" type="button" data-snake-result-action="exit">All games</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>('[data-snake-result-action="again"]')?.focus();
  }

  function renderState(previous?: SnakeState): void {
    if (state.score > bestScore) {
      bestScore = state.score;
      saveBestScore(speed, bestScore);
    }
    scoreElement!.textContent = String(state.score);
    bestElement!.textContent = String(bestScore);
    summaryElement!.textContent = boardDescription(state);
    pauseButton!.disabled = state.status === "ready" || state.status === "lost" || state.status === "won";
    pauseButton!.textContent = state.status === "paused" ? "Resume" : "Pause";
    startButton!.hidden = state.status !== "ready";
    container.querySelectorAll<HTMLButtonElement>("[data-snake-speed]").forEach((button) => {
      button.disabled = state.status !== "ready";
      button.setAttribute("aria-pressed", String(button.dataset.snakeSpeed === speed));
    });

    if (state.status === "ready") messageElement!.textContent = "Choose a speed, then start your snack hunt!";
    else if (state.status === "paused") messageElement!.textContent = "Paused. Take your time—press Resume when ready.";
    else if (state.status === "running" && previous?.score !== state.score) messageElement!.textContent = `Yum! Score ${state.score}. Keep going!`;
    else if (state.status === "running") messageElement!.textContent = "Snack hunt started—watch that growing tail!";

    if ((state.status === "lost" || state.status === "won") && previous?.status !== state.status) showResult();
  }

  function steer(direction: Direction): void {
    const next = queueDirection(state, direction);
    if (next !== state) state = next;
  }

  function start(): void {
    const previous = state;
    state = startGame(state);
    hideResult();
    renderState(previous);
    canvas!.focus();
  }

  function restart(): void {
    state = restartGame(state);
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
    steer(direction);
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
    steer(Math.abs(deltaX) > Math.abs(deltaY) ? (deltaX > 0 ? "right" : "left") : (deltaY > 0 ? "down" : "up"));
  }

  function onPointerCancel(event: PointerEvent): void {
    if (pointerStart?.id === event.pointerId) pointerStart = undefined;
  }

  function onContainerClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-snake-action], [data-snake-direction], [data-snake-speed], [data-snake-result-action]") : null;
    if (!target) return;
    const direction = target.dataset.snakeDirection as Direction | undefined;
    if (direction) steer(direction);
    if (target.dataset.snakeSpeed) {
      speed = target.dataset.snakeSpeed as Speed;
      bestScore = loadBestScore(speed);
      renderState();
    }
    if (target.dataset.snakeAction === "exit" || target.dataset.snakeResultAction === "exit") exit();
    if (target.dataset.snakeAction === "start") start();
    if (target.dataset.snakeAction === "pause") togglePause();
    if (target.dataset.snakeAction === "new" || target.dataset.snakeResultAction === "again") restart();
  }

  k.onDraw(drawBoard);
  k.onUpdate(() => {
    if (destroyed || state.status !== "running") return;
    const previous = state;
    const stepMs = SPEEDS[speed].milliseconds;
    state = advanceSnake(state, Math.min(k.dt() * 1000, stepMs), stepMs);
    if (state !== previous && (state.snake[0] !== previous.snake[0] || state.status !== previous.status || state.score !== previous.score)) {
      renderState(previous);
    }
  });

  container.addEventListener("click", onContainerClick);
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
      container.removeEventListener("click", onContainerClick);
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
