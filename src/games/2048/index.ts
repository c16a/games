import type { GameContext, GameInstance } from "../../platform/game";
import {
  BOARD_SIZE,
  type Board,
  type Direction,
  type GameState,
  type TurnResult,
  canMove,
  createInitialState,
  moveBoard,
  takeTurn,
  undoTurn,
} from "./logic";

const BEST_SCORE_KEY = "happy-arcade:2048-best-score";
const DIRECTIONS: readonly Direction[] = ["up", "left", "down", "right"];

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

function tileClass(value: number): string {
  if (value === 0) return "tile-empty";
  if (value > 2048) return "tile-super";
  return `tile-${value}`;
}

function boardSummary(board: Board): string {
  return board.map((value) => value || "empty").join(", ");
}

export function mount({ container, exit }: GameContext): GameInstance {
  let state: GameState = createInitialState();
  let bestScore = loadBestScore();
  let winCelebrated = false;
  let gameOver = false;
  let outcomePending = false;
  let moveAnimating = false;
  let pointerStart: { id: number; x: number; y: number } | undefined;
  let outcomeTimer: number | undefined;
  let animationRun = 0;
  const activeAnimations = new Set<Animation>();
  const animationGhosts = new Set<HTMLElement>();

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
          <div
            class="twenty-board"
            data-2048-board
            role="grid"
            tabindex="0"
            aria-label="2048 board. Swipe or use arrow keys to move tiles."
          ></div>

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

  const boardElement = container.querySelector<HTMLElement>("[data-2048-board]");
  const scoreElement = container.querySelector<HTMLElement>("[data-2048-score]");
  const bestElement = container.querySelector<HTMLElement>("[data-2048-best]");
  const messageElement = container.querySelector<HTMLElement>("[data-2048-message]");
  const undoButton = container.querySelector<HTMLButtonElement>('[data-2048-action="undo"]');
  const resultElement = container.querySelector<HTMLElement>("[data-2048-result]");

  if (!boardElement || !scoreElement || !bestElement || !messageElement || !undoButton || !resultElement) {
    throw new Error("2048 UI could not be created");
  }

  function updateBestScore(): void {
    if (state.score <= bestScore) return;
    bestScore = state.score;
    bestElement!.textContent = String(bestScore);
    saveBestScore(bestScore);
  }

  function clearBoardMotion(): void {
    animationRun += 1;
    activeAnimations.forEach((animation) => animation.cancel());
    animationGhosts.forEach((ghost) => ghost.remove());
    activeAnimations.clear();
    animationGhosts.clear();
    moveAnimating = false;
    boardElement!.classList.remove(
      "twenty-board--dragging",
    );
    boardElement!.style.removeProperty("--drag-x");
    boardElement!.style.removeProperty("--drag-y");
  }

  function clearPendingOutcome(): void {
    if (outcomeTimer !== undefined) window.clearTimeout(outcomeTimer);
    outcomeTimer = undefined;
    outcomePending = false;
  }

  function afterMoveAnimation(action: () => void): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      action();
      return;
    }
    outcomePending = true;
    outcomeTimer = window.setTimeout(() => {
      outcomeTimer = undefined;
      outcomePending = false;
      action();
    }, 330);
  }

  function renderBoard(effects?: { mergedIndices?: number[]; spawnedIndex?: number; hiddenIndices?: number[] }): void {
    const mergedIndices = new Set(effects?.mergedIndices ?? []);
    const hiddenIndices = new Set(effects?.hiddenIndices ?? []);
    boardElement!.innerHTML = state.board.map((value, index) => {
      const row = Math.floor(index / BOARD_SIZE) + 1;
      const column = index % BOARD_SIZE + 1;
      const mergedClass = mergedIndices.has(index) ? " twenty-cell--merged" : "";
      const spawnedClass = effects?.spawnedIndex === index ? " twenty-cell--spawned" : "";
      const hiddenClass = hiddenIndices.has(index) ? " twenty-cell--waiting" : "";
      return `
        <div
          class="twenty-cell ${tileClass(value)}${mergedClass}${spawnedClass}${hiddenClass}"
          role="gridcell"
          aria-label="Row ${row}, column ${column}: ${value === 0 ? "empty" : value}"
        >${value === 0 ? "" : `<span>${value}</span>`}</div>`;
    }).join("");
    boardElement!.setAttribute("aria-description", boardSummary(state.board));
    scoreElement!.textContent = String(state.score);
    bestElement!.textContent = String(bestScore);
    undoButton!.disabled = !state.undo || gameOver;
  }

  interface TileVisual {
    rect: DOMRect;
    ghost: HTMLElement;
  }

  function captureTileVisuals(): Array<TileVisual | undefined> {
    return [...boardElement!.querySelectorAll<HTMLElement>(".twenty-cell")].map((cell) => {
      if (cell.classList.contains("tile-empty")) return undefined;
      const ghost = cell.cloneNode(true) as HTMLElement;
      ghost.classList.remove("twenty-cell--merged", "twenty-cell--spawned", "twenty-cell--waiting");
      ghost.classList.add("twenty-cell--ghost");
      ghost.setAttribute("aria-hidden", "true");
      return { rect: cell.getBoundingClientRect(), ghost };
    });
  }

  function finishTurnOutcome(result: TurnResult): void {
    if (result.created2048 && !winCelebrated) afterMoveAnimation(showWin);
    else if (!canMove(state.board)) afterMoveAnimation(showGameOver);
  }

  function animateTurn(result: TurnResult, sources: Array<TileVisual | undefined>): void {
    clearBoardMotion();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const moving = result.motions.filter((motion) => motion.from !== motion.to || motion.merged);

    if (reducedMotion || moving.length === 0) {
      renderBoard({ mergedIndices: result.mergedIndices, spawnedIndex: result.spawnedIndex });
      finishTurnOutcome(result);
      return;
    }

    moveAnimating = true;
    const hiddenIndices = [...new Set([...moving.map(({ to }) => to), result.spawnedIndex].filter((index): index is number => index !== undefined))];
    renderBoard({ hiddenIndices });
    const targets = [...boardElement!.querySelectorAll<HTMLElement>(".twenty-cell")].map((cell) => cell.getBoundingClientRect());
    const run = animationRun;
    const animations: Animation[] = [];

    for (const motion of moving) {
      const source = sources[motion.from];
      const target = targets[motion.to];
      if (!source || !target) continue;

      const ghost = source.ghost;
      Object.assign(ghost.style, {
        left: `${source.rect.left}px`,
        top: `${source.rect.top}px`,
        width: `${source.rect.width}px`,
        height: `${source.rect.height}px`,
      });
      document.body.append(ghost);
      animationGhosts.add(ghost);

      const columns = Math.abs((motion.from % BOARD_SIZE) - (motion.to % BOARD_SIZE));
      const rows = Math.abs(Math.floor(motion.from / BOARD_SIZE) - Math.floor(motion.to / BOARD_SIZE));
      const distance = Math.max(columns, rows);
      const animation = ghost.animate([
        { transform: "translate3d(0, 0, 0) scale(1)" },
        {
          transform: `translate3d(${target.left - source.rect.left}px, ${target.top - source.rect.top}px, 0) scale(${motion.merged ? 0.92 : 1})`,
        },
      ], {
        duration: 145 + distance * 55,
        easing: "cubic-bezier(.2, .82, .25, 1)",
        fill: "forwards",
      });
      activeAnimations.add(animation);
      animations.push(animation);
    }

    Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => {
      if (run !== animationRun) return;
      activeAnimations.clear();
      animationGhosts.forEach((ghost) => ghost.remove());
      animationGhosts.clear();
      moveAnimating = false;
      renderBoard({ mergedIndices: result.mergedIndices, spawnedIndex: result.spawnedIndex });
      finishTurnOutcome(result);
    });
  }

  function hideResult(): void {
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
  }

  function newGame(): void {
    clearPendingOutcome();
    clearBoardMotion();
    state = createInitialState();
    winCelebrated = false;
    gameOver = false;
    hideResult();
    messageElement!.textContent = "Join matching tiles and build the biggest number you can!";
    renderBoard();
    boardElement!.focus();
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
    undoButton!.disabled = true;
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

  function move(direction: Direction, capturedSources?: Array<TileVisual | undefined>): void {
    if (gameOver || moveAnimating || outcomePending || !resultElement!.hidden) return;
    const sources = capturedSources ?? captureTileVisuals();
    const result = takeTurn(state, direction);

    if (!result.moved) {
      messageElement!.textContent = "Those tiles cannot move that way—try another direction!";
      return;
    }

    state = result.state;
    updateBestScore();
    messageElement!.textContent = result.scoreGained > 0
      ? `Nice match! +${result.scoreGained} points.`
      : "Smooth slide! Look for a matching pair.";
    animateTurn(result, sources);
  }

  function undo(): void {
    if (!state.undo || gameOver || moveAnimating || outcomePending || !resultElement!.hidden) return;
    clearBoardMotion();
    state = undoTurn(state);
    messageElement!.textContent = "Last move undone. Choose your next slide!";
    renderBoard();
    boardElement!.focus();
  }

  function continuePlaying(): void {
    hideResult();
    messageElement!.textContent = "Amazing! How high can you climb?";
    if (!canMove(state.board)) showGameOver();
    else boardElement!.focus();
  }

  function onClick(event: Event): void {
    const target = event.target as HTMLElement;
    const direction = target.closest<HTMLButtonElement>("[data-2048-direction]")?.dataset["2048Direction"] as Direction | undefined;
    const action = target.closest<HTMLButtonElement>("[data-2048-action]")?.dataset["2048Action"];
    const resultAction = target.closest<HTMLButtonElement>("[data-2048-result-action]")?.dataset["2048ResultAction"];

    if (direction && DIRECTIONS.includes(direction)) move(direction);
    else if (action === "exit" || resultAction === "exit") exit();
    else if (action === "new" || resultAction === "new") newGame();
    else if (action === "undo") undo();
    else if (resultAction === "continue") continuePlaying();
  }

  function onKeyDown(event: KeyboardEvent): void {
    const keyDirections: Record<string, Direction | undefined> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "up",
      W: "up",
      s: "down",
      S: "down",
      a: "left",
      A: "left",
      d: "right",
      D: "right",
    };
    const direction = keyDirections[event.key];
    if (!direction) return;
    event.preventDefault();
    move(direction);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (gameOver || moveAnimating || outcomePending || !resultElement!.hidden) return;
    clearBoardMotion();
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    boardElement!.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 3) return;

    const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    const direction: Direction = horizontal
      ? deltaX > 0 ? "right" : "left"
      : deltaY > 0 ? "down" : "up";
    const resistance = moveBoard(state.board, direction).moved ? 1 : 0.18;
    const maxOffset = Math.min(44, boardElement!.clientWidth * 0.12);
    const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    const scale = (distance > maxOffset ? maxOffset / distance : 1) * resistance;
    boardElement!.style.setProperty("--drag-x", `${horizontal ? deltaX * scale : 0}px`);
    boardElement!.style.setProperty("--drag-y", `${horizontal ? 0 : deltaY * scale}px`);
    boardElement!.classList.add("twenty-board--dragging");
  }

  function endPointerDrag(event?: PointerEvent): { deltaX: number; deltaY: number; endedInside: boolean } | undefined {
    if (!pointerStart || (event && pointerStart.id !== event.pointerId)) return undefined;
    const start = pointerStart;
    pointerStart = undefined;
    const deltaX = event ? event.clientX - start.x : 0;
    const deltaY = event ? event.clientY - start.y : 0;
    const bounds = boardElement!.getBoundingClientRect();
    const endedInside = Boolean(event)
      && event!.clientX >= bounds.left
      && event!.clientX <= bounds.right
      && event!.clientY >= bounds.top
      && event!.clientY <= bounds.bottom;
    boardElement!.classList.remove("twenty-board--dragging");
    boardElement!.style.removeProperty("--drag-x");
    boardElement!.style.removeProperty("--drag-y");
    return { deltaX, deltaY, endedInside };
  }

  function onPointerUp(event: PointerEvent): void {
    const sources = captureTileVisuals();
    const drag = endPointerDrag(event);
    if (!drag || !drag.endedInside) return;
    const { deltaX, deltaY } = drag;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) return;
    move(Math.abs(deltaX) > Math.abs(deltaY)
      ? deltaX > 0 ? "right" : "left"
      : deltaY > 0 ? "down" : "up", sources);
  }

  function onPointerCancel(): void {
    endPointerDrag();
  }

  container.addEventListener("click", onClick);
  window.addEventListener("keydown", onKeyDown);
  boardElement.addEventListener("pointerdown", onPointerDown);
  boardElement.addEventListener("pointermove", onPointerMove);
  boardElement.addEventListener("pointerup", onPointerUp);
  boardElement.addEventListener("pointercancel", onPointerCancel);
  renderBoard();

  return {
    destroy() {
      pointerStart = undefined;
      clearPendingOutcome();
      clearBoardMotion();
      container.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
      boardElement.removeEventListener("pointerdown", onPointerDown);
      boardElement.removeEventListener("pointermove", onPointerMove);
      boardElement.removeEventListener("pointerup", onPointerUp);
      boardElement.removeEventListener("pointercancel", onPointerCancel);
      container.innerHTML = "";
    },
  };
}
