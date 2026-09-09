export const BOARD_WIDTH = 480;
export const BOARD_HEIGHT = 720;
export const PLAYER_WIDTH = 42;
export const PLAYER_HEIGHT = 48;

export const SHOOTER_CONFIG = {
  baseKills: 10,
  growthFactor: 1.5,
  baseHealth: 100,
  healthUpgradeBonus: 15,
  playerSpeed: 310,
  enemyHealthGrowth: 0.24,
  enemyDamageGrowth: 0.12,
  enemySpeedGrowth: 0.045,
  baseSpawnInterval: 1.2,
  spawnIntervalReduction: 0.065,
  minimumSpawnInterval: 0.32,
  levelsPerExtraEnemy: 3,
  maximumWaveSize: 4,
} as const;

export type ShooterStatus = "ready" | "running" | "paused" | "dead";
export type EnemyKind = "scout" | "cruiser";

export interface Point {
  x: number;
  y: number;
}

export interface Player extends Point {
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  level: number;
  killsTowardUpgrade: number;
  lifetimeKills: number;
}

export interface Enemy extends Point {
  id: number;
  kind: EnemyKind;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  collisionDamage: number;
  pointValue: number;
  speed: number;
}

export interface Bolt extends Point {
  id: number;
  width: number;
  height: number;
  speed: number;
  damage: number;
}

export type CombatEvent =
  | { kind: "destroyed"; enemyKind: EnemyKind; x: number; y: number; points: number }
  | { kind: "damaged"; amount: number; x: number; y: number }
  | { kind: "upgraded"; level: number };

export interface ShooterControls {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface ShooterState {
  player: Player;
  enemies: Enemy[];
  bolts: Bolt[];
  score: number;
  status: ShooterStatus;
  elapsedSeconds: number;
  fireElapsed: number;
  spawnElapsed: number;
  nextId: number;
  events: CombatEvent[];
}

export interface HitResolution {
  enemies: Enemy[];
  bolts: Bolt[];
  destroyed: Enemy[];
}

export const ENEMY_TYPES: Record<EnemyKind, {
  width: number;
  height: number;
  baseHealth: number;
  baseCollisionDamage: number;
  pointValue: number;
  baseSpeed: number;
}> = {
  scout: { width: 30, height: 32, baseHealth: 20, baseCollisionDamage: 12, pointValue: 100, baseSpeed: 105 },
  cruiser: { width: 52, height: 46, baseHealth: 60, baseCollisionDamage: 26, pointValue: 300, baseSpeed: 72 },
};

const NO_CONTROLS: ShooterControls = { left: false, right: false, up: false, down: false };

function normalizedRandom(random: () => number): number {
  return Math.min(0.999999999, Math.max(0, random()));
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return Math.abs(a.x - b.x) * 2 < a.width + b.width && Math.abs(a.y - b.y) * 2 < a.height + b.height;
}

export function killsRequired(
  level: number,
  baseKills: number = SHOOTER_CONFIG.baseKills,
  growthFactor: number = SHOOTER_CONFIG.growthFactor,
): number {
  if (growthFactor <= 1) throw new Error("The progression growth factor must be greater than 1");
  return Math.ceil(baseKills * growthFactor ** (Math.max(1, level) - 1));
}

export function boltsPerSecond(level: number): number {
  return Math.max(1, Math.floor(level));
}

export function boltDamage(level: number): number {
  return 10 * Math.max(1, Math.floor(level));
}

export function spawnInterval(level: number): number {
  return Math.max(
    SHOOTER_CONFIG.minimumSpawnInterval,
    SHOOTER_CONFIG.baseSpawnInterval - (Math.max(1, level) - 1) * SHOOTER_CONFIG.spawnIntervalReduction,
  );
}

export function waveSize(level: number): number {
  return Math.min(
    SHOOTER_CONFIG.maximumWaveSize,
    1 + Math.floor((Math.max(1, level) - 1) / SHOOTER_CONFIG.levelsPerExtraEnemy),
  );
}

export function enemyForLevel(kind: EnemyKind, level: number, id = 1, x = BOARD_WIDTH / 2): Enemy {
  const config = ENEMY_TYPES[kind];
  const levelOffset = Math.max(0, level - 1);
  const health = Math.ceil(config.baseHealth * (1 + levelOffset * SHOOTER_CONFIG.enemyHealthGrowth));
  return {
    id,
    kind,
    x,
    y: -config.height / 2,
    width: config.width,
    height: config.height,
    health,
    maxHealth: health,
    collisionDamage: Math.ceil(config.baseCollisionDamage * (1 + levelOffset * SHOOTER_CONFIG.enemyDamageGrowth)),
    pointValue: config.pointValue,
    speed: config.baseSpeed * (1 + levelOffset * SHOOTER_CONFIG.enemySpeedGrowth),
  };
}

export function createInitialState(): ShooterState {
  return {
    player: {
      x: BOARD_WIDTH / 2,
      y: BOARD_HEIGHT - 72,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      health: SHOOTER_CONFIG.baseHealth,
      maxHealth: SHOOTER_CONFIG.baseHealth,
      level: 1,
      killsTowardUpgrade: 0,
      lifetimeKills: 0,
    },
    enemies: [],
    bolts: [],
    score: 0,
    status: "ready",
    elapsedSeconds: 0,
    fireElapsed: 0,
    spawnElapsed: 0,
    nextId: 1,
    events: [],
  };
}

export function startGame(state: ShooterState): ShooterState {
  return state.status === "ready" ? { ...state, status: "running", fireElapsed: 1 / boltsPerSecond(state.player.level) } : state;
}

export function pauseGame(state: ShooterState): ShooterState {
  return state.status === "running" ? { ...state, status: "paused", events: [] } : state;
}

export function resumeGame(state: ShooterState): ShooterState {
  return state.status === "paused" ? { ...state, status: "running", events: [] } : state;
}

export function restartGame(): ShooterState {
  return createInitialState();
}

export function movePlayerTo(state: ShooterState, x: number, y: number): ShooterState {
  const halfWidth = state.player.width / 2;
  const halfHeight = state.player.height / 2;
  return {
    ...state,
    player: {
      ...state.player,
      x: Math.max(halfWidth, Math.min(BOARD_WIDTH - halfWidth, x)),
      y: Math.max(halfHeight, Math.min(BOARD_HEIGHT - halfHeight, y)),
    },
  };
}

export function resolveBoltHit(enemy: Enemy, damage: number): { enemy: Enemy; destroyed: boolean } {
  const healthBeforeHit = enemy.health;
  const health = Math.max(0, healthBeforeHit - Math.max(0, damage));
  return { enemy: { ...enemy, health }, destroyed: damage >= healthBeforeHit };
}

export function resolveBoltHits(enemies: readonly Enemy[], bolts: readonly Bolt[]): HitResolution {
  const remainingEnemies = enemies.map((enemy) => ({ ...enemy }));
  const remainingBolts: Bolt[] = [];
  const destroyed: Enemy[] = [];

  for (const bolt of bolts) {
    const hitIndex = remainingEnemies.findIndex((enemy) => enemy.health > 0 && overlaps(enemy, bolt));
    if (hitIndex < 0) {
      remainingBolts.push(bolt);
      continue;
    }
    const target = remainingEnemies[hitIndex]!;
    const result = resolveBoltHit(target, bolt.damage);
    remainingEnemies[hitIndex] = result.enemy;
    if (result.destroyed) destroyed.push(result.enemy);
  }

  const destroyedIds = new Set(destroyed.map(({ id }) => id));
  return {
    enemies: remainingEnemies.filter((enemy) => !destroyedIds.has(enemy.id)),
    bolts: remainingBolts,
    destroyed,
  };
}

export function recordDestroyedEnemies(state: ShooterState, destroyed: readonly Enemy[]): ShooterState {
  if (destroyed.length === 0) return state;
  const unique = [...new Map(destroyed.map((enemy) => [enemy.id, enemy])).values()];
  let level = state.player.level;
  let progress = state.player.killsTowardUpgrade + unique.length;
  let health = state.player.health;
  let maxHealth = state.player.maxHealth;
  const events: CombatEvent[] = unique.map((enemy) => ({ kind: "destroyed", enemyKind: enemy.kind, x: enemy.x, y: enemy.y, points: enemy.pointValue }));

  while (progress >= killsRequired(level)) {
    progress -= killsRequired(level);
    level += 1;
    maxHealth += SHOOTER_CONFIG.healthUpgradeBonus;
    health += SHOOTER_CONFIG.healthUpgradeBonus;
    events.push({ kind: "upgraded", level });
  }

  return {
    ...state,
    score: state.score + unique.reduce((total, enemy) => total + enemy.pointValue, 0),
    player: {
      ...state.player,
      level,
      killsTowardUpgrade: progress,
      lifetimeKills: state.player.lifetimeKills + unique.length,
      health,
      maxHealth,
    },
    events: [...state.events, ...events],
  };
}

export function applyEnemyContacts(state: ShooterState): ShooterState {
  if (state.status !== "running") return state;
  const contacts = state.enemies.filter((enemy) => overlaps(enemy, state.player));
  if (contacts.length === 0) return state;
  const contactIds = new Set(contacts.map(({ id }) => id));
  const damage = contacts.reduce((total, enemy) => total + enemy.collisionDamage, 0);
  const health = Math.max(0, state.player.health - damage);
  return {
    ...state,
    player: { ...state.player, health },
    enemies: state.enemies.filter((enemy) => !contactIds.has(enemy.id)),
    status: health === 0 ? "dead" : state.status,
    events: [...state.events, { kind: "damaged", amount: damage, x: state.player.x, y: state.player.y }],
  };
}

function spawnWave(state: ShooterState, random: () => number): ShooterState {
  const enemies = [...state.enemies];
  let nextId = state.nextId;
  const count = waveSize(state.player.level);
  for (let index = 0; index < count; index += 1) {
    const kind: EnemyKind = normalizedRandom(random) < Math.min(0.45, 0.16 + state.player.level * 0.025) ? "cruiser" : "scout";
    const template = ENEMY_TYPES[kind];
    const x = template.width / 2 + normalizedRandom(random) * (BOARD_WIDTH - template.width);
    const enemy = enemyForLevel(kind, state.player.level, nextId, x);
    enemies.push({ ...enemy, y: -enemy.height / 2 - index * 34 });
    nextId += 1;
  }
  return { ...state, enemies, nextId };
}

function fireBolt(state: ShooterState): ShooterState {
  const bolt: Bolt = {
    id: state.nextId,
    x: state.player.x,
    y: state.player.y - state.player.height / 2 - 9,
    width: 7,
    height: 18,
    speed: 470,
    damage: boltDamage(state.player.level),
  };
  return { ...state, bolts: [...state.bolts, bolt], nextId: state.nextId + 1 };
}

function updateStep(state: ShooterState, seconds: number, controls: ShooterControls, random: () => number): ShooterState {
  const horizontal = Number(controls.right) - Number(controls.left);
  const vertical = Number(controls.down) - Number(controls.up);
  const magnitude = Math.hypot(horizontal, vertical) || 1;
  let next = movePlayerTo(
    state,
    state.player.x + horizontal / magnitude * SHOOTER_CONFIG.playerSpeed * seconds,
    state.player.y + vertical / magnitude * SHOOTER_CONFIG.playerSpeed * seconds,
  );
  next = {
    ...next,
    elapsedSeconds: next.elapsedSeconds + seconds,
    fireElapsed: next.fireElapsed + seconds,
    spawnElapsed: next.spawnElapsed + seconds,
    enemies: next.enemies.map((enemy) => ({ ...enemy, y: enemy.y + enemy.speed * seconds })),
    bolts: next.bolts.map((bolt) => ({ ...bolt, y: bolt.y - bolt.speed * seconds })),
  };

  let firingInterval = 1 / boltsPerSecond(next.player.level);
  while (next.fireElapsed >= firingInterval) {
    next = fireBolt({ ...next, fireElapsed: next.fireElapsed - firingInterval });
    firingInterval = 1 / boltsPerSecond(next.player.level);
  }
  let interval = spawnInterval(next.player.level);
  while (next.spawnElapsed >= interval) {
    next = spawnWave({ ...next, spawnElapsed: next.spawnElapsed - interval }, random);
    interval = spawnInterval(next.player.level);
  }

  const hit = resolveBoltHits(next.enemies, next.bolts.filter((bolt) => bolt.y + bolt.height / 2 >= 0));
  next = recordDestroyedEnemies({ ...next, enemies: hit.enemies, bolts: hit.bolts }, hit.destroyed);
  next = applyEnemyContacts(next);
  return { ...next, enemies: next.enemies.filter((enemy) => enemy.y - enemy.height / 2 <= BOARD_HEIGHT) };
}

export function updateShooter(
  state: ShooterState,
  seconds: number,
  controls: ShooterControls = NO_CONTROLS,
  random: () => number = Math.random,
): ShooterState {
  if (state.status !== "running" || seconds <= 0) return state;
  let next: ShooterState = { ...state, events: [] };
  let remaining = Math.min(seconds, 0.25);
  while (next.status === "running" && remaining > 0) {
    const step = Math.min(remaining, 1 / 60);
    next = updateStep(next, step, controls, random);
    remaining -= step;
  }
  return next.status === "dead" ? { ...next, bolts: [] } : next;
}
