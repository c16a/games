import type { GameContext, GameInstance } from "../../platform/game";
import {
  BOARD_SIZE,
  type Board,
  type Direction,
  type GameState,
  type TurnResult,
  canMove,
  createInitialState,
  previewTileOffsets,
  takeTurn,
  undoTurn,
} from "./logic";

const BEST_SCORE_KEY = "happy-arcade:2048-best-score";
const DIRECTIONS: readonly Direction[] = ["up", "left", "down", "right"];
const CANVAS_SIZE = 640;
const BOARD_PADDING = 18;
const CELL_GAP = 12;
const CELL_SIZE = (CANVAS_SIZE - BOARD_PADDING * 2 - CELL_GAP * (BOARD_SIZE - 1)) / BOARD_SIZE;

const TILE_COLORS: Record<number, readonly [number, number, number]> = {
  2: [255, 243, 191],
  4: [255, 224, 102],
  8: [255, 146, 43],
  16: [247, 103, 7],
  32: [240, 62, 62],
  64: [214, 51, 108],
  128: [156, 54, 181],
  256: [112, 72, 232],
  512: [66, 99, 235],
  1024: [25, 113, 194],
  2048: [255, 212, 59],
};

interface Point {
  x: number;
  y: number;
}

interface DragPreview {
  direction: Direction;
  distance: number;
}

type BoardAnimation =
  | { phase: "slide"; result: TurnResult; elapsed: number; duration: number; direction: Direction; startOffsets: number[] }
  | { phase: "pop"; result: TurnResult; elapsed: number; duration: number };

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
    // The game remains playable when storage is unavailable.
  }
}

function boardSummary(board: Board): string {
  return board.map((value) => value || "empty").join(", ");
}

function cellPosition(index: number): Point {
  return {
    x: BOARD_PADDING + (index % BOARD_SIZE) * (CELL_SIZE + CELL_GAP),
    y: BOARD_PADDING + Math.floor(index / BOARD_SIZE) * (CELL_SIZE + CELL_GAP),
  };
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function tileFontSize(value: number): number {
  const digits = String(value).length;
  if (digits <= 2) return 58;
  if (digits === 3) return 49;
  if (digits === 4) return 40;
  return 31;
}

function usesDarkText(value: number): boolean {
  return value <= 4 || value === 2048;
}

export async function mount({ container, exit, kaplayReady, signal }: GameContext): Promise<GameInstance> {
  const { default: kaplay } = await (kaplayReady ?? import("kaplay"));
  if (signal?.aborted) return { destroy() {} };
  let state: GameState = createInitialState();
  let bestScore = loadBestScore();
  let winCelebrated = false;
  let gameOver = false;
  let destroyed = false;
  let animation: BoardAnimation | undefined;
  let pointerStart: { id: number; x: number; y: number } | undefined;
  let dragPreview: DragPreview | undefined;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  container.innerHTML = `
    <main class="game-page twenty-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-2048-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow twenty-eyebrow">Number puzzle</span>
          <h1>2048</h1>
        </div>
        <button class="icon-button" type="button" data-2048-action="new" aria-label="Start a new 2048 game">↻</button>
      </header>

      <section class="twenty-game" aria-label="2048 number puzzle">
        <div class="twenty-mission">
          <div class="twenty-mission-icon" aria-hidden="true">🔢</div>
          <div>
            <p class="mission-title">Match numbers to reach 2048!</p>
            <p class="mission-copy">Swipe the board or use arrow keys and WASD.</p>
          </div>
          <div class="twenty-scores" aria-label="Scores">
            <div><span>Score</span><strong data-2048-score>0</strong></div>
            <div><span>Best</span><strong data-2048-best>${bestScore}</strong></div>
          </div>
        </div>

        <div class="twenty-workspace">
          <div class="twenty-board-shell">
            <canvas
              class="twenty-canvas"
              data-2048-canvas
              width="${CANVAS_SIZE}"
              height="${CANVAS_SIZE}"
              role="img"
              tabindex="0"
              aria-label="2048 board. Swipe or use arrow keys to move tiles."
            ></canvas>
          </div>
          <p class="visually-hidden" data-2048-summary>${boardSummary(state.board)}</p>

          <p class="twenty-message" data-2048-message aria-live="polite">Join matching tiles and build the biggest number you can!</p>

          <div class="twenty-directions" aria-label="Move tiles">
            <button type="button" data-2048-direction="up" aria-label="Move tiles up">↑</button>
            <button type="button" data-2048-direction="left" aria-label="Move tiles left">←</button>
            <button type="button" data-2048-direction="down" aria-label="Move tiles down">↓</button>
            <button type="button" data-2048-direction="right" aria-label="Move tiles right">→</button>
          </div>

          <div class="twenty-controls">
            <button class="soft-button twenty-undo" type="button" data-2048-action="undo" disabled>↶ Undo</button>
            <button class="check-button twenty-new-button" type="button" data-2048-action="new">New game</button>
          </div>
        </div>
      </section>

      <div class="celebration" data-2048-result aria-live="assertive" hidden></div>
    </main>`;

  const canvas = container.querySelector<HTMLCanvasElement>("[data-2048-canvas]");
  const scoreElement = container.querySelector<HTMLElement>("[data-2048-score]");
  const bestElement = container.querySelector<HTMLElement>("[data-2048-best]");
  const summaryElement = container.querySelector<HTMLElement>("[data-2048-summary]");
  const messageElement = container.querySelector<HTMLElement>("[data-2048-message]");
  const undoButton = container.querySelector<HTMLButtonElement>('[data-2048-action="undo"]');
  const resultElement = container.querySelector<HTMLElement>("[data-2048-result]");

  if (!canvas || !scoreElement || !bestElement || !summaryElement || !messageElement || !undoButton || !resultElement) {
    throw new Error("2048 UI could not be created");
  }

  const k = kaplay({
    global: false,
    canvas,
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    background: [111, 90, 82],
    crisp: true,
    debug: false,
    focus: false,
    touchToMouse: false,
  });
  canvas.classList.add("twenty-canvas");

  function tileColor(value: number): ReturnType<typeof k.rgb> {
    const [red, green, blue] = TILE_COLORS[value] ?? [23, 59, 66];
    return k.rgb(red, green, blue);
  }

  function drawTile(value: number, position: Point, scale = 1, opacity = 1): void {
    const size = CELL_SIZE * scale;
    const inset = (CELL_SIZE - size) / 2;
    const x = position.x + inset;
    const y = position.y + inset;
    const radius = Math.max(9, 18 * scale);

    k.drawRect({ pos: k.vec2(x + 5 * scale, y + 6 * scale), width: size, height: size, radius, color: k.rgb(36, 31, 69), opacity: opacity * 0.28 });
    k.drawRect({
      pos: k.vec2(x, y),
      width: size,
      height: size,
      radius,
      color: tileColor(value),
      opacity,
      outline: { width: Math.max(2, 3 * scale), color: k.rgb(36, 31, 69) },
    });
    k.drawRect({
      pos: k.vec2(x + 11 * scale, y + 9 * scale),
      width: Math.max(0, size - 22 * scale),
      height: Math.max(3, 7 * scale),
      radius: 4,
      color: k.rgb(255, 255, 255),
      opacity: opacity * (value === 2048 ? 0.52 : 0.3),
    });
    k.drawText({
      text: String(value),
      pos: k.vec2(position.x + CELL_SIZE / 2, position.y + CELL_SIZE / 2 + 2),
      size: tileFontSize(value) * scale,
      font: "sans-serif",
      color: usesDarkText(value) ? k.rgb(46, 38, 66) : k.rgb(255, 255, 255),
      opacity,
      anchor: "center",
    });
  }

  function drawBoard(): void {
    for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
      const position = cellPosition(index);
      k.drawRect({
        pos: k.vec2(position.x, position.y),
        width: CELL_SIZE,
        height: CELL_SIZE,
        radius: 18,
        color: k.rgb(139, 119, 109),
        outline: { width: 2, color: k.rgb(74, 61, 68) },
      });
    }

    if (animation?.phase === "slide") {
      const progress = easeOutCubic(Math.min(1, animation.elapsed / animation.duration));
      for (const motion of animation.result.motions) {
        const from = cellPosition(motion.from);
        const to = cellPosition(motion.to);
        const startOffset = (animation.startOffsets[motion.from] ?? 0) * (CELL_SIZE + CELL_GAP);
        const startX = animation.direction === "left" || animation.direction === "right" ? startOffset : 0;
        const startY = animation.direction === "up" || animation.direction === "down" ? startOffset : 0;
        drawTile(motion.value, {
          x: from.x + startX * (1 - progress) + (to.x - from.x) * progress,
          y: from.y + startY * (1 - progress) + (to.y - from.y) * progress,
        }, motion.merged ? 1 - progress * 0.08 : 1);
      }
      return;
    }

    if (dragPreview) {
      const offsets = previewTileOffsets(state.board, dragPreview.direction, dragPreview.distance);
      const horizontal = dragPreview.direction === "left" || dragPreview.direction === "right";
      state.board.forEach((value, index) => {
        if (value === 0) return;
        const position = cellPosition(index);
        const offset = (offsets[index] ?? 0) * (CELL_SIZE + CELL_GAP);
        drawTile(value, {
          x: position.x + (horizontal ? offset : 0),
          y: position.y + (horizontal ? 0 : offset),
        });
      });
      return;
    }

    const merged = animation?.phase === "pop" ? new Set(animation.result.mergedIndices) : undefined;
    const spawned = animation?.phase === "pop" ? animation.result.spawnedIndex : undefined;
    const popProgress = animation?.phase === "pop" ? Math.min(1, animation.elapsed / animation.duration) : 1;

    state.board.forEach((value, index) => {
      if (value === 0) return;
      let scale = 1;
      let opacity = 1;
      if (index === spawned) {
        scale = 0.25 + 0.75 * easeOutCubic(popProgress);
        opacity = popProgress;
      } else if (merged?.has(index)) {
        scale = popProgress < 0.55
          ? 1 + (popProgress / 0.55) * 0.22
          : 1.22 - ((popProgress - 0.55) / 0.45) * 0.22;
      }
      drawTile(value, cellPosition(index), scale, opacity);
    });
  }

  function updateInterface(): void {
    if (state.score > bestScore) {
      bestScore = state.score;
      saveBestScore(bestScore);
    }
    scoreElement!.textContent = String(state.score);
    bestElement!.textContent = String(bestScore);
    summaryElement!.textContent = boardSummary(state.board);
    undoButton!.disabled = !state.undo || gameOver || Boolean(animation);
  }

  function hideResult(): void {
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
  }

  function showWin(): void {
    winCelebrated = true;
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card twenty-result-card" role="dialog" aria-modal="true" aria-labelledby="2048-win-title">
        <div class="twenty-trophy" aria-hidden="true">🏆</div>
        <p class="eyebrow twenty-eyebrow">You made 2048!</p>
        <h2 id="2048-win-title">Number hero!</h2>
        <p>Keep combining for an even bigger tile, or begin a fresh board.</p>
        <div class="result-actions">
          <button class="check-button twenty-result-button" type="button" data-2048-result-action="continue">Keep playing</button>
          <button class="text-button" type="button" data-2048-result-action="new">New game</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>('[data-2048-result-action="continue"]')?.focus();
  }

  function showGameOver(): void {
    gameOver = true;
    updateInterface();
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card twenty-result-card" role="dialog" aria-modal="true" aria-labelledby="2048-over-title">
        <div class="twenty-trophy" aria-hidden="true">🌟</div>
        <p class="eyebrow twenty-eyebrow">Board full</p>
        <h2 id="2048-over-title">Great number run!</h2>
        <p>You scored <strong>${state.score}</strong>. Ready to build another giant tile?</p>
        <div class="result-actions">
          <button class="check-button twenty-result-button" type="button" data-2048-result-action="new">Play again</button>
          <button class="text-button" type="button" data-2048-result-action="exit">All games</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>('[data-2048-result-action="new"]')?.focus();
  }

  function finishTurn(result: TurnResult): void {
    updateInterface();
    if (result.created2048 && !winCelebrated) showWin();
    else if (!canMove(state.board)) showGameOver();
  }

  function beginAnimation(result: TurnResult, direction: Direction, startOffsets: number[]): void {
    if (reducedMotion) {
      animation = undefined;
      finishTurn(result);
      return;
    }
    const distance = Math.max(...result.motions.map((motion) => {
      const columns = Math.abs((motion.from % BOARD_SIZE) - (motion.to % BOARD_SIZE));
      const rows = Math.abs(Math.floor(motion.from / BOARD_SIZE) - Math.floor(motion.to / BOARD_SIZE));
      return Math.max(columns, rows);
    }));
    animation = { phase: "slide", result, elapsed: 0, duration: 0.13 + distance * 0.055, direction, startOffsets };
    updateInterface();
  }

  function move(direction: Direction, startOffsets = Array<number>(BOARD_SIZE * BOARD_SIZE).fill(0)): void {
    if (gameOver || animation || !resultElement!.hidden) return;
    const result = takeTurn(state, direction);
    if (!result.moved) {
      messageElement!.textContent = "Those tiles cannot move that way—try another direction!";
      return;
    }

    state = result.state;
    messageElement!.textContent = result.scoreGained > 0
      ? `Nice match! +${result.scoreGained} points.`
      : "Smooth slide! Look for a matching pair.";
    beginAnimation(result, direction, startOffsets);
  }

  function newGame(): void {
    state = createInitialState();
    winCelebrated = false;
    gameOver = false;
    animation = undefined;
    pointerStart = undefined;
    dragPreview = undefined;
    hideResult();
    messageElement!.textContent = "Join matching tiles and build the biggest number you can!";
    updateInterface();
    canvas!.focus();
  }

  function undo(): void {
    if (!state.undo || gameOver || animation || !resultElement!.hidden) return;
    state = undoTurn(state);
    dragPreview = undefined;
    messageElement!.textContent = "Last move undone. Choose your next slide!";
    updateInterface();
    canvas!.focus();
  }

  function continuePlaying(): void {
    hideResult();
    messageElement!.textContent = "Amazing! How high can you climb?";
    if (!canMove(state.board)) showGameOver();
    else canvas!.focus();
  }

  function onClick(event: MouseEvent): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-2048-action], [data-2048-direction], [data-2048-result-action]")
      : null;
    if (!target) return;
    const direction = target.dataset["2048Direction"] as Direction | undefined;
    const action = target.dataset["2048Action"];
    const resultAction = target.dataset["2048ResultAction"];

    if (direction && DIRECTIONS.includes(direction)) move(direction);
    else if (action === "exit" || resultAction === "exit") exit();
    else if (action === "new" || resultAction === "new") newGame();
    else if (action === "undo") undo();
    else if (resultAction === "continue") continuePlaying();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const keyDirections: Record<string, Direction | undefined> = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      w: "up", W: "up", s: "down", S: "down", a: "left", A: "left", d: "right", D: "right",
    };
    const direction = keyDirections[event.key];
    if (!direction) return;
    event.preventDefault();
    move(direction);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (gameOver || animation || !resultElement!.hidden) return;
    event.preventDefault();
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas!.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 3) return;

    const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    const direction: Direction = horizontal
      ? deltaX > 0 ? "right" : "left"
      : deltaY > 0 ? "down" : "up";
    const scaleToCanvas = CANVAS_SIZE / canvas!.getBoundingClientRect().width;
    const raw = (horizontal ? deltaX : deltaY) * scaleToCanvas;
    dragPreview = {
      direction,
      distance: Math.min(Math.abs(raw), 58) / (CELL_SIZE + CELL_GAP),
    };
  }

  function finishPointer(event?: PointerEvent): { deltaX: number; deltaY: number; preview?: DragPreview } | undefined {
    if (!pointerStart || (event && pointerStart.id !== event.pointerId)) return undefined;
    const start = pointerStart;
    const preview = dragPreview;
    pointerStart = undefined;
    dragPreview = undefined;
    if (event && canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId);
    return { deltaX: event ? event.clientX - start.x : 0, deltaY: event ? event.clientY - start.y : 0, preview };
  }

  function onPointerUp(event: PointerEvent): void {
    const drag = finishPointer(event);
    if (!drag || Math.max(Math.abs(drag.deltaX), Math.abs(drag.deltaY)) < 24) return;
    const direction: Direction = Math.abs(drag.deltaX) > Math.abs(drag.deltaY)
      ? drag.deltaX > 0 ? "right" : "left"
      : drag.deltaY > 0 ? "down" : "up";
    const startOffsets = drag.preview?.direction === direction
      ? previewTileOffsets(state.board, direction, drag.preview.distance)
      : undefined;
    move(direction, startOffsets);
  }

  function onPointerCancel(event: PointerEvent): void {
    finishPointer(event);
  }

  k.onDraw(drawBoard);
  k.onUpdate(() => {
    if (destroyed || !animation) return;
    animation.elapsed += Math.min(k.dt(), 1 / 20);
    if (animation.elapsed < animation.duration) return;

    if (animation.phase === "slide") {
      animation = { phase: "pop", result: animation.result, elapsed: 0, duration: 0.24 };
    } else {
      const result = animation.result;
      animation = undefined;
      finishTurn(result);
    }
  });

  container.addEventListener("click", onClick);
  window.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  updateInterface();

  return {
    destroy(): void {
      destroyed = true;
      animation = undefined;
      pointerStart = undefined;
      dragPreview = undefined;
      container.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      k.quit();
      container.innerHTML = "";
    },
  };
}
