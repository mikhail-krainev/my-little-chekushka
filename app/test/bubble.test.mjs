import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wrapText } from '../src/bubble.mjs';
import { describeEvent } from '../src/events.mjs';

const measure = (s) => s.length * 8;

test('text wraps on word boundaries', () => {
  assert.deepEqual(wrapText(measure, 'aaa bbb ccc', 56), ['aaa bbb', 'ccc']);
});

test('a single word longer than the line is split by characters', () => {
  assert.deepEqual(wrapText(measure, 'abcdefghij', 40), ['abcde', 'fghij']);
});

test('empty text still gives one line', () => {
  assert.deepEqual(wrapText(measure, '', 100), ['']);
});

test('system events carry an emote and a caption', () => {
  assert.equal(describeEvent('fileCreated', 'a.txt').emote, 'excited');
  assert.match(describeEvent('appQuit', 'Notes').caption, /Notes/);
  assert.throws(() => describeEvent('nope', 'x'));
});
