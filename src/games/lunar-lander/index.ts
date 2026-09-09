import type { GameContext, GameInstance } from "../../platform/game";
import {
  LANDER_HALF_HEIGHT,
  LANDER_HALF_WIDTH,
  SAFE_ANGLE,
  SAFE_HORIZONTAL_SPEED,
  SAFE_VERTICAL_SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type FlightControls,
  type LanderState,
  type Point,
  createInitialState,
  nextLevel,
  pauseFlight,
  restartFlight,
  resumeFlight,
  startFlight,
  terrainHeightAt,
  updateFlight,
} from "./logic";

const BEST_SCORE_KEY = "happy-arcade:lunar-lander-best";
type HeldControl = "left" | "right" | "thrust";

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
    // Storage is optional; flight continues when unavailable.
  }
}

function altitude(state: LanderState): number {
  return Math.max(0, terrainHeightAt(state.terrain, state.position.x) - state.position.y - LANDER_HALF_HEIGHT);
}

function flightSummary(state: LanderState): string {
  return `Level ${state.level}. Altitude ${Math.round(altitude(state))}. Horizontal speed ${Math.round(Math.abs(state.velocity.x))}. Descent speed ${Math.round(state.velocity.y)}. Angle ${Math.round(state.angle)} degrees. Fuel ${Math.round(state.fuel)} percent.`;
}

function rotatePoint(point: Point, angle: number, origin: Point): Point {
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: origin.x + point.x * cosine - point.y * sine,
    y: origin.y + point.x * sine + point.y * cosine,
  };
}

export async function mount({ container, exit }: GameContext): Promise<GameInstance> {
  const { default: kaplay } = await import("kaplay");
  let state = createInitialState();
  let bestScore = loadBestScore();
  let destroyed = false;
  let hudElapsed = 0;
  const heldControls = new Set<HeldControl>();
  const pointerControls = new Map<number, HeldControl>();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  container.innerHTML = `
    <main class="game-page lander-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-lander-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow lander-eyebrow">Retro space flight</span>
          <h1>Lunar Lander</h1>
        </div>
        <button class="icon-button" type="button" data-lander-action="new" aria-label="Start a new Lunar Lander run">↻</button>
      </header>

      <section class="lander-game" aria-label="Lunar Lander game">
        <div class="lander-mission">
          <div class="lander-mission-icon" aria-hidden="true">🚀</div>
          <div>
            <p class="mission-title">Touch down softly on the glowing pad!</p>
            <p class="mission-copy">Stay upright, control your speed, and watch your fuel.</p>
          </div>
          <div class="lander-scores" aria-label="Run status">
            <div><span>Score</span><strong data-lander-score>0</strong></div>
            <div><span>Best</span><strong data-lander-best>${bestScore}</strong></div>
            <div><span>Level</span><strong data-lander-level>1</strong></div>
          </div>
        </div>

        <div class="lander-workspace">
          <div class="lander-board-shell">
            <canvas
              class="lander-canvas"
              data-lander-canvas
              width="${WORLD_WIDTH}"
              height="${WORLD_HEIGHT}"
              tabindex="0"
              role="img"
              aria-label="Lunar landing area. Use the flight controls to reach the marked pad."
            ></canvas>
          </div>

          <div class="lander-instruments" aria-label="Flight instruments">
            <div class="lander-fuel">
              <span>Fuel</span>
              <div class="lander-fuel-track" aria-hidden="true"><i data-lander-fuel-bar></i></div>
              <strong data-lander-fuel>100%</strong>
            </div>
            <div><span>Altitude</span><strong data-lander-altitude>0</strong></div>
            <div><span>↓ Speed</span><strong data-lander-vspeed>0</strong></div>
            <div><span>↔ Speed</span><strong data-lander-hspeed>0</strong></div>
            <div><span>Angle</span><strong data-lander-angle>0°</strong></div>
          </div>
          <p class="visually-hidden" data-lander-summary>${flightSummary(state)}</p>
          <p class="lander-message" data-lander-message aria-live="polite">Start when ready. Land at ≤ ${SAFE_VERTICAL_SPEED} down, ≤ ${SAFE_HORIZONTAL_SPEED} sideways, and within ${SAFE_ANGLE}°.</p>

          <div class="lander-flight-controls" aria-label="Flight controls">
            <button type="button" data-lander-hold="left" aria-label="Hold to rotate left"><span>↶</span> Rotate</button>
            <button class="lander-thrust" type="button" data-lander-hold="thrust" aria-label="Hold for main engine thrust"><span>🔥</span> Thrust</button>
            <button type="button" data-lander-hold="right" aria-label="Hold to rotate right"><span>↷</span> Rotate</button>
          </div>

          <div class="lander-actions">
            <button class="soft-button" type="button" data-lander-action="pause" disabled>Pause</button>
            <button class="check-button lander-start" type="button" data-lander-action="start">Start flight</button>
            <button class="soft-button" type="button" data-lander-action="new">New run</button>
          </div>
        </div>
      </section>

      <div class="celebration" data-lander-result aria-live="assertive" hidden></div>
    </main>`;

  const canvas = container.querySelector<HTMLCanvasElement>("[data-lander-canvas]");
  const scoreElement = container.querySelector<HTMLElement>("[data-lander-score]");
  const bestElement = container.querySelector<HTMLElement>("[data-lander-best]");
  const levelElement = container.querySelector<HTMLElement>("[data-lander-level]");
  const fuelElement = container.querySelector<HTMLElement>("[data-lander-fuel]");
  const fuelBar = container.querySelector<HTMLElement>("[data-lander-fuel-bar]");
  const altitudeElement = container.querySelector<HTMLElement>("[data-lander-altitude]");
  const verticalSpeedElement = container.querySelector<HTMLElement>("[data-lander-vspeed]");
  const horizontalSpeedElement = container.querySelector<HTMLElement>("[data-lander-hspeed]");
  const angleElement = container.querySelector<HTMLElement>("[data-lander-angle]");
  const summaryElement = container.querySelector<HTMLElement>("[data-lander-summary]");
  const messageElement = container.querySelector<HTMLElement>("[data-lander-message]");
  const pauseButton = container.querySelector<HTMLButtonElement>('[data-lander-action="pause"]');
  const startButton = container.querySelector<HTMLButtonElement>('[data-lander-action="start"]');
  const resultElement = container.querySelector<HTMLElement>("[data-lander-result]");
  if (!canvas || !scoreElement || !bestElement || !levelElement || !fuelElement || !fuelBar || !altitudeElement || !verticalSpeedElement || !horizontalSpeedElement || !angleElement || !summaryElement || !messageElement || !pauseButton || !startButton || !resultElement) {
    throw new Error("Lunar Lander UI could not be created");
  }

  const k = kaplay({
    global: false,
    canvas,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    background: [8, 14, 35],
    crisp: true,
    debug: false,
    focus: false,
    touchToMouse: false,
  });
  canvas.classList.add("lander-canvas");
  const stars = Array.from({ length: 72 }, (_, index) => ({
    x: (index * 137 + 43) % WORLD_WIDTH,
    y: (index * index * 29 + index * 41 + 17) % 450,
    radius: index % 11 === 0 ? 2.2 : index % 4 === 0 ? 1.5 : 1,
  }));

  function drawTerrain(): void {
    for (let index = 0; index < state.terrain.points.length - 1; index += 1) {
      const left = state.terrain.points[index]!;
      const right = state.terrain.points[index + 1]!;
      k.drawPolygon({
        pts: [k.vec2(left.x, left.y), k.vec2(right.x, right.y), k.vec2(right.x, WORLD_HEIGHT), k.vec2(left.x, WORLD_HEIGHT)],
        color: k.rgb(40, 50, 72),
      });
      k.drawLine({ p1: k.vec2(left.x, left.y), p2: k.vec2(right.x, right.y), width: 5, color: k.rgb(153, 166, 194) });
    }
    const { pad } = state.terrain;
    k.drawLine({ p1: k.vec2(pad.x1, pad.y - 3), p2: k.vec2(pad.x2, pad.y - 3), width: 10, color: k.rgb(255, 212, 59) });
    k.drawLine({ p1: k.vec2(pad.x1, pad.y - 9), p2: k.vec2(pad.x1, pad.y + 6), width: 5, color: k.rgb(255, 107, 107) });
    k.drawLine({ p1: k.vec2(pad.x2, pad.y - 9), p2: k.vec2(pad.x2, pad.y + 6), width: 5, color: k.rgb(255, 107, 107) });
    k.drawText({ text: `×${pad.multiplier}`, pos: k.vec2((pad.x1 + pad.x2) / 2, pad.y + 12), anchor: "top", size: 22, font: "sans-serif", color: k.rgb(255, 244, 191) });
  }

  function drawLander(): void {
    const origin = state.position;
    const point = (x: number, y: number) => rotatePoint({ x, y }, state.angle, origin);
    if (state.thrusting) {
      const flicker = 34 + (Math.sin(state.elapsedSeconds * 38) + 1) * 8;
      const flame = [point(-7, 16), point(0, flicker), point(7, 16)];
      k.drawPolygon({ pts: flame.map(({ x, y }) => k.vec2(x, y)), color: k.rgb(255, 146, 43), outline: { width: 2, color: k.rgb(255, 212, 59) } });
    }
    for (const side of [-1, 1]) {
      const hip = point(side * 13, 10);
      const foot = point(side * LANDER_HALF_WIDTH, LANDER_HALF_HEIGHT);
      k.drawLine({ p1: k.vec2(hip.x, hip.y), p2: k.vec2(foot.x, foot.y), width: 4, color: k.rgb(226, 232, 240) });
      const footOuter = point(side * (LANDER_HALF_WIDTH + 6), LANDER_HALF_HEIGHT);
      k.drawLine({ p1: k.vec2(foot.x, foot.y), p2: k.vec2(footOuter.x, footOuter.y), width: 4, color: k.rgb(226, 232, 240) });
    }
    const body = [[-18, 8], [-12, -12], [0, -22], [12, -12], [18, 8], [10, 15], [-10, 15]]
      .map(([x, y]) => point(x!, y!));
    k.drawPolygon({
      pts: body.map(({ x, y }) => k.vec2(x, y)),
      color: state.status === "crashed" ? k.rgb(255, 107, 107) : k.rgb(226, 232, 240),
      outline: { width: 4, color: k.rgb(36, 31, 69) },
    });
    const windowCenter = point(0, -5);
    k.drawCircle({ pos: k.vec2(windowCenter.x, windowCenter.y), radius: 8, anchor: "center", color: k.rgb(77, 171, 247), outline: { width: 3, color: k.rgb(36, 31, 69) } });

    if (state.status === "crashed") {
      for (let index = 0; index < 9; index += 1) {
        const angle = index / 9 * Math.PI * 2 + state.elapsedSeconds;
        const distance = 24 + (index % 3) * 10;
        k.drawCircle({
          pos: k.vec2(origin.x + Math.cos(angle) * distance, origin.y + Math.sin(angle) * distance),
          radius: 5 + index % 3,
          anchor: "center",
          color: index % 2 ? k.rgb(255, 212, 59) : k.rgb(255, 107, 107),
          opacity: 0.8,
        });
      }
    }
  }

  function drawScene(): void {
    stars.forEach((star, index) => {
      const shimmer = reducedMotion ? 0.7 : 0.45 + (Math.sin(state.elapsedSeconds * 1.7 + index) + 1) * 0.22;
      k.drawCircle({ pos: k.vec2(star.x, star.y), radius: star.radius, anchor: "center", color: k.rgb(235, 241, 255), opacity: shimmer });
    });
    k.drawCircle({ pos: k.vec2(90, 105), radius: 42, anchor: "center", color: k.rgb(112, 72, 232), opacity: 0.35 });
    k.drawCircle({ pos: k.vec2(710, 150), radius: 26, anchor: "center", color: k.rgb(77, 171, 247), opacity: 0.28 });
    drawTerrain();
    drawLander();
  }

  function clearHeldControls(): void {
    heldControls.clear();
    pointerControls.clear();
  }

  function controls(): FlightControls {
    return {
      rotateLeft: heldControls.has("left"),
      rotateRight: heldControls.has("right"),
      thrust: heldControls.has("thrust"),
    };
  }

  function hideResult(): void {
    resultElement!.hidden = true;
    resultElement!.innerHTML = "";
  }

  function showResult(): void {
    const landed = state.status === "landed";
    resultElement!.hidden = false;
    resultElement!.innerHTML = `
      <div class="result-card lander-result-card" role="dialog" aria-modal="true" aria-labelledby="lander-result-title">
        <div class="lander-result-icon" aria-hidden="true">${landed ? "🌕" : "💥"}</div>
        <p class="eyebrow lander-eyebrow">${landed ? "Touchdown confirmed" : "Mission interrupted"}</p>
        <h2 id="lander-result-title">${landed ? "Soft landing!" : "Hard landing!"}</h2>
        <p>${landed ? `Score ${state.score}. The next landing zone is smaller and gravity is stronger.` : "Balance speed, angle, and fuel—then give the mission another shot."}</p>
        <div class="result-actions">
          <button class="check-button lander-result-button" type="button" data-lander-result-action="${landed ? "next" : "again"}">${landed ? "Next mission" : "Try again"}</button>
          <button class="text-button" type="button" data-lander-result-action="exit">All games</button>
        </div>
      </div>`;
    resultElement!.querySelector<HTMLButtonElement>("[data-lander-result-action]")?.focus();
  }

  function renderState(previous?: LanderState): void {
    if (state.score > bestScore) {
      bestScore = state.score;
      saveBestScore(bestScore);
    }
    scoreElement!.textContent = String(state.score);
    bestElement!.textContent = String(bestScore);
    levelElement!.textContent = String(state.level);
    fuelElement!.textContent = `${Math.ceil(state.fuel)}%`;
    fuelBar!.style.width = `${state.fuel}%`;
    fuelBar!.classList.toggle("lander-fuel-bar--low", state.fuel <= 20);
    altitudeElement!.textContent = String(Math.round(altitude(state)));
    verticalSpeedElement!.textContent = String(Math.round(state.velocity.y));
    horizontalSpeedElement!.textContent = String(Math.round(Math.abs(state.velocity.x)));
    angleElement!.textContent = `${Math.round(state.angle)}°`;
    summaryElement!.textContent = flightSummary(state);
    pauseButton!.disabled = state.status === "ready" || state.status === "landed" || state.status === "crashed";
    pauseButton!.textContent = state.status === "paused" ? "Resume" : "Pause";
    startButton!.hidden = state.status !== "ready";

    if (state.status === "ready") messageElement!.textContent = `Mission ${state.level}: start when ready and aim for the ×${state.terrain.pad.multiplier} pad.`;
    else if (state.status === "paused") messageElement!.textContent = "Flight paused. Resume when you are ready.";
    else if (state.status === "running" && state.fuel <= 0) messageElement!.textContent = "Fuel empty—steady the craft for touchdown!";
    else if (state.status === "running" && state.fuel <= 20) messageElement!.textContent = "Fuel is low. Use short, careful thrusts.";
    else if (state.status === "running" && state.velocity.y > SAFE_VERTICAL_SPEED) messageElement!.textContent = "Descending too fast—thrust upward to slow down!";
    else if (state.status === "running") messageElement!.textContent = "Guide the lander onto the glowing pad.";

    if ((state.status === "landed" || state.status === "crashed") && state.status !== previous?.status) showResult();
  }

  function start(): void {
    const previous = state;
    state = startFlight(state);
    hideResult();
    renderState(previous);
    canvas!.focus();
  }

  function restart(): void {
    clearHeldControls();
    state = restartFlight();
    hideResult();
    renderState();
    canvas!.focus();
  }

  function advanceMission(): void {
    clearHeldControls();
    state = nextLevel(state);
    hideResult();
    renderState();
    canvas!.focus();
  }

  function togglePause(): void {
    clearHeldControls();
    const previous = state;
    state = state.status === "paused" ? resumeFlight(state) : pauseFlight(state);
    renderState(previous);
    canvas!.focus();
  }

  function autoPause(): void {
    if (state.status !== "running") return;
    clearHeldControls();
    const previous = state;
    state = pauseFlight(state);
    renderState(previous);
  }

  function onVisibilityChange(): void {
    if (document.hidden) autoPause();
  }

  function controlForKey(key: string): HeldControl | undefined {
    if (key === "ArrowLeft" || key === "a" || key === "A") return "left";
    if (key === "ArrowRight" || key === "d" || key === "D") return "right";
    if (key === "ArrowUp" || key === "w" || key === "W" || key === " ") return "thrust";
    return undefined;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const control = controlForKey(event.key);
    if (!control) return;
    event.preventDefault();
    heldControls.add(control);
  }

  function onKeyUp(event: KeyboardEvent): void {
    const control = controlForKey(event.key);
    if (!control) return;
    event.preventDefault();
    heldControls.delete(control);
  }

  function onPointerDown(event: PointerEvent): void {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>("[data-lander-hold]");
    const control = button?.dataset.landerHold as HeldControl | undefined;
    if (!button || !control) return;
    event.preventDefault();
    pointerControls.set(event.pointerId, control);
    heldControls.add(control);
    button.setPointerCapture(event.pointerId);
  }

  function onPointerEnd(event: PointerEvent): void {
    const control = pointerControls.get(event.pointerId);
    if (!control) return;
    pointerControls.delete(event.pointerId);
    if (![...pointerControls.values()].includes(control)) heldControls.delete(control);
  }

  function onClick(event: MouseEvent): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-lander-action], [data-lander-result-action]")
      : null;
    if (!target) return;
    const action = target.dataset.landerAction;
    const resultAction = target.dataset.landerResultAction;
    if (action === "exit" || resultAction === "exit") exit();
    else if (action === "start") start();
    else if (action === "pause") togglePause();
    else if (action === "new" || resultAction === "again") restart();
    else if (resultAction === "next") advanceMission();
  }

  k.onDraw(drawScene);
  k.onUpdate(() => {
    if (destroyed || state.status !== "running") return;
    const previous = state;
    const frameSeconds = Math.min(k.dt(), 1 / 30);
    state = updateFlight(state, frameSeconds, controls());
    hudElapsed += frameSeconds;
    if (state.status !== previous.status || hudElapsed >= 0.08) {
      hudElapsed = 0;
      renderState(previous);
    }
  });

  container.addEventListener("click", onClick);
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointerup", onPointerEnd);
  container.addEventListener("pointercancel", onPointerEnd);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", autoPause);
  document.addEventListener("visibilitychange", onVisibilityChange);
  renderState();

  return {
    destroy(): void {
      destroyed = true;
      clearHeldControls();
      container.removeEventListener("click", onClick);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointerup", onPointerEnd);
      container.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", autoPause);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      k.quit();
      container.innerHTML = "";
    },
  };
}
