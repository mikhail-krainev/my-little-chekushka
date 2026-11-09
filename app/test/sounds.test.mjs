import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PERFORMANCE_KINDS, makePerformance } from '../src/animator.mjs';
import { SOUND_NAMES, recordRecipe } from '../src/sfx.mjs';
import { soundCues } from '../src/sounds.mjs';

test('every floor scene makes sounds, in order, inside the scene, with known names', () => {
  for (const kind of PERFORMANCE_KINDS) {
    for (const vomits of [false, true]) {
      const perf = makePerformance(kind, { side: 1, vomits });
      const list = soundCues(perf);
      assert.ok(list.length >= 2, `${kind} is silent`);
      list.forEach((s, i) => {
        assert.ok(SOUND_NAMES.includes(s.name), `${kind}: ${s.name}`);
        assert.ok(s.at >= 0 && s.at < perf.duration, `${kind}: ${s.name} at ${s.at}`);
        if (i > 0) assert.ok(s.at >= list[i - 1].at, `${kind} sorted`);
      });
    }
  }
});

test('the scenes sound like what happens in them', () => {
  const names = (kind, opts = {}) => soundCues(makePerformance(kind, { side: 1, ...opts })).map((s) => s.name);
  assert.ok(names('vodka').includes('pop') && names('vodka').includes('gulp'));
  assert.ok(names('beer', { vomits: true }).includes('vomit'));
  assert.equal(names('burger').filter((n) => n === 'crunch').length, 2, 'two bites');
  assert.equal(names('pizza').filter((n) => n === 'clack').length, 3, 'three teeth on plastic');
  assert.ok(names('smoke').includes('flick') && names('smoke').includes('sizzle'));
  assert.ok(names('sleep', { }).includes('snore') || makePerformance('sleep').duration < 5);
});

test('every sound recipe is made of valid noise bursts and tones', () => {
  for (const name of SOUND_NAMES) {
    const calls = recordRecipe(name);
    assert.ok(calls.length > 0, name);
    for (const c of calls) {
      assert.ok(c.dur > 0 && c.gain > 0 && c.gain <= 0.5, `${name}: ${JSON.stringify(c)}`);
      if (c.kind === 'tone') assert.ok(c.f > 0 && (c.f2 ?? c.f) > 0, name);
      else assert.ok(c.f > 0 && (c.f2 ?? c.f) > 0 && c.dur < 2, name);
    }
  }
});

test('the controller plays a scene\'s sounds as it goes, each once', async () => {
  const { MascotController } = await import('../src/controller.mjs');
  let now = 0;
  const played = [];
  const c = new MascotController({
    clock: () => now,
    getScreen: () => ({ work: { minX: 0, minY: 0, maxX: 1600, maxY: 1000 } }),
    getCursor: () => ({ x: 0, y: 0 }),
    sfx: (name) => played.push(name),
    overlay: { throwBottle() {}, toss() {}, spit() {}, smoke() {}, burn() {} },
  });
  c.tick();
  c.trigger('burger');
  for (let i = 0; i < 30 * 12; i++) { now += 1 / 30; c.tick(); }
  assert.equal(played.filter((n) => n === 'crunch').length, 2);
  assert.ok(played.includes('chew') && played.includes('swish'));
});
