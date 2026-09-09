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
];

let activeGame: GameInstance | undefined;

function navigate(route: "home" | "mastermind"): void {
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

  app.querySelector<HTMLElement>('[data-game="mastermind"]')?.addEventListener("click", () => navigate("mastermind"));
}

async function renderGame(): Promise<void> {
  activeGame?.destroy();
  app.innerHTML = '<div class="loading-game" role="status"><span>★</span><p>Getting your game ready…</p></div>';
  document.title = "Mastermind · Happy Arcade";
  const module = await import("./games/mastermind") as GameModule;
  activeGame = await module.mount({
    container: app,
    exit: () => navigate("home"),
  });
}

async function renderRoute(): Promise<void> {
  if (window.location.hash === "#mastermind") await renderGame();
  else renderPicker();
}

window.addEventListener("hashchange", () => void renderRoute());
void renderRoute();
