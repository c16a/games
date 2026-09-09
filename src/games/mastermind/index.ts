import type { GameContext, GameInstance } from "../../platform/game";

const COLORS = [
  { name: "Cherry", value: "#ff4778" },
  { name: "Sunshine", value: "#ffc928" },
  { name: "Lime", value: "#72d86b" },
  { name: "Splash", value: "#38bdf8" },
  { name: "Grape", value: "#8b5cf6" },
  { name: "Tangerine", value: "#ff8a3d" },
] as const;

const CODE_LENGTH = 4;
const MAX_ATTEMPTS = 10;

interface Result {
  exact: number;
  colorOnly: number;
}

interface Attempt extends Result {
  guess: number[];
}

export function scoreGuess(secret: number[], guess: number[]): Result {
  let exact = 0;
  const secretCounts = new Map<number, number>();
  const guessCounts = new Map<number, number>();

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    const secretPeg = secret[index];
    const guessPeg = guess[index];
    if (secretPeg === guessPeg) {
      exact += 1;
    } else if (secretPeg !== undefined && guessPeg !== undefined) {
      secretCounts.set(secretPeg, (secretCounts.get(secretPeg) ?? 0) + 1);
      guessCounts.set(guessPeg, (guessCounts.get(guessPeg) ?? 0) + 1);
    }
  }

  let colorOnly = 0;
  for (const [color, count] of guessCounts) {
    colorOnly += Math.min(count, secretCounts.get(color) ?? 0);
  }

  return { exact, colorOnly };
}

function createSecret(): number[] {
  const randomValues = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => value % COLORS.length);
}

function peg(colorIndex: number, label: string): string {
  const color = COLORS[colorIndex];
  if (!color) return "";
  return `<span class="peg peg--small" style="--peg-color:${color.value}" aria-label="${label}: ${color.name}"></span>`;
}

export function mount({ container, exit }: GameContext): GameInstance {
  let secret = createSecret();
  let guess: number[] = [];
  let attempts: Attempt[] = [];
  let status: "playing" | "won" | "lost" = "playing";

  container.innerHTML = `
    <main class="game-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow">Rainbow mission</span>
          <h1>Mastermind</h1>
        </div>
        <button class="icon-button" type="button" data-action="restart" aria-label="Start a new game">↻</button>
      </header>

      <section class="mastermind" aria-label="Mastermind game board">
        <div class="mission-card">
          <div class="secret-code" aria-label="Hidden four-color code">
            ${Array.from({ length: CODE_LENGTH }, () => '<span class="secret-peg">?</span>').join("")}
          </div>
          <div class="mission-message">
            <p class="mission-title">Crack the secret colors!</p>
            <p class="mission-copy">A color can appear more than once.</p>
          </div>
          <div class="turn-bubble" aria-live="polite">
            <strong data-turns>${MAX_ATTEMPTS}</strong><span>tries left</span>
          </div>
        </div>

        <div class="play-layout">
          <section class="guess-panel" aria-labelledby="guess-title">
            <div class="panel-title-row">
              <h2 id="guess-title">Build your guess</h2>
              <button class="text-button" type="button" data-action="clear">Clear</button>
            </div>
            <div class="guess-slots" data-guess aria-label="Current guess"></div>
            <div class="color-tray" data-colors aria-label="Choose a color"></div>
            <button class="check-button" type="button" data-action="check" disabled>
              Check my code <span aria-hidden="true">✨</span>
            </button>
            <p class="game-hint" data-hint aria-live="polite">Tap four colors to make a guess.</p>
          </section>

          <section class="attempt-panel" aria-labelledby="attempt-title">
            <div class="panel-title-row">
              <h2 id="attempt-title">Your clues</h2>
              <div class="clue-key" aria-label="Clue legend">
                <span>🎯 right spot</span><span>🌈 wrong spot</span>
              </div>
            </div>
            <ol class="attempt-list" data-attempts></ol>
          </section>
        </div>
      </section>

      <div class="celebration" data-celebration hidden></div>
    </main>`;

  const guessElement = container.querySelector<HTMLElement>("[data-guess]");
  const colorsElement = container.querySelector<HTMLElement>("[data-colors]");
  const attemptsElement = container.querySelector<HTMLOListElement>("[data-attempts]");
  const checkButton = container.querySelector<HTMLButtonElement>('[data-action="check"]');
  const turnsElement = container.querySelector<HTMLElement>("[data-turns]");
  const hintElement = container.querySelector<HTMLElement>("[data-hint]");
  const celebrationElement = container.querySelector<HTMLElement>("[data-celebration]");

  if (!guessElement || !colorsElement || !attemptsElement || !checkButton || !turnsElement || !hintElement || !celebrationElement) {
    throw new Error("Mastermind UI could not be created");
  }

  colorsElement.innerHTML = COLORS.map(
    (color, index) => `
      <button class="color-choice" type="button" data-color="${index}" aria-label="Add ${color.name}">
        <span class="peg" style="--peg-color:${color.value}" aria-hidden="true"></span>
        <span>${color.name}</span>
      </button>`,
  ).join("");

  function renderGuess(): void {
    guessElement!.innerHTML = Array.from({ length: CODE_LENGTH }, (_, index) => {
      const colorIndex = guess[index];
      if (colorIndex === undefined) {
        return `<button class="guess-slot" type="button" disabled aria-label="Empty color slot ${index + 1}"><span>${index + 1}</span></button>`;
      }
      const color = COLORS[colorIndex];
      return `<button class="guess-slot guess-slot--filled" type="button" data-slot="${index}" aria-label="Remove ${color?.name ?? "color"} from slot ${index + 1}"><span class="peg" style="--peg-color:${color?.value}"></span></button>`;
    }).join("");
    checkButton!.disabled = guess.length !== CODE_LENGTH || status !== "playing";
  }

  function renderAttempts(): void {
    attemptsElement!.innerHTML = attempts.length === 0
      ? `<li class="empty-attempts"><span aria-hidden="true">🕵️</span><p>Your clues will pop up here.</p></li>`
      : attempts.map((attempt, index) => `
          <li class="attempt-row">
            <span class="attempt-number">${index + 1}</span>
            <div class="attempt-pegs">${attempt.guess.map((color, pegIndex) => peg(color, `Guess ${index + 1}, peg ${pegIndex + 1}`)).join("")}</div>
            <div class="attempt-score" aria-label="${attempt.exact} right spot, ${attempt.colorOnly} wrong spot">
              <span>🎯 <strong>${attempt.exact}</strong></span>
              <span>🌈 <strong>${attempt.colorOnly}</strong></span>
            </div>
          </li>`).reverse().join("");
    turnsElement!.textContent = String(MAX_ATTEMPTS - attempts.length);
  }

  function showResult(): void {
    if (status === "playing") return;
    const won = status === "won";
    celebrationElement!.hidden = false;
    celebrationElement!.innerHTML = `
      <div class="result-card" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <span class="result-icon" aria-hidden="true">${won ? "🏆" : "🌟"}</span>
        <p class="eyebrow">${won ? "Code cracked!" : "Great detective work!"}</p>
        <h2 id="result-title">${won ? "You found it!" : "So close!"}</h2>
        <p>${won ? `Amazing! You solved it in ${attempts.length} ${attempts.length === 1 ? "try" : "tries"}.` : "Here was the secret code. Ready to try another?"}</p>
        <div class="revealed-code">${secret.map((color, index) => peg(color, `Secret peg ${index + 1}`)).join("")}</div>
        <div class="result-actions">
          <button class="check-button" type="button" data-result-action="restart">Play again</button>
          <button class="text-button" type="button" data-result-action="exit">All games</button>
        </div>
      </div>`;
    celebrationElement!.querySelector<HTMLButtonElement>('[data-result-action="restart"]')?.focus();
  }

  function restart(): void {
    secret = createSecret();
    guess = [];
    attempts = [];
    status = "playing";
    celebrationElement!.hidden = true;
    celebrationElement!.innerHTML = "";
    hintElement!.textContent = "Tap four colors to make a guess.";
    renderGuess();
    renderAttempts();
  }

  function onClick(event: Event): void {
    const target = event.target as HTMLElement;
    const actionButton = target.closest<HTMLButtonElement>("[data-action]");
    const colorButton = target.closest<HTMLButtonElement>("[data-color]");
    const slotButton = target.closest<HTMLButtonElement>("[data-slot]");
    const resultButton = target.closest<HTMLButtonElement>("[data-result-action]");

    if (resultButton?.dataset.resultAction === "restart") restart();
    else if (resultButton?.dataset.resultAction === "exit") exit();
    else if (actionButton?.dataset.action === "exit") exit();
    else if (actionButton?.dataset.action === "restart") restart();
    else if (actionButton?.dataset.action === "clear" && status === "playing") {
      guess = [];
      hintElement!.textContent = "Fresh start—pick four colors.";
      renderGuess();
    } else if (colorButton && guess.length < CODE_LENGTH && status === "playing") {
      guess.push(Number(colorButton.dataset.color));
      hintElement!.textContent = guess.length === CODE_LENGTH ? "Ready! Check your code." : `${CODE_LENGTH - guess.length} more to go.`;
      renderGuess();
    } else if (slotButton && status === "playing") {
      guess.splice(Number(slotButton.dataset.slot), 1);
      hintElement!.textContent = `${CODE_LENGTH - guess.length} more to go.`;
      renderGuess();
    } else if (actionButton?.dataset.action === "check" && guess.length === CODE_LENGTH && status === "playing") {
      const result = scoreGuess(secret, guess);
      attempts.push({ guess: [...guess], ...result });
      guess = [];
      if (result.exact === CODE_LENGTH) status = "won";
      else if (attempts.length >= MAX_ATTEMPTS) status = "lost";
      hintElement!.textContent = result.exact > 0 || result.colorOnly > 0
        ? "Nice clue! Use it to plan your next guess."
        : "Those colors are hiding somewhere else—try a new mix!";
      renderGuess();
      renderAttempts();
      showResult();
    }
  }

  container.addEventListener("click", onClick);
  renderGuess();
  renderAttempts();

  return {
    destroy() {
      container.removeEventListener("click", onClick);
      container.innerHTML = "";
    },
  };
}
