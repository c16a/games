import type { GameContext, GameInstance } from "../../platform/game";
import { choicePreview, createVoyage, distanceFromHome, resourceBand, resolveChoice } from "./logic";
import { clearVoyage, loadVoyage, saveVoyage, type VoyageStorage } from "./persistence";
import type { ResourceBand, SceneChoice, VoyageState } from "./types";

function freshSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now();
  } catch {
    return Date.now();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
}

function bandLabel(band: ResourceBand): string {
  return band === "comfortable" ? "Comfortable" : band === "low" ? "Low" : "Empty — time to restore";
}

function availableStorage(): VoyageStorage {
  try {
    return localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
}

function choiceMarkup(choice: SceneChoice, index: number): string {
  const reasonId = `voyage-choice-reason-${index}`;
  return `
    <div class="voyage-choice ${choice.available ? "" : "voyage-choice--unavailable"}">
      <button
        type="button"
        data-voyage-choice="${escapeHtml(choice.id)}"
        ${choice.available ? "" : "disabled"}
        ${choice.unavailableReason ? `aria-describedby="${reasonId}"` : ""}
      >
        <span class="voyage-choice-icon" aria-hidden="true">${choice.action === "travel" ? choice.title.startsWith("Walk") ? "🚶" : "🚌" : choice.action === "eat" ? "🥣" : choice.action === "work" ? "🌱" : choice.action === "recover" || choice.action === "rest" ? "📖" : "✨"}</span>
        <span class="voyage-choice-copy"><strong>${escapeHtml(choice.title)}</strong><span>${escapeHtml(choicePreview(choice))}</span></span>
        <span class="voyage-choice-arrow" aria-hidden="true">→</span>
      </button>
      ${choice.unavailableReason ? `<p id="${reasonId}">Not today: ${escapeHtml(choice.unavailableReason)}</p>` : ""}
    </div>`;
}

export function mount({ container, exit }: GameContext): GameInstance {
  const storage = availableStorage();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let state = loadVoyage(storage) ?? createVoyage(freshSeed());
  let journalOpen = false;
  let resetOpen = false;
  let resolving = false;

  container.innerHTML = `
    <main class="game-page voyage-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-voyage-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow voyage-eyebrow">A story with no finish line</span>
          <h1>Endless Voyage</h1>
        </div>
        <button class="icon-button" type="button" data-voyage-action="new" aria-label="Begin a new voyage">↻</button>
      </header>

      <section class="voyage-game" aria-label="Mira's endless voyage">
        <div class="voyage-banner">
          <div class="voyage-banner-icon" aria-hidden="true">🧭</div>
          <div>
            <p class="mission-title">Follow curiosity, not a finish line.</p>
            <p class="mission-copy">Every rest, friendship, and detour belongs in the story.</p>
          </div>
          <button class="voyage-journal-button" type="button" data-voyage-action="journal" aria-expanded="false">📔 Journal</button>
        </div>

        <div class="voyage-workspace">
          <div class="voyage-milestones" aria-label="Voyage milestones">
            <div><span>Day</span><strong data-voyage-day></strong></div>
            <div><span>From home</span><strong data-voyage-distance></strong></div>
            <div><span>Money</span><strong data-voyage-money></strong></div>
          </div>

          <div class="voyage-resources" aria-label="How Mira feels">
            <div class="voyage-resource">
              <div><span>⚡ Energy</span><strong data-voyage-energy></strong></div>
              <div class="voyage-meter"><i data-voyage-energy-bar></i></div>
              <small data-voyage-energy-band></small>
            </div>
            <div class="voyage-resource">
              <div><span>☀ Happiness</span><strong data-voyage-happiness></strong></div>
              <div class="voyage-meter voyage-meter--happy"><i data-voyage-happiness-bar></i></div>
              <small data-voyage-happiness-band></small>
            </div>
          </div>

          <p class="voyage-outcome" data-voyage-outcome aria-live="polite"></p>

          <article class="voyage-scene" aria-labelledby="voyage-scene-title">
            <p class="voyage-place" data-voyage-place></p>
            <h2 id="voyage-scene-title" data-voyage-title tabindex="-1"></h2>
            <p class="voyage-scene-text" data-voyage-scene-text></p>
          </article>

          <section class="voyage-decisions" aria-labelledby="voyage-decisions-title">
            <h3 id="voyage-decisions-title">What feels right today?</h3>
            <div data-voyage-choices></div>
          </section>

          <section class="voyage-journal" data-voyage-journal hidden aria-labelledby="voyage-journal-title">
            <div class="voyage-journal-heading">
              <div><span class="eyebrow voyage-eyebrow">Remembered along the way</span><h2 id="voyage-journal-title">Travel journal</h2></div>
              <button class="text-button" type="button" data-voyage-action="journal">Close journal</button>
            </div>
            <p data-voyage-journal-summary></p>
            <ol data-voyage-journal-list></ol>
          </section>
        </div>
      </section>

      <div class="celebration voyage-reset" data-voyage-reset hidden>
        <div class="result-card voyage-reset-card" role="dialog" aria-modal="true" aria-labelledby="voyage-reset-title">
          <span class="voyage-reset-icon" aria-hidden="true">🗺️</span>
          <p class="eyebrow voyage-eyebrow">A fresh map</p>
          <h2 id="voyage-reset-title">Begin another voyage?</h2>
          <p>This will close Mira's current journal and start a completely new story. Her present voyage is safe until you confirm.</p>
          <div class="result-actions">
            <button class="check-button voyage-confirm-reset" type="button" data-voyage-reset-action="confirm">Begin new voyage</button>
            <button class="text-button" type="button" data-voyage-reset-action="cancel">Keep this voyage</button>
          </div>
        </div>
      </div>
    </main>`;

  const dayElement = container.querySelector<HTMLElement>("[data-voyage-day]");
  const distanceElement = container.querySelector<HTMLElement>("[data-voyage-distance]");
  const moneyElement = container.querySelector<HTMLElement>("[data-voyage-money]");
  const energyElement = container.querySelector<HTMLElement>("[data-voyage-energy]");
  const happinessElement = container.querySelector<HTMLElement>("[data-voyage-happiness]");
  const energyBar = container.querySelector<HTMLElement>("[data-voyage-energy-bar]");
  const happinessBar = container.querySelector<HTMLElement>("[data-voyage-happiness-bar]");
  const energyBand = container.querySelector<HTMLElement>("[data-voyage-energy-band]");
  const happinessBand = container.querySelector<HTMLElement>("[data-voyage-happiness-band]");
  const outcomeElement = container.querySelector<HTMLElement>("[data-voyage-outcome]");
  const placeElement = container.querySelector<HTMLElement>("[data-voyage-place]");
  const titleElement = container.querySelector<HTMLElement>("[data-voyage-title]");
  const sceneTextElement = container.querySelector<HTMLElement>("[data-voyage-scene-text]");
  const choicesElement = container.querySelector<HTMLElement>("[data-voyage-choices]");
  const journalElement = container.querySelector<HTMLElement>("[data-voyage-journal]");
  const journalSummary = container.querySelector<HTMLElement>("[data-voyage-journal-summary]");
  const journalList = container.querySelector<HTMLOListElement>("[data-voyage-journal-list]");
  const resetElement = container.querySelector<HTMLElement>("[data-voyage-reset]");
  if (!dayElement || !distanceElement || !moneyElement || !energyElement || !happinessElement || !energyBar || !happinessBar || !energyBand || !happinessBand || !outcomeElement || !placeElement || !titleElement || !sceneTextElement || !choicesElement || !journalElement || !journalSummary || !journalList || !resetElement) {
    throw new Error("Endless Voyage UI could not be created");
  }

  function renderResource(element: HTMLElement, bar: HTMLElement, bandElement: HTMLElement, value: number): void {
    const band = resourceBand(value);
    element.textContent = `${value} / 100`;
    bar.style.width = `${value}%`;
    bar.dataset.band = band;
    bandElement.textContent = bandLabel(band);
  }

  function renderJournal(): void {
    journalElement!.hidden = !journalOpen;
    container.querySelectorAll<HTMLButtonElement>('[data-voyage-action="journal"]').forEach((button) => button.setAttribute("aria-expanded", String(journalOpen)));
    journalSummary!.textContent = `${Object.keys(state.locations).length} places mapped · ${Object.keys(state.friends).length} friends remembered · greatest distance ${state.greatestDistance} km`;
    journalList!.innerHTML = [...state.journal].reverse().map((entry) => `
      <li><span>Day ${entry.day} · ${escapeHtml(entry.place)}</span><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.text)}</p></li>`).join("");
  }

  function render(): void {
    const location = state.locations[state.currentLocationId]!;
    dayElement!.textContent = String(state.day);
    distanceElement!.textContent = `${distanceFromHome(location)} km`;
    moneyElement!.textContent = `₹${state.money}`;
    renderResource(energyElement!, energyBar!, energyBand!, state.energy);
    renderResource(happinessElement!, happinessBar!, happinessBand!, state.happiness);
    outcomeElement!.textContent = state.lastOutcome;
    placeElement!.textContent = `Day ${state.day} — ${location.name} · ${distanceFromHome(location)} km from home · ${location.season} · ${location.weather}`;
    titleElement!.textContent = state.currentScene.title;
    sceneTextElement!.textContent = state.currentScene.text;
    choicesElement!.innerHTML = state.currentScene.choices.map(choiceMarkup).join("");
    renderJournal();
  }

  function resolve(choiceId: string): void {
    if (resolving) return;
    const selected = state.currentScene.choices.find(({ id }) => id === choiceId);
    if (!selected?.available) return;
    resolving = true;
    const previousTurn = state.turn;
    state = resolveChoice(state, choiceId);
    if (state.turn !== previousTurn) saveVoyage(storage, state);
    render();
    titleElement!.focus({ preventScroll: true });
    resolving = false;
  }

  function openReset(): void {
    resetOpen = true;
    resetElement!.hidden = false;
    resetElement!.querySelector<HTMLButtonElement>('[data-voyage-reset-action="cancel"]')?.focus();
  }

  function closeReset(): void {
    resetOpen = false;
    resetElement!.hidden = true;
    container.querySelector<HTMLButtonElement>('[data-voyage-action="new"]')?.focus();
  }

  function beginNewVoyage(): void {
    clearVoyage(storage);
    state = createVoyage(freshSeed());
    saveVoyage(storage, state);
    journalOpen = false;
    resetOpen = false;
    resetElement!.hidden = true;
    render();
    titleElement!.focus();
  }

  function onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const choiceButton = target.closest<HTMLButtonElement>("[data-voyage-choice]");
    const action = target.closest<HTMLElement>("[data-voyage-action]")?.dataset.voyageAction;
    const resetAction = target.closest<HTMLElement>("[data-voyage-reset-action]")?.dataset.voyageResetAction;
    if (choiceButton) resolve(choiceButton.dataset.voyageChoice ?? "");
    else if (action === "exit") exit();
    else if (action === "journal") { journalOpen = !journalOpen; renderJournal(); if (journalOpen) journalElement!.scrollIntoView({ block: "start", behavior: reducedMotion ? "auto" : "smooth" }); }
    else if (action === "new") openReset();
    else if (resetAction === "confirm") beginNewVoyage();
    else if (resetAction === "cancel") closeReset();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && resetOpen) {
      event.preventDefault();
      closeReset();
    }
  }

  container.addEventListener("click", onClick);
  window.addEventListener("keydown", onKeyDown);
  render();

  return {
    destroy() {
      container.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
      container.innerHTML = "";
    },
  };
}
