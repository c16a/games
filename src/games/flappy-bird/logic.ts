export const BOARD_WIDTH = 540;
export const BOARD_HEIGHT = 720;
export const FLOOR_Y = 650;
export const BIRD_X = 148;
export const BIRD_RADIUS = 21;
export const PIPE_WIDTH = 76;
export const PIPE_SPACING = 268;
export const GRAVITY = 1_080;
export const FLAP_VELOCITY = -405;

export type FlappyStatus = "ready" | "running" | "paused" | "over";
export type FlappyKeyboardAction = "flap" | "pause" | "toggle-pause";

export interface PipePair {
  id: number;
  x: number;
  gapY: number;
  gapHeight: number;
  passed: boolean;
}

export interface FlappyState {
  status: FlappyStatus;
  birdY: number;
  birdVelocity: number;
  pipes: PipePair[];
  score: number;
  elapsedSeconds: number;
  nextPipeId: number;
}

export type RandomSource = () => number;

export function keyboardActionFor(key: string, status: FlappyStatus): FlappyKeyboardAction | null {
  if (key === "Escape") return status === "running" ? "pause" : null;
  if (key === " " || key === "ArrowUp" || key.toLowerCase() === "w") {
    return status === "ready" || status === "running" ? "flap" : null;
  }
  if (key.toLowerCase() === "p" && (status === "running" || status === "paused")) return "toggle-pause";
  return null;
}

export function gapHeightForScore(score: number): number {
  return Math.max(154, 194 - score * 2.4);
}

export function pipeSpeedForScore(score: number): number {
  return Math.min(255, 172 + score * 3.2);
}

function nextPipe(id: number, x: number, score: number, random: RandomSource): PipePair {
  const gapHeight = gapHeightForScore(score);
  const margin = 82;
  const minCenter = margin + gapHeight / 2;
  const maxCenter = FLOOR_Y - margin - gapHeight / 2;
  const randomValue = Math.max(0, Math.min(1, random()));
  return {
    id,
    x,
    gapY: minCenter + (maxCenter - minCenter) * randomValue,
    gapHeight,
    passed: false,
  };
}

export function createInitialState(): FlappyState {
  return {
    status: "ready",
    birdY: 322,
    birdVelocity: 0,
    pipes: [],
    score: 0,
    elapsedSeconds: 0,
    nextPipeId: 1,
  };
}

export function flap(state: FlappyState, random: RandomSource = Math.random): FlappyState {
  if (state.status === "paused" || state.status === "over") return state;
  if (state.status === "ready") {
    return {
      ...state,
      status: "running",
      birdVelocity: FLAP_VELOCITY,
      pipes: [nextPipe(state.nextPipeId, BOARD_WIDTH + 96, state.score, random)],
      nextPipeId: state.nextPipeId + 1,
    };
  }
  return { ...state, birdVelocity: FLAP_VELOCITY };
}

export function pauseRun(state: FlappyState): FlappyState {
  return state.status === "running" ? { ...state, status: "paused" } : state;
}

export function resumeRun(state: FlappyState): FlappyState {
  return state.status === "paused" ? { ...state, status: "running" } : state;
}

function circleTouchesRect(
  circleX: number,
  circleY: number,
  radius: number,
  rectX: number,
  rectY: number,
  rectWidth: number,
  rectHeight: number,
): boolean {
  const closestX = Math.max(rectX, Math.min(circleX, rectX + rectWidth));
  const closestY = Math.max(rectY, Math.min(circleY, rectY + rectHeight));
  const dx = circleX - closestX;
  const dy = circleY - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

export function birdTouchesPipe(birdY: number, pipe: PipePair): boolean {
  const gapTop = pipe.gapY - pipe.gapHeight / 2;
  const gapBottom = pipe.gapY + pipe.gapHeight / 2;
  return circleTouchesRect(BIRD_X, birdY, BIRD_RADIUS, pipe.x, 0, PIPE_WIDTH, gapTop)
    || circleTouchesRect(BIRD_X, birdY, BIRD_RADIUS, pipe.x, gapBottom, PIPE_WIDTH, FLOOR_Y - gapBottom);
}

export function updateFlappy(
  state: FlappyState,
  deltaSeconds: number,
  random: RandomSource = Math.random,
): FlappyState {
  if (state.status !== "running" || deltaSeconds <= 0) return state;

  const delta = Math.min(deltaSeconds, 1 / 20);
  const birdVelocity = state.birdVelocity + GRAVITY * delta;
  const birdY = state.birdY + birdVelocity * delta;
  const speed = pipeSpeedForScore(state.score);
  let scored = 0;
  let pipes = state.pipes.map((pipe) => {
    const moved = { ...pipe, x: pipe.x - speed * delta };
    if (!moved.passed && moved.x + PIPE_WIDTH < BIRD_X) {
      scored += 1;
      moved.passed = true;
    }
    return moved;
  }).filter((pipe) => pipe.x + PIPE_WIDTH > -24);

  let nextPipeId = state.nextPipeId;
  const lastPipe = pipes[pipes.length - 1];
  if (!lastPipe || lastPipe.x <= BOARD_WIDTH - PIPE_SPACING) {
    pipes = [...pipes, nextPipe(nextPipeId, BOARD_WIDTH + 16, state.score + scored, random)];
    nextPipeId += 1;
  }

  const collided = birdY - BIRD_RADIUS <= 0
    || birdY + BIRD_RADIUS >= FLOOR_Y
    || pipes.some((pipe) => birdTouchesPipe(birdY, pipe));

  return {
    ...state,
    status: collided ? "over" : "running",
    birdY,
    birdVelocity,
    pipes,
    score: state.score + scored,
    elapsedSeconds: state.elapsedSeconds + delta,
    nextPipeId,
  };
}

export function nextPipeDistance(state: FlappyState): number | undefined {
  const pipe = state.pipes.find((candidate) => candidate.x + PIPE_WIDTH >= BIRD_X);
  return pipe ? Math.max(0, pipe.x - BIRD_X) : undefined;
}
