export interface GameContext {
  container: HTMLElement;
  exit: () => void;
}

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
