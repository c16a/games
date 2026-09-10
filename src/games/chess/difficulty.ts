import type { ChessDifficulty } from "./logic";

export interface DifficultyProfile {
  label: string;
  moveTimeMs: number;
  skillLevel: number;
  uciElo: number;
  multiPv: number;
}

export const DIFFICULTY_PROFILES: Record<ChessDifficulty, DifficultyProfile> = {
  easy: { label: "Easy", moveTimeMs: 300, skillLevel: 0, uciElo: 1320, multiPv: 4 },
  medium: { label: "Medium", moveTimeMs: 650, skillLevel: 5, uciElo: 1600, multiPv: 2 },
  hard: { label: "Hard", moveTimeMs: 1500, skillLevel: 12, uciElo: 2100, multiPv: 1 },
};

export function stableChoiceIndex(seed: string, candidateCount: number): number {
  if (candidateCount <= 1) return 0;
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const weights = candidateCount >= 4 ? [0, 1, 2, 3, 1, 2, 0, 2] : [0, 1, 0, 1];
  return Math.min(candidateCount - 1, weights[(hash >>> 0) % weights.length] ?? 0);
}
