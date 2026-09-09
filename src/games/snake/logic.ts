export const BOARD_SIZE = 16;

export type Direction = "up" | "down" | "left" | "right";
export type SnakeStatus = "ready" | "running" | "paused" | "lost" | "won";

export interface Cell {
  x: number;
  y: number;
}

export interface SnakeState {
  snake: Cell[];
  direction: Direction;
  pendingDirections: Direction[];
  food: Cell | null;
  score: number;
  status: SnakeStatus;
  elapsedMs: number;
}

const DIRECTION_VECTORS: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function sameCell(left: Cell, right: Cell): boolean {
  return left.x === right.x && left.y === right.y;
}

function opposite(left: Direction, right: Direction): boolean {
  return DIRECTION_VECTORS[left].x + DIRECTION_VECTORS[right].x === 0
    && DIRECTION_VECTORS[left].y + DIRECTION_VECTORS[right].y === 0;
}

function normalizedRandom(random: () => number): number {
  return Math.min(0.999999999, Math.max(0, random()));
}

export function spawnFood(snake: readonly Cell[], random: () => number = Math.random): Cell | null {
  const occupied = new Set(snake.map(({ x, y }) => `${x},${y}`));
  const empty: Cell[] = [];

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (!occupied.has(`${x},${y}`)) empty.push({ x, y });
    }
  }

  if (empty.length === 0) return null;
  return empty[Math.floor(normalizedRandom(random) * empty.length)]!;
}

export function createInitialState(random: () => number = Math.random): SnakeState {
  const snake = [
    { x: 8, y: 8 },
    { x: 7, y: 8 },
    { x: 6, y: 8 },
  ];
  return {
    snake,
    direction: "right",
    pendingDirections: [],
    food: spawnFood(snake, random),
    score: 0,
    status: "ready",
    elapsedMs: 0,
  };
}

export function startGame(state: SnakeState): SnakeState {
  if (state.status !== "ready") return state;
  return { ...state, status: "running", elapsedMs: 0 };
}

export function queueDirection(state: SnakeState, direction: Direction): SnakeState {
  if (state.status !== "running" || state.pendingDirections.length >= 2) return state;
  const lastAccepted = state.pendingDirections.at(-1) ?? state.direction;
  if (direction === lastAccepted || opposite(direction, lastAccepted)) return state;
  return { ...state, pendingDirections: [...state.pendingDirections, direction] };
}

export function stepSnake(state: SnakeState, random: () => number = Math.random): SnakeState {
  if (state.status !== "running") return state;

  const direction = state.pendingDirections[0] ?? state.direction;
  const pendingDirections = state.pendingDirections.slice(1);
  const vector = DIRECTION_VECTORS[direction];
  const head = state.snake[0]!;
  const nextHead = { x: head.x + vector.x, y: head.y + vector.y };
  const ateFood = state.food !== null && sameCell(nextHead, state.food);
  const collisionBody = ateFood ? state.snake : state.snake.slice(0, -1);
  const hitWall = nextHead.x < 0 || nextHead.x >= BOARD_SIZE || nextHead.y < 0 || nextHead.y >= BOARD_SIZE;
  const hitBody = collisionBody.some((cell) => sameCell(cell, nextHead));

  if (hitWall || hitBody) {
    return {
      ...state,
      direction,
      pendingDirections: [],
      status: "lost",
      elapsedMs: 0,
    };
  }

  const snake = [nextHead, ...state.snake];
  if (!ateFood) snake.pop();
  if (!ateFood) {
    return { ...state, snake, direction, pendingDirections, elapsedMs: 0 };
  }

  const food = spawnFood(snake, random);
  return {
    ...state,
    snake,
    direction,
    pendingDirections,
    food,
    score: state.score + 10,
    status: food === null ? "won" : "running",
    elapsedMs: 0,
  };
}

export function advanceSnake(
  state: SnakeState,
  elapsedMs: number,
  stepDurationMs: number,
  random: () => number = Math.random,
): SnakeState {
  if (state.status !== "running" || elapsedMs <= 0) return state;
  let next = { ...state, elapsedMs: state.elapsedMs + elapsedMs };

  while (next.status === "running" && next.elapsedMs >= stepDurationMs) {
    const remainder = next.elapsedMs - stepDurationMs;
    next = { ...stepSnake(next, random), elapsedMs: remainder };
  }
  return next;
}

export function pauseGame(state: SnakeState): SnakeState {
  if (state.status !== "running") return state;
  return { ...state, status: "paused", pendingDirections: [], elapsedMs: 0 };
}

export function resumeGame(state: SnakeState): SnakeState {
  if (state.status !== "paused") return state;
  return { ...state, status: "running", elapsedMs: 0 };
}

export function restartGame(state: SnakeState, random: () => number = Math.random): SnakeState {
  return createInitialState(random);
}
