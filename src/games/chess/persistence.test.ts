import { describe, expect, test } from "bun:test";
import { ChessGame } from "./logic";
import { clearSavedGame, loadGame, saveGame, type ChessStorage } from "./persistence";

class MemoryStorage implements ChessStorage {
  value: string | null = null;
  getItem(): string | null { return this.value; }
  setItem(_key: string, value: string): void { this.value = value; }
  removeItem(): void { this.value = null; }
}

describe("Chess local persistence", () => {
  test("round-trips the starting position, move history, side, and difficulty", () => {
    const storage = new MemoryStorage();
    const game = new ChessGame({ humanColor: "b", difficulty: "hard", moves: ["e2e4", "e7e5", "g1f3"] });
    expect(saveGame(game.save(), storage)).toBe(true);
    expect(loadGame(storage)).toEqual(game.save());
    clearSavedGame(storage);
    expect(loadGame(storage)).toBeNull();
  });

  test("handles unavailable storage and invalid saves without throwing", () => {
    const game = new ChessGame({ humanColor: "w", difficulty: "easy" });
    const unavailable: ChessStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(saveGame(game.save(), unavailable)).toBe(false);
    expect(loadGame(unavailable)).toBeNull();
    expect(() => clearSavedGame(unavailable)).not.toThrow();

    const invalid = new MemoryStorage();
    invalid.value = "not json";
    expect(loadGame(invalid)).toBeNull();
  });
});
