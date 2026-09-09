import { describe, expect, test } from "bun:test";
import {
  BOARD_SIZE,
  type Cell,
  type SnakeState,
  advanceSnake,
  createInitialState,
  interpolateSnake,
  pauseGame,
  queueDirection,
  restartGame,
  resumeGame,
  spawnFood,
  startGame,
  stepSnake,
} from "./logic";

function running(overrides: Partial<SnakeState> = {}): SnakeState {
  return {
    ...createInitialState(() => 0),
    status: "running",
    ...overrides,
  };
}

describe("Snake movement", () => {
  test("interpolates every segment smoothly between grid steps", () => {
    const previous = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
    const current = [{ x: 9, y: 8 }, { x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
    expect(interpolateSnake(previous, current, 0)).toEqual([
      { x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }, { x: 6, y: 8 },
    ]);
    expect(interpolateSnake(previous, current, 0.5)).toEqual([
      { x: 8.5, y: 8 }, { x: 7.5, y: 8 }, { x: 6.5, y: 8 }, { x: 6, y: 8 },
    ]);
    expect(interpolateSnake(previous, current, 2)[0]).toEqual({ x: 9, y: 8 });
  });

  test("starts centered with three cells and moves without growing", () => {
    const ready = createInitialState(() => 0);
    expect(ready.snake).toEqual([{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }]);
    expect(ready.status).toBe("ready");

    const moved = stepSnake(startGame(ready), () => 0);
    expect(moved.snake).toEqual([{ x: 9, y: 8 }, { x: 8, y: 8 }, { x: 7, y: 8 }]);
    expect(moved.score).toBe(0);
  });

  test("eats food, grows by one cell, and scores ten points", () => {
    const state = running({ food: { x: 9, y: 8 } });
    const eaten = stepSnake(state, () => 0);
    expect(eaten.snake).toHaveLength(4);
    expect(eaten.snake[0]).toEqual({ x: 9, y: 8 });
    expect(eaten.score).toBe(10);
    expect(eaten.food).not.toEqual({ x: 9, y: 8 });
  });

  test("rejects reversals and buffers at most two valid turns", () => {
    let state = running();
    expect(queueDirection(state, "left")).toBe(state);
    state = queueDirection(state, "up");
    state = queueDirection(state, "left");
    expect(queueDirection(state, "down")).toBe(state);
    expect(state.pendingDirections).toEqual(["up", "left"]);

    state = stepSnake(state);
    expect(state.direction).toBe("up");
    expect(state.pendingDirections).toEqual(["left"]);
    state = stepSnake(state);
    expect(state.direction).toBe("left");
    expect(state.pendingDirections).toEqual([]);
  });

  test("ends on wall and body collisions", () => {
    const wall = running({ snake: [{ x: 15, y: 4 }, { x: 14, y: 4 }, { x: 13, y: 4 }] });
    expect(stepSnake(wall).status).toBe("lost");

    const body = running({
      direction: "down",
      snake: [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }],
      food: { x: 0, y: 0 },
    });
    expect(stepSnake(body).status).toBe("lost");
  });

  test("allows moving into a tail that leaves, but not one retained by eating", () => {
    const loop: Cell[] = [{ x: 4, y: 4 }, { x: 4, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 4 }];
    const movingTail = running({ snake: loop, direction: "left", food: { x: 0, y: 0 } });
    expect(stepSnake(movingTail).status).toBe("running");
    expect(stepSnake(movingTail).snake[0]).toEqual({ x: 3, y: 4 });

    const eatingTail = running({ snake: loop, direction: "left", food: { x: 3, y: 4 } });
    expect(stepSnake(eatingTail).status).toBe("lost");
  });
});

describe("Snake food and timing", () => {
  test("spawns food deterministically in empty cells", () => {
    const snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    expect(spawnFood(snake, () => 0)).toEqual({ x: 2, y: 0 });
    expect(spawnFood(snake, () => 0.999999)).toEqual({ x: 15, y: 15 });
  });

  test("wins on a full board without trying to spawn invalid food", () => {
    const snake: Cell[] = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        if (x !== 1 || y !== 0) snake.push({ x, y });
      }
    }
    const state = running({ snake, direction: "right", food: { x: 1, y: 0 } });
    let randomCalls = 0;
    const won = stepSnake(state, () => { randomCalls += 1; return 0; });
    expect(won.status).toBe("won");
    expect(won.food).toBeNull();
    expect(won.snake).toHaveLength(BOARD_SIZE * BOARD_SIZE);
    expect(randomCalls).toBe(0);
  });

  test("advances at a constant interval and keeps remainder time", () => {
    let state = running();
    state = advanceSnake(state, 149, 150);
    expect(state.snake[0]).toEqual({ x: 8, y: 8 });
    state = advanceSnake(state, 1, 150);
    expect(state.snake[0]).toEqual({ x: 9, y: 8 });
    state = advanceSnake(state, 320, 150);
    expect(state.snake[0]).toEqual({ x: 11, y: 8 });
    expect(state.elapsedMs).toBe(20);
  });

  test("pause and terminal states freeze, and resume discards catch-up time", () => {
    const partial = advanceSnake(running(), 100, 150);
    const paused = pauseGame(partial);
    expect(paused.pendingDirections).toEqual([]);
    expect(paused.elapsedMs).toBe(0);
    expect(advanceSnake(paused, 5_000, 150)).toBe(paused);

    const resumed = resumeGame(paused);
    expect(resumed.elapsedMs).toBe(0);
    expect(advanceSnake(resumed, 149, 150).snake[0]).toEqual({ x: 8, y: 8 });

    const lost = { ...resumed, status: "lost" as const };
    expect(advanceSnake(lost, 5_000, 150)).toBe(lost);
  });

  test("restart resets score, body, direction queue, status, and timing", () => {
    const changed = running({
      snake: [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 1 }],
      direction: "down",
      pendingDirections: ["left"],
      score: 40,
      elapsedMs: 100,
    });
    const reset = restartGame(changed, () => 0);
    expect(reset.snake).toEqual([{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }]);
    expect(reset.direction).toBe("right");
    expect(reset.pendingDirections).toEqual([]);
    expect(reset.score).toBe(0);
    expect(reset.status).toBe("ready");
    expect(reset.elapsedMs).toBe(0);
  });

  test("ignores direction input before start and after a result", () => {
    const ready = createInitialState();
    expect(queueDirection(ready, "up")).toBe(ready);
    const lost = { ...startGame(ready), status: "lost" as const };
    expect(queueDirection(lost, "up")).toBe(lost);
  });
});
