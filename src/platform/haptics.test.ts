import { describe, expect, test } from "bun:test";
import { vibrate, type VibrationPattern } from "./haptics";

describe("vibrate", () => {
  test("passes the requested pattern to supported devices", () => {
    let received: VibrationPattern | undefined;

    expect(vibrate(50, {
      vibrate(pattern) {
        received = pattern;
        return true;
      },
    })).toBe(true);
    expect(received).toBe(50);
  });

  test("does nothing when vibration is unavailable", () => {
    expect(vibrate(50, null)).toBe(false);
    expect(vibrate(50, {})).toBe(false);
  });

  test("fails safely if the browser rejects the vibration", () => {
    expect(vibrate(50, {
      vibrate() {
        throw new Error("Vibration unavailable");
      },
    })).toBe(false);
  });
});
