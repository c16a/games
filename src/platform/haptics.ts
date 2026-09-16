export type VibrationPattern = number | number[];

interface VibrationTarget {
  vibrate?: (pattern: VibrationPattern) => boolean;
}

export function vibrate(
  pattern: VibrationPattern,
  target: VibrationTarget | null = typeof navigator === "undefined" ? null : navigator,
): boolean {
  if (typeof target?.vibrate !== "function") return false;

  try {
    return target.vibrate.call(target, pattern);
  } catch {
    return false;
  }
}
