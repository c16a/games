import type { GameContext, GameInstance } from "../../platform/game";
import {
  BIRD_RADIUS,
  BIRD_X,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  FLOOR_Y,
  PIPE_WIDTH,
  type FlappyState,
  createInitialState,
  flap,
  keyboardActionFor,
  nextPipeDistance,
  pauseRun,
  pipeSpeedForScore,
  resumeRun,
  updateFlappy,
} from "./logic";

const BEST_SCORE_KEY = "happy-arcade:flappy-bird-best";

const COLORS = {
  ink: [42, 36, 68],
  sky: [120, 220, 240],
  skyLight: [205, 247, 251],
  cloud: [255, 255, 255],
  sun: [255, 211, 73],
  pipe: [55, 190, 132],
  pipeDark: [20, 118, 92],
  pipeLight: [135, 236, 178],
  grass: [91, 202, 112],
  earth: [255, 211, 111],
  bird: [255, 215, 64],
  wing: [255, 143, 73],
  beak: [239, 83, 80],
} as const;

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
    // Storage is optional; the game remains fully playable without it.
  }
}

function statusMessage(state: FlappyState): string {
  if (state.status === "ready") return "Tap the sky or press Space to take off!";
  if (state.status === "paused") return "Flight paused. Take a breath!";
  if (state.status === "over") return `Bonk! You flew through ${state.score} ${state.score === 1 ? "gap" : "gaps"}.`;
  if (state.score === 0) return "Keep tapping to stay in the air!";
  return `${state.score} ${state.score === 1 ? "gap" : "gaps"} cleared — keep flying!`;
}

function paceLabel(score: number): string {
  if (score >= 18) return "Zoom!";
  if (score >= 8) return "Quick";
  return "Gentle";
}

function flightSummary(state: FlappyState): string {
  const distance = nextPipeDistance(state);
  const pipeMessage = distance === undefined ? "The first gate is ahead." : `The next gate is ${Math.round(distance)} pixels away.`;
  return `${statusMessage(state)} Score ${state.score}. Bird height ${Math.round(FLOOR_Y - state.birdY)}. ${pipeMessage}`;
}

export async function mount({ container, exit, kaplayReady, signal }: GameContext): Promise<GameInstance> {
  const { default: kaplay } = await (kaplayReady ?? import("kaplay"));
  if (signal?.aborted) return { destroy() {} };
  let state = createInitialState();
  let bestScore = loadBestScore();
  let destroyed = false;
  let renderElapsed = 0;
  let summaryElapsed = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  container.innerHTML = `
    <main class="game-page flappy-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-flappy-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow flappy-eyebrow">Tap • flap • fly</span>
          <h1>Flappy Bird</h1>
        </div>
        <button class="icon-button" type="button" data-flappy-action="new" aria-label="Start a new Flappy Bird run">↻</button>
      </header>

      <section class="flappy-game" aria-label="Flappy Bird game">
        <div class="flappy-mission">
          <div class="flappy-mission-icon" aria-hidden="true">🐤</div>
          <div>
            <p class="mission-title">Flutter through every gap!</p>
            <p class="mission-copy">Tap anywhere on the sky or press Space to take off and flap.</p>
          </div>
          <div class="flappy-scores" aria-label="Flight score">
            <div><span>Score</span><strong data-flappy-score>0</strong></div>
            <div><span>Best</span><strong data-flappy-best>${bestScore}</strong></div>
            <div><span>Pace</span><strong data-flappy-pace>Gentle</strong></div>
          </div>
        </div>

        <div class="flappy-workspace">
          <div class="flappy-board-shell">
            <canvas
              class="flappy-canvas"
              data-flappy-canvas
              width="${BOARD_WIDTH}"
              height="${BOARD_HEIGHT}"
              tabindex="0"
              role="application"
              aria-label="Flappy Bird playfield. Tap or press Space to start and flap through the green gates. Press Escape to pause."
            ></canvas>
            <button
              class="flappy-board-pause"
              type="button"
              data-flappy-action="pause"
              aria-label="Pause game"
              disabled
            >
              <span aria-hidden="true">⏸</span>
              <strong>Pause</strong>
            </button>
            <div class="flappy-board-score" data-flappy-board-score aria-hidden="true">0</div>
            <div class="flappy-board-prompt" data-flappy-prompt aria-hidden="true">
              <strong>Tap to flap!</strong>
              <span>Fly through the gaps</span>
            </div>
          </div>

          <p class="flappy-message" data-flappy-message aria-live="polite">${statusMessage(state)}</p>
          <p class="visually-hidden" data-flappy-summary>${flightSummary(state)}</p>
        </div>
      </section>

      <div class="celebration" data-flappy-result aria-live="assertive" hidden></div>
    </main>`;

  const canvas = container.querySelector<HTMLCanvasElement>("[data-flappy-canvas]");
  const scoreElement = container.querySelector<HTMLElement>("[data-flappy-score]");
  const bestElement = container.querySelector<HTMLElement>("[data-flappy-best]");
  const paceElement = container.querySelector<HTMLElement>("[data-flappy-pace]");
  const boardScore = container.querySelector<HTMLElement>("[data-flappy-board-score]");
  const promptElement = container.querySelector<HTMLElement>("[data-flappy-prompt]");
  const messageElement = container.querySelector<HTMLElement>("[data-flappy-message]");
  const summaryElement = container.querySelector<HTMLElement>("[data-flappy-summary]");
  const pauseButton = container.querySelector<HTMLButtonElement>('[data-flappy-action="pause"]');
  const resultElement = container.querySelector<HTMLElement>("[data-flappy-result]");
  if (!canvas || !scoreElement || !bestElement || !paceElement || !boardScore || !promptElement || !messageElement || !summaryElement || !pauseButton || !resultElement) {
    throw new Error("Flappy Bird UI could not be created");
  }

  const k = kaplay({
    global: false,
    canvas,
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    background: [...COLORS.sky],
    debug: false,
    focus: false,
    touchToMouse: false,
  });

  function rgb(color: readonly [number, number, number]) {
    return k.rgb(color[0], color[1], color[2]);
  }

  function drawCloud(x: number, y: number, scale: number): void {
    const color = rgb(COLORS.cloud);
    k.drawCircle({ pos: k.vec2(x, y), radius: 24 * scale, color, opacity: 0.88, anchor: "center" });
    k.drawCircle({ pos: k.vec2(x + 28 * scale, y - 10 * scale), radius: 32 * scale, color, opacity: 0.88, anchor: "center" });
    k.drawCircle({ pos: k.vec2(x + 62 * scale, y), radius: 25 * scale, color, opacity: 0.88, anchor: "center" });
    k.drawRect({ pos: k.vec2(x, y), width: 62 * scale, height: 24 * scale, color, opacity: 0.88 });
  }

  function drawBackground(): void {
    k.drawRect({ pos: k.vec2(0, 0), width: BOARD_WIDTH, height: FLOOR_Y, color: rgb(COLORS.sky) });
    k.drawRect({ pos: k.vec2(0, 0), width: BOARD_WIDTH, height: 280, color: rgb(COLORS.skyLight), opacity: 0.34 });
    k.drawCircle({ pos: k.vec2(440, 96), radius: 49, color: rgb(COLORS.sun), opacity: 0.92, anchor: "center", outline: { width: 5, color: k.rgb(255, 183, 38) } });

    const drift = reducedMotion ? 0 : renderElapsed * 12;
    drawCloud(55 - drift % 690, 132, 0.82);
    drawCloud(390 - (drift * 0.62) % 760, 242, 0.62);
    drawCloud(655 - drift % 690, 132, 0.82);

    k.drawPolygon({
      pts: [k.vec2(0, FLOOR_Y), k.vec2(0, 548), k.vec2(95, 495), k.vec2(180, 548), k.vec2(295, 474), k.vec2(408, 544), k.vec2(540, 482), k.vec2(540, FLOOR_Y)],
      color: k.rgb(105, 201, 173),
      opacity: 0.42,
    });
  }

  function drawPipe(pipe: FlappyState["pipes"][number]): void {
    const gapTop = pipe.gapY - pipe.gapHeight / 2;
    const gapBottom = pipe.gapY + pipe.gapHeight / 2;
    const body = rgb(COLORS.pipe);
    const outline = rgb(COLORS.pipeDark);
    const highlight = rgb(COLORS.pipeLight);

    k.drawRect({ pos: k.vec2(pipe.x, -8), width: PIPE_WIDTH, height: gapTop + 8, color: body, outline: { width: 5, color: outline } });
    k.drawRect({ pos: k.vec2(pipe.x, gapTop - 28), width: PIPE_WIDTH, height: 28, radius: 7, color: body, outline: { width: 5, color: outline } });
    k.drawRect({ pos: k.vec2(pipe.x + 12, 0), width: 11, height: Math.max(0, gapTop - 32), color: highlight, opacity: 0.7 });

    k.drawRect({ pos: k.vec2(pipe.x, gapBottom), width: PIPE_WIDTH, height: FLOOR_Y - gapBottom + 8, color: body, outline: { width: 5, color: outline } });
    k.drawRect({ pos: k.vec2(pipe.x, gapBottom), width: PIPE_WIDTH, height: 28, radius: 7, color: body, outline: { width: 5, color: outline } });
    k.drawRect({ pos: k.vec2(pipe.x + 12, gapBottom + 32), width: 11, height: Math.max(0, FLOOR_Y - gapBottom - 32), color: highlight, opacity: 0.7 });
  }

  function drawGround(): void {
    k.drawRect({ pos: k.vec2(0, FLOOR_Y), width: BOARD_WIDTH, height: BOARD_HEIGHT - FLOOR_Y, color: rgb(COLORS.earth) });
    k.drawRect({ pos: k.vec2(0, FLOOR_Y), width: BOARD_WIDTH, height: 15, color: rgb(COLORS.grass), outline: { width: 4, color: rgb(COLORS.ink) } });
    const offset = reducedMotion ? 0 : (renderElapsed * pipeSpeedForScore(state.score) * 0.45) % 44;
    for (let x = -44 - offset; x < BOARD_WIDTH + 44; x += 44) {
      k.drawPolygon({
        pts: [k.vec2(x, FLOOR_Y + 19), k.vec2(x + 22, FLOOR_Y + 19), k.vec2(x + 44, BOARD_HEIGHT), k.vec2(x + 22, BOARD_HEIGHT)],
        color: k.rgb(255, 231, 150),
        opacity: 0.72,
      });
    }
  }

  function drawBird(): void {
    const readyBob = state.status === "ready" && !reducedMotion ? Math.sin(renderElapsed * 4) * 7 : 0;
    const y = state.birdY + readyBob;
    const angle = state.status === "ready" ? -5 : Math.max(-22, Math.min(62, state.birdVelocity * 0.1));
    const wingLift = reducedMotion ? 0 : Math.sin(renderElapsed * (state.status === "running" ? 18 : 6)) * 7;

    k.drawEllipse({ pos: k.vec2(BIRD_X + 4, y + 7), radiusX: BIRD_RADIUS + 4, radiusY: BIRD_RADIUS - 1, angle, color: rgb(COLORS.ink), opacity: 0.2 });
    k.drawEllipse({ pos: k.vec2(BIRD_X, y), radiusX: BIRD_RADIUS + 5, radiusY: BIRD_RADIUS, angle, color: rgb(COLORS.bird), outline: { width: 4, color: rgb(COLORS.ink) } });
    k.drawEllipse({ pos: k.vec2(BIRD_X - 9, y + 6 + wingLift * 0.25), radiusX: 14, radiusY: 10, angle: angle - wingLift, color: rgb(COLORS.wing), outline: { width: 3, color: rgb(COLORS.ink) } });
    k.drawCircle({ pos: k.vec2(BIRD_X + 11, y - 8), radius: 7, color: k.rgb(255, 255, 255), anchor: "center", outline: { width: 2, color: rgb(COLORS.ink) } });
    k.drawCircle({ pos: k.vec2(BIRD_X + 13, y - 8), radius: 2.5, color: rgb(COLORS.ink), anchor: "center" });
    k.drawPolygon({
      pts: [k.vec2(BIRD_X + 20, y - 1), k.vec2(BIRD_X + 38, y + 5), k.vec2(BIRD_X + 20, y + 11)],
      color: rgb(COLORS.beak),
      outline: { width: 3, color: rgb(COLORS.ink) },
    });
  }

  function drawScene(): void {
    drawBackground();
    state.pipes.forEach(drawPipe);
    drawGround();
    drawBird();
  }

  function hideResult(): void {
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
  }

  function showResult(newBest: boolean): void {
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card flappy-result-card" role="dialog" aria-modal="true" aria-labelledby="flappy-result-title">
        <div class="flappy-result-icon" aria-hidden="true">${state.score >= 10 ? "🏆" : state.score >= 4 ? "🌟" : "🐤"}</div>
        <p class="eyebrow flappy-eyebrow">${newBest ? "New best flight" : "Flight complete"}</p>
        <h2 id="flappy-result-title">${state.score} ${state.score === 1 ? "gap" : "gaps"}!</h2>
        <p>${state.score === 0 ? "That first gap is waiting for you." : "Each gap makes the next flight easier to read."}</p>
        <div class="result-actions">
          <button class="check-button flappy-result-button" type="button" data-flappy-result-action="again">Fly again</button>
          <button class="text-button" type="button" data-flappy-result-action="exit">All games</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>('[data-flappy-result-action="again"]')?.focus();
  }

  function renderState(previous?: FlappyState): void {
    const newBest = state.score > bestScore;
    if (state.score > bestScore) {
      bestScore = state.score;
      saveBestScore(bestScore);
    }
    scoreElement!.textContent = String(state.score);
    bestElement!.textContent = String(bestScore);
    paceElement!.textContent = paceLabel(state.score);
    boardScore!.textContent = String(state.score);
    messageElement!.textContent = statusMessage(state);
    summaryElement!.textContent = flightSummary(state);
    pauseButton!.disabled = state.status === "ready" || state.status === "over";
    pauseButton!.setAttribute("aria-label", state.status === "paused" ? "Resume game" : "Pause game");
    pauseButton!.querySelector("span")!.textContent = state.status === "paused" ? "▶" : "⏸";
    pauseButton!.querySelector("strong")!.textContent = state.status === "paused" ? "Resume" : "Pause";
    promptElement!.hidden = state.status === "running";
    if (state.status === "ready") promptElement!.innerHTML = "<strong>Tap to flap!</strong><span>Fly through the gaps</span>";
    else if (state.status === "paused") promptElement!.innerHTML = "<strong>Paused</strong><span>Tap Resume when ready</span>";
    else if (state.status === "over") promptElement!.innerHTML = "<strong>Good flight!</strong><span>Ready for another?</span>";
    if (state.status === "over" && previous?.status !== "over") showResult(newBest);
  }

  function flapNow(): void {
    if (state.status === "paused" || state.status === "over") return;
    const previous = state;
    state = flap(state);
    renderState(previous);
    canvas!.focus({ preventScroll: true });
  }

  function restart(): void {
    state = createInitialState();
    summaryElapsed = 0;
    hideResult();
    renderState();
    canvas!.focus({ preventScroll: true });
  }

  function togglePause(): void {
    const previous = state;
    state = state.status === "paused" ? resumeRun(state) : pauseRun(state);
    renderState(previous);
    canvas!.focus({ preventScroll: true });
  }

  function pause(): void {
    const previous = state;
    state = pauseRun(state);
    renderState(previous);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || state.status === "paused" || state.status === "over") return;
    event.preventDefault();
    flapNow();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const action = keyboardActionFor(event.key, state.status);
    if (action === "pause") {
      event.preventDefault();
      pause();
      return;
    }
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) return;
    if (action === "flap") {
      event.preventDefault();
      flapNow();
    } else if (action === "toggle-pause") {
      event.preventDefault();
      togglePause();
    }
  }

  function onClick(event: MouseEvent): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-flappy-action], [data-flappy-result-action]")
      : null;
    if (!target) return;
    if (target.dataset.flappyAction === "exit" || target.dataset.flappyResultAction === "exit") exit();
    else if (target.dataset.flappyAction === "new" || target.dataset.flappyResultAction === "again") restart();
    else if (target.dataset.flappyAction === "pause") togglePause();
  }

  function onVisibilityChange(): void {
    if (!document.hidden || state.status !== "running") return;
    pause();
  }

  k.onDraw(drawScene);
  k.onUpdate(() => {
    if (destroyed) return;
    const delta = Math.min(k.dt(), 1 / 20);
    renderElapsed += delta;
    summaryElapsed += delta;
    if (state.status === "running") {
      const previous = state;
      state = updateFlappy(state, delta);
      if (state.status !== previous.status || state.score !== previous.score) renderState(previous);
      else if (summaryElapsed >= 0.2) {
        summaryElapsed = 0;
        summaryElement!.textContent = flightSummary(state);
      }
    }
  });

  container.addEventListener("click", onClick);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeyDown);
  document.addEventListener("visibilitychange", onVisibilityChange);
  renderState();

  return {
    destroy(): void {
      destroyed = true;
      container.removeEventListener("click", onClick);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      k.quit();
      container.innerHTML = "";
    },
  };
}
