import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MascotController } from '../src/controller.mjs';
import { TRIGGER_PHRASES, TriggerGate } from '../src/triggers.mjs';

function setup() {
  let now = 0;
  const wobble = [], events = [];
  const c = new MascotController({
    clock: () => now,
    getScreen: () => ({ work: { minX: 0, minY: 0, maxX: 1600, maxY: 1000 } }),
    getCursor: () => ({ x: 900, y: 400 }),
    wobbleCursor: (p) => wobble.push(p), overlay: {},
  });
  c.onEvent = (name) => events.push(name);
  return { c, wobble, events, step: () => { now += 1 / 60; c.tick(); } };
}

test('carrying the mascot protests, rocks the cursor both ways and stops on release', () => {
  const { c, wobble, events, step } = setup();
  c.dragBegan({ x: 820, y: 100 });
  for (let i = 0; i < 120; i++) { c.dragMoved({ x: 900, y: 400 }); step(); }
  assert.ok(wobble.some((p) => p.dx > 0));
  assert.ok(wobble.some((p) => p.dx < 0));
  assert.ok(wobble.every((p) => Math.abs(p.dx) <= 6 && Math.abs(p.dy) <= 6));
  assert.deepEqual(events, ['pickedUp']);
  assert.ok(Math.abs(c.pose.tilt) > 0.1);
  c.dragEnded({ x: 0, y: 0 });
  const count = wobble.length;
  step();
  assert.equal(wobble.length, count);
});

test('pickup interrupts speech and chooses complaints from the shared pool', () => {
  assert.ok(TRIGGER_PHRASES.pickedUp.includes('zaebal'));
  assert.ok(TRIGGER_PHRASES.pickedUp.includes('eblan'));
  assert.ok(new TriggerGate().allow('pickedUp', 0, true));
});

test('folder pursuit runs toward the moving target, speaks once and stops on drop', () => {
  const { c, events, step } = setup();
  c.folderDragged({ x: 1300, y: 700 });
  const before = { ...c.pos };
  for (let i = 0; i < 30; i++) step();
  assert.ok(c.pos.x > before.x && c.pos.y > before.y);
  c.folderDragged({ x: 100, y: 500 });
  const turning = c.pos.x;
  for (let i = 0; i < 30; i++) step();
  assert.ok(c.pos.x < turning);
  assert.deepEqual(events, ['folderDragged']);
  c.folderDragged(null);
  assert.equal(c.state.type, 'idle');
  assert.deepEqual(TRIGGER_PHRASES.folderDragged, ['dai_ego']);
});

test('folder pursuit never takes over a mascot being carried', () => {
  const { c } = setup();
  c.dragBegan({ x: 820, y: 100 });
  c.folderDragged({ x: 1300, y: 700 });
  assert.equal(c.state.type, 'dragged');
});

const { FolderDragTracker } = await import('../desktop.js');

test('folder tracker ignores clicks and empty space, tracks folder drags until release', async () => {
  const events = [];
  const tracker = new FolderDragTracker(async () => [{ name: 'Work', x: 100, y: 200 }], (p) => events.push(p));
  tracker.update({ x: 100, y: 200 }, true);
  await Promise.resolve();
  tracker.update({ x: 102, y: 200 }, true);
  assert.equal(events.length, 0);
  tracker.update({ x: 140, y: 230 }, true);
  assert.deepEqual(events.at(-1), { x: 140, y: 230 });
  tracker.update({ x: 300, y: 400 }, true);
  tracker.update({ x: 100, y: 200 }, true);
  assert.deepEqual(events.at(-1), { x: 100, y: 200 }, 'keeps following when returned to the starting point');
  tracker.update({ x: 300, y: 400 }, false);
  assert.equal(events.at(-1), null);
  const count = events.length;
  tracker.update({ x: 700, y: 700 }, true);
  await Promise.resolve();
  tracker.update({ x: 900, y: 700 }, true);
  tracker.update({ x: 900, y: 700 }, false);
  assert.equal(events.length, count);
});

test('a folder lookup finishing after release cannot start a stale chase', async () => {
  let resolve;
  const events = [];
  const tracker = new FolderDragTracker(() => new Promise((r) => { resolve = r; }), (p) => events.push(p));
  tracker.update({ x: 100, y: 200 }, true);
  tracker.update({ x: 300, y: 200 }, false);
  resolve([{ name: 'Work', x: 100, y: 200 }]);
  await Promise.resolve();
  tracker.update({ x: 300, y: 200 }, false);
  assert.deepEqual(events, []);
});
