import type { GameContext, GameInstance } from "../../platform/game";
import {
  BALL_RADIUS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type BreakoutState,
  displayToBoardX,
  createInitialState,
  launchBall,
  movePaddleTo,
  pauseGame,
  restartGame,
  resumeGame,
  setPaddleInput,
  updateBreakout,
} from "./logic";

const BEST_SCORE_KEY = "happy-arcade:breakout-best";
const BRICK_COLORS = [
  [255, 107, 107],
  [255, 146, 43],
  [255, 212, 59],
  [81, 207, 102],
  [77, 171, 247],
] as const;

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
    // Storage is optional; play continues normally when unavailable.
  }
}

function boardDescription(state: BreakoutState): string {
  const remaining = state.bricks.filter(({ alive }) => alive).length;
  return `${remaining} bricks remain. Paddle at ${Math.round(state.paddle.x)} of ${BOARD_WIDTH}. Ball at ${Math.round(state.ball.x)}, ${Math.round(state.ball.y)}.`;
}

export async function mount({ container, exit }: GameContext): Promise<GameInstance> {
  const { default: kaplay } = await import("kaplay");
  let state = createInitialState();
  let bestScore = loadBestScore();
  let destroyed = false;
  let activePointer: number | undefined;
  const heldDirections = new Set<-1 | 1>();

  container.innerHTML = `
    <main class="game-page breakout-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-breakout-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow breakout-eyebrow">Reflexes + prediction</span>
          <h1>Breakout</h1>
        </div>
        <button class="icon-button" type="button" data-breakout-action="new" aria-label="Start a new Breakout game">↻</button>
      </header>

      <section class="breakout-game" aria-label="Breakout game">
        <div class="breakout-mission">
          <div class="breakout-mission-icon" aria-hidden="true">🧱</div>
          <div>
            <p class="mission-title">Bounce the ball. Clear the wall!</p>
            <p class="mission-copy">Drag or tap the board, use the hold buttons, or press arrows and A/D.</p>
          </div>
          <div class="breakout-stats" aria-label="Game status">
            <div><span>Score</span><strong data-breakout-score>0</strong></div>
            <div><span>Best</span><strong data-breakout-best>${bestScore}</strong></div>
            <div><span>Lives</span><strong data-breakout-lives>♥ ♥ ♥</strong></div>
          </div>
        </div>

        <div class="breakout-workspace">
          <div class="breakout-board-shell">
            <canvas
              class="breakout-canvas"
              data-breakout-canvas
              width="640"
              height="720"
              tabindex="0"
              role="img"
              aria-label="Breakout board. Move the paddle to keep the ball in play."
            ></canvas>
          </div>

          <p class="breakout-message" data-breakout-message aria-live="polite">Move the paddle, then launch when you are ready!</p>
          <p class="visually-hidden" data-breakout-summary>${boardDescription(state)}</p>

          <div class="breakout-steer" aria-label="Move paddle">
            <button type="button" data-breakout-hold="left" aria-label="Hold to move paddle left">◀ Hold left</button>
            <button type="button" data-breakout-hold="right" aria-label="Hold to move paddle right">Hold right ▶</button>
          </div>

          <div class="breakout-controls">
            <button class="soft-button" type="button" data-breakout-action="pause" disabled>Pause</button>
            <button class="check-button breakout-launch" type="button" data-breakout-action="launch">Launch ball</button>
            <button class="soft-button" type="button" data-breakout-action="new">New game</button>
          </div>
        </div>
      </section>

      <div class="celebration" data-breakout-result aria-live="assertive" hidden></div>
    </main>`;

  const canvas = container.querySelector<HTMLCanvasElement>("[data-breakout-canvas]");
  const scoreElement = container.querySelector<HTMLElement>("[data-breakout-score]");
  const bestElement = container.querySelector<HTMLElement>("[data-breakout-best]");
  const livesElement = container.querySelector<HTMLElement>("[data-breakout-lives]");
  const messageElement = container.querySelector<HTMLElement>("[data-breakout-message]");
  const summaryElement = container.querySelector<HTMLElement>("[data-breakout-summary]");
  const pauseButton = container.querySelector<HTMLButtonElement>('[data-breakout-action="pause"]');
  const launchButton = container.querySelector<HTMLButtonElement>('[data-breakout-action="launch"]');
  const resultElement = container.querySelector<HTMLElement>("[data-breakout-result]");
  if (!canvas || !scoreElement || !bestElement || !livesElement || !messageElement || !summaryElement || !pauseButton || !launchButton || !resultElement) {
    throw new Error("Breakout UI could not be created");
  }

  const k = kaplay({
    global: false,
    canvas,
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    background: [21, 35, 62],
    debug: false,
    focus: false,
    touchToMouse: false,
  });
  canvas.classList.add("breakout-canvas");

  function drawBoard(): void {
    for (let x = 32; x < BOARD_WIDTH; x += 64) {
      for (let y = 36; y < BOARD_HEIGHT; y += 64) {
        k.drawCircle({ pos: k.vec2(x, y), radius: 2, color: k.rgb(73, 92, 127), anchor: "center" });
      }
    }
    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      const [red, green, blue] = BRICK_COLORS[brick.row]!;
      k.drawRect({
        pos: k.vec2(brick.x, brick.y),
        width: brick.width,
        height: brick.height,
        radius: 7,
        color: k.rgb(red, green, blue),
        outline: { width: 3, color: k.rgb(36, 31, 69) },
      });
      k.drawRect({ pos: k.vec2(brick.x + 7, brick.y + 5), width: brick.width - 14, height: 4, radius: 2, color: k.rgb(255, 255, 255), opacity: 0.3 });
    }

    k.drawRect({
      pos: k.vec2(state.paddle.x - state.paddle.width / 2, state.paddle.y),
      width: state.paddle.width,
      height: state.paddle.height,
      radius: 9,
      color: k.rgb(177, 151, 252),
      outline: { width: 4, color: k.rgb(36, 31, 69) },
    });
    k.drawRect({
      pos: k.vec2(state.paddle.x - state.paddle.width * 0.28, state.paddle.y + 4),
      width: state.paddle.width * 0.56,
      height: 4,
      radius: 2,
      color: k.rgb(255, 255, 255),
      opacity: 0.55,
    });
    k.drawCircle({
      pos: k.vec2(state.ball.x, state.ball.y),
      radius: BALL_RADIUS,
      color: k.rgb(255, 244, 191),
      anchor: "center",
      outline: { width: 3, color: k.rgb(36, 31, 69) },
    });
  }

  function clearHeldInput(): void {
    heldDirections.clear();
    state = setPaddleInput(state, 0);
  }

  function syncHeldInput(): void {
    const input = heldDirections.has(-1) === heldDirections.has(1) ? 0 : heldDirections.has(-1) ? -1 : 1;
    state = setPaddleInput(state, input);
  }

  function hideResult(): void {
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
  }

  function showResult(): void {
    const won = state.status === "won";
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card breakout-result-card" role="dialog" aria-modal="true" aria-labelledby="breakout-result-title">
        <div class="breakout-result-icon" aria-hidden="true">${won ? "🏆" : "🌟"}</div>
        <p class="eyebrow breakout-eyebrow">${won ? "Wall cleared!" : "Great rally!"}</p>
        <h2 id="breakout-result-title">${won ? "Brick-busting hero!" : `You scored ${state.score}`}</h2>
        <p>${won ? "Your timing and aim cleared every last brick." : "That paddle work was terrific. Ready for another rally?"}</p>
        <div class="result-actions">
          <button class="check-button breakout-result-button" type="button" data-breakout-result-action="again">Play again</button>
          <button class="text-button" type="button" data-breakout-result-action="exit">All games</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>('[data-breakout-result-action="again"]')?.focus();
  }

  function renderState(previous?: BreakoutState): void {
    if (state.score > bestScore) {
      bestScore = state.score;
      saveBestScore(bestScore);
    }
    scoreElement!.textContent = String(state.score);
    bestElement!.textContent = String(bestScore);
    livesElement!.textContent = Array.from({ length: 3 }, (_, index) => index < state.lives ? "♥" : "♡").join(" ");
    summaryElement!.textContent = boardDescription(state);
    pauseButton!.disabled = state.status === "ready" || state.status === "won" || state.status === "lost";
    pauseButton!.textContent = state.status === "paused" ? "Resume" : "Pause";
    launchButton!.hidden = state.status !== "ready";

    if (state.status === "ready" && previous?.lives !== undefined && previous.lives > state.lives) {
      messageElement!.textContent = `Ball missed. ${state.lives} ${state.lives === 1 ? "life" : "lives"} left—move the paddle and launch again.`;
    } else if (state.status === "ready") messageElement!.textContent = "Move the paddle, then launch when you are ready!";
    else if (state.status === "paused") messageElement!.textContent = "Paused. Press Resume when you are ready.";
    else if (state.status === "running" && previous?.score !== state.score) messageElement!.textContent = `Smash! Score ${state.score}.`;
    else if (state.status === "running") messageElement!.textContent = "Ball in play—keep it bouncing!";

    if ((state.status === "won" || state.status === "lost") && previous?.status !== state.status) showResult();
  }

  function restart(): void {
    clearHeldInput();
    state = restartGame();
    hideResult();
    renderState();
    canvas!.focus();
  }

  function launch(): void {
    const previous = state;
    state = launchBall(state);
    renderState(previous);
    canvas!.focus();
  }

  function togglePause(): void {
    clearHeldInput();
    const previous = state;
    state = state.status === "paused" ? resumeGame(state) : pauseGame(state);
    renderState(previous);
    canvas!.focus();
  }

  function autoPause(): void {
    if (state.status !== "running") return;
    clearHeldInput();
    const previous = state;
    state = pauseGame(state);
    renderState(previous);
  }

  function onVisibilityChange(): void {
    if (document.hidden) autoPause();
  }

  function movePaddleFromPointer(event: PointerEvent): void {
    const rect = canvas!.getBoundingClientRect();
    state = movePaddleTo(state, displayToBoardX(event.clientX, rect.left, rect.width));
  }

  function onCanvasPointerDown(event: PointerEvent): void {
    event.preventDefault();
    activePointer = event.pointerId;
    canvas!.setPointerCapture(event.pointerId);
    movePaddleFromPointer(event);
  }

  function onCanvasPointerMove(event: PointerEvent): void {
    if (event.pointerType === "mouse" || event.pointerId === activePointer) movePaddleFromPointer(event);
  }

  function onCanvasPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== activePointer) return;
    activePointer = undefined;
    if (canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId);
  }

  function keyDirection(key: string): -1 | 1 | undefined {
    if (key === "ArrowLeft" || key === "a" || key === "A") return -1;
    if (key === "ArrowRight" || key === "d" || key === "D") return 1;
    return undefined;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const direction = keyDirection(event.key);
    if (!direction) return;
    event.preventDefault();
    heldDirections.add(direction);
    syncHeldInput();
  }

  function onKeyUp(event: KeyboardEvent): void {
    const direction = keyDirection(event.key);
    if (!direction) return;
    heldDirections.delete(direction);
    syncHeldInput();
  }

  function holdDirection(target: Element, pressed: boolean): void {
    const value = target.closest<HTMLElement>("[data-breakout-hold]")?.dataset.breakoutHold;
    const direction = value === "left" ? -1 : value === "right" ? 1 : undefined;
    if (!direction) return;
    if (pressed) heldDirections.add(direction);
    else heldDirections.delete(direction);
    syncHeldInput();
  }

  function onContainerPointerDown(event: PointerEvent): void {
    if (!(event.target instanceof Element) || !event.target.closest("[data-breakout-hold]")) return;
    event.preventDefault();
    event.target.closest<HTMLElement>("[data-breakout-hold]")?.setPointerCapture(event.pointerId);
    holdDirection(event.target, true);
  }

  function onContainerPointerEnd(event: PointerEvent): void {
    if (event.target instanceof Element) holdDirection(event.target, false);
  }

  function onContainerClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-breakout-action], [data-breakout-result-action]") : null;
    if (!target) return;
    if (target.dataset.breakoutAction === "exit" || target.dataset.breakoutResultAction === "exit") exit();
    if (target.dataset.breakoutAction === "new" || target.dataset.breakoutResultAction === "again") restart();
    if (target.dataset.breakoutAction === "launch") launch();
    if (target.dataset.breakoutAction === "pause") togglePause();
  }

  k.onDraw(drawBoard);
  k.onUpdate(() => {
    if (destroyed || state.status !== "running") return;
    const previous = state;
    state = updateBreakout(state, Math.min(k.dt(), 1 / 30));
    if (state.status !== previous.status || state.score !== previous.score || state.lives !== previous.lives) renderState(previous);
  });

  container.addEventListener("click", onContainerClick);
  container.addEventListener("pointerdown", onContainerPointerDown);
  container.addEventListener("pointerup", onContainerPointerEnd);
  container.addEventListener("pointercancel", onContainerPointerEnd);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", autoPause);
  document.addEventListener("visibilitychange", onVisibilityChange);
  canvas.addEventListener("pointerdown", onCanvasPointerDown);
  canvas.addEventListener("pointermove", onCanvasPointerMove);
  canvas.addEventListener("pointerup", onCanvasPointerEnd);
  canvas.addEventListener("pointercancel", onCanvasPointerEnd);
  renderState();

  return {
    destroy(): void {
      destroyed = true;
      activePointer = undefined;
      clearHeldInput();
      container.removeEventListener("click", onContainerClick);
      container.removeEventListener("pointerdown", onContainerPointerDown);
      container.removeEventListener("pointerup", onContainerPointerEnd);
      container.removeEventListener("pointercancel", onContainerPointerEnd);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", autoPause);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointerdown", onCanvasPointerDown);
      canvas.removeEventListener("pointermove", onCanvasPointerMove);
      canvas.removeEventListener("pointerup", onCanvasPointerEnd);
      canvas.removeEventListener("pointercancel", onCanvasPointerEnd);
      k.quit();
      container.innerHTML = "";
    },
  };
}
