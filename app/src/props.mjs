// Drinks the mascot holds and throws, drawn as pixel art on the same grid as the mascot.
// Local coordinates: the gripped spot is the origin, the neck points up. Rows count from the bottom of the bottle.
import { CELL, Palette, rgb } from './geometry.mjs';

function makeShape(s) {
  const shape = {
    ...s,
    neckTop: s.rows - s.capRows,
    tipDistance: (s.rows - s.gripRow) * CELL,
    halfWidth(r) {
      if (r < 0 || r >= shape.rows) return -1;
      if (r >= shape.neckTop) return r === shape.rows - 1 ? shape.neckHalf : shape.neckHalf + 1;   // cap
      if (r === shape.neckTop - 1) return shape.neckHalf + 1;                                       // lip
      if (r < 2) return shape.maxHalf - 2 + r;                                                      // rounded bottom
      if (r < shape.shoulderStart) return shape.maxHalf;
      if (r >= shape.shoulderEnd) return shape.neckHalf;
      const t = (r - shape.shoulderStart + 1) / (shape.shoulderEnd - shape.shoulderStart + 1);
      return shape.neckHalf + Math.round((shape.maxHalf - shape.neckHalf) * Math.cos((t * Math.PI) / 2));
    },
  };
  return shape;
}

// Drawn larger than life so they read on a small mascot.
const SHAPES = {
  vodka: makeShape({ rows: 43, gripRow: 12, capRows: 4, maxHalf: 10, neckHalf: 3, shoulderStart: 22, shoulderEnd: 31, label: [5, 19], textRow: 9, caption: 'ВОДКА' }),
  beer: makeShape({ rows: 58, gripRow: 19, capRows: 3, maxHalf: 8, neckHalf: 3, shoulderStart: 28, shoulderEnd: 41, label: [8, 26], textRow: 12, caption: 'ПИВО' }),
};

/** Distance from the grip to the neck tip, used to put the bottle mouth on the mascot's mouth. */
export const tipDistance = (kind) => SHAPES[kind].tipDistance;

const COLORS = {
  vodka: {
    outline: rgb(0.24, 0.34, 0.40), glassDark: rgb(0.58, 0.69, 0.75), glass: rgb(0.73, 0.83, 0.88), glassLight: rgb(0.90, 0.95, 0.97),
    liquidDark: rgb(0.70, 0.80, 0.88), liquid: rgb(0.83, 0.91, 0.96), liquidLight: rgb(0.95, 0.98, 1.0), foam: rgb(0.95, 0.98, 1.0),
    capDark: rgb(0.50, 0.54, 0.60), cap: rgb(0.78, 0.81, 0.86), capLight: rgb(0.93, 0.95, 0.98),
    labelBase: rgb(0.95, 0.95, 0.96), labelBand: Palette.labelRed, labelText: Palette.labelBlue,
  },
  beer: {
    outline: rgb(0.10, 0.05, 0.02), glassDark: rgb(0.20, 0.10, 0.02), glass: rgb(0.34, 0.17, 0.04), glassLight: rgb(0.56, 0.32, 0.10),
    liquidDark: rgb(0.78, 0.46, 0.06), liquid: rgb(0.90, 0.58, 0.08), liquidLight: rgb(0.98, 0.72, 0.20), foam: rgb(0.99, 0.96, 0.86),
    capDark: rgb(0.62, 0.45, 0.08), cap: rgb(0.86, 0.68, 0.18), capLight: rgb(0.97, 0.85, 0.40),
    labelBase: rgb(0.96, 0.88, 0.58), labelBand: rgb(0.62, 0.10, 0.10), labelText: rgb(0.30, 0.10, 0.05),
  },
};

// Caption font (3 x 5 cells)
const GLYPHS = {
  'В': ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'],
  'О': ['.X.', 'X.X', 'X.X', 'X.X', '.X.'],
  'Д': ['XXX', 'X.X', 'X.X', 'XXX', 'X.X'],
  'К': ['X.X', 'XX.', 'X..', 'XX.', 'X.X'],
  'А': ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  'П': ['XXX', 'X.X', 'X.X', 'X.X', 'X.X'],
  'И': ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'],
};

function isCaptionPixel(caption, column, row) {
  if (row < 0 || row >= 5) return false;
  const letters = [...caption];
  const width = letters.length * 4 - 1;
  const x = column + Math.trunc(width / 2);
  if (x < 0 || x >= width || x % 4 === 3) return false;
  const glyph = GLYPHS[letters[Math.trunc(x / 4)]];
  if (!glyph) return false;
  return glyph[4 - row][x % 4] === 'X';                 // row 0 is the bottom of the caption
}

/** `angle` is the rotation already applied by the caller; it is undone for the liquid so its surface stays level. */
export function draw(ctx, { kind, angle, fill, capOn }) {
  const s = SHAPES[kind], c = COLORS[kind];
  const visibleRows = capOn ? s.rows : s.neckTop;
  const liquidLevel = (fill * s.neckTop * 0.70 - s.gripRow) * CELL;
  const sinA = Math.sin(angle), cosA = Math.cos(angle);

  const isInside = (i, r) => r < visibleRows && Math.abs(i) <= s.halfWidth(r);
  const colorAt = (i, r) => {
    if (!isInside(i, r)) return null;
    const hw = s.halfWidth(r), a = Math.abs(i);
    const isCap = r >= s.neckTop;
    if (a === hw || r === 0 || r === visibleRows - 1 || !isInside(i, r - 1) || !isInside(i, r + 1) || a > s.halfWidth(r + 1) || a > s.halfWidth(r - 1)) {
      return isCap ? c.capDark : c.outline;
    }
    if (isCap) return i < -hw + 2 ? c.capLight : (i > hw - 2 ? c.capDark : c.cap);
    if (r >= s.label[0] && r <= s.label[1]) {
      if (r > s.label[1] - 3) return c.labelBand;
      if (isCaptionPixel(s.caption, i, r - s.textRow)) return c.labelText;
      return c.labelBase;
    }
    const localX = i * CELL, localY = (r + 0.5 - s.gripRow) * CELL;
    const height = localX * sinA + localY * cosA;       // height above the grip once the bottle is rotated back upright
    if (fill > 0.01 && height < liquidLevel) {
      if (height > liquidLevel - CELL) return c.foam;
      return i < -hw + 3 ? c.liquidLight : (i > hw - 3 ? c.liquidDark : c.liquid);
    }
    return i < -hw + 3 ? c.glassLight : (i > hw - 3 ? c.glassDark : c.glass);
  };

  for (let r = 0; r < visibleRows; r++) {
    let runStart = null, runColor = null;
    const flush = (end) => {
      if (runStart === null) return;
      ctx.fillStyle = runColor.css;
      ctx.fillRect((runStart - 0.5) * CELL, (r - s.gripRow) * CELL, (end - runStart) * CELL, CELL);
    };
    for (let i = -s.maxHalf; i <= s.maxHalf + 1; i++) {
      const col = i <= s.maxHalf ? colorAt(i, r) : null;
      if (col && runColor && col.css === runColor.css && runStart !== null) continue;
      flush(i);
      runStart = col ? i : null;
      runColor = col;
    }
  }
}

/** Small bottle cap used for the "pop" effect. */
export function drawCap(ctx, kind) {
  const c = COLORS[kind];
  ctx.fillStyle = c.cap.css; ctx.fillRect(-2.5 * CELL, 0, 5 * CELL, CELL);
  ctx.fillStyle = c.capDark.css; ctx.fillRect(-2.5 * CELL, -CELL, 5 * CELL, CELL);
  ctx.fillStyle = c.capLight.css; ctx.fillRect(-2.5 * CELL, 0, 2 * CELL, CELL);
}
