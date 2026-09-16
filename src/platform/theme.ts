export type Theme = "light" | "dark";

export const themeStorageKey = "happy-arcade-theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function resolveTheme(storedTheme: unknown, prefersDark: boolean): Theme {
  return isTheme(storedTheme) ? storedTheme : prefersDark ? "dark" : "light";
}

export function oppositeTheme(theme: Theme): Theme {
  return theme === "light" ? "dark" : "light";
}

export function readStoredTheme(storage: Pick<Storage, "getItem">): Theme | undefined {
  try {
    const storedTheme = storage.getItem(themeStorageKey);
    return isTheme(storedTheme) ? storedTheme : undefined;
  } catch {
    return undefined;
  }
}

export function storeTheme(theme: Theme, storage: Pick<Storage, "setItem">): void {
  try {
    storage.setItem(themeStorageKey, theme);
  } catch {
    // The selected theme still applies for this visit when storage is unavailable.
  }
}
