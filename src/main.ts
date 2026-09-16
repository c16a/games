import type { GameCard, GameInstance, GameModule } from "./platform/game";

const appElement = document.querySelector<HTMLElement>("#app");
if (!appElement) throw new Error("App root is missing");
const app: HTMLElement = appElement;

const games: GameCard[] = [
  {
    id: "mastermind",
    name: "Mastermind",
    description: "Crack the secret rainbow code!",
    badge: "Puzzle",
    icon: "🧠",
    accent: "#ff4f81",
  },
  {
    id: "glow-grid",
    name: "Glow Grid",
    description: "Switch off every light using clever moves!",
    badge: "Logic",
    icon: "💡",
    accent: "#20c997",
  },
  {
    id: "tower-tangle",
    name: "Tower Tangle",
    description: "Move the whole tower with clever planning!",
    badge: "Strategy",
    icon: "🗼",
    accent: "#ff922b",
  },
  {
    id: "color-dash",
    name: "Color Dash",
    description: "Outsmart the words and race the clock!",
    badge: "Reflex",
    icon: "🌈",
    accent: "#4dabf7",
  },
  {
    id: "2048",
    name: "2048",
    description: "Slide, match, and grow a mighty number!",
    badge: "Numbers",
    icon: "🔢",
    accent: "#ffd43b",
  },
  {
    id: "snake",
    name: "Snake",
    description: "Nibble snacks and plan around your growing tail!",
    badge: "Reflexes",
    icon: "🐍",
    accent: "#51cf66",
  },
  {
    id: "breakout",
    name: "Breakout",
    description: "Bounce, aim, and smash the rainbow brick wall!",
    badge: "Reflexes",
    icon: "🧱",
    accent: "#ff6b6b",
  },
  {
    id: "tetris",
    name: "Tetris",
    description: "Fit falling shapes and clear colorful lines!",
    badge: "Spatial",
    icon: "🧩",
    accent: "#748ffc",
  },
  {
    id: "lunar-lander",
    name: "Lunar Lander",
    description: "Balance thrust and gravity for a perfect touchdown!",
    badge: "Physics",
    icon: "🚀",
    accent: "#845ef7",
  },
  {
    id: "space-shooter",
    name: "Star Squadron",
    description: "Dodge, blast, and upgrade through endless space!",
    badge: "Arcade",
    icon: "🛸",
    accent: "#22b8cf",
  },
  {
    id: "endless-voyage",
    name: "Endless Voyage",
    description: "Choose each day and fill a journal with discoveries!",
    badge: "Story",
    icon: "🧭",
    accent: "#e8590c",
  },
  {
    id: "chess",
    name: "Chess",
    description: "Plan ahead and challenge a local computer opponent!",
    badge: "Strategy",
    icon: "♞",
    accent: "#2f9e44",
  },
  {
    id: "carrom",
    name: "Carrom",
    description: "Pull, aim, and pocket coins against the computer!",
    badge: "Aim + Skill",
    icon: "◎",
    accent: "#f59f00",
  },
  {
    id: "flappy-bird",
    name: "Flappy Bird",
    description: "Tap to flutter through a sky full of tricky gaps!",
    badge: "One Tap",
    icon: "🐤",
    accent: "#22b8cf",
  },
];

let activeGame: GameInstance | undefined;
let kaplayPreloadScheduled = false;

type GameId = "mastermind" | "glow-grid" | "tower-tangle" | "color-dash" | "2048" | "snake" | "breakout" | "tetris" | "lunar-lander" | "space-shooter" | "endless-voyage" | "chess" | "carrom" | "flappy-bird";
type Route = "home" | GameId;

const gameLoaders: Record<GameId, () => Promise<GameModule>> = {
  mastermind: () => import("./games/mastermind"),
  "glow-grid": () => import("./games/glow-grid"),
  "tower-tangle": () => import("./games/tower-tangle"),
  "color-dash": () => import("./games/color-dash"),
  "2048": () => import("./games/2048"),
  snake: () => import("./games/snake"),
  breakout: () => import("./games/breakout"),
  tetris: () => import("./games/tetris"),
  "lunar-lander": () => import("./games/lunar-lander"),
  "space-shooter": () => import("./games/space-shooter"),
  "endless-voyage": () => import("./games/endless-voyage"),
  chess: () => import("./games/chess"),
  carrom: () => import("./games/carrom"),
  "flappy-bird": () => import("./games/flappy-bird"),
};

function isGameId(value: string): value is GameId {
  return value in gameLoaders;
}

function preloadKaplayInBackground(): void {
  if (kaplayPreloadScheduled) return;
  kaplayPreloadScheduled = true;

  const preload = (): void => {
    void import("kaplay").catch(() => {
      // Allow another homepage visit to retry after a transient load failure.
      kaplayPreloadScheduled = false;
    });
  };

  const requestIdle = (window as unknown as {
    requestIdleCallback?: Window["requestIdleCallback"];
  }).requestIdleCallback;

  if (requestIdle) {
    requestIdle.call(window, preload, { timeout: 2_000 });
  } else {
    globalThis.setTimeout(preload, 0);
  }
}

function navigate(route: Route): void {
  window.location.hash = route === "home" ? "" : route;
  if (route === "home" && !window.location.hash) void renderRoute();
}

function renderPicker(): void {
  activeGame?.destroy();
  activeGame = undefined;
  document.title = "Happy Arcade";
  app.innerHTML = `
    <main class="picker-page">
      <header class="site-header">
        <a class="brand" href="#" aria-label="Happy Arcade home">
          <span class="brand-mark" aria-hidden="true">★</span>
          <span>Happy Arcade</span>
        </a>
        <div class="tiny-badge"><span aria-hidden="true">●</span> Play anywhere</div>
      </header>

      <section class="picker-intro" aria-labelledby="picker-title">
        <div class="intro-copy">
          <span class="eyebrow">Pick • Play • Smile</span>
          <h1 id="picker-title">What should we play?</h1>
          <p>Choose a game and jump right in. No sign-up, no waiting.</p>
        </div>
        <div class="orbit-doodle" aria-hidden="true">
          <span class="orbit orbit--one">✦</span>
          <span class="orbit orbit--two">●</span>
          <span class="orbit orbit--three">★</span>
          <span class="orbit-center">🎮</span>
        </div>
      </section>

      <section class="game-shelf" aria-label="Games">
        ${games.map((game) => `
          <button class="game-card" type="button" data-game="${game.id}" style="--card-accent:${game.accent}">
            <span class="game-art" aria-hidden="true">
              <span class="art-bubble art-bubble--one"></span>
              <span class="art-bubble art-bubble--two"></span>
              <span class="game-icon">${game.icon}</span>
              <span class="mini-pegs"><i></i><i></i><i></i><i></i></span>
            </span>
            <span class="game-card-content">
              <span class="game-badge">${game.badge}</span>
              <strong>${game.name}</strong>
              <span>${game.description}</span>
              <span class="play-label">Play now <b aria-hidden="true">→</b></span>
            </span>
          </button>`).join("")}
        <div class="coming-card" aria-label="More games coming soon">
          <span aria-hidden="true">＋</span>
          <strong>More games soon!</strong>
        </div>
      </section>
    </main>`;

  app.querySelectorAll<HTMLElement>("[data-game]").forEach((card) => {
    card.addEventListener("click", () => {
      const gameId = card.dataset.game;
      if (gameId && isGameId(gameId)) navigate(gameId);
    });
  });

  preloadKaplayInBackground();
}

async function renderGame(gameId: GameId): Promise<void> {
  activeGame?.destroy();
  app.innerHTML = '<div class="loading-game" role="status"><span>★</span><p>Getting your game ready…</p></div>';
  const game = games.find(({ id }) => id === gameId);
  document.title = `${game?.name ?? "Game"} · Happy Arcade`;
  const module = await gameLoaders[gameId]();
  activeGame = await module.mount({
    container: app,
    exit: () => navigate("home"),
  });
}

async function renderRoute(): Promise<void> {
  window.scrollTo(0, 0);
  const route = window.location.hash.slice(1);
  if (isGameId(route)) await renderGame(route);
  else renderPicker();
}

window.addEventListener("hashchange", () => void renderRoute());
void renderRoute();
