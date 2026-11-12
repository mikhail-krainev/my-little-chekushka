import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import zlib from 'node:zlib';
import { PHRASE_CLIPS } from '../src/phrase-clips.mjs';
import { FALLBACK_PHRASES, REPLY_TOPICS, normalize, replyTopic } from '../src/replies.mjs';

const require = createRequire(import.meta.url);
const { readZip, zipToTarGz } = require('../voice/model.js');

test('every reply phrase is a real clip', () => {
  const keys = new Set(PHRASE_CLIPS.map((c) => c.key));
  for (const key of [...REPLY_TOPICS.flatMap((t) => t.phrases), ...FALLBACK_PHRASES]) assert.ok(keys.has(key), key);
});

test('normalising drops case, ё and punctuation', () => {
  assert.equal(normalize('  Ёлки,   ПАЛКИ!! '), 'елки палки');
  assert.equal(normalize(null), '');
});

test('the words pick a fitting topic', () => {
  const cases = {
    'привет как дела': 'greeting',
    'как у тебя дела': 'howAreYou',
    'ты кто такой вообще': 'whoAreYou',
    'дай денег на казино': 'money',
    'ты молодец красавчик': 'praise',
    'замолчи уже': 'quiet',
    'ты дебил': 'insult',
    'мне грустно и плохо': 'sad',
    'хочу пиццу': 'food',
    'пойдём выпьем пива': 'drink',
    'спокойной ночи': 'sleep',
    'сегодня жарко': 'weather',
    'вызову полицию': 'police',
    'давай танцевать': 'dance',
    'тёлка у тебя есть': 'women',
    'что подарить папе': 'family',
  };
  for (const [text, topic] of Object.entries(cases)) assert.equal(replyTopic(text)?.topic, topic, text);
});

test('Russian words do not match inside other words', () => {
  assert.notEqual(replyTopic('в этот момент')?.topic, 'police');      // «мент» inside «момент»
  assert.notEqual(replyTopic('купи хлеба')?.topic, 'swear');          // «еба» inside «хлеба»
  assert.notEqual(replyTopic('хорошее настроение')?.topic, 'women');  // «наст» inside «настроение»
});

test('unknown words get the fallback and silence gets nothing', () => {
  assert.equal(replyTopic('синхрофазотрон').topic, 'unknown');
  assert.deepEqual(replyTopic('синхрофазотрон').phrases, FALLBACK_PHRASES);
  assert.equal(replyTopic('   '), null);
});

test('a zip is repacked as a tar.gz with the same files', { skip: !hasZipTools() }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chekushka-zip-'));
  try {
    fs.mkdirSync(path.join(dir, 'src', 'model', 'conf'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'model', 'conf', 'a.conf'), '--sample-frequency=16000\n');
    fs.writeFileSync(path.join(dir, 'src', 'model', 'big.bin'), Buffer.alloc(70000, 7));
    execFileSync('zip', ['-qr', path.join(dir, 'm.zip'), 'model'], { cwd: path.join(dir, 'src') });
    const zip = fs.readFileSync(path.join(dir, 'm.zip'));
    assert.deepEqual(readZip(zip).filter((e) => !e.isDirectory).map((e) => e.name).sort(), ['model/big.bin', 'model/conf/a.conf']);

    fs.writeFileSync(path.join(dir, 'm.tar.gz'), await zipToTarGz(zip));
    fs.mkdirSync(path.join(dir, 'out'));
    execFileSync('tar', ['-xzf', path.join(dir, 'm.tar.gz'), '-C', path.join(dir, 'out')]);
    assert.equal(fs.readFileSync(path.join(dir, 'out', 'model', 'conf', 'a.conf'), 'utf8'), '--sample-frequency=16000\n');
    assert.deepEqual(fs.readFileSync(path.join(dir, 'out', 'model', 'big.bin')), Buffer.alloc(70000, 7));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('not a zip is refused', () => {
  assert.throws(() => readZip(zlib.gzipSync(Buffer.from('hello'))), /not a zip/);
});

function hasZipTools() {
  try { execFileSync('zip', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; }
}
