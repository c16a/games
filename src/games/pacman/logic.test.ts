import { describe, expect, test } from "bun:test";
import { createState, HEIGHT, key, MAZE, neighbor, nextLevel, START, step, togglePause, WIDTH, type Direction } from "./logic";

describe("Pacman", () => {
  test("maze is rectangular and all pellets and ghost homes are reachable", () => {
    expect(MAZE.every(row => row.length === WIDTH)).toBe(true);
    const seen = new Set([key(START)]), queue = [START];
    for (let i = 0; i < queue.length; i++) for (const d of ["up", "down", "left", "right"] as Direction[]) {
      const n = neighbor(queue[i]!, d);
      if (n && !seen.has(key(n))) { seen.add(key(n)); queue.push(n); }
    }
    const s = createState();
    for (const p of [...s.pellets, ...s.ghosts.map(key)]) expect(seen.has(p)).toBe(true);
    expect(HEIGHT).toBe(16);
  });
  test("walls block movement and side tunnel wraps", () => {
    expect(neighbor({ x: 1, y: 1 }, "up")).toBeUndefined();
    expect(neighbor({ x: 0, y: 8 }, "left")).toEqual({ x: WIDTH - 1, y: 8 });
    expect(neighbor({ x: WIDTH - 1, y: 8 }, "right")).toEqual({ x: 0, y: 8 });
  });
  test("ready and paused games do not advance", () => {
    const s = createState(); step(s); expect(s.tick).toBe(0);
    s.status = "running"; togglePause(s); step(s); expect(s.tick).toBe(0);
    togglePause(s); step(s); expect(s.tick).toBe(1);
  });
  test("pellets score only once and queued turns wait for an opening", () => {
    const s = createState(); s.status = "running"; s.queued = "down";
    step(s); expect(s.player).toEqual({ x: 8, y: 14 }); expect(s.score).toBe(10);
    s.queued = "right"; step(s); s.queued = "left"; step(s); expect(s.score).toBe(10);
  });
  test("power pellets allow eating ghosts", () => {
    const s = createState(); s.status = "running"; s.player = { x: 2, y: 1 }; s.ghosts = [{ x: 1, y: 1 }];
    step(s); expect(s.power).toBe(55); expect(s.score).toBe(250); expect(s.lives).toBe(3);
  });
  test("collision consumes one life, resets positions and waits to continue", () => {
    const s = createState(); s.status = "running"; s.shield = 0; s.ghosts = [{ x: 8, y: 14 }, { x: 8, y: 14 }];
    step(s); expect(s.lives).toBe(2); expect(String(s.status)).toBe("ready"); expect(s.player).toEqual(START);
    expect(s.shield).toBeGreaterThan(0);
  });
  test("spawn protection prevents life loss", () => {
    const s = createState(); s.status = "running"; s.ghosts = [{ x: 8, y: 14 }]; step(s); expect(s.lives).toBe(3);
  });
  test("last life ends the game", () => {
    const s = createState(1, 0, 1); s.status = "running"; s.shield = 0; s.ghosts = [{ x: 8, y: 14 }];
    step(s); expect(String(s.status)).toBe("lost"); expect(s.lives).toBe(0);
  });
  test("last pellet clears level and next level preserves score and lives", () => {
    const s = createState(1, 100, 2); s.status = "running"; s.pellets = new Set(["8,14"]);
    step(s); expect(String(s.status)).toBe("won");
    const next = nextLevel(s); expect(next.level).toBe(2); expect(next.score).toBe(110); expect(next.lives).toBe(2); expect(next.pellets.size).toBeGreaterThan(1);
    expect(nextLevel(next)).toBe(next);
  });
});
