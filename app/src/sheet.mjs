// Developer / documentation tool: renders pose sheets and broken-glass strips to a canvas (used for the README screenshots).
// `sheet.html?set=poses|drinks|spit|smoke|hookah|food|pranks|phrases|glass` draws one sheet and sets `window.__sheetSize` when it is done.
import * as A from './animator.mjs';
import { Config, rgb } from './geometry.mjs';
import { newFace } from './pose.mjs';
import { beginYUp, drawMascot, emberPoint, loadSprites, mouthPoint } from './renderer.mjs';
import { HOOKAH, SMOKE } from './smoking.mjs';
import * as S from './stunts.mjs';
import { BURGER_SCENE as B, PIZZA_SCENE as P } from './eating.mjs';
import { ShatterWorld } from './shatter.mjs';
import { drawSmokes, drawWorld } from './shatter-draw.mjs';
import { PhrasePlayer, faceFrame } from './talk.mjs';

const BACKGROUND = '#cdd1db';
const DPR = 2;
const CELL = { width: 260, height: 270 };
const SCALE = 1.25;
const GLASS = { width: 900, height: 260 };

const base = newFace();
const perf = (kind, extra = {}) => ({ kind, duration: A.makePerformance(kind, { side: 1, vomits: false }).duration, side: 1, vomits: false, ...extra });

/** Replays the scene's cues up to `t` so smoke clouds and burns show next to the pose (sheet coordinates). */
function worldAt(p, t) {
  const world = new ShatterWorld({ floor: -1e4, bounds: { minX: -1e4, maxX: 1e4 }, seed: 3 });
  const cues = A.cues(p), dt = 1 / 60;
  const at = (pt) => ({ x: pt.x * SCALE, y: pt.y * SCALE });
  let next = 0;
  for (let clock = 0; clock < t; clock += dt) {
    while (next < cues.length && cues[next].at <= clock) {
      const cue = cues[next++], pose = A.performance(p, cue.at, base);
      if (cue.type === 'exhale') world.puffSmoke(at(mouthPoint(pose)), { size: cue.size, life: cue.life, drift: p.side * cue.drift });
      if (cue.type === 'burn') world.burn(at(emberPoint(pose)));
    }
    world.step(dt);
  }
  return world;
}

const scene = (p, label, t) => [label, A.performance(p, t, base), worldAt(p, t)];

/** One frame of every meme clip, a little before the middle of the phrase. */
async function phraseScenes() {
  const clips = await new PhrasePlayer(() => 0, '../assets/phrases').load();
  return clips.map((clip) => {
    const index = Math.floor(clip.frames * 0.4);
    return [clip.key, A.idle(0, base), null, faceFrame(clip, index)];
  });
}

function poses(set) {
  switch (set) {
    case 'smoke': {
      const p = perf('smoke'), T = SMOKE;
      return [
        scene(p, 'cigarette: take it out', 0.8),
        scene(p, 'cigarette: light it', 1.7),
        scene(p, 'cigarette: drag', T.firstPuff + 0.7),
        scene(p, 'cigarette: exhale', T.firstPuff + T.exhaleAt + 0.35),
        scene(p, 'cigarette: smoke curls', T.firstPuff + T.cycle + 2.3),
        scene(p, 'cigarette: arm out', T.pressStart),
        scene(p, 'cigarette: press it out', T.burnAt + 0.25),
        scene(p, 'cigarette: burn mark', T.pressEnd + 0.4),
      ];
    }
    case 'hookah': {
      const p = perf('hookah'), T = HOOKAH;
      return [
        scene(p, 'hookah: put it down', 0.6),
        scene(p, 'hookah: sit', T.firstPuff - 0.1),
        scene(p, 'hookah: pull', T.firstPuff + 1.4),
        scene(p, 'hookah: exhale', T.firstPuff + T.exhaleAt + 0.4),
        scene(p, 'hookah: cloud hangs', T.firstPuff + T.exhaleAt + 2.5),
        scene(p, 'hookah: two clouds', T.firstPuff + T.cycle + T.exhaleAt + 1.2),
        scene(p, 'hookah: last pull', T.firstPuff + 3 * T.cycle + 1.2),
        scene(p, 'hookah: get up', T.standEnd + 0.1),
      ];
    }
    case 'food': {
      const b = perf('burger'), z = perf('pizza');
      return [
        scene(b, 'burger: take it out', B.show - 0.2),
        scene(b, 'burger: bite', B.bite - 0.02),
        scene(b, 'burger: delighted', B.brag + 0.25),
        scene(b, 'burger: show it off', B.joyEnd + 1.0),
        scene(z, 'pizza: open the box', P.open - 0.1),
        scene(z, 'pizza: plastic bite', P.raise + 0.5),
        scene(z, 'pizza: furious', P.rage + 0.5),
        scene(z, 'pizza: throw the box', P.windupEnd),
        ['fight: jab', S.fight(S.FIGHT_HITS[0], 1, base)],
        ['fight: cross', S.fight(S.FIGHT_HITS[1], 1, base)],
      ];
    }
    case 'pranks': return [
      ['peek: lean in', S.peek(S.PEEK_STARTLE - 0.15, 1, base)],
      ['peek: startled', S.peek(S.PEEK_STARTLE + 0.25, 1, base)],
      ['push folder', S.push(0.8, 1, base)],
      ['search: open', S.typing(0.3, 1, base)],
      ['search: typing', S.typing(1.5, 1, base)],
      ['angry', S.angry(0.9, base)],
      ['angry', S.angry(1.3, base)],
      ['cursor: wind up', A.hanging(0, S.windupSwing(1, 1), base)],
    ];
    case 'spit': {
      const p = perf('spit');
      return [0.3, 0.7, 1.1, 1.7, 2.0, A.SPIT_RELEASE + 0.1, 2.5, 2.9].map((t) => [`spit ${t}`, A.performance(p, t, base)]);
    }
    case 'drinks': {
      const vodka = perf('vodka');
      const tl = A.drinkTimeline('beer', true);
      const sick = perf('beer', { duration: tl.end, vomits: true });
      return [
        ['vodka: take it out', A.performance(vodka, 1.0, base)],
        ['vodka: open', A.performance(vodka, 1.6, base)],
        ['vodka: drink', A.performance(vodka, 3.2, base)],
        ['vodka: brrr', A.performance(vodka, 5.8, base)],
        ['beer: heave', A.performance(sick, tl.swayEnd + 0.9, base)],
        ['beer: sick', A.performance(sick, tl.swayEnd + 1.9, base)],
        ['beer: puddle', A.performance(sick, tl.swayEnd + 3.2, base)],
        ['beer: throw', A.performance(sick, tl.release, base)],
      ];
    }
    default: {
      const sit = { kind: 'sit', duration: 6, side: 1 }, sleep = { kind: 'sleep', duration: 12, side: 1 };
      return [
        ['idle', A.idle(0, base)],
        ['walk', A.walk(0.6, 1, false, base)],
        ['run', A.walk(1.2, -1, true, base)],
        ['crouch', A.crouch(1, 1, base)],
        ['jump up', A.airborne(0.25, 1, base)],
        ['jump down', A.airborne(0.75, 1, base)],
        ['sit', A.performance(sit, 3, base)],
        ['scratch', A.performance(sit, 2.0, base)],
        ['sleep fall', A.performance(sleep, 1.2, base)],
        ['sleep', A.performance(sleep, 5, base)],
        ['hang on cursor', A.hanging(0, 0.3, base)],
        ['thrown', A.flung(0.2, 600, base)],
      ];
    }
  }
}

function fillBackground(ctx, w, h) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, w * DPR, h * DPR);
}

function setCanvas(canvas, w, h) {
  canvas.width = w * DPR; canvas.height = h * DPR;
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  return canvas.getContext('2d');
}

function drawPoseSheet(canvas, entries, columns, left = 70) {
  const rows = Math.ceil(entries.length / columns);
  const w = CELL.width * columns, h = CELL.height * rows;
  const ctx = setCanvas(canvas, w, h);
  fillBackground(ctx, w, h);
  entries.forEach(([label, pose, world, face], i) => {
    const col = i % columns, row = Math.floor(i / columns);
    const ox = col * CELL.width, oyUp = h - (row + 1) * CELL.height;
    ctx.save();
    beginYUp(ctx, h, DPR);
    ctx.translate(ox + left, oyUp + 22);
    ctx.scale(SCALE, SCALE);
    drawMascot(ctx, pose, face);
    ctx.restore();
    if (world) {
      ctx.save();
      beginYUp(ctx, h, DPR);
      ctx.translate(ox + left, oyUp + 22);
      drawWorld(ctx, world);
      drawSmokes(ctx, world);
      ctx.restore();
    }
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.font = '12px -apple-system, "Segoe UI", sans-serif'; ctx.fillStyle = '#444'; ctx.textBaseline = 'top';
    ctx.fillText(label, ox + 8, row * CELL.height + 6);
    ctx.restore();
  });
  return { width: w, height: h };
}

/** A bottle in flight, then glass shortly after the impact, for both drinks. */
function drawGlassSheet(canvas) {
  const kinds = ['vodka', 'beer'], offsets = [-0.12, 0.25, 0.7];
  const h = GLASS.height * kinds.length * offsets.length;
  const ctx = setCanvas(canvas, GLASS.width, h);
  fillBackground(ctx, GLASS.width, h);
  let strip = 0;
  for (const kind of kinds) {
    for (const after of offsets) {
      const world = new ShatterWorld({ floor: 20, bounds: { minX: 0, maxX: GLASS.width }, seed: 11 });
      world.throwBottle(kind, { x: 150, y: 130 }, { x: 520, y: 400 });
      const dt = 1 / 120;
      let clock = 0, impact = null;
      const target = () => (impact === null ? Infinity : impact + after);
      while (clock < 3 && clock < target()) {
        world.step(dt); clock += dt;
        if (impact === null && world.bottles.length === 0) { impact = clock; if (after < 0) break; }
      }
      if (after < 0) {                                       // the frame just before the impact
        const early = new ShatterWorld({ floor: 20, bounds: { minX: 0, maxX: GLASS.width }, seed: 11 });
        early.throwBottle(kind, { x: 150, y: 130 }, { x: 520, y: 400 });
        for (let i = 0; i < Math.floor((impact + after) / dt); i++) early.step(dt);
        draw(early);
      } else {
        draw(world);
      }
      function draw(w) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, strip * GLASS.height * DPR, GLASS.width * DPR, GLASS.height * DPR); ctx.clip();
        ctx.setTransform(DPR, 0, 0, -DPR, 0, (strip + 1) * GLASS.height * DPR);
        ctx.imageSmoothingEnabled = false;
        drawWorld(ctx, w);
        ctx.restore();
      }
      strip++;
    }
  }
  return { width: GLASS.width, height: h };
}

async function main() {
  await loadSprites('../assets/sprites');
  const set = new URLSearchParams(location.search).get('set') || 'poses';
  const canvas = document.getElementById('sheet');
  if (set === 'glass') { window.__sheetSize = drawGlassSheet(canvas); return; }
  const entries = set === 'phrases' ? await phraseScenes() : poses(set);
  window.__sheetSize = drawPoseSheet(canvas, entries, 4, set === 'smoke' ? 45 : 70);
}

main().catch((err) => { window.__sheetError = String(err?.stack ?? err); });
void Config; void rgb;
