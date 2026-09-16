import type { GameInstance } from "./platform/game";
import {
  GameLoadingCoordinator,
  LatestRouteGuard,
  type ConnectionHints,
  type GameDefinition,
  type PrefetchIntent,
  type RouteRequest,
} from "./platform/game-loader";
import {
  oppositeTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  type Theme,
} from "./platform/theme";

const appElement = document.querySelector<HTMLElement>("#app");
if (!appElement) throw new Error("App root is missing");
const app: HTMLElement = appElement;
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
let activeTheme = resolveTheme(readStoredTheme(window.localStorage), systemTheme.matches);

function applyTheme(theme: Theme): void {
  activeTheme = theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "dark" ? "#14101f" : "#fff8e8",
  );
  window.dispatchEvent(new CustomEvent<Theme>("happyarcade:themechange", { detail: theme }));
}

function createThemeToggle(): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "theme-toggle";
  button.type = "button";

  const update = (): void => {
    const nextTheme = oppositeTheme(activeTheme);
    button.innerHTML = `
      <span class="theme-toggle-icon" aria-hidden="true">${activeTheme === "dark" ? "☀️" : "🌙"}</span>
      <span class="theme-toggle-label">${nextTheme === "dark" ? "Dark" : "Light"}</span>`;
    button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
    button.title = `Switch to ${nextTheme} mode`;
  };

  update();
  button.addEventListener("click", () => {
    applyTheme(oppositeTheme(activeTheme));
    storeTheme(activeTheme, window.localStorage);
    update();
  });
  return button;
}

function installThemeToggle(header: HTMLElement): void {
  const existingTrailingItem = header.lastElementChild;
  if (!existingTrailingItem) return;

  const actions = document.createElement("div");
  actions.className = "header-actions";
  existingTrailingItem.replaceWith(actions);
  actions.append(existingTrailingItem, createThemeToggle());
}

applyTheme(activeTheme);

systemTheme.addEventListener("change", ({ matches }) => {
  if (readStoredTheme(window.localStorage)) return;
  applyTheme(matches ? "dark" : "light");
  document.querySelector<HTMLButtonElement>(".theme-toggle")?.replaceWith(createThemeToggle());
});

const games = [
  {
    id: "mastermind",
    engine: "dom",
    load: () => import("./games/mastermind"),
    name: "Mastermind",
    description: "Crack the secret rainbow code!",
    badge: "Puzzle",
    icon: "🧠",
    accent: "#ff4f81",
  },
  {
    id: "glow-grid",
    engine: "dom",
    load: () => import("./games/glow-grid"),
    name: "Glow Grid",
    description: "Switch off every light using clever moves!",
    badge: "Logic",
    icon: "💡",
    accent: "#20c997",
  },
  {
    id: "tower-tangle",
    engine: "dom",
    load: () => import("./games/tower-tangle"),
    name: "Tower Tangle",
    description: "Move the whole tower with clever planning!",
    badge: "Strategy",
    icon: "🗼",
    accent: "#ff922b",
  },
  {
    id: "color-dash",
    engine: "dom",
    load: () => import("./games/color-dash"),
    name: "Color Dash",
    description: "Outsmart the words and race the clock!",
    badge: "Reflex",
    icon: "🌈",
    accent: "#4dabf7",
  },
  {
    id: "2048",
    engine: "kaplay",
    load: () => import("./games/2048"),
    name: "2048",
    description: "Slide, match, and grow a mighty number!",
    badge: "Numbers",
    icon: "🔢",
    accent: "#ffd43b",
  },
  {
    id: "snake",
    engine: "kaplay",
    load: () => import("./games/snake"),
    name: "Snake",
    description: "Nibble snacks and plan around your growing tail!",
    badge: "Reflexes",
    icon: "🐍",
    accent: "#51cf66",
  },
  {
    id: "breakout",
    engine: "kaplay",
    load: () => import("./games/breakout"),
    name: "Breakout",
    description: "Bounce, aim, and smash the rainbow brick wall!",
    badge: "Reflexes",
    icon: "🧱",
    accent: "#ff6b6b",
  },
  {
    id: "tetris",
    engine: "kaplay",
    load: () => import("./games/tetris"),
    name: "Tetris",
    description: "Fit falling shapes and clear colorful lines!",
    badge: "Spatial",
    icon: "🧩",
    accent: "#748ffc",
  },
  {
    id: "lunar-lander",
    engine: "kaplay",
    load: () => import("./games/lunar-lander"),
    name: "Lunar Lander",
    description: "Balance thrust and gravity for a perfect touchdown!",
    badge: "Physics",
    icon: "🚀",
    accent: "#845ef7",
  },
  {
    id: "space-shooter",
    engine: "kaplay",
    load: () => import("./games/space-shooter"),
    name: "Star Squadron",
    description: "Dodge, blast, and upgrade through endless space!",
    badge: "Arcade",
    icon: "🛸",
    accent: "#22b8cf",
  },
  {
    id: "endless-voyage",
    engine: "dom",
    load: () => import("./games/endless-voyage"),
    name: "Endless Voyage",
    description: "Choose each day and fill a journal with discoveries!",
    badge: "Story",
    icon: "🧭",
    accent: "#e8590c",
  },
  {
    id: "chess",
    engine: "kaplay",
    load: () => import("./games/chess"),
    name: "Chess",
    description: "Plan ahead and challenge a local computer opponent!",
    badge: "Strategy",
    icon: "♞",
    accent: "#2f9e44",
  },
  {
    id: "carrom",
    engine: "kaplay",
    load: () => import("./games/carrom"),
    name: "Carrom",
    description: "Pull, aim, and pocket coins against the computer!",
    badge: "Aim + Skill",
    icon: "◎",
    accent: "#f59f00",
  },
  {
    id: "flappy-bird",
    engine: "kaplay",
    load: () => import("./games/flappy-bird"),
    name: "Flappy Bird",
    description: "Tap to flutter through a sky full of tricky gaps!",
    badge: "One Tap",
    icon: "🐤",
    accent: "#22b8cf",
  },
] as const satisfies readonly GameDefinition[];

let activeGame: GameInstance | undefined;
let activeLoad: AbortController | undefined;

type GameId = (typeof games)[number]["id"];
type Route = "home" | GameId;

const gameLoading = new GameLoadingCoordinator<GameId>(games, () => import("kaplay"));
const routeGuard = new LatestRouteGuard();

function isGameId(value: string): value is GameId {
  return games.some((game) => game.id === value);
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

  const header = app.querySelector<HTMLElement>(".site-header");
  if (header) installThemeToggle(header);

  app.querySelectorAll<HTMLElement>("[data-game]").forEach((card) => {
    const gameId = card.dataset.game;
    if (!gameId || !isGameId(gameId)) return;

    const connection = (navigator as Navigator & { connection?: ConnectionHints }).connection;
    const prefetch = (intent: PrefetchIntent): void => {
      gameLoading.prefetch(gameId, intent, connection);
    };

    card.addEventListener("pointerenter", () => prefetch("hover"));
    card.addEventListener("focus", () => prefetch("focus"));
    card.addEventListener("pointerdown", () => prefetch("pointerdown"));
    card.addEventListener("click", () => {
      navigate(gameId);
    });
  });
}

async function renderGame(gameId: GameId, request: RouteRequest): Promise<void> {
  activeGame?.destroy();
  activeGame = undefined;
  activeLoad = new AbortController();
  const load = activeLoad;
  app.innerHTML = '<div class="loading-game" role="status"><span>★</span><p>Getting your game ready…</p></div>';
  const game = games.find(({ id }) => id === gameId);
  document.title = `${game?.name ?? "Game"} · Happy Arcade`;
  const prepared = gameLoading.prepare(gameId);
  const module = await prepared.moduleReady;
  if (!request.isCurrent() || load.signal.aborted) return;

  const instance = await module.mount({
    container: app,
    exit: () => navigate("home"),
    kaplayReady: prepared.kaplayReady,
    signal: load.signal,
  });
  if (!request.isCurrent() || load.signal.aborted) {
    instance.destroy();
    return;
  }
  activeGame = instance;
  const header = app.querySelector<HTMLElement>(".game-header");
  if (header) installThemeToggle(header);
}

async function renderRoute(): Promise<void> {
  const request = routeGuard.begin();
  activeLoad?.abort();
  activeLoad = undefined;
  window.scrollTo(0, 0);
  const route = window.location.hash.slice(1);
  if (isGameId(route)) await renderGame(route, request);
  else renderPicker();
}

window.addEventListener("hashchange", () => void renderRoute());
void renderRoute();
