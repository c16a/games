import { describe, expect, test } from "bun:test";
import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  TETROMINOES,
  type Tetromino,
  type TetrisState,
  advanceGame,
  canPlace,
  cellsFor,
  createInitialState,
  dropInterval,
  ghostY,
  hardDrop,
  movePiece,
  pauseGame,
  restartGame,
  resumeGame,
  rotatePiece,
  shuffledBag,
  softDrop,
  startGame,
} from "./logic";

function running(overrides: Partial<TetrisState> = {}): TetrisState {
  return { ...startGame(createInitialState(() => 0)), ...overrides };
}

describe("Tetris pieces", () => {
  test("a bag contains every tetromino exactly once", () => {
    const bag = shuffledBag(() => 0.4);
    expect(bag).toHaveLength(7);
    expect([...bag].sort()).toEqual([...TETROMINOES].sort());
  });

  test("starts on an empty 10 by 20 board with active and next pieces", () => {
    const state = createInitialState(() => 0);
    expect(state.board).toHaveLength(BOARD_COLUMNS * BOARD_ROWS);
    expect(state.board.every((cell) => cell === null)).toBe(true);
    expect(cellsFor(state.active)).toHaveLength(4);
    expect(TETROMINOES).toContain(state.next);
    expect(state.status).toBe("ready");
  });

  test("moves within walls and rejects movement outside them", () => {
    let state = running({ active: { kind: "O", rotation: 0, x: 3, y: 0 } });
    state = movePiece(state, -1);
    expect(state.active.x).toBe(2);
    for (let index = 0; index < 8; index += 1) state = movePiece(state, -1);
    expect(Math.min(...cellsFor(state.active).map(({ x }) => x))).toBe(0);
    expect(movePiece(state, -1)).toBe(state);
  });

  test("rotates clockwise and uses a small wall kick", () => {
    let state = running({ active: { kind: "I", rotation: 1, x: -2, y: 2 } });
    expect(canPlace(state.board, state.active)).toBe(true);
    state = rotatePiece(state);
    expect(state.active.rotation).toBe(2);
    expect(Math.min(...cellsFor(state.active).map(({ x }) => x))).toBeGreaterThanOrEqual(0);
  });

  test("computes the ghost landing row", () => {
    const state = running({ active: { kind: "O", rotation: 0, x: 3, y: 0 } });
    expect(ghostY(state)).toBe(18);
  });
});

describe("Tetris scoring and locking", () => {
  test("soft drop moves one row and hard drop locks with distance points", () => {
    let state = running({ active: { kind: "O", rotation: 0, x: 3, y: 0 }, score: 0 });
    state = softDrop(state, () => 0);
    expect(state.active.y).toBe(1);
    expect(state.score).toBe(1);
    const dropped = hardDrop(state, () => 0);
    expect(dropped.board.filter(Boolean)).toHaveLength(4);
    expect(dropped.score).toBe(35);
    expect(dropped.active.kind).toBe(state.next);
  });

  test("clears lines, scores, and advances a level every ten lines", () => {
    const board = Array<Tetromino | null>(BOARD_COLUMNS * BOARD_ROWS).fill(null);
    for (let x = 0; x < 8; x += 1) board[(BOARD_ROWS - 1) * BOARD_COLUMNS + x] = "J";
    const state = running({
      board,
      active: { kind: "O", rotation: 0, x: 7, y: 18 },
      lines: 9,
      level: 1,
      score: 0,
    });
    const cleared = hardDrop(state, () => 0);
    expect(cleared.clearedRows).toEqual([19]);
    expect(cleared.lines).toBe(10);
    expect(cleared.level).toBe(2);
    expect(cleared.score).toBe(100);
  });

  test("ends when the next piece cannot spawn", () => {
    const board = Array<Tetromino | null>(BOARD_COLUMNS * BOARD_ROWS).fill(null);
    board[4] = "Z";
    board[5] = "Z";
    const state = running({ board, active: { kind: "O", rotation: 0, x: 3, y: 18 }, next: "O" });
    expect(hardDrop(state, () => 0).status).toBe("lost");
  });
});

describe("Tetris timing and lifecycle", () => {
  test("gravity uses level speed and preserves partial elapsed time", () => {
    expect(dropInterval(2)).toBeLessThan(dropInterval(1));
    expect(dropInterval(99)).toBe(100);
    let state = running();
    state = advanceGame(state, 799, () => 0);
    expect(state.active.y).toBe(0);
    state = advanceGame(state, 1, () => 0);
    expect(state.active.y).toBe(1);
    state = advanceGame(state, 810, () => 0);
    expect(state.active.y).toBe(2);
    expect(state.dropElapsedMs).toBe(10);
  });

  test("pause freezes and resume discards catch-up time", () => {
    const partial = advanceGame(running(), 500);
    const paused = pauseGame(partial);
    expect(paused.dropElapsedMs).toBe(0);
    expect(advanceGame(paused, 10_000)).toBe(paused);
    const resumed = resumeGame(paused);
    expect(advanceGame(resumed, 799).active.y).toBe(0);
  });

  test("restart resets board, score, level, lines, timing, and status", () => {
    const reset = restartGame(() => 0);
    expect(reset.board.every((cell) => cell === null)).toBe(true);
    expect(reset.score).toBe(0);
    expect(reset.lines).toBe(0);
    expect(reset.level).toBe(1);
    expect(reset.dropElapsedMs).toBe(0);
    expect(reset.status).toBe("ready");
  });
});
