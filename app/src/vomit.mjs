// Pixel-art vomit: chunks flying from the mouth into a puddle on the floor.
import { lerp, rgb, withAlpha } from './geometry.mjs';
import * as FX from './pixelfx.mjs';

const CHUNK_INTERVAL = 0.022;          // seconds between chunks leaving the mouth
const FLIGHT_TIME = 0.5;
const PUDDLE_HALF_WIDTH = 21;
const PUDDLE_HALF_HEIGHT = 3.6;
const PUDDLE_GROW_DELAY = 0.35;
const FLOOR_Y = 1.5;
const LANDING_AHEAD = 45;              // puddle distance in front of the feet

const VODKA = { dark: rgb(0.55, 0.58, 0.24), base: rgb(0.76, 0.79, 0.42), light: rgb(0.93, 0.95, 0.66) };
const BEER = { dark: rgb(0.58, 0.40, 0.08), base: rgb(0.85, 0.66, 0.20), light: rgb(0.98, 0.90, 0.58) };

/** Cheap deterministic noise in 0...1 so the stream does not flicker between frames. */
function noise(i, salt) {
  const v = Math.sin((i * 127 + salt * 311) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

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
    const tone = noise(i, 3);
    const color = tone < 0.25 ? pal.dark : (tone > 0.7 ? pal.light : pal.base);
    FX.block(ctx, p, { cells: noise(i, 4) > 0.5 ? 3 : 2, color: withAlpha(color, alpha) });
  }
}

function drawPuddle(ctx, v, pal, centreX, alpha) {
  const grow = Math.min(1, Math.max(0, (v.elapsed - PUDDLE_GROW_DELAY) / Math.max(0.1, v.flowEnd)));
  if (grow <= 0.02) return;
  const c = { x: centreX, y: FLOOR_Y };
  const eased = Math.sqrt(grow);
  FX.ellipse(ctx, c, PUDDLE_HALF_WIDTH * eased, PUDDLE_HALF_HEIGHT * eased, { color: withAlpha(pal.dark, alpha) });
  FX.ellipse(ctx, { x: c.x, y: c.y + 0.4 }, PUDDLE_HALF_WIDTH * eased * 0.8, PUDDLE_HALF_HEIGHT * eased * 0.65, { color: withAlpha(pal.base, alpha) });
  // a few lumps and a shine
  const light = withAlpha(pal.light, alpha);
  if (eased > 0.5) {
    for (const [dx, dy] of [[-0.45, 0.1], [0.1, -0.2], [0.5, 0.15]]) {
      FX.block(ctx, { x: c.x + dx * PUDDLE_HALF_WIDTH * eased, y: c.y + dy * PUDDLE_HALF_HEIGHT }, { cells: 1, color: light });
    }
  }
}
