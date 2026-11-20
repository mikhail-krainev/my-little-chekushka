import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
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

test('conversational phrasing beats incidental words', () => {
  const cases = {
    'ну что, Чекушка, как оно': 'howAreYou',
    'Меллстрой, как ты там': 'howAreYou',
    'Чекушка, ты меня слышишь': 'areYouThere',
    'ё-моё, ничего себе': 'surprise',
    'блин, мне очень плохо сегодня': 'sad',
    'мне тревожно и страшно ночью': 'scared',
    'ты не дурак': 'unknown',
    'я не согласен': 'no',
    'я не совсем согласен': 'no',
    'мне не очень смешно': 'notFunny',
    'да всё хорошо': 'fine',
    'да очень хорошо': 'fine',
    'ну да': 'yes',
    'Чекушка, ну да-да': 'yes',
    'как настроение': 'howAreYou',
    'привет, блядь': 'greeting',
    'расскажи что-нибудь смешное': 'humor',
    'давай поболтаем': 'chat',
    'привет, давай поговорим': 'chat',
    'давай поговорим про футбол': 'betting',
    'хочу поговорить о деньгах': 'money',
    'спасибо большое, Чекушка': 'thanks',
    'нет, спасибо': 'no',
    'где парашют': 'skydive',
    'хочу есть': 'food',
    'пока работаю': 'work',
    'всем пока': 'bye',
    'пока удачи': 'bye',
    'пошёл в магазин': 'unknown',
    'иди в магазин': 'unknown',
    'это толстая книга': 'unknown',
    'темный лес': 'unknown',
    'Чекушка, откуда берётся снег': 'question',
    'откуда берётся снег?': 'question',
    'выключи фары?': 'question',
    'что-то пошло не так': 'unknown',
    'что то пошло не так': 'unknown',
  };
  for (const [text, topic] of Object.entries(cases)) assert.equal(replyTopic(text)?.topic, topic, text);
});

test('greetings and requests for company have varied replies, distress gets reassurance', () => {
  assert.ok(replyTopic('привет').phrases.includes('ty_tut'));
  assert.ok(replyTopic('давай поболтаем').phrases.length >= 3);
  assert.deepEqual(replyTopic('мне очень плохо').phrases, ['ne_volnuysya', 'vse_budet', 'angel']);
  assert.ok(!replyTopic('как у тебя дела').phrases.includes('kak_chlen'));
});

test('starting a fresh recognizer after playback drops queued results and pre-playback audio', async () => {
  const recognizers = [];
  const heard = [];
  const processor = {};
  let now = 0, hold;
  class Model {
    on(event, callback) { if (event === 'load') queueMicrotask(() => callback({ result: true })); }
    KaldiRecognizer = class {
      listeners = {};
      audio = [];
      constructor() { recognizers.push(this); }
      setWords() {}
      on(event, callback) { this.listeners[event] = callback; }
      acceptWaveform(buffer) { this.audio.push(buffer); }
      remove() { this.removed = true; }
      result(text) { this.listeners.result({ result: { text, result: [{ conf: 0.9 }] } }); }
    };
  }
  const api = {
    config: async () => ({ modelUrl: 'offline-model' }),
    onHold: (callback) => { hold = callback; },
    state() {},
    error: (message) => assert.fail(message),
    heard: (text, confidence) => heard.push({ text, confidence }),
  };
  vm.runInNewContext(fs.readFileSync(new URL('../voice/voice-view.js', import.meta.url), 'utf8'), {
    window: { voiceBridge: api }, Vosk: { Model }, setTimeout, clearTimeout,
    performance: { now: () => now },
    navigator: { mediaDevices: { getUserMedia: async () => ({}) } },
    AudioContext: class {
      sampleRate = 48000;
      createMediaStreamSource() { return { connect() {} }; }
      createScriptProcessor() { return Object.assign(processor, { connect() {} }); }
      resume() { return Promise.resolve(); }
    },
  });
  await new Promise(setImmediate);
  const feed = (inputBuffer) => processor.onaudioprocess({ inputBuffer });
  feed('до ответа');
  const first = recognizers[0];
  first.result('привет');
  hold(100);
  feed('голос маскота');
  now = 101;
  first.result('запоздалый результат');
  feed('первая реплика после ответа');
  const second = recognizers[1];
  assert.equal(first.removed, true);
  assert.deepEqual(first.audio, ['до ответа']);
  assert.deepEqual(second.audio, ['первая реплика после ответа']);
  second.result('ты тут');
  assert.deepEqual(heard, [{ text: 'привет', confidence: 0.9 }, { text: 'ты тут', confidence: 0.9 }]);
});

test('Russian words do not match inside other words', () => {
  assert.equal(replyTopic('в этот момент'), FALLBACK.statement);     // «мент» inside «момент»
  assert.equal(replyTopic('купи хлеба'), FALLBACK.statement);         // «еба» inside «хлеба»
  assert.equal(replyTopic('хорошее настроение'), FALLBACK.statement); // «наст» inside «настроение»
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
  assert.equal(isWorthAnswering('ну да', 0.95), true);
  assert.equal(isWorthAnswering('ну нет', 0.95), true);
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
