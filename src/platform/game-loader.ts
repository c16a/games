import type { GameCard, GameModule, KaplayModule } from "./game";

export type GameEngine = "dom" | "kaplay";
export type PrefetchIntent = "hover" | "focus" | "pointerdown";

export interface ConnectionHints {
  saveData?: boolean;
  effectiveType?: string;
}

export interface GameDefinition<GameId extends string = string> extends GameCard {
  id: GameId;
  engine: GameEngine;
  load: () => Promise<GameModule>;
}

export interface PreparedGame<GameId extends string> {
  definition: GameDefinition<GameId>;
  moduleReady: Promise<GameModule>;
  kaplayReady?: Promise<KaplayModule>;
}

function cachePromise<Key, Value>(
  cache: Map<Key, Promise<Value>>,
  key: Key,
  load: () => Promise<Value>,
): Promise<Value> {
  const cached = cache.get(key);
  if (cached) return cached;

  let pending: Promise<Value>;
  try {
    pending = Promise.resolve(load());
  } catch (error) {
    pending = Promise.reject(error);
  }
  cache.set(key, pending);
  void pending.then(undefined, () => {
    if (cache.get(key) === pending) cache.delete(key);
  });
  return pending;
}

export function allowsIntentPrefetch(intent: PrefetchIntent, connection?: ConnectionHints): boolean {
  if (intent === "pointerdown") return true;
  return !connection?.saveData && !connection?.effectiveType?.toLowerCase().includes("2g");
}

export class GameLoadingCoordinator<GameId extends string> {
  readonly #definitions: ReadonlyMap<GameId, GameDefinition<GameId>>;
  readonly #modulePromises = new Map<GameId, Promise<GameModule>>();
  readonly #enginePromises = new Map<GameEngine, Promise<KaplayModule>>();

  constructor(
    definitions: readonly GameDefinition<GameId>[],
    private readonly loadKaplay: () => Promise<KaplayModule>,
  ) {
    this.#definitions = new Map(definitions.map((definition) => [definition.id, definition]));
  }

  prepare(gameId: GameId): PreparedGame<GameId> {
    const definition = this.#definitions.get(gameId);
    if (!definition) throw new Error(`Unknown game: ${gameId}`);

    const moduleReady = cachePromise(this.#modulePromises, gameId, definition.load);
    const kaplayReady = definition.engine === "kaplay"
      ? cachePromise(this.#enginePromises, "kaplay", this.loadKaplay)
      : undefined;

    return { definition, moduleReady, kaplayReady };
  }

  prefetch(gameId: GameId, intent: PrefetchIntent, connection?: ConnectionHints): boolean {
    if (!allowsIntentPrefetch(intent, connection)) return false;
    const prepared = this.prepare(gameId);
    void prepared.moduleReady.catch(() => undefined);
    void prepared.kaplayReady?.catch(() => undefined);
    return true;
  }
}

export interface RouteRequest {
  isCurrent: () => boolean;
}

export class LatestRouteGuard {
  #revision = 0;

  begin(): RouteRequest {
    const revision = ++this.#revision;
    return { isCurrent: () => revision === this.#revision };
  }
}
