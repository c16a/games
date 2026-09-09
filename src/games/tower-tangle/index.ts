import type { GameContext, GameInstance } from "../../platform/game";

export interface TowerMove {
  from: number;
  to: number;
}

export type Towers = number[][];

export function createTowers(discCount: number): Towers {
  return [Array.from({ length: discCount }, (_, index) => discCount - index), [], []];
}

export function minimumMoves(discCount: number): number {
  return 2 ** discCount - 1;
}

export function canMove(towers: Towers, from: number, to: number): boolean {
  const source = towers[from];
  const destination = towers[to];
  const movingDisc = source?.at(-1);
  const destinationDisc = destination?.at(-1);
  return movingDisc !== undefined && (destinationDisc === undefined || movingDisc < destinationDisc);
}

export function moveDisc(towers: Towers, move: TowerMove): boolean {
  if (!canMove(towers, move.from, move.to)) return false;
  const disc = towers[move.from]!.pop();
  if (disc === undefined) return false;
  towers[move.to]!.push(disc);
  return true;
}

function stateKey(towers: Towers): string {
  return towers.map((tower) => tower.join(",")).join("|");
}

function possibleMoves(towers: Towers): TowerMove[] {
  const moves: TowerMove[] = [];
  for (let from = 0; from < 3; from += 1) {
    for (let to = 0; to < 3; to += 1) {
      if (from !== to && canMove(towers, from, to)) moves.push({ from, to });
    }
  }
  return moves;
}

export function findNextMove(towers: Towers, discCount: number): TowerMove | undefined {
  if (towers[2]?.length === discCount) return undefined;

  const start = towers.map((tower) => [...tower]);
  const queue: Array<{ state: Towers; firstMove?: TowerMove }> = [{ state: start }];
  const visited = new Set([stateKey(start)]);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    for (const move of possibleMoves(current.state)) {
      const next = current.state.map((tower) => [...tower]);
      moveDisc(next, move);
      const key = stateKey(next);
      if (visited.has(key)) continue;
      const firstMove = current.firstMove ?? move;
      if (next[2]?.length === discCount) return firstMove;
      visited.add(key);
      queue.push({ state: next, firstMove });
    }
  }
  return undefined;
}

const TOWER_NAMES = ["left", "middle", "right"] as const;

export function mount({ container, exit }: GameContext): GameInstance {
  let discCount = 3;
  let towers = createTowers(discCount);
  let history: TowerMove[] = [];
  let selectedTower: number | undefined;
  let hintMove: TowerMove | undefined;
  let invalidTower: number | undefined;
  let feedbackTimer: number | undefined;
  let won = false;

  container.innerHTML = `
    <main class="game-page tower-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-tower-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow tower-eyebrow">Planning puzzle</span>
          <h1>Tower Tangle</h1>
        </div>
        <button class="icon-button" type="button" data-tower-action="new" aria-label="Start a new puzzle">↻</button>
      </header>

      <section class="tower-game" aria-label="Tower Tangle puzzle">
        <div class="tower-mission">
          <div class="tower-mission-icon" aria-hidden="true">🏗️</div>
          <div>
            <p class="mission-title">Move the tower to the star!</p>
            <p class="mission-copy">A big disk can never sit on a smaller one.</p>
          </div>
          <div class="tower-score" aria-live="polite">
            <strong data-tower-moves>0</strong><span>moves</span>
          </div>
        </div>

        <div class="tower-workspace">
          <div class="difficulty-picker tower-difficulty" aria-label="Number of disks">
            <button type="button" data-discs="3" aria-pressed="true">Starter <span>3 disks</span></button>
            <button type="button" data-discs="4" aria-pressed="false">Tricky <span>4 disks</span></button>
            <button type="button" data-discs="5" aria-pressed="false">Expert <span>5 disks</span></button>
          </div>

          <div class="tower-stage" data-tower-stage aria-label="Three towers"></div>

          <div class="tower-progress" aria-live="polite">
            <span class="tower-par">Best possible: <strong data-tower-par>7</strong> moves</span>
            <span data-tower-message>Tap the left tower to pick up its top disk.</span>
          </div>

          <div class="tower-controls">
            <button class="soft-button tower-undo" type="button" data-tower-action="undo" disabled>↶ Undo</button>
            <button class="soft-button tower-hint" type="button" data-tower-action="hint">✦ Hint</button>
            <button class="check-button tower-new-button" type="button" data-tower-action="new">New puzzle</button>
          </div>
        </div>
      </section>

      <div class="celebration" data-tower-result hidden></div>
    </main>`;

  const stageElement = container.querySelector<HTMLElement>("[data-tower-stage]");
  const movesElement = container.querySelector<HTMLElement>("[data-tower-moves]");
  const parElement = container.querySelector<HTMLElement>("[data-tower-par]");
  const messageElement = container.querySelector<HTMLElement>("[data-tower-message]");
  const resultElement = container.querySelector<HTMLElement>("[data-tower-result]");
  const undoButton = container.querySelector<HTMLButtonElement>('[data-tower-action="undo"]');

  if (!stageElement || !movesElement || !parElement || !messageElement || !resultElement || !undoButton) {
    throw new Error("Tower Tangle UI could not be created");
  }

  function clearFeedback(): void {
    if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
    feedbackTimer = undefined;
    invalidTower = undefined;
  }

  function renderTowers(): void {
    stageElement!.innerHTML = towers.map((tower, towerIndex) => {
      const selectedClass = selectedTower === towerIndex ? " tower-slot--selected" : "";
      const hintFromClass = hintMove?.from === towerIndex ? " tower-slot--hint-from" : "";
      const hintToClass = hintMove?.to === towerIndex ? " tower-slot--hint-to" : "";
      const invalidClass = invalidTower === towerIndex ? " tower-slot--invalid" : "";
      const disks = [...tower].reverse().map((disc) => {
        const width = 38 + (disc / discCount) * 57;
        return `<span class="tower-disc tower-disc--${(disc - 1) % 5}" style="--disc-width:${width}%" aria-hidden="true">${disc}</span>`;
      }).join("");

      return `
        <button
          class="tower-slot${selectedClass}${hintFromClass}${hintToClass}${invalidClass}"
          type="button"
          data-tower="${towerIndex}"
          aria-pressed="${selectedTower === towerIndex}"
          aria-label="${TOWER_NAMES[towerIndex]} tower, ${tower.length} ${tower.length === 1 ? "disk" : "disks"}${towerIndex === 2 ? ", goal tower" : ""}"
        >
          <span class="tower-goal" aria-hidden="true">${towerIndex === 2 ? "★" : ""}</span>
          <span class="tower-pole" aria-hidden="true"></span>
          <span class="tower-disks">${disks}</span>
          <span class="tower-base" aria-hidden="true"></span>
          <span class="tower-label">${towerIndex === 2 ? "Finish" : TOWER_NAMES[towerIndex]}</span>
        </button>`;
    }).join("");
    movesElement!.textContent = String(history.length);
    parElement!.textContent = String(minimumMoves(discCount));
    undoButton!.disabled = history.length === 0 || won;
  }

  function newPuzzle(nextDiscCount = discCount): void {
    clearFeedback();
    discCount = nextDiscCount;
    towers = createTowers(discCount);
    history = [];
    selectedTower = undefined;
    hintMove = undefined;
    won = false;
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
    messageElement!.textContent = "Tap the left tower to pick up its top disk.";
    container.querySelectorAll<HTMLButtonElement>("[data-discs]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.discs) === discCount));
    });
    renderTowers();
  }

  function showInvalid(towerIndex: number): void {
    clearFeedback();
    invalidTower = towerIndex;
    messageElement!.textContent = "Oops! A big disk cannot sit on a smaller one.";
    renderTowers();
    feedbackTimer = window.setTimeout(() => {
      invalidTower = undefined;
      renderTowers();
    }, 700);
  }

  function selectTower(towerIndex: number): void {
    if (won) return;
    clearFeedback();
    hintMove = undefined;

    if (selectedTower === undefined) {
      if (towers[towerIndex]?.length === 0) {
        messageElement!.textContent = "That tower is empty. Pick a tower with a disk.";
        return;
      }
      selectedTower = towerIndex;
      messageElement!.textContent = `Disk picked up. Now choose another tower.`;
      renderTowers();
      return;
    }

    if (selectedTower === towerIndex) {
      selectedTower = undefined;
      messageElement!.textContent = "Disk put back. Choose a tower when you are ready.";
      renderTowers();
      return;
    }

    const move = { from: selectedTower, to: towerIndex };
    if (!moveDisc(towers, move)) {
      showInvalid(towerIndex);
      return;
    }

    history.push(move);
    selectedTower = undefined;
    messageElement!.textContent = towerIndex === 2 ? "Nice! The tower is getting closer." : "Good move—keep planning ahead!";
    renderTowers();
    if (towers[2]?.length === discCount) showWin();
  }

  function undo(): void {
    const lastMove = history.pop();
    if (!lastMove) return;
    clearFeedback();
    selectedTower = undefined;
    hintMove = undefined;
    moveDisc(towers, { from: lastMove.to, to: lastMove.from });
    messageElement!.textContent = "Move undone. Try another path!";
    renderTowers();
  }

  function showHint(): void {
    clearFeedback();
    selectedTower = undefined;
    hintMove = findNextMove(towers, discCount);
    if (!hintMove) return;
    messageElement!.textContent = `Try moving the top disk from the ${TOWER_NAMES[hintMove.from]} tower to the ${TOWER_NAMES[hintMove.to]} tower.`;
    renderTowers();
  }

  function showWin(): void {
    won = true;
    const par = minimumMoves(discCount);
    const extraMoves = history.length - par;
    const stars = extraMoves === 0 ? 3 : extraMoves <= 4 ? 2 : 1;
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card tower-result-card" role="dialog" aria-modal="true" aria-labelledby="tower-result-title">
        <div class="win-stars tower-win-stars" aria-label="${stars} out of 3 stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>
        <p class="eyebrow tower-eyebrow">Tower complete!</p>
        <h2 id="tower-result-title">Super planning!</h2>
        <p>You moved all ${discCount} disks in ${history.length} moves.${extraMoves === 0 ? " That is the best possible score!" : ""}</p>
        <div class="result-actions">
          <button class="check-button tower-result-button" type="button" data-tower-result-action="new">Play another</button>
          <button class="text-button" type="button" data-tower-result-action="exit">All games</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>('[data-tower-result-action="new"]')?.focus();
  }

  function onClick(event: Event): void {
    const target = event.target as HTMLElement;
    const tower = target.closest<HTMLButtonElement>("[data-tower]");
    const difficulty = target.closest<HTMLButtonElement>("[data-discs]");
    const action = target.closest<HTMLButtonElement>("[data-tower-action]")?.dataset.towerAction;
    const resultAction = target.closest<HTMLButtonElement>("[data-tower-result-action]")?.dataset.towerResultAction;

    if (tower) selectTower(Number(tower.dataset.tower));
    else if (difficulty) newPuzzle(Number(difficulty.dataset.discs));
    else if (action === "exit" || resultAction === "exit") exit();
    else if (action === "new" || resultAction === "new") newPuzzle();
    else if (action === "undo") undo();
    else if (action === "hint") showHint();
  }

  container.addEventListener("click", onClick);
  renderTowers();

  return {
    destroy() {
      clearFeedback();
      container.removeEventListener("click", onClick);
      container.innerHTML = "";
    },
  };
}
