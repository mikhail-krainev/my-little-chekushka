// Renderer entry: one transparent full-screen layer that holds the mascot, its speech bubble, broken glass, smoke and burns.
// The main process keeps the window click-through; this module asks it to catch the mouse only over the mascot.
import { Bubble } from './bubble.mjs';
import { MascotController } from './controller.mjs';
import { describeEvent } from './events.mjs';
import { Config } from './geometry.mjs';
import { beginYUp, drawMascot, loadSprites } from './renderer.mjs';
import { SearchBar } from './searchbar.mjs';
import { Sfx } from './sfx.mjs';
import { ShatterWorld } from './shatter.mjs';
import { PhrasePlayer, ShuffleBag } from './talk.mjs';
import { BurstCounter, ChatterClock, ReturnWatch, TRIGGER_PHRASES, TriggerGate, classifySystemEvent } from './triggers.mjs';
import { drawSmokes, drawWorld } from './shatter-draw.mjs';

const MAX_FRAME_STEP = 1 / 30;
/** The caption stays up a little after the clip ends. */
const PHRASE_BUBBLE_TAIL = 0.6;
/** This many deletions within the window count as a clean-out. */
const MASS_DELETE = { count: 5, window: 10 };
/** This many clicks within the window count as pestering. */
const CLICK_SPAM = { count: 4, window: 2.5 };
/** The user counts as away after the cursor stands still this long. */
const AWAY_SECONDS = 180;
/** Idle chatter comes this many seconds after the last phrase, at a random moment in the range. */
const CHATTER_GAP = { min: 240, max: 540 };
/** The greeting waits for the mascot to appear. */
const GREETING_DELAY_MS = 2000;
const DIRTY_MARGIN = 48;

const api = window.mellstroy;
const clock = () => performance.now() / 1000;
const mainCanvas = document.getElementById('mascot-layer');
const glassCanvas = document.getElementById('glass-layer');
const smokeCanvas = document.getElementById('smoke-layer');
const mainCtx = mainCanvas.getContext('2d');
const glassCtx = glassCanvas.getContext('2d');
const smokeCtx = smokeCanvas.getContext('2d');

let screen = null;                 // { width, height, dpr, work: {minX, minY, maxX, maxY} }, y up
let world = null;
let controller = null;
let cursor = { x: 0, y: 0 };       // y up
let ignoring = true;
let glassWasActive = false;
let smokeWasActive = false;
let dirty = [];                    // rects (y down) painted on the mascot layer last frame

const bubble = new Bubble(clock);
const searchBar = new SearchBar();
const sfx = new Sfx();
let settings = {};                  // prank switches from the main process (settings.js)
const phrases = new PhrasePlayer(clock, '../assets/phrases');
let phraseBag = new ShuffleBag([]);
const triggerGate = new TriggerGate();
const chatter = new ChatterClock(CHATTER_GAP.min, CHATTER_GAP.max);
let triggerBags = {};               // trigger → ShuffleBag of its loaded clips
const deletions = new BurstCounter(MASS_DELETE.count, MASS_DELETE.window);
const clicks = new BurstCounter(CLICK_SPAM.count, CLICK_SPAM.window);
const userReturn = new ReturnWatch(AWAY_SECONDS);

const mouse = { down: false, dragging: false, start: { x: 0, y: 0 }, samples: [], inside: false };

function applyScreen(info) {
  const dpr = Math.min(info.dpr || 1, 2);
  const w = info.work;
  screen = {
    width: info.width, height: info.height, dpr,
    work: { minX: w.x, maxX: w.x + w.width, maxY: info.height - w.y, minY: info.height - (w.y + w.height) },
  };
  for (const c of [mainCanvas, glassCanvas, smokeCanvas]) {
    c.width = Math.round(info.width * dpr); c.height = Math.round(info.height * dpr);
    c.style.width = `${info.width}px`; c.style.height = `${info.height}px`;
  }
  world = newWorld();
  dirty = [];
}

function newWorld() {
  const w = new ShatterWorld({ floor: screen.work.minY, bounds: { minX: screen.work.minX, maxX: screen.work.maxX } });
  w.onSound = (name, gain) => sfx.play(name, { gain });
  return w;
}

function showBubble(text, duration) {
  mainCtx.setTransform(1, 0, 0, 1, 0, 0);
  bubble.show(mainCtx, text, () => controller.frame, duration);
}

/** Plays a clip (voice + talking face) with its text in the bubble, cutting off whatever was being said. */
function say(clip) {
  if (!clip) return;
  phrases.play(clip);
  showBubble(clip.text, clip.duration + PHRASE_BUBBLE_TAIL);
  chatter.heard(clock() + clip.duration);
}

/** Click or the tray menu: a random phrase, never the same twice in a row. */
const sayRandom = () => say(phraseBag.next());

/** A phrase that belongs to `trigger`, unless the mascot is talking or its group spoke just now. An action the user
 *  chose from the menu (`requested`) always speaks, cutting off whatever was being said. */
function sayFor(trigger, { requested = false, repeat = false } = {}) {
  const bag = triggerBags[trigger];
  if (!bag) return;
  if (requested) { triggerGate.force(trigger, clock()); say(bag.next()); return; }
  if (triggerGate.allow(trigger, clock(), phrases.isTalking, { repeat })) say(bag.next());
}

function onClick() {
  if (clicks.hit(clock())) say(triggerBags.clickSpam?.next()); else sayRandom();
}

/** Something to fill a long silence, never in the middle of a phrase or in his sleep. */
function chatterIfDue() {
  if (chatter.isDue(clock(), !phrases.isTalking && !controller.isSleeping)) sayFor('chatter');
}

function bagsByTrigger(clips) {
  const byKey = new Map(clips.map((c) => [c.key, c]));
  return Object.fromEntries(Object.entries(TRIGGER_PHRASES).map(([trigger, keys]) => (
    [trigger, new ShuffleBag(keys.map((k) => byKey.get(k)).filter(Boolean))]
  )).filter(([, bag]) => bag.items.length > 0));
}

function onSystemEvent(payload) {
  controller.react(describeEvent(payload.type, payload.name));
  const trigger = classifySystemEvent(payload);
  if (!trigger) return;
  sayFor(trigger === 'fileDeleted' && deletions.hit(clock()) ? 'massDelete' : trigger);
}

const inside = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Turns the cursor and the mouse buttons into hover / click / drag / throw. */
function updateMouse() {
  const over = inside(controller.frame, cursor) && !controller.isHanging && !controller.isChasingFolder;
  if (over !== mouse.inside) { mouse.inside = over; controller.hoverChanged(over); }

  if (mouse.down) {
    if (!mouse.dragging && Math.hypot(cursor.x - mouse.start.x, cursor.y - mouse.start.y) > Config.dragThreshold) {
      mouse.dragging = true;
      controller.dragBegan(cursor);
    }
    if (mouse.dragging) {
      const now = clock();
      mouse.samples.push({ time: now, point: { ...cursor } });
      mouse.samples = mouse.samples.filter((s) => now - s.time <= Config.velocityWindow);
      controller.dragMoved(cursor);
    }
  }

  const wantCapture = mouse.down || over;
  if (wantCapture === ignoring) { ignoring = !wantCapture; api.setIgnoreMouse(ignoring); }
}

function releaseMouse() {
  if (!mouse.down) return;
  const wasDragging = mouse.dragging;
  mouse.down = false; mouse.dragging = false;
  if (!wasDragging) { controller.clicked(); return; }
  let v = { x: 0, y: 0 };
  const first = mouse.samples[0], last = mouse.samples[mouse.samples.length - 1];
  if (first && last && last.time - first.time > 0.01) {
    const dt = last.time - first.time;
    v = { x: (last.point.x - first.point.x) / dt, y: (last.point.y - first.point.y) / dt };
  }
  controller.dragEnded(v);
}

function drawMascotLayer() {
  const { dpr, width, height } = screen;
  mainCtx.setTransform(1, 0, 0, 1, 0, 0);
  for (const r of dirty) mainCtx.clearRect(Math.floor(r.x * dpr) - 2, Math.floor(r.y * dpr) - 2, Math.ceil(r.w * dpr) + 4, Math.ceil(r.h * dpr) + 4);
  dirty = [];

  const box = Config.mascotSize;
  const boxRect = { x: controller.pos.x - DIRTY_MARGIN, y: height - controller.pos.y - box.height - DIRTY_MARGIN, w: box.width + 2 * DIRTY_MARGIN, h: box.height + 2 * DIRTY_MARGIN };
  dirty.push(boxRect);

  mainCtx.save();
  beginYUp(mainCtx, height, dpr);
  mainCtx.translate(controller.pos.x + Config.spritePad, controller.pos.y + Config.spritePad);
  mainCtx.scale(Config.spriteScale, Config.spriteScale);
  drawMascot(mainCtx, controller.pose, phrases.face());
  mainCtx.restore();

  mainCtx.save();
  mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rect = bubble.draw(mainCtx, { width, height, work: screen.work });
  mainCtx.restore();
  if (rect) dirty.push({ x: rect.x - 6, y: rect.y - 6, w: rect.w + 12, h: rect.h + 12 });

  mainCtx.save();
  mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const barRect = searchBar.draw(mainCtx, height, clock());
  mainCtx.restore();
  if (barRect) dirty.push(barRect);
}

function drawGlassLayer() {
  const active = !world.isEmpty;
  if (!active && !glassWasActive) return;
  glassWasActive = active;
  glassCtx.setTransform(1, 0, 0, 1, 0, 0);
  glassCtx.clearRect(0, 0, glassCanvas.width, glassCanvas.height);
  if (!active) return;
  glassCtx.save();
  beginYUp(glassCtx, screen.height, screen.dpr);
  drawWorld(glassCtx, world);
  glassCtx.restore();
}

function drawSmokeLayer() {
  const active = world.smokes.length > 0;
  if (!active && !smokeWasActive) return;
  smokeWasActive = active;
  smokeCtx.setTransform(1, 0, 0, 1, 0, 0);
  smokeCtx.clearRect(0, 0, smokeCanvas.width, smokeCanvas.height);
  if (!active) return;
  smokeCtx.save();
  beginYUp(smokeCtx, screen.height, screen.dpr);
  drawSmokes(smokeCtx, world);
  smokeCtx.restore();
}

let last = clock();
function frame() {
  requestAnimationFrame(frame);
  if (!screen || !controller) return;
  const now = clock();
  const dt = Math.min(now - last, MAX_FRAME_STEP);
  last = now;
  controller.tick();
  updateMouse();
  chatterIfDue();
  world.step(dt);
  drawMascotLayer();
  drawGlassLayer();
  drawSmokeLayer();
}

async function start() {
  await loadSprites('../assets/sprites');
  const clips = await phrases.load();
  phraseBag = new ShuffleBag(clips);
  triggerBags = bagsByTrigger(clips);
  settings = await api.getSettings();
  sfx.enabled = settings.soundEffects !== false;
  const info = await api.getScreen();
  applyScreen(info);
  cursor = info.cursor;
  controller = new MascotController({
    clock,
    getScreen: () => screen,
    getCursor: () => cursor,
    allows: (name) => settings[name] === true,
    listFolders: () => api.listFolders(),
    moveFolder: (name, point) => api.moveFolder(name, point),
    throwCursor: (request) => api.throwCursor(request),
    wobbleCursor: (request) => api.wobbleCursor(request),
    nudgeCursor: (request) => api.nudgeCursor(request),
    sfx: (name, gain) => sfx.play(name, { gain }),
    overlay: {
      search: {
        open: (rect) => searchBar.open(rect, clock()),
        type: (text) => searchBar.setText(text, clock()),
        zap: () => searchBar.zap(clock()),
      },
      throwBottle: (kind, origin, velocity) => { glassWasActive = true; world.throwBottle(kind, origin, velocity); },
      toss: (kind, origin, velocity) => { glassWasActive = true; world.toss(kind, origin, velocity); },
      spit: (origin, target) => { glassWasActive = true; world.launchSpit(origin, target); },
      smoke: (origin, opts) => { glassWasActive = true; world.puffSmoke(origin, opts); },
      burn: (at) => { glassWasActive = true; world.burn(at); },
    },
  });
  controller.onClick = onClick;
  controller.onEvent = sayFor;

  api.onCursor((p) => {                    // main already sends y up
    cursor = p;
    if (userReturn.update(p, clock())) sayFor('userBack');
  });
  api.onScreen((next) => { applyScreen(next); controller.pos = { ...controller.pos }; });
  api.onSystemEvent(onSystemEvent);
  api.onTrigger((kind) => {
    if (kind === 'say') sayRandom();
    else if (kind === 'foldersReset') sayFor('foldersReset', { requested: true });
    else controller.trigger(kind);
  });
  api.onSettings((next) => { settings = next; sfx.enabled = next.soundEffects !== false; });
  api.onFolderDrag((point) => controller.folderDragged(point));
  api.onLeftButton((down) => { if (!down) releaseMouse(); });
  api.onFolderOpened((rect) => controller.peekInto(rect));
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (inside(controller.frame, cursor)) api.showMenu();
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !inside(controller.frame, cursor)) return;
    mouse.down = true; mouse.dragging = false; mouse.start = { ...cursor };
    mouse.samples = [{ time: clock(), point: { ...cursor } }];
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) releaseMouse(); });
  window.addEventListener('blur', releaseMouse);
  requestAnimationFrame(frame);
  setTimeout(() => sayFor('appStart'), GREETING_DELAY_MS);
}

start().catch((err) => { console.error('Mellstroy failed to start', err); api.reportError(String(err?.stack ?? err)); });
