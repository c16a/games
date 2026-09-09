import { describe, expect, test } from "bun:test";
import { affectedCells, applyMove, generatePuzzle } from "./index";

describe("Glow Grid", () => {
  test("a corner changes itself and two neighbors", () => {
    expect(affectedCells(3, 0).sort()).toEqual([0, 1, 3]);
  });

  test("a center changes itself and four neighbors", () => {
    expect(affectedCells(3, 4).sort()).toEqual([1, 3, 4, 5, 7]);
  });

  test("pressing the same light twice restores the board", () => {
    const board = Array<boolean>(9).fill(false);
    applyMove(board, 3, 4);
    applyMove(board, 3, 4);
    expect(board.every((cell) => !cell)).toBe(true);
  });

  test("generated puzzles always include a valid solution", () => {
    for (const size of [3, 4, 5]) {
      const puzzle = generatePuzzle(size);
      const solved = [...puzzle.board];
      puzzle.solution.forEach((shouldPress, index) => {
        if (shouldPress) applyMove(solved, size, index);
      });
      expect(puzzle.board.some(Boolean)).toBe(true);
      expect(solved.every((cell) => !cell)).toBe(true);
    }
  });
});
