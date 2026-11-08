// Vomit: lumpy chunks flying from the mouth into a glossy puddle on the floor. Shaded like the photo mascot.
import { CELL, lerp, rgb } from './geometry.mjs';
import { blend, dome, grain, hash, tone } from './artstyle.mjs';
import * as FX from './pixelfx.mjs';

const CHUNK_INTERVAL = 0.022;          // seconds between chunks leaving the mouth
const FLIGHT_TIME = 0.5;
const PUDDLE_HALF_WIDTH = 23;
const PUDDLE_HALF_HEIGHT = 4.2;
const PUDDLE_GROW_DELAY = 0.35;
const FLOOR_Y = 1.5;
const LANDING_AHEAD = 45;              // puddle distance in front of the feet
const GRAIN = 0.06;

const VODKA = { base: rgb(0.72, 0.70, 0.42), dark: rgb(0.48, 0.46, 0.24), bits: [rgb(0.86, 0.52, 0.22), rgb(0.82, 0.78, 0.58), rgb(0.50, 0.56, 0.26)] };
const BEER = { base: rgb(0.80, 0.62, 0.26), dark: rgb(0.52, 0.36, 0.10), bits: [rgb(0.88, 0.48, 0.18), rgb(0.90, 0.84, 0.62), rgb(0.58, 0.40, 0.16)] };
const SHINE = rgb(0.98, 0.96, 0.88);

/** Cheap deterministic noise in 0...1 so the stream does not flicker between frames. */
const noise = (i, salt) => hash(i, salt, 3);

export function drawVomit(ctx, v, { mouth, puddleX }) {
  const pal = v.isBeer ? BEER : VODKA;
  const alpha = 1 - v.fade;
  if (alpha <= 0.01) return;
  const landX = puddleX + v.side * LANDING_AHEAD;
  drawPuddle(ctx, v, pal, landX, alpha);
  const count = Math.trunc(v.flowEnd / CHUNK_INTERVAL) + 1;
  for (let i = 0; i < count; i++) {
    const age = v.elapsed - i * CHUNK_INTERVAL;
    if (!(age > 0 && age < FLIGHT_TIME)) continue;
    const u = age / FLIGHT_TIME;
    const target = { x: landX + (noise(i, 1) - 0.5) * PUDDLE_HALF_WIDTH, y: FLOOR_Y };
    const wobble = (noise(i, 2) - 0.5) * 3;
    const p = { x: lerp(mouth.x, target.x, u) + wobble * (1 - u), y: lerp(mouth.y - 1, target.y, u * u) + wobble * 0.6 };
    const tone0 = noise(i, 3);
    const base = tone0 < 0.15 ? pal.bits[i % pal.bits.length] : tone0 < 0.35 ? pal.dark : pal.base;
    drawChunk(ctx, p, noise(i, 4) > 0.5 ? 1.6 : 1.1, base, alpha, i);
  }
}

/** A small shaded lump, `r` in art pixels. */
function drawChunk(ctx, centre, r, base, alpha, salt) {
  const rad = r * CELL;
  FX.paint(ctx, { x: centre.x - rad, y: centre.y - rad, w: 2 * rad, h: 2 * rad }, {}, (p, ix, iy) => {
    const dx = (p.x - centre.x) / rad, dy = (p.y - centre.y) / rad;
    if (dx * dx + dy * dy > 1.15) return null;
    return tone(base, dome(dx, dy), grain(ix, iy, salt) * GRAIN, alpha);
  });
}

function drawPuddle(ctx, v, pal, centreX, alpha) {
  const grow = Math.min(1, Math.max(0, (v.elapsed - PUDDLE_GROW_DELAY) / Math.max(0.1, v.flowEnd)));
  if (grow <= 0.02) return;
  const eased = Math.sqrt(grow);
  const rx = PUDDLE_HALF_WIDTH * eased, ry = PUDDLE_HALF_HEIGHT * eased;
  const c = { x: centreX, y: FLOOR_Y };
  const salt = v.isBeer ? 31 : 37;
  FX.paint(ctx, { x: c.x - rx - CELL * 2, y: c.y - ry - CELL, w: 2 * rx + CELL * 4, h: 2 * ry + CELL * 3 }, {}, (p, ix, iy) => {
    const dx = (p.x - c.x) / rx, dy = (p.y - c.y) / ry;
    const wobble = 1 + 0.16 * Math.sin(dx * 7 + salt) + 0.1 * Math.sin(dx * 13 + salt * 2);   // splashy outline
    const d = dx * dx + dy * dy;
    if (d > wobble) return null;
    const n = grain(ix, iy, salt) * GRAIN;
    if (d > wobble * 0.72) return tone(pal.dark, 1, n, alpha * 0.9);                             // wet rim
    const lump = hash(Math.floor(ix / 2), Math.floor(iy / 2), salt);
    if (lump > 0.9 && eased > 0.4) return tone(pal.bits[Math.floor(lump * 97) % pal.bits.length], 1.05, n, alpha);
    if (dy > 0.15 && Math.abs(dx + 0.3) < 0.18 && d < 0.5) return tone(blend(pal.base, SHINE, 0.6), 1, n, alpha);   // gloss
    return tone(pal.base, 0.9 + 0.2 * dy, n, alpha * 0.95);
  });
}
