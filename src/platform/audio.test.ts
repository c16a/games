import { describe, expect, test } from "bun:test";
import { loadSoundsEnabled, saveSoundsEnabled } from "./audio";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem() {
      return value;
    },
    setItem(_key: string, next: string) {
      value = next;
    },
  };
}

describe("sound preference", () => {
  test("enables sounds by default", () => {
    expect(loadSoundsEnabled(memoryStorage())).toBe(true);
    expect(loadSoundsEnabled(null)).toBe(true);
  });

  test("loads and saves the muted preference", () => {
    const storage = memoryStorage();
    saveSoundsEnabled(false, storage);
    expect(loadSoundsEnabled(storage)).toBe(false);
    saveSoundsEnabled(true, storage);
    expect(loadSoundsEnabled(storage)).toBe(true);
  });

  test("falls back to enabled when storage is unavailable", () => {
    const unavailable = {
      getItem() {
        throw new Error("Storage unavailable");
      },
      setItem() {
        throw new Error("Storage unavailable");
      },
    };

    expect(loadSoundsEnabled(unavailable)).toBe(true);
    expect(() => saveSoundsEnabled(false, unavailable)).not.toThrow();
  });
});
