export type Direction = "up" | "down" | "left" | "right";
export type Point = { x: number; y: number };
export const MAZE = [
  "###################",
  "#o.......#.......o#",
  "#.##.###.#.###.##.#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.###.#.###.####",
  "#......     ......#",
  ".......#   #.......",
  "#......#####......#",
  "####.#.......#.####",
  "#....#.#####.#....#",
  "#.##...........##.#",
  "#o.#.###.#.###.#.o#",
  "#........ ........#",
  "###################",
];
export const WIDTH = MAZE[0]!.length;
export const HEIGHT = MAZE.length;
export const START: Point = { x: 9, y: 14 };
const HOMES: Point[] = [{ x: 8, y: 7 }, { x: 9, y: 7 }, { x: 10, y: 7 }, { x: 9, y: 8 }];
const DELTAS: Record<Direction, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
export const key = (p: Point): string => `${p.x},${p.y}`;
export const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
export function neighbor(p: Point, direction: Direction): Point | undefined {
  const delta = DELTAS[direction];
  const next = { x: (p.x + delta.x + WIDTH) % WIDTH, y: p.y + delta.y };
  return MAZE[next.y]?.[next.x] !== undefined && MAZE[next.y]![next.x] !== "#" ? next : undefined;
}
export type State = {
  player: Point; direction: Direction; queued: Direction; ghosts: Point[];
  pellets: Set<string>; powers: Set<string>; score: number; lives: number; level: number;
  status: "ready" | "running" | "paused" | "won" | "lost";
  tick: number; power: number; shield: number; combo: number;
};
export function createState(level = 1, score = 0, lives = 3): State {
  const pellets = new Set<string>();
  const powers = new Set<string>();
  MAZE.forEach((row, y) => [...row].forEach((tile, x) => {
    if (tile === "." || tile === "o") pellets.add(key({ x, y }));
    if (tile === "o") powers.add(key({ x, y }));
  }));
  return { player: { ...START }, direction: "left", queued: "left", ghosts: HOMES.map(p => ({ ...p })), pellets, powers, score, lives, level, status: "ready", tick: 0, power: 0, shield: 12, combo: 0 };
}
export function nextLevel(state: State): State {
  return state.status === "won" ? createState(state.level + 1, state.score, state.lives) : state;
}
export function togglePause(state: State): void {
  if (state.status === "running") state.status = "paused";
  else if (state.status === "paused") state.status = "running";
}
function distances(target: Point): Map<string, number> {
  const result = new Map([[key(target), 0]]);
  const queue = [target];
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i]!;
    for (const direction of Object.keys(DELTAS) as Direction[]) {
      const next = neighbor(point, direction);
      if (!next || result.has(key(next))) continue;
      result.set(key(next), result.get(key(point))! + 1);
      queue.push(next);
    }
  }
  return result;
}
/** One fixed simulation step. Inputs queue turns until the next open junction. */
export function step(state: State): void {
  if (state.status !== "running") return;
  state.tick++;
  state.power = Math.max(0, state.power - 1);
  state.shield = Math.max(0, state.shield - 1);
  if (neighbor(state.player, state.queued)) state.direction = state.queued;
  state.player = neighbor(state.player, state.direction) ?? state.player;
  const tile = key(state.player);
  if (state.pellets.delete(tile)) {
    state.score += state.powers.has(tile) ? 50 : 10;
    if (state.powers.delete(tile)) { state.power = 55; state.combo = 0; }
  }
  const oldGhosts = state.ghosts.map(p => ({ ...p }));
  if (state.tick % 2 === 0) {
    const chase = distances(state.player);
    state.ghosts = state.ghosts.map((ghost, index) => {
      const options = (Object.keys(DELTAS) as Direction[]).map(d => neighbor(ghost, d)).filter((p): p is Point => !!p);
      // Rotate tie breaks so the four ghosts take different routes.
      const rotated = [...options.slice(index % options.length), ...options.slice(0, index % options.length)];
      rotated.sort((a, b) => ((chase.get(key(a)) ?? 999) - (chase.get(key(b)) ?? 999)) * (state.power > 0 ? -1 : 1));
      return rotated[0] ?? ghost;
    });
  }
  for (let i = 0; i < state.ghosts.length; i++) {
    const ghost = state.ghosts[i]!;
    // Check the tile entered as well as the ghost's destination, including swaps.
    if (!same(state.player, ghost) && !same(state.player, oldGhosts[i]!)) continue;
    if (state.power > 0) {
      state.score += 200 * 2 ** Math.min(state.combo++, 3);
      state.ghosts[i] = { ...HOMES[i]! };
    } else if (state.shield === 0) {
      state.lives--;
      state.power = 0;
      state.player = { ...START };
      state.ghosts = HOMES.map(p => ({ ...p }));
      state.direction = state.queued = "left";
      state.shield = 12;
      state.status = state.lives === 0 ? "lost" : "ready";
      break;
    }
  }
  if (state.pellets.size === 0 && state.status !== "lost") state.status = "won";
}
export const stepSeconds = (level: number): number => Math.max(0.095, 0.17 - (level - 1) * 0.01);
