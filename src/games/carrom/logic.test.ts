import { describe, expect, test } from "bun:test";
import {
  AI_BASELINE_Y,
  BOARD_SIZE,
  CARROM_COIN_COUNT,
  FIELD_MAX,
  FIELD_MIN,
  FRICTION,
  MAX_PULL,
  MAX_SHOT_SPEED,
  PLAYER_BASELINE_Y,
  STRIKER_RADIUS,
  type CarromState,
  chooseAiShot,
  createInitialState,
  displayToBoard,
  launchAiShot,
  launchPlayerShot,
  positionPlayerStriker,
  predictTrajectory,
  remainingCoins,
  shotPower,
  updateCarrom,
  velocityFromPull,
} from "./logic";

function pathLength(points: readonly { x: number; y: number }[]): number {
  return points.slice(1).reduce((sum, point, index) => {
    const previous = points[index]!;
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

describe("Carrom setup and touch controls", () => {
  test("sets up six coins per side, a queen, and the player's striker", () => {
    const state = createInitialState();
    expect(state.coins).toHaveLength(CARROM_COIN_COUNT * 2 + 1);
    expect(remainingCoins(state, "player")).toBe(CARROM_COIN_COUNT);
    expect(remainingCoins(state, "ai")).toBe(CARROM_COIN_COUNT);
    expect(state.coins.filter(({ kind }) => kind === "queen")).toHaveLength(1);
    expect(state.turn).toBe("player");
    expect(state.phase).toBe("aiming");
    expect(state.striker.y).toBe(PLAYER_BASELINE_Y);
  });

  test("maps display coordinates and places the striker inside the launch line", () => {
    expect(displayToBoard(150, 200, { left: 50, top: 100, width: 200, height: 200 })).toEqual({ x: BOARD_SIZE / 2, y: BOARD_SIZE / 2 });
    const left = positionPlayerStriker(createInitialState(), -50);
    const right = positionPlayerStriker(createInitialState(), 900);
    expect(left.striker.x).toBeGreaterThan(FIELD_MIN + STRIKER_RADIUS);
    expect(right.striker.x).toBeLessThan(FIELD_MAX - STRIKER_RADIUS);
  });

  test("fires opposite the pull with proportional, capped power", () => {
    const striker = createInitialState().striker;
    const halfPull = { x: striker.x + MAX_PULL / 2, y: striker.y + MAX_PULL / 2 };
    const velocity = velocityFromPull(striker, halfPull);
    expect(velocity.x).toBeLessThan(0);
    expect(velocity.y).toBeLessThan(0);
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(MAX_SHOT_SPEED / Math.sqrt(2), 5);
    expect(shotPower(striker, halfPull)).toBe(71);

    const capped = velocityFromPull(striker, { x: striker.x, y: striker.y + MAX_PULL * 3 });
    expect(Math.hypot(capped.x, capped.y)).toBeCloseTo(MAX_SHOT_SPEED, 5);
    expect(capped.y).toBeLessThan(0);
  });

  test("ignores tiny accidental pulls", () => {
    const state = createInitialState();
    expect(launchPlayerShot(state, { x: state.striker.x + 4, y: state.striker.y + 4 })).toBe(state);
  });
});

describe("Easy-mode trajectory guide", () => {
  test("uses pull power to shorten or lengthen the predicted path", () => {
    const state = { ...createInitialState(), coins: [] };
    const weakPointer = { x: state.striker.x, y: state.striker.y + 45 };
    const strongPointer = { x: state.striker.x, y: state.striker.y + 120 };
    const weak = predictTrajectory(state.striker, state.coins, weakPointer).strikerPath;
    const strong = predictTrajectory(state.striker, state.coins, strongPointer).strikerPath;
    const weakEnd = weak.at(-1)!;
    const strongEnd = strong.at(-1)!;
    const weakDistance = Math.hypot(weakEnd.x - state.striker.x, weakEnd.y - state.striker.y);
    const strongDistance = pathLength(strong);
    expect(weakDistance).toBeCloseTo((MAX_SHOT_SPEED * 45 / MAX_PULL) ** 2 / (2 * FRICTION), 4);
    expect(strongDistance).toBeGreaterThan(weakDistance);
  });

  test("reflects once from a side cushion and shows the final destination", () => {
    const state = { ...createInitialState(), coins: [] };
    const pointer = { x: state.striker.x - 140, y: state.striker.y + 65 };
    const guide = predictTrajectory(state.striker, state.coins, pointer, 1).strikerPath;
    expect(guide.some(({ kind }) => kind === "bounce")).toBe(true);
    expect(guide.at(-1)!.kind).toBe("end");
    expect(guide).toHaveLength(3);
  });

  test("stops where the striker first contacts a coin", () => {
    const state = createInitialState();
    const coin = { ...state.coins[0]!, x: state.striker.x, y: state.striker.y - 170 };
    const prediction = predictTrajectory(state.striker, [coin], { x: state.striker.x, y: state.striker.y + 120 });
    expect(prediction.strikerPath.at(-1)?.kind).toBe("coin");
    expect(prediction.strikerPath.at(-1)?.coinId).toBe(coin.id);
    expect(prediction.strikerPath.at(-1)!.y).toBeCloseTo(coin.y + coin.radius + state.striker.radius, 5);
    expect(prediction.coinPath[0]).toMatchObject({ x: coin.x, y: coin.y, kind: "start" });
    expect(prediction.coinPath.length).toBeGreaterThan(1);
  });

  test("projects a longer coin path for a harder hit", () => {
    const state = createInitialState();
    const coin = { ...state.coins[0]!, x: state.striker.x, y: state.striker.y - 170 };
    const soft = predictTrajectory(state.striker, [coin], { x: state.striker.x, y: state.striker.y + 75 });
    const hard = predictTrajectory(state.striker, [coin], { x: state.striker.x, y: state.striker.y + 125 });
    expect(pathLength(hard.coinPath)).toBeGreaterThan(pathLength(soft.coinPath));
  });

  test("angles the coin path from the exact point of contact", () => {
    const state = createInitialState();
    const coin = { ...state.coins[0]!, x: state.striker.x + 25, y: state.striker.y - 170 };
    const prediction = predictTrajectory(state.striker, [coin], { x: state.striker.x, y: state.striker.y + 125 });
    const destination = prediction.coinPath.at(-1)!;
    expect(prediction.hitCoinId).toBe(coin.id);
    expect(destination.x).toBeGreaterThan(coin.x);
    expect(destination.y).toBeLessThan(coin.y);
  });
});

describe("Carrom physics and turns", () => {
  test("transfers motion from the striker to a coin", () => {
    let state = createInitialState();
    state = {
      ...state,
      coins: state.coins.map((coin, index) => index === 0 ? { ...coin, x: state.striker.x, y: state.striker.y - 90 } : { ...coin, pocketed: true }),
    };
    state = launchPlayerShot(state, { x: state.striker.x, y: state.striker.y + 120 });
    state = updateCarrom(state, 0.05);
    state = updateCarrom(state, 0.05);
    expect(state.coins[0]!.vy).toBeLessThan(0);
    expect(Math.abs(state.striker.vy)).toBeLessThan(MAX_SHOT_SPEED);
  });

  test("a dry player shot passes the turn to the AI", () => {
    let state: CarromState = {
      ...createInitialState(),
      coins: [
        { ...createInitialState().coins.find(({ kind }) => kind === "player")!, x: 145, y: 360 },
        { ...createInitialState().coins.find(({ kind }) => kind === "ai")!, x: 575, y: 360 },
      ],
    };
    state = launchPlayerShot(state, { x: state.striker.x, y: state.striker.y + 20 });
    for (let step = 0; step < 200 && state.phase === "moving"; step += 1) state = updateCarrom(state, 0.05);
    expect(state.phase).toBe("aiThinking");
    expect(state.turn).toBe("ai");
    expect(state.striker.y).toBe(AI_BASELINE_Y);
  });

  test("pocketing your own coin scores and earns another turn", () => {
    const initial = createInitialState();
    const playerCoins = initial.coins.filter(({ kind }) => kind === "player");
    const aiCoin = initial.coins.find(({ kind }) => kind === "ai")!;
    let state: CarromState = {
      ...initial,
      phase: "moving",
      shot: { shooter: "player", pocketed: [], strikerPocketed: false },
      coins: [
        { ...playerCoins[0]!, x: 76, y: 76, vx: -100, vy: -100 },
        { ...playerCoins[1]!, x: 300, y: 300 },
        { ...aiCoin, x: 500, y: 400 },
      ],
    };
    state = updateCarrom(state, 0.02);
    expect(state.score.player).toBe(1);
    expect(state.coins[0]!.pocketed).toBe(true);
    expect(state.turn).toBe("player");
    expect(state.phase).toBe("aiming");
  });

  test("the AI launches a downward shot with hard mode more accurate and stronger", () => {
    const state = { ...createInitialState("hard"), phase: "aiThinking" as const, turn: "ai" as const };
    const hard = chooseAiShot(state, "hard", () => 0.5);
    const easy = chooseAiShot(state, "easy", () => 0.5);
    expect(hard.targetId).not.toBeNull();
    expect(hard.velocity.y).toBeGreaterThan(0);
    expect(Math.hypot(hard.velocity.x, hard.velocity.y)).toBeGreaterThan(Math.hypot(easy.velocity.x, easy.velocity.y));

    const launched = launchAiShot(state, () => 0.5);
    expect(launched.phase).toBe("moving");
    expect(launched.striker.y).toBe(AI_BASELINE_Y);
    expect(launched.striker.vy).toBeGreaterThan(0);
  });
});
