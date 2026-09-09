import { describe, expect, test } from "bun:test";
import {
  LANDER_HALF_HEIGHT,
  SAFE_VERTICAL_SPEED,
  type FlightControls,
  type LanderState,
  createInitialState,
  generateTerrain,
  gravityForLevel,
  nextLevel,
  pauseFlight,
  restartFlight,
  resumeFlight,
  startFlight,
  terrainHeightAt,
  updateFlight,
} from "./logic";

const idle: FlightControls = { rotateLeft: false, rotateRight: false, thrust: false };

function running(overrides: Partial<LanderState> = {}): LanderState {
  return { ...startFlight(createInitialState(() => 0.5)), ...overrides };
}

describe("Lunar Lander terrain", () => {
  test("generates a flat landing pad and narrows it on later levels", () => {
    const first = generateTerrain(1, () => 0.5);
    const later = generateTerrain(6, () => 0.5);
    expect(terrainHeightAt(first, first.pad.x1)).toBeCloseTo(first.pad.y);
    expect(terrainHeightAt(first, (first.pad.x1 + first.pad.x2) / 2)).toBeCloseTo(first.pad.y);
    expect(later.pad.x2 - later.pad.x1).toBeLessThan(first.pad.x2 - first.pad.x1);
    expect(gravityForLevel(4)).toBeGreaterThan(gravityForLevel(1));
  });
});

describe("Lunar Lander flight", () => {
  test("gravity accelerates the lander downward", () => {
    const state = running({ velocity: { x: 0, y: 0 } });
    const next = updateFlight(state, 0.5, idle);
    expect(next.velocity.y).toBeGreaterThan(0);
    expect(next.position.y).toBeGreaterThan(state.position.y);
  });

  test("thrust slows descent, burns fuel, and follows rotation", () => {
    const controls = { rotateLeft: false, rotateRight: true, thrust: true };
    const state = running({ velocity: { x: 0, y: 15 }, fuel: 100 });
    const next = updateFlight(state, 0.2, controls);
    expect(next.angle).toBeGreaterThan(0);
    expect(next.velocity.x).toBeGreaterThan(0);
    expect(next.velocity.y).toBeLessThan(state.velocity.y);
    expect(next.fuel).toBeLessThan(state.fuel);
  });

  test("cannot thrust with an empty tank", () => {
    const state = running({ velocity: { x: 0, y: 0 }, fuel: 0 });
    const next = updateFlight(state, 0.1, { ...idle, thrust: true });
    expect(next.thrusting).toBe(false);
    expect(next.velocity.y).toBeGreaterThan(0);
  });

  test("pause freezes flight and resume restores it", () => {
    const state = running();
    const paused = pauseFlight(state);
    expect(updateFlight(paused, 2, idle)).toBe(paused);
    expect(resumeFlight(paused).status).toBe("running");
  });
});

describe("Lunar Lander touchdown", () => {
  test("lands safely when centered, upright, and slow", () => {
    const base = running();
    const x = (base.terrain.pad.x1 + base.terrain.pad.x2) / 2;
    const state = running({
      terrain: base.terrain,
      position: { x, y: base.terrain.pad.y - LANDER_HALF_HEIGHT - 0.1 },
      velocity: { x: 2, y: 8 },
      angle: 3,
    });
    const landed = updateFlight(state, 0.05, idle);
    expect(landed.status).toBe("landed");
    expect(landed.score).toBeGreaterThan(0);
    expect(landed.velocity).toEqual({ x: 0, y: 0 });
  });

  test("crashes when touchdown is too fast", () => {
    const base = running();
    const x = (base.terrain.pad.x1 + base.terrain.pad.x2) / 2;
    const state = running({
      terrain: base.terrain,
      position: { x, y: base.terrain.pad.y - LANDER_HALF_HEIGHT - 0.1 },
      velocity: { x: 0, y: SAFE_VERTICAL_SPEED + 10 },
    });
    expect(updateFlight(state, 0.05, idle).status).toBe("crashed");
  });

  test("crashes when touchdown is too tilted or moving sideways", () => {
    const base = running();
    const x = (base.terrain.pad.x1 + base.terrain.pad.x2) / 2;
    const nearSurface = { x, y: base.terrain.pad.y - LANDER_HALF_HEIGHT - 0.1 };
    const tilted = running({ terrain: base.terrain, position: nearSurface, velocity: { x: 0, y: 5 }, angle: 24 });
    const sliding = running({ terrain: base.terrain, position: nearSurface, velocity: { x: 30, y: 5 }, angle: 0 });
    expect(updateFlight(tilted, 0.05, idle).status).toBe("crashed");
    expect(updateFlight(sliding, 0.05, idle).status).toBe("crashed");
  });

  test("crashes when touching down away from the pad", () => {
    const base = running();
    const x = 40;
    const ground = terrainHeightAt(base.terrain, x);
    const state = running({
      terrain: base.terrain,
      position: { x, y: ground - LANDER_HALF_HEIGHT - 0.1 },
      velocity: { x: 0, y: 5 },
    });
    expect(updateFlight(state, 0.05, idle).status).toBe("crashed");
  });

  test("advances after landing while preserving score", () => {
    const landed = running({ status: "landed", score: 1234, level: 2 });
    const next = nextLevel(landed, () => 0.5);
    expect(next.level).toBe(3);
    expect(next.score).toBe(1234);
    expect(next.status).toBe("ready");
  });

  test("restart resets the whole expedition", () => {
    const reset = restartFlight(() => 0.5);
    expect(reset.level).toBe(1);
    expect(reset.score).toBe(0);
    expect(reset.fuel).toBe(100);
    expect(reset.status).toBe("ready");
  });
});
