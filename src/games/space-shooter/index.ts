import type { GameContext, GameInstance } from "../../platform/game";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type CombatEvent,
  type Enemy,
  type ShooterControls,
  type ShooterState,
  boltDamage,
  boltsPerSecond,
  createInitialState,
  killsRequired,
  movePlayerTo,
  pauseGame,
  restartGame,
  resumeGame,
  scaledFrameSeconds,
  startGame,
  updateShooter,
} from "./logic";

const BEST_SCORE_KEY = "happy-arcade:space-shooter-best";
type HeldDirection = keyof ShooterControls;

interface VisualEffect {
  kind: CombatEvent["kind"];
  x: number;
  y: number;
  text: string;
  elapsed: number;
  duration: number;
  large: boolean;
}

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
    // Storage is optional; combat continues when unavailable.
  }
}

function gameSummary(state: ShooterState, timeScale = 1): string {
  const requirement = killsRequired(state.player.level);
  return `Plane level ${state.player.level}. Position ${Math.round(state.player.x)}, ${Math.round(state.player.y)}. Health ${state.player.health} of ${state.player.maxHealth}. Score ${state.score}. ${state.player.killsTowardUpgrade} of ${requirement} kills toward the next upgrade. Fire rate ${boltsPerSecond(state.player.level)} per second. Fire power ${boltDamage(state.player.level)}. Game speed ${timeScale < 1 ? "slow motion" : "normal"}. ${state.enemies.length} enemies and ${state.bolts.length} bolts active.`;
}

export async function mount({ container, exit }: GameContext): Promise<GameInstance> {
  const { default: kaplay } = await import("kaplay");
  let state = createInitialState();
  let bestScore = loadBestScore();
  let destroyed = false;
  let hudElapsed = 0;
  let activeDrag: number | undefined;
  let timeScale = 1;
  const heldDirections = new Set<HeldDirection>();
  const effects: VisualEffect[] = [];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  container.innerHTML = `
    <main class="game-page shooter-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-shooter-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow shooter-eyebrow">Endless arcade flight</span>
          <h1>Star Squadron</h1>
        </div>
        <button class="icon-button" type="button" data-shooter-action="new" aria-label="Start a new Star Squadron run">↻</button>
      </header>

      <section class="shooter-game" aria-label="Endless space shooter">
        <div class="shooter-mission">
          <div class="shooter-mission-icon" aria-hidden="true">🛸</div>
          <div>
            <p class="mission-title">Steer, survive, and upgrade!</p>
            <p class="mission-copy">Your plane fires automatically. Drag or steer around incoming ships.</p>
          </div>
          <div class="shooter-scores" aria-label="Run status">
            <div><span>Score</span><strong data-shooter-score>0</strong></div>
            <div><span>Best</span><strong data-shooter-best>${bestScore}</strong></div>
            <div><span>Level</span><strong data-shooter-level>1</strong></div>
          </div>
        </div>

        <div class="shooter-workspace">
          <div class="shooter-board-shell">
            <canvas
              class="shooter-canvas"
              data-shooter-canvas
              width="${BOARD_WIDTH}"
              height="${BOARD_HEIGHT}"
              tabindex="0"
              role="img"
              aria-label="Star Squadron playfield with health, upgrade progress, fire rate, and fire power. Drag to steer; firing is automatic."
            ></canvas>
          </div>

          <div class="visually-hidden" aria-label="Plane status">
            <span>Health <strong data-shooter-health>100 / 100</strong></span>
            <span>Next upgrade <strong data-shooter-progress>0 / 10</strong></span>
            <span>Fire rate <strong data-shooter-rate>1 per second</strong></span>
            <span>Fire power <strong data-shooter-power>10</strong></span>
          </div>

          <p class="visually-hidden" data-shooter-summary>${gameSummary(state, timeScale)}</p>
          <p class="shooter-message" data-shooter-message aria-live="polite">Start the run, then keep moving—the cannons fire for you!</p>

          <div class="shooter-actions">
            <button class="soft-button shooter-icon-action" type="button" data-shooter-action="pause" aria-label="Pause game" title="Pause" disabled>⏸</button>
            <button class="check-button shooter-start shooter-icon-action" type="button" data-shooter-action="start" aria-label="Start run" title="Start run">▶</button>
            <button class="soft-button shooter-icon-action" type="button" data-shooter-action="new" aria-label="New run" title="New run">↻</button>
          </div>
        </div>
      </section>

      <div class="celebration" data-shooter-result aria-live="assertive" hidden></div>
    </main>`;

  const canvas = container.querySelector<HTMLCanvasElement>("[data-shooter-canvas]");
  const scoreElement = container.querySelector<HTMLElement>("[data-shooter-score]");
  const bestElement = container.querySelector<HTMLElement>("[data-shooter-best]");
  const levelElement = container.querySelector<HTMLElement>("[data-shooter-level]");
  const healthElement = container.querySelector<HTMLElement>("[data-shooter-health]");
  const progressElement = container.querySelector<HTMLElement>("[data-shooter-progress]");
  const rateElement = container.querySelector<HTMLElement>("[data-shooter-rate]");
  const powerElement = container.querySelector<HTMLElement>("[data-shooter-power]");
  const summaryElement = container.querySelector<HTMLElement>("[data-shooter-summary]");
  const messageElement = container.querySelector<HTMLElement>("[data-shooter-message]");
  const pauseButton = container.querySelector<HTMLButtonElement>('[data-shooter-action="pause"]');
  const startButton = container.querySelector<HTMLButtonElement>('[data-shooter-action="start"]');
  const resultElement = container.querySelector<HTMLElement>("[data-shooter-result]");
  if (!canvas || !scoreElement || !bestElement || !levelElement || !healthElement || !progressElement || !rateElement || !powerElement || !summaryElement || !messageElement || !pauseButton || !startButton || !resultElement) {
    throw new Error("Star Squadron UI could not be created");
  }

  const k = kaplay({
    global: false,
    canvas,
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    background: [7, 11, 30],
    crisp: true,
    debug: false,
    focus: false,
    touchToMouse: false,
  });
  canvas.classList.add("shooter-canvas");
  const stars = Array.from({ length: 74 }, (_, index) => ({
    x: (index * 109 + 31) % BOARD_WIDTH,
    y: (index * index * 23 + index * 37) % BOARD_HEIGHT,
    speed: 16 + index % 5 * 8,
    radius: index % 13 === 0 ? 2 : 1,
  }));

  function drawPlayer(): void {
    const { player } = state;
    const levelWidth = Math.min(12, (player.level - 1) * 2);
    const halfWidth = player.width / 2;
    const halfHeight = player.height / 2;
    k.drawPolygon({
      pts: [
        k.vec2(player.x, player.y - halfHeight),
        k.vec2(player.x + halfWidth + levelWidth, player.y + halfHeight * 0.72),
        k.vec2(player.x, player.y + halfHeight * 0.48),
        k.vec2(player.x - halfWidth - levelWidth, player.y + halfHeight * 0.72),
      ],
      color: k.rgb(116, 192, 252),
      outline: { width: 4, color: k.rgb(232, 240, 255) },
    });
    k.drawPolygon({
      pts: [k.vec2(player.x, player.y - halfHeight * 0.72), k.vec2(player.x + 11, player.y + 18), k.vec2(player.x - 11, player.y + 18)],
      color: k.rgb(255, 212, 59),
      outline: { width: 3, color: k.rgb(36, 31, 69) },
    });
    for (let cannon = 0; cannon < Math.min(4, player.level); cannon += 1) {
      const side = cannon % 2 === 0 ? -1 : 1;
      const row = Math.floor(cannon / 2);
      k.drawRect({ pos: k.vec2(player.x + side * (21 + row * 10) - 3, player.y - 8), width: 6, height: 25, radius: 3, color: k.rgb(255, 107, 107) });
    }
    if (state.status === "running") {
      const flicker = reducedMotion ? 12 : 10 + Math.sin(state.elapsedSeconds * 35) * 4;
      k.drawPolygon({ pts: [k.vec2(player.x - 10, player.y + 28), k.vec2(player.x, player.y + 40 + flicker), k.vec2(player.x + 10, player.y + 28)], color: k.rgb(255, 146, 43) });
    }
  }

  function drawHud(): void {
    const required = killsRequired(state.player.level);
    const entries = [
      { icon: "♥", value: `${state.player.health}/${state.player.maxHealth}`, ratio: state.player.health / state.player.maxHealth, color: k.rgb(255, 107, 107) },
      { icon: "★", value: `${state.player.killsTowardUpgrade}/${required}`, ratio: state.player.killsTowardUpgrade / required, color: k.rgb(255, 212, 59) },
      { icon: "↯", value: `${boltsPerSecond(state.player.level)}/s`, color: k.rgb(116, 192, 252) },
      { icon: "◆", value: String(boltDamage(state.player.level)), color: k.rgb(177, 151, 252) },
    ];
    entries.forEach((entry, index) => {
      const x = 8 + index * 116;
      k.drawRect({ pos: k.vec2(x, 8), width: 108, height: 47, radius: 11, color: k.rgb(22, 28, 55), opacity: 0.92, outline: { width: 2, color: k.rgb(111, 126, 170) } });
      k.drawText({ text: entry.icon, pos: k.vec2(x + 11, 17), size: 23, font: "sans-serif", color: entry.color });
      k.drawText({ text: entry.value, pos: k.vec2(x + 39, 19), size: 16, font: "sans-serif", color: k.rgb(244, 247, 255) });
      if (entry.ratio !== undefined) {
        k.drawRect({ pos: k.vec2(x + 9, 46), width: 90, height: 4, radius: 2, color: k.rgb(60, 69, 99) });
        k.drawRect({ pos: k.vec2(x + 9, 46), width: 90 * Math.max(0, Math.min(1, entry.ratio)), height: 4, radius: 2, color: entry.color });
      }
    });
  }

  function drawEnemy(enemy: Enemy): void {
    if (enemy.kind === "scout") {
      k.drawPolygon({
        pts: [k.vec2(enemy.x, enemy.y + 17), k.vec2(enemy.x - 16, enemy.y - 12), k.vec2(enemy.x, enemy.y - 5), k.vec2(enemy.x + 16, enemy.y - 12)],
        color: k.rgb(255, 107, 107),
        outline: { width: 3, color: k.rgb(255, 225, 225) },
      });
      k.drawCircle({ pos: k.vec2(enemy.x, enemy.y - 2), radius: 5, anchor: "center", color: k.rgb(255, 212, 59) });
    } else {
      k.drawPolygon({
        pts: [k.vec2(enemy.x - 25, enemy.y), k.vec2(enemy.x - 15, enemy.y - 20), k.vec2(enemy.x + 15, enemy.y - 20), k.vec2(enemy.x + 25, enemy.y), k.vec2(enemy.x + 14, enemy.y + 21), k.vec2(enemy.x - 14, enemy.y + 21)],
        color: k.rgb(177, 151, 252),
        outline: { width: 4, color: k.rgb(243, 240, 255) },
      });
      k.drawRect({ pos: k.vec2(enemy.x - 13, enemy.y - 5), width: 26, height: 10, radius: 5, color: k.rgb(77, 171, 247) });
      k.drawText({ text: "C", pos: k.vec2(enemy.x, enemy.y + 10), size: 13, font: "sans-serif", anchor: "center", color: k.rgb(36, 31, 69) });
    }
    const healthRatio = enemy.health / enemy.maxHealth;
    if (healthRatio < 1) {
      k.drawRect({ pos: k.vec2(enemy.x - enemy.width / 2, enemy.y - enemy.height / 2 - 9), width: enemy.width, height: 5, radius: 2, color: k.rgb(58, 52, 80) });
      k.drawRect({ pos: k.vec2(enemy.x - enemy.width / 2, enemy.y - enemy.height / 2 - 9), width: enemy.width * healthRatio, height: 5, radius: 2, color: k.rgb(81, 207, 102) });
    }
  }

  function drawEffects(): void {
    for (const effect of effects) {
      const progress = Math.min(1, effect.elapsed / effect.duration);
      if (effect.kind === "destroyed") {
        for (let index = 0; index < (reducedMotion ? 4 : 9); index += 1) {
          const angle = index / 9 * Math.PI * 2;
          const distance = 8 + progress * 28;
          k.drawCircle({ pos: k.vec2(effect.x + Math.cos(angle) * distance, effect.y + Math.sin(angle) * distance), radius: 5 * (1 - progress) + 1, anchor: "center", color: index % 2 ? k.rgb(255, 212, 59) : k.rgb(255, 107, 107), opacity: 1 - progress });
        }
      }
      k.drawText({
        text: effect.text,
        pos: k.vec2(effect.x, effect.y - progress * (effect.large ? 20 : 30)),
        size: effect.large ? 34 : 20,
        font: "sans-serif",
        anchor: "center",
        color: effect.kind === "damaged" ? k.rgb(255, 107, 107) : k.rgb(255, 244, 191),
        opacity: 1 - Math.max(0, progress - 0.65) / 0.35,
      });
    }
  }

  function drawScene(): void {
    for (const star of stars) {
      const y = (star.y + state.elapsedSeconds * star.speed) % BOARD_HEIGHT;
      k.drawCircle({ pos: k.vec2(star.x, y), radius: star.radius, anchor: "center", color: k.rgb(220, 229, 255), opacity: 0.55 + star.radius * 0.14 });
    }
    state.bolts.forEach((bolt) => {
      k.drawRect({ pos: k.vec2(bolt.x - bolt.width / 2 - 3, bolt.y - bolt.height / 2), width: bolt.width + 6, height: bolt.height, radius: 4, color: k.rgb(77, 171, 247), opacity: 0.35 });
      k.drawRect({ pos: k.vec2(bolt.x - bolt.width / 2, bolt.y - bolt.height / 2), width: bolt.width, height: bolt.height, radius: 3, color: k.rgb(218, 249, 255) });
    });
    state.enemies.forEach(drawEnemy);
    drawPlayer();
    drawEffects();
    drawHud();
  }

  function addEffects(events: readonly CombatEvent[]): void {
    for (const event of events) {
      if (event.kind === "destroyed") effects.push({ kind: event.kind, x: event.x, y: event.y, text: `+${event.points}`, elapsed: 0, duration: reducedMotion ? 0.08 : 0.55, large: false });
      else if (event.kind === "damaged") effects.push({ kind: event.kind, x: event.x, y: event.y, text: `-${event.amount} HEALTH`, elapsed: 0, duration: reducedMotion ? 0.08 : 0.7, large: false });
      else effects.push({ kind: event.kind, x: BOARD_WIDTH / 2, y: BOARD_HEIGHT * 0.4, text: `LEVEL ${event.level}!`, elapsed: 0, duration: reducedMotion ? 0.1 : 1.1, large: true });
    }
  }

  function controls(): ShooterControls {
    return {
      left: heldDirections.has("left"),
      right: heldDirections.has("right"),
      up: heldDirections.has("up"),
      down: heldDirections.has("down"),
    };
  }

  function clearHeldDirections(): void {
    heldDirections.clear();
    activeDrag = undefined;
  }

  function hideResult(): void {
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
  }

  function showResult(): void {
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card shooter-result-card" role="dialog" aria-modal="true" aria-labelledby="shooter-result-title">
        <div class="shooter-result-icon" aria-hidden="true">✨</div>
        <p class="eyebrow shooter-eyebrow">Squadron report</p>
        <h2 id="shooter-result-title">Final score: ${state.score}</h2>
        <p>Plane level ${state.player.level} · ${state.player.lifetimeKills} enemies destroyed</p>
        <div class="result-actions">
          <button class="check-button shooter-result-button" type="button" data-shooter-result-action="again">Fly again</button>
          <button class="text-button" type="button" data-shooter-result-action="exit">All games</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>('[data-shooter-result-action="again"]')?.focus();
  }

  function renderState(previous?: ShooterState): void {
    if (state.score > bestScore) {
      bestScore = state.score;
      saveBestScore(bestScore);
    }
    const required = killsRequired(state.player.level);
    scoreElement!.textContent = String(state.score);
    bestElement!.textContent = String(bestScore);
    levelElement!.textContent = String(state.player.level);
    healthElement!.textContent = `${state.player.health} / ${state.player.maxHealth}`;
    progressElement!.textContent = `${state.player.killsTowardUpgrade} / ${required}`;
    rateElement!.textContent = `${boltsPerSecond(state.player.level)} per second`;
    powerElement!.textContent = String(boltDamage(state.player.level));
    summaryElement!.textContent = gameSummary(state, timeScale);
    canvas!.dataset.gameSpeed = String(timeScale);
    pauseButton!.disabled = state.status === "ready" || state.status === "dead";
    pauseButton!.textContent = state.status === "paused" ? "▶" : "⏸";
    pauseButton!.setAttribute("aria-label", state.status === "paused" ? "Resume game" : "Pause game");
    pauseButton!.title = state.status === "paused" ? "Resume" : "Pause";
    startButton!.hidden = state.status !== "ready";

    if (state.status === "dead") messageElement!.textContent = `Mission over. Final score: ${state.score}.`;
    else if (state.status === "ready") messageElement!.textContent = "Start the run, then keep moving—the cannons fire for you!";
    else if (state.status === "paused") messageElement!.textContent = "Combat paused. Resume when ready.";
    else if (state.status === "running" && state.player.level > (previous?.player.level ?? state.player.level)) messageElement!.textContent = `Plane upgraded! Level ${state.player.level}: ${boltsPerSecond(state.player.level)}/sec fire rate, ${boltDamage(state.player.level)} fire power, and health restored.`;
    else if (state.status === "running" && state.player.health < (previous?.player.health ?? state.player.health)) messageElement!.textContent = `Collision! Health at ${state.player.health} of ${state.player.maxHealth}.`;
    else if (state.status === "running" && timeScale < 1) messageElement!.textContent = "Slow motion—touch to steer again, or tap pause.";
    else if (state.status === "running") messageElement!.textContent = "Cannons online—keep weaving through the enemy fleet!";
    if (state.status === "dead" && previous?.status !== "dead") showResult();
  }

  function start(): void {
    const previous = state;
    timeScale = 1;
    state = startGame(state);
    hideResult();
    renderState(previous);
    canvas!.focus();
  }

  function restart(): void {
    clearHeldDirections();
    effects.length = 0;
    timeScale = 1;
    state = restartGame();
    hideResult();
    renderState();
    canvas!.focus();
  }

  function togglePause(): void {
    clearHeldDirections();
    const previous = state;
    state = state.status === "paused" ? resumeGame(state) : pauseGame(state);
    if (state.status === "running") timeScale = 1;
    renderState(previous);
    canvas!.focus();
  }

  function autoPause(): void {
    if (state.status !== "running") return;
    clearHeldDirections();
    const previous = state;
    state = pauseGame(state);
    renderState(previous);
  }

  function onVisibilityChange(): void {
    if (document.hidden) autoPause();
  }

  function keyDirection(key: string): HeldDirection | undefined {
    if (key === "ArrowLeft" || key === "a" || key === "A") return "left";
    if (key === "ArrowRight" || key === "d" || key === "D") return "right";
    if (key === "ArrowUp" || key === "w" || key === "W") return "up";
    if (key === "ArrowDown" || key === "s" || key === "S") return "down";
    return undefined;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if ((event.code === "Space" || event.key === " ") && !event.repeat) {
      if (state.status === "running" || state.status === "paused") {
        event.preventDefault();
        togglePause();
      }
      return;
    }
    const direction = keyDirection(event.key);
    if (!direction) return;
    event.preventDefault();
    heldDirections.add(direction);
  }

  function onKeyUp(event: KeyboardEvent): void {
    const direction = keyDirection(event.key);
    if (!direction) return;
    event.preventDefault();
    heldDirections.delete(direction);
  }

  function pointerToBoard(event: PointerEvent): { x: number; y: number } {
    const bounds = canvas!.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * BOARD_WIDTH / bounds.width,
      y: (event.clientY - bounds.top) * BOARD_HEIGHT / bounds.height,
    };
  }

  function onCanvasPointerDown(event: PointerEvent): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    activeDrag = event.pointerId;
    if (event.pointerType !== "mouse") {
      timeScale = 1;
      renderState(state);
    }
    if (typeof canvas!.setPointerCapture === "function") canvas!.setPointerCapture(event.pointerId);
    const position = pointerToBoard(event);
    state = movePlayerTo(state, position.x, event.pointerType === "mouse" ? position.y : position.y - state.player.height * 0.7);
  }

  function onCanvasPointerMove(event: PointerEvent): void {
    if (activeDrag !== event.pointerId) return;
    event.preventDefault();
    const position = pointerToBoard(event);
    state = movePlayerTo(state, position.x, event.pointerType === "mouse" ? position.y : position.y - state.player.height * 0.7);
  }

  function onCanvasPointerEnd(event: PointerEvent): void {
    if (activeDrag !== event.pointerId) return;
    activeDrag = undefined;
    if (event.pointerType !== "mouse" && state.status === "running") {
      timeScale = 0.2;
      renderState(state);
    }
    if (typeof canvas!.hasPointerCapture === "function" && canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId);
  }

  function onClick(event: MouseEvent): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-shooter-action], [data-shooter-result-action]")
      : null;
    if (!target) return;
    const action = target.dataset.shooterAction;
    const resultAction = target.dataset.shooterResultAction;
    if (action === "exit" || resultAction === "exit") exit();
    else if (action === "start") start();
    else if (action === "pause") togglePause();
    else if (action === "new" || resultAction === "again") restart();
  }

  k.onDraw(drawScene);
  k.onUpdate(() => {
    if (destroyed) return;
    const frameSeconds = Math.min(k.dt(), 1 / 30);
    effects.forEach((effect) => { effect.elapsed += frameSeconds; });
    for (let index = effects.length - 1; index >= 0; index -= 1) {
      if (effects[index]!.elapsed >= effects[index]!.duration) effects.splice(index, 1);
    }
    if (state.status !== "running") return;
    const previous = state;
    state = updateShooter(state, scaledFrameSeconds(frameSeconds, timeScale), controls());
    addEffects(state.events);
    hudElapsed += frameSeconds;
    if (state.status !== previous.status || state.player.level !== previous.player.level || state.player.health !== previous.player.health || state.score !== previous.score || hudElapsed >= 0.12) {
      hudElapsed = 0;
      renderState(previous);
    }
  });

  container.addEventListener("click", onClick);
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
      clearHeldDirections();
      effects.length = 0;
      container.removeEventListener("click", onClick);
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
