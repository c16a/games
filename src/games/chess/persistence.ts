import type { SavedChessGame } from "./logic";
import { restoreChessGame } from "./logic";

const SAVE_KEY = "happy-arcade:chess:game:v1";

export interface ChessStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): ChessStorage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

export function saveGame(save: SavedChessGame, storage = browserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(storage = browserStorage()): SavedChessGame | null {
  try {
    if (!storage) return null;
    const value: unknown = JSON.parse(storage.getItem(SAVE_KEY) ?? "null");
    return restoreChessGame(value)?.save() ?? null;
  } catch {
    return null;
  }
}

export function clearSavedGame(storage = browserStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // Storage is optional.
  }
}
