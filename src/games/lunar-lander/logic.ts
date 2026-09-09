export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 700;
export const LANDER_HALF_WIDTH = 20;
export const LANDER_HALF_HEIGHT = 24;
export const BASE_GRAVITY = 20;
export const THRUST_ACCELERATION = 46;
export const ROTATION_SPEED = 105;
export const FUEL_BURN_RATE = 15;
export const SAFE_HORIZONTAL_SPEED = 18;
export const SAFE_VERTICAL_SPEED = 27;
export const SAFE_ANGLE = 12;

export type LanderStatus = "ready" | "running" | "paused" | "landed" | "crashed";

export interface Point {
  x: number;
  y: number;
}

export interface LandingPad {
  x1: number;
  x2: number;
  y: number;
  multiplier: number;
}

export interface Terrain {
  points: Point[];
  pad: LandingPad;
}

export interface FlightControls {
  rotateLeft: boolean;
  rotateRight: boolean;
  thrust: boolean;
}

export interface LanderState {
  position: Point;
  velocity: Point;
  angle: number;
  fuel: number;
  score: number;
  level: number;
  status: LanderStatus;
  terrain: Terrain;
  thrusting: boolean;
  elapsedSeconds: number;
}

const NO_CONTROLS: FlightControls = { rotateLeft: false, rotateRight: false, thrust: false };

function normalizedRandom(random: () => number): number {
  return Math.min(0.999999999, Math.max(0, random()));
}

function randomBetween(random: () => number, minimum: number, maximum: number): number {
  return minimum + normalizedRandom(random) * (maximum - minimum);
}

function normalizeAngle(angle: number): number {
  let normalized = angle % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
}

export function gravityForLevel(level: number): number {
  return BASE_GRAVITY * (1 + Math.max(0, level - 1) * 0.08);
}

export function generateTerrain(level: number, random: () => number = Math.random): Terrain {
  const padWidth = Math.max(76, 150 - Math.max(0, level - 1) * 10);
  const padCenter = randomBetween(random, 185, WORLD_WIDTH - 185);
  const padY = randomBetween(random, 535, 615);
  const x1 = padCenter - padWidth / 2;
  const x2 = padCenter + padWidth / 2;
  const points: Point[] = [
    { x: 0, y: randomBetween(random, 455, 610) },
    { x: Math.max(45, x1 - 120), y: randomBetween(random, 455, 625) },
    { x: x1, y: padY },
    { x: x2, y: padY },
    { x: Math.min(WORLD_WIDTH - 45, x2 + 120), y: randomBetween(random, 455, 625) },
    { x: WORLD_WIDTH, y: randomBetween(random, 455, 610) },
  ].sort((left, right) => left.x - right.x);
  return {
    points,
    pad: { x1, x2, y: padY, multiplier: Math.min(5, 1 + Math.floor(level / 2)) },
  };
}

export function terrainHeightAt(terrain: Terrain, x: number): number {
  const clampedX = Math.max(0, Math.min(WORLD_WIDTH, x));
  for (let index = 0; index < terrain.points.length - 1; index += 1) {
    const left = terrain.points[index]!;
    const right = terrain.points[index + 1]!;
    if (clampedX < left.x || clampedX > right.x) continue;
    if (right.x === left.x) return Math.min(left.y, right.y);
    const progress = (clampedX - left.x) / (right.x - left.x);
    return left.y + (right.y - left.y) * progress;
  }
  return terrain.points.at(-1)?.y ?? WORLD_HEIGHT;
}

export function createInitialState(random: () => number = Math.random): LanderState {
  return {
    position: { x: randomBetween(random, 260, 540), y: 92 },
    velocity: { x: randomBetween(random, -12, 12), y: 0 },
    angle: 0,
    fuel: 100,
    score: 0,
    level: 1,
    status: "ready",
    terrain: generateTerrain(1, random),
    thrusting: false,
    elapsedSeconds: 0,
  };
}

export function startFlight(state: LanderState): LanderState {
  return state.status === "ready" ? { ...state, status: "running" } : state;
}

export function pauseFlight(state: LanderState): LanderState {
  return state.status === "running" ? { ...state, status: "paused", thrusting: false } : state;
}

export function resumeFlight(state: LanderState): LanderState {
  return state.status === "paused" ? { ...state, status: "running" } : state;
}

function landingScore(state: LanderState): number {
  const precision = Math.max(0, SAFE_VERTICAL_SPEED - state.velocity.y) * 12
    + Math.max(0, SAFE_HORIZONTAL_SPEED - Math.abs(state.velocity.x)) * 10
    + Math.max(0, SAFE_ANGLE - Math.abs(state.angle)) * 8;
  return Math.round((state.fuel * 8 + precision + 400) * state.terrain.pad.multiplier);
}

function resolveSurfaceContact(state: LanderState): LanderState {
  const { pad } = state.terrain;
  const feetInsidePad = state.position.x - LANDER_HALF_WIDTH >= pad.x1
    && state.position.x + LANDER_HALF_WIDTH <= pad.x2;
  const safe = feetInsidePad
    && Math.abs(state.velocity.x) <= SAFE_HORIZONTAL_SPEED
    && state.velocity.y <= SAFE_VERTICAL_SPEED
    && Math.abs(state.angle) <= SAFE_ANGLE;
  const surfaceY = terrainHeightAt(state.terrain, state.position.x);
  const settled = {
    ...state,
    position: { ...state.position, y: surfaceY - LANDER_HALF_HEIGHT },
    thrusting: false,
  };
  return safe
    ? { ...settled, velocity: { x: 0, y: 0 }, angle: 0, status: "landed", score: state.score + landingScore(state) }
    : { ...settled, status: "crashed" };
}

function physicsStep(state: LanderState, seconds: number, controls: FlightControls): LanderState {
  const rotationInput = Number(controls.rotateRight) - Number(controls.rotateLeft);
  const angle = normalizeAngle(state.angle + rotationInput * ROTATION_SPEED * seconds);
  const canThrust = controls.thrust && state.fuel > 0;
  const radians = angle * Math.PI / 180;
  const thrust = canThrust ? THRUST_ACCELERATION : 0;
  const accelerationX = Math.sin(radians) * thrust;
  const accelerationY = gravityForLevel(state.level) - Math.cos(radians) * thrust;
  const velocity = {
    x: state.velocity.x + accelerationX * seconds,
    y: state.velocity.y + accelerationY * seconds,
  };
  const position = {
    x: state.position.x + velocity.x * seconds,
    y: state.position.y + velocity.y * seconds,
  };
  const next: LanderState = {
    ...state,
    position,
    velocity,
    angle,
    fuel: Math.max(0, state.fuel - (canThrust ? FUEL_BURN_RATE * seconds : 0)),
    thrusting: canThrust,
    elapsedSeconds: state.elapsedSeconds + seconds,
  };

  if (position.x - LANDER_HALF_WIDTH <= 0 || position.x + LANDER_HALF_WIDTH >= WORLD_WIDTH || position.y - LANDER_HALF_HEIGHT >= WORLD_HEIGHT) {
    return { ...next, status: "crashed", thrusting: false };
  }
  if (position.y + LANDER_HALF_HEIGHT >= terrainHeightAt(next.terrain, position.x)) return resolveSurfaceContact(next);
  return next;
}

export function updateFlight(state: LanderState, seconds: number, controls: FlightControls = NO_CONTROLS): LanderState {
  if (state.status !== "running" || seconds <= 0) return state;
  let next = state;
  let remaining = Math.min(seconds, 0.25);
  while (next.status === "running" && remaining > 0) {
    const step = Math.min(remaining, 1 / 120);
    next = physicsStep(next, step, controls);
    remaining -= step;
  }
  return next;
}

export function nextLevel(state: LanderState, random: () => number = Math.random): LanderState {
  if (state.status !== "landed") return state;
  const level = state.level + 1;
  return {
    ...createInitialState(random),
    score: state.score,
    level,
    status: "ready",
    terrain: generateTerrain(level, random),
  };
}

export function restartFlight(random: () => number = Math.random): LanderState {
  return createInitialState(random);
}
