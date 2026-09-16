export const BOARD_SIZE = 720;
export const FIELD_MIN = 54;
export const FIELD_MAX = BOARD_SIZE - FIELD_MIN;
export const PLAYER_BASELINE_Y = 610;
export const AI_BASELINE_Y = 110;
export const COIN_RADIUS = 16;
export const STRIKER_RADIUS = 21;
export const POCKET_RADIUS = 31;
export const MIN_PULL = 12;
export const MAX_PULL = 155;
export const MAX_SHOT_SPEED = 900;
export const FRICTION = 205;

export type Difficulty = "easy" | "hard";
export type Player = "player" | "ai";
export type CoinKind = Player | "queen";
export type GamePhase = "aiming" | "moving" | "aiThinking" | "over";

export interface Vector {
  x: number;
  y: number;
}

export interface Disc extends Vector {
  id: string;
  kind: "striker" | CoinKind;
  radius: number;
  vx: number;
  vy: number;
  pocketed: boolean;
}

export interface ShotRecord {
  shooter: Player;
  pocketed: CoinKind[];
  strikerPocketed: boolean;
}

export interface CarromState {
  difficulty: Difficulty;
  phase: GamePhase;
  turn: Player;
  striker: Disc;
  coins: Disc[];
  score: Record<Player, number>;
  shot: ShotRecord | null;
  winner: Player | "draw" | null;
}

export interface GuidePoint extends Vector {
  kind: "start" | "bounce" | "end" | "coin";
  coinId?: string;
}

export interface ShotChoice {
  strikerX: number;
  velocity: Vector;
  targetId: string | null;
}

const POCKETS: readonly Vector[] = [
  { x: FIELD_MIN, y: FIELD_MIN },
  { x: FIELD_MAX, y: FIELD_MIN },
  { x: FIELD_MIN, y: FIELD_MAX },
  { x: FIELD_MAX, y: FIELD_MAX },
];

const PLAYER_COIN_COUNT = 6;
const STOP_SPEED = 8;
const REST_SPEED = 14;
const WALL_RESTITUTION = 0.88;
const DISC_RESTITUTION = 0.94;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function length(vector: Vector): number {
  return Math.hypot(vector.x, vector.y);
}

function normalized(vector: Vector): Vector {
  const magnitude = length(vector);
  return magnitude > 0 ? { x: vector.x / magnitude, y: vector.y / magnitude } : { x: 0, y: -1 };
}

function createCoin(id: string, kind: CoinKind, x: number, y: number): Disc {
  return { id, kind, x, y, radius: COIN_RADIUS, vx: 0, vy: 0, pocketed: false };
}

export function createCoins(): Disc[] {
  const center = BOARD_SIZE / 2;
  const coins: Disc[] = [createCoin("queen", "queen", center, center)];
  let playerIndex = 0;
  let aiIndex = 0;
  for (let index = 0; index < 6; index += 1) {
    const angle = index * Math.PI / 3;
    const kind: Player = index % 2 === 0 ? "player" : "ai";
    const number = kind === "player" ? ++playerIndex : ++aiIndex;
    coins.push(createCoin(`${kind}-${number}`, kind, center + Math.cos(angle) * 39, center + Math.sin(angle) * 39));
  }
  for (let index = 0; index < 6; index += 1) {
    const angle = index * Math.PI / 3 + Math.PI / 6;
    const kind: Player = index % 2 === 0 ? "ai" : "player";
    const number = kind === "player" ? ++playerIndex : ++aiIndex;
    coins.push(createCoin(`${kind}-${number}`, kind, center + Math.cos(angle) * 78, center + Math.sin(angle) * 78));
  }
  return coins;
}

function strikerAt(turn: Player, x = BOARD_SIZE / 2): Disc {
  return {
    id: "striker",
    kind: "striker",
    x,
    y: turn === "player" ? PLAYER_BASELINE_Y : AI_BASELINE_Y,
    radius: STRIKER_RADIUS,
    vx: 0,
    vy: 0,
    pocketed: false,
  };
}

export function createInitialState(difficulty: Difficulty = "easy"): CarromState {
  return {
    difficulty,
    phase: "aiming",
    turn: "player",
    striker: strikerAt("player"),
    coins: createCoins(),
    score: { player: 0, ai: 0 },
    shot: null,
    winner: null,
  };
}

export function setDifficulty(state: CarromState, difficulty: Difficulty): CarromState {
  return state.difficulty === difficulty ? state : createInitialState(difficulty);
}

export function displayToBoard(clientX: number, clientY: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">): Vector {
  if (rect.width <= 0 || rect.height <= 0) return { x: BOARD_SIZE / 2, y: BOARD_SIZE / 2 };
  return {
    x: clamp((clientX - rect.left) * BOARD_SIZE / rect.width, 0, BOARD_SIZE),
    y: clamp((clientY - rect.top) * BOARD_SIZE / rect.height, 0, BOARD_SIZE),
  };
}

function baselineRange(): { minimum: number; maximum: number } {
  return { minimum: FIELD_MIN + 64, maximum: FIELD_MAX - 64 };
}

export function findOpenStrikerX(coins: readonly Disc[], preferredX: number, baselineY: number): number {
  const { minimum, maximum } = baselineRange();
  const preferred = clamp(preferredX, minimum, maximum);
  const offsets = [0, -34, 34, -68, 68, -102, 102, -136, 136, -170, 170, -204, 204];
  for (const offset of offsets) {
    const x = clamp(preferred + offset, minimum, maximum);
    const blocked = coins.some((coin) => !coin.pocketed && Math.hypot(coin.x - x, coin.y - baselineY) < coin.radius + STRIKER_RADIUS + 3);
    if (!blocked) return x;
  }
  return preferred;
}

export function positionPlayerStriker(state: CarromState, x: number): CarromState {
  if (state.phase !== "aiming" || state.turn !== "player") return state;
  const openX = findOpenStrikerX(state.coins, x, PLAYER_BASELINE_Y);
  return { ...state, striker: strikerAt("player", openX) };
}

export function velocityFromPull(striker: Vector, pointer: Vector): Vector {
  const pull = { x: pointer.x - striker.x, y: pointer.y - striker.y };
  const pullLength = length(pull);
  if (pullLength < MIN_PULL) return { x: 0, y: 0 };
  const capped = Math.min(MAX_PULL, pullLength);
  const direction = normalized({ x: -pull.x, y: -pull.y });
  const speed = MAX_SHOT_SPEED * capped / MAX_PULL;
  return { x: direction.x * speed, y: direction.y * speed };
}

function startShot(state: CarromState, shooter: Player, striker: Disc, velocity: Vector): CarromState {
  if (length(velocity) <= 0) return state;
  return {
    ...state,
    phase: "moving",
    turn: shooter,
    striker: { ...striker, vx: velocity.x, vy: velocity.y, pocketed: false },
    shot: { shooter, pocketed: [], strikerPocketed: false },
  };
}

export function launchPlayerShot(state: CarromState, pointer: Vector): CarromState {
  if (state.phase !== "aiming" || state.turn !== "player") return state;
  return startShot(state, "player", state.striker, velocityFromPull(state.striker, pointer));
}

function rayCircleDistance(origin: Vector, direction: Vector, center: Vector, radius: number): number | null {
  const relative = { x: center.x - origin.x, y: center.y - origin.y };
  const projection = relative.x * direction.x + relative.y * direction.y;
  if (projection <= 0) return null;
  const perpendicularSquared = relative.x ** 2 + relative.y ** 2 - projection ** 2;
  const radiusSquared = radius ** 2;
  if (perpendicularSquared > radiusSquared) return null;
  const distance = projection - Math.sqrt(Math.max(0, radiusSquared - perpendicularSquared));
  return distance > 0.01 ? distance : null;
}

function wallDistance(origin: Vector, direction: Vector): { distance: number; axis: "x" | "y" } | null {
  const minimum = FIELD_MIN + STRIKER_RADIUS;
  const maximum = FIELD_MAX - STRIKER_RADIUS;
  const xDistance = direction.x > 0 ? (maximum - origin.x) / direction.x : direction.x < 0 ? (minimum - origin.x) / direction.x : Number.POSITIVE_INFINITY;
  const yDistance = direction.y > 0 ? (maximum - origin.y) / direction.y : direction.y < 0 ? (minimum - origin.y) / direction.y : Number.POSITIVE_INFINITY;
  const xValid = xDistance > 0.01 ? xDistance : Number.POSITIVE_INFINITY;
  const yValid = yDistance > 0.01 ? yDistance : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(xValid) && !Number.isFinite(yValid)) return null;
  return xValid <= yValid ? { distance: xValid, axis: "x" } : { distance: yValid, axis: "y" };
}

export function predictTrajectory(striker: Disc, coins: readonly Disc[], pointer: Vector, maxBounces = 1): GuidePoint[] {
  const velocity = velocityFromPull(striker, pointer);
  const speed = length(velocity);
  if (speed <= 0) return [{ x: striker.x, y: striker.y, kind: "start" }];

  let remaining = speed ** 2 / (2 * FRICTION);
  let origin: Vector = { x: striker.x, y: striker.y };
  let direction = normalized(velocity);
  let bounces = 0;
  const points: GuidePoint[] = [{ ...origin, kind: "start" }];

  while (remaining > 0.5) {
    let coinHit: { distance: number; coin: Disc } | null = null;
    for (const coin of coins) {
      if (coin.pocketed) continue;
      const distance = rayCircleDistance(origin, direction, coin, striker.radius + coin.radius);
      if (distance !== null && distance <= remaining && (!coinHit || distance < coinHit.distance)) coinHit = { distance, coin };
    }
    const wall = wallDistance(origin, direction);
    const wallBeforeEnd = wall && wall.distance <= remaining;

    if (coinHit && (!wallBeforeEnd || coinHit.distance <= wall!.distance)) {
      points.push({
        x: origin.x + direction.x * coinHit.distance,
        y: origin.y + direction.y * coinHit.distance,
        kind: "coin",
        coinId: coinHit.coin.id,
      });
      break;
    }

    if (!wallBeforeEnd) {
      points.push({ x: origin.x + direction.x * remaining, y: origin.y + direction.y * remaining, kind: "end" });
      break;
    }

    const impact = { x: origin.x + direction.x * wall!.distance, y: origin.y + direction.y * wall!.distance };
    remaining -= wall!.distance;
    if (bounces >= maxBounces) {
      points.push({ ...impact, kind: "end" });
      break;
    }
    points.push({ ...impact, kind: "bounce" });
    const reflected = wall!.axis === "x"
      ? { x: -direction.x * WALL_RESTITUTION, y: direction.y }
      : { x: direction.x, y: -direction.y * WALL_RESTITUTION };
    const retainedEnergy = reflected.x ** 2 + reflected.y ** 2;
    remaining *= retainedEnergy;
    direction = normalized(reflected);
    origin = { x: impact.x + direction.x * 0.01, y: impact.y + direction.y * 0.01 };
    bounces += 1;
  }
  return points;
}

function rotate(vector: Vector, angle: number): Vector {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: vector.x * cosine - vector.y * sine, y: vector.x * sine + vector.y * cosine };
}

function pathIsClear(from: Vector, to: Vector, coins: readonly Disc[], ignoredId: string): boolean {
  const delta = { x: to.x - from.x, y: to.y - from.y };
  const distance = length(delta);
  if (distance <= 0) return true;
  const direction = normalized(delta);
  return !coins.some((coin) => {
    if (coin.pocketed || coin.id === ignoredId) return false;
    const hit = rayCircleDistance(from, direction, coin, STRIKER_RADIUS + coin.radius + 2);
    return hit !== null && hit < distance;
  });
}

export function chooseAiShot(state: CarromState, difficulty = state.difficulty, random: () => number = Math.random): ShotChoice {
  const targets = state.coins.filter((coin) => !coin.pocketed && coin.kind === "ai");
  const fallbackTargets = state.coins.filter((coin) => !coin.pocketed);
  const candidates = targets.length > 0 ? targets : fallbackTargets;
  const fallback = candidates[Math.floor(random() * Math.max(1, candidates.length))] ?? null;
  let target = fallback;
  let preferredX = fallback?.x ?? BOARD_SIZE / 2;
  let direction = fallback ? normalized({ x: fallback.x - preferredX, y: fallback.y - AI_BASELINE_Y }) : { x: 0, y: 1 };

  if (difficulty === "hard") {
    let best: { target: Disc; strikerX: number; direction: Vector; score: number } | null = null;
    for (const coin of targets) {
      for (const pocket of POCKETS) {
        const coinDirection = normalized({ x: pocket.x - coin.x, y: pocket.y - coin.y });
        if (coinDirection.y <= 0.08) continue;
        const impact = {
          x: coin.x - coinDirection.x * (COIN_RADIUS + STRIKER_RADIUS),
          y: coin.y - coinDirection.y * (COIN_RADIUS + STRIKER_RADIUS),
        };
        const travelToBaseline = (impact.y - AI_BASELINE_Y) / coinDirection.y;
        const strikerX = impact.x - coinDirection.x * travelToBaseline;
        const { minimum, maximum } = baselineRange();
        if (strikerX < minimum || strikerX > maximum || travelToBaseline <= 0) continue;
        const striker = { x: strikerX, y: AI_BASELINE_Y };
        if (!pathIsClear(striker, impact, state.coins, coin.id)) continue;
        const score = Math.hypot(pocket.x - coin.x, pocket.y - coin.y) + travelToBaseline * 0.35;
        if (!best || score < best.score) best = { target: coin, strikerX, direction: coinDirection, score };
      }
    }
    if (best) {
      target = best.target;
      preferredX = best.strikerX;
      direction = best.direction;
    }
  }

  const strikerX = findOpenStrikerX(state.coins, preferredX + (difficulty === "easy" ? (random() - 0.5) * 90 : 0), AI_BASELINE_Y);
  if (!target) return { strikerX, velocity: { x: 0, y: 650 }, targetId: null };
  if (difficulty === "easy" || direction.y <= 0) direction = normalized({ x: target.x - strikerX, y: target.y - AI_BASELINE_Y });
  const error = difficulty === "easy" ? (random() - 0.5) * 0.34 : (random() - 0.5) * 0.045;
  const aimed = rotate(direction, error);
  const speed = difficulty === "easy" ? 580 + random() * 120 : 820 + random() * 55;
  return { strikerX, velocity: { x: aimed.x * speed, y: aimed.y * speed }, targetId: target.id };
}

export function launchAiShot(state: CarromState, random: () => number = Math.random): CarromState {
  if (state.phase !== "aiThinking" || state.turn !== "ai") return state;
  const choice = chooseAiShot(state, state.difficulty, random);
  return startShot(state, "ai", strikerAt("ai", choice.strikerX), choice.velocity);
}

function isPocketed(disc: Disc): boolean {
  return POCKETS.some((pocket) => Math.hypot(disc.x - pocket.x, disc.y - pocket.y) <= POCKET_RADIUS);
}

function moveDisc(disc: Disc, delta: number): Disc {
  if (disc.pocketed) return disc;
  let next = { ...disc, x: disc.x + disc.vx * delta, y: disc.y + disc.vy * delta };
  const speed = Math.hypot(next.vx, next.vy);
  const nextSpeed = Math.max(0, speed - FRICTION * delta);
  if (speed > 0) {
    const scale = nextSpeed / speed;
    next.vx *= scale;
    next.vy *= scale;
  }
  if (nextSpeed < STOP_SPEED) {
    next.vx = 0;
    next.vy = 0;
  }
  if (isPocketed(next)) return { ...next, vx: 0, vy: 0, pocketed: true };

  const minimum = FIELD_MIN + next.radius;
  const maximum = FIELD_MAX - next.radius;
  if (next.x < minimum) {
    next.x = minimum;
    next.vx = Math.abs(next.vx) * WALL_RESTITUTION;
  } else if (next.x > maximum) {
    next.x = maximum;
    next.vx = -Math.abs(next.vx) * WALL_RESTITUTION;
  }
  if (next.y < minimum) {
    next.y = minimum;
    next.vy = Math.abs(next.vy) * WALL_RESTITUTION;
  } else if (next.y > maximum) {
    next.y = maximum;
    next.vy = -Math.abs(next.vy) * WALL_RESTITUTION;
  }
  return next;
}

function collide(first: Disc, second: Disc): [Disc, Disc] {
  if (first.pocketed || second.pocketed) return [first, second];
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const distance = Math.hypot(dx, dy);
  const minimumDistance = first.radius + second.radius;
  if (distance <= 0 || distance >= minimumDistance) return [first, second];
  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = minimumDistance - distance;
  const firstNext = { ...first, x: first.x - nx * overlap / 2, y: first.y - ny * overlap / 2 };
  const secondNext = { ...second, x: second.x + nx * overlap / 2, y: second.y + ny * overlap / 2 };
  const relativeNormal = (firstNext.vx - secondNext.vx) * nx + (firstNext.vy - secondNext.vy) * ny;
  if (relativeNormal <= 0) return [firstNext, secondNext];
  const impulse = relativeNormal * (1 + DISC_RESTITUTION) / 2;
  firstNext.vx -= impulse * nx;
  firstNext.vy -= impulse * ny;
  secondNext.vx += impulse * nx;
  secondNext.vy += impulse * ny;
  return [firstNext, secondNext];
}

function awardPocket(state: CarromState, before: Disc[], after: Disc[], strikerBefore: Disc, strikerAfter: Disc): CarromState {
  let score = state.score;
  let shot = state.shot;
  for (let index = 0; index < after.length; index += 1) {
    const previous = before[index];
    const coin = after[index];
    if (!previous || !coin || previous.pocketed || !coin.pocketed || !shot) continue;
    if (coin.kind === "queen") score = { ...score, [shot.shooter]: score[shot.shooter] + 2 };
    else if (coin.kind === "player" || coin.kind === "ai") score = { ...score, [coin.kind]: score[coin.kind] + 1 };
    shot = { ...shot, pocketed: [...shot.pocketed, coin.kind as CoinKind] };
  }
  if (!strikerBefore.pocketed && strikerAfter.pocketed && shot) shot = { ...shot, strikerPocketed: true };
  return score === state.score && shot === state.shot ? state : { ...state, score, shot };
}

function allStopped(state: CarromState): boolean {
  const moving = [state.striker, ...state.coins].filter((disc) => !disc.pocketed);
  return moving.every((disc) => Math.hypot(disc.vx, disc.vy) < REST_SPEED);
}

function finishShot(state: CarromState): CarromState {
  const shot = state.shot;
  if (!shot) return state;
  const playerCleared = state.coins.every((coin) => coin.kind !== "player" || coin.pocketed);
  const aiCleared = state.coins.every((coin) => coin.kind !== "ai" || coin.pocketed);
  if (playerCleared || aiCleared) {
    const winner: Player | "draw" = playerCleared && aiCleared
      ? state.score.player === state.score.ai ? "draw" : state.score.player > state.score.ai ? "player" : "ai"
      : playerCleared ? "player" : "ai";
    return { ...state, phase: "over", winner, striker: { ...state.striker, vx: 0, vy: 0 }, shot: null };
  }

  const pocketedOwn = shot.pocketed.includes(shot.shooter) || shot.pocketed.includes("queen");
  const keepTurn = pocketedOwn && !shot.strikerPocketed;
  const turn: Player = keepTurn ? shot.shooter : shot.shooter === "player" ? "ai" : "player";
  const baselineY = turn === "player" ? PLAYER_BASELINE_Y : AI_BASELINE_Y;
  const preferredX = findOpenStrikerX(state.coins, BOARD_SIZE / 2, baselineY);
  return {
    ...state,
    phase: turn === "player" ? "aiming" : "aiThinking",
    turn,
    striker: strikerAt(turn, preferredX),
    shot: null,
  };
}

export function updateCarrom(state: CarromState, delta: number): CarromState {
  if (state.phase !== "moving") return state;
  let next = state;
  const steps = Math.max(1, Math.ceil(Math.min(delta, 0.05) / (1 / 180)));
  const step = Math.min(delta, 0.05) / steps;
  for (let iteration = 0; iteration < steps; iteration += 1) {
    const coinsBefore = next.coins;
    const strikerBefore = next.striker;
    const discs = [moveDisc(next.striker, step), ...next.coins.map((coin) => moveDisc(coin, step))];
    for (let first = 0; first < discs.length; first += 1) {
      for (let second = first + 1; second < discs.length; second += 1) {
        const firstDisc = discs[first];
        const secondDisc = discs[second];
        if (!firstDisc || !secondDisc) continue;
        const [firstNext, secondNext] = collide(firstDisc, secondDisc);
        discs[first] = firstNext;
        discs[second] = secondNext;
      }
    }
    next = { ...next, striker: discs[0]!, coins: discs.slice(1) };
    next = awardPocket(next, coinsBefore, next.coins, strikerBefore, next.striker);
  }
  return allStopped(next) ? finishShot(next) : next;
}

export function remainingCoins(state: CarromState, player: Player): number {
  return state.coins.filter((coin) => coin.kind === player && !coin.pocketed).length;
}

export function shotPower(striker: Vector, pointer: Vector): number {
  return Math.round(clamp(Math.hypot(pointer.x - striker.x, pointer.y - striker.y) / MAX_PULL, 0, 1) * 100);
}

export const CARROM_POCKETS = POCKETS;
export const CARROM_COIN_COUNT = PLAYER_COIN_COUNT;
