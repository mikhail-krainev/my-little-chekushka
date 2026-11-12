// An isolated desktop set driven by the application's actual controller, renderer, face frames and speech bubbles.
// Timeline direction is confined to this documentation renderer; no real files, windows or cursor are accessed.
import { MascotController } from './controller.mjs';
import { Config } from './geometry.mjs';
import { beginYUp, drawMascot, loadSprites } from './renderer.mjs';
import { Bubble } from './bubble.mjs';
import { PHRASE_CLIPS, CLIP_FPS } from './phrase-clips.mjs';
import { faceFrame } from './talk.mjs';
import { DEMO_PHRASES, DESKTOP_DEMOS } from './desktop-demo.mjs';

const canvas = document.getElementById('desktop');
const ctx = canvas.getContext('2d');
const screen = { width: 1200, height: 640, work: { minX: 20, maxX: 1180, minY: 96, maxY: 600 } };
const clips = new Map();
let now = 0, current, controller, actionIndex, speechIndex, speaking, label;
const bubble = new Bubble(() => now);

function text(value, x, y, size = 16, color = '#eaf3ec', weight = 400) {
  ctx.font = `${weight} ${size}px -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = color; ctx.fillText(value, x, y);
}

function panel(x, y, w, h, color, r = 14) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}

// Paint the static set once so long GIFs compress efficiently.
const backdrop = document.createElement('canvas');
backdrop.width = 1200; backdrop.height = 640;
function paintDesktop() {
  const g = ctx.createLinearGradient(0, 0, 1200, 640);
  g.addColorStop(0, '#143946'); g.addColorStop(0.6, '#417f80'); g.addColorStop(1, '#a7bda2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1200, 640);
  ctx.fillStyle = '#285a64'; ctx.beginPath(); ctx.moveTo(0, 440);
  ctx.bezierCurveTo(380, 140, 600, 650, 1200, 300); ctx.lineTo(1200, 640); ctx.lineTo(0, 640); ctx.fill();
  ctx.fillStyle = '#153d4a'; ctx.beginPath(); ctx.moveTo(0, 530);
  ctx.bezierCurveTo(500, 320, 760, 720, 1200, 440); ctx.lineTo(1200, 640); ctx.lineTo(0, 640); ctx.fill();
  panel(0, 0, 1200, 34, '#14323ddd', 0);
  text('ЧЕКУШКА-МЕЛЛ', 24, 23, 14, '#fff3d0', 700);
  text('Демонстрационный рабочий стол', 898, 23, 13);
  text('МОЙ МИЛЫЙ ПИТОМЕЦ', 62, 108, 34, '#f6e7c6', 750);
  text('Живёт рядом, пока вы занимаетесь своими делами', 64, 142, 17, '#d7e7df');
  panel(82, 194, 458, 238, '#f2eee5');
  panel(82, 194, 458, 36, '#deded4');
  ['#e18b7d', '#e2c580', '#8fb797'].forEach((c, i) => {
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(103 + i * 19, 212, 5, 0, Math.PI * 2); ctx.fill();
  });
  text('Небольшие планы', 256, 217, 13, '#596463', 600);
  text('Сегодня хороший день', 108, 273, 24, '#334d50', 650);
  ['Сделать перерыв', 'Размяться', 'Не забыть перекусить'].forEach((s, i) => {
    panel(108, 296 + i * 36, 15, 15, '#c4d3c4', 4);
    text(s, 138, 309 + i * 36, 16, '#4c6260');
  });
  panel(423, 578, 354, 48, '#dfece02b');
  ['#d8b87d', '#85b4be', '#e5c8a1', '#a8c69e', '#c0b1ce'].forEach((c, i) => {
    panel(459 + i * 60, 587, 30, 30, c, 8);
  });
  backdrop.getContext('2d').drawImage(canvas, 0, 0);
}

function reset(demo) {
  current = demo; now = 0; actionIndex = 0; speechIndex = 0; speaking = null;
  bubble.hide();
  controller = new MascotController({
    getScreen: () => screen, getCursor: () => ({ x: 1150, y: 560 }), clock: () => now,
    allows: () => false, overlay: {},
  });
  controller.pos = { x: 90, y: 40 };
  controller.state = { type: 'idle', until: Infinity };
}

function act(action) {
  label = action.label;
  controller.blendFrom = controller.pose; controller.blendStart = now;
  if (action.kind === 'walk') {
    controller.state = { type: 'walk', to: { x: action.x, y: action.y }, run: action.run, until: Infinity };
  } else if (action.kind === 'jump') {
    controller.state = { type: 'crouch', start: now, jump: { from: { ...controller.pos }, to: { x: action.x, y: action.y }, duration: 0.8, chaseCursor: false } };
  } else {
    controller.trigger(action.kind);
    if (action.duration && controller.state.type === 'perform') controller.state.perf.duration = action.duration;
  }
}

function step() {
  while (actionIndex < current.actions.length && current.actions[actionIndex].at <= now) act(current.actions[actionIndex++]);
  // The presentation chooses the next activity; random unscripted actions and their adult phrases stay disabled.
  if (controller.state.type === 'idle') controller.state.until = Infinity;
  controller.tick();
  while (speechIndex < current.speech.length && current.speech[speechIndex].at <= now) {
    const event = current.speech[speechIndex++], clip = clips.get(event.key);
    speaking = { clip, start: event.at };
    bubble.show(ctx, clip.text, () => controller.frame, clip.duration + 0.6);
  }
}

window.drawShowcase = (t, set) => {
  const demo = DESKTOP_DEMOS.find((item) => item.name === set);
  if (!demo) throw new Error(`Unknown desktop demo: ${set}`);
  if (current !== demo || t < now) reset(demo);
  while (now + 1 / 60 <= t + 1e-8) { now += 1 / 60; step(); }
  if (actionIndex === 0) step();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(backdrop, 0, 0);
  panel(728, 57, 420, 70, '#15333dd9');
  text(current.title, 749, 85, 18, '#f6e7c6', 700);
  text(label, 749, 109, 14, '#d7e7df');
  let face = null;
  if (speaking) {
    const index = Math.floor((now - speaking.start) * CLIP_FPS);
    if (index < speaking.clip.frames) face = faceFrame(speaking.clip, index);
  }
  ctx.save(); beginYUp(ctx, 640, 1);
  ctx.translate(controller.pos.x + Config.spritePad, controller.pos.y + Config.spritePad);
  ctx.scale(Config.spriteScale, Config.spriteScale);
  drawMascot(ctx, controller.pose, face); ctx.restore();
  bubble.draw(ctx, screen);
  panel(28, 596, 320, 26, '#14323dcc', 8);
  text('Демо · Только фразы без мата', 42, 614, 13, '#f6e7c6');
  panel(900, 601, 244, 5, '#e4eee644', 2);
  panel(900, 601, Math.max(3, 244 * t / demo.duration), 5, '#e6cc96', 2);
  return canvas.toDataURL('image/png').split(',')[1];
};

Promise.all([
  loadSprites('../assets/sprites'),
  ...DEMO_PHRASES.map(async (key) => {
    const clip = PHRASE_CLIPS.find((item) => item.key === key);
    const sheet = new Image(); sheet.src = `../assets/phrases/${key}.png`; await sheet.decode();
    clips.set(key, { ...clip, sheet });
  }),
]).then(() => {
  paintDesktop(); window.__showcaseReady = true;
}).catch((error) => { window.__showcaseError = String(error.stack ?? error); });
