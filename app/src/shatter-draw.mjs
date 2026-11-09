// Draws the shatter world (thrown bottle, broken glass, spit, cigarette burns; smoke clouds separately) into a y-up context.
// Everything is shaded through `artstyle` so it matches the photo-pixel look of the mascot.
import { Config, rgb } from './geometry.mjs';
import { blend, dome, grain, hash, tone } from './artstyle.mjs';
import * as FX from './pixelfx.mjs';
import * as Props from './props.mjs';
import {
  DROPLET_LIFETIME, burnAlpha, junkAlpha, burnGlow, dripLength, globPosition, globProgress, shardAlpha, smokeAlpha, smokeScale, splatAlpha,
} from './shatter.mjs';

const PX = Config.pixelSize;
const GRAIN = 0.05;
const WHITE = rgb(1, 1, 1);

const SPIT = { body: rgb(0.80, 0.84, 0.80), rim: rgb(0.52, 0.58, 0.56), foam: rgb(0.95, 0.95, 0.92), bubble: rgb(0.62, 0.68, 0.66) };
const GLASS = {
  vodka: { edge: rgb(0.30, 0.36, 0.40), body: rgb(0.70, 0.74, 0.76), label: rgb(0.88, 0.86, 0.82), stripe: rgb(0.24, 0.31, 0.52), drop: rgb(0.84, 0.88, 0.90) },
  beer: { edge: rgb(0.14, 0.07, 0.03), body: rgb(0.44, 0.24, 0.08), label: rgb(0.88, 0.79, 0.56), stripe: rgb(0.54, 0.18, 0.15), drop: rgb(0.86, 0.60, 0.16) },
};
const SMOKE = { light: rgb(0.92, 0.92, 0.92), mid: rgb(0.78, 0.79, 0.81), shadow: rgb(0.58, 0.60, 0.64) };
const BURN = { char: rgb(0.10, 0.08, 0.07), scorch: rgb(0.32, 0.20, 0.11), singe: rgb(0.58, 0.44, 0.28), ash: rgb(0.62, 0.61, 0.60), ember: rgb(1, 0.45, 0.12), hot: rgb(1, 0.82, 0.45) };

/** Pre-rendered pictures for things that keep their look (smoke clouds, burns), keyed by the world object. */
const sprites = new WeakMap();

export function drawWorld(ctx, world) {
  ctx.save();
  for (const b of world.burns) drawBurn(ctx, b);
  for (const d of world.droplets) drawDroplet(ctx, d);
  for (const s of world.shards) drawShard(ctx, s);
  for (const s of world.splats) drawSplat(ctx, s);
  for (const g of world.spits) drawGlob(ctx, g);
  for (const j of world.junk) {
    ctx.save();
    ctx.globalAlpha = junkAlpha(j);
    ctx.translate(j.pos.x, j.pos.y);
    ctx.rotate(j.angle);
    ctx.scale(Config.spriteScale, Config.spriteScale);
    Props.draw(ctx, { kind: j.kind, angle: 0 });
    ctx.restore();
  }
  for (const b of world.bottles) {
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(b.angle);
    ctx.scale(Config.spriteScale, Config.spriteScale);
    Props.draw(ctx, { kind: b.kind, angle: 0, fill: 0, capOn: false });
    ctx.restore();
  }
  ctx.restore();
}

/** Smoke clouds go on their own layer above the mascot: they leave its mouth in front of the face. */
export function drawSmokes(ctx, world) {
  for (const s of world.smokes) drawSmoke(ctx, s);
}

// MARK: Glass

function drawShard(ctx, s) {
  if (s.points.length <= 2) return;
  const a = shardAlpha(s), look = GLASS[s.kind] ?? GLASS.vodka, seed = s.seed ?? 0;
  const n = s.points.length;
  const centre = { x: s.points.reduce((t, p) => t + p.x, 0) / n, y: s.points.reduce((t, p) => t + p.y, 0) / n };
  const shrunk = (k) => s.points.map((p) => ({ x: centre.x + (p.x - centre.x) * k, y: centre.y + (p.y - centre.y) * k }));
  const inner = shrunk(0.7), glint = shrunk(0.32).map((p) => ({ x: p.x - 1.2, y: p.y + 1.2 }));
  const xs = s.points.map((p) => p.x), ys = s.points.map((p) => p.y);
  const bounds = { x: Math.min(...xs) - PX, y: Math.min(...ys) - PX, w: Math.max(...xs) - Math.min(...xs) + 2 * PX, h: Math.max(...ys) - Math.min(...ys) + 2 * PX };
  ctx.save();
  ctx.translate(s.pos.x, s.pos.y);
  ctx.rotate(s.angle);
  FX.paint(ctx, bounds, { cell: PX }, (p, ix, iy) => {
    if (!FX.insidePolygon(s.points, p)) return null;
    const g = grain(ix, iy, seed) * GRAIN;
    if (!FX.insidePolygon(inner, p)) return tone(look.edge, 1, g, 0.92 * a);
    if (FX.insidePolygon(glint, p)) return tone(blend(look.body, WHITE, 0.6), 1.1, g, 0.95 * a);
    if (s.hasLabel) return tone(iy % 4 === 0 ? look.stripe : look.label, 0.95, g, a);
    const light = 0.85 + 0.3 * ((p.y - centre.y) - (p.x - centre.x)) / (s.radius * 4 + 1);   // brighter toward the upper left
    return tone(look.body, light, g, 0.88 * a);
  });
  ctx.restore();
}

function drawDroplet(ctx, d) {
  const a = 1 - d.age / DROPLET_LIFETIME;
  const look = GLASS[d.kind] ?? GLASS.vodka;
  const big = d.radius > 2.2;
  FX.block(ctx, d.pos, { cells: big ? 2 : 1, cell: PX, color: tone(look.drop, 0.85, 0, 0.85 * a) });
  if (big) FX.block(ctx, { x: d.pos.x, y: d.pos.y + PX }, { cells: 1, cell: PX, color: tone(blend(look.drop, WHITE, 0.6), 1, 0, 0.9 * a) });
}

// MARK: Spit

function drawGlob(ctx, g) {
  const k = globProgress(g);
  const r = (1.6 + 2.6 * k * k) * PX;                      // grows as it nears the glass
  const p = globPosition(g);
  wetBlob(ctx, p, r + PX, 1, 7, () => 1);
  for (let i = 1; i <= 3; i++) {                           // a few specks trailing behind
    const back = k - i * 0.035;
    if (back <= 0) continue;
    const t = globPosition({ ...g, age: back * g.flight });
    FX.block(ctx, { x: t.x, y: t.y + (i % 2) * PX }, { cells: 1, cell: PX, color: tone(SPIT.body, 0.9, 0, 0.85) });
  }
}

/** A wet, glossy blob of spit with bubbles; `shape(angle)` scales the radius for an irregular outline. */
function wetBlob(ctx, c, radius, alpha, salt, shape) {
  const reach = radius * 1.3;
  FX.paint(ctx, { x: c.x - reach, y: c.y - reach, w: 2 * reach, h: 2 * reach }, { cell: PX }, (p, ix, iy) => {
    const dx = p.x - c.x, dy = p.y - c.y;
    const rr = radius * shape(Math.atan2(dy, dx));
    const d = Math.hypot(dx, dy) / rr;
    if (d > 1) return null;
    const g = grain(ix, iy, salt) * GRAIN;
    if (d > 0.8) return tone(SPIT.rim, 1, g, 0.8 * alpha);
    const hx = (dx + rr * 0.3) / rr, hy = (dy - rr * 0.3) / rr;
    if (hx * hx + hy * hy < 0.06) return tone(SPIT.foam, 1.1, g, 0.95 * alpha);                 // glossy highlight
    if (hash(ix, iy, salt + 1) > 0.93) return tone(SPIT.bubble, 1, g, 0.9 * alpha);             // tiny bubbles
    return tone(SPIT.body, dome(dx / rr, dy / rr) * 1.2, g, 0.82 * alpha);
  });
}

function drawSplat(ctx, s) {
  const a = splatAlpha(s);
  const salt = Math.round(s.radius * 100);
  for (const d of s.drips) {                                // drips run down from the blob
    const len = dripLength(s, d);
    if (len <= PX) continue;
    const x = s.pos.x + d.dx, half = d.width * PX * 0.5 + 0.01;
    FX.paint(ctx, { x: x - PX * 2, y: s.pos.y - len - PX, w: PX * 4, h: len + PX }, { cell: PX }, (p, ix, iy) => {
      if (Math.abs(p.x - x) > half || p.y > s.pos.y || p.y < s.pos.y - len) return null;
      return tone(p.x < x ? blend(SPIT.body, WHITE, 0.4) : SPIT.body, 1, grain(ix, iy, salt) * GRAIN, 0.82 * a);
    });
    wetBlob(ctx, { x, y: s.pos.y - len }, d.width * PX + PX * 0.8, a, salt + 3, () => 1);
  }
  wetBlob(ctx, s.pos, s.radius + PX, a, salt, (ang) => 1 + 0.14 * Math.sin(3 * ang + salt) + 0.08 * Math.sin(5 * ang + salt * 2));
  for (const sp of s.specks) {
    FX.block(ctx, { x: s.pos.x + sp.dx, y: s.pos.y + sp.dy }, { cells: sp.cells, cell: PX, color: tone(SPIT.body, 0.9, 0, 0.8 * a) });
  }
}

// MARK: Smoke and burns

/** Offscreen canvas for a pre-rendered picture `size` x `size` (logical px) at the context's pixel density. */
function makeCanvas(ctx, size) {
  const scale = Math.max(1, Math.abs(ctx.getTransform().a));
  const c = document.createElement('canvas');
  c.width = Math.ceil(size * scale); c.height = Math.ceil(size * scale);
  const g = c.getContext('2d');
  g.setTransform(scale, 0, 0, -scale, 0, c.height);           // y up, like the layer
  g.imageSmoothingEnabled = false;
  return { canvas: c, ctx: g };
}

/** Draws a cached sprite centred on `pos`. */
function blit(ctx, sprite, pos, scale, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(pos.x, pos.y);
  ctx.scale(scale, -scale);                                   // the cached picture is stored y down
  ctx.drawImage(sprite.canvas, -sprite.size / 2, -sprite.size / 2, sprite.size, sprite.size);
  ctx.restore();
}

/** A billowing pixel cloud: a few overlapping puffs, lit from the upper left, with a dithered soft edge. */
function renderSmoke(ctx, s) {
  const radius = 34 * s.size, size = Math.ceil(radius * 2.6);
  const out = makeCanvas(ctx, size);
  const c = { x: size / 2, y: size / 2 };
  const lobes = Array.from({ length: 6 }, (_, i) => {
    const ang = hash(i, 1, s.seed) * Math.PI * 2, dist = radius * 0.45 * hash(i, 2, s.seed);
    return { x: c.x + Math.cos(ang) * dist * 1.3, y: c.y + Math.sin(ang) * dist * 0.8, r: radius * (0.42 + 0.3 * hash(i, 3, s.seed)) };
  });
  FX.paint(out.ctx, { x: 0, y: 0, w: size, h: size }, { cell: PX }, (p, ix, iy) => {
    let best = 0, lobe = null;
    for (const l of lobes) {
      const d = 1 - Math.hypot(p.x - l.x, p.y - l.y) / l.r;
      if (d > best) { best = d; lobe = l; }
    }
    if (best <= 0) return null;
    const dither = hash(ix, iy, s.seed + 5);
    if (best < 0.18 && dither > best / 0.18) return null;                                         // ragged soft edge
    const light = dome((p.x - lobe.x) / lobe.r, (p.y - lobe.y) / lobe.r);
    const base = light > 0.9 ? SMOKE.light : light > 0.7 ? SMOKE.mid : SMOKE.shadow;
    return tone(base, 1, grain(ix, iy, s.seed) * GRAIN, Math.min(0.85, 0.35 + best * 1.4));
  });
  return { canvas: out.canvas, size };
}

function drawSmoke(ctx, s) {
  let sprite = sprites.get(s);
  if (!sprite) { sprite = renderSmoke(ctx, s); sprites.set(s, sprite); }
  blit(ctx, sprite, s.pos, smokeScale(s), smokeAlpha(s));
}

/** Scorched spot left by a cigarette pressed out on the screen: charred centre, brown singe, flecks of ash. */
function renderBurn(ctx, b) {
  const radius = 9, size = radius * 3;
  const out = makeCanvas(ctx, size);
  const c = { x: size / 2, y: size / 2 };
  FX.paint(out.ctx, { x: 0, y: 0, w: size, h: size }, { cell: PX }, (p, ix, iy) => {
    const dx = p.x - c.x, dy = p.y - c.y, ang = Math.atan2(dy, dx);
    const d = Math.hypot(dx, dy) / (radius * (1 + 0.18 * Math.sin(5 * ang + b.seed) + 0.1 * Math.sin(9 * ang + b.seed * 3)));
    if (d > 1.25) return null;
    const g = grain(ix, iy, b.seed) * 0.07;
    if (d > 1) return hash(ix, iy, b.seed + 2) > 0.65 ? tone(BURN.singe, 1, g, 0.35) : null;      // speckled outer singe
    if (d < 0.3) return tone(hash(ix, iy, b.seed + 1) > 0.75 ? BURN.ash : BURN.char, 1, g, 0.95);
    if (d < 0.65) return tone(hash(ix, iy, b.seed + 3) > 0.9 ? BURN.ash : BURN.scorch, 0.8 + 0.4 * d, g, 0.9);
    return tone(BURN.singe, 0.9, g, 0.75 - 0.35 * (d - 0.65));
  });
  return { canvas: out.canvas, size };
}

function drawBurn(ctx, b) {
  let sprite = sprites.get(b);
  if (!sprite) { sprite = renderBurn(ctx, b); sprites.set(b, sprite); }
  const a = burnAlpha(b);
  blit(ctx, sprite, b.pos, 1, a);
  const glow = burnGlow(b);
  if (glow > 0) {                                             // still smouldering: a hot core and a thin wisp of smoke
    FX.ellipse(ctx, b.pos, PX * 3, PX * 2.4, { cell: PX, color: tone(BURN.ember, 1, 0, 0.55 * glow) });
    FX.block(ctx, b.pos, { cells: 1, cell: PX, color: tone(BURN.hot, 1.1, 0, glow) });
    for (let i = 0; i < 7; i++) {
      const k = ((b.age * 0.9 + i / 7) % 1);
      const p = { x: b.pos.x + Math.sin(k * 7 + i) * 3 * k, y: b.pos.y + 3 + k * 26 };
      FX.block(ctx, p, { cells: 1, cell: PX, color: tone(SMOKE.mid, 1, 0, 0.6 * (1 - k) * glow) });
    }
  }
}
