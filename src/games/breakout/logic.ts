export const BOARD_WIDTH = 640;
export const BOARD_HEIGHT = 720;
export const BALL_RADIUS = 9;
export const BALL_SPEED = 330;
export const PADDLE_WIDTH = 116;
export const PADDLE_HEIGHT = 18;
export const PADDLE_Y = 670;
export const PADDLE_SPEED = 470;
export const BRICK_ROWS = 5;
export const BRICK_COLUMNS = 8;

export type BreakoutStatus = "ready" | "running" | "paused" | "won" | "lost";

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Brick {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  alive: boolean;
  row: number;
}

export interface BreakoutState {
  ball: Ball;
  paddle: Paddle;
  bricks: Brick[];
  score: number;
  lives: number;
  status: BreakoutStatus;
  paddleInput: -1 | 0 | 1;
}

function attachedBall(paddle: Paddle): Ball {
  return { x: paddle.x, y: paddle.y - BALL_RADIUS - 2, vx: 0, vy: 0 };
}

export function createBricks(): Brick[] {
  const width = 68;
  const height = 25;
  const horizontalGap = 7;
  const verticalGap = 24;
  const left = (BOARD_WIDTH - (BRICK_COLUMNS * width + (BRICK_COLUMNS - 1) * horizontalGap)) / 2;
  const top = 62;
  return Array.from({ length: BRICK_ROWS * BRICK_COLUMNS }, (_, id) => {
    const row = Math.floor(id / BRICK_COLUMNS);
    const column = id % BRICK_COLUMNS;
    return {
      id,
      x: left + column * (width + horizontalGap),
      y: top + row * (height + verticalGap),
      width,
      height,
      alive: true,
      row,
    };
  });
}

export function createInitialState(): BreakoutState {
  const paddle: Paddle = {
    x: BOARD_WIDTH / 2,
    y: PADDLE_Y,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
  };
  return {
    paddle,
    ball: attachedBall(paddle),
    bricks: createBricks(),
    score: 0,
    lives: 3,
    status: "ready",
    paddleInput: 0,
  };
}

export function clampPaddleX(x: number, width = PADDLE_WIDTH): number {
  return Math.max(width / 2, Math.min(BOARD_WIDTH - width / 2, x));
}

export function displayToBoardX(clientX: number, displayLeft: number, displayWidth: number): number {
  if (displayWidth <= 0) return BOARD_WIDTH / 2;
  return Math.max(0, Math.min(BOARD_WIDTH, (clientX - displayLeft) * BOARD_WIDTH / displayWidth));
}

export function movePaddleTo(state: BreakoutState, x: number): BreakoutState {
  const paddle = { ...state.paddle, x: clampPaddleX(x, state.paddle.width) };
  return {
    ...state,
    paddle,
    ball: state.status === "ready" ? attachedBall(paddle) : state.ball,
  };
}

export function setPaddleInput(state: BreakoutState, input: -1 | 0 | 1): BreakoutState {
  return { ...state, paddleInput: input };
}

export function launchBall(state: BreakoutState): BreakoutState {
  if (state.status !== "ready") return state;
  const vx = BALL_SPEED * 0.42;
  return {
    ...state,
    status: "running",
    ball: {
      ...state.ball,
      vx,
      vy: -Math.sqrt(BALL_SPEED ** 2 - vx ** 2),
    },
  };
}

function overlapsCircleRect(ball: Ball, radius: number, rect: { x: number; y: number; width: number; height: number }): boolean {
  const closestX = Math.max(rect.x, Math.min(ball.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(ball.y, rect.y + rect.height));
  return (ball.x - closestX) ** 2 + (ball.y - closestY) ** 2 <= radius ** 2;
}

function bounceFromPaddle(ball: Ball, paddle: Paddle, previousY: number): Ball {
  const paddleRect = { x: paddle.x - paddle.width / 2, y: paddle.y, width: paddle.width, height: paddle.height };
  if (ball.vy <= 0 || previousY + BALL_RADIUS > paddle.y + 1 || !overlapsCircleRect(ball, BALL_RADIUS, paddleRect)) return ball;

  const impact = Math.max(-1, Math.min(1, (ball.x - paddle.x) / (paddle.width / 2)));
  const angle = impact * Math.PI / 3;
  return {
    x: ball.x,
    y: paddle.y - BALL_RADIUS,
    vx: BALL_SPEED * Math.sin(angle),
    vy: -BALL_SPEED * Math.cos(angle),
  };
}

function collideBricks(state: BreakoutState, ball: Ball, previous: Ball): { ball: Ball; bricks: Brick[]; score: number; won: boolean } {
  const hits = state.bricks.filter((brick) => brick.alive && overlapsCircleRect(ball, BALL_RADIUS, brick));
  if (hits.length === 0) return { ball, bricks: state.bricks, score: state.score, won: false };

  const hitIds = new Set(hits.map(({ id }) => id));
  const bricks = state.bricks.map((brick) => hitIds.has(brick.id) ? { ...brick, alive: false } : brick);
  let verticalHit = false;
  let horizontalHit = false;

  for (const brick of hits) {
    if (previous.y + BALL_RADIUS <= brick.y || previous.y - BALL_RADIUS >= brick.y + brick.height) verticalHit = true;
    else if (previous.x + BALL_RADIUS <= brick.x || previous.x - BALL_RADIUS >= brick.x + brick.width) horizontalHit = true;
    else {
      const overlapX = Math.min(ball.x + BALL_RADIUS - brick.x, brick.x + brick.width - (ball.x - BALL_RADIUS));
      const overlapY = Math.min(ball.y + BALL_RADIUS - brick.y, brick.y + brick.height - (ball.y - BALL_RADIUS));
      if (overlapY <= overlapX) verticalHit = true;
      else horizontalHit = true;
    }
  }

  let vx = ball.vx;
  let vy = ball.vy;
  if (verticalHit) vy *= -1;
  if (horizontalHit && !verticalHit) vx *= -1;
  const score = state.score + hits.length * 10;
  return { ball: { ...ball, vx, vy }, bricks, score, won: bricks.every((brick) => !brick.alive) };
}

function simulateSubstep(state: BreakoutState, seconds: number): BreakoutState {
  const paddle = {
    ...state.paddle,
    x: clampPaddleX(state.paddle.x + state.paddleInput * PADDLE_SPEED * seconds, state.paddle.width),
  };
  const previous = state.ball;
  let ball = {
    ...previous,
    x: previous.x + previous.vx * seconds,
    y: previous.y + previous.vy * seconds,
  };

  if (ball.x - BALL_RADIUS < 0) {
    ball.x = BALL_RADIUS;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x + BALL_RADIUS > BOARD_WIDTH) {
    ball.x = BOARD_WIDTH - BALL_RADIUS;
    ball.vx = -Math.abs(ball.vx);
  }
  if (ball.y - BALL_RADIUS < 0) {
    ball.y = BALL_RADIUS;
    ball.vy = Math.abs(ball.vy);
  }

  ball = bounceFromPaddle(ball, paddle, previous.y);
  const collision = collideBricks(state, ball, previous);
  ball = collision.ball;

  if (collision.won) {
    return { ...state, paddle, ball, bricks: collision.bricks, score: collision.score, status: "won", paddleInput: 0 };
  }
  if (ball.y - BALL_RADIUS > BOARD_HEIGHT) {
    const lives = state.lives - 1;
    if (lives <= 0) return { ...state, paddle, ball, bricks: collision.bricks, score: collision.score, lives: 0, status: "lost", paddleInput: 0 };
    return { ...state, paddle, ball: attachedBall(paddle), bricks: collision.bricks, score: collision.score, lives, status: "ready", paddleInput: 0 };
  }

  return { ...state, paddle, ball, bricks: collision.bricks, score: collision.score };
}

export function updateBreakout(state: BreakoutState, seconds: number): BreakoutState {
  if (state.status !== "running" || seconds <= 0) return state;
  const maxTravel = BALL_RADIUS * 0.45;
  const substeps = Math.max(1, Math.ceil(BALL_SPEED * seconds / maxTravel));
  const stepSeconds = seconds / substeps;
  let next = state;

  for (let step = 0; step < substeps && next.status === "running"; step += 1) {
    next = simulateSubstep(next, stepSeconds);
  }
  return next;
}

export function pauseGame(state: BreakoutState): BreakoutState {
  if (state.status !== "running") return state;
  return { ...state, status: "paused", paddleInput: 0 };
}

export function resumeGame(state: BreakoutState): BreakoutState {
  if (state.status !== "paused") return state;
  return { ...state, status: "running", paddleInput: 0 };
}

export function restartGame(): BreakoutState {
  return createInitialState();
}
