export interface SeededRandom {
  next: () => number;
  state: () => number;
}

export function normalizeSeed(seed: number): number {
  const normalized = Math.floor(Math.abs(seed)) >>> 0;
  return normalized || 0x6d2b79f5;
}

export function createSeededRandom(seed: number): SeededRandom {
  let value = normalizeSeed(seed);
  return {
    next(): number {
      value = (value + 0x6d2b79f5) >>> 0;
      let mixed = value;
      mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
      return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
    },
    state: () => value,
  };
}

export function pick<T>(values: readonly T[], random: SeededRandom): T {
  if (values.length === 0) throw new Error("Cannot pick from an empty collection");
  return values[Math.floor(random.next() * values.length)]!;
}
