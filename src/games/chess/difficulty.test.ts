import { describe, expect, test } from "bun:test";
import { DIFFICULTY_PROFILES, stableChoiceIndex } from "./difficulty";

describe("Chess computer difficulty", () => {
  test("keeps the agreed search budgets and strength settings centralized", () => {
    expect(DIFFICULTY_PROFILES.easy.moveTimeMs).toBe(300);
    expect(DIFFICULTY_PROFILES.medium.moveTimeMs).toBe(650);
    expect(DIFFICULTY_PROFILES.hard.moveTimeMs).toBe(1500);
    expect(DIFFICULTY_PROFILES.easy.skillLevel).toBeLessThan(DIFFICULTY_PROFILES.medium.skillLevel);
    expect(DIFFICULTY_PROFILES.medium.skillLevel).toBeLessThan(DIFFICULTY_PROFILES.hard.skillLevel);
    expect(DIFFICULTY_PROFILES.easy.multiPv).toBe(4);
  });

  test("makes controlled Easy candidate choices reproducible and bounded", () => {
    const first = stableChoiceIndex("same position", 4);
    expect(stableChoiceIndex("same position", 4)).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(4);
    expect(stableChoiceIndex("anything", 1)).toBe(0);
  });
});
