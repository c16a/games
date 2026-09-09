export const BOARD_COLUMNS = 10;
export const BOARD_ROWS = 20;

export type Tetromino = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type TetrisStatus = "ready" | "running" | "paused" | "lost";
export type Board = Array<Tetromino | null>;

export interface Cell {
  x: number;
  y: number;
}

export interface ActivePiece {
  kind: Tetromino;
  rotation: number;
  x: number;
  y: number;
}

export interface TetrisState {
  board: Board;
  active: ActivePiece;
  next: Tetromino;
  bag: Tetromino[];
  score: number;
  lines: number;
  level: number;
  status: TetrisStatus;
  dropElapsedMs: number;
  clearedRows: number[];
}

export const TETROMINOES: readonly Tetromino[] = ["I", "O", "T", "S", "Z", "J", "L"];

const SHAPES: Record<Tetromino, readonly (readonly Cell[])[]> = {
  I: [
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
    [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
    [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }],
  ],
  O: Array.from({ length: 4 }, () => [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }]),
  T: [
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
  ],
  S: [
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
  ],
  Z: [
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }],
  ],
  J: [
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
  ],
  L: [
    [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
  ],
};

function normalizedRandom(random: () => number): number {
  return Math.min(0.999999999, Math.max(0, random()));
}

export function shuffledBag(random: () => number = Math.random): Tetromino[] {
  const bag = [...TETROMINOES];
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const target = Math.floor(normalizedRandom(random) * (index + 1));
    [bag[index], bag[target]] = [bag[target]!, bag[index]!];
  }
  return bag;
}

function takeKind(bag: readonly Tetromino[], random: () => number): { kind: Tetromino; bag: Tetromino[] } {
  const available = bag.length === 0 ? shuffledBag(random) : [...bag];
  return { kind: available[0]!, bag: available.slice(1) };
}

export function cellsFor(piece: ActivePiece): Cell[] {
  return SHAPES[piece.kind][piece.rotation % 4]!.map((cell) => ({ x: piece.x + cell.x, y: piece.y + cell.y }));
}

export function canPlace(board: Board, piece: ActivePiece): boolean {
  return cellsFor(piece).every(({ x, y }) => x >= 0 && x < BOARD_COLUMNS && y >= 0 && y < BOARD_ROWS && board[y * BOARD_COLUMNS + x] === null);
}

export function dropInterval(level: number): number {
  return Math.max(100, 800 - (Math.max(1, level) - 1) * 65);
}

export function createInitialState(random: () => number = Math.random): TetrisState {
  let bag = shuffledBag(random);
  const first = takeKind(bag, random);
  bag = first.bag;
  const second = takeKind(bag, random);
  return {
    board: Array<Tetromino | null>(BOARD_COLUMNS * BOARD_ROWS).fill(null),
    active: { kind: first.kind, rotation: 0, x: 3, y: 0 },
    next: second.kind,
    bag: second.bag,
    score: 0,
    lines: 0,
    level: 1,
    status: "ready",
    dropElapsedMs: 0,
    clearedRows: [],
  };
}

export function startGame(state: TetrisState): TetrisState {
  return state.status === "ready" ? { ...state, status: "running", dropElapsedMs: 0 } : state;
}

export function movePiece(state: TetrisState, deltaX: number): TetrisState {
  if (state.status !== "running") return state;
  const active = { ...state.active, x: state.active.x + deltaX };
  return canPlace(state.board, active) ? { ...state, active, clearedRows: [] } : state;
}

export function rotatePiece(state: TetrisState): TetrisState {
  if (state.status !== "running") return state;
  const rotation = (state.active.rotation + 1) % 4;
  for (const kick of [0, -1, 1, -2, 2]) {
    const active = { ...state.active, rotation, x: state.active.x + kick };
    if (canPlace(state.board, active)) return { ...state, active, clearedRows: [] };
  }
  return state;
}

export function ghostY(state: TetrisState): number {
  let y = state.active.y;
  while (canPlace(state.board, { ...state.active, y: y + 1 })) y += 1;
  return y;
}

function lineScore(rows: number, level: number): number {
  return ([0, 100, 300, 500, 800][rows] ?? 0) * level;
}

export function lockPiece(state: TetrisState, random: () => number = Math.random): TetrisState {
  if (state.status !== "running") return state;
  const board = [...state.board];
  for (const { x, y } of cellsFor(state.active)) board[y * BOARD_COLUMNS + x] = state.active.kind;

  const clearedRows: number[] = [];
  const remainingRows: Array<Array<Tetromino | null>> = [];
  for (let y = 0; y < BOARD_ROWS; y += 1) {
    const row = board.slice(y * BOARD_COLUMNS, (y + 1) * BOARD_COLUMNS);
    if (row.every((cell) => cell !== null)) clearedRows.push(y);
    else remainingRows.push(row);
  }
  const emptyRows = Array.from({ length: clearedRows.length }, () => Array<Tetromino | null>(BOARD_COLUMNS).fill(null));
  const clearedBoard = [...emptyRows, ...remainingRows].flat();
  const lines = state.lines + clearedRows.length;
  const level = Math.floor(lines / 10) + 1;
  const draw = takeKind(state.bag, random);
  const active: ActivePiece = { kind: state.next, rotation: 0, x: 3, y: 0 };
  const nextState: TetrisState = {
    ...state,
    board: clearedBoard,
    active,
    next: draw.kind,
    bag: draw.bag,
    score: state.score + lineScore(clearedRows.length, state.level),
    lines,
    level,
    dropElapsedMs: 0,
    clearedRows,
  };
  return canPlace(clearedBoard, active) ? nextState : { ...nextState, status: "lost" };
}

export function softDrop(state: TetrisState, random: () => number = Math.random): TetrisState {
  if (state.status !== "running") return state;
  const active = { ...state.active, y: state.active.y + 1 };
  return canPlace(state.board, active)
    ? { ...state, active, score: state.score + 1, dropElapsedMs: 0, clearedRows: [] }
    : lockPiece(state, random);
}

export function hardDrop(state: TetrisState, random: () => number = Math.random): TetrisState {
  if (state.status !== "running") return state;
  const y = ghostY(state);
  const distance = y - state.active.y;
  return lockPiece({ ...state, active: { ...state.active, y }, score: state.score + distance * 2 }, random);
}

function gravityStep(state: TetrisState, random: () => number): TetrisState {
  const active = { ...state.active, y: state.active.y + 1 };
  return canPlace(state.board, active) ? { ...state, active, clearedRows: [] } : lockPiece(state, random);
}

export function advanceGame(state: TetrisState, elapsedMs: number, random: () => number = Math.random): TetrisState {
  if (state.status !== "running" || elapsedMs <= 0) return state;
  let next = { ...state, dropElapsedMs: state.dropElapsedMs + elapsedMs };
  while (next.status === "running" && next.dropElapsedMs >= dropInterval(next.level)) {
    const remainder = next.dropElapsedMs - dropInterval(next.level);
    next = { ...gravityStep(next, random), dropElapsedMs: remainder };
  }
  return next;
}

export function pauseGame(state: TetrisState): TetrisState {
  return state.status === "running" ? { ...state, status: "paused", dropElapsedMs: 0 } : state;
}

export function resumeGame(state: TetrisState): TetrisState {
  return state.status === "paused" ? { ...state, status: "running", dropElapsedMs: 0 } : state;
}

export function restartGame(random: () => number = Math.random): TetrisState {
  return createInitialState(random);
}
