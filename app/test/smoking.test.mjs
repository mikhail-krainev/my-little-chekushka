import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cues, makePerformance, performance } from '../src/animator.mjs';
import { blendPoses, newFace } from '../src/pose.mjs';
import { BURN_LIFETIME, HOOKAH_SMOKE_LIFETIME, ShatterWorld } from '../src/shatter.mjs';
import { HOOKAH, SMOKE } from '../src/smoking.mjs';

const at = (perf, t) => performance(perf, t, newFace());
const world = () => new ShatterWorld({ floor: 0, bounds: { minX: 0, maxX: 900 }, seed: 4 });
const run = (w, seconds, dt = 1 / 120) => { for (let t = 0; t < seconds; t += dt) w.step(dt); };

test('the cigarette is smoked three times, then pressed out on the screen', () => {
  const perf = makePerformance('smoke', { side: 1 });
  const list = cues(perf);
  assert.equal(list.filter((c) => c.type === 'exhale').length, SMOKE.puffs);
  assert.equal(list.at(-1).type, 'burn');
  for (const c of list) assert.ok(c.at < perf.duration);
  assert.equal(at(perf, 0.1).prop, null);
  assert.equal(at(perf, SMOKE.firstPuff + 0.5).prop.kind, 'cigarette');
  assert.ok(at(perf, SMOKE.firstPuff + 0.5).prop.glow > 0.9, 'ember flares on a drag');
  assert.notEqual(at(perf, 1.6).prop2, null, 'lighter out while lighting');
  assert.ok(at(perf, SMOKE.burnAt).prop.depth > 0.9, 'butt pushed toward the screen');
  assert.equal(at(perf, perf.duration - 0.05).prop, null);
});

test('the hookah stands beside the mascot, four pulls, each a big cloud that lasts 5 s', () => {
  const perf = makePerformance('hookah', { side: -1 });
  const list = cues(perf);
  assert.equal(list.length, HOOKAH.puffs);
  for (const c of list) {
    assert.equal(c.type, 'exhale');
    assert.equal(c.life, HOOKAH_SMOKE_LIFETIME);
  }
  assert.equal(HOOKAH_SMOKE_LIFETIME, 5);
  const pulling = at(perf, HOOKAH.firstPuff + 1.2);
  assert.ok(pulling.effects.hookah.bubbles > 0);
  assert.equal(pulling.prop.kind, 'mouthpiece');
  assert.ok(pulling.shift.y < -15, 'sits while smoking');
  assert.equal(at(perf, perf.duration - 0.01).effects.hookah, null);
});

test('a smoke cloud hangs for its lifetime and then is gone', () => {
  const w = world();
  w.puffSmoke({ x: 100, y: 100 }, { size: 1, life: HOOKAH_SMOKE_LIFETIME, drift: 1 });
  run(w, HOOKAH_SMOKE_LIFETIME - 0.2);
  assert.equal(w.smokes.length, 1);
  assert.ok(w.smokes[0].pos.y > 100, 'drifts up');
  run(w, 0.4);
  assert.ok(w.isEmpty);
});

test('a cigarette burn stays on the screen for 5 s', () => {
  const w = world();
  w.burn({ x: 300, y: 300 });
  run(w, 4.8);
  assert.equal(w.burns.length, 1);
  assert.deepEqual(w.burns[0].pos, { x: 300, y: 300 });
  run(w, 0.4);
  assert.equal(BURN_LIFETIME, 5);
  assert.ok(w.isEmpty);
});

test('blending two poses starts at the first and ends at the second without a jump', () => {
  const sleep = { kind: 'sleep', duration: 12, side: 1 };
  const a = at(sleep, 5), b = at(makePerformance('stretch', { side: 1 }), 0);
  assert.equal(blendPoses(a, b, 1), b);
  const start = blendPoses(a, b, 0);
  // same body transform: the top of the head lands in the same spot
  const head = (p) => {
    const pv = p.pivot, x0 = 60 - pv.x, y0 = 172 - pv.y;
    const sx = x0 * (1 + p.squash * 0.6), sy = y0 * (1 - p.squash), c = Math.cos(p.tilt), s = Math.sin(p.tilt);
    return { x: sx * c - sy * s + pv.x + p.shift.x, y: sx * s + sy * c + pv.y + p.shift.y };
  };
  const h0 = head(a), h1 = head(start);
  assert.ok(Math.hypot(h0.x - h1.x, h0.y - h1.y) < 1e-6);
});
