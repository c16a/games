import { describe, expect, test } from "bun:test";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  ENEMY_TYPES,
  SHOOTER_CONFIG,
  type Bolt,
  type Enemy,
  type ShooterState,
  applyEnemyContacts,
  boltDamage,
  boltsPerSecond,
  createInitialState,
  enemyForLevel,
  killsRequired,
  movePlayerTo,
  pauseGame,
  recordDestroyedEnemies,
  resumeGame,
  resolveBoltHit,
  resolveBoltHits,
  restartGame,
  scaledFrameSeconds,
  spawnInterval,
  startGame,
  updateShooter,
  waveSize,
} from "./logic";

function bolt(id: number, damage: number, x = 100): Bolt {
  return { id, damage, x, y: 100, width: 7, height: 18, speed: 470 };
}

function enemy(id: number, health: number, kind: "scout" | "cruiser" = "scout", x = 100): Enemy {
  return { ...enemyForLevel(kind, 1, id, x), y: 100, health, maxHealth: health };
}

function running(overrides: Partial<ShooterState> = {}): ShooterState {
  return { ...startGame(createInitialState()), ...overrides };
}

describe("Space Shooter progression", () => {
  test("uses the required geometric upgrade thresholds", () => {
    expect([1, 2, 3, 4, 5].map((level) => killsRequired(level))).toEqual([10, 15, 23, 34, 51]);
    expect(() => killsRequired(1, 10, 1)).toThrow();
  });

  test("carries excess kills through upgrades and increases all plane stats", () => {
    const base = running({ player: { ...createInitialState().player, health: 70, killsTowardUpgrade: 9 } });
    const upgraded = recordDestroyedEnemies(base, [enemy(1, 0), enemy(2, 0)]);
    expect(upgraded.player.level).toBe(2);
    expect(upgraded.player.killsTowardUpgrade).toBe(1);
    expect(upgraded.player.lifetimeKills).toBe(2);
    expect(upgraded.player.maxHealth).toBe(SHOOTER_CONFIG.baseHealth + SHOOTER_CONFIG.healthUpgradeBonus);
    expect(upgraded.player.health).toBe(105);
    expect(boltsPerSecond(upgraded.player.level)).toBe(2);
    expect(boltDamage(upgraded.player.level)).toBe(20);
  });

  test("can cross multiple upgrade thresholds in one award", () => {
    const destroyed = Array.from({ length: 25 }, (_, index) => enemy(index + 1, 0));
    const upgraded = recordDestroyedEnemies(running({ player: { ...createInitialState().player, health: 10 } }), destroyed);
    expect(upgraded.player.level).toBe(3);
    expect(upgraded.player.killsTowardUpgrade).toBe(0);
    expect(upgraded.player.lifetimeKills).toBe(25);
    expect(upgraded.player.health).toBe(23);
    expect(upgraded.player.maxHealth).toBe(130);
  });

  test("caps the 50-percent level-up refill at maximum health", () => {
    const base = running({ player: { ...createInitialState().player, killsTowardUpgrade: 9 } });
    const upgraded = recordDestroyedEnemies(base, [enemy(1, 0)]);
    expect(upgraded.player.health).toBe(upgraded.player.maxHealth);
    expect(upgraded.player.health).toBe(115);
  });

  test("keeps score independent from kill progress and deduplicates destruction", () => {
    const scout = enemy(1, 0, "scout");
    const cruiser = enemy(2, 0, "cruiser");
    const result = recordDestroyedEnemies(running(), [scout, scout, cruiser]);
    expect(result.score).toBe(ENEMY_TYPES.scout.pointValue + ENEMY_TYPES.cruiser.pointValue);
    expect(result.player.lifetimeKills).toBe(2);
  });
});

describe("Space Shooter bolt combat", () => {
  test("handles damage below, equal to, and above remaining health", () => {
    expect(resolveBoltHit(enemy(1, 50), 20)).toMatchObject({ enemy: { health: 30 }, destroyed: false });
    expect(resolveBoltHit(enemy(1, 40), 40)).toMatchObject({ enemy: { health: 0 }, destroyed: true });
    expect(resolveBoltHit(enemy(1, 30), 40)).toMatchObject({ enemy: { health: 0 }, destroyed: true });
  });

  test("retains accumulated damage across multiple hits", () => {
    const first = resolveBoltHit(enemy(1, 50), 20);
    const second = resolveBoltHit(first.enemy, 20);
    const third = resolveBoltHit(second.enemy, 10);
    expect(second.enemy.health).toBe(10);
    expect(second.destroyed).toBe(false);
    expect(third.destroyed).toBe(true);
  });

  test("five separate 40-damage bolts destroy five separate enemies", () => {
    const enemies = Array.from({ length: 5 }, (_, index) => enemy(index + 1, 40, "scout", 50 + index * 80));
    const bolts = enemies.map((target, index) => bolt(100 + index, 40, target.x));
    const result = resolveBoltHits(enemies, bolts);
    expect(result.destroyed).toHaveLength(5);
    expect(result.enemies).toHaveLength(0);
    expect(result.bolts).toHaveLength(0);
  });

  test("consumes a bolt after one hit and cannot score that enemy twice", () => {
    const target = enemy(1, 10);
    const hit = resolveBoltHits([target], [bolt(2, 10), bolt(3, 10)]);
    expect(hit.destroyed).toHaveLength(1);
    expect(hit.bolts).toHaveLength(1);
    const scored = recordDestroyedEnemies(running(), hit.destroyed);
    expect(scored.score).toBe(target.pointValue);
    expect(scored.player.lifetimeKills).toBe(1);
  });
});

describe("Space Shooter enemies and lifecycle", () => {
  test("runs at one-fifth speed during the touch-release decision window", () => {
    expect(scaledFrameSeconds(0.5, 0.2)).toBeCloseTo(0.1);
    expect(scaledFrameSeconds(0.5, 1)).toBe(0.5);
    expect(scaledFrameSeconds(0.5, 3)).toBe(0.5);
  });

  test("supports keyboard-style steering, bounded drag steering, and pause", () => {
    const initial = running();
    const steered = updateShooter(initial, 0.1, { left: false, right: true, up: true, down: false }, () => 0.9);
    expect(steered.player.x).toBeGreaterThan(initial.player.x);
    expect(steered.player.y).toBeLessThan(initial.player.y);

    const dragged = movePlayerTo(steered, -100, BOARD_HEIGHT + 100);
    expect(dragged.player.x).toBe(dragged.player.width / 2);
    expect(dragged.player.y).toBe(BOARD_HEIGHT - dragged.player.height / 2);

    const paused = pauseGame(dragged);
    expect(updateShooter(paused, 0.25)).toBe(paused);
    expect(resumeGame(paused).status).toBe("running");
  });

  test("small and large enemies apply different one-time contact damage", () => {
    const player = createInitialState().player;
    const scout = { ...enemyForLevel("scout", 1, 1, player.x), y: player.y };
    const cruiser = { ...enemyForLevel("cruiser", 1, 2, player.x), y: player.y };
    const smallHit = applyEnemyContacts(running({ enemies: [scout] }));
    const largeHit = applyEnemyContacts(running({ enemies: [cruiser] }));
    expect(smallHit.player.health).toBe(player.health - scout.collisionDamage);
    expect(largeHit.player.health).toBe(player.health - cruiser.collisionDamage);
    expect(largeHit.player.health).toBeLessThan(smallHit.player.health);
    expect(applyEnemyContacts(smallHit)).toBe(smallHit);
  });

  test("clamps pilot health to zero and ends combat", () => {
    const player = { ...createInitialState().player, health: 5 };
    const cruiser = { ...enemyForLevel("cruiser", 1, 2, player.x), y: player.y };
    const result = applyEnemyContacts(running({ player, enemies: [cruiser] }));
    expect(result.player.health).toBe(0);
    expect(result.status).toBe("dead");
    expect(result.enemies).toHaveLength(0);
  });

  test("higher levels create tougher enemies and heavier, faster waves", () => {
    const early = enemyForLevel("scout", 1);
    const late = enemyForLevel("scout", 8);
    expect(late.health).toBeGreaterThan(early.health);
    expect(late.collisionDamage).toBeGreaterThan(early.collisionDamage);
    expect(late.speed).toBeGreaterThan(early.speed);
    expect(spawnInterval(8)).toBeLessThan(spawnInterval(1));
    expect(waveSize(8)).toBeGreaterThan(waveSize(1));
  });

  test("automatic fire follows level exactly", () => {
    let state = running({ player: { ...createInitialState().player, level: 4 }, fireElapsed: 0.25 });
    state = updateShooter(state, 0.25, undefined, () => 0.9);
    expect(state.bolts).toHaveLength(2); // one immediate bolt plus one at 0.25 seconds
    expect(state.bolts.every(({ damage }) => damage === 40)).toBe(true);
    expect(boltsPerSecond(5)).toBe(5);
    expect(boltDamage(5)).toBe(50);
  });

  test("spawning is endless while alive, stops on death, and restart resets", () => {
    let state = running({ spawnElapsed: spawnInterval(1) });
    state = updateShooter(state, 0.01, undefined, () => 0.9);
    expect(state.enemies.length).toBeGreaterThan(0);
    const dead = { ...state, status: "dead" as const, bolts: [bolt(99, 10)] };
    expect(updateShooter(dead, 20, undefined, () => 0.9)).toBe(dead);
    const reset = restartGame();
    expect(reset.status).toBe("ready");
    expect(reset.enemies).toHaveLength(0);
    expect(reset.bolts).toHaveLength(0);
    expect(reset.score).toBe(0);
    expect(reset.player.level).toBe(1);
    expect(reset.player.x).toBe(BOARD_WIDTH / 2);
    expect(reset.player.y).toBeLessThan(BOARD_HEIGHT);
  });
});
