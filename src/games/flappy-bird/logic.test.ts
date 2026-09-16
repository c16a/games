import { describe, expect, test } from "bun:test";
import {
  BIRD_RADIUS,
  BIRD_X,
  BOARD_WIDTH,
  FLOOR_Y,
  FLAP_VELOCITY,
  PIPE_WIDTH,
  birdTouchesPipe,
  createInitialState,
  flap,
  gapHeightForScore,
  nextPipeDistance,
  pauseRun,
  pipeSpeedForScore,
  resumeRun,
  updateFlappy,
  type PipePair,
} from "./logic";

describe("Flappy Bird logic", () => {
  test("first flap starts the run and creates the first pipe", () => {
    const state = flap(createInitialState(), () => 0.5);
    expect(state.status).toBe("running");
    expect(state.birdVelocity).toBe(FLAP_VELOCITY);
    expect(state.pipes).toHaveLength(1);
    expect(state.pipes[0]!.x).toBeGreaterThan(BOARD_WIDTH);
  });

  test("flapping during a run restores upward velocity", () => {
    const running = { ...flap(createInitialState(), () => 0.5), birdVelocity: 200 };
    expect(flap(running).birdVelocity).toBe(FLAP_VELOCITY);
  });

  test("gravity pulls the bird downward between flaps", () => {
    const running = { ...flap(createInitialState(), () => 0.5), birdVelocity: 0 };
    const next = updateFlappy(running, 0.05, () => 0.5);
    expect(next.birdVelocity).toBeGreaterThan(0);
    expect(next.birdY).toBeGreaterThan(running.birdY);
  });

  test("passing a pipe scores exactly once", () => {
    const pipe: PipePair = { id: 1, x: BIRD_X - PIPE_WIDTH + 1, gapY: 322, gapHeight: 194, passed: false };
    const running = { ...createInitialState(), status: "running" as const, pipes: [pipe], nextPipeId: 2 };
    const scored = updateFlappy(running, 0.05, () => 0.5);
    expect(scored.score).toBe(1);
    expect(scored.pipes[0]!.passed).toBe(true);
    const again = updateFlappy(scored, 0.01, () => 0.5);
    expect(again.score).toBe(1);
  });

  test("bird collision detects pipe caps and leaves the gap safe", () => {
    const pipe: PipePair = { id: 1, x: BIRD_X - BIRD_RADIUS, gapY: 320, gapHeight: 180, passed: false };
    expect(birdTouchesPipe(320, pipe)).toBe(false);
    expect(birdTouchesPipe(200, pipe)).toBe(true);
  });

  test("touching the floor ends the run", () => {
    const running = {
      ...createInitialState(),
      status: "running" as const,
      birdY: FLOOR_Y - BIRD_RADIUS - 1,
      birdVelocity: 400,
      pipes: [],
    };
    expect(updateFlappy(running, 0.05, () => 0.5).status).toBe("over");
  });

  test("pause freezes the simulation until resumed", () => {
    const running = flap(createInitialState(), () => 0.5);
    const paused = pauseRun(running);
    expect(updateFlappy(paused, 1, () => 0.5)).toEqual(paused);
    expect(resumeRun(paused).status).toBe("running");
  });

  test("difficulty ramps while preserving a playable gap", () => {
    expect(pipeSpeedForScore(12)).toBeGreaterThan(pipeSpeedForScore(0));
    expect(gapHeightForScore(12)).toBeLessThan(gapHeightForScore(0));
    expect(gapHeightForScore(1_000)).toBe(154);
  });

  test("reports the distance to the next unpassed pipe", () => {
    const state = {
      ...createInitialState(),
      pipes: [{ id: 1, x: 300, gapY: 320, gapHeight: 190, passed: false }],
    };
    expect(nextPipeDistance(state)).toBe(300 - BIRD_X);
  });
});
