import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  JUMP_MIN_DISTANCE, PANIC_RADIUS, PANIC_SECONDS, TIRED_SPEED, canBeClicked, phaseAt, step, tiredSpeed,
} from '../quit/runaway.mjs';

const area = { x: 0, y: 0, w: 1440, h: 860 };
const size = { w: 90, h: 36 };
const seeded = (seed = 11) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('the button panics for 15 seconds, then can be clicked', () => {
  assert.equal(PANIC_SECONDS, 15);
  assert.equal(phaseAt(0), 'panic');
  assert.equal(phaseAt(14.9), 'panic');
  assert.equal(canBeClicked(14.9), false);
  assert.equal(phaseAt(15), 'tired');
  assert.equal(canBeClicked(15), true);
});

test('while panicking it jumps far away once the cursor comes close', () => {
  const random = seeded();
  for (let i = 0; i < 200; i++) {
    const center = { x: 700, y: 400 };
    const cursor = { x: 700 + (PANIC_RADIUS - 1) * Math.cos(i), y: 400 + (PANIC_RADIUS - 1) * Math.sin(i) };
    const next = step({ center, size, area, cursor, elapsed: 3, dt: 1 / 60 }, random);
    assert.ok(next.jumped);
    assert.ok(Math.hypot(next.center.x - cursor.x, next.center.y - cursor.y) >= JUMP_MIN_DISTANCE);
    assert.ok(next.center.x >= size.w / 2 && next.center.x <= area.w - size.w / 2);
    assert.ok(next.center.y >= size.h / 2 && next.center.y <= area.h - size.h / 2);
  }
});

test('a far cursor leaves it alone', () => {
  const center = { x: 700, y: 400 };
  const next = step({ center, size, area, cursor: { x: 100, y: 100 }, elapsed: 3, dt: 1 / 60 });
  assert.deepEqual(next, { center, jumped: false });
});

test('once tired it drifts away, slower and slower, never jumping', () => {
  assert.equal(tiredSpeed(3), 0);
  assert.ok(tiredSpeed(15) > tiredSpeed(20));
  assert.ok(tiredSpeed(20) > tiredSpeed(30));
  assert.equal(tiredSpeed(120), TIRED_SPEED.floor);
  const center = { x: 700, y: 400 };
  const next = step({ center, size, area, cursor: { x: 650, y: 400 }, elapsed: 40, dt: 0.1 });
  assert.equal(next.jumped, false);
  assert.ok(next.center.x > center.x);
  assert.ok(next.center.x - center.x <= TIRED_SPEED.floor * 0.1 + 1);
});

test('a cornered tired button slides along the wall', () => {
  const center = { x: area.w - size.w / 2, y: 400 };
  const next = step({ center, size, area, cursor: { x: center.x - 40, y: 400 }, elapsed: 16, dt: 0.1 });
  assert.notDeepEqual(next.center, center);
});
