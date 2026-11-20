import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cues, makePerformance, performance } from '../src/animator.mjs';
import { MascotController } from '../src/controller.mjs';
import { Config, MascotRig } from '../src/geometry.mjs';
import { PHRASE_CLIPS } from '../src/phrase-clips.mjs';
import { newFace } from '../src/pose.mjs';
import { FLOAT, SLOT_REACH, slotPlacement } from '../src/play.mjs';
import { soundCues } from '../src/sounds.mjs';
import { TRIGGER_PHRASES } from '../src/triggers.mjs';

test('one or two wins lead into two losses, then the kick launches the cabinet and the landing breaks it apart', () => {
  for (const wins of [1, 2]) {
    const perf = makePerformance('slots', { wins, side: 1 });
    const beats = cues(perf);
    assert.deepEqual(beats.map(({ trigger }) => trigger), [
      'slotsWin', ...(wins === 2 ? ['slotsWinAgain'] : []), 'slotsLoss', 'slotsBroke', 'slotsSmash',
    ]);
    for (const [i, beat] of beats.entries()) {
      const duration = PHRASE_CLIPS.find(({ key }) => key === TRIGGER_PHRASES[beat.trigger][0]).duration;
      assert.ok((beats[i + 1]?.at ?? perf.duration) - beat.at >= duration);
    }
    assert.deepEqual(perf.slots.rounds.map(({ symbols }) => new Set(symbols).size === 1),
      [...Array(wins).fill(true), false, false]);
    const { charge, takeoff, hit, land } = perf.slots;
    assert.ok(beats.at(-1).at >= charge && beats.at(-1).at < hit);
    assert.ok(takeoff < hit && hit < land);
    const cabinet = (t) => performance(perf, t, newFace()).effects.slots;
    const runner = (t) => performance(perf, t, newFace());
    assert.ok(runner(charge).shift.x < -60);
    assert.ok(runner(hit).tilt > 1.4 && runner(hit).feet.left.toeUp && runner(hit).feet.right.toeUp);
    assert.equal(cabinet(hit - 0.01).broken, false);
    assert.equal(cabinet(hit).broken, true);
    assert.equal(cabinet(hit).angle, 0);
    const middle = cabinet((hit + land) / 2);
    assert.ok(middle.airGap > 20 && middle.travel > 70);
    assert.ok(middle.angle < cabinet(land - 0.1).angle);
    assert.equal(cabinet(land - 0.01).shattered, false);
    assert.equal(cabinet(land).shattered, true);
    assert.equal(cabinet(land).airGap, 0);
    assert.ok(soundCues(perf).some(({ at, name }) => at === land && name === 'cabinetCrash'));
  }
});

test('the ring is raised overhead, then catches twice and creaks on the way down to the waist', () => {
  const perf = makePerformance('float');
  const creaks = soundCues(perf).filter(({ name }) => name === 'vinylCreak');
  assert.equal(creaks.length, 2);
  const overhead = performance(perf, 0.73, newFace());
  assert.ok(overhead.effects.float.y > MascotRig.headTop.y);
  for (const foot of Object.values(overhead.feet)) assert.equal(foot.offset.y, 0);
  let height = overhead.effects.float.y;
  for (const { at } of creaks) {
    const ring = performance(perf, at + 0.13, newFace()).effects.float;
    assert.ok(ring.sx > 1.08 && ring.sy < 0.92);
    assert.ok(at < FLOAT.on);
    assert.ok(ring.y < height);
    height = ring.y;
  }
  const waist = performance(perf, FLOAT.on, newFace()).effects.float.y;
  assert.ok(waist > 51 && waist < height);
});

test('a narrow work area shortens the cabinet flight and keeps room for the run-up', () => {
  const work = { minX: 85, maxX: 560 };
  const wide = slotPlacement({ x: 320 }, { minX: 0, maxX: 1440 }, 1);
  const half = Config.mascotSize.width / 2;
  for (const side of [-1, 1]) {
    const { x, flight, runup, side: facing } = slotPlacement({ x: 180 }, work, side);
    const centre = x + half;
    const edge = centre + facing * (SLOT_REACH - wide.flight + flight) * Config.spriteScale;
    const start = centre - facing * (runup + MascotRig.centerX) * Config.spriteScale;
    assert.ok(flight < wide.flight);
    assert.ok(Math.min(edge, start) >= work.minX - 0.01);
    assert.ok(Math.max(edge, start) <= work.maxX + 0.01);
  }
});

test('the float bounces on both axes, plays its cue once and returns to the floor', () => {
  const work = { minX: 0, minY: 0, maxX: 550, maxY: 420 };
  const played = [], spoken = [];
  let now = 0;
  const mascot = new MascotController({
    clock: () => now,
    getScreen: () => ({ work }),
    getCursor: () => ({ x: -100, y: -100 }),
    sfx: (name) => played.push(name),
    overlay: {},
  });
  mascot.onEvent = (name) => spoken.push(name);
  mascot.pos.y = work.minY - Config.spritePad;
  mascot.trigger('float');
  const walls = new Set();
  for (let i = 0; mascot.state.type === 'perform' && i < 1200; i++) {
    now += 1 / 60;
    mascot.tick();
    const motion = mascot.state.motion;
    if (motion?.impactAt === now) {
      if (motion.hitX) walls.add(motion.hitX < 0 ? 'left' : 'right');
      if (motion.hitY) walls.add(motion.hitY < 0 ? 'bottom' : 'top');
    }
    assert.ok(mascot.frame.x >= work.minX && mascot.frame.x + mascot.frame.w <= work.maxX);
    assert.ok(mascot.frame.y >= work.minY && mascot.frame.y + mascot.frame.h <= work.maxY);
  }
  assert.deepEqual(walls, new Set(['left', 'right', 'bottom', 'top']));
  assert.ok(played.includes('boing'));
  assert.deepEqual(spoken, ['floatOn']);
  assert.equal(mascot.state.type, 'idle');
  assert.equal(mascot.pos.y, work.minY - Config.spritePad);
});
