export type Direction = "up" | "down" | "left" | "right";
export type LabyrinthStatus = "ready" | "running" | "paused" | "won" | "dimmed";

export interface Cell {
  x: number;
  y: number;
}

export interface MazeCell extends Cell {
  walls: Record<Direction, boolean>;
}

export interface Maze {
  width: number;
  height: number;
  cells: MazeCell[];
  start: Cell;
  exit: Cell;
  shortestDistance: number;
}

export interface LabyrinthState {
  maze: Maze;
  player: Cell;
  fireflies: Cell[];
  collected: number;
  explored: Cell[];
  light: number;
  maxLight: number;
  moves: number;
  score: number;
  level: number;
  status: LabyrinthStatus;
}

const DIRECTIONS: readonly Direction[] = ["up", "right", "down", "left"];

export const DIRECTION_VECTORS: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  right: "left",
  down: "up",
  left: "right",
};

function normalizedRandom(random: () => number): number {
  return Math.min(0.999999999, Math.max(0, random()));
}

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

export function sameCell(left: Cell, right: Cell): boolean {
  return left.x === right.x && left.y === right.y;
}

export function mazeSizeForLevel(level: number): number {
  return Math.min(15, 7 + Math.max(0, level - 1) * 2);
}

function indexFor(maze: Pick<Maze, "width">, cell: Cell): number {
  return cell.y * maze.width + cell.x;
}

export function mazeCell(maze: Maze, cell: Cell): MazeCell | undefined {
  if (cell.x < 0 || cell.x >= maze.width || cell.y < 0 || cell.y >= maze.height) return undefined;
  return maze.cells[indexFor(maze, cell)];
}

function neighbors(maze: Maze, cell: Cell): Array<{ direction: Direction; cell: Cell }> {
  const current = mazeCell(maze, cell);
  if (!current) return [];
  return DIRECTIONS.flatMap((direction) => {
    if (current.walls[direction]) return [];
    const vector = DIRECTION_VECTORS[direction];
    return [{ direction, cell: { x: cell.x + vector.x, y: cell.y + vector.y } }];
  });
}

export function distancesFrom(maze: Maze, origin: Cell): Map<string, number> {
  const distances = new Map([[cellKey(origin), 0]]);
  const queue = [origin];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const distance = distances.get(cellKey(current))!;
    for (const { cell } of neighbors(maze, current)) {
      const key = cellKey(cell);
      if (distances.has(key)) continue;
      distances.set(key, distance + 1);
      queue.push(cell);
    }
  }
  return distances;
}

export function generateMaze(size: number, random: () => number = Math.random): Maze {
  const width = Math.max(3, Math.floor(size));
  const height = width;
  const cells: MazeCell[] = Array.from({ length: width * height }, (_, index) => ({
    x: index % width,
    y: Math.floor(index / width),
    walls: { up: true, right: true, down: true, left: true },
  }));
  const maze: Maze = {
    width,
    height,
    cells,
    start: { x: 0, y: 0 },
    exit: { x: width - 1, y: height - 1 },
    shortestDistance: 0,
  };
  const visited = new Set([cellKey(maze.start)]);
  const stack = [maze.start];

  while (stack.length > 0) {
    const current = stack.at(-1)!;
    const choices = DIRECTIONS.flatMap((direction) => {
      const vector = DIRECTION_VECTORS[direction];
      const cell = { x: current.x + vector.x, y: current.y + vector.y };
      return mazeCell(maze, cell) && !visited.has(cellKey(cell)) ? [{ direction, cell }] : [];
    });
    if (choices.length === 0) {
      stack.pop();
      continue;
    }
    const choice = choices[Math.floor(normalizedRandom(random) * choices.length)]!;
    mazeCell(maze, current)!.walls[choice.direction] = false;
    mazeCell(maze, choice.cell)!.walls[OPPOSITE[choice.direction]] = false;
    visited.add(cellKey(choice.cell));
    stack.push(choice.cell);
  }

  const distances = distancesFrom(maze, maze.start);
  let exit = maze.start;
  let shortestDistance = 0;
  for (const cell of cells) {
    const distance = distances.get(cellKey(cell)) ?? 0;
    if (distance > shortestDistance) {
      exit = { x: cell.x, y: cell.y };
      shortestDistance = distance;
    }
  }
  return { ...maze, exit, shortestDistance };
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(normalizedRandom(random) * (index + 1));
    [copy[index], copy[other]] = [copy[other]!, copy[index]!];
  }
  return copy;
}

export function placeFireflies(maze: Maze, count: number, random: () => number = Math.random): Cell[] {
  const candidates = maze.cells.filter((cell) => !sameCell(cell, maze.start) && !sameCell(cell, maze.exit));
  const deadEnds = candidates.filter((cell) => DIRECTIONS.filter((direction) => !cell.walls[direction]).length === 1);
  const chosen: Cell[] = [];
  for (const cell of [...shuffle(deadEnds, random), ...shuffle(candidates, random)]) {
    if (chosen.some((other) => sameCell(other, cell))) continue;
    chosen.push({ x: cell.x, y: cell.y });
    if (chosen.length >= count) break;
  }
  return chosen;
}

export function fireflyCountForLevel(level: number): number {
  return Math.min(6, 3 + Math.floor(Math.max(0, level - 1) / 2));
}

export function createInitialState(level = 1, random: () => number = Math.random, score = 0): LabyrinthState {
  const maze = generateMaze(mazeSizeForLevel(level), random);
  const maxLight = maze.shortestDistance + 16;
  return {
    maze,
    player: { ...maze.start },
    fireflies: placeFireflies(maze, fireflyCountForLevel(level), random),
    collected: 0,
    explored: [{ ...maze.start }],
    light: maxLight,
    maxLight,
    moves: 0,
    score,
    level,
    status: "ready",
  };
}

export function startGame(state: LabyrinthState): LabyrinthState {
  return state.status === "ready" ? { ...state, status: "running" } : state;
}

export function pauseGame(state: LabyrinthState): LabyrinthState {
  return state.status === "running" ? { ...state, status: "paused" } : state;
}

export function resumeGame(state: LabyrinthState): LabyrinthState {
  return state.status === "paused" ? { ...state, status: "running" } : state;
}

export function movePlayer(state: LabyrinthState, direction: Direction): LabyrinthState {
  if (state.status !== "running") return state;
  const current = mazeCell(state.maze, state.player);
  if (!current || current.walls[direction]) return state;
  const vector = DIRECTION_VECTORS[direction];
  const player = { x: state.player.x + vector.x, y: state.player.y + vector.y };
  const fireflyIndex = state.fireflies.findIndex((firefly) => sameCell(firefly, player));
  const foundFirefly = fireflyIndex >= 0;
  const fireflies = foundFirefly
    ? state.fireflies.filter((_, index) => index !== fireflyIndex)
    : state.fireflies;
  const lightAfterStep = state.light - 1;
  const light = foundFirefly
    ? Math.min(state.maxLight, lightAfterStep + Math.ceil(state.maxLight * 0.28))
    : Math.max(0, lightAfterStep);
  const explored = state.explored.some((cell) => sameCell(cell, player))
    ? state.explored
    : [...state.explored, player];
  const reachedExit = sameCell(player, state.maze.exit);
  const collected = state.collected + Number(foundFirefly);
  const score = reachedExit
    ? state.score + 300 + light * 5 + collected * 100 + state.level * 50
    : state.score;

  return {
    ...state,
    player,
    fireflies,
    collected,
    explored,
    light,
    moves: state.moves + 1,
    score,
    status: reachedExit ? "won" : light <= 0 ? "dimmed" : "running",
  };
}

export function nextLevel(state: LabyrinthState, random: () => number = Math.random): LabyrinthState {
  return state.status === "won" ? createInitialState(state.level + 1, random, state.score) : state;
}

export function retryLevel(state: LabyrinthState, random: () => number = Math.random): LabyrinthState {
  return state.status === "dimmed" ? createInitialState(state.level, random, state.score) : state;
}

export function restartGame(random: () => number = Math.random): LabyrinthState {
  return createInitialState(1, random);
}

export function lightPercent(state: LabyrinthState): number {
  return Math.max(0, Math.min(100, Math.round(state.light / state.maxLight * 100)));
}
