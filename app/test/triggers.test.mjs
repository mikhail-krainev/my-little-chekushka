import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cues, makePerformance } from '../src/animator.mjs';
import { PHRASE_CLIPS } from '../src/phrase-clips.mjs';
import {
  BurstCounter, COOLDOWNS, ChatterClock, ReturnWatch, TRIGGER_PHRASES, TriggerGate, classifySystemEvent,
} from '../src/triggers.mjs';

test('every trigger names an existing phrase, and every phrase has exactly one trigger', () => {
  const keys = new Set(PHRASE_CLIPS.map((c) => c.key));
  const used = Object.values(TRIGGER_PHRASES).flat();
  for (const key of used) assert.ok(keys.has(key), key);
  assert.equal(new Set(used).size, used.length);
  assert.deepEqual([...keys].sort(), [...used].sort());
});

test('system events are told apart: folder, download, screenshot, plain file, deletion', () => {
  assert.equal(classifySystemEvent({ type: 'fileCreated', name: 'Новая папка', folder: 'Desktop', isDirectory: true }), 'folderCreated');
  assert.equal(classifySystemEvent({ type: 'fileCreated', name: 'setup.dmg', folder: 'Downloads' }), 'fileDownloaded');
  assert.equal(classifySystemEvent({ type: 'fileCreated', name: 'Снимок экрана 2026-11-08 в 18.00.png', folder: 'Desktop' }), 'screenshot');
  assert.equal(classifySystemEvent({ type: 'fileCreated', name: 'Screenshot 2026-11-08.png', folder: 'Desktop' }), 'screenshot');
  assert.equal(classifySystemEvent({ type: 'fileCreated', name: 'notes.txt', folder: 'Documents' }), 'fileCreated');
  assert.equal(classifySystemEvent({ type: 'fileDeleted', name: 'notes.txt', folder: 'Documents' }), 'fileDeleted');
  assert.equal(classifySystemEvent({ type: 'appQuit', name: 'Safari' }), 'appQuit');
  assert.equal(classifySystemEvent({ type: 'fileOpened', name: 'x' }), null);
});

test('launched apps are sorted into browsers, messengers, coding tools and the rest', () => {
  const kind = (name) => classifySystemEvent({ type: 'appLaunched', name });
  for (const name of ['Google Chrome', 'Safari', 'Firefox', 'Arc', 'msedge', 'Yandex', 'browser']) assert.equal(kind(name), 'browserLaunched', name);
  for (const name of ['Telegram', 'WhatsApp', 'Discord', 'Slack']) assert.equal(kind(name), 'messengerLaunched', name);
  for (const name of ['Visual Studio Code', 'Code', 'Cursor', 'Terminal', 'iTerm2', 'Xcode', 'WindowsTerminal']) assert.equal(kind(name), 'codeLaunched', name);
  for (const name of ['Spotify', 'Finder', 'Notes', 'Steam']) assert.equal(kind(name), 'appLaunched', name);
});

test('a burst fires once when enough hits land inside the window, then counts afresh', () => {
  const burst = new BurstCounter(3, 10);
  assert.equal(burst.hit(0), false);
  assert.equal(burst.hit(1), false);
  assert.equal(burst.hit(2), true);
  assert.equal(burst.hit(3), false);
  const slow = new BurstCounter(3, 10);
  assert.equal([0, 11, 22].map((t) => slow.hit(t)).some(Boolean), false);
});

test('coming back is noticed only after the cursor stood still long enough', () => {
  const watch = new ReturnWatch(60);
  assert.equal(watch.update({ x: 0, y: 0 }, 0), false);
  assert.equal(watch.update({ x: 50, y: 0 }, 10), false);       // just moving around
  assert.equal(watch.update({ x: 50, y: 0 }, 50), false);       // standing still
  assert.equal(watch.update({ x: 50, y: 0 }, 75), false);
  assert.equal(watch.update({ x: 90, y: 0 }, 80), true);        // still since 10 s: away for 70 s
  assert.equal(watch.update({ x: 120, y: 0 }, 81), false);
});

test('the gate keeps phrases from overlapping and each group apart, but a throw cuts in', () => {
  const gate = new TriggerGate({
    system: { seconds: 8, triggers: new Set(['fileCreated', 'fileDeleted', 'appQuit']) },
    action: { seconds: 25, triggers: new Set(['sit', 'spit']) },
  });
  assert.equal(gate.allow('pickedUp', 0, true), false);
  assert.equal(gate.allow('thrown', 0, true), true);
  assert.equal(gate.allow('fileCreated', 0, false), true);
  assert.equal(gate.allow('fileDeleted', 5, false), false);    // too soon after the last system phrase
  assert.equal(gate.allow('sit', 5, false), true);             // another group has its own clock
  assert.equal(gate.allow('spit', 20, false), false);
  assert.equal(gate.allow('pickedUp', 5, false), true);        // what the user does to him has no cooldown
  assert.equal(gate.allow('appQuit', 9, false), true);
});

test('every floor action has a phrase, and drinking has several to pick from', () => {
  for (const action of ['sit', 'sleep', 'stretch', 'smoke', 'hookah', 'spit', 'drunk', 'vomit']) {
    assert.ok(TRIGGER_PHRASES[action]?.length > 0, action);
    assert.ok(COOLDOWNS.action.triggers.has(action), action);
  }
  assert.ok(TRIGGER_PHRASES.drunk.length >= 3);
  assert.ok(TRIGGER_PHRASES.chatter.length >= 5);
});

test('chatter waits a random gap after the last phrase and holds its turn while he cannot talk', () => {
  const clock = new ChatterClock(100, 200, () => 0.5);         // gap of 150 s
  assert.equal(clock.isDue(0, true), false);
  assert.equal(clock.isDue(149, true), false);
  assert.equal(clock.isDue(151, false), false);                // asleep or busy: not now
  assert.equal(clock.isDue(160, true), true);
  clock.heard(160);
  assert.equal(clock.isDue(200, true), false);
  assert.equal(clock.isDue(311, true), true);
});

test('drinking marks the moment to speak: sick or not, before the bottle is thrown', () => {
  for (const vomits of [true, false]) {
    const list = cues(makePerformance('beer', { side: 1, vomits }));
    assert.deepEqual(list.map((c) => c.type), [vomits ? 'vomit' : 'drunk', 'throw']);
    assert.ok(list[0].at < list[1].at);
  }
});

function simulate(setup) {
  return import('../src/controller.mjs').then(({ MascotController }) => {
    let now = 0;
    const events = [];
    const controller = new MascotController({
      clock: () => now,
      getScreen: () => ({ work: { minX: 0, minY: 0, maxX: 1600, maxY: 1000 } }),
      getCursor: () => ({ x: 0, y: 0 }),
      overlay: { throwBottle() {}, toss() {}, spit() {}, smoke() {}, burn() {} },
    });
    controller.onEvent = (name, info = {}) => events.push({ name, at: now, requested: info.requested === true });
    controller.tick();
    setup(controller);
    let start = null;                      // he may hop down to the floor first
    for (let i = 0; i < 30 * 40; i++) {
      now += 1 / 30; controller.tick();
      const performing = controller.state.type === 'perform';
      if (performing && start === null) start = now;
      if (!performing && start !== null) break;
    }
    return { events, start };
  });
}

const MENU_ACTIONS = {
  sit: ['sit'], sleep: ['sleep'], stretch: ['stretch'], smoke: ['smoke'], hookah: ['hookah'], spit: ['spit'],
  vodka: ['drunk', 'vomit'], beer: ['drunk', 'vomit'], burger: ['burger'], pizza: ['pizza'],
};

test('every menu action speaks exactly once, marked as asked for by the user', async () => {
  for (const [kind, phrases] of Object.entries(MENU_ACTIONS)) {
    const { events, start } = await simulate((c) => c.trigger(kind));
    assert.ok(start !== null, `${kind} never started`);
    const said = events.filter((e) => phrases.includes(e.name));
    assert.equal(said.length, 1, `${kind}: ${JSON.stringify(events)}`);
    assert.equal(said[0].requested, true, kind);
    if (kind === 'smoke' || kind === 'hookah') assert.ok(said[0].at - start > 1, `${kind} speaks after the first drag`);
  }
});

test('an action chosen while he is held starts after he is let go and lands', async () => {
  const { events, start } = await simulate((c) => {
    c.dragBegan({ x: 400, y: 600 });
    c.trigger('sit');
    c.dragEnded({ x: 0, y: 0 });
  });
  assert.ok(start !== null);
  assert.deepEqual(events.filter((e) => e.name === 'sit').map((e) => e.requested), [true]);
});

test('a forced phrase ignores the gate but restarts its group cooldown', () => {
  const gate = new TriggerGate({ action: { seconds: 25, triggers: new Set(['sit', 'sleep']) } });
  assert.equal(gate.allow('sit', 0, false), true);
  gate.force('sleep', 3);                                      // the menu asked for it 3 s later
  assert.equal(gate.allow('sit', 20, false), false);           // cooldown counts from the forced phrase
  assert.equal(gate.allow('sit', 29, false), true);
});
