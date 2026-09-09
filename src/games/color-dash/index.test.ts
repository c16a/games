import { describe, expect, test } from "bun:test";
import { createChallenge, pointsForAnswer } from "./index";

describe("Color Dash", () => {
  test("always makes the word and ink colors different", () => {
    for (let inkSeed = 0; inkSeed < 6; inkSeed += 1) {
      for (let wordSeed = 0; wordSeed < 6; wordSeed += 1) {
        const values = [inkSeed / 6, wordSeed / 6];
        const challenge = createChallenge(() => values.shift() ?? 0);
        expect(challenge.word.id).not.toBe(challenge.ink.id);
      }
    }
  });

  test("does not repeat the previous ink color", () => {
    const challenge = createChallenge(() => 0, "red");
    expect(challenge.ink.id).not.toBe("red");
  });

  test("rewards faster answers and longer streaks", () => {
    expect(pointsForAnswer(300, 0)).toBeGreaterThan(pointsForAnswer(2_000, 0));
    expect(pointsForAnswer(500, 5)).toBeGreaterThan(pointsForAnswer(500, 0));
  });

  test("keeps every correct answer worth at least 100 points", () => {
    expect(pointsForAnswer(60_000, 0)).toBe(100);
  });
});
