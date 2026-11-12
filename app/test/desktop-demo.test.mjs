import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { DEMO_PHRASES, DESKTOP_DEMOS } from '../src/desktop-demo.mjs';
import { PHRASE_CLIPS } from '../src/phrase-clips.mjs';
import { makePerformance, PERFORMANCE_KINDS } from '../src/animator.mjs';

test('presentation speech uses only reviewed complete clean phrases, with no overlap or truncation', () => {
  const reviewed = new Map([
    ['ty_tut', 'Привет, ты тут? Я тут. Привет, спишь? Привет, не сплю.'],
    ['bystree', 'Быстрее!'],
    ['tancuem', 'Танцуем все! О да! О да!'],
    ['zhivoy', 'Живой'],
    ['normalno', 'Нормально всё?'],
    ['ne_volnuysya', 'Не волнуйся, маленький, всё будет хорошо.'],
  ]);
  assert.deepEqual([...DEMO_PHRASES].sort(), [...reviewed.keys()].sort());
  for (const demo of DESKTOP_DEMOS) {
    let ended = 0;
    for (const event of demo.speech) {
      assert.ok(DEMO_PHRASES.includes(event.key));
      const clip = PHRASE_CLIPS.find((item) => item.key === event.key);
      assert.equal(clip.text, reviewed.get(event.key));
      assert.ok(event.at >= ended, `${demo.name}: speech overlaps`);
      ended = event.at + clip.duration;
      assert.ok(ended <= demo.duration, `${demo.name}: speech truncated`);
      for (const ext of ['png', 'ogg']) assert.ok(existsSync(new URL(`../assets/phrases/${event.key}.${ext}`, import.meta.url)));
    }
  }
});

test('the full desktop day completes exercise, eating and sleep before walking again', () => {
  const day = DESKTOP_DEMOS.find((demo) => demo.name === 'desktop-day');
  assert.deepEqual(day.actions.map((action) => action.kind), ['walk', 'stretch', 'walk', 'burger', 'sleep', 'walk']);
  const sleep = day.actions.find((action) => action.kind === 'sleep');
  assert.ok(sleep.at + sleep.duration < day.actions.at(-1).at);
  for (const demo of DESKTOP_DEMOS) {
    assert.equal(demo.actions[0].at, 0);
    assert.ok(demo.actions.every((action, i) => action.at < demo.duration && (i === 0 || action.at > demo.actions[i - 1].at)));
    for (let i = 0; i < demo.actions.length; i++) {
      const action = demo.actions[i];
      if (!PERFORMANCE_KINDS.includes(action.kind)) continue;
      const duration = action.duration ?? makePerformance(action.kind, { side: 1, vomits: false }).duration;
      assert.ok(action.at + duration <= (demo.actions[i + 1]?.at ?? demo.duration), `${demo.name}: ${action.kind} cut short`);
    }
  }
});
