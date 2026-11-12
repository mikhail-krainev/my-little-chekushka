import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import zlib from 'node:zlib';
import { PHRASE_CLIPS } from '../src/phrase-clips.mjs';
import { FALLBACK, REPLY_RULES, ReplyPicker, isWorthAnswering, normalize, replyTopic } from '../src/replies.mjs';

const require = createRequire(import.meta.url);
const { readZip, zipToTarGz } = require('../voice/model.js');

test('every reply phrase is a real clip', () => {
  const keys = new Set(PHRASE_CLIPS.map((c) => c.key));
  const all = [...REPLY_RULES, FALLBACK.question, FALLBACK.statement].flatMap((r) => r.phrases);
  for (const key of all) assert.ok(keys.has(key), key);
});

test('normalising drops case, ё and punctuation', () => {
  assert.equal(normalize('  Ёлки,   ПАЛКИ!! '), 'елки палки');
  assert.equal(normalize(null), '');
});

test('what the user says gets the answer that fits it best', () => {
  const cases = {
    'привет': 'greeting',
    'привет как дела': 'howAreYou',          // the longer match wins over the greeting
    'как у тебя дела': 'howAreYou',
    'ты тут': 'areYouThere',
    'меня зовут андрей': 'meet',
    'как тебя зовут': 'whoAreYou',
    'кто лучший': 'whoIsBest',
    'ты дебил': 'callsHimStupid',
    'ну ты и жирный': 'callsHimFat',
    'пошел ты нахуй': 'sendsHimAway',
    'замолчи уже': 'shutUp',
    'мне страшно': 'scared',
    'мне грустно и плохо': 'sad',
    'давай дружить': 'friends',
    'да ладно': 'surprise',
    'я проиграл все деньги': 'broke',
    'дай денег на казино': 'betting',
    'что подарить бате': 'gift',
    'хочу пиццу': 'food',
    'пойдём выпьем пива': 'drink',
    'сегодня жарко': 'hot',
    'вызову полицию': 'police',
    'спокойной ночи': 'bye',
    'что мне делать': 'whatToDo',
    'сделай домашку': 'doIt',
    'прыгнешь с парашютом': 'skydive',
  };
  for (const [text, topic] of Object.entries(cases)) assert.equal(replyTopic(text)?.topic, topic, text);
});

test('the exact answers for the key questions', () => {
  assert.deepEqual(replyTopic('ты где').phrases, ['ty_tut']);          // «Привет, ты тут? Я тут…»
  assert.deepEqual(replyTopic('что подарить папе').phrases, ['klyuch']);   // «Что подарить бате? Огромный ключ…»
  assert.ok(replyTopic('ты долбоеб').phrases.includes('dolboeb'));      // «Я что, долбоёб, что ли? Нет…»
});

test('Russian words do not match inside other words', () => {
  assert.notEqual(replyTopic('в этот момент')?.topic, 'police');      // «мент» inside «момент»
  assert.notEqual(replyTopic('купи хлеба')?.topic, 'swear');          // «еба» inside «хлеба»
  assert.notEqual(replyTopic('хорошее настроение')?.topic, 'women');  // «наст» inside «настроение»
});

test('unknown words get a shrug, unknown questions a puzzled look, silence nothing', () => {
  assert.equal(replyTopic('синхрофазотрон'), FALLBACK.statement);
  assert.equal(replyTopic('сколько стоит синхрофазотрон'), FALLBACK.question);
  assert.equal(replyTopic('   '), null);
});

test('noise, filler and unsure guesses get no answer', () => {
  assert.equal(isWorthAnswering('а', 0.95), false);
  assert.equal(isWorthAnswering('ну это вот', 0.95), false);
  assert.equal(isWorthAnswering('привет', 0.3), false);
  assert.equal(isWorthAnswering('да', 0.95), true);
  assert.equal(isWorthAnswering('привет', 0.9), true);
  assert.equal(isWorthAnswering('привет', undefined), true);
});

test('answers take turns and never repeat back to back', () => {
  const picker = new ReplyPicker();
  const reply = { topic: 't', phrases: ['a', 'b', 'c'] };
  assert.deepEqual([1, 2, 3, 4].map(() => picker.next(reply)), ['a', 'b', 'c', 'a']);
  const single = { topic: 's', phrases: ['a'] };
  assert.equal(picker.next(single), 'a');                     // only one choice: it may repeat
  assert.equal(picker.next(reply, (k) => k !== 'b'), 'c');    // unavailable clips are skipped
  assert.equal(picker.next({ topic: 'x', phrases: ['c', 'a'] }), 'a');   // not «c» again right after «c»
  assert.equal(picker.next({ topic: 'y', phrases: [] }), null);
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
