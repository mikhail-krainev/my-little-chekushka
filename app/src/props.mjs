// Things the mascot holds or uses (bottles, cigarette, lighter, hookah), drawn on the same art-pixel grid as the
// mascot and shaded through `artstyle` so they look like pieces of the same photo.
// Local coordinates of a held prop: the gripped spot is the origin, the far end (bottle neck, cigarette filter,
// hookah mouthpiece) points up. Rows count from the bottom of the object.
import { CELL, rgb } from './geometry.mjs';
import { blend, cylinder, grain, hash, tone } from './artstyle.mjs';
import * as FX from './pixelfx.mjs';
import { drawBurger, drawHeldBox, drawPizzaSlice, foodTipDistance } from './food.mjs';

const GRAIN = 0.05;
const WHITE = rgb(1, 1, 1);

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

// Drawn larger than life so they read on a small mascot. The vodka bottle is a little copy of the mascot itself:
// silver cap, dark blue neck band, grey glass, off-white label.
const SHAPES = {
  vodka: makeShape({ rows: 43, gripRow: 12, capRows: 4, maxHalf: 10, neckHalf: 3, shoulderStart: 22, shoulderEnd: 31, label: [5, 19], textRow: 9, caption: 'ВОДКА', band: 3 }),
  beer: makeShape({ rows: 58, gripRow: 19, capRows: 3, maxHalf: 8, neckHalf: 3, shoulderStart: 28, shoulderEnd: 41, label: [8, 26], textRow: 12, caption: 'ПИВО', band: 0 }),
};

/** Cigarette: rows from the burning end (row 0) to the filter tip. The grip is between the fingers. */
const CIGARETTE = { rows: 23, gripRow: 4, filterRows: 7, half: 1 };
/** Hookah mouthpiece: brass handle around the grip, a long tube up to the lips, the hose joins at the bottom. */
const MOUTHPIECE = { rows: 25, gripRow: 5 };

/** Distance from the grip to the far end, used to put the bottle neck / filter / mouthpiece on the mascot's mouth. */
export function tipDistance(kind) {
  if (kind === 'cigarette') return (CIGARETTE.rows - CIGARETTE.gripRow) * CELL;
  if (kind === 'mouthpiece') return (MOUTHPIECE.rows - MOUTHPIECE.gripRow) * CELL;
  if (kind === 'burger' || kind === 'pizzaSlice') return foodTipDistance(kind);
  return SHAPES[kind].tipDistance;
}

/** Where the hose leaves the mouthpiece, in the prop's local frame. */
export const MOUTHPIECE_HOSE_JOINT = { x: 0, y: -MOUTHPIECE.gripRow * CELL };
/** How many rows of paper burn away over the whole smoke. */
const BURN_ROWS = 7;
/** Burning end of a cigarette that has burnt down by `burnt` (0...1), in the prop's local frame. */
export const cigaretteEmber = (burnt = 0) => ({ x: 0, y: (Math.round(burnt * BURN_ROWS) - CIGARETTE.gripRow + 0.5) * CELL });

const LOOKS = {
  vodka: {
    edge: rgb(0.30, 0.31, 0.33), glass: rgb(0.66, 0.66, 0.67), liquid: rgb(0.76, 0.78, 0.80), foam: rgb(0.92, 0.93, 0.94),
    cap: rgb(0.82, 0.80, 0.78), capEdge: rgb(0.42, 0.41, 0.41), band: rgb(0.25, 0.30, 0.40),
    label: rgb(0.88, 0.86, 0.82), labelBand: rgb(0.66, 0.30, 0.30), text: rgb(0.24, 0.31, 0.52),
  },
  beer: {
    edge: rgb(0.13, 0.07, 0.03), glass: rgb(0.40, 0.22, 0.08), liquid: rgb(0.66, 0.42, 0.12), foam: rgb(0.90, 0.84, 0.68),
    cap: rgb(0.78, 0.64, 0.32), capEdge: rgb(0.38, 0.28, 0.12), band: null,
    label: rgb(0.88, 0.79, 0.56), labelBand: rgb(0.54, 0.18, 0.15), text: rgb(0.32, 0.14, 0.08),
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

/** Paints rows of cells in prop-local space: `colorAt(i, r)` for column i (0 = axis) and row r. */
function paintRows(ctx, rows, gripRow, minCol, maxCol, colorAt) {
  FX.paint(ctx, { x: (minCol - 0.5) * CELL, y: -gripRow * CELL, w: (maxCol - minCol + 1) * CELL, h: rows * CELL },
    { origin: { x: -0.5 * CELL, y: -gripRow * CELL } }, (_p, ix, iy) => colorAt(ix, iy));
}

// MARK: Bottles

/** `angle` is the rotation already applied by the caller; it is undone for the liquid so its surface stays level. */
export function draw(ctx, prop) {
  switch (prop.kind) {
    case 'cigarette': drawCigarette(ctx, prop); return;
    case 'lighter': drawLighter(ctx, prop); return;
    case 'mouthpiece': drawMouthpiece(ctx); return;
    case 'burger': drawBurger(ctx, prop); return;
    case 'pizzaSlice': drawPizzaSlice(ctx); return;
    case 'pizzaBox': drawHeldBox(ctx); return;
    default: drawBottle(ctx, prop);
  }
}

function drawBottle(ctx, { kind, angle, fill, capOn }) {
  const s = SHAPES[kind], c = LOOKS[kind];
  const visibleRows = capOn ? s.rows : s.neckTop;
  const liquidLevel = (fill * s.neckTop * 0.70 - s.gripRow) * CELL;
  const sinA = Math.sin(angle), cosA = Math.cos(angle);
  const salt = kind === 'beer' ? 2 : 1;

  const isInside = (i, r) => r >= 0 && r < visibleRows && Math.abs(i) <= s.halfWidth(r);
  paintRows(ctx, visibleRows, s.gripRow, -s.maxHalf, s.maxHalf, (i, r) => {
    if (!isInside(i, r)) return null;
    const hw = s.halfWidth(r), a = Math.abs(i);
    const u = i / (hw + 0.5);
    const n = grain(i, r, salt) * GRAIN;
    const isCap = r >= s.neckTop;
    const isEdge = a === hw || r === 0 || r === visibleRows - 1 || !isInside(i, r + 1) || !isInside(i, r - 1);
    if (isEdge) return tone(isCap ? c.capEdge : c.edge, 0.85 + 0.35 * Math.max(0, -u), n);
    if (isCap) return tone(c.cap, cylinder(u) * (r % 2 ? 1 : 0.86), n);                     // ribbed screw cap
    if (c.band && r >= s.neckTop - 1 - s.band && r < s.neckTop - 1) return tone(c.band, cylinder(u), n);
    const matte = 0.9 + 0.5 * (cylinder(u) - 0.78);
    if (r >= s.label[0] && r <= s.label[1]) {
      if (r > s.label[1] - 3) return tone(c.labelBand, matte, n);
      if (isCaptionPixel(s.caption, i, r - s.textRow)) return tone(c.text, matte, n);
      return tone(c.label, matte * (r === s.label[0] || r === s.label[1] - 3 ? 0.85 : 1), n);
    }
    const bottom = r < 3 ? 0.8 : 1;
    const localX = i * CELL, localY = (r + 0.5 - s.gripRow) * CELL;
    const height = localX * sinA + localY * cosA;       // height above the grip once the bottle is rotated back upright
    let base = c.glass;
    if (fill > 0.01 && height < liquidLevel) base = height > liquidLevel - CELL ? c.foam : c.liquid;
    const streak = u > -0.6 && u < -0.36 && r > 2 ? 0.35 : 0;                                 // vertical glint on the glass
    return tone(streak ? blend(base, WHITE, streak) : base, cylinder(u) * bottom, n);
  });
}

/** Small bottle cap used for the "pop" effect. */
export function drawCap(ctx, kind) {
  const c = LOOKS[kind];
  FX.paint(ctx, { x: -2.5 * CELL, y: -CELL, w: 5 * CELL, h: 2 * CELL }, { origin: { x: -2.5 * CELL, y: -CELL } }, (_p, ix, iy) => {
    const u = (ix - 2) / 2.5;
    return iy === 0 ? tone(c.capEdge, 1, grain(ix, iy, 9) * GRAIN) : tone(c.cap, cylinder(u), grain(ix, iy, 9) * GRAIN);
  });
}

// MARK: Cigarette and lighter

const CIG = {
  paper: rgb(0.90, 0.88, 0.85), filter: rgb(0.78, 0.56, 0.34), filterDot: rgb(0.60, 0.40, 0.22), ring: rgb(0.80, 0.70, 0.40),
  ash: rgb(0.55, 0.53, 0.52), ember: rgb(0.95, 0.38, 0.12), emberHot: rgb(1, 0.78, 0.40), edge: rgb(0.48, 0.45, 0.43),
};

/** `burnt` 0...1 how far it has burnt down, `glow` 0...1 ember brightness (0 = not lit). */
function drawCigarette(ctx, { burnt = 0, glow = 0, time = 0 }) {
  const g = CIGARETTE, start = Math.round(burnt * BURN_ROWS), filterStart = g.rows - g.filterRows;
  paintRows(ctx, g.rows, g.gripRow, -g.half, g.half, (i, r) => {
    if (r < start || r >= g.rows) return null;
    const u = i / (g.half + 0.5), n = grain(i, r, 5) * GRAIN;
    const light = cylinder(u);
    if (r === start && glow > 0) {                                         // ember with a flickering hot core
      const flick = 0.85 + 0.15 * Math.sin(time * 23 + i * 2);
      return tone(blend(CIG.ember, CIG.emberHot, glow * flick * (i === 0 ? 1 : 0.5)), 0.7 + 0.5 * glow, n);
    }
    if (r === start + 1 && glow > 0) return tone(CIG.ash, light, n * 2);
    if (Math.abs(i) === g.half && r >= filterStart) return tone(CIG.filter, 0.8 * light, n);
    if (r === filterStart) return tone(CIG.ring, light, n);
    if (r > filterStart) return tone(hash(i, r, 6) > 0.72 ? CIG.filterDot : CIG.filter, light, n);
    return tone(Math.abs(i) === g.half ? blend(CIG.paper, CIG.edge, 0.35) : CIG.paper, light, n);
  });
  if (glow > 0.35) {                                                      // soft glow around the ember
    const y = (start - g.gripRow + 0.5) * CELL;
    FX.ellipse(ctx, { x: 0, y }, 2.6 * CELL, 1.6 * CELL, { color: rgb(1, 0.5, 0.15, 0.22 * glow) });
  }
}

const LIGHTER = { body: rgb(0.62, 0.22, 0.20), metal: rgb(0.74, 0.73, 0.72), wheel: rgb(0.40, 0.40, 0.40) };

/** Lighter in the fist; `flame` 0...1 shows the flame, `time` makes it flicker. */
function drawLighter(ctx, { flame = 0, time = 0 }) {
  paintRows(ctx, 10, 3, -2, 2, (i, r) => {
    const u = i / 2.5, n = grain(i, r, 8) * GRAIN;
    if (r < 7) return tone(LIGHTER.body, cylinder(u) * (Math.abs(i) === 2 ? 0.7 : 1), n);
    if (r === 9 && i > 0) return null;
    if (r >= 8 && i > 0) return tone(LIGHTER.wheel, 1, n);
    return tone(LIGHTER.metal, cylinder(u), n);
  });
  if (flame <= 0.02) return;
  const top = 7 * CELL, flick = Math.sin(time * 31) * 0.5 + Math.sin(time * 17) * 0.5;
  const h = (5 + 1.5 * flick) * CELL * flame, w = 1.8 * CELL * flame;
  const centre = { x: -1 * CELL + flick * 0.4, y: top + h * 0.5 };
  FX.paint(ctx, { x: centre.x - w, y: top, w: 2 * w, h: h + CELL }, { origin: { x: 0, y: 0 } }, (p, ix, iy) => {
    const dy = (p.y - top) / h, dx = (p.x - centre.x) / (w * (1 - dy * 0.75));
    if (dy < 0 || dy > 1 || Math.abs(dx) > 1) return null;
    const core = 1 - Math.abs(dx) - dy * 0.5;
    const base = core > 0.45 ? rgb(1, 0.95, 0.72) : core > 0.15 ? rgb(1, 0.70, 0.28) : rgb(0.92, 0.36, 0.14);
    return tone(base, 1.1, grain(ix, iy, Math.floor(time * 12)) * 0.04, 0.95 - dy * 0.3);
  });
}

// MARK: Hookah

const BRASS = rgb(0.66, 0.54, 0.34), BRASS_DARK = rgb(0.36, 0.28, 0.16);

function drawMouthpiece(ctx) {
  const g = MOUTHPIECE;
  paintRows(ctx, g.rows, g.gripRow, -2, 2, (i, r) => {
    const handle = r < 9;
    const hw = handle ? (r === 0 || r === 8 ? 1 : 2) : (r === g.rows - 1 ? 0 : 1);
    if (Math.abs(i) > hw) return null;
    const u = i / (hw + 0.5), n = grain(i, r, 11) * GRAIN;
    if (Math.abs(i) === hw && hw > 0) return tone(BRASS_DARK, 0.9 + 0.3 * Math.max(0, -u), n);
    if (handle && r % 3 === 1) return tone(BRASS_DARK, 1.2, n);            // turned rings on the handle
    return tone(BRASS, cylinder(u), n);
  });
}

const HOOKAH = {
  rows: 66,
  glass: rgb(0.30, 0.44, 0.42), water: rgb(0.20, 0.32, 0.31), glassEdge: rgb(0.12, 0.18, 0.18),
  clay: rgb(0.52, 0.30, 0.22), foil: rgb(0.80, 0.80, 0.80), coal: rgb(0.22, 0.20, 0.19), hot: rgb(0.95, 0.42, 0.14),
};
/** Row where the hose leaves the stem, and how far its port sticks out. */
export const HOOKAH_PORT = { row: 38, length: 4 };

function hookahHalfWidth(r) {
  if (r < 0 || r >= HOOKAH.rows) return -1;
  if (r < 23) return Math.max(5, Math.round(11 * Math.sin((Math.PI * (r + 2)) / 27) ** 0.7));   // glass vase
  if (r < 25) return 3;                                                                          // vase neck
  if (r < 27) return 5;                                                                          // collar
  if (r < 50) return (r >= 32 && r <= 34) || (r >= 42 && r <= 43) ? 3 : 1;                       // stem with knobs
  if (r < 52) return 8;                                                                          // ash tray
  if (r < 60) return 3 + Math.floor((r - 52) / 3);                                               // clay bowl
  if (r < 62) return 6;                                                                          // foil
  return 5;                                                                                      // coals
}

/**
 * Hookah standing on the floor; origin = floor point under its centre, y up.
 * `side` +1 the hose port faces right. `glow` heats the coals, `bubbles` 0...1 bubbling water, `time` animates.
 */
export function drawHookah(ctx, { side = 1, glow = 0, bubbles = 0, time = 0 }) {
  const rows = HOOKAH.rows, max = 11;
  FX.paint(ctx, { x: -(max + HOOKAH_PORT.length + 1) * CELL, y: 0, w: (2 * max + 2 * HOOKAH_PORT.length + 3) * CELL, h: rows * CELL },
    { origin: { x: -0.5 * CELL, y: 0 } }, (_p, i, r) => {
      const n = grain(i, r, 13) * GRAIN;
      if (r >= HOOKAH_PORT.row && r <= HOOKAH_PORT.row + 1 && i * side > 0 && Math.abs(i) <= 1 + HOOKAH_PORT.length) {
        return tone(r === HOOKAH_PORT.row ? BRASS_DARK : BRASS, 1, n);                           // hose port
      }
      const hw = hookahHalfWidth(r);
      if (hw < 0 || Math.abs(i) > hw) return null;
      const u = i / (hw + 0.5), edge = Math.abs(i) === hw || hookahHalfWidth(r + 1) < Math.abs(i) || r === 0;
      if (r < 25) {                                                                              // glass vase with water
        if (edge) return tone(HOOKAH.glassEdge, 1.1, n);
        const isWater = r < 15;
        const bubble = isWater && bubbles > 0 && hash(i, Math.floor(r - time * 9), 17) > 1 - 0.18 * bubbles;
        const base = bubble ? blend(HOOKAH.water, WHITE, 0.55) : isWater ? HOOKAH.water : HOOKAH.glass;
        const streak = u > -0.62 && u < -0.38 && r > 3 ? 0.3 : 0;
        return tone(streak ? blend(base, WHITE, streak) : base, cylinder(u), n);
      }
      if (r < 52) return tone(edge ? BRASS_DARK : BRASS, edge ? 1 : cylinder(u), n);           // brass stem and tray
      if (r < 60) return tone(edge ? blend(HOOKAH.clay, rgb(0, 0, 0), 0.4) : HOOKAH.clay, edge ? 1 : cylinder(u), n);
      if (r < 62) return tone(HOOKAH.foil, cylinder(u) * (hash(i, r, 19) > 0.6 ? 0.8 : 1), n);
      if (r > 64 || (r === 64 && ![1, 2].includes((i + 6) % 4))) return null;                // three coal lumps
      const heat = glow * (0.6 + 0.4 * Math.sin(time * 5 + i)) * (0.4 + 0.6 * hash(i, r, 21));
      return tone(blend(HOOKAH.coal, HOOKAH.hot, heat), r === 64 ? 1.15 : 0.9, n);
    });
}

/** Hose from the hookah port to the mouthpiece, sagging between them. Points in the caller's frame. */
export function drawHose(ctx, from, to) {
  const sag = 10 + 0.15 * Math.abs(to.x - from.x);
  const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - sag };
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (CELL * 0.5)) + 16;
  const dark = rgb(0.20, 0.22, 0.24), light = rgb(0.42, 0.44, 0.46);
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    const p = { x: a * from.x + b * mid.x + c * to.x, y: a * from.y + b * mid.y + c * to.y };
    const n = grain(k, 0, 23) * GRAIN;
    FX.block(ctx, p, { cells: 2, color: tone(dark, k % 4 === 0 ? 0.8 : 1, n) });
    FX.block(ctx, { x: p.x, y: p.y + CELL }, { cells: 1, color: tone(light, 1, n) });               // shine on the top
  }
}
