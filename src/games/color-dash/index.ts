import type { GameContext, GameInstance } from "../../platform/game";

export type ColorId = "red" | "blue" | "green" | "yellow" | "purple" | "orange";

export interface DashColor {
  id: ColorId;
  label: string;
  hex: string;
  symbol: string;
}

export interface ColorChallenge {
  word: DashColor;
  ink: DashColor;
}

export const DASH_COLORS: readonly DashColor[] = [
  { id: "red", label: "RED", hex: "#e03131", symbol: "●" },
  { id: "blue", label: "BLUE", hex: "#1971c2", symbol: "◆" },
  { id: "green", label: "GREEN", hex: "#2b8a3e", symbol: "▲" },
  { id: "yellow", label: "YELLOW", hex: "#f59f00", symbol: "★" },
  { id: "purple", label: "PURPLE", hex: "#7048e8", symbol: "⬟" },
  { id: "orange", label: "ORANGE", hex: "#e8590c", symbol: "■" },
];

function randomIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.floor(Math.max(0, random()) * length));
}

export function createChallenge(
  random: () => number = Math.random,
  previousInk?: ColorId,
): ColorChallenge {
  let inkIndex = randomIndex(DASH_COLORS.length, random);
  if (DASH_COLORS.length > 1 && DASH_COLORS[inkIndex]?.id === previousInk) {
    inkIndex = (inkIndex + 1) % DASH_COLORS.length;
  }

  const ink = DASH_COLORS[inkIndex]!;
  let wordIndex = randomIndex(DASH_COLORS.length - 1, random);
  if (wordIndex >= inkIndex) wordIndex += 1;

  return { word: DASH_COLORS[wordIndex]!, ink };
}

export function pointsForAnswer(responseMs: number, streak: number): number {
  const speedBonus = Math.max(0, 200 - Math.floor(Math.max(0, responseMs) / 10));
  const streakBonus = Math.min(200, Math.max(0, streak) * 20);
  return 100 + speedBonus + streakBonus;
}

const GAME_DURATION_MS = 30_000;

export function mount({ container, exit }: GameContext): GameInstance {
  let challenge = createChallenge();
  let challengeStartedAt = performance.now();
  let gameStartedAt = 0;
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let correctAnswers = 0;
  let running = false;
  let changingChallenge = false;
  let displayedSeconds = 30;
  let clockTimer: number | undefined;
  let nextChallengeTimer: number | undefined;
  let feedbackTimer: number | undefined;

  container.innerHTML = `
    <main class="game-page dash-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-dash-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow dash-eyebrow">Reflex challenge</span>
          <h1>Color Dash</h1>
        </div>
        <button class="icon-button" type="button" data-dash-action="new" aria-label="Restart Color Dash">↻</button>
      </header>

      <section class="dash-game" aria-label="Color Dash game">
        <div class="dash-mission">
          <div class="dash-mission-icon" aria-hidden="true">🌈</div>
          <div>
            <p class="mission-title">Tap the letters' color!</p>
            <p class="mission-copy">The word will try to trick your brain.</p>
          </div>
          <div class="dash-clock" aria-live="polite">
            <strong data-dash-time>30</strong><span>seconds</span>
          </div>
        </div>

        <div class="dash-workspace">
          <div class="dash-stats" aria-label="Game score">
            <div><strong data-dash-score>0</strong><span>score</span></div>
            <div><strong data-dash-streak>0</strong><span>streak</span></div>
            <div><strong data-dash-correct>0</strong><span>correct</span></div>
          </div>

          <div class="dash-rule"><span aria-hidden="true">👀</span> Read the color of the letters—not the word!</div>

          <div class="dash-prompt" data-dash-prompt aria-live="polite">
            <span class="dash-ready">READY?</span>
          </div>

          <div class="dash-choices" aria-label="Choose the letter color">
            ${DASH_COLORS.map((color) => `
              <button
                class="dash-choice"
                type="button"
                data-dash-color="${color.id}"
                style="--dash-color:${color.hex}"
                disabled
              >
                <span class="dash-choice-symbol" aria-hidden="true">${color.symbol}</span>
                <span>${color.label}</span>
              </button>`).join("")}
          </div>

          <p class="dash-feedback" data-dash-feedback aria-live="polite">Press start when your reflexes are ready!</p>
          <button class="check-button dash-start-button" type="button" data-dash-action="start">Start dash</button>
        </div>
      </section>

      <div class="celebration" data-dash-result hidden></div>
    </main>`;

  const promptElement = container.querySelector<HTMLElement>("[data-dash-prompt]");
  const timeElement = container.querySelector<HTMLElement>("[data-dash-time]");
  const scoreElement = container.querySelector<HTMLElement>("[data-dash-score]");
  const streakElement = container.querySelector<HTMLElement>("[data-dash-streak]");
  const correctElement = container.querySelector<HTMLElement>("[data-dash-correct]");
  const feedbackElement = container.querySelector<HTMLElement>("[data-dash-feedback]");
  const startButton = container.querySelector<HTMLButtonElement>('[data-dash-action="start"]');
  const resultElement = container.querySelector<HTMLElement>("[data-dash-result]");
  const choiceButtons = [...container.querySelectorAll<HTMLButtonElement>("[data-dash-color]")];

  if (!promptElement || !timeElement || !scoreElement || !streakElement || !correctElement || !feedbackElement || !startButton || !resultElement) {
    throw new Error("Color Dash UI could not be created");
  }

  function clearTimers(): void {
    if (clockTimer !== undefined) window.clearInterval(clockTimer);
    if (nextChallengeTimer !== undefined) window.clearTimeout(nextChallengeTimer);
    if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
    clockTimer = undefined;
    nextChallengeTimer = undefined;
    feedbackTimer = undefined;
  }

  function updateStats(): void {
    scoreElement!.textContent = String(score);
    streakElement!.textContent = String(streak);
    correctElement!.textContent = String(correctAnswers);
  }

  function setChoicesEnabled(enabled: boolean): void {
    choiceButtons.forEach((button) => { button.disabled = !enabled; });
  }

  function showChallenge(): void {
    challengeStartedAt = performance.now();
    changingChallenge = false;
    promptElement!.innerHTML = `
      <span class="dash-word" style="color:${challenge.ink.hex}">${challenge.word.label}</span>
      <span class="dash-prompt-label">What color are these letters?</span>`;
    setChoicesEnabled(true);
  }

  function queueNextChallenge(): void {
    changingChallenge = true;
    setChoicesEnabled(false);
    const previousInk = challenge.ink.id;
    nextChallengeTimer = window.setTimeout(() => {
      challenge = createChallenge(Math.random, previousInk);
      showChallenge();
    }, 180);
  }

  function finishGame(): void {
    if (!running) return;
    running = false;
    changingChallenge = false;
    clearTimers();
    timeElement!.textContent = "0";
    setChoicesEnabled(false);
    startButton!.textContent = "Play again";
    const stars = correctAnswers >= 15 ? 3 : correctAnswers >= 8 ? 2 : 1;
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card dash-result-card" role="dialog" aria-modal="true" aria-labelledby="dash-result-title">
        <div class="win-stars dash-win-stars" aria-label="${stars} out of 3 stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>
        <p class="eyebrow dash-eyebrow">Time's up!</p>
        <h2 id="dash-result-title">Lightning reflexes!</h2>
        <p>You scored <strong>${score}</strong> points with ${correctAnswers} correct answers. Your best streak was ${bestStreak}.</p>
        <div class="result-actions">
          <button class="check-button dash-result-button" type="button" data-dash-result-action="new">Dash again</button>
          <button class="text-button" type="button" data-dash-result-action="exit">All games</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>('[data-dash-result-action="new"]')?.focus();
  }

  function updateClock(): void {
    if (!running) return;
    const remaining = GAME_DURATION_MS - (performance.now() - gameStartedAt);
    const seconds = Math.max(0, Math.ceil(remaining / 1000));
    if (seconds !== displayedSeconds) {
      displayedSeconds = seconds;
      timeElement!.textContent = String(seconds);
    }
    if (remaining <= 0) finishGame();
  }

  function startGame(): void {
    clearTimers();
    score = 0;
    streak = 0;
    bestStreak = 0;
    correctAnswers = 0;
    running = true;
    changingChallenge = false;
    displayedSeconds = 30;
    gameStartedAt = performance.now();
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
    startButton!.textContent = "Restart dash";
    timeElement!.textContent = String(displayedSeconds);
    feedbackElement!.textContent = "Go, go, go!";
    promptElement!.classList.remove("dash-prompt--correct", "dash-prompt--miss");
    challenge = createChallenge();
    updateStats();
    updateClock();
    showChallenge();
    clockTimer = window.setInterval(updateClock, 100);
  }

  function chooseColor(colorId: ColorId): void {
    if (!running || changingChallenge) return;
    if (performance.now() - gameStartedAt >= GAME_DURATION_MS) {
      finishGame();
      return;
    }
    const elapsed = performance.now() - challengeStartedAt;

    if (colorId === challenge.ink.id) {
      const earned = pointsForAnswer(elapsed, streak);
      score += earned;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      correctAnswers += 1;
      feedbackElement!.textContent = `Zing! +${earned} points`;
      promptElement!.classList.add("dash-prompt--correct");
    } else {
      streak = 0;
      feedbackElement!.textContent = `Almost! The letters were ${challenge.ink.label.toLowerCase()}.`;
      promptElement!.classList.add("dash-prompt--miss");
    }

    updateStats();
    queueNextChallenge();
    feedbackTimer = window.setTimeout(() => {
      promptElement?.classList.remove("dash-prompt--correct", "dash-prompt--miss");
      feedbackTimer = undefined;
    }, 170);
  }

  function onClick(event: Event): void {
    const target = event.target as HTMLElement;
    const colorButton = target.closest<HTMLButtonElement>("[data-dash-color]");
    const action = target.closest<HTMLButtonElement>("[data-dash-action]")?.dataset.dashAction;
    const resultAction = target.closest<HTMLButtonElement>("[data-dash-result-action]")?.dataset.dashResultAction;

    if (colorButton?.dataset.dashColor) chooseColor(colorButton.dataset.dashColor as ColorId);
    else if (action === "exit" || resultAction === "exit") exit();
    else if (action === "start" || action === "new" || resultAction === "new") startGame();
  }

  container.addEventListener("click", onClick);

  return {
    destroy() {
      clearTimers();
      container.removeEventListener("click", onClick);
      container.innerHTML = "";
    },
  };
}
