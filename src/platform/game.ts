export interface GameContext {
  container: HTMLElement;
  exit: () => void;
  kaplayReady?: Promise<KaplayModule>;
  signal?: AbortSignal;
}

export type KaplayModule = typeof import("kaplay");

export interface GameInstance {
  destroy: () => void;
}

export interface GameModule {
  mount: (context: GameContext) => GameInstance | Promise<GameInstance>;
}

export interface GameCard {
  id: string;
  name: string;
  description: string;
  badge: string;
  icon: string;
  accent: string;
}
