import type { GameContext, GameInstance } from "../../platform/game";
import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  type ActivePiece,
  type Tetromino,
  type TetrisState,
  advanceGame,
  canPlace,
  cellsFor,
  createInitialState,
  dropInterval,
  ghostY,
  hardDrop,
  movePiece,
  pauseGame,
  restartGame,
  resumeGame,
  rotatePiece,
  softDrop,
  startGame,
} from "./logic";

const BEST_SCORE_KEY = "happy-arcade:tetris-best";
const CELL_SIZE = 40;
const BOARD_WIDTH = BOARD_COLUMNS * CELL_SIZE;
const BOARD_HEIGHT = BOARD_ROWS * CELL_SIZE;

const PIECE_COLORS: Record<Tetromino, readonly [number, number, number]> = {
  I: [34, 211, 238],
  O: [255, 212, 59],
  T: [177, 151, 252],
  S: [81, 207, 102],
  Z: [255, 107, 107],
  J: [77, 171, 247],
  L: [255, 146, 43],
};

function loadBestScore(): number {
  try {
    const value = Number.parseInt(localStorage.getItem(BEST_SCORE_KEY) ?? "0", 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(score: number): void {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // Storage is optional; play continues when unavailable.
  }
}

function pieceHex(kind: Tetromino): string {
  const [red, green, blue] = PIECE_COLORS[kind];
  return `rgb(${red} ${green} ${blue})`;
}

function nextPreview(kind: Tetromino): string {
  const occupied = new Set(cellsFor({ kind, rotation: 0, x: 0, y: 0 }).map(({ x, y }) => `${x},${y}`));
  return Array.from({ length: 16 }, (_, index) => {
    const x = index % 4;
    const y = Math.floor(index / 4);
    return `<span class="tetris-preview-cell${occupied.has(`${x},${y}`) ? " tetris-preview-cell--filled" : ""}" style="--piece-color:${pieceHex(kind)}"></span>`;
  }).join("");
}

function boardDescription(state: TetrisState): string {
  return `${state.board.filter(Boolean).length} settled blocks. Active ${state.active.kind} piece at column ${state.active.x + 1}, row ${state.active.y + 1}. Next piece ${state.next}.`;
}

export async function mount({ container, exit, kaplayReady, signal }: GameContext): Promise<GameInstance> {
  const { default: kaplay } = await (kaplayReady ?? import("kaplay"));
  if (signal?.aborted) return { destroy() {} };
  let state = createInitialState();
  let bestScore = loadBestScore();
  let destroyed = false;
  let pointerStart: { id: number; x: number; y: number } | undefined;

  container.innerHTML = `
    <main class="game-page tetris-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-tetris-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow tetris-eyebrow">Spatial puzzle</span>
          <h1>Tetris</h1>
        </div>
        <button class="icon-button" type="button" data-tetris-action="new" aria-label="Start a new Tetris game">↻</button>
      </header>

      <section class="tetris-game" aria-label="Tetris falling-block puzzle">
        <div class="tetris-mission">
          <div class="tetris-mission-icon" aria-hidden="true">🧩</div>
          <div>
            <p class="mission-title">Fit the shapes. Clear the lines!</p>
            <p class="mission-copy">Swipe or use the controls. Arrow keys and WASD work too.</p>
          </div>
          <div class="tetris-score-card"><span>Best</span><strong data-tetris-best>${bestScore}</strong></div>
        </div>

        <div class="tetris-workspace">
          <div class="tetris-play-layout">
            <div class="tetris-board-shell">
              <canvas
                class="tetris-canvas"
                data-tetris-canvas
                width="400"
                height="800"
                tabindex="0"
                role="img"
                aria-label="10 by 20 Tetris board. Swipe or use controls to move the falling piece."
              ></canvas>
            </div>

            <aside class="tetris-side" aria-label="Game information">
              <div class="tetris-stats">
                <div><span>Score</span><strong data-tetris-score>0</strong></div>
                <div><span>Lines</span><strong data-tetris-lines>0</strong></div>
                <div><span>Level</span><strong data-tetris-level>1</strong></div>
              </div>
              <div class="tetris-next" aria-label="Next piece">
                <strong>Next</strong>
                <div class="tetris-preview" data-tetris-next>${nextPreview(state.next)}</div>
              </div>
              <p class="tetris-tip"><span aria-hidden="true">👻</span> The dotted shape shows where your piece will land.</p>
            </aside>
          </div>

          <p class="tetris-message" data-tetris-message aria-live="polite">Press Start when your stacking plan is ready!</p>
          <p class="visually-hidden" data-tetris-summary>${boardDescription(state)}</p>

          <div class="tetris-pad" aria-label="Move falling piece">
            <button type="button" data-tetris-command="left" aria-label="Move piece left">←</button>
            <button type="button" data-tetris-command="rotate" aria-label="Rotate piece clockwise">↻<span>Rotate</span></button>
            <button type="button" data-tetris-command="right" aria-label="Move piece right">→</button>
            <button type="button" data-tetris-command="down" aria-label="Soft drop piece">↓<span>Down</span></button>
            <button type="button" data-tetris-command="drop" aria-label="Hard drop piece">⇊<span>Drop</span></button>
          </div>

          <div class="tetris-controls">
            <button class="soft-button" type="button" data-tetris-action="pause" disabled>Pause</button>
            <button class="check-button tetris-start" type="button" data-tetris-action="start">Start</button>
            <button class="soft-button" type="button" data-tetris-action="new">New game</button>
          </div>
        </div>
      </section>

      <div class="celebration" data-tetris-result aria-live="assertive" hidden></div>
    </main>`;

  const canvas = container.querySelector<HTMLCanvasElement>("[data-tetris-canvas]");
  const scoreElement = container.querySelector<HTMLElement>("[data-tetris-score]");
  const linesElement = container.querySelector<HTMLElement>("[data-tetris-lines]");
  const levelElement = container.querySelector<HTMLElement>("[data-tetris-level]");
  const bestElement = container.querySelector<HTMLElement>("[data-tetris-best]");
  const nextElement = container.querySelector<HTMLElement>("[data-tetris-next]");
  const messageElement = container.querySelector<HTMLElement>("[data-tetris-message]");
  const summaryElement = container.querySelector<HTMLElement>("[data-tetris-summary]");
  const pauseButton = container.querySelector<HTMLButtonElement>('[data-tetris-action="pause"]');
  const startButton = container.querySelector<HTMLButtonElement>('[data-tetris-action="start"]');
  const resultElement = container.querySelector<HTMLElement>("[data-tetris-result]");
  if (!canvas || !scoreElement || !linesElement || !levelElement || !bestElement || !nextElement || !messageElement || !summaryElement || !pauseButton || !startButton || !resultElement) {
    throw new Error("Tetris UI could not be created");
  }

  const k = kaplay({
    global: false,
    canvas,
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    background: [22, 32, 58],
    crisp: true,
    debug: false,
    focus: false,
    touchToMouse: false,
  });
  canvas.classList.add("tetris-canvas");

  function drawBlock(x: number, y: number, kind: Tetromino, opacity = 1, inset = 2): void {
    const [red, green, blue] = PIECE_COLORS[kind];
    k.drawRect({
      pos: k.vec2(x * CELL_SIZE + inset, y * CELL_SIZE + inset),
      width: CELL_SIZE - inset * 2,
      height: CELL_SIZE - inset * 2,
      radius: 7,
      color: k.rgb(red, green, blue),
      opacity,
      outline: { width: opacity < 1 ? 2 : 3, color: opacity < 1 ? k.rgb(red, green, blue) : k.rgb(36, 31, 69) },
    });
    if (opacity === 1) {
      k.drawRect({
        pos: k.vec2(x * CELL_SIZE + 8, y * CELL_SIZE + 7),
        width: CELL_SIZE - 16,
        height: 4,
        radius: 2,
        color: k.rgb(255, 255, 255),
        opacity: 0.4,
      });
    }
  }

  function visualPiece(): ActivePiece {
    if (state.status !== "running") return state.active;
    const next = { ...state.active, y: state.active.y + 1 };
    if (!canPlace(state.board, next)) return state.active;
    const progress = Math.min(0.92, state.dropElapsedMs / dropInterval(state.level));
    return { ...state.active, y: state.active.y + progress };
  }

  function drawBoard(): void {
    for (let y = 0; y < BOARD_ROWS; y += 1) {
      for (let x = 0; x < BOARD_COLUMNS; x += 1) {
        k.drawRect({
          pos: k.vec2(x * CELL_SIZE + 1, y * CELL_SIZE + 1),
          width: CELL_SIZE - 2,
          height: CELL_SIZE - 2,
          radius: 5,
          color: (x + y) % 2 === 0 ? k.rgb(34, 48, 82) : k.rgb(38, 54, 91),
        });
        const settled = state.board[y * BOARD_COLUMNS + x];
        if (settled) drawBlock(x, y, settled);
      }
    }

    const landing = ghostY(state);
    if (landing !== state.active.y) {
      for (const cell of cellsFor({ ...state.active, y: landing })) drawBlock(cell.x, cell.y, state.active.kind, 0.25, 5);
    }
    for (const cell of cellsFor(visualPiece())) drawBlock(cell.x, cell.y, state.active.kind);

    if (state.clearedRows.length > 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const row of state.clearedRows) {
        k.drawRect({ pos: k.vec2(0, row * CELL_SIZE), width: BOARD_WIDTH, height: CELL_SIZE, color: k.rgb(255, 255, 255), opacity: 0.18 });
      }
    }
  }

  function hideResult(): void {
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
  }

  function showResult(): void {
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card tetris-result-card" role="dialog" aria-modal="true" aria-labelledby="tetris-result-title">
        <div class="tetris-result-icon" aria-hidden="true">🌟</div>
        <p class="eyebrow tetris-eyebrow">Tower topped out</p>
        <h2 id="tetris-result-title">You scored ${state.score}</h2>
        <p>You cleared ${state.lines} ${state.lines === 1 ? "line" : "lines"}. Every shape made your spatial skills stronger!</p>
        <div class="result-actions">
          <button class="check-button tetris-result-button" type="button" data-tetris-result-action="again">Play again</button>
          <button class="text-button" type="button" data-tetris-result-action="exit">All games</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>('[data-tetris-result-action="again"]')?.focus();
  }

  function renderState(previous?: TetrisState): void {
    if (state.score > bestScore) {
      bestScore = state.score;
      saveBestScore(bestScore);
    }
    scoreElement!.textContent = String(state.score);
    linesElement!.textContent = String(state.lines);
    levelElement!.textContent = String(state.level);
    bestElement!.textContent = String(bestScore);
    nextElement!.innerHTML = nextPreview(state.next);
    summaryElement!.textContent = boardDescription(state);
    pauseButton!.disabled = state.status === "ready" || state.status === "lost";
    pauseButton!.textContent = state.status === "paused" ? "Resume" : "Pause";
    startButton!.hidden = state.status !== "ready";

    if (state.status === "ready") messageElement!.textContent = "Press Start when your stacking plan is ready!";
    else if (state.status === "paused") messageElement!.textContent = "Paused. Study the board, then press Resume.";
    else if (state.status === "running" && previous && state.lines > previous.lines) {
      const cleared = state.lines - previous.lines;
      messageElement!.textContent = `${cleared === 4 ? "Tetris!" : `${cleared} ${cleared === 1 ? "line" : "lines"} cleared!`} Level ${state.level}.`;
    } else if (state.status === "running") messageElement!.textContent = "Stack carefully and leave room for the next shape!";
    if (state.status === "lost" && previous?.status !== "lost") showResult();
  }

  function applyCommand(command: string): void {
    const previous = state;
    if (command === "left") state = movePiece(state, -1);
    if (command === "right") state = movePiece(state, 1);
    if (command === "rotate") state = rotatePiece(state);
    if (command === "down") state = softDrop(state);
    if (command === "drop") state = hardDrop(state);
    if (state !== previous && (state.score !== previous.score || state.lines !== previous.lines || state.active.kind !== previous.active.kind || state.status !== previous.status)) renderState(previous);
    canvas!.focus();
  }

  function restart(): void {
    state = restartGame();
    hideResult();
    renderState();
    canvas!.focus();
  }

  function start(): void {
    const previous = state;
    state = startGame(state);
    renderState(previous);
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
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const command = event.key === "ArrowLeft" || event.key === "a" || event.key === "A" ? "left"
      : event.key === "ArrowRight" || event.key === "d" || event.key === "D" ? "right"
      : event.key === "ArrowDown" || event.key === "s" || event.key === "S" ? "down"
      : event.key === "ArrowUp" || event.key === "w" || event.key === "W" ? "rotate"
      : event.key === " " ? "drop" : undefined;
    if (!command || (event.repeat && (command === "rotate" || command === "drop"))) return;
    event.preventDefault();
    applyCommand(command);
  }

  function onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas!.setPointerCapture(event.pointerId);
  }

  function onPointerUp(event: PointerEvent): void {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    pointerStart = undefined;
    if (canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId);
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 18) applyCommand("rotate");
    else if (Math.abs(deltaX) > Math.abs(deltaY)) applyCommand(deltaX > 0 ? "right" : "left");
    else if (deltaY > 90) applyCommand("drop");
    else if (deltaY > 0) applyCommand("down");
  }

  function onPointerCancel(event: PointerEvent): void {
    if (pointerStart?.id === event.pointerId) pointerStart = undefined;
  }

  function onContainerClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tetris-command], [data-tetris-action], [data-tetris-result-action]") : null;
    if (!target) return;
    if (target.dataset.tetrisCommand) applyCommand(target.dataset.tetrisCommand);
    if (target.dataset.tetrisAction === "exit" || target.dataset.tetrisResultAction === "exit") exit();
    if (target.dataset.tetrisAction === "new" || target.dataset.tetrisResultAction === "again") restart();
    if (target.dataset.tetrisAction === "start") start();
    if (target.dataset.tetrisAction === "pause") togglePause();
  }

  k.onDraw(drawBoard);
  k.onUpdate(() => {
    if (destroyed || state.status !== "running") return;
    const previous = state;
    state = advanceGame(state, Math.min(k.dt() * 1000, 50));
    if (state.active.kind !== previous.active.kind || state.lines !== previous.lines || state.score !== previous.score || state.status !== previous.status) renderState(previous);
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
