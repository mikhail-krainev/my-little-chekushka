import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PHRASE_CLIPS } from '../src/phrase-clips.mjs';
import { ShuffleBag, frameAt } from '../src/talk.mjs';

test('the bag hands out every item once per round', () => {
  const bag = new ShuffleBag(['a', 'b', 'c', 'd']);
  const round = Array.from({ length: 4 }, () => bag.next());
  assert.deepEqual([...round].sort(), ['a', 'b', 'c', 'd']);
});

test('the bag never repeats an item back to back, also across rounds', () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bag = new ShuffleBag(['a', 'b', 'c'], random);
  let previous = null;
  for (let i = 0; i < 300; i++) {
    const item = bag.next();
    assert.notEqual(item, previous);
    previous = item;
  }
});

test('an empty bag gives null and a single item keeps coming', () => {
  assert.equal(new ShuffleBag([]).next(), null);
  const one = new ShuffleBag(['x']);
  assert.equal(one.next(), 'x');
  assert.equal(one.next(), 'x');
});

test('frames advance with time and end after the last one', () => {
  assert.equal(frameAt(0, 10, 12), 0);
  assert.equal(frameAt(0.5, 10, 12), 6);
  assert.equal(frameAt(10 / 12, 10, 12), -1);
  assert.equal(frameAt(Number.NaN, 10, 12), 0);
});

test('every clip is listed once, with a caption and frames for its whole duration', () => {
  const keys = PHRASE_CLIPS.map((c) => c.key);
  const texts = PHRASE_CLIPS.map((c) => c.text);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(texts).size, texts.length);
  for (const clip of PHRASE_CLIPS) {
    assert.ok(clip.text.length > 0);
    assert.ok(Math.abs(clip.frames / 12 - clip.duration) < 0.1, clip.key);
  }
});
