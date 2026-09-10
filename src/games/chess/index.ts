import type { Color, PieceSymbol, Square } from "chess.js";
import type { GameContext, GameInstance } from "../../platform/game";
import { DIFFICULTY_PROFILES } from "./difficulty";
import { StockfishEngine } from "./engine";
import {
  ALL_SQUARES,
  applyEngineMove,
  ChessGame,
  type ChessDifficulty,
  type ChessOutcome,
  type SideChoice,
} from "./logic";
import { clearSavedGame, loadGame, saveGame } from "./persistence";
import { BOARD_SIZE, ChessRenderer } from "./render";

type PlayState = "setup" | "loading" | "human-turn" | "promotion-selection" | "animating" | "ai-thinking" | "engine-error" | "finished";

interface PendingPromotion {
  from: Square;
  to: Square;
  dragPoint?: { x: number; y: number };
}

interface PointerGesture {
  pointerId: number;
  from: Square;
  startX: number;
  startY: number;
  dragging: boolean;
}

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const PROMOTION_PIECES = ["q", "r", "b", "n"] as const;
const PROMOTION_SYMBOLS: Record<Color, Record<(typeof PROMOTION_PIECES)[number], string>> = {
  w: { q: "♕", r: "♖", b: "♗", n: "♘" },
  b: { q: "♛", r: "♜", b: "♝", n: "♞" },
};

const OUTCOME_MESSAGES: Record<Exclude<ChessOutcome, null>, string> = {
  checkmate: "Checkmate",
  stalemate: "Draw by stalemate",
  repetition: "Draw by threefold repetition",
  "fifty-move": "Draw by the fifty-move rule",
  "insufficient-material": "Draw by insufficient material",
  draw: "Draw",
};

function colorName(color: Color): string {
  return color === "w" ? "White" : "Black";
}

function chooseSide(choice: SideChoice): Color {
  if (choice !== "random") return choice;
  const random = new Uint8Array(1);
  crypto.getRandomValues(random);
  return (random[0] ?? 0) % 2 === 0 ? "w" : "b";
}

function shiftSquare(square: Square, direction: "left" | "right" | "up" | "down", orientation: Color): Square {
  let file = square.charCodeAt(0) - 97;
  let rank = Number(square[1]);
  const sign = orientation === "w" ? 1 : -1;
  if (direction === "left") file -= sign;
  if (direction === "right") file += sign;
  if (direction === "up") rank += sign;
  if (direction === "down") rank -= sign;
  file = Math.max(0, Math.min(7, file));
  rank = Math.max(1, Math.min(8, rank));
  return `${String.fromCharCode(97 + file)}${rank}` as Square;
}

export async function mount({ container, exit }: GameContext): Promise<GameInstance> {
  const saved = loadGame();
  let destroyed = false;
  let playState: PlayState = "setup";
  let game: ChessGame | undefined;
  let engine = new StockfishEngine();
  let generation = 0;
  let selected: Square | undefined;
  let keyboardSquare: Square = "e2";
  let pendingPromotion: PendingPromotion | undefined;
  let pointerGesture: PointerGesture | undefined;
  let lastMove: { from: Square; to: Square } | undefined;
  let finalMessage = "";
  let aiPausedForVisibility = false;
  const listeners: Array<() => void> = [];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  container.innerHTML = `
    <main class="game-page chess-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-chess-action="back" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow chess-eyebrow">Local chess challenge</span>
          <h1>Chess</h1>
        </div>
        <button class="icon-button" type="button" data-chess-action="new" aria-label="Start a new chess game">↻</button>
      </header>

      <section class="chess-setup" data-chess-setup aria-labelledby="chess-setup-title">
        <div class="chess-setup-art" aria-hidden="true">♞</div>
        <div class="chess-setup-copy">
          <p class="eyebrow chess-eyebrow">Your move, captain</p>
          <h2 id="chess-setup-title">Choose your match</h2>
          <p>Pick a side and a computer level. Everything runs privately on this device.</p>
        </div>
        <fieldset class="chess-choice-group">
          <legend>Play as</legend>
          <label><input type="radio" name="chess-side" value="w" checked><span>♔ White</span></label>
          <label><input type="radio" name="chess-side" value="b"><span>♚ Black</span></label>
          <label><input type="radio" name="chess-side" value="random"><span>✦ Random</span></label>
        </fieldset>
        <fieldset class="chess-choice-group">
          <legend>Computer</legend>
          ${Object.entries(DIFFICULTY_PROFILES).map(([value, profile]) => `
            <label><input type="radio" name="chess-difficulty" value="${value}" ${value === "easy" ? "checked" : ""}><span>${profile.label}</span></label>
          `).join("")}
        </fieldset>
        <div class="chess-setup-actions">
          <button class="check-button" type="button" data-chess-action="start">Start game</button>
          ${saved ? `<button class="soft-button" type="button" data-chess-action="resume">Resume saved game</button>` : ""}
        </div>
        <p class="chess-draw-note"><strong>Casual draw rules:</strong> stalemate, threefold repetition, fifty moves, or insufficient material ends the game automatically.</p>
        <p class="chess-local-note">No account · no server AI · saved only in this browser</p>
        <p class="chess-license-links">Open-source notices: <a href="/licenses/chess.js-LICENSE.txt" target="_blank" rel="noopener">chess.js</a> · <a href="/stockfish/SOURCE.md" target="_blank" rel="noopener">Stockfish</a></p>
      </section>

      <section class="chess-play" data-chess-play aria-label="Chess game" hidden>
        <div class="chess-status-row">
          <div class="chess-turn-token" data-chess-turn-icon aria-hidden="true">♙</div>
          <div>
            <p class="chess-turn" data-chess-turn>Loading the board…</p>
            <p class="chess-engine-status" data-chess-engine-status>Preparing Stockfish on this device</p>
          </div>
          <span class="chess-thinking" data-chess-thinking hidden aria-hidden="true"><i></i><i></i><i></i></span>
        </div>

        <div class="chess-board-shell">
          <canvas class="chess-canvas" data-chess-canvas width="${BOARD_SIZE}" height="${BOARD_SIZE}" tabindex="0" role="application" aria-label="Chess board. Use arrow keys to move between squares, Enter or Space to select and move, and Escape to cancel selection."></canvas>
        </div>

        <div class="visually-hidden chess-accessible-board" data-chess-accessible-board role="grid" aria-label="Chess position">
          ${ALL_SQUARES.map((square) => `<button type="button" role="gridcell" tabindex="-1" data-chess-square="${square}"></button>`).join("")}
        </div>
        <p class="visually-hidden" data-chess-announcement aria-live="assertive"></p>

        <div class="chess-actions" aria-label="Chess controls">
          <button class="soft-button" type="button" data-chess-action="undo">↶ <span>Undo turn</span></button>
          <button class="soft-button" type="button" data-chess-action="resign">⚑ <span>Resign</span></button>
          <button class="soft-button" type="button" data-chess-action="new">↻ <span>New game</span></button>
        </div>

        <div class="chess-engine-error" data-chess-engine-error hidden role="alert">
          <strong>Stockfish needs another try.</strong>
          <span data-chess-engine-error-copy>The local engine could not start.</span>
          <button class="soft-button" type="button" data-chess-action="retry">Retry engine</button>
        </div>
      </section>

      <div class="celebration chess-result" data-chess-result hidden aria-live="assertive"></div>
      <div class="celebration chess-promotion" data-chess-promotion hidden></div>
    </main>`;

  const setupElement = container.querySelector<HTMLElement>("[data-chess-setup]")!;
  const playElement = container.querySelector<HTMLElement>("[data-chess-play]")!;
  const canvas = container.querySelector<HTMLCanvasElement>("[data-chess-canvas]")!;
  const turnElement = container.querySelector<HTMLElement>("[data-chess-turn]")!;
  const turnIcon = container.querySelector<HTMLElement>("[data-chess-turn-icon]")!;
  const engineStatus = container.querySelector<HTMLElement>("[data-chess-engine-status]")!;
  const thinkingElement = container.querySelector<HTMLElement>("[data-chess-thinking]")!;
  const announcement = container.querySelector<HTMLElement>("[data-chess-announcement]")!;
  const resultElement = container.querySelector<HTMLElement>("[data-chess-result]")!;
  const promotionElement = container.querySelector<HTMLElement>("[data-chess-promotion]")!;
  const engineError = container.querySelector<HTMLElement>("[data-chess-engine-error]")!;
  const engineErrorCopy = container.querySelector<HTMLElement>("[data-chess-engine-error-copy]")!;
  const undoButton = container.querySelector<HTMLButtonElement>('[data-chess-action="undo"]')!;

  const { default: kaplay } = await import("kaplay");
  if (destroyed) return { destroy: () => {} };
  const k = kaplay({
    global: false,
    canvas,
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    background: [25, 28, 50],
    crisp: false,
    debug: false,
    focus: false,
    touchToMouse: false,
  });
  const renderer = new ChessRenderer(k, "w", reducedMotion);
  await renderer.loadAssets();
  k.onDraw(() => renderer.draw());
  k.onUpdate(() => renderer.update());

  function addListener<T extends Event>(target: EventTarget, type: string, handler: (event: T) => void, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler as EventListener, options);
    listeners.push(() => target.removeEventListener(type, handler as EventListener, options));
  }

  function announce(message: string): void {
    announcement.textContent = "";
    requestAnimationFrame(() => {
      if (!destroyed) announcement.textContent = message;
    });
  }

  function updateHighlights(): void {
    const legal = selected && game
      ? game.legalMoves(selected).map((move) => ({ square: move.to, capture: move.isCapture() || move.isEnPassant() }))
      : [];
    renderer.setHighlights({ selected, legal, lastMove, checkedKing: game?.checkedKingSquare(), keyboard: keyboardSquare });
  }

  function updateAccessibleBoard(): void {
    if (!game) return;
    const legal = new Set(selected ? game.legalMoves(selected).map((move) => move.to) : []);
    container.querySelectorAll<HTMLButtonElement>("[data-chess-square]").forEach((button) => {
      const square = button.dataset.chessSquare as Square;
      const piece = game!.piece(square);
      const description = piece ? `${colorName(piece.color)} ${PIECE_NAMES[piece.type]}` : "empty";
      button.setAttribute("aria-label", `${square}, ${description}${legal.has(square) ? ", legal destination" : ""}`);
      button.setAttribute("aria-selected", String(selected === square));
    });
  }

  function renderState(): void {
    if (!game) return;
    const outcome = game.outcome();
    const humanTurn = game.isHumanTurn();
    const label = aiPausedForVisibility
      ? "Computer paused while this page is hidden"
      : playState === "ai-thinking"
      ? `${colorName(game.turn())} is thinking…`
      : playState === "loading"
        ? "Loading your local opponent…"
        : playState === "promotion-selection"
          ? "Choose a promotion piece"
          : playState === "engine-error"
            ? "Computer opponent paused"
            : playState === "finished"
              ? finalMessage
              : `${colorName(game.turn())} to move${game.isCheck() ? " — check!" : ""}`;
    turnElement.textContent = label;
    turnIcon.textContent = game.turn() === "w" ? "♙" : "♟";
    thinkingElement.hidden = aiPausedForVisibility || (playState !== "ai-thinking" && playState !== "loading");
    engineStatus.textContent = aiPausedForVisibility
      ? "Return to this page when you are ready for the computer move"
      : playState === "ai-thinking"
      ? `${DIFFICULTY_PROFILES[game.difficulty].label} Stockfish is searching on this device`
      : playState === "loading"
        ? "Starting the private Stockfish worker"
        : playState === "engine-error"
          ? "No move will be made until the engine recovers"
          : `${colorName(game.humanColor)} side · ${DIFFICULTY_PROFILES[game.difficulty].label} computer`;
    undoButton.disabled = game.history().length === 0 || playState === "animating" || playState === "promotion-selection";
    canvas.setAttribute("aria-busy", String(playState === "ai-thinking" || playState === "loading" || playState === "animating"));
    canvas.dataset.playState = playState;
    updateHighlights();
    updateAccessibleBoard();
    if (outcome && playState !== "finished") finishGame(outcome);
    if (playState === "human-turn" && !humanTurn) void startAiTurn();
  }

  function showPlay(): void {
    setupElement.hidden = true;
    playElement.hidden = false;
    resultElement.hidden = true;
    promotionElement.hidden = true;
    engineError.hidden = true;
  }

  async function initializeMatch(nextGame: ChessGame): Promise<void> {
    generation += 1;
    game = nextGame;
    selected = undefined;
    lastMove = game.lastMove() ? { from: game.lastMove()!.from, to: game.lastMove()!.to } : undefined;
    keyboardSquare = game.humanColor === "w" ? "e2" : "e7";
    renderer.setOrientation(game.humanColor);
    renderer.start(game);
    playState = "loading";
    showPlay();
    renderState();
    const matchGeneration = generation;
    try {
      await engine.initialize();
      await engine.newGame();
      if (destroyed || generation !== matchGeneration) return;
      playState = game.isHumanTurn() ? "human-turn" : "ai-thinking";
      renderState();
      announce(`${colorName(game.humanColor)} side. ${turnElement.textContent}`);
      if (!game.isHumanTurn()) void startAiTurn();
      else canvas.focus({ preventScroll: true });
    } catch (error) {
      if (!destroyed && generation === matchGeneration) showEngineError(error);
    }
  }

  function startNewGame(): void {
    const side = container.querySelector<HTMLInputElement>('input[name="chess-side"]:checked')?.value as SideChoice | undefined;
    const difficulty = container.querySelector<HTMLInputElement>('input[name="chess-difficulty"]:checked')?.value as ChessDifficulty | undefined;
    const nextGame = new ChessGame({
      humanColor: chooseSide(side ?? "w"),
      difficulty: difficulty ?? "easy",
    });
    clearSavedGame();
    void initializeMatch(nextGame);
  }

  function resumeSavedGame(): void {
    const save = loadGame();
    if (!save) {
      announce("That saved game is no longer available.");
      return;
    }
    try {
      void initializeMatch(new ChessGame(save));
    } catch {
      clearSavedGame();
      announce("The saved game could not be restored, so it was removed.");
    }
  }

  function persist(): void {
    if (game && !game.outcome()) saveGame(game.save());
  }

  async function animateAppliedMove(applied: ReturnType<ChessGame["moveUci"]>, dragPoint?: { x: number; y: number }): Promise<void> {
    const moveGeneration = generation;
    playState = "animating";
    selected = undefined;
    lastMove = { from: applied.move.from, to: applied.move.to };
    renderState();
    await renderer.animateMove(applied, dragPoint ? k.vec2(dragPoint.x, dragPoint.y) : undefined);
    if (destroyed || generation !== moveGeneration || !game) return;
    persist();
    const outcome = game.outcome();
    if (outcome) {
      finishGame(outcome);
      return;
    }
    playState = game.isHumanTurn() ? "human-turn" : "ai-thinking";
    const description = `${colorName(applied.move.color)} ${PIECE_NAMES[applied.move.piece]} ${applied.move.from} to ${applied.move.to}${applied.move.isCapture() || applied.move.isEnPassant() ? ", capture" : ""}${game.isCheck() ? ", check" : ""}.`;
    announce(description);
    renderState();
    if (!game.isHumanTurn()) void startAiTurn();
  }

  async function startAiTurn(): Promise<void> {
    if (!game || game.isHumanTurn() || game.outcome() || destroyed) return;
    if (document.hidden) {
      aiPausedForVisibility = true;
      playState = "loading";
      renderState();
      return;
    }
    aiPausedForVisibility = false;
    playState = "ai-thinking";
    renderState();
    const searchGeneration = generation;
    const positionFen = game.fen();
    try {
      const result = await engine.search({
        startingFen: game.startingFen,
        moves: game.moveHistory(),
        positionFen,
        difficulty: game.difficulty,
        generation: searchGeneration,
      });
      if (destroyed || !game) return;
      let applied;
      try {
        applied = applyEngineMove(game, result, generation);
      } catch {
        throw new Error("Stockfish suggested an invalid move");
      }
      if (!applied) return;
      await animateAppliedMove(applied);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!destroyed && generation === searchGeneration) showEngineError(error);
    }
  }

  function showEngineError(error: unknown): void {
    playState = "engine-error";
    engineError.hidden = false;
    engineErrorCopy.textContent = error instanceof Error ? error.message : "The local engine could not start.";
    renderState();
    announce("The local chess engine stopped. Use Retry engine to continue.");
  }

  async function retryEngine(): Promise<void> {
    if (!game) return;
    generation += 1;
    engine.destroy();
    engine = new StockfishEngine();
    engineError.hidden = true;
    playState = "loading";
    renderState();
    const retryGeneration = generation;
    try {
      await engine.initialize();
      await engine.newGame();
      if (destroyed || generation !== retryGeneration) return;
      playState = game.isHumanTurn() ? "human-turn" : "ai-thinking";
      renderState();
      if (!game.isHumanTurn()) void startAiTurn();
    } catch (error) {
      if (!destroyed && generation === retryGeneration) showEngineError(error);
    }
  }

  function finishGame(outcome: Exclude<ChessOutcome, null> | "resigned"): void {
    if (!game) return;
    generation += 1;
    engine.cancel();
    renderer.cancelAnimations();
    playState = "finished";
    clearSavedGame();
    finalMessage = outcome === "resigned"
      ? `${colorName(game.humanColor)} resigned`
      : outcome === "checkmate"
        ? `${OUTCOME_MESSAGES[outcome]} — ${colorName(game.turn() === "w" ? "b" : "w")} wins!`
        : OUTCOME_MESSAGES[outcome];
    resultElement.hidden = false;
    resultElement.innerHTML = `
      <div class="result-card chess-result-card" role="dialog" aria-modal="true" aria-labelledby="chess-result-title">
        <div class="chess-result-piece" aria-hidden="true">${outcome === "checkmate" ? "♛" : "♜"}</div>
        <p class="eyebrow chess-eyebrow">Match complete</p>
        <h2 id="chess-result-title">${finalMessage}</h2>
        <p>${game.history().length} ${game.history().length === 1 ? "move" : "moves"} played · ${DIFFICULTY_PROFILES[game.difficulty].label} computer</p>
        <div class="result-actions">
          <button class="check-button" type="button" data-chess-result-action="again">New match</button>
          <button class="text-button" type="button" data-chess-result-action="back">All games</button>
        </div>
      </div>`;
    renderState();
    resultElement.querySelector<HTMLButtonElement>('[data-chess-result-action="again"]')?.focus();
    announce(finalMessage);
  }

  function showPromotion(from: Square, to: Square, dragPoint?: { x: number; y: number }): void {
    if (!game) return;
    pendingPromotion = { from, to, dragPoint };
    playState = "promotion-selection";
    promotionElement.hidden = false;
    promotionElement.innerHTML = `
      <div class="result-card chess-promotion-card" role="dialog" aria-modal="true" aria-labelledby="chess-promotion-title">
        <p class="eyebrow chess-eyebrow">Pawn power-up</p>
        <h2 id="chess-promotion-title">Choose a piece</h2>
        <div class="chess-promotion-options">
          ${PROMOTION_PIECES.map((piece) => `<button type="button" data-chess-promote="${piece}" aria-label="Promote to ${PIECE_NAMES[piece]}">${PROMOTION_SYMBOLS[game!.humanColor][piece]}</button>`).join("")}
        </div>
        <button class="text-button" type="button" data-chess-action="cancel-promotion">Cancel</button>
      </div>`;
    renderState();
    promotionElement.querySelector<HTMLButtonElement>("[data-chess-promote]")?.focus();
  }

  function choosePromotion(piece: PieceSymbol): void {
    if (!game || !pendingPromotion) return;
    const pending = pendingPromotion;
    pendingPromotion = undefined;
    promotionElement.hidden = true;
    try {
      const applied = game.move(pending.from, pending.to, piece);
      void animateAppliedMove(applied, pending.dragPoint);
    } catch {
      playState = "human-turn";
      renderer.start(game);
      renderState();
    }
  }

  function cancelPromotion(): void {
    if (!game || !pendingPromotion) return;
    const pending = pendingPromotion;
    pendingPromotion = undefined;
    promotionElement.hidden = true;
    playState = "animating";
    const from = k.vec2(pending.dragPoint?.x ?? 0, pending.dragPoint?.y ?? 0);
    const animation = pending.dragPoint ? renderer.animateReturn(pending.from, from) : Promise.resolve();
    void animation.then(() => {
      if (destroyed || !game) return;
      playState = "human-turn";
      renderState();
      canvas.focus({ preventScroll: true });
    });
  }

  function selectOrMove(square: Square): void {
    if (!game || playState !== "human-turn") return;
    const piece = game.piece(square);
    if (!selected) {
      if (piece?.color !== game.humanColor) {
        announce(`${square} does not contain one of your pieces.`);
        return;
      }
      selected = square;
      announce(`${colorName(piece.color)} ${PIECE_NAMES[piece.type]} selected on ${square}.`);
      renderState();
      return;
    }
    if (piece?.color === game.humanColor) {
      selected = square;
      announce(`${PIECE_NAMES[piece.type]} selected on ${square}.`);
      renderState();
      return;
    }
    const from = selected;
    const moves = game.legalMoves(from).filter((move) => move.to === square);
    if (moves.length === 0) {
      announce(`${square} is not a legal destination.`);
      selected = undefined;
      renderState();
      return;
    }
    if (moves.some((move) => move.isPromotion())) {
      showPromotion(from, square);
      return;
    }
    void animateAppliedMove(game.move(from, square));
  }

  function pointFromEvent(event: PointerEvent): ReturnType<typeof k.vec2> {
    const bounds = canvas.getBoundingClientRect();
    return k.vec2(
      (event.clientX - bounds.left) * BOARD_SIZE / bounds.width,
      (event.clientY - bounds.top) * BOARD_SIZE / bounds.height,
    );
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!game || playState !== "human-turn") return;
    const point = pointFromEvent(event);
    const square = renderer.squareAt(point);
    if (!square) return;
    canvas.setPointerCapture(event.pointerId);
    pointerGesture = { pointerId: event.pointerId, from: square, startX: point.x, startY: point.y, dragging: false };
    keyboardSquare = square;
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!game || !pointerGesture || pointerGesture.pointerId !== event.pointerId || playState !== "human-turn") return;
    const point = pointFromEvent(event);
    if (!pointerGesture.dragging && Math.hypot(point.x - pointerGesture.startX, point.y - pointerGesture.startY) >= 8) {
      const piece = game.piece(pointerGesture.from);
      if (piece?.color !== game.humanColor) return;
      selected = pointerGesture.from;
      pointerGesture.dragging = renderer.beginDrag(pointerGesture.from, point);
      renderState();
    }
    if (pointerGesture.dragging) renderer.updateDrag(point);
    event.preventDefault();
  }

  function handlePointerUp(event: PointerEvent): void {
    if (!game || !pointerGesture || pointerGesture.pointerId !== event.pointerId || playState !== "human-turn") return;
    const gesture = pointerGesture;
    pointerGesture = undefined;
    const point = pointFromEvent(event);
    const destination = renderer.squareAt(point);
    if (!gesture.dragging) {
      if (destination) selectOrMove(destination);
      return;
    }
    const moves = destination ? game.legalMoves(gesture.from).filter((move) => move.to === destination) : [];
    const isPromotion = moves.some((move) => move.isPromotion());
    const dragPoint = renderer.finishDrag(isPromotion) ?? point;
    if (!destination || moves.length === 0) {
      playState = "animating";
      void renderer.animateReturn(gesture.from, dragPoint).then(() => {
        if (destroyed || !game) return;
        playState = "human-turn";
        selected = undefined;
        renderState();
      });
      announce("That move is not legal. The piece returned to its square.");
      return;
    }
    if (isPromotion) {
      showPromotion(gesture.from, destination, { x: dragPoint.x, y: dragPoint.y });
      return;
    }
    void animateAppliedMove(game.move(gesture.from, destination), { x: dragPoint.x, y: dragPoint.y });
  }

  function undoTurn(): void {
    if (!game || game.history().length === 0 || playState === "animating" || playState === "promotion-selection") return;
    const wasPending = playState === "ai-thinking" || playState === "loading" || playState === "engine-error";
    generation += 1;
    engine.cancel();
    renderer.cancelAnimations();
    const undone = game.undoToHumanDecision(wasPending);
    if (undone.length === 0) return;
    lastMove = game.lastMove() ? { from: game.lastMove()!.from, to: game.lastMove()!.to } : undefined;
    selected = undefined;
    resultElement.hidden = true;
    engineError.hidden = true;
    renderer.start(game);
    persist();
    playState = game.isHumanTurn() ? "human-turn" : "ai-thinking";
    renderState();
    announce(`Undid ${undone.length === 1 ? "the pending move" : "the last turn"}.`);
    if (!game.isHumanTurn()) void startAiTurn();
  }

  function hasUnfinishedGame(): boolean {
    return Boolean(game && !game.outcome() && playState !== "finished" && game.history().length > 0);
  }

  function confirmAbandon(message: string): boolean {
    return !hasUnfinishedGame() || window.confirm(message);
  }

  function showSetup(): void {
    if (!confirmAbandon("Leave this unfinished match and choose a new one?")) return;
    generation += 1;
    engine.cancel();
    renderer.cancelAnimations();
    game = undefined;
    playState = "setup";
    playElement.hidden = true;
    setupElement.hidden = false;
    resultElement.hidden = true;
    promotionElement.hidden = true;
  }

  function handleAction(action: string): void {
    if (action === "start") startNewGame();
    else if (action === "resume") resumeSavedGame();
    else if (action === "retry") void retryEngine();
    else if (action === "undo") undoTurn();
    else if (action === "resign" && game && window.confirm("Resign this match?")) finishGame("resigned");
    else if (action === "new") showSetup();
    else if (action === "cancel-promotion") cancelPromotion();
    else if (action === "back" && confirmAbandon("Leave this unfinished match and return to all games?")) exit();
  }

  addListener(container, "click", (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const square = target.closest<HTMLElement>("[data-chess-square]")?.dataset.chessSquare as Square | undefined;
    if (square) {
      keyboardSquare = square;
      selectOrMove(square);
      return;
    }
    const promote = target.closest<HTMLElement>("[data-chess-promote]")?.dataset.chessPromote as PieceSymbol | undefined;
    if (promote) {
      choosePromotion(promote);
      return;
    }
    const resultAction = target.closest<HTMLElement>("[data-chess-result-action]")?.dataset.chessResultAction;
    if (resultAction === "again") showSetup();
    else if (resultAction === "back") exit();
    const action = target.closest<HTMLElement>("[data-chess-action]")?.dataset.chessAction;
    if (action) handleAction(action);
  });
  addListener(canvas, "pointerdown", handlePointerDown);
  addListener(canvas, "pointermove", handlePointerMove);
  addListener(canvas, "pointerup", handlePointerUp);
  addListener(canvas, "pointercancel", handlePointerUp);
  addListener(canvas, "keydown", (event: KeyboardEvent) => {
    if (!game || playState !== "human-turn") return;
    const directions = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const;
    const direction = directions[event.key as keyof typeof directions];
    if (direction) {
      keyboardSquare = shiftSquare(keyboardSquare, direction, game.humanColor);
      updateHighlights();
      announce(`${keyboardSquare}. ${game.piece(keyboardSquare) ? `${colorName(game.piece(keyboardSquare)!.color)} ${PIECE_NAMES[game.piece(keyboardSquare)!.type]}` : "Empty"}.`);
      event.preventDefault();
    } else if (event.key === "Enter" || event.key === " ") {
      selectOrMove(keyboardSquare);
      event.preventDefault();
    } else if (event.key === "Escape") {
      selected = undefined;
      renderState();
      announce("Selection cleared.");
    }
  });
  addListener(document, "visibilitychange", () => {
    if (!game || game.isHumanTurn() || game.outcome()) return;
    if (document.hidden && playState === "ai-thinking") {
      generation += 1;
      engine.cancel();
      aiPausedForVisibility = true;
      playState = "loading";
      renderState();
    } else if (!document.hidden && aiPausedForVisibility) {
      aiPausedForVisibility = false;
      void startAiTurn();
    }
  });

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      persist();
      for (const remove of listeners) remove();
      renderer.cancelAnimations();
      engine.destroy();
      k.quit();
      container.innerHTML = "";
    },
  };
}
