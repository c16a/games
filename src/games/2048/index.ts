import type { GameContext, GameInstance } from "../../platform/game";
import {
  BOARD_SIZE,
  type Board,
  type Direction,
  type GameState,
  canMove,
  createInitialState,
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
  let pointerStart: { id: number; x: number; y: number } | undefined;

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

  function renderBoard(): void {
    boardElement!.innerHTML = state.board.map((value, index) => {
      const row = Math.floor(index / BOARD_SIZE) + 1;
      const column = index % BOARD_SIZE + 1;
      return `
        <div
          class="twenty-cell ${tileClass(value)}"
          role="gridcell"
          aria-label="Row ${row}, column ${column}: ${value === 0 ? "empty" : value}"
        >${value === 0 ? "" : `<span>${value}</span>`}</div>`;
    }).join("");
    boardElement!.setAttribute("aria-description", boardSummary(state.board));
    scoreElement!.textContent = String(state.score);
    bestElement!.textContent = String(bestScore);
    undoButton!.disabled = !state.undo || gameOver;
  }

  function hideResult(): void {
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
  }

  function newGame(): void {
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
    renderBoard();
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

  function move(direction: Direction): void {
    if (gameOver || !resultElement!.hidden) return;
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
    renderBoard();

    if (result.created2048 && !winCelebrated) showWin();
    else if (!canMove(state.board)) showGameOver();
  }

  function undo(): void {
    if (!state.undo || gameOver || !resultElement!.hidden) return;
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
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    boardElement!.setPointerCapture(event.pointerId);
  }

  function onPointerUp(event: PointerEvent): void {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    pointerStart = undefined;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) return;
    move(Math.abs(deltaX) > Math.abs(deltaY)
      ? deltaX > 0 ? "right" : "left"
      : deltaY > 0 ? "down" : "up");
  }

  function onPointerCancel(): void {
    pointerStart = undefined;
  }

  container.addEventListener("click", onClick);
  window.addEventListener("keydown", onKeyDown);
  boardElement.addEventListener("pointerdown", onPointerDown);
  boardElement.addEventListener("pointerup", onPointerUp);
  boardElement.addEventListener("pointercancel", onPointerCancel);
  renderBoard();

  return {
    destroy() {
      pointerStart = undefined;
      container.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
      boardElement.removeEventListener("pointerdown", onPointerDown);
      boardElement.removeEventListener("pointerup", onPointerUp);
      boardElement.removeEventListener("pointercancel", onPointerCancel);
      container.innerHTML = "";
    },
  };
}
