// Food props: a burger (bitten, turned in the hand to show it off), a pizza slice that will not give, and the pizza
// box (on the floor with its lid opening, in the hand, or flying). Same art-pixel grid and photo shading as props.mjs.
// Held props: the grip is the origin, the far end points up; the box on the floor: origin under its front middle.
import { CELL, rgb } from './geometry.mjs';
import { blend, cylinder, dome, grain, hash, tone } from './artstyle.mjs';
import * as FX from './pixelfx.mjs';

const GRAIN = 0.05;

export const BURGER = { rows: 15, half: 12, gripRow: 1, biteRow: 15, biteRadius: 4.2 };
export const SLICE = { rows: 19, half: 7, gripRow: 1, crustRows: 3 };
const BOX = { half: 15, front: 3, depth: 10, slant: 0.5 };
/** Drawn larger than their pixel grid so they read next to the mascot. */
const SIZE = { burger: 1.4, pizzaSlice: 1.3, box: 1.7 };

/** Grip to far end (the bite spot / the slice tip), used to bring the food to the mouth. */
export const foodTipDistance = (kind) => SIZE[kind] * CELL * (kind === 'burger' ? BURGER.biteRow - BURGER.gripRow : SLICE.rows - SLICE.gripRow);

const C = {
  bun: rgb(0.80, 0.55, 0.28), bunDark: rgb(0.56, 0.34, 0.16), sesame: rgb(0.94, 0.88, 0.70),
  patty: rgb(0.34, 0.20, 0.13), pattyDark: rgb(0.22, 0.12, 0.08), cheese: rgb(0.96, 0.74, 0.22),
  lettuce: rgb(0.42, 0.66, 0.26), tomato: rgb(0.80, 0.22, 0.17), crumb: rgb(0.92, 0.80, 0.58),
  crust: rgb(0.78, 0.52, 0.26), crustDark: rgb(0.50, 0.30, 0.14), pizzaCheese: rgb(0.96, 0.80, 0.40),
  sauce: rgb(0.80, 0.30, 0.16), pepperoni: rgb(0.66, 0.16, 0.14), pepperoniDark: rgb(0.44, 0.10, 0.09),
  card: rgb(0.80, 0.68, 0.50), cardDark: rgb(0.58, 0.46, 0.32), cardInside: rgb(0.88, 0.82, 0.70), logo: rgb(0.74, 0.16, 0.14),
};

// MARK: Burger

function burgerHalfWidth(r) {
  if (r < 0 || r >= BURGER.rows) return -1;
  if (r < 3) return BURGER.half - 3 + r;                                     // rounded bottom bun
  if (r < 8) return BURGER.half;                                             // patty, cheese, lettuce, tomato
  const k = (r - 7.5) / (BURGER.rows - 7.5);
  return Math.round(BURGER.half * Math.sqrt(Math.max(0, 1 - k * k)));        // domed top bun
}

const isBitten = (i, r, bites) => {
  const spots = [{ x: -3, y: BURGER.biteRow }, { x: 4, y: BURGER.biteRow - 1 }].slice(0, bites);
  return spots.some((s) => (i - s.x) ** 2 + (r - s.y) ** 2 < BURGER.biteRadius ** 2);
};

function burgerColor(i, r, bites) {
  const hw = burgerHalfWidth(r);
  if (hw < 0 || Math.abs(i) > hw || isBitten(i, r, bites)) return null;
  const u = i / (hw + 0.5), n = grain(i, r, 31) * GRAIN;
  const bitEdge = bites > 0 && (isBitten(i + 1, r, bites) || isBitten(i - 1, r, bites) || isBitten(i, r + 1, bites));
  if (bitEdge && r >= 3 && r < 8) return tone(C.crumb, 1, n);                // the inside shows where it was bitten
  if (r < 3) return tone(r === 0 || Math.abs(i) === hw ? C.bunDark : C.bun, cylinder(u) * 0.95, n);
  if (r < 5) return tone(hash(i, r, 3) > 0.7 ? C.pattyDark : C.patty, cylinder(u), n);
  if (r === 5) return tone(C.cheese, cylinder(u), n);
  if (r === 6) return (i + 13) % 3 === 0 && Math.abs(i) === hw ? null : tone(C.lettuce, cylinder(u), n);
  if (r === 7) return Math.abs(i) > hw - 2 ? null : tone(C.tomato, cylinder(u), n);
  const top = (r - 7.5) / (BURGER.rows - 7.5);
  if (hash(i, r, 7) > 0.86 && Math.abs(i) < hw) return tone(C.sesame, 1, n);
  return tone(Math.abs(i) === hw || r === BURGER.rows - 1 ? C.bunDark : C.bun, dome(u, top), n);
}

/** `bites` 0...2 chunks gone from the top, `spin` radians the burger is turned about its upright axis. */
export function drawBurger(ctx, { bites = 0, spin = 0 }) {
  const turn = Math.cos(spin);
  ctx.save();
  ctx.scale(SIZE.burger * Math.sign(turn || 1) * Math.max(0.18, Math.abs(turn)), SIZE.burger);
  FX.paint(ctx, { x: -(BURGER.half + 0.5) * CELL, y: -BURGER.gripRow * CELL, w: (2 * BURGER.half + 1) * CELL, h: BURGER.rows * CELL },
    { origin: { x: -0.5 * CELL, y: -BURGER.gripRow * CELL } }, (_p, i, r) => burgerColor(i, r, bites));
  ctx.restore();
}

// MARK: Pizza slice

const PEPPERONI = [{ x: -3, y: 6 }, { x: 3, y: 8 }, { x: 0, y: 12 }];

function sliceColor(i, r) {
  if (r < 0 || r >= SLICE.rows) return null;
  const hw = r < SLICE.crustRows ? SLICE.half : Math.round(SLICE.half * (1 - (r - SLICE.crustRows + 0.5) / (SLICE.rows - SLICE.crustRows)));
  if (Math.abs(i) > hw) return null;
  const u = i / (hw + 0.5), n = grain(i, r, 41) * GRAIN;
  if (r < SLICE.crustRows) return tone(r === 0 || Math.abs(i) === hw ? C.crustDark : C.crust, cylinder(u), n);
  if (Math.abs(i) === hw) return tone(C.sauce, 0.9, n);
  const pep = PEPPERONI.find((p) => (i - p.x) ** 2 + (r - p.y) ** 2 <= 2.6);
  if (pep) return tone((i - pep.x) ** 2 + (r - pep.y) ** 2 > 1.5 ? C.pepperoniDark : C.pepperoni, 1, n);
  return tone(hash(i, r, 9) > 0.8 ? blend(C.pizzaCheese, C.sauce, 0.3) : C.pizzaCheese, 1 - 0.08 * u, n);
}

export function drawPizzaSlice(ctx) {
  ctx.save();
  ctx.scale(SIZE.pizzaSlice, SIZE.pizzaSlice);
  FX.paint(ctx, { x: -(SLICE.half + 0.5) * CELL, y: -SLICE.gripRow * CELL, w: (2 * SLICE.half + 1) * CELL, h: SLICE.rows * CELL },
    { origin: { x: -0.5 * CELL, y: -SLICE.gripRow * CELL } }, (_p, i, r) => sliceColor(i, r));
  ctx.restore();
}

// MARK: Pizza box (oblique view: the top face recedes up and to the right)

const at = (x, d, h = 0) => ({ x: x + d * BOX.slant, y: BOX.front + h + d * BOX.slant });

function boxShapes(lid) {
  const { half: w, depth: D } = BOX;
  const theta = lid * 1.75;                                    // 0 closed ... about 100 degrees open
  const d = D * (1 - Math.cos(theta)), h = D * Math.sin(theta);
  return {
    front: [{ x: -w, y: 0 }, { x: w, y: 0 }, { x: w, y: BOX.front }, { x: -w, y: BOX.front }],
    side: [{ x: w, y: 0 }, { x: w + D * BOX.slant, y: D * BOX.slant }, at(w, D), at(w, 0)],
    top: [at(-w, 0), at(w, 0), at(w, D), at(-w, D)],
    lid: [at(-w, D), at(w, D), at(w, d, h), at(-w, d, h)],
    lidInside: theta > 0.45,
  };
}

/** Pizza inside the open box, minus the slices taken out (a wedge toward the front right). */
function pizzaInBox(p, taken) {
  const c = at(0, BOX.depth / 2), rx = BOX.half - 2, ry = BOX.depth * BOX.slant - 0.6;
  const dx = (p.x - c.x) / rx, dy = (p.y - c.y) / ry;
  if (dx * dx + dy * dy > 1) return null;
  const angle = Math.atan2(dy, dx);
  if (taken > 0 && angle < -0.3 && angle > -1.35) return null;              // the gap left by the slice
  return dx * dx + dy * dy > 0.78 ? 'crust' : hash(Math.round(p.x), Math.round(p.y), 5) > 0.82 ? 'pepperoni' : 'cheese';
}

/** `lid` 0 closed ... 1 open, `taken` 1 when the slice is out. Drawn in cell units scaled to CELL. */
export function drawPizzaBox(ctx, { lid = 0, taken = 0 }) {
  const s = boxShapes(lid);
  const inside = (poly, p) => FX.insidePolygon(poly, p);
  const reach = BOX.half + BOX.depth * BOX.slant + 1, height = BOX.front + BOX.depth * 2 + 2;
  ctx.save();
  ctx.scale(CELL * SIZE.box, CELL * SIZE.box);
  FX.paint(ctx, { x: -BOX.half - 1, y: 0, w: 2 * reach, h: height }, { cell: 1, origin: { x: -0.5, y: 0 } }, (p, i, r) => {
    const n = grain(i, r, 51) * GRAIN;
    const lidUp = s.lidInside;
    if (lidUp && inside(s.lid, p)) return tone(C.cardInside, 0.95 + 0.1 * (p.y / height), n);
    if (inside(s.front, p)) return tone(r === 0 ? C.cardDark : C.card, 0.82, n);
    if (inside(s.side, p)) return tone(C.cardDark, 0.9, n);
    if (inside(s.top, p)) {
      if (!lidUp && inside(s.lid, p)) return tone(Math.abs(p.x - 2) < 3 && Math.abs(p.y - 6.5) < 1.2 ? C.logo : C.card, 1.05, n);
      const part = lid > 0.3 ? pizzaInBox(p, taken) : null;
      if (part === 'crust') return tone(C.crust, 1, n);
      if (part === 'pepperoni') return tone(C.pepperoni, 1, n);
      if (part === 'cheese') return tone(C.pizzaCheese, 1, n);
      return tone(C.cardInside, 0.85, n);
    }
    if (!lidUp && inside(s.lid, p)) return tone(C.card, 1.05, n);
    return null;
  });
  ctx.restore();
}

/** Held / thrown box: closed, carried from underneath, so the grip is under its middle. */
export function drawHeldBox(ctx) {
  ctx.save();
  ctx.translate(-BOX.depth * BOX.slant * CELL * SIZE.box * 0.5, -CELL);
  drawPizzaBox(ctx, { lid: 0 });
  ctx.restore();
}
