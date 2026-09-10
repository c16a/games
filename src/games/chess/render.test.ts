import { describe, expect, test } from "bun:test";
import type { KAPLAYCtx, Vec2 } from "kaplay";
import { pieceSpriteData } from "./piece-assets";
import { animationDuration, ChessRenderer } from "./render";

function point(x: number, y: number): Vec2 {
  return { x, y } as Vec2;
}

describe("Chess board rendering coordinates", () => {
  test("maps display coordinates to logical squares in both orientations", () => {
    const renderer = new ChessRenderer({} as KAPLAYCtx, "w", false);
    expect(renderer.squareAt(point(1, 1))).toBe("a8");
    expect(renderer.squareAt(point(639, 639))).toBe("h1");
    expect(renderer.squareAt(point(-1, 10))).toBeUndefined();
    renderer.setOrientation("b");
    expect(renderer.squareAt(point(1, 1))).toBe("h1");
    expect(renderer.squareAt(point(639, 639))).toBe("a8");
  });

  test("provides intrinsically-sized SVG sprites for every piece and color", () => {
    for (const color of ["w", "b"] as const) {
      for (const piece of ["p", "n", "b", "r", "q", "k"] as const) {
        const data = decodeURIComponent(pieceSpriteData(color, piece));
        expect(data).toContain('width="100"');
        expect(data).toContain('height="100"');
        expect(data).toContain("<svg");
      }
    }
  });

  test("uses a tuned ordinary move duration, remaining-distance drag timing, and reduced motion", () => {
    expect(animationDuration(false, 1)).toBe(230);
    expect(animationDuration(false, 0.5)).toBe(115);
    expect(animationDuration(false, 0.2, true)).toBe(80);
    expect(animationDuration(true, 1)).toBe(24);
  });
});
