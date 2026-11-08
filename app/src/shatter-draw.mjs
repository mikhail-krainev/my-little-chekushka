// Draws the shatter world (thrown bottle, broken glass, spit) into a y-up context.
import { Config, rgb, withAlpha } from './geometry.mjs';
import * as FX from './pixelfx.mjs';
import * as Props from './props.mjs';
import { DROPLET_LIFETIME, dripLength, globPosition, globProgress, shardAlpha, splatAlpha } from './shatter.mjs';

const PX = Config.pixelSize;
const SPIT_FOAM = rgb(0.93, 0.96, 0.92);
const SPIT_BODY = rgb(0.80, 0.88, 0.86);
const SPIT_RIM = rgb(0.58, 0.70, 0.70);

export function drawWorld(ctx, world) {
  ctx.save();
  for (const d of world.droplets) drawDroplet(ctx, d);
  for (const s of world.shards) drawShard(ctx, s);
  for (const s of world.splats) drawSplat(ctx, s);
  for (const g of world.spits) drawGlob(ctx, g);
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

function drawShard(ctx, s) {
  if (s.points.length <= 2) return;
  const a = shardAlpha(s), beer = s.kind === 'beer';
  ctx.save();
  ctx.translate(s.pos.x, s.pos.y);
  ctx.rotate(s.angle);
  // dark rim, glass body, bright inner edge: three nested pixel polygons
  const n = s.points.length;
  const centre = { x: s.points.reduce((t, p) => t + p.x, 0) / n, y: s.points.reduce((t, p) => t + p.y, 0) / n };
  const shrunk = (k) => s.points.map((p) => ({ x: centre.x + (p.x - centre.x) * k, y: centre.y + (p.y - centre.y) * k }));
  FX.polygon(ctx, s.points, { cell: PX, color: beer ? rgb(0.25, 0.12, 0.03, 0.9 * a) : rgb(0.22, 0.38, 0.48, 0.9 * a) });
  FX.polygon(ctx, shrunk(0.78), { cell: PX, color: beer ? rgb(0.50, 0.26, 0.06, 0.9 * a) : rgb(0.70, 0.87, 0.95, 0.85 * a) });
  FX.polygon(ctx, shrunk(0.42), { cell: PX, color: beer ? rgb(0.95, 0.72, 0.35, 0.9 * a) : rgb(1, 1, 1, 0.95 * a) });
  ctx.restore();
}

function drawDroplet(ctx, d) {
  const a = 1 - d.age / DROPLET_LIFETIME;
  const color = d.kind === 'beer' ? rgb(0.92, 0.62, 0.10, 0.9 * a) : rgb(0.85, 0.94, 1, 0.8 * a);
  FX.block(ctx, d.pos, { cells: d.radius > 2.2 ? 2 : 1, cell: PX, color });
}

function drawGlob(ctx, g) {
  const k = globProgress(g);
  const r = (1.6 + 2.6 * k * k) * PX;                      // grows as it nears the glass
  const p = globPosition(g);
  FX.disc(ctx, p, r + PX, { cell: PX, color: SPIT_RIM });
  FX.disc(ctx, p, r, { cell: PX, color: SPIT_BODY });
  FX.block(ctx, { x: p.x - r * 0.3, y: p.y + r * 0.3 }, { cells: 1, cell: PX, color: SPIT_FOAM });
  for (let i = 1; i <= 3; i++) {                           // a few specks trailing behind
    const back = k - i * 0.035;
    if (back <= 0) continue;
    const t = globPosition({ ...g, age: back * g.flight });
    FX.block(ctx, { x: t.x, y: t.y + (i % 2) * PX }, { cells: 1, cell: PX, color: SPIT_BODY });
  }
}

function drawSplat(ctx, s) {
  const a = splatAlpha(s);
  const faded = (c) => withAlpha(c, a);
  for (const d of s.drips) {                                // drips run down from the blob
    const len = dripLength(s, d);
    if (len <= PX) continue;
    const x = s.pos.x + d.dx;
    FX.fill(ctx, { x: x - PX * 2, y: s.pos.y - len - PX, w: PX * 4, h: len + PX }, { cell: PX, color: faded(SPIT_BODY) },
      (p) => Math.abs(p.x - x) <= d.width * PX * 0.5 + 0.01 && p.y <= s.pos.y && p.y >= s.pos.y - len);
    FX.disc(ctx, { x, y: s.pos.y - len }, d.width * PX + PX * 0.6, { cell: PX, color: faded(SPIT_BODY) });
  }
  FX.disc(ctx, s.pos, s.radius + PX, { cell: PX, color: faded(SPIT_RIM) });
  FX.disc(ctx, s.pos, s.radius, { cell: PX, color: faded(SPIT_BODY) });
  FX.disc(ctx, { x: s.pos.x - s.radius * 0.25, y: s.pos.y + s.radius * 0.25 }, s.radius * 0.45, { cell: PX, color: faded(SPIT_FOAM) });
  for (const sp of s.specks) FX.block(ctx, { x: s.pos.x + sp.dx, y: s.pos.y + sp.dy }, { cells: sp.cells, cell: PX, color: faded(SPIT_BODY) });
}
