import { describe, expect, test } from "bun:test";
import { scoreGuess } from "./index";

describe("Mastermind scoring", () => {
  test("counts exact and misplaced colors", () => {
    expect(scoreGuess([0, 1, 2, 3], [0, 2, 1, 5])).toEqual({ exact: 1, colorOnly: 2 });
  });

  test("does not count duplicate colors twice", () => {
    expect(scoreGuess([0, 0, 2, 2], [0, 0, 0, 2])).toEqual({ exact: 3, colorOnly: 0 });
  });

  test("counts a fully correct code", () => {
    expect(scoreGuess([4, 3, 2, 1], [4, 3, 2, 1])).toEqual({ exact: 4, colorOnly: 0 });
  });
});
