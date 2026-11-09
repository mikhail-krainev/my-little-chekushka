import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { newFace } from '../src/pose.mjs';
import { SearchBar } from '../src/searchbar.mjs';
import {
  ANGRY_DURATION, PEEK_DURATION, PEEK_STARTLE, SEARCH_TEXT, SEARCH_TYPE_START, SEARCH_ZAP, angry, peek, push, typedText, typing,
} from '../src/stunts.mjs';

const require = createRequire(import.meta.url);
const { Settings } = require('../settings.js');
const { DesktopFolders } = require('../desktop.js');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chekushka-test-'));
const finitePose = (p) => [p.tilt, p.squash, p.shift.x, p.shift.y, p.hands.left.x, p.hands.left.y, p.hands.right.x, p.hands.right.y]
  .every(Number.isFinite);

test('the search text goes in one letter at a time and is complete before the zap', () => {
  assert.equal(typedText(0), '');
  assert.equal(typedText(SEARCH_TYPE_START), 'к');
  assert.equal(typedText(SEARCH_ZAP - 0.01), SEARCH_TEXT);
  assert.equal(SEARCH_TEXT, 'крутить собак онлайн');
});

test('prank poses stay finite over the whole scene', () => {
  for (let t = 0; t <= Math.max(PEEK_DURATION, ANGRY_DURATION, SEARCH_ZAP); t += 0.05) {
    for (const side of [1, -1]) {
      assert.ok(finitePose(peek(t, side, newFace())), `peek ${t}`);
      assert.ok(finitePose(push(t * 7, side, newFace())), `push ${t}`);
      assert.ok(finitePose(typing(t, side, newFace())), `typing ${t}`);
    }
    assert.ok(finitePose(angry(t, newFace())), `angry ${t}`);
  }
});

test('peeking leans toward the window, then the startle throws both hands up', () => {
  const lean = peek(PEEK_STARTLE - 0.1, 1, newFace());
  assert.ok(lean.tilt < -0.2, 'leans right (clockwise) toward a window on the right');
  const startled = peek(PEEK_STARTLE + 0.3, 1, newFace());
  for (const side of ['left', 'right']) assert.ok(startled.hands[side].y > 120, `${side} hand up`);
});

test('pushing holds the hands out on the side he walks to', () => {
  const right = push(0, 1, newFace()), left = push(0, -1, newFace());
  assert.ok(right.hands.right.x > 110);
  assert.ok(left.hands.left.x < 10);
});

test('the search bar opens empty, shows text, and is gone after the zap or when abandoned', () => {
  const bar = new SearchBar();
  bar.open({ x: 0, y: 0, w: 400, h: 40 }, 10);
  assert.ok(bar.isVisible(10.1));
  bar.setText('кру', 10.2);
  assert.equal(bar.text, 'кру');
  bar.zap(10.3);
  assert.ok(bar.isVisible(10.4));
  assert.equal(bar.isVisible(12), false);

  bar.open({ x: 0, y: 0, w: 400, h: 40 }, 20);
  assert.equal(bar.isVisible(21), false, 'nobody typed for a second');
});

test('settings default to on, persist, and refuse unknown names', () => {
  const dir = tempDir();
  const first = new Settings(dir);
  assert.deepEqual(first.all(), { peekFolders: true, moveFolders: true, throwCursor: true, searchPrank: true });
  first.set('throwCursor', false);
  assert.equal(new Settings(dir).get('throwCursor'), false);
  assert.throws(() => first.set('formatDisk', true));
  fs.writeFileSync(path.join(dir, 'settings.json'), '{"searchPrank": "yes", "junk": 1}');
  assert.equal(new Settings(dir).get('searchPrank'), true, 'bad values fall back to the default');
});

function fakeDesktop(icons) {
  const moves = [];
  return {
    moves,
    listDesktopFolders: async () => icons.map((i) => ({ ...i })),
    async moveDesktopFolder(name, x, y) {
      moves.push({ name, x, y });
      const icon = icons.find((i) => i.name === name);
      if (!icon) throw new Error(`no desktop icon named ${name}`);
      icon.x = x; icon.y = y;
      await new Promise((r) => setTimeout(r, 5));
    },
  };
}

test('moved folders remember where they stood and go back on reset', async () => {
  const dir = tempDir();
  const backend = fakeDesktop([{ name: 'Работа', x: 100, y: 200 }, { name: 'Фото', x: 300, y: 200 }]);
  const folders = new DesktopFolders(backend, dir);
  assert.equal(folders.hasMoved, false);
  await folders.move('Работа', 150, 200);
  await folders.move('Работа', 190, 210);
  assert.ok(folders.hasMoved);
  assert.deepEqual(new DesktopFolders(backend, dir).origins, { Работа: { x: 100, y: 200 } }, 'origin kept on disk');

  backend.moves.length = 0;
  assert.equal(await folders.reset(), 1);
  assert.deepEqual(backend.moves, [{ name: 'Работа', x: 100, y: 200 }]);
  assert.equal(folders.hasMoved, false);
});

test('moves that arrive while one is running collapse into the latest', async () => {
  const backend = fakeDesktop([{ name: 'A', x: 0, y: 0 }]);
  const folders = new DesktopFolders(backend, tempDir());
  const first = folders.move('A', 10, 0);
  await new Promise((r) => setTimeout(r, 1));
  folders.move('A', 20, 0);
  folders.move('A', 30, 0);
  await first;
  assert.deepEqual(backend.moves.map((m) => m.x), [10, 30]);
});
