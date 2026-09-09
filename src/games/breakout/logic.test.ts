import { describe, expect, test } from "bun:test";
import {
  BALL_RADIUS,
  BALL_SPEED,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PADDLE_WIDTH,
  type BreakoutState,
  clampPaddleX,
  createInitialState,
  displayToBoardX,
  launchBall,
  movePaddleTo,
  pauseGame,
  restartGame,
  resumeGame,
  setPaddleInput,
  updateBreakout,
} from "./logic";

function speed(state: BreakoutState): number {
  return Math.hypot(state.ball.vx, state.ball.vy);
}

describe("Breakout setup and controls", () => {
  test("starts with forty bricks, three lives, zero score, and an attached ball", () => {
    const state = createInitialState();
    expect(state.bricks).toHaveLength(40);
    expect(state.bricks.every(({ alive }) => alive)).toBe(true);
    expect(state.lives).toBe(3);
    expect(state.score).toBe(0);
    expect(state.status).toBe("ready");
    expect(state.ball.x).toBe(state.paddle.x);
    expect(state.ball.y).toBeLessThan(state.paddle.y);
  });

  test("clamps paddle movement and maps display coordinates", () => {
    expect(clampPaddleX(-100)).toBe(PADDLE_WIDTH / 2);
    expect(clampPaddleX(900)).toBe(BOARD_WIDTH - PADDLE_WIDTH / 2);
    expect(displayToBoardX(150, 50, 200)).toBe(BOARD_WIDTH / 2);
    expect(displayToBoardX(350, 100, 500)).toBe(BOARD_WIDTH * 0.5);

    const moved = movePaddleTo(createInitialState(), 900);
    expect(moved.paddle.x).toBe(BOARD_WIDTH - PADDLE_WIDTH / 2);
    expect(moved.ball.x).toBe(moved.paddle.x);
  });

  test("launches upward with a horizontal component at the supported speed", () => {
    const launched = launchBall(createInitialState());
    expect(launched.status).toBe("running");
    expect(launched.ball.vx).toBeGreaterThan(0);
    expect(launched.ball.vy).toBeLessThan(0);
    expect(speed(launched)).toBeCloseTo(BALL_SPEED, 6);
  });
});

describe("Breakout collisions", () => {
  test("reflects from side and top walls without changing speed", () => {
    const initial = launchBall(createInitialState());
    const left = updateBreakout({ ...initial, ball: { x: BALL_RADIUS + 1, y: 300, vx: -200, vy: -100 } }, 0.02);
    expect(left.ball.vx).toBeGreaterThan(0);
    expect(Math.hypot(left.ball.vx, left.ball.vy)).toBeCloseTo(Math.hypot(200, 100), 6);

    const top = updateBreakout({ ...initial, ball: { x: 300, y: BALL_RADIUS + 1, vx: 100, vy: -200 } }, 0.02);
    expect(top.ball.vy).toBeGreaterThan(0);
    expect(Math.hypot(top.ball.vx, top.ball.vy)).toBeCloseTo(Math.hypot(100, 200), 6);
  });

  test("paddle center and edge hits bounce upward with useful angles", () => {
    const initial = launchBall(createInitialState());
    const center = updateBreakout({ ...initial, ball: { x: initial.paddle.x, y: initial.paddle.y - 30, vx: 0, vy: BALL_SPEED } }, 0.1);
    expect(center.ball.vy).toBeLessThan(0);
    expect(Math.abs(center.ball.vx)).toBeLessThan(5);
    expect(speed(center)).toBeCloseTo(BALL_SPEED, 5);

    const edgeX = initial.paddle.x + initial.paddle.width * 0.42;
    const edge = updateBreakout({ ...initial, ball: { x: edgeX, y: initial.paddle.y - 30, vx: 0, vy: BALL_SPEED } }, 0.1);
    expect(edge.ball.vx).toBeGreaterThan(0);
    expect(edge.ball.vy).toBeLessThan(-BALL_SPEED * 0.49);
    expect(speed(edge)).toBeCloseTo(BALL_SPEED, 5);
  });

  test("does not bounce from beneath the paddle", () => {
    const initial = launchBall(createInitialState());
    const below = updateBreakout({ ...initial, ball: { x: initial.paddle.x, y: initial.paddle.y + 25, vx: 0, vy: -BALL_SPEED } }, 0.02);
    expect(below.ball.vy).toBeLessThan(0);
  });

  test("destroys a brick and scores it exactly once", () => {
    const initial = launchBall(createInitialState());
    const brick = initial.bricks[0]!;
    let state = updateBreakout({
      ...initial,
      ball: { x: brick.x + brick.width / 2, y: brick.y + brick.height + BALL_RADIUS + 1, vx: 0, vy: -BALL_SPEED },
    }, 0.01);
    expect(state.bricks[0]!.alive).toBe(false);
    expect(state.score).toBe(10);
    state = updateBreakout(state, 0.01);
    expect(state.score).toBe(10);
  });

  test("handles neighboring brick contact without repeated scoring", () => {
    const initial = launchBall(createInitialState());
    const left = initial.bricks[0]!;
    const right = initial.bricks[1]!;
    const between = (left.x + left.width + right.x) / 2;
    const state = updateBreakout({
      ...initial,
      ball: { x: between, y: left.y + left.height + BALL_RADIUS + 1, vx: 0, vy: -BALL_SPEED },
    }, 0.01);
    expect(state.bricks.filter(({ alive }) => !alive)).toHaveLength(2);
    expect(state.score).toBe(20);
    expect(state.ball.vy).toBeGreaterThan(0);
  });

  test("bounded substeps prevent tunneling through a brick and paddle", () => {
    const initial = launchBall(createInitialState());
    const brick = initial.bricks[8]!;
    const brickHit = updateBreakout({
      ...initial,
      bricks: initial.bricks.map((candidate) => ({ ...candidate, alive: candidate.id === brick.id })),
      ball: { x: brick.x + brick.width / 2, y: brick.y + brick.height + 70, vx: 0, vy: -BALL_SPEED },
    }, 0.3);
    expect(brickHit.bricks[8]!.alive).toBe(false);

    const paddleHit = updateBreakout({
      ...initial,
      ball: { x: initial.paddle.x, y: initial.paddle.y - 100, vx: 0, vy: BALL_SPEED },
    }, 0.35);
    expect(paddleHit.ball.vy).toBeLessThan(0);
  });
});

describe("Breakout round state", () => {
  test("a miss consumes one life and reattaches, with the final miss ending play", () => {
    const initial = launchBall(createInitialState());
    let missed = updateBreakout({ ...initial, ball: { x: 200, y: BOARD_HEIGHT + BALL_RADIUS - 1, vx: 0, vy: BALL_SPEED } }, 0.02);
    expect(missed.lives).toBe(2);
    expect(missed.status).toBe("ready");
    expect(missed.ball.x).toBe(missed.paddle.x);

    missed = launchBall({ ...missed, lives: 1 });
    missed = updateBreakout({ ...missed, ball: { x: 200, y: BOARD_HEIGHT + BALL_RADIUS - 1, vx: 0, vy: BALL_SPEED } }, 0.02);
    expect(missed.lives).toBe(0);
    expect(missed.status).toBe("lost");
  });

  test("clearing the final brick wins", () => {
    const initial = launchBall(createInitialState());
    const final = initial.bricks[0]!;
    const state = updateBreakout({
      ...initial,
      bricks: initial.bricks.map((brick) => ({ ...brick, alive: brick.id === final.id })),
      ball: { x: final.x + final.width / 2, y: final.y + final.height + 12, vx: 0, vy: -BALL_SPEED },
    }, 0.05);
    expect(state.status).toBe("won");
    expect(state.score).toBe(10);
  });

  test("pause and terminal states freeze physics", () => {
    const launched = launchBall(createInitialState());
    const paused = pauseGame(setPaddleInput(launched, 1));
    expect(paused.paddleInput).toBe(0);
    expect(updateBreakout(paused, 10)).toBe(paused);
    const resumed = resumeGame(paused);
    expect(resumed.status).toBe("running");
    const won = { ...resumed, status: "won" as const };
    expect(updateBreakout(won, 10)).toBe(won);
  });

  test("restart resets bricks, score, lives, ball, paddle, and held input", () => {
    const changed: BreakoutState = {
      ...launchBall(createInitialState()),
      score: 120,
      lives: 1,
      paddleInput: -1,
      bricks: createInitialState().bricks.map((brick, index) => ({ ...brick, alive: index > 4 })),
    };
    const reset = restartGame();
    expect(reset.score).toBe(0);
    expect(reset.lives).toBe(3);
    expect(reset.bricks.every(({ alive }) => alive)).toBe(true);
    expect(reset.status).toBe("ready");
    expect(reset.paddleInput).toBe(0);
    expect(reset.paddle.x).toBe(BOARD_WIDTH / 2);
    expect(reset.ball.x).toBe(reset.paddle.x);
  });
});
