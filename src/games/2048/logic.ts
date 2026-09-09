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

export interface TileMotion {
  from: number;
  to: number;
  value: number;
  merged: boolean;
}

export interface BoardMove {
  board: Board;
  moved: boolean;
  scoreGained: number;
  created2048: boolean;
  mergedIndices: number[];
  motions: TileMotion[];
}

export interface TurnResult {
  state: GameState;
  moved: boolean;
  scoreGained: number;
  created2048: boolean;
  mergedIndices: number[];
  motions: TileMotion[];
  spawnedIndex?: number;
}

function normalizedRandom(random: () => number): number {
  return Math.min(0.999999999, Math.max(0, random()));
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

  const next = Array<number>(BOARD_SIZE * BOARD_SIZE).fill(0);
  const mergedIndices: number[] = [];
  const motions: TileMotion[] = [];
  let scoreGained = 0;

  for (let line = 0; line < BOARD_SIZE; line += 1) {
    const indices = lineIndices(direction, line);
    const tiles = indices
      .map((index) => ({ from: index, value: board[index]! }))
      .filter(({ value }) => value !== 0);
    let targetOffset = 0;

    for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
      const tile = tiles[tileIndex]!;
      const nextTile = tiles[tileIndex + 1];
      const to = indices[targetOffset]!;

      if (nextTile && tile.value === nextTile.value) {
        const mergedValue = tile.value * 2;
        next[to] = mergedValue;
        scoreGained += mergedValue;
        mergedIndices.push(to);
        motions.push(
          { from: tile.from, to, value: tile.value, merged: true },
          { from: nextTile.from, to, value: nextTile.value, merged: true },
        );
        tileIndex += 1;
      } else {
        next[to] = tile.value;
        motions.push({ from: tile.from, to, value: tile.value, merged: false });
      }
      targetOffset += 1;
    }
  }

  const moved = next.some((value, index) => value !== board[index]);
  return {
    board: next,
    moved,
    scoreGained,
    created2048: !hasWinningTile(board) && hasWinningTile(next),
    mergedIndices,
    motions,
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
      motions: [],
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
    motions: move.motions,
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
