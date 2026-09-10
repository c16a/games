import { describe, expect, test } from "bun:test";
import { applyEngineMove, ChessGame, describeMove, parseUci, restoreChessGame } from "./logic";

describe("Chess rules integration", () => {
  test("uses chess.js for legal moves and rejects illegal input", () => {
    const game = new ChessGame({ humanColor: "w", difficulty: "easy" });
    expect(game.legalMoves("e2").map((move) => move.to)).toEqual(["e3", "e4"]);
    expect(() => game.move("e2", "e5")).toThrow("Illegal move");
    expect(game.fen()).toStartWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP");
  });

  test("describes castling rook movement", () => {
    const game = new ChessGame({
      humanColor: "w",
      difficulty: "medium",
      startingFen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
    });
    const castle = game.move("e1", "g1");
    expect(castle.rookMove).toEqual({ from: "h1", to: "f1" });
    expect(castle.move.isKingsideCastle()).toBe(true);
  });

  test("identifies the off-destination pawn captured en passant", () => {
    const game = new ChessGame({ humanColor: "w", difficulty: "easy" });
    game.moveUci("e2e4");
    game.moveUci("a7a6");
    game.moveUci("e4e5");
    game.moveUci("d7d5");
    const capture = game.moveUci("e5d6");
    expect(capture.move.isEnPassant()).toBe(true);
    expect(capture.capturedSquare).toBe("d5");
  });

  test("requires an explicit promotion and preserves underpromotion", () => {
    const game = new ChessGame({ humanColor: "w", difficulty: "easy", startingFen: "7k/P7/8/8/8/8/8/7K w - - 0 1" });
    expect(() => game.move("a7", "a8")).toThrow("Illegal move");
    const promotion = game.move("a7", "a8", "n");
    expect(promotion.move.promotion).toBe("n");
    expect(game.piece("a8")?.type).toBe("n");
  });

  test("reports checkmate, stalemate, repetition, fifty-move, and insufficient material", () => {
    const mate = new ChessGame({ humanColor: "w", difficulty: "easy", moves: ["f2f3", "e7e5", "g2g4", "d8h4"] });
    expect(mate.outcome()).toBe("checkmate");

    const stalemate = new ChessGame({ humanColor: "b", difficulty: "easy", startingFen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1" });
    expect(stalemate.outcome()).toBe("stalemate");

    const repetition = new ChessGame({ humanColor: "w", difficulty: "easy", moves: ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"] });
    expect(repetition.outcome()).toBe("repetition");

    const fifty = new ChessGame({ humanColor: "w", difficulty: "easy", startingFen: "7k/8/8/8/8/8/R7/K7 w - - 100 75" });
    expect(fifty.outcome()).toBe("fifty-move");

    const material = new ChessGame({ humanColor: "w", difficulty: "easy", startingFen: "7k/8/8/8/8/8/8/K7 w - - 0 1" });
    expect(material.outcome()).toBe("insufficient-material");
  });
});

describe("Chess history, restore, and undo", () => {
  test("restores by replaying the complete UCI history, including promotion", () => {
    const original = new ChessGame({ humanColor: "w", difficulty: "hard", startingFen: "7k/P7/8/8/8/8/8/7K w - - 0 1", moves: ["a7a8n"] });
    const restored = restoreChessGame(original.save());
    expect(restored?.fen()).toBe(original.fen());
    expect(restored?.moveHistory()).toEqual(["a7a8n"]);
    expect(restored?.humanColor).toBe("w");
    expect(restored?.difficulty).toBe("hard");
  });

  test("replayed history retains threefold repetition state", () => {
    const original = new ChessGame({ humanColor: "w", difficulty: "medium", moves: ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"] });
    expect(restoreChessGame(original.save())?.outcome()).toBe("repetition");
  });

  test("undoes only a pending human move while AI is thinking", () => {
    const game = new ChessGame({ humanColor: "w", difficulty: "easy", moves: ["e2e4"] });
    expect(game.undoToHumanDecision(true)).toHaveLength(1);
    expect(game.moveHistory()).toEqual([]);
    expect(game.isHumanTurn()).toBe(true);
  });

  test("undoes the AI reply and preceding human move at a decision point", () => {
    const game = new ChessGame({ humanColor: "w", difficulty: "easy", moves: ["e2e4", "e7e5"] });
    expect(game.undoToHumanDecision(false)).toHaveLength(2);
    expect(game.moveHistory()).toEqual([]);
    expect(game.isHumanTurn()).toBe(true);
  });

  test("rejects malformed or illegal saves without throwing", () => {
    expect(restoreChessGame({ version: 1, startingFen: "bad", moves: [], humanColor: "w", difficulty: "easy" })).toBeNull();
    expect(restoreChessGame({ version: 1, startingFen: "8/8/8/8/8/8/8/8 w - - 0 1", moves: ["nope"], humanColor: "w", difficulty: "easy" })).toBeNull();
    expect(parseUci("e2e9")).toBeNull();
  });

  test("describes a normal capture on the destination square", () => {
    const game = new ChessGame({ humanColor: "w", difficulty: "easy", moves: ["e2e4", "d7d5"] });
    const move = game.legalMoves("e4").find((candidate) => candidate.to === "d5")!;
    expect(describeMove(move).capturedSquare).toBe("d5");
  });

  test("discards stale engine replies and validates current replies through chess.js", () => {
    const game = new ChessGame({ humanColor: "w", difficulty: "easy", moves: ["e2e4"] });
    const fen = game.fen();
    expect(applyEngineMove(game, { uci: "e7e5", generation: 4, positionFen: fen }, 5)).toBeNull();
    expect(applyEngineMove(game, { uci: "e7e5", generation: 5, positionFen: "stale fen" }, 5)).toBeNull();
    expect(() => applyEngineMove(game, { uci: "e7e4", generation: 5, positionFen: fen }, 5)).toThrow("Illegal move");
    expect(applyEngineMove(game, { uci: "e7e5", generation: 5, positionFen: fen }, 5)?.uci).toBe("e7e5");
  });
});
