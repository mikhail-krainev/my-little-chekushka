// Look of the drawn extras. The mascot is a pixelated photo: muted warm-grey colours, soft shading, glints and
// per-pixel grain, never pure black or white. Everything drawn on top of it (bottles, cigarette, hookah, smoke,
// glass, spit, vomit, burns) goes through `tone` so it reads as part of the same picture.
import { rgb } from './geometry.mjs';

const SATURATION = 0.74;          // photo colours are muted
const WARMTH = 0.022;             // and slightly warm
const BLACK = 0.07;               // darkest value in the reference sprites
const WHITE = 0.9;                // brightest value in the reference sprites
const LEVELS = 63;                // colour quantisation, keeps the CSS string cache small
const ALPHA_LEVELS = 31;

const cache = new Map();

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Deterministic noise in 0...1 for an art pixel, so grain sticks to the object instead of flickering. */
export function hash(ix, iy, salt = 0) {
  const v = Math.sin(ix * 127.1 + iy * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Signed grain in -1...1. */
export const grain = (ix, iy, salt = 0) => hash(ix, iy, salt) * 2 - 1;

function cached(r, g, b, a) {
  const qr = Math.round(clamp01(r) * LEVELS), qg = Math.round(clamp01(g) * LEVELS), qb = Math.round(clamp01(b) * LEVELS);
  const qa = Math.round(clamp01(a) * ALPHA_LEVELS);
  const key = ((qr * 64 + qg) * 64 + qb) * 32 + qa;
  let c = cache.get(key);
  if (!c) {
    c = rgb(qr / LEVELS, qg / LEVELS, qb / LEVELS, qa / ALPHA_LEVELS);
    cache.set(key, c);
  }
  return c;
}

/**
 * Photo-like colour from a base colour.
 * @param light  brightness multiplier (shading)
 * @param noise  grain already scaled, added to every channel
 * @param alpha  overrides the base alpha
 */
export function tone(base, light = 1, noise = 0, alpha = base.a) {
  let r = base.r * light + noise, g = base.g * light + noise, b = base.b * light + noise;
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  r = l + (r - l) * SATURATION + WARMTH;
  g = l + (g - l) * SATURATION;
  b = l + (b - l) * SATURATION - WARMTH;
  const span = WHITE - BLACK;
  return cached(BLACK + clamp01(r) * span, BLACK + clamp01(g) * span, BLACK + clamp01(b) * span, alpha);
}

/** Mixes two colours (components 0...1). */
export const blend = (a, b, t) => rgb(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t);

/**
 * Shading across a round object, `u` in -1 (left edge) ... 1 (right edge). Light comes from the upper left like
 * in the reference photo: a bright glint left of centre, a faint rim light on the right, dark edges.
 */
export function cylinder(u) {
  const glint = Math.exp(-(((u + 0.42) / 0.2) ** 2));
  const rim = Math.exp(-(((u - 0.68) / 0.13) ** 2));
  return 0.78 + 0.42 * glint + 0.14 * rim - 0.3 * u ** 4 - 0.08 * u;
}

/** Shading of a lump lit from the upper left; `dx`, `dy` normalised to the lump radius (y up). */
export function dome(dx, dy) {
  const d2 = dx * dx + dy * dy;
  const facing = Math.sqrt(Math.max(0, 1 - d2));
  const lit = Math.max(0, -0.55 * dx + 0.6 * dy + 0.58 * facing);
  return 0.55 + 0.6 * lit;
}
