import { describe, expect, test } from "bun:test";
import {
  type Direction,
  type LabyrinthState,
  cellKey,
  createInitialState,
  distancesFrom,
  generateMaze,
  lightPercent,
  mazeCell,
  mazeSizeForLevel,
  movePlayer,
  nextLevel,
  pauseGame,
  restartGame,
  retryLevel,
  resumeGame,
  sameCell,
  startGame,
} from "./logic";

function sequenceRandom(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

function directionBetween(from: { x: number; y: number }, to: { x: number; y: number }): Direction {
  if (to.x > from.x) return "right";
  if (to.x < from.x) return "left";
  if (to.y > from.y) return "down";
  return "up";
}

function shortestPath(state: LabyrinthState): Direction[] {
  const queue = [state.maze.start];
  const previous = new Map<string, { cell: { x: number; y: number }; direction: Direction }>();
  const seen = new Set([cellKey(state.maze.start)]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    if (sameCell(current, state.maze.exit)) break;
    const cell = mazeCell(state.maze, current)!;
    for (const direction of ["up", "right", "down", "left"] as const) {
      if (cell.walls[direction]) continue;
      const vector = direction === "up" ? { x: 0, y: -1 }
        : direction === "right" ? { x: 1, y: 0 }
          : direction === "down" ? { x: 0, y: 1 }
            : { x: -1, y: 0 };
      const next = { x: current.x + vector.x, y: current.y + vector.y };
      if (seen.has(cellKey(next))) continue;
      seen.add(cellKey(next));
      previous.set(cellKey(next), { cell: current, direction });
      queue.push(next);
    }
  }
  const path: Direction[] = [];
  let current = state.maze.exit;
  while (!sameCell(current, state.maze.start)) {
    const step = previous.get(cellKey(current));
    if (!step) throw new Error("Exit was not reachable");
    path.unshift(step.direction ?? directionBetween(step.cell, current));
    current = step.cell;
  }
  return path;
}

describe("Lantern Labyrinth maze generation", () => {
  test("generates a connected perfect maze with matching walls", () => {
    const maze = generateMaze(9, sequenceRandom([0.12, 0.88, 0.43, 0.67, 0.25]));
    const distances = distancesFrom(maze, maze.start);
    expect(distances.size).toBe(81);
    expect(maze.shortestDistance).toBe(distances.get(cellKey(maze.exit))!);
    expect(maze.shortestDistance).toBeGreaterThan(0);

    let openings = 0;
    for (const cell of maze.cells) {
      if (!cell.walls.right) {
        openings += 1;
        expect(mazeCell(maze, { x: cell.x + 1, y: cell.y })?.walls.left).toBe(false);
      }
      if (!cell.walls.down) {
        openings += 1;
        expect(mazeCell(maze, { x: cell.x, y: cell.y + 1 })?.walls.up).toBe(false);
      }
    }
    expect(openings).toBe(maze.cells.length - 1);
  });

  test("increases maze size gradually and caps it for touch play", () => {
    expect(mazeSizeForLevel(1)).toBe(7);
    expect(mazeSizeForLevel(3)).toBe(11);
    expect(mazeSizeForLevel(99)).toBe(15);
  });
});

describe("Lantern Labyrinth play", () => {
  test("does not spend light when walking into a wall", () => {
    const state = startGame(createInitialState(1, () => 0));
    const blocked = movePlayer(state, "up");
    expect(blocked).toBe(state);
    expect(blocked.light).toBe(state.light);
  });

  test("a generated level is always winnable by its shortest path", () => {
    let state = startGame(createInitialState(2, sequenceRandom([0.1, 0.7, 0.3, 0.9, 0.5])));
    const path = shortestPath(state);
    expect(path.length).toBe(state.maze.shortestDistance);
    for (const direction of path) state = movePlayer(state, direction);
    expect(state.status).toBe("won");
    expect(state.light).toBeGreaterThan(0);
    expect(state.score).toBeGreaterThan(0);
  });

  test("collecting a firefly removes it, scores it, and restores light", () => {
    const initial = startGame(createInitialState(1, () => 0));
    const cell = mazeCell(initial.maze, initial.player)!;
    const direction = (["right", "down"] as const).find((candidate) => !cell.walls[candidate])!;
    const vector = direction === "right" ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const destination = { x: initial.player.x + vector.x, y: initial.player.y + vector.y };
    const state = { ...initial, fireflies: [destination], light: 2 };
    const moved = movePlayer(state, direction);
    expect(moved.collected).toBe(1);
    expect(moved.fireflies).toHaveLength(0);
    expect(moved.light).toBeGreaterThan(1);
  });

  test("the lantern can dim before the exit", () => {
    const initial = startGame(createInitialState(1, () => 0));
    const cell = mazeCell(initial.maze, initial.player)!;
    const direction = (["right", "down"] as const).find((candidate) => !cell.walls[candidate])!;
    const dimmed = movePlayer({ ...initial, light: 1, fireflies: [] }, direction);
    expect(dimmed.status).toBe("dimmed");
    expect(lightPercent(dimmed)).toBe(0);
  });

  test("pauses, resumes, advances levels, and restarts the expedition", () => {
    const running = startGame(createInitialState(1, () => 0.5));
    const paused = pauseGame(running);
    expect(movePlayer(paused, "right")).toBe(paused);
    expect(resumeGame(paused).status).toBe("running");

    const won = { ...running, status: "won" as const, score: 900 };
    const advanced = nextLevel(won, () => 0.5);
    expect(advanced.level).toBe(2);
    expect(advanced.score).toBe(900);
    expect(advanced.status).toBe("ready");

    const retried = retryLevel({ ...running, status: "dimmed", level: 3, score: 700 }, () => 0.5);
    expect(retried.level).toBe(3);
    expect(retried.score).toBe(700);
    expect(retried.status).toBe("ready");

    const restarted = restartGame(() => 0.5);
    expect(restarted.level).toBe(1);
    expect(restarted.score).toBe(0);
  });
});
