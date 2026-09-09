import { describe, expect, test } from "bun:test";
import {
  type Board,
  type GameState,
  canMove,
  createInitialState,
  hasWinningTile,
  moveBoard,
  spawnTile,
  takeTurn,
  undoTurn,
} from "./logic";

const board = (...rows: number[][]): Board => rows.flat();

describe("2048 movement", () => {
  test("slides tiles through empty cells", () => {
    const start = board(
      [0, 0, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    );
    expect(moveBoard(start, "left").board.slice(0, 4)).toEqual([2, 0, 0, 0]);
  });

  test("merges one pair and adds the merged value to the score", () => {
    const start = board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
    const result = moveBoard(start, "left");
    expect(result.board.slice(0, 4)).toEqual([4, 0, 0, 0]);
    expect(result.scoreGained).toBe(4);
  });

  test("merges multiple independent pairs", () => {
    const start = board([2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
    const result = moveBoard(start, "left");
    expect(result.board.slice(0, 4)).toEqual([4, 4, 0, 0]);
    expect(result.scoreGained).toBe(8);
  });

  test("does not merge a newly-created tile twice", () => {
    const start = board([2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
    expect(moveBoard(start, "left").board.slice(0, 4)).toEqual([4, 4, 0, 0]);
  });

  test("moves correctly in all four directions", () => {
    const start = board(
      [2, 0, 0, 2],
      [2, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    );
    expect(moveBoard(start, "left").board).toEqual(board([4, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(moveBoard(start, "right").board).toEqual(board([0, 0, 0, 4], [0, 0, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(moveBoard(start, "up").board).toEqual(board([4, 0, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(moveBoard(start, "down").board).toEqual(board([0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [4, 0, 0, 4]));
  });
});

describe("2048 turns", () => {
  test("starts with exactly two tiles", () => {
    const values = [0, 0.5, 0, 0.5];
    const state = createInitialState(() => values.shift() ?? 0.5);
    expect(state.board.filter((value) => value !== 0)).toEqual([2, 2]);
    expect(state.score).toBe(0);
  });

  test("does not spawn a tile or consume undo after an unchanged move", () => {
    const start: GameState = {
      board: board([2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]),
      score: 30,
      undo: { board: Array(16).fill(0), score: 10 },
    };
    let randomCalls = 0;
    const result = takeTurn(start, "left", () => { randomCalls += 1; return 0; });
    expect(result.moved).toBe(false);
    expect(result.state).toBe(start);
    expect(result.state.undo).toEqual(start.undo);
    expect(randomCalls).toBe(0);
  });

  test("spawns deterministically into an empty cell", () => {
    const start = board([2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
    const values = [0.5, 0.09];
    const spawned = spawnTile(start, () => values.shift() ?? 0);
    expect(spawned.filter((value) => value !== 0)).toEqual([2, 4]);
    expect(spawned[8]).toBe(4);
  });

  test("normally spawns a 2 but can occasionally spawn a 4", () => {
    const empty = Array<number>(16).fill(0);
    const twoValues = [0, 0.75];
    const fourValues = [0, 0.05];
    expect(spawnTile(empty, () => twoValues.shift() ?? 0)[0]).toBe(2);
    expect(spawnTile(empty, () => fourValues.shift() ?? 0)[0]).toBe(4);
  });

  test("detects playable and game-over boards", () => {
    const withSpace = board([2, 4, 8, 16], [32, 64, 128, 256], [512, 1024, 2, 4], [8, 16, 32, 0]);
    const withPair = board([2, 4, 8, 16], [32, 64, 128, 256], [512, 1024, 2, 4], [8, 16, 32, 32]);
    const over = board([2, 4, 8, 16], [32, 64, 128, 256], [512, 1024, 2, 4], [8, 16, 32, 64]);
    expect(canMove(withSpace)).toBe(true);
    expect(canMove(withPair)).toBe(true);
    expect(canMove(over)).toBe(false);
  });

  test("detects the first 2048 tile", () => {
    const start = board([1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
    const result = moveBoard(start, "left");
    expect(result.created2048).toBe(true);
    expect(hasWinningTile(result.board)).toBe(true);
    expect(moveBoard(result.board, "right").created2048).toBe(false);
  });

  test("undo restores the board and score and is consumed", () => {
    const start: GameState = {
      board: board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]),
      score: 12,
    };
    const moved = takeTurn(start, "left", () => 0.5).state;
    const restored = undoTurn(moved);
    expect(restored.board).toEqual(start.board);
    expect(restored.score).toBe(start.score);
    expect(restored.undo).toBeUndefined();
  });
});
