import { describe, expect, test } from "bun:test";
import {
  isTheme,
  oppositeTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  themeStorageKey,
} from "./theme";

describe("theme preferences", () => {
  test("uses a saved preference before the system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("defaults to the current system preference", () => {
    expect(resolveTheme(undefined, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  test("only accepts supported theme names", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(false);
  });

  test("returns the other explicit theme", () => {
    expect(oppositeTheme("light")).toBe("dark");
    expect(oppositeTheme("dark")).toBe("light");
  });

  test("reads, writes, and tolerates unavailable storage", () => {
    let storedValue: string | null = null;
    const storage = {
      getItem: () => storedValue,
      setItem: (key: string, value: string) => {
        expect(key).toBe(themeStorageKey);
        storedValue = value;
      },
    };

    expect(readStoredTheme(storage)).toBeUndefined();
    storeTheme("dark", storage);
    expect(readStoredTheme(storage)).toBe("dark");
    expect(readStoredTheme({ getItem: () => "sepia" })).toBeUndefined();
    expect(readStoredTheme({ getItem: () => { throw new Error("blocked"); } })).toBeUndefined();
    expect(() => storeTheme("light", { setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });
});
