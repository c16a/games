import type { GameContext, GameInstance } from "../../platform/game";
import { ArcadeSounds } from "../../platform/audio";
import { vibrate } from "../../platform/haptics";
import {
  BOARD_SIZE,
  CARROM_POCKETS,
  COIN_RADIUS,
  COIN_POINTS,
  FIELD_MAX,
  FIELD_MIN,
  MAX_PULL,
  MIN_PULL,
  PLAYER_BASELINE_Y,
  AI_BASELINE_Y,
  type CarromState,
  type Difficulty,
  type Disc,
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
  shotPower,
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

function statusMessage(state: CarromState): string {
  if (state.phase === "over") {
    if (state.winner === "draw") return "What a match — it is a draw!";
    return state.winner === "player" ? "You scored the most points. Brilliant!" : "The computer scored the most points. Great game!";
  }
  if (state.phase === "aiThinking") {
    if (state.pendingRed === "ai") return "Computer must cover red with a black or white coin…";
    return `${state.difficulty === "hard" ? "Clever" : "Friendly"} computer is lining up a shot…`;
  }
  if (state.phase === "moving") {
    if (state.shot?.coveringRed) return state.turn === "player" ? "Cover red — pocket black or white!" : "Computer is trying to cover red…";
    return state.turn === "player" ? "Nice release — watch the coins!" : "Computer shot in motion…";
  }
  if (state.pendingRed === "player") return "Cover red now: pocket a black or white coin on this shot!";
  return state.difficulty === "easy"
    ? "Tap the launch line, pull the striker back, and release. Follow the blue guide!"
    : "Tap the launch line, pull back, and release. Trust your aim!";
}

function boardDescription(state: CarromState): string {
  return `${statusMessage(state)} ${remainingCoins(state, "black")} black coins, ${remainingCoins(state, "white")} white coins, and ${remainingCoins(state, "red")} red coins remain. Score ${state.score.player} to ${state.score.ai}.`;
}

function winnerTitle(state: CarromState): string {
  if (state.winner === "draw") return "A sparkling draw!";
  return state.winner === "player" ? "Carrom champion!" : "So close — play again?";
}

export async function mount({ container, exit }: GameContext): Promise<GameInstance> {
  const { default: kaplay } = await import("kaplay");
  const sounds = new ArcadeSounds();
  let state = createInitialState("easy");
  let destroyed = false;
  let activePointer: number | undefined;
  let aimPointer: Vector | null = null;
  let aiTimer: number | undefined;
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

      <section class="carrom-game" aria-label="Carrom game against the computer">
        <div class="carrom-mission">
          <div class="carrom-mission-icon" aria-hidden="true">◎</div>
          <div>
            <p class="mission-title">Score the most points!</p>
            <p class="mission-copy">Black is 5, white is 10, and red is 50 after you cover it on your next shot.</p>
          </div>
          <div class="carrom-mode" role="group" aria-label="Computer difficulty">
            <button type="button" data-carrom-mode="easy" aria-pressed="true"><span aria-hidden="true">✨</span> Easy</button>
            <button type="button" data-carrom-mode="hard" aria-pressed="false"><span aria-hidden="true">🔥</span> Hard</button>
          </div>
        </div>

        <div class="carrom-workspace">
          <div class="carrom-scorebar" aria-label="Score and turn">
            <div class="carrom-score carrom-score--player"><span class="carrom-score-coin" aria-hidden="true"></span><span>You</span><strong data-carrom-player-score>0</strong></div>
            <div class="carrom-turn" data-carrom-turn>Your turn</div>
            <div class="carrom-score carrom-score--ai"><span class="carrom-score-coin" aria-hidden="true"></span><span>Computer</span><strong data-carrom-ai-score>0</strong></div>
          </div>
          <div class="carrom-coin-legend" aria-label="Coin values">
            <span><i class="carrom-legend-coin carrom-legend-coin--black" aria-hidden="true"></i> Black <strong>${COIN_POINTS.black}</strong></span>
            <span><i class="carrom-legend-coin carrom-legend-coin--white" aria-hidden="true"></i> White <strong>${COIN_POINTS.white}</strong></span>
            <span><i class="carrom-legend-coin carrom-legend-coin--red" aria-hidden="true"></i> Red <strong>${COIN_POINTS.red}</strong></span>
          </div>

          <div class="carrom-board-shell">
            <canvas
              class="carrom-canvas"
              data-carrom-canvas
              width="720"
              height="720"
              tabindex="0"
              role="application"
              aria-label="Carrom board with black, white, and red coins. Tap the bottom launch line to place the striker, drag back, and release to shoot. Use left and right arrow keys to move, then Space to shoot straight."
            ></canvas>
          </div>

          <div class="carrom-power" aria-label="Shot power">
            <span>Power</span>
            <div class="carrom-power-track"><i data-carrom-power></i></div>
            <strong data-carrom-power-label>0%</strong>
          </div>
          <p class="carrom-message" data-carrom-message aria-live="polite">${statusMessage(state)}</p>
          <p class="visually-hidden" data-carrom-summary>${boardDescription(state)}</p>

          <div class="carrom-touch-controls" aria-label="Move striker">
            <button type="button" data-carrom-move="left" aria-label="Move striker left">◀ <span>Move</span></button>
            <div><strong>Hold + pull back</strong><span>Release to fire</span></div>
            <button type="button" data-carrom-move="right" aria-label="Move striker right"><span>Move</span> ▶</button>
          </div>
          <button class="soft-button carrom-new-button" type="button" data-carrom-action="new">New match</button>
        </div>
      </section>

      <div class="celebration" data-carrom-result aria-live="assertive" hidden></div>
    </main>`;

  const canvas = container.querySelector<HTMLCanvasElement>("[data-carrom-canvas]");
  const playerScore = container.querySelector<HTMLElement>("[data-carrom-player-score]");
  const aiScore = container.querySelector<HTMLElement>("[data-carrom-ai-score]");
  const turnElement = container.querySelector<HTMLElement>("[data-carrom-turn]");
  const powerElement = container.querySelector<HTMLElement>("[data-carrom-power]");
  const powerLabel = container.querySelector<HTMLElement>("[data-carrom-power-label]");
  const messageElement = container.querySelector<HTMLElement>("[data-carrom-message]");
  const summaryElement = container.querySelector<HTMLElement>("[data-carrom-summary]");
  const resultElement = container.querySelector<HTMLElement>("[data-carrom-result]");
  const soundButton = container.querySelector<HTMLButtonElement>("[data-carrom-sound]");
  if (!canvas || !playerScore || !aiScore || !turnElement || !powerElement || !powerLabel || !messageElement || !summaryElement || !resultElement || !soundButton) {
    throw new Error("Carrom UI could not be created");
  }

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
    if (!aimPointer || state.phase !== "aiming" || state.turn !== "player") return;
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

  function updatePower(): void {
    const power = aimPointer ? shotPower(state.striker, aimPointer) : 0;
    powerElement!.style.width = `${power}%`;
    powerLabel!.textContent = `${power}%`;
  }

  function hideResult(): void {
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
  }

  function showResult(): void {
    const playerWon = state.winner === "player";
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card carrom-result-card" role="dialog" aria-modal="true" aria-labelledby="carrom-result-title">
        <div class="carrom-result-icon" aria-hidden="true">${playerWon ? "🏆" : state.winner === "draw" ? "✨" : "🎯"}</div>
        <p class="eyebrow carrom-eyebrow">Match complete</p>
        <h2 id="carrom-result-title">${winnerTitle(state)}</h2>
        <p>Final score: You ${state.score.player} · Computer ${state.score.ai}</p>
        <div class="result-actions">
          <button class="check-button carrom-result-button" type="button" data-carrom-result-action="again">Play again</button>
          <button class="text-button" type="button" data-carrom-result-action="exit">All games</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>('[data-carrom-result-action="again"]')?.focus();
  }

  function scheduleAi(): void {
    if (state.phase !== "aiThinking" || aiTimer !== undefined || destroyed) return;
    aiTimer = window.setTimeout(() => {
      aiTimer = undefined;
      if (destroyed || state.phase !== "aiThinking") return;
      const previous = state;
      state = launchAiShot(state);
      renderState(previous);
    }, reducedMotion ? 250 : 720);
  }

  function renderState(previous?: CarromState): void {
    if (previous && state.score.player > previous.score.player) {
      vibrate(PLAYER_SCORE_VIBRATION_MS);
      sounds.playCoinScore();
    }
    playerScore!.textContent = String(state.score.player);
    aiScore!.textContent = String(state.score.ai);
    turnElement!.textContent = state.phase === "over"
      ? "Match over"
      : state.pendingRed === state.turn
        ? state.turn === "player" ? "Cover red!" : "Computer cover"
        : state.turn === "player" ? "Your turn" : "Computer turn";
    turnElement!.classList.toggle("carrom-turn--ai", state.turn === "ai");
    messageElement!.textContent = statusMessage(state);
    summaryElement!.textContent = boardDescription(state);
    container.querySelectorAll<HTMLButtonElement>("[data-carrom-mode]").forEach((button) => {
      const selected = button.dataset.carromMode === state.difficulty;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("is-selected", selected);
    });
    container.querySelectorAll<HTMLButtonElement>("[data-carrom-move]").forEach((button) => {
      button.disabled = state.phase !== "aiming" || state.turn !== "player";
    });
    if (state.pendingRed && previous?.pendingRed !== state.pendingRed) {
      messageElement!.textContent = state.pendingRed === "player"
        ? "Red is pocketed! Cover it with black or white on your next shot."
        : "Computer pocketed red and must cover it on the next shot.";
    } else if (previous && (previous.score.player !== state.score.player || previous.score.ai !== state.score.ai)) {
      const scorer = state.score.player !== previous.score.player ? "You" : "Computer";
      const points = scorer === "You" ? state.score.player - previous.score.player : state.score.ai - previous.score.ai;
      messageElement!.textContent = `${scorer} scored ${points} points! Total: you ${state.score.player}, computer ${state.score.ai}.`;
    } else if (previous?.pendingRed && !state.pendingRed) {
      messageElement!.textContent = "Red was not covered, so it returned to the center.";
    }
    if (state.phase === "over" && previous?.phase !== "over") showResult();
    scheduleAi();
  }

  function restart(difficulty = state.difficulty): void {
    if (aiTimer !== undefined) window.clearTimeout(aiTimer);
    aiTimer = undefined;
    activePointer = undefined;
    aimPointer = null;
    state = createInitialState(difficulty);
    hideResult();
    updatePower();
    renderState();
    canvas!.focus();
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
    if (state.phase !== "aiming" || state.turn !== "player") return;
    const point = eventBoardPosition(event);
    const nearStriker = Math.hypot(point.x - state.striker.x, point.y - state.striker.y) <= 68;
    const onLaunchLine = point.y >= PLAYER_BASELINE_Y - 58;
    if (!nearStriker && !onLaunchLine) return;
    event.preventDefault();
    void sounds.unlock();
    if (onLaunchLine) state = positionPlayerStriker(state, point.x);
    activePointer = event.pointerId;
    aimPointer = { x: state.striker.x, y: state.striker.y };
    canvas!.setPointerCapture(event.pointerId);
    updatePower();
    renderState();
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    aimPointer = eventBoardPosition(event, false);
    updatePower();
  }

  function onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    const pointer = aimPointer;
    activePointer = undefined;
    aimPointer = null;
    if (canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId);
    updatePower();
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
    if (event.metaKey || event.ctrlKey || event.altKey || state.phase !== "aiming" || state.turn !== "player") return;
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
      state = launchPlayerShot(state, { x: state.striker.x, y: state.striker.y + 105 });
      renderState(previous);
    }
  }

  function onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-carrom-action], [data-carrom-result-action], [data-carrom-mode], [data-carrom-move], [data-carrom-sound]") : null;
    if (!target) return;
    if (target.hasAttribute("data-carrom-sound")) {
      sounds.setEnabled(!sounds.enabled);
      soundButton!.setAttribute("aria-pressed", String(sounds.enabled));
      soundButton!.setAttribute("aria-label", sounds.enabled ? "Turn sounds off" : "Turn sounds on");
      soundButton!.title = sounds.enabled ? "Sounds on" : "Sounds off";
      soundButton!.querySelector("span")!.textContent = sounds.enabled ? "🔊" : "🔇";
      if (sounds.enabled) void sounds.unlock();
    } else if (target.dataset.carromAction === "exit" || target.dataset.carromResultAction === "exit") exit();
    else if (target.dataset.carromAction === "new" || target.dataset.carromResultAction === "again") restart();
    else if (target.dataset.carromMode) restart(target.dataset.carromMode as Difficulty);
    else if (target.dataset.carromMove === "left") moveStriker(-1);
    else if (target.dataset.carromMove === "right") moveStriker(1);
  }

  function onVisibilityChange(): void {
    if (!document.hidden || state.phase !== "moving") return;
    aimPointer = null;
    activePointer = undefined;
    updatePower();
  }

  k.onDraw(drawScene);
  k.onUpdate(() => {
    if (destroyed || state.phase !== "moving") return;
    const previous = state;
    state = updateCarrom(state, Math.min(k.dt(), 1 / 30));
    if (state.phase !== previous.phase || state.score.player !== previous.score.player || state.score.ai !== previous.score.ai) renderState(previous);
  });

  container.addEventListener("click", onClick);
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
