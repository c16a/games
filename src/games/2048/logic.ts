export const BOARD_SIZE = 4;
export const WINNING_TILE = 2048;

export type Board = number[];
export type Direction = "left" | "right" | "up" | "down";

export interface Snapshot {
  board: Board;
  score: number;
}

export interface GameState extends Snapshot {
  undo?: Snapshot;
}

export interface BoardMove {
  board: Board;
  moved: boolean;
  scoreGained: number;
  created2048: boolean;
  mergedIndices: number[];
}

export interface TurnResult {
  state: GameState;
  moved: boolean;
  scoreGained: number;
  created2048: boolean;
  mergedIndices: number[];
  spawnedIndex?: number;
}

function normalizedRandom(random: () => number): number {
  return Math.min(0.999999999, Math.max(0, random()));
}

function collapseLine(line: number[]): { values: number[]; score: number; mergedOffsets: number[] } {
  const tiles = line.filter((value) => value !== 0);
  const values: number[] = [];
  const mergedOffsets: number[] = [];
  let score = 0;

  for (let index = 0; index < tiles.length; index += 1) {
    const value = tiles[index]!;
    if (value === tiles[index + 1]) {
      const merged = value * 2;
      mergedOffsets.push(values.length);
      values.push(merged);
      score += merged;
      index += 1;
    } else {
      values.push(value);
    }
  }

  while (values.length < BOARD_SIZE) values.push(0);
  return { values, score, mergedOffsets };
}

function lineIndices(direction: Direction, line: number): number[] {
  if (direction === "left") return Array.from({ length: BOARD_SIZE }, (_, column) => line * BOARD_SIZE + column);
  if (direction === "right") return Array.from({ length: BOARD_SIZE }, (_, column) => line * BOARD_SIZE + (BOARD_SIZE - 1 - column));
  if (direction === "up") return Array.from({ length: BOARD_SIZE }, (_, row) => row * BOARD_SIZE + line);
  return Array.from({ length: BOARD_SIZE }, (_, row) => (BOARD_SIZE - 1 - row) * BOARD_SIZE + line);
}

export function hasWinningTile(board: Board): boolean {
  return board.some((value) => value >= WINNING_TILE);
}

export function moveBoard(board: Board, direction: Direction): BoardMove {
  if (board.length !== BOARD_SIZE * BOARD_SIZE) throw new Error("A 2048 board must contain 16 cells");

  const next = [...board];
  const mergedIndices: number[] = [];
  let scoreGained = 0;

  for (let line = 0; line < BOARD_SIZE; line += 1) {
    const indices = lineIndices(direction, line);
    const collapsed = collapseLine(indices.map((index) => board[index]!));
    scoreGained += collapsed.score;
    collapsed.mergedOffsets.forEach((offset) => mergedIndices.push(indices[offset]!));
    indices.forEach((boardIndex, valueIndex) => {
      next[boardIndex] = collapsed.values[valueIndex]!;
    });
  }

  const moved = next.some((value, index) => value !== board[index]);
  return {
    board: next,
    moved,
    scoreGained,
    created2048: !hasWinningTile(board) && hasWinningTile(next),
    mergedIndices,
  };
}

export function spawnTile(board: Board, random: () => number = Math.random): Board {
  const emptyCells = board
    .map((value, index) => value === 0 ? index : -1)
    .filter((index) => index >= 0);
  if (emptyCells.length === 0) return [...board];

  const next = [...board];
  const emptyIndex = Math.floor(normalizedRandom(random) * emptyCells.length);
  const boardIndex = emptyCells[emptyIndex]!;
  next[boardIndex] = normalizedRandom(random) < 0.1 ? 4 : 2;
  return next;
}

export function createInitialState(random: () => number = Math.random): GameState {
  const empty = Array<number>(BOARD_SIZE * BOARD_SIZE).fill(0);
  return { board: spawnTile(spawnTile(empty, random), random), score: 0 };
}

export function takeTurn(
  state: GameState,
  direction: Direction,
  random: () => number = Math.random,
): TurnResult {
  const move = moveBoard(state.board, direction);
  if (!move.moved) {
    return {
      state,
      moved: false,
      scoreGained: 0,
      created2048: false,
      mergedIndices: [],
    };
  }

  const boardWithNewTile = spawnTile(move.board, random);
  const spawnedIndex = boardWithNewTile.findIndex((value, index) => value !== move.board[index]);

  return {
    state: {
      board: boardWithNewTile,
      score: state.score + move.scoreGained,
      undo: { board: [...state.board], score: state.score },
    },
    moved: true,
    scoreGained: move.scoreGained,
    created2048: move.created2048,
    mergedIndices: move.mergedIndices,
    spawnedIndex: spawnedIndex >= 0 ? spawnedIndex : undefined,
  };
}

export function undoTurn(state: GameState): GameState {
  if (!state.undo) return state;
  return { board: [...state.undo.board], score: state.undo.score };
}

export function canMove(board: Board): boolean {
  if (board.some((value) => value === 0)) return true;

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      const index = row * BOARD_SIZE + column;
      const value = board[index];
      if (column < BOARD_SIZE - 1 && value === board[index + 1]) return true;
      if (row < BOARD_SIZE - 1 && value === board[index + BOARD_SIZE]) return true;
    }
  }
  return false;
}
