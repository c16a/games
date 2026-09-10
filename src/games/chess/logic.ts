import {
  Chess,
  DEFAULT_POSITION,
  type Color,
  type Move,
  type Piece,
  type PieceSymbol,
  type Square,
} from "chess.js";

export type ChessDifficulty = "easy" | "medium" | "hard";
export type SideChoice = Color | "random";
export type ChessOutcome =
  | "checkmate"
  | "stalemate"
  | "repetition"
  | "fifty-move"
  | "insufficient-material"
  | "draw"
  | null;

export interface SavedChessGame {
  version: 1;
  startingFen: string;
  moves: string[];
  humanColor: Color;
  difficulty: ChessDifficulty;
}

export interface AppliedMove {
  move: Move;
  uci: string;
  capturedSquare?: Square;
  rookMove?: { from: Square; to: Square };
}

export const ALL_SQUARES: readonly Square[] = [
  "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8",
  "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7",
  "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6",
  "a5", "b5", "c5", "d5", "e5", "f5", "g5", "h5",
  "a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4",
  "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3",
  "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2",
  "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1",
];

export function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

export function moveToUci(move: Pick<Move, "from" | "to" | "promotion">): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export function parseUci(uci: string): { from: Square; to: Square; promotion?: PieceSymbol } | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    ...(uci.length === 5 ? { promotion: uci[4] as PieceSymbol } : {}),
  };
}

function capturedSquareFor(move: Move): Square | undefined {
  if (move.isEnPassant()) return `${move.to[0]}${move.color === "w" ? "5" : "4"}` as Square;
  return move.isCapture() ? move.to : undefined;
}

function rookMoveFor(move: Move): AppliedMove["rookMove"] {
  if (move.isKingsideCastle()) {
    return move.color === "w" ? { from: "h1", to: "f1" } : { from: "h8", to: "f8" };
  }
  if (move.isQueensideCastle()) {
    return move.color === "w" ? { from: "a1", to: "d1" } : { from: "a8", to: "d8" };
  }
  return undefined;
}

export function describeMove(move: Move): AppliedMove {
  return {
    move,
    uci: moveToUci(move),
    capturedSquare: capturedSquareFor(move),
    rookMove: rookMoveFor(move),
  };
}

export class ChessGame {
  readonly startingFen: string;
  readonly humanColor: Color;
  readonly difficulty: ChessDifficulty;
  private readonly chess: Chess;

  constructor(options: {
    humanColor: Color;
    difficulty: ChessDifficulty;
    startingFen?: string;
    moves?: readonly string[];
  }) {
    this.startingFen = options.startingFen ?? DEFAULT_POSITION;
    this.humanColor = options.humanColor;
    this.difficulty = options.difficulty;
    this.chess = new Chess(this.startingFen);
    for (const uci of options.moves ?? []) {
      const parsed = parseUci(uci);
      if (!parsed) throw new Error("Invalid saved move");
      this.chess.move(parsed);
    }
  }

  fen(): string {
    return this.chess.fen();
  }

  turn(): Color {
    return this.chess.turn();
  }

  isHumanTurn(): boolean {
    return this.turn() === this.humanColor;
  }

  piece(square: Square): Piece | undefined {
    return this.chess.get(square);
  }

  board(): ReturnType<Chess["board"]> {
    return this.chess.board();
  }

  legalMoves(square?: Square): Move[] {
    return square
      ? this.chess.moves({ square, verbose: true })
      : this.chess.moves({ verbose: true });
  }

  move(from: Square, to: Square, promotion?: PieceSymbol): AppliedMove {
    const legal = this.legalMoves(from).find((candidate) => (
      candidate.to === to && (candidate.promotion ?? promotion) === promotion
    ));
    if (!legal) throw new Error("Illegal move");
    return describeMove(this.chess.move({ from, to, promotion }));
  }

  moveUci(uci: string): AppliedMove {
    const parsed = parseUci(uci);
    if (!parsed) throw new Error("Invalid UCI move");
    return this.move(parsed.from, parsed.to, parsed.promotion);
  }

  undoToHumanDecision(aiPending: boolean): AppliedMove[] {
    const undone: AppliedMove[] = [];
    const first = this.chess.undo();
    if (!first) return undone;
    undone.push(describeMove(first));
    if (!aiPending && this.turn() !== this.humanColor) {
      const second = this.chess.undo();
      if (second) undone.push(describeMove(second));
    }
    return undone;
  }

  history(): Move[] {
    return this.chess.history({ verbose: true });
  }

  moveHistory(): string[] {
    return this.history().map(moveToUci);
  }

  lastMove(): Move | undefined {
    return this.history().at(-1);
  }

  isCheck(): boolean {
    return this.chess.isCheck();
  }

  checkedKingSquare(): Square | undefined {
    if (!this.isCheck()) return undefined;
    return ALL_SQUARES.find((square) => {
      const piece = this.chess.get(square);
      return piece?.type === "k" && piece.color === this.turn();
    });
  }

  outcome(): ChessOutcome {
    if (this.chess.isCheckmate()) return "checkmate";
    if (this.chess.isStalemate()) return "stalemate";
    if (this.chess.isThreefoldRepetition()) return "repetition";
    if (this.chess.isDrawByFiftyMoves()) return "fifty-move";
    if (this.chess.isInsufficientMaterial()) return "insufficient-material";
    if (this.chess.isDraw()) return "draw";
    return null;
  }

  save(): SavedChessGame {
    return {
      version: 1,
      startingFen: this.startingFen,
      moves: this.moveHistory(),
      humanColor: this.humanColor,
      difficulty: this.difficulty,
    };
  }
}

export function restoreChessGame(value: unknown): ChessGame | null {
  if (!value || typeof value !== "object") return null;
  const save = value as Partial<SavedChessGame>;
  if (
    save.version !== 1
    || typeof save.startingFen !== "string"
    || !Array.isArray(save.moves)
    || !save.moves.every((move) => typeof move === "string")
    || (save.humanColor !== "w" && save.humanColor !== "b")
    || (save.difficulty !== "easy" && save.difficulty !== "medium" && save.difficulty !== "hard")
  ) return null;
  try {
    return new ChessGame({
      startingFen: save.startingFen,
      moves: save.moves,
      humanColor: save.humanColor,
      difficulty: save.difficulty,
    });
  } catch {
    return null;
  }
}

export function applyEngineMove(
  game: ChessGame,
  response: { uci: string; generation: number; positionFen: string },
  currentGeneration: number,
): AppliedMove | null {
  if (response.generation !== currentGeneration || response.positionFen !== game.fen() || game.isHumanTurn()) return null;
  return game.moveUci(response.uci);
}
