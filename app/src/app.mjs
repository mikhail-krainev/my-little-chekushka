// Renderer entry: one transparent full-screen layer that holds the mascot, its speech bubble, broken glass, smoke and burns.
// The main process keeps the window click-through; this module asks it to catch the mouse only over the mascot.
import { Bubble } from './bubble.mjs';
import { MascotController } from './controller.mjs';
import { describeEvent } from './events.mjs';
import { Config } from './geometry.mjs';
import { CLICK_PHRASE } from './phrases.mjs';
import { beginYUp, drawMascot, loadSprites } from './renderer.mjs';
import { ShatterWorld } from './shatter.mjs';
import { drawSmokes, drawWorld } from './shatter-draw.mjs';

const MAX_FRAME_STEP = 1 / 30;
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

const newWorld = () => new ShatterWorld({ floor: screen.work.minY, bounds: { minX: screen.work.minX, maxX: screen.work.maxX } });

function showBubble(text, duration) {
  mainCtx.setTransform(1, 0, 0, 1, 0, 0);
  bubble.show(mainCtx, text, () => controller.frame, duration);
}

function onSystemEvent({ type, name }) {
  const event = describeEvent(type, name);
  controller.react(event);                       // the mascot only reacts with a hop, it never comments
}

const inside = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Turns the cursor and the mouse buttons into hover / click / drag / throw. */
function updateMouse() {
  const over = inside(controller.frame, cursor) && !controller.isHanging;
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
  drawMascot(mainCtx, controller.pose);
  mainCtx.restore();

  mainCtx.save();
  mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rect = bubble.draw(mainCtx, { width, height, work: screen.work });
  mainCtx.restore();
  if (rect) dirty.push({ x: rect.x - 6, y: rect.y - 6, w: rect.w + 12, h: rect.h + 12 });
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
  world.step(dt);
  drawMascotLayer();
  drawGlassLayer();
  drawSmokeLayer();
}

async function start() {
  await loadSprites('../assets/sprites');
  const info = await api.getScreen();
  applyScreen(info);
  cursor = info.cursor;
  controller = new MascotController({
    clock,
    getScreen: () => screen,
    getCursor: () => cursor,
    overlay: {
      throwBottle: (kind, origin, velocity) => { glassWasActive = true; world.throwBottle(kind, origin, velocity); },
      spit: (origin, target) => { glassWasActive = true; world.launchSpit(origin, target); },
      smoke: (origin, opts) => { glassWasActive = true; world.puffSmoke(origin, opts); },
      burn: (at) => { glassWasActive = true; world.burn(at); },
    },
  });
  controller.onClick = () => showBubble(CLICK_PHRASE, Config.bubbleDuration);

  api.onCursor((p) => { cursor = p; });   // main already sends y up
  api.onScreen((next) => { applyScreen(next); controller.pos = { ...controller.pos }; });
  api.onSystemEvent(onSystemEvent);
  api.onTrigger((kind) => controller.trigger(kind));
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !inside(controller.frame, cursor)) return;
    mouse.down = true; mouse.dragging = false; mouse.start = { ...cursor };
    mouse.samples = [{ time: clock(), point: { ...cursor } }];
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) releaseMouse(); });
  window.addEventListener('blur', releaseMouse);
  requestAnimationFrame(frame);
}

start().catch((err) => { console.error('Mellstroy failed to start', err); api.reportError(String(err?.stack ?? err)); });
