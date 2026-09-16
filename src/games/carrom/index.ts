import type { GameContext, GameInstance } from "../../platform/game";
import { ArcadeSounds } from "../../platform/audio";
import { vibrate } from "../../platform/haptics";
import {
  BOARD_SIZE,
  CARROM_POCKETS,
  COIN_RADIUS,
  FIELD_MAX,
  FIELD_MIN,
  MAX_PULL,
  MIN_PULL,
  PLAYER_BASELINE_Y,
  AI_BASELINE_Y,
  type CarromState,
  type Difficulty,
  type Disc,
  type GameMode,
  type GuidePoint,
  type TrajectoryPrediction,
  type Vector,
  createInitialState,
  displayToBoard,
  launchAiShot,
  launchPlayerShot,
  positionPlayerStriker,
  predictTrajectory,
  remainingCoins,
  scoreAwardsBetween,
  updateCarrom,
} from "./logic";

const COLORS = {
  ink: [45, 30, 47],
  woodDark: [93, 48, 31],
  wood: [197, 117, 62],
  rail: [235, 169, 94],
  board: [255, 229, 178],
  line: [151, 67, 55],
  player: [255, 212, 59],
  ai: [47, 84, 150],
  black: [43, 43, 50],
  white: [250, 245, 226],
  red: [230, 57, 70],
  striker: [247, 252, 250],
  strikerRing: [12, 139, 131],
  guide: [21, 193, 213],
  coinGuide: [255, 146, 43],
} as const;

const PLAYER_SCORE_VIBRATION_MS = 50;

function playerName(state: CarromState, player = state.turn): string {
  if (state.mode === "twoPlayer") return player === "player" ? "Player 1" : "Player 2";
  return player === "player" ? "You" : "Computer";
}

function statusMessage(state: CarromState): string {
  if (state.phase === "over") {
    if (state.winner === "draw") return "What a match — it is a draw!";
    return `${playerName(state, state.winner!)} scored the most points. Brilliant!`;
  }
  if (state.phase === "aiThinking") {
    if (state.pendingRed === "ai") return "Computer must cover red with a black or white coin…";
    return `${state.difficulty === "hard" ? "Clever" : "Friendly"} computer is lining up a shot…`;
  }
  if (state.phase === "moving") {
    if (state.shot?.coveringRed) return `${playerName(state)} must cover red with a black or white coin!`;
    const shotOwner = state.mode === "onePlayer" && state.turn === "player" ? "Your" : `${playerName(state)}'s`;
    return `${shotOwner} shot — watch the coins!`;
  }
  if (state.pendingRed === state.turn) return `${playerName(state)}, cover red now with a black or white coin!`;
  return state.difficulty === "easy"
    ? `${playerName(state)}, tap your launch line, pull back, and release. Follow the blue guide!`
    : `${playerName(state)}, tap your launch line, pull back, and release. Trust your aim!`;
}

function boardDescription(state: CarromState): string {
  return `${statusMessage(state)} ${remainingCoins(state, "black")} black coins, ${remainingCoins(state, "white")} white coins, and ${remainingCoins(state, "red")} red coins remain. ${playerName(state, "player")} ${state.score.player}, ${playerName(state, "ai")} ${state.score.ai}.`;
}

function winnerTitle(state: CarromState): string {
  if (state.winner === "draw") return "A sparkling draw!";
  if (state.mode === "twoPlayer") return `${playerName(state, state.winner!)} wins!`;
  return state.winner === "player" ? "Carrom champion!" : "So close — play again?";
}

export async function mount({ container, exit, kaplayReady, signal }: GameContext): Promise<GameInstance> {
  const sounds = new ArcadeSounds();
  let selectedMode: GameMode = "onePlayer";
  let selectedDifficulty: Difficulty = "easy";
  let state = createInitialState(selectedDifficulty, selectedMode);
  let setupOpen = true;
  let destroyed = false;
  let activePointer: number | undefined;
  let aimPointer: Vector | null = null;
  let aiTimer: number | undefined;
  let scoreAlertTimer: number | undefined;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  container.innerHTML = `
    <main class="game-page carrom-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-carrom-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow carrom-eyebrow">Aim • pull • pocket</span>
          <h1>Carrom</h1>
        </div>
        <div class="carrom-header-actions">
          <button class="icon-button carrom-sound-button" type="button" data-carrom-sound aria-label="${sounds.enabled ? "Turn sounds off" : "Turn sounds on"}" aria-pressed="${sounds.enabled}" title="${sounds.enabled ? "Sounds on" : "Sounds off"}"><span aria-hidden="true">${sounds.enabled ? "🔊" : "🔇"}</span></button>
          <button class="icon-button" type="button" data-carrom-action="new" aria-label="Start a new Carrom game">↻</button>
        </div>
      </header>

      <section class="carrom-game" data-carrom-game aria-label="Carrom game">
        <div class="carrom-setup" data-carrom-setup>
          <div class="carrom-setup-art" aria-hidden="true">◎</div>
          <div class="carrom-setup-copy">
            <p class="eyebrow carrom-eyebrow">Choose your match</p>
            <h2>Who is playing?</h2>
            <p>Share this board with a friend, or take on the computer.</p>
          </div>

          <div class="carrom-setup-group">
            <h3>Players</h3>
            <div class="carrom-choice-grid" role="group" aria-label="Number of players">
              <button type="button" data-carrom-players="onePlayer" aria-pressed="true">
                <span class="carrom-choice-icon" aria-hidden="true">🤖</span>
                <strong>1 Player</strong>
                <small>Play against the computer</small>
              </button>
              <button type="button" data-carrom-players="twoPlayer" aria-pressed="false">
                <span class="carrom-choice-icon" aria-hidden="true">🧑‍🤝‍🧑</span>
                <strong>2 Players</strong>
                <small>Take turns on one board</small>
              </button>
            </div>
          </div>

          <div class="carrom-setup-group">
            <h3>Difficulty</h3>
            <div class="carrom-choice-grid" role="group" aria-label="Difficulty">
              <button type="button" data-carrom-difficulty="easy" aria-pressed="true">
                <span class="carrom-choice-icon" aria-hidden="true">✨</span>
                <strong>Easy</strong>
                <small data-carrom-easy-copy>Hints + friendly AI</small>
              </button>
              <button type="button" data-carrom-difficulty="hard" aria-pressed="false">
                <span class="carrom-choice-icon" aria-hidden="true">🔥</span>
                <strong>Hard</strong>
                <small data-carrom-hard-copy>No hints + clever AI</small>
              </button>
            </div>
          </div>

          <button class="check-button carrom-start-button" type="button" data-carrom-action="start" disabled aria-live="polite">Preparing board…</button>
        </div>

        <div data-carrom-match hidden>
          <div class="carrom-mission">
            <div class="carrom-mission-icon" aria-hidden="true">◎</div>
            <div>
              <p class="mission-title">Score the most points!</p>
              <p class="mission-copy">Aim carefully, pull back, and release to pocket coins.</p>
            </div>
            <div class="carrom-match-settings" aria-label="Match settings">
              <span data-carrom-mode-label>1 Player</span>
              <span data-carrom-difficulty-label>Easy · Hints</span>
            </div>
          </div>

          <div class="carrom-workspace">
          <div class="carrom-scorebar" aria-label="Score and turn">
            <div class="carrom-score carrom-score--player"><span class="carrom-score-coin" aria-hidden="true"></span><span data-carrom-player-label role="img" aria-label="Human">🧑</span><strong data-carrom-player-score>0</strong></div>
            <div class="carrom-turn" data-carrom-turn>Your turn</div>
            <div class="carrom-score carrom-score--ai"><span class="carrom-score-coin" aria-hidden="true"></span><span data-carrom-ai-label role="img" aria-label="Computer">🤖</span><strong data-carrom-ai-score>0</strong></div>
          </div>

          <div class="carrom-board-shell">
            <canvas
              class="carrom-canvas"
              data-carrom-canvas
              width="720"
              height="720"
              tabindex="0"
              role="application"
              aria-label="Carrom board with black, white, and red coins. Tap your launch line to place the striker, drag back, and release to shoot. Use left and right arrow keys to move, then Space to shoot straight."
            ></canvas>
            <div class="carrom-score-alert" data-carrom-score-alert role="status" aria-live="polite" aria-atomic="true" hidden></div>
          </div>

          <p class="carrom-message" data-carrom-message aria-live="polite">${statusMessage(state)}</p>
          <p class="visually-hidden" data-carrom-summary>${boardDescription(state)}</p>
          </div>
        </div>
      </section>

      <div class="celebration" data-carrom-result aria-live="assertive" hidden></div>
    </main>`;

  const canvas = container.querySelector<HTMLCanvasElement>("[data-carrom-canvas]");
  const gameElement = container.querySelector<HTMLElement>("[data-carrom-game]");
  const setupElement = container.querySelector<HTMLElement>("[data-carrom-setup]");
  const matchElement = container.querySelector<HTMLElement>("[data-carrom-match]");
  const playerScore = container.querySelector<HTMLElement>("[data-carrom-player-score]");
  const aiScore = container.querySelector<HTMLElement>("[data-carrom-ai-score]");
  const playerLabel = container.querySelector<HTMLElement>("[data-carrom-player-label]");
  const aiLabel = container.querySelector<HTMLElement>("[data-carrom-ai-label]");
  const modeLabel = container.querySelector<HTMLElement>("[data-carrom-mode-label]");
  const difficultyLabel = container.querySelector<HTMLElement>("[data-carrom-difficulty-label]");
  const easyCopy = container.querySelector<HTMLElement>("[data-carrom-easy-copy]");
  const hardCopy = container.querySelector<HTMLElement>("[data-carrom-hard-copy]");
  const turnElement = container.querySelector<HTMLElement>("[data-carrom-turn]");
  const scoreAlertElement = container.querySelector<HTMLElement>("[data-carrom-score-alert]");
  const messageElement = container.querySelector<HTMLElement>("[data-carrom-message]");
  const summaryElement = container.querySelector<HTMLElement>("[data-carrom-summary]");
  const resultElement = container.querySelector<HTMLElement>("[data-carrom-result]");
  const soundButton = container.querySelector<HTMLButtonElement>("[data-carrom-sound]");
  const startButton = container.querySelector<HTMLButtonElement>('[data-carrom-action="start"]');
  if (!canvas || !gameElement || !setupElement || !matchElement || !playerScore || !aiScore || !playerLabel || !aiLabel || !modeLabel || !difficultyLabel || !easyCopy || !hardCopy || !turnElement || !scoreAlertElement || !messageElement || !summaryElement || !resultElement || !soundButton || !startButton) {
    throw new Error("Carrom UI could not be created");
  }

  const abandonSetup = (): void => {
    destroyed = true;
    container.removeEventListener("click", onClick);
    sounds.destroy();
  };
  signal?.addEventListener("abort", abandonSetup, { once: true });
  container.addEventListener("click", onClick);
  renderSetupSelections();

  let kaplayModule: typeof import("kaplay");
  try {
    kaplayModule = await (kaplayReady ?? import("kaplay"));
  } catch (error) {
    signal?.removeEventListener("abort", abandonSetup);
    abandonSetup();
    throw error;
  }
  if (destroyed || signal?.aborted) return { destroy() {} };
  signal?.removeEventListener("abort", abandonSetup);
  const { default: kaplay } = kaplayModule;
  const k = kaplay({
    global: false,
    canvas,
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    background: [...COLORS.woodDark],
    debug: false,
    focus: false,
    touchToMouse: false,
  });
  startButton.disabled = false;
  startButton.textContent = "Start match";

  function rgb(color: readonly [number, number, number]) {
    return k.rgb(color[0], color[1], color[2]);
  }

  function drawBoard(): void {
    k.drawRect({ pos: k.vec2(10, 10), width: 700, height: 700, radius: 38, color: rgb(COLORS.wood), outline: { width: 8, color: rgb(COLORS.ink) } });
    k.drawRect({ pos: k.vec2(30, 30), width: 660, height: 660, radius: 30, color: rgb(COLORS.rail), outline: { width: 4, color: rgb(COLORS.woodDark) } });
    k.drawRect({ pos: k.vec2(FIELD_MIN, FIELD_MIN), width: FIELD_MAX - FIELD_MIN, height: FIELD_MAX - FIELD_MIN, radius: 12, color: rgb(COLORS.board), outline: { width: 4, color: rgb(COLORS.line) } });

    for (const pocket of CARROM_POCKETS) {
      k.drawCircle({ pos: k.vec2(pocket.x + 4, pocket.y + 5), radius: 35, color: rgb(COLORS.woodDark), opacity: 0.35, anchor: "center" });
      k.drawCircle({ pos: k.vec2(pocket.x, pocket.y), radius: 31, color: rgb(COLORS.ink), anchor: "center", outline: { width: 5, color: rgb(COLORS.woodDark) } });
      k.drawCircle({ pos: k.vec2(pocket.x - 6, pocket.y - 7), radius: 7, color: k.rgb(255, 255, 255), opacity: 0.11, anchor: "center" });
    }

    k.drawCircle({ pos: k.vec2(BOARD_SIZE / 2, BOARD_SIZE / 2), radius: 82, color: rgb(COLORS.board), anchor: "center", outline: { width: 4, color: rgb(COLORS.line) } });
    k.drawCircle({ pos: k.vec2(BOARD_SIZE / 2, BOARD_SIZE / 2), radius: 38, color: rgb(COLORS.board), anchor: "center", outline: { width: 3, color: rgb(COLORS.line) } });
    drawBaseline(AI_BASELINE_Y, false);
    drawBaseline(PLAYER_BASELINE_Y, true);
  }

  function drawBaseline(y: number, player: boolean): void {
    const color = player ? COLORS.strikerRing : COLORS.ai;
    k.drawLine({ p1: k.vec2(135, y), p2: k.vec2(585, y), width: 5, color: rgb(color), opacity: 0.78 });
    k.drawLine({ p1: k.vec2(135, y + (player ? -15 : 15)), p2: k.vec2(585, y + (player ? -15 : 15)), width: 2, color: rgb(color), opacity: 0.5 });
    for (const x of [135, 585]) {
      k.drawCircle({ pos: k.vec2(x, y), radius: 22, color: rgb(COLORS.board), anchor: "center", outline: { width: 4, color: rgb(color) } });
    }
  }

  function discColor(disc: Disc): readonly [number, number, number] {
    if (disc.kind === "black") return COLORS.black;
    if (disc.kind === "white") return COLORS.white;
    if (disc.kind === "red") return COLORS.red;
    return COLORS.striker;
  }

  function drawDisc(disc: Disc): void {
    if (disc.pocketed) return;
    k.drawCircle({ pos: k.vec2(disc.x + 3, disc.y + 5), radius: disc.radius + 1, color: rgb(COLORS.ink), opacity: 0.27, anchor: "center" });
    k.drawCircle({
      pos: k.vec2(disc.x, disc.y),
      radius: disc.radius,
      color: rgb(discColor(disc)),
      anchor: "center",
      outline: { width: disc.kind === "striker" ? 5 : 3, color: disc.kind === "striker" ? rgb(COLORS.strikerRing) : rgb(COLORS.ink) },
    });
    k.drawCircle({ pos: k.vec2(disc.x - disc.radius * 0.3, disc.y - disc.radius * 0.36), radius: disc.radius * 0.2, color: k.rgb(255, 255, 255), opacity: 0.72, anchor: "center" });
    if (disc.kind === "red") k.drawCircle({ pos: k.vec2(disc.x, disc.y), radius: 6, color: rgb(COLORS.player), anchor: "center", outline: { width: 2, color: rgb(COLORS.ink) } });
  }

  function drawGuidePath(points: GuidePoint[], color: readonly [number, number, number], width: number): void {
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1]!;
      const to = points[index]!;
      k.drawLine({ p1: k.vec2(from.x, from.y), p2: k.vec2(to.x, to.y), width, color: rgb(color), opacity: 0.78 });
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const count = Math.floor(distance / 24);
      for (let dot = 1; dot < count; dot += 1) {
        const ratio = dot / count;
        k.drawCircle({ pos: k.vec2(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio), radius: 3, color: k.rgb(255, 255, 255), opacity: 0.78, anchor: "center" });
      }
    }
    for (const point of points.slice(1)) {
      if (point.kind === "bounce") k.drawCircle({ pos: k.vec2(point.x, point.y), radius: 11, color: rgb(COLORS.board), anchor: "center", outline: { width: 5, color: rgb(color) } });
      if (point.kind === "coin") k.drawCircle({ pos: k.vec2(point.x, point.y), radius: 9, color: rgb(color), anchor: "center" });
      if (point.kind === "end") k.drawCircle({ pos: k.vec2(point.x, point.y), radius: 8, color: rgb(color), anchor: "center", outline: { width: 3, color: k.rgb(255, 255, 255) } });
    }
  }

  function drawGuide(prediction: TrajectoryPrediction): void {
    drawGuidePath(prediction.strikerPath, COLORS.guide, 8);
    if (prediction.coinPath.length < 2) return;
    const coinStart = prediction.coinPath[0]!;
    k.drawCircle({
      pos: k.vec2(coinStart.x, coinStart.y),
      radius: COIN_RADIUS + 8,
      color: rgb(COLORS.board),
      opacity: 0.22,
      anchor: "center",
      outline: { width: 5, color: rgb(COLORS.coinGuide) },
    });
    drawGuidePath(prediction.coinPath, COLORS.coinGuide, 7);
  }

  function drawAim(): void {
    if (!aimPointer || state.phase !== "aiming") return;
    const pullX = aimPointer.x - state.striker.x;
    const pullY = aimPointer.y - state.striker.y;
    const pullLength = Math.hypot(pullX, pullY);
    if (pullLength < 1) return;
    const ratio = Math.min(1, MAX_PULL / pullLength);
    const tether = { x: state.striker.x + pullX * ratio, y: state.striker.y + pullY * ratio };
    if (state.difficulty === "easy" && pullLength >= MIN_PULL) drawGuide(predictTrajectory(state.striker, state.coins, aimPointer));
    k.drawLine({ p1: k.vec2(state.striker.x, state.striker.y), p2: k.vec2(tether.x, tether.y), width: 7, color: rgb(COLORS.red), opacity: 0.72 });
    k.drawCircle({ pos: k.vec2(tether.x, tether.y), radius: 10, color: rgb(COLORS.red), anchor: "center", outline: { width: 3, color: k.rgb(255, 255, 255) } });

    const facing = { x: -pullX / pullLength, y: -pullY / pullLength };
    const arrowStart = { x: state.striker.x + facing.x * 27, y: state.striker.y + facing.y * 27 };
    const arrowEnd = { x: state.striker.x + facing.x * 55, y: state.striker.y + facing.y * 55 };
    k.drawLine({ p1: k.vec2(arrowStart.x, arrowStart.y), p2: k.vec2(arrowEnd.x, arrowEnd.y), width: 8, color: rgb(COLORS.strikerRing) });
    const side = { x: -facing.y, y: facing.x };
    k.drawPolygon({
      pts: [
        k.vec2(arrowEnd.x + facing.x * 10, arrowEnd.y + facing.y * 10),
        k.vec2(arrowEnd.x - facing.x * 8 + side.x * 9, arrowEnd.y - facing.y * 8 + side.y * 9),
        k.vec2(arrowEnd.x - facing.x * 8 - side.x * 9, arrowEnd.y - facing.y * 8 - side.y * 9),
      ],
      color: rgb(COLORS.strikerRing),
    });
  }

  function drawScene(): void {
    drawBoard();
    drawAim();
    state.coins.forEach(drawDisc);
    drawDisc(state.striker);
  }

  function hideResult(): void {
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
  }

  function showResult(): void {
    const playerWon = state.winner === "player";
    const winnerIcon = state.winner === "draw" ? "✨" : playerWon || state.mode === "twoPlayer" ? "🏆" : "🎯";
    const firstName = playerName(state, "player");
    const secondName = playerName(state, "ai");
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card carrom-result-card" role="dialog" aria-modal="true" aria-labelledby="carrom-result-title">
        <div class="carrom-result-icon" aria-hidden="true">${winnerIcon}</div>
        <p class="eyebrow carrom-eyebrow">Match complete</p>
        <h2 id="carrom-result-title">${winnerTitle(state)}</h2>
        <p>Final score: ${firstName} ${state.score.player} · ${secondName} ${state.score.ai}</p>
        <div class="result-actions">
          <button class="check-button carrom-result-button" type="button" data-carrom-result-action="again">Play again</button>
          <button class="soft-button" type="button" data-carrom-result-action="setup">Change match</button>
          <button class="text-button" type="button" data-carrom-result-action="exit">All games</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>('[data-carrom-result-action="again"]')?.focus();
  }

  function scheduleAi(): void {
    if (setupOpen || state.mode !== "onePlayer" || state.phase !== "aiThinking" || aiTimer !== undefined || destroyed) return;
    aiTimer = window.setTimeout(() => {
      aiTimer = undefined;
      if (destroyed || state.phase !== "aiThinking") return;
      const previous = state;
      state = launchAiShot(state);
      renderState(previous);
    }, reducedMotion ? 250 : 720);
  }

  function hideScoreAlert(): void {
    if (scoreAlertTimer !== undefined) window.clearTimeout(scoreAlertTimer);
    scoreAlertTimer = undefined;
    scoreAlertElement!.hidden = true;
    scoreAlertElement!.classList.remove("is-visible");
  }

  function showScoreAlert(scorer: "player" | "ai", awards: number[]): void {
    hideScoreAlert();
    scoreAlertElement!.dataset.scorer = scorer;
    scoreAlertElement!.innerHTML = awards.map((points) => `<strong>+${points}</strong>`).join("");
    scoreAlertElement!.setAttribute("aria-label", `${playerName(state, scorer)} scored ${awards.join(" and ")} points`);
    scoreAlertElement!.hidden = false;
    void scoreAlertElement!.offsetWidth;
    scoreAlertElement!.classList.add("is-visible");
    scoreAlertTimer = window.setTimeout(hideScoreAlert, reducedMotion ? 900 : 1400);
  }

  function renderScoreLabel(element: HTMLElement, player: "player" | "ai"): void {
    if (state.mode === "onePlayer") {
      element.textContent = player === "player" ? "🧑" : "🤖";
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", player === "player" ? "Human" : "Computer");
      return;
    }
    element.textContent = playerName(state, player);
    element.removeAttribute("role");
    element.removeAttribute("aria-label");
  }

  function renderState(previous?: CarromState): void {
    if (previous && (state.score.player > previous.score.player || (state.mode === "twoPlayer" && state.score.ai > previous.score.ai))) {
      vibrate(PLAYER_SCORE_VIBRATION_MS);
      sounds.playCoinScore();
    }
    if (previous) {
      const scorer = state.score.player > previous.score.player
        ? "player"
        : state.score.ai > previous.score.ai
          ? "ai"
          : null;
      if (scorer) showScoreAlert(scorer, scoreAwardsBetween(previous, state, scorer));
    }
    playerScore!.textContent = String(state.score.player);
    aiScore!.textContent = String(state.score.ai);
    renderScoreLabel(playerLabel!, "player");
    renderScoreLabel(aiLabel!, "ai");
    modeLabel!.textContent = state.mode === "onePlayer" ? "1 Player" : "2 Players";
    difficultyLabel!.textContent = state.difficulty === "easy" ? "Easy · Hints" : "Hard · No hints";
    gameElement!.setAttribute("aria-label", state.mode === "onePlayer" ? "Carrom game against the computer" : "Two-player Carrom game");
    turnElement!.textContent = state.phase === "over"
      ? "Match over"
      : state.pendingRed === state.turn
        ? `${playerName(state)}: cover red!`
        : state.mode === "onePlayer" && state.turn === "player"
          ? "Your turn"
          : `${playerName(state)}'s turn`;
    turnElement!.classList.toggle("carrom-turn--ai", state.turn === "ai");
    messageElement!.textContent = statusMessage(state);
    summaryElement!.textContent = boardDescription(state);
    if (state.pendingRed && previous?.pendingRed !== state.pendingRed) {
      messageElement!.textContent = `${playerName(state, state.pendingRed)} pocketed red and must cover it with black or white on the next shot.`;
    } else if (previous && (previous.score.player !== state.score.player || previous.score.ai !== state.score.ai)) {
      const scorer = state.score.player !== previous.score.player ? "player" : "ai";
      const points = state.score[scorer] - previous.score[scorer];
      messageElement!.textContent = `${playerName(state, scorer)} scored ${points} points! ${playerName(state, "player")} ${state.score.player}, ${playerName(state, "ai")} ${state.score.ai}.`;
    } else if (previous?.pendingRed && !state.pendingRed) {
      messageElement!.textContent = "Red was not covered, so it returned to the center.";
    }
    if (state.phase === "over" && previous?.phase !== "over") showResult();
    scheduleAi();
  }

  function renderSetupSelections(): void {
    container.querySelectorAll<HTMLButtonElement>("[data-carrom-players]").forEach((button) => {
      const selected = button.dataset.carromPlayers === selectedMode;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("is-selected", selected);
    });
    container.querySelectorAll<HTMLButtonElement>("[data-carrom-difficulty]").forEach((button) => {
      const selected = button.dataset.carromDifficulty === selectedDifficulty;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("is-selected", selected);
    });
    easyCopy!.textContent = selectedMode === "onePlayer" ? "Hints + friendly AI" : "Hints for both players";
    hardCopy!.textContent = selectedMode === "onePlayer" ? "No hints + clever AI" : "No hints for either player";
  }

  function resetMatch(): void {
    if (aiTimer !== undefined) window.clearTimeout(aiTimer);
    aiTimer = undefined;
    activePointer = undefined;
    aimPointer = null;
    state = createInitialState(selectedDifficulty, selectedMode);
    hideResult();
    hideScoreAlert();
    renderState();
  }

  function startMatch(): void {
    setupOpen = false;
    setupElement!.hidden = true;
    matchElement!.hidden = false;
    resetMatch();
    canvas!.focus();
  }

  function openSetup(): void {
    if (aiTimer !== undefined) window.clearTimeout(aiTimer);
    aiTimer = undefined;
    setupOpen = true;
    activePointer = undefined;
    aimPointer = null;
    state = createInitialState(selectedDifficulty, selectedMode);
    hideResult();
    hideScoreAlert();
    matchElement!.hidden = true;
    setupElement!.hidden = false;
    renderSetupSelections();
    container.querySelector<HTMLButtonElement>(`[data-carrom-players="${selectedMode}"]`)?.focus();
  }

  function eventBoardPosition(event: PointerEvent, clampToBoard = true): Vector {
    const rect = canvas!.getBoundingClientRect();
    if (clampToBoard) return displayToBoard(event.clientX, event.clientY, rect);
    return {
      x: (event.clientX - rect.left) * BOARD_SIZE / rect.width,
      y: (event.clientY - rect.top) * BOARD_SIZE / rect.height,
    };
  }

  function onPointerDown(event: PointerEvent): void {
    if (setupOpen || state.phase !== "aiming") return;
    const point = eventBoardPosition(event);
    const nearStriker = Math.hypot(point.x - state.striker.x, point.y - state.striker.y) <= 68;
    const onLaunchLine = state.turn === "player"
      ? point.y >= PLAYER_BASELINE_Y - 58
      : point.y <= AI_BASELINE_Y + 58;
    if (!nearStriker && !onLaunchLine) return;
    event.preventDefault();
    void sounds.unlock();
    if (onLaunchLine) state = positionPlayerStriker(state, point.x);
    activePointer = event.pointerId;
    aimPointer = { x: state.striker.x, y: state.striker.y };
    canvas!.setPointerCapture(event.pointerId);
    renderState();
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    aimPointer = eventBoardPosition(event, false);
  }

  function onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    const pointer = aimPointer;
    activePointer = undefined;
    aimPointer = null;
    if (canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId);
    if (!pointer) return;
    const previous = state;
    state = launchPlayerShot(state, pointer);
    renderState(previous);
  }

  function moveStriker(direction: -1 | 1): void {
    const previousX = state.striker.x;
    state = positionPlayerStriker(state, state.striker.x + direction * 34);
    if (state.striker.x !== previousX) canvas!.focus();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey || setupOpen || state.phase !== "aiming") return;
    if (event.target instanceof HTMLButtonElement) return;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      event.preventDefault();
      moveStriker(-1);
    } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      event.preventDefault();
      moveStriker(1);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      void sounds.unlock();
      const previous = state;
      const pullDirection = state.turn === "player" ? 1 : -1;
      state = launchPlayerShot(state, { x: state.striker.x, y: state.striker.y + pullDirection * 105 });
      renderState(previous);
    }
  }

  function onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-carrom-action], [data-carrom-result-action], [data-carrom-players], [data-carrom-difficulty], [data-carrom-sound]") : null;
    if (!target) return;
    if (target.hasAttribute("data-carrom-sound")) {
      sounds.setEnabled(!sounds.enabled);
      soundButton!.setAttribute("aria-pressed", String(sounds.enabled));
      soundButton!.setAttribute("aria-label", sounds.enabled ? "Turn sounds off" : "Turn sounds on");
      soundButton!.title = sounds.enabled ? "Sounds on" : "Sounds off";
      soundButton!.querySelector("span")!.textContent = sounds.enabled ? "🔊" : "🔇";
      if (sounds.enabled) void sounds.unlock();
    } else if (target.dataset.carromAction === "exit" || target.dataset.carromResultAction === "exit") exit();
    else if (target.dataset.carromAction === "new" || target.dataset.carromResultAction === "setup") openSetup();
    else if (target.dataset.carromAction === "start") startMatch();
    else if (target.dataset.carromResultAction === "again") resetMatch();
    else if (target.dataset.carromPlayers) {
      selectedMode = target.dataset.carromPlayers as GameMode;
      renderSetupSelections();
    } else if (target.dataset.carromDifficulty) {
      selectedDifficulty = target.dataset.carromDifficulty as Difficulty;
      renderSetupSelections();
    }
  }

  function onVisibilityChange(): void {
    if (!document.hidden || state.phase !== "moving") return;
    aimPointer = null;
    activePointer = undefined;
  }

  k.onDraw(drawScene);
  k.onUpdate(() => {
    if (destroyed || state.phase !== "moving") return;
    const previous = state;
    state = updateCarrom(state, Math.min(k.dt(), 1 / 30));
    if (state.phase !== previous.phase || state.score.player !== previous.score.player || state.score.ai !== previous.score.ai) renderState(previous);
  });

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  canvas.addEventListener("keydown", onKeyDown);
  document.addEventListener("visibilitychange", onVisibilityChange);
  renderState();

  return {
    destroy(): void {
      destroyed = true;
      if (aiTimer !== undefined) window.clearTimeout(aiTimer);
      if (scoreAlertTimer !== undefined) window.clearTimeout(scoreAlertTimer);
      activePointer = undefined;
      aimPointer = null;
      container.removeEventListener("click", onClick);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      canvas.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sounds.destroy();
      k.quit();
      container.innerHTML = "";
    },
  };
}
