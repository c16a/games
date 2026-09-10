import type { Color, PieceSymbol, Square } from "chess.js";
import type { KAPLAYCtx, Vec2 } from "kaplay";
import type { AppliedMove, ChessGame } from "./logic";
import { ALL_SQUARES } from "./logic";
import { pieceSpriteData, pieceSpriteName } from "./piece-assets";

const BOARD_SIZE = 640;
const CELL = BOARD_SIZE / 8;
const PIECES: readonly PieceSymbol[] = ["p", "n", "b", "r", "q", "k"];
const COLORS: readonly Color[] = ["w", "b"];

export function animationDuration(reducedMotion: boolean, remainingDistanceRatio: number, returning = false): number {
  if (reducedMotion) return 24;
  const ratio = Math.min(1, Math.max(0.18, remainingDistanceRatio));
  return Math.max(returning ? 80 : 90, (returning ? 180 : 230) * ratio);
}

interface VisualPiece {
  id: string;
  color: Color;
  type: PieceSymbol;
  square: Square;
  dragPosition?: Vec2;
}

interface MovingPiece {
  piece: VisualPiece;
  from: Vec2;
  to: Square;
}

interface Animation {
  startedAt: number;
  duration: number;
  moving: MovingPiece[];
  capturedId?: string;
  promotion?: PieceSymbol;
  complete: () => void;
}

export interface BoardHighlights {
  selected?: Square;
  legal: Array<{ square: Square; capture: boolean }>;
  lastMove?: { from: Square; to: Square };
  checkedKing?: Square;
  keyboard?: Square;
}

export class ChessRenderer {
  private pieces = new Map<string, VisualPiece>();
  private animation?: Animation;
  private highlights: BoardHighlights = { legal: [] };
  private draggedId?: string;

  constructor(
    private readonly k: KAPLAYCtx,
    private orientation: Color,
    private readonly reducedMotion: boolean,
  ) {}

  async loadAssets(): Promise<void> {
    await Promise.all(COLORS.flatMap((color) => PIECES.map((piece) => (
      this.k.loadSprite(pieceSpriteName(color, piece), pieceSpriteData(color, piece))
    ))));
  }

  start(game: ChessGame): void {
    this.cancelAnimations();
    this.pieces.clear();
    const counts = new Map<string, number>();
    for (const row of game.board()) {
      for (const entry of row) {
        if (!entry) continue;
        const prefix = `${entry.color}${entry.type}`;
        const count = (counts.get(prefix) ?? 0) + 1;
        counts.set(prefix, count);
        this.pieces.set(`${prefix}-${count}`, { id: `${prefix}-${count}`, color: entry.color, type: entry.type, square: entry.square });
      }
    }
  }

  setOrientation(color: Color): void {
    this.orientation = color;
  }

  setHighlights(highlights: BoardHighlights): void {
    this.highlights = highlights;
  }

  draw(): void {
    this.drawBoard();
    const movingIds = new Set(this.animation?.moving.map(({ piece }) => piece.id) ?? []);
    for (const piece of this.pieces.values()) {
      if (!movingIds.has(piece.id) && piece.id !== this.draggedId) this.drawPiece(piece, this.squareCenter(piece.square));
    }
    if (this.animation) {
      const elapsed = Math.max(0, performance.now() - this.animation.startedAt);
      const progress = Math.min(1, elapsed / this.animation.duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      for (const moving of this.animation.moving) {
        const target = this.squareCenter(moving.to);
        this.drawPiece(moving.piece, this.k.vec2(
          moving.from.x + (target.x - moving.from.x) * eased,
          moving.from.y + (target.y - moving.from.y) * eased,
        ));
      }
    }
    if (this.draggedId) {
      const piece = this.pieces.get(this.draggedId);
      if (piece?.dragPosition) this.drawPiece(piece, piece.dragPosition);
    }
  }

  update(): void {
    if (!this.animation) return;
    if (performance.now() - this.animation.startedAt < this.animation.duration) return;
    const animation = this.animation;
    this.animation = undefined;
    for (const moving of animation.moving) moving.piece.square = moving.to;
    if (animation.capturedId) this.pieces.delete(animation.capturedId);
    if (animation.promotion) animation.moving[0]!.piece.type = animation.promotion;
    animation.complete();
  }

  beginDrag(square: Square, point: Vec2): boolean {
    if (this.animation) return false;
    const piece = this.pieceAt(square);
    if (!piece) return false;
    this.draggedId = piece.id;
    piece.dragPosition = point;
    return true;
  }

  updateDrag(point: Vec2): void {
    const piece = this.draggedId ? this.pieces.get(this.draggedId) : undefined;
    if (piece) piece.dragPosition = point;
  }

  finishDrag(hold = false): Vec2 | undefined {
    const piece = this.draggedId ? this.pieces.get(this.draggedId) : undefined;
    const point = piece?.dragPosition;
    if (!hold) {
      this.draggedId = undefined;
      if (piece) piece.dragPosition = undefined;
    }
    return point;
  }

  animateMove(applied: AppliedMove, dragStart?: Vec2): Promise<void> {
    this.cancelAnimations();
    const primary = this.pieceAt(applied.move.from);
    if (!primary) return Promise.resolve();
    const captured = applied.capturedSquare ? this.pieceAt(applied.capturedSquare) : undefined;
    const moving: MovingPiece[] = [{ piece: primary, from: dragStart ?? this.squareCenter(applied.move.from), to: applied.move.to }];
    if (applied.rookMove) {
      const rook = this.pieceAt(applied.rookMove.from);
      if (rook) moving.push({ piece: rook, from: this.squareCenter(applied.rookMove.from), to: applied.rookMove.to });
    }
    const duration = animationDuration(this.reducedMotion, this.remainingDistanceRatio(moving[0]!.from, applied.move.to));
    return new Promise((resolve) => {
      this.animation = {
        startedAt: performance.now(),
        duration,
        moving,
        capturedId: captured?.id,
        promotion: applied.move.promotion,
        complete: resolve,
      };
    });
  }

  animateReturn(square: Square, from: Vec2): Promise<void> {
    const piece = this.pieceAt(square);
    if (!piece) return Promise.resolve();
    this.cancelAnimations();
    const duration = animationDuration(this.reducedMotion, this.remainingDistanceRatio(from, square), true);
    return new Promise((resolve) => {
      this.animation = {
        startedAt: performance.now(),
        duration,
        moving: [{ piece, from, to: square }],
        complete: resolve,
      };
    });
  }

  cancelAnimations(): void {
    const animation = this.animation;
    this.animation = undefined;
    this.draggedId = undefined;
    if (animation) animation.complete();
  }

  squareAt(point: Vec2): Square | undefined {
    if (point.x < 0 || point.y < 0 || point.x >= BOARD_SIZE || point.y >= BOARD_SIZE) return undefined;
    const displayFile = Math.floor(point.x / CELL);
    const displayRank = Math.floor(point.y / CELL);
    const file = this.orientation === "w" ? displayFile : 7 - displayFile;
    const rankFromTop = this.orientation === "w" ? displayRank : 7 - displayRank;
    return `${String.fromCharCode(97 + file)}${8 - rankFromTop}` as Square;
  }

  private remainingDistanceRatio(from: Vec2, to: Square): number {
    const target = this.squareCenter(to);
    return Math.min(1, Math.max(0.18, Math.hypot(target.x - from.x, target.y - from.y) / CELL));
  }

  private pieceAt(square: Square): VisualPiece | undefined {
    return [...this.pieces.values()].find((piece) => piece.square === square);
  }

  private squareCenter(square: Square): Vec2 {
    const file = square.charCodeAt(0) - 97;
    const rankFromTop = 8 - Number(square[1]);
    const displayFile = this.orientation === "w" ? file : 7 - file;
    const displayRank = this.orientation === "w" ? rankFromTop : 7 - rankFromTop;
    return this.k.vec2(displayFile * CELL + CELL / 2, displayRank * CELL + CELL / 2);
  }

  private drawPiece(piece: VisualPiece, position: Vec2): void {
    this.k.drawSprite({
      sprite: pieceSpriteName(piece.color, piece.type),
      pos: position,
      anchor: "center",
      width: 67,
      height: 67,
    });
  }

  private drawBoard(): void {
    const light = this.k.rgb(244, 225, 180);
    const dark = this.k.rgb(88, 133, 112);
    for (const square of ALL_SQUARES) {
      const center = this.squareCenter(square);
      const file = square.charCodeAt(0) - 97;
      const rank = Number(square[1]);
      this.k.drawRect({ pos: this.k.vec2(center.x - CELL / 2, center.y - CELL / 2), width: CELL, height: CELL, color: (file + rank) % 2 ? light : dark });
    }
    const { selected, legal, lastMove, checkedKing, keyboard } = this.highlights;
    if (lastMove) {
      for (const square of [lastMove.from, lastMove.to]) {
        const center = this.squareCenter(square);
        this.k.drawRect({ pos: this.k.vec2(center.x - 35, center.y - 35), width: 70, height: 70, color: this.k.rgb(255, 212, 59), opacity: 0.35 });
        this.drawSquareOutline(square, this.k.rgb(245, 159, 0), 3);
      }
    }
    if (selected) this.drawSquareOutline(selected, this.k.rgb(34, 139, 230), 7);
    if (keyboard) this.drawSquareOutline(keyboard, this.k.rgb(255, 255, 255), 4);
    if (checkedKing) {
      this.drawSquareOutline(checkedKing, this.k.rgb(240, 62, 62), 8);
      const center = this.squareCenter(checkedKing);
      this.k.drawLine({ p1: center.add(-18, -18), p2: center.add(18, 18), width: 6, color: this.k.rgb(240, 62, 62) });
      this.k.drawLine({ p1: center.add(18, -18), p2: center.add(-18, 18), width: 6, color: this.k.rgb(240, 62, 62) });
    }
    for (const destination of legal) {
      const center = this.squareCenter(destination.square);
      if (destination.capture) {
        this.k.drawCircle({ pos: center, radius: 31, fill: false, outline: { width: 7, color: this.k.rgb(230, 73, 128) } });
      } else {
        this.k.drawCircle({ pos: center, radius: 12, color: this.k.rgb(34, 139, 230), opacity: 0.8 });
      }
    }
    this.drawCoordinates();
  }

  private drawSquareOutline(square: Square, color: ReturnType<KAPLAYCtx["rgb"]>, width: number): void {
    const center = this.squareCenter(square);
    this.k.drawRect({
      pos: this.k.vec2(center.x - CELL / 2 + width / 2, center.y - CELL / 2 + width / 2),
      width: CELL - width,
      height: CELL - width,
      fill: false,
      outline: { width, color },
    });
  }

  private drawCoordinates(): void {
    for (let index = 0; index < 8; index += 1) {
      const file = this.orientation === "w" ? String.fromCharCode(97 + index) : String.fromCharCode(104 - index);
      const rank = this.orientation === "w" ? String(8 - index) : String(index + 1);
      this.k.drawText({ text: file, pos: this.k.vec2(index * CELL + 5, BOARD_SIZE - 18), size: 13, font: "sans-serif", color: this.k.rgb(35, 39, 66) });
      this.k.drawText({ text: rank, pos: this.k.vec2(4, index * CELL + 4), size: 13, font: "sans-serif", color: this.k.rgb(35, 39, 66) });
    }
  }
}

export { BOARD_SIZE };
