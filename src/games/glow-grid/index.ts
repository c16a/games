import type { GameContext, GameInstance } from "../../platform/game";

const SCRAMBLE_MOVES: Record<number, number> = {
  3: 4,
  4: 7,
  5: 11,
};

export interface GlowPuzzle {
  board: boolean[];
  solution: boolean[];
  par: number;
}

export function affectedCells(size: number, index: number): number[] {
  const row = Math.floor(index / size);
  const column = index % size;
  const cells = [index];

  if (row > 0) cells.push(index - size);
  if (row < size - 1) cells.push(index + size);
  if (column > 0) cells.push(index - 1);
  if (column < size - 1) cells.push(index + 1);
  return cells;
}

export function applyMove(board: boolean[], size: number, index: number): void {
  for (const cell of affectedCells(size, index)) board[cell] = !board[cell];
}

function shuffledCells(count: number): number[] {
  const cells = Array.from({ length: count }, (_, index) => index);
  const random = new Uint32Array(count);
  crypto.getRandomValues(random);

  for (let index = count - 1; index > 0; index -= 1) {
    const swapIndex = (random[index] ?? 0) % (index + 1);
    [cells[index], cells[swapIndex]] = [cells[swapIndex]!, cells[index]!];
  }
  return cells;
}

export function generatePuzzle(size: number): GlowPuzzle {
  const board = Array<boolean>(size * size).fill(false);
  const solution = Array<boolean>(size * size).fill(false);
  const moves = shuffledCells(size * size).slice(0, SCRAMBLE_MOVES[size] ?? size);

  for (const move of moves) {
    applyMove(board, size, move);
    solution[move] = !solution[move];
  }

  if (!board.some(Boolean)) {
    applyMove(board, size, 0);
    solution[0] = !solution[0];
  }

  return { board, solution, par: solution.filter(Boolean).length };
}

export function mount({ container, exit }: GameContext): GameInstance {
  let size = 3;
  let puzzle = generatePuzzle(size);
  let board = [...puzzle.board];
  let solution = [...puzzle.solution];
  let history: number[] = [];
  let hintedCell: number | undefined;
  let hintTimer: number | undefined;
  let won = false;

  container.innerHTML = `
    <main class="game-page glow-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-glow-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow glow-eyebrow">Light puzzle</span>
          <h1>Glow Grid</h1>
        </div>
        <button class="icon-button" type="button" data-glow-action="new" aria-label="Start a new puzzle">↻</button>
      </header>

      <section class="glow-game" aria-label="Glow Grid puzzle">
        <div class="glow-mission">
          <div class="glow-mission-icon" aria-hidden="true">💡</div>
          <div>
            <p class="mission-title">Switch off every light!</p>
            <p class="mission-copy">Each tap flips its neighbors too.</p>
          </div>
          <div class="glow-stat" aria-live="polite">
            <strong data-moves>0</strong><span>moves</span>
          </div>
        </div>

        <div class="glow-workspace">
          <div class="difficulty-picker" aria-label="Puzzle size">
            <button type="button" data-size="3" aria-pressed="true">Easy <span>3 × 3</span></button>
            <button type="button" data-size="4" aria-pressed="false">Tricky <span>4 × 4</span></button>
            <button type="button" data-size="5" aria-pressed="false">Expert <span>5 × 5</span></button>
          </div>

          <div class="glow-board-wrap">
            <div class="glow-board" data-glow-board role="grid" aria-label="3 by 3 light grid"></div>
          </div>

          <div class="glow-progress" aria-live="polite">
            <span class="glow-count"><strong data-lights>0</strong> lights still glowing</span>
            <span class="glow-message" data-glow-message>Tap a light and watch what happens!</span>
          </div>

          <div class="glow-controls">
            <button class="soft-button" type="button" data-glow-action="undo" disabled>↶ Undo</button>
            <button class="soft-button soft-button--hint" type="button" data-glow-action="hint">✦ Hint</button>
            <button class="check-button glow-new-button" type="button" data-glow-action="new">New puzzle</button>
          </div>
        </div>
      </section>

      <div class="celebration" data-glow-result hidden></div>
    </main>`;

  const boardElement = container.querySelector<HTMLElement>("[data-glow-board]");
  const movesElement = container.querySelector<HTMLElement>("[data-moves]");
  const lightsElement = container.querySelector<HTMLElement>("[data-lights]");
  const messageElement = container.querySelector<HTMLElement>("[data-glow-message]");
  const resultElement = container.querySelector<HTMLElement>("[data-glow-result]");
  const undoButton = container.querySelector<HTMLButtonElement>('[data-glow-action="undo"]');

  if (!boardElement || !movesElement || !lightsElement || !messageElement || !resultElement || !undoButton) {
    throw new Error("Glow Grid UI could not be created");
  }

  function clearHint(): void {
    if (hintTimer !== undefined) window.clearTimeout(hintTimer);
    hintTimer = undefined;
    hintedCell = undefined;
  }

  function renderBoard(): void {
    const litCount = board.filter(Boolean).length;
    boardElement!.style.setProperty("--grid-size", String(size));
    boardElement!.setAttribute("aria-label", `${size} by ${size} light grid`);
    boardElement!.innerHTML = board.map((isOn, index) => {
      const row = Math.floor(index / size) + 1;
      const column = index % size + 1;
      const hintClass = index === hintedCell ? " glow-tile--hint" : "";
      return `
        <button
          class="glow-tile ${isOn ? "glow-tile--on" : "glow-tile--off"}${hintClass}"
          type="button"
          role="gridcell"
          data-cell="${index}"
          aria-label="Row ${row}, column ${column}: ${isOn ? "light on" : "light off"}"
        ><span aria-hidden="true">${isOn ? "✦" : ""}</span></button>`;
    }).join("");
    movesElement!.textContent = String(history.length);
    lightsElement!.textContent = String(litCount);
    undoButton!.disabled = history.length === 0 || won;
  }

  function newPuzzle(nextSize = size): void {
    clearHint();
    size = nextSize;
    puzzle = generatePuzzle(size);
    board = [...puzzle.board];
    solution = [...puzzle.solution];
    history = [];
    won = false;
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
    messageElement!.textContent = "Tap a light and watch what happens!";
    container.querySelectorAll<HTMLButtonElement>("[data-size]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.size) === size));
    });
    renderBoard();
  }

  function undo(): void {
    const lastMove = history.pop();
    if (lastMove === undefined) return;
    clearHint();
    applyMove(board, size, lastMove);
    solution[lastMove] = !solution[lastMove];
    messageElement!.textContent = "Move undone. Try a different light!";
    renderBoard();
  }

  function showHint(): void {
    clearHint();
    hintedCell = solution.findIndex(Boolean);
    if (hintedCell < 0) {
      hintedCell = undefined;
      return;
    }
    messageElement!.textContent = "Try the wiggling light!";
    renderBoard();
    hintTimer = window.setTimeout(() => {
      hintedCell = undefined;
      renderBoard();
    }, 2600);
  }

  function showWin(): void {
    won = true;
    const extraMoves = Math.max(0, history.length - puzzle.par);
    const stars = extraMoves <= 1 ? 3 : extraMoves <= 4 ? 2 : 1;
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card glow-result-card" role="dialog" aria-modal="true" aria-labelledby="glow-result-title">
        <div class="win-stars" aria-label="${stars} out of 3 stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>
        <p class="eyebrow glow-eyebrow">Grid cleared!</p>
        <h2 id="glow-result-title">Brilliant thinking!</h2>
        <p>You switched off every light in ${history.length} ${history.length === 1 ? "move" : "moves"}.</p>
        <div class="result-actions">
          <button class="check-button" type="button" data-glow-result-action="new">Play another</button>
          <button class="text-button" type="button" data-glow-result-action="exit">All games</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>('[data-glow-result-action="new"]')?.focus();
  }

  function pressCell(index: number): void {
    if (won) return;
    clearHint();
    applyMove(board, size, index);
    solution[index] = !solution[index];
    history.push(index);
    messageElement!.textContent = board.filter(Boolean).length <= Math.ceil(size / 2)
      ? "Almost there—just a few glows left!"
      : "Good move. Watch the neighboring lights!";
    renderBoard();
    if (!board.some(Boolean)) showWin();
  }

  function onClick(event: Event): void {
    const target = event.target as HTMLElement;
    const cell = target.closest<HTMLButtonElement>("[data-cell]");
    const sizeButton = target.closest<HTMLButtonElement>("[data-size]");
    const action = target.closest<HTMLButtonElement>("[data-glow-action]")?.dataset.glowAction;
    const resultAction = target.closest<HTMLButtonElement>("[data-glow-result-action]")?.dataset.glowResultAction;

    if (cell) pressCell(Number(cell.dataset.cell));
    else if (sizeButton) newPuzzle(Number(sizeButton.dataset.size));
    else if (action === "exit" || resultAction === "exit") exit();
    else if (action === "new" || resultAction === "new") newPuzzle();
    else if (action === "undo") undo();
    else if (action === "hint") showHint();
  }

  container.addEventListener("click", onClick);
  renderBoard();

  return {
    destroy() {
      clearHint();
      container.removeEventListener("click", onClick);
      container.innerHTML = "";
    },
  };
}
