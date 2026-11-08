import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Config } from '../src/geometry.mjs';
import { ShatterWorld, SPLAT_LIFETIME } from '../src/shatter.mjs';

const world = (seed = 11) => new ShatterWorld({ floor: 20, bounds: { minX: 0, maxX: 900 }, seed });
const run = (w, seconds, dt = 1 / 120) => { for (let t = 0; t < seconds; t += dt) w.step(dt); };

test('a thrown bottle breaks on the floor into shards and droplets', () => {
  const w = world();
  w.throwBottle('vodka', { x: 150, y: 130 }, { x: 520, y: 400 });
  assert.equal(w.bottles.length, 1);
  run(w, 1.5);
  assert.equal(w.bottles.length, 0);
  assert.ok(w.shards.length > 20);
  for (const s of w.shards) assert.ok(s.pos.y >= w.floor - 0.001);
});

test('shards disappear after their lifetime', () => {
  const w = world();
  w.throwBottle('beer', { x: 150, y: 130 }, { x: 400, y: 300 });
  run(w, Config.shardLifetime + 3);
  assert.equal(w.shards.length, 0);
  assert.equal(w.droplets.length, 0);
  assert.ok(w.isEmpty);
});

test('the same seed gives the same glass', () => {
  const a = world(5), b = world(5);
  for (const w of [a, b]) { w.throwBottle('vodka', { x: 100, y: 100 }, { x: 300, y: 200 }); run(w, 1); }
  assert.deepEqual(a.shards.map((s) => s.pos), b.shards.map((s) => s.pos));
});

test('shards stay inside the horizontal bounds', () => {
  const w = world();
  w.throwBottle('beer', { x: 880, y: 130 }, { x: 600, y: 400 });
  run(w, 2);
  for (const s of w.shards) assert.ok(s.pos.x >= 0 && s.pos.x <= 900);
});

test('spit flies, splats on the glass and dries up', () => {
  const w = world();
  w.launchSpit({ x: 100, y: 100 }, { x: 600, y: 400 });
  run(w, 0.3);
  assert.equal(w.spits.length, 1);
  run(w, 1);
  assert.equal(w.spits.length, 0);
  assert.equal(w.splats.length, 1);
  run(w, SPLAT_LIFETIME);
  assert.ok(w.isEmpty);
});
