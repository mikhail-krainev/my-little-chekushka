// Pixel-art helpers. Everything extra (arms, bottles, smoke, glass, spit) is snapped to a grid of art pixels,
// the same grid the sprites cut from the reference use, so it matches the mascot.
// The context is y-up (see renderer.beginYUp); rects are {x, y, w, h} with y the bottom edge.
import { CELL, RefMap } from './geometry.mjs';

export const BODY_GRID = RefMap.point(0, 0);

/** Fills every grid cell inside `bounds` whose centre satisfies `inside`. Runs in one row become one rect. */
export function fill(ctx, bounds, { cell = CELL, origin = { x: 0, y: 0 }, color }, inside) {
  if (!(bounds.w > 0 && bounds.h > 0 && cell > 0)) return;
  ctx.fillStyle = color.css;
  const x0 = Math.floor((bounds.x - origin.x) / cell), x1 = Math.ceil((bounds.x + bounds.w - origin.x) / cell);
  const y0 = Math.floor((bounds.y - origin.y) / cell), y1 = Math.ceil((bounds.y + bounds.h - origin.y) / cell);
  for (let iy = y0; iy < y1; iy++) {
    let runStart = null;
    for (let ix = x0; ix <= x1; ix++) {                          // x1 is a sentinel that flushes the last run
      const hit = ix < x1 && inside({ x: origin.x + (ix + 0.5) * cell, y: origin.y + (iy + 0.5) * cell });
      if (hit) {
        if (runStart === null) runStart = ix;
      } else if (runStart !== null) {
        ctx.fillRect(origin.x + runStart * cell, origin.y + iy * cell, (ix - runStart) * cell, cell);
        runStart = null;
      }
    }
  }
}

export function ellipse(ctx, center, rx, ry, { cell = CELL, origin = { x: 0, y: 0 }, color }) {
  if (!(rx > 0 && ry > 0)) return;
  const bounds = { x: center.x - rx, y: center.y - ry, w: 2 * rx, h: 2 * ry };
  fill(ctx, bounds, { cell, origin, color }, (p) => {
    const dx = (p.x - center.x) / rx, dy = (p.y - center.y) / ry;
    return dx * dx + dy * dy <= 1;
  });
}

export function disc(ctx, center, radius, { cell = CELL, color }) {
  ellipse(ctx, center, radius, radius, { cell, color });
}

/** One art pixel block at the grid cell that contains `p`. */
export function block(ctx, p, { cells = 1, cell = CELL, color }) {
  const side = cells * cell;
  ctx.fillStyle = color.css;
  ctx.fillRect(Math.floor(p.x / cell) * cell, Math.floor(p.y / cell) * cell, side, side);
}

/** Draws a small bitmap (rows top to bottom, `X` = filled) with its top-left corner snapped to the grid. */
export function bitmap(ctx, rows, topLeft, { scale = 1, cell = CELL, color }) {
  ctx.fillStyle = color.css;
  const unit = cell * scale;
  const left = Math.round(topLeft.x / cell) * cell, top = Math.round(topLeft.y / cell) * cell;
  rows.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (line[col] === 'X') ctx.fillRect(left + col * unit, top - (row + 1) * unit, unit, unit);
    }
  });
}

function insidePolygon(points, p) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Polygon rasterised on the grid of the current coordinate system. */
export function polygon(ctx, points, { cell, color }) {
  if (points.length === 0) return;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - cell, minY = Math.min(...ys) - cell;
  const bounds = { x: minX, y: minY, w: Math.max(...xs) + cell - minX, h: Math.max(...ys) + cell - minY };
  fill(ctx, bounds, { cell, color }, (p) => insidePolygon(points, p));
}
