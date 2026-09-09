import { describe, expect, test } from "bun:test";
import { canMove, createTowers, findNextMove, minimumMoves, moveDisc } from "./index";

describe("Tower Tangle rules", () => {
  test("allows only a smaller disk onto a larger disk", () => {
    const towers = createTowers(3);
    expect(moveDisc(towers, { from: 0, to: 1 })).toBe(true);
    expect(canMove(towers, 0, 1)).toBe(false);
    expect(towers).toEqual([[3, 2], [1], []]);
  });

  test("uses the exact Tower of Hanoi minimum", () => {
    expect(minimumMoves(3)).toBe(7);
    expect(minimumMoves(4)).toBe(15);
    expect(minimumMoves(5)).toBe(31);
  });

  test("hints lead to a complete solution", () => {
    const towers = createTowers(4);
    let moves = 0;
    while (towers[2]!.length < 4 && moves < 20) {
      const nextMove = findNextMove(towers, 4);
      expect(nextMove).toBeDefined();
      expect(moveDisc(towers, nextMove!)).toBe(true);
      moves += 1;
    }
    expect(towers[2]).toEqual([4, 3, 2, 1]);
    expect(moves).toBe(15);
  });
});
