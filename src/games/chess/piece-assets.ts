import type { Color, PieceSymbol } from "chess.js";

const SHAPES: Record<PieceSymbol, string> = {
  p: '<circle cx="50" cy="26" r="13"/><path d="M35 68c2-17 7-25 15-25s13 8 15 25z"/><path d="M27 79h46l6 11H21z"/>',
  r: '<path d="M23 15h13v12h10V15h9v12h10V15h13v25l-9 9 5 30 8 11H18l8-11 5-30-8-9z"/>',
  n: '<path d="M24 88h58l-8-13-5-34-17-25-26 9 17 9-19 18c-9 9-10 20-8 29z"/><circle cx="51" cy="28" r="3" class="detail"/>',
  b: '<path d="M50 10c13 11 18 22 18 33 0 9-5 17-13 21l16 15 8 11H21l8-11 16-15c-8-4-13-12-13-21 0-11 5-22 18-33z"/><path d="M55 25 42 47" class="cut"/>',
  q: '<circle cx="18" cy="22" r="6"/><circle cx="39" cy="15" r="6"/><circle cx="61" cy="15" r="6"/><circle cx="82" cy="22" r="6"/><path d="m18 31 11 42h42l11-42-18 19-14-27-14 27z"/><path d="M24 79h52l6 11H18z"/>',
  k: '<path d="M46 8h8v12h12v8H54v13h-8V28H34v-8h12z"/><path d="M50 37c15 0 24 9 24 19 0 7-5 13-12 17h12l8 17H18l8-17h12c-7-4-12-10-12-17 0-10 9-19 24-19z"/>',
};

function svg(piece: PieceSymbol, color: Color): string {
  const light = color === "w";
  const fill = light ? "#fff7df" : "#27304f";
  const stroke = light ? "#252744" : "#f8df9b";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><style>path,circle{fill:${fill};stroke:${stroke};stroke-width:4;stroke-linejoin:round;stroke-linecap:round}.detail{fill:${stroke};stroke:none}.cut{fill:none;stroke:${stroke};stroke-width:6}</style>${SHAPES[piece]}</svg>`;
}

export function pieceSpriteName(color: Color, piece: PieceSymbol): string {
  return `chess-${color}-${piece}`;
}

export function pieceSpriteData(color: Color, piece: PieceSymbol): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(piece, color))}`;
}
