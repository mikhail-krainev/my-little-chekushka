import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SPIT_DURATION, STRETCH_DURATION, drinkTimeline, makePerformance, performance, releaseTime } from '../src/animator.mjs';
import { MascotRig } from '../src/geometry.mjs';
import { newFace } from '../src/pose.mjs';

const at = (perf, t) => performance(perf, t, newFace());
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('arm keeps its length whatever the target', () => {
  for (const side of ['left', 'right']) {
    const shoulder = MascotRig.shoulder[side];
    for (const target of [{ x: 60, y: 98 }, { x: 300, y: 300 }, shoulder]) {
      const sol = MascotRig.solveArm(side, target);
      assert.ok(Math.abs(dist(sol.elbow, sol.shoulder) - MascotRig.upperArm) < 0.01);
      assert.ok(Math.abs(dist(sol.hand, sol.elbow) - MascotRig.foreArm) < 0.01);
    }
  }
});

test('throwing and spitting scenes release their item before they end', () => {
  for (const kind of ['vodka', 'beer', 'spit']) {
    for (const vomits of [false, true]) {
      const perf = makePerformance(kind, { side: 1, vomits });
      const release = releaseTime(perf);
      assert.notEqual(release, null);
      assert.ok(release < perf.duration);
    }
  }
  assert.equal(releaseTime(makePerformance('sit', { side: 1 })), null);
});

test('the bottle is in hand only until the throw', () => {
  for (const kind of ['vodka', 'beer']) {
    for (const vomits of [false, true]) {
      const perf = makePerformance(kind, { side: 1, vomits });
      const release = releaseTime(perf);
      assert.equal(at(perf, 0.1).prop, null);
      assert.notEqual(at(perf, release - 0.1).prop, null);
      assert.equal(at(perf, release + 0.1).prop, null);
    }
  }
});

test('vomiting only happens when the drinker is sick', () => {
  for (const kind of ['vodka', 'beer']) {
    const tl = drinkTimeline(kind, true);
    const sick = makePerformance(kind, { side: 1, vomits: true }), fine = makePerformance(kind, { side: 1, vomits: false });
    const mid = tl.swayEnd + 1.8;
    assert.notEqual(at(sick, mid).effects.vomit, null);
    assert.equal(at(fine, mid).effects.vomit, null);
    assert.ok(sick.duration > fine.duration);
  }
  assert.equal(makePerformance('sit', { side: 1, vomits: true }).vomits, false);
});

test('the face only opens its mouth when spitting or being sick, and only sleeps asleep', () => {
  const calm = [{ kind: 'sit', duration: 6, side: 1 }, { kind: 'stretch', duration: STRETCH_DURATION, side: 1 }, makePerformance('vodka', { side: 1, vomits: false })];
  for (const perf of calm) {
    for (let t = 0; t < perf.duration; t += 0.25) {
      const { face } = at(perf, t);
      assert.equal(face.mouthOpen, 0);
      assert.equal(face.eyesClosed, false);
    }
  }
  assert.ok(at(makePerformance('spit', { side: 1 }), 1.7).face.mouthOpen > 0.2);
  const sleep = { kind: 'sleep', duration: 12, side: 1 };
  assert.equal(at(sleep, 6).face.eyesClosed, true);
  assert.equal(at(sleep, 0.2).face.eyesClosed, false);
});

test('every scene produces finite numbers for its whole length', () => {
  const kinds = ['sit', 'sleep', 'stretch', 'vodka', 'beer', 'spit'];
  for (const kind of kinds) {
    for (const vomits of [false, true]) {
      const perf = makePerformance(kind, { side: -1, vomits });
      for (let t = 0; t <= perf.duration; t += 0.05) {
        const p = at(perf, t);
        for (const v of [p.tilt, p.squash, p.shift.x, p.shift.y, p.hands.left.x, p.hands.right.y]) assert.ok(Number.isFinite(v), `${kind} t=${t}`);
      }
    }
  }
  assert.equal(SPIT_DURATION, makePerformance('spit').duration);
});

test('a drinker is sick about half of the time', () => {
  const sick = Array.from({ length: 4000 }, () => makePerformance('vodka').vomits).filter(Boolean).length;
  assert.ok(Math.abs(sick / 4000 - 0.5) < 0.05);
});
