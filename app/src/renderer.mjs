// Composes the mascot from pixel-art parts cut from the reference picture. Sprite units, origin bottom-left, y up.
// Every draw function expects a y-up context (see beginYUp).
import { CELL, MascotRig, Palette, RefMap, Side, rgb, withAlpha } from './geometry.mjs';
import * as FX from './pixelfx.mjs';
import * as Props from './props.mjs';
import { drawVomit } from './vomit.mjs';

/** Switches a canvas context to y-up device-independent units (origin bottom-left of a `height`-tall canvas). */
export function beginYUp(ctx, height, dpr) {
  ctx.setTransform(dpr, 0, 0, -dpr, 0, height * dpr);
  ctx.imageSmoothingEnabled = false;
}

// MARK: Sprites

const PART_DEFS = {
  body: { file: 'body', rect: [117, 135, 243, 390], pivot: [241, 581] },
  armL_up: { file: 'armL_up', rect: [120, 353, 51, 93], pivot: [163, 380] },
  armR_up: { file: 'armR_up', rect: [312, 353, 51, 93], pivot: [319, 380] },
  armL_low: { file: 'armL_low', rect: [120, 440, 51, 72], pivot: [143, 442] },
  armR_low: { file: 'armR_low', rect: [312, 440, 51, 72], pivot: [339, 442] },
  legL: { file: 'legL', rect: [162, 513, 69, 72], pivot: [196, 520] },
  legR: { file: 'legR', rect: [255, 513, 75, 72], pivot: [293, 520] },
};

let sprites = null;

/** Loads the sprite pieces once. `baseUrl` is the folder that holds the PNG files. */
export async function loadSprites(baseUrl) {
  if (sprites) return sprites;
  const entries = await Promise.all(Object.entries(PART_DEFS).map(async ([name, def]) => {
    const img = new Image();
    img.src = `${baseUrl}/${def.file}.png`;
    await img.decode();
    return [name, { image: img, rect: def.rect, pivot: def.pivot }];
  }));
  sprites = Object.fromEntries(entries);
  return sprites;
}

/** Draws the piece with its pivot at `anchor` (sprite units), rotated counter-clockwise by `angle`. */
function drawPart(ctx, part, anchor, angle) {
  const k = RefMap.scale;
  const [rx, ry, rw, rh] = part.rect, [px, py] = part.pivot;
  ctx.save();
  ctx.translate(anchor.x, anchor.y);
  ctx.rotate(angle);
  ctx.imageSmoothingEnabled = false;
  const x = (rx - px) * k, y = (py - (ry + rh)) * k, w = rw * k, h = rh * k;
  ctx.translate(x, y + h);                   // the picture is y-down: flip it back inside the y-up context
  ctx.scale(1, -1);
  ctx.drawImage(part.image, 0, 0, w, h);
  ctx.restore();
}

// MARK: Pose maths

/** Applies the body transform of a pose to a point (sprite units). */
export function bodyPoint(pose, p) {
  const pv = pose.pivot;
  let x = p.x - pv.x, y = p.y - pv.y;
  x *= 1 + pose.squash * 0.6; y *= 1 - pose.squash;
  const c = Math.cos(pose.tilt), s = Math.sin(pose.tilt);
  [x, y] = [x * c - y * s, x * s + y * c];
  x += pv.x + pose.shift.x; y += pv.y + pose.shift.y;
  if (pose.hangTilt !== 0) {
    const h = MascotRig.hangHand;
    x -= h.x; y -= h.y;
    const c2 = Math.cos(pose.hangTilt), s2 = Math.sin(pose.hangTilt);
    [x, y] = [x * c2 - y * s2, x * s2 + y * c2];
    x += h.x; y += h.y;
  }
  return { x, y };
}

/** Same transform as `bodyPoint`, applied to the canvas. */
function applyBodyTransform(ctx, pose) {
  const pv = pose.pivot;
  if (pose.hangTilt !== 0) {
    const h = MascotRig.hangHand;
    ctx.translate(h.x, h.y); ctx.rotate(pose.hangTilt); ctx.translate(-h.x, -h.y);
  }
  ctx.translate(pv.x + pose.shift.x, pv.y + pose.shift.y);
  ctx.rotate(pose.tilt);
  ctx.scale(1 + pose.squash * 0.6, 1 - pose.squash);
  ctx.translate(-pv.x, -pv.y);
}

/** Where a hand ends up in sprite units (used to launch the thrown bottle). */
export function handPoint(pose, side) {
  return bodyPoint(pose, MascotRig.solveArm(side, pose.hands[side] ?? MascotRig.restHand[side]).hand);
}

/** Where the mouth ends up in sprite units (used to launch spit). */
export const mouthPoint = (pose) => bodyPoint(pose, MascotRig.mouth);

// MARK: Drawing

export function drawMascot(ctx, pose) {
  if (!sprites) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  drawShadow(ctx, pose);
  ctx.save();
  applyBodyTransform(ctx, pose);
  for (const side of Side.both) drawLeg(ctx, pose, side);
  drawPart(ctx, sprites.body, RefMap.point(241, 581), 0);
  drawFaceOverlay(ctx, pose.face, pose.isBlinking);
  if (pose.prop) drawProp(ctx, pose, pose.prop);
  for (const side of Side.both) drawArm(ctx, pose, side);
  drawBodyEffects(ctx, pose);
  ctx.restore();
  drawWorldEffects(ctx, pose);
  ctx.restore();
}

function drawShadow(ctx, pose) {
  const width = Math.abs(pose.tilt) > 1 ? 130 : 66;
  FX.ellipse(ctx, { x: MascotRig.centerX, y: 1 }, width / 2, 4, { color: rgb(0, 0, 0, 0.20) });
}

function drawLeg(ctx, pose, side) {
  const part = sprites[side === 'left' ? 'legL' : 'legR'];
  const foot = pose.feet[side];
  const hip = MascotRig.hip[side];
  const swing = foot.offset.x * 0.025 + Side.sign(side) * foot.toeUp * 0.5;
  drawPart(ctx, part, { x: hip.x + foot.offset.x * 0.6, y: hip.y + foot.offset.y }, swing);
}

/** The original reference sprites, unmodified. The sleeve and the forearm turn together about the shoulder,
 *  so the arm keeps its shape in every pose. */
function drawArm(ctx, pose, side) {
  const key = side === 'left' ? 'L' : 'R';
  const sol = MascotRig.solveArm(side, pose.hands[side] ?? MascotRig.restHand[side]);
  const shoulder = MascotRig.shoulder[side], elbowRest = MascotRig.elbowRest[side];
  const turn = Math.atan2(sol.elbow.y - sol.shoulder.y, sol.elbow.x - sol.shoulder.x) - Math.atan2(elbowRest.y - shoulder.y, elbowRest.x - shoulder.x);
  drawPart(ctx, sprites[`arm${key}_low`], sol.elbow, turn);
  drawPart(ctx, sprites[`arm${key}_up`], sol.shoulder, turn);
}

function drawProp(ctx, pose, prop) {
  const hand = MascotRig.solveArm(prop.side, pose.hands[prop.side] ?? MascotRig.restHand[prop.side]).hand;
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(prop.angle);
  ctx.scale(prop.scale, prop.scale);
  Props.draw(ctx, { kind: prop.kind, angle: prop.angle, fill: prop.fill, capOn: prop.capOn });
  ctx.restore();
}

// MARK: Effects

const SPARKLE = ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..'];
const TEARDROP = ['.X.', '.X.', 'XXX', 'XXX', '.X.'];
const LETTER_Z = ['XXXXX', '....X', '...X.', '.X...', 'XXXXX'];

function drawBodyEffects(ctx, pose) {
  const e = pose.effects, mouth = MascotRig.mouth;
  if (e.puff > 0) {                                           // exhaled smoke
    const k = e.puff;
    for (let i = 0; i < 4; i++) {
      const c = { x: mouth.x + e.puffSide * (9 + 20 * k + i * 6 * k), y: mouth.y + 2 + 12 * k + i * 3 * k };
      const r = 2.5 + 5 * k + i * 0.8;
      FX.disc(ctx, c, r, { color: rgb(0.74, 0.77, 0.83, 0.75 * (1 - k)) });
      FX.disc(ctx, c, Math.max(0, r - CELL * 1.2), { color: rgb(1, 1, 1, 0.8 * (1 - k)) });
    }
  }
  if (e.dizzy > 0.02) {
    for (let i = 0; i < 3; i++) {
      const a = pose.time * 4 + i * 2.09;
      const c = { x: MascotRig.headTop.x + Math.cos(a) * 20, y: MascotRig.headTop.y + 6 + Math.sin(a) * 5 };
      FX.bitmap(ctx, SPARKLE, { x: c.x - 3, y: c.y + 3 }, { color: rgb(1, 0.85, 0.2, e.dizzy) });
    }
  }
  if (e.sweat > 0.02) {
    FX.bitmap(ctx, TEARDROP, { x: 85, y: 142 - 6 * e.sweat }, { color: rgb(0.55, 0.8, 1, 0.9 * (1 - e.sweat * 0.4)) });
  }
  if (e.capFlight > 0 && e.capFlight < 1) {
    const k = e.capFlight;
    const p = { x: e.capOrigin.x + e.capSide * 60 * k, y: e.capOrigin.y + 80 * k - 130 * k * k };
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(k * 14);
    Props.drawCap(ctx, pose.prop?.kind ?? 'vodka');
    ctx.restore();
  }
}

/** Effects that stay upright whatever the body does. */
function drawWorldEffects(ctx, pose) {
  if (pose.effects.vomit) {
    drawVomit(ctx, pose.effects.vomit, { mouth: bodyPoint(pose, MascotRig.mouth), puddleX: MascotRig.centerX + pose.shift.x });
  }
  if (!pose.effects.zzz) return;
  const head = bodyPoint(pose, MascotRig.headTop);
  for (let i = 0; i < 3; i++) {
    const phase = (pose.time * 0.55 + i / 3) % 1;
    const origin = { x: head.x + 8 + phase * 22 + Math.sin(phase * 9) * 3, y: head.y + 4 + phase * 34 };
    FX.bitmap(ctx, LETTER_Z, origin, { scale: phase < 0.45 ? 1 : 2, color: rgb(0.25, 0.4, 0.85, 1 - phase) });
  }
}

/** Eyelids and the open mouth painted over the photographic face. The face only blinks (or sleeps);
 *  the mouth opens just for spitting and being sick. */
function drawFaceOverlay(ctx, face, blink) {
  const cell = CELL, origin = FX.BODY_GRID;
  if (blink || face.eyesClosed) {
    for (const side of Side.both) {
      const e = MascotRig.eyes[side];
      FX.ellipse(ctx, { x: e.x, y: e.y + 0.4 }, 6.5, 3.6, { origin, color: Palette.skinLid });
      FX.fill(ctx, { x: e.x - 5, y: e.y - 0.9, w: 10, h: cell }, { origin, color: Palette.lash },
        (p) => Math.abs(p.x - e.x) <= 5 && Math.abs(p.y - (e.y - 0.3)) <= cell * 0.6);
    }
  }
  if (face.mouthOpen > 0.08) {
    const mouth = MascotRig.mouth;
    const w = 15 + 7 * face.mouthOpen, h = 2.2 + 8.5 * face.mouthOpen;
    const c = { x: mouth.x, y: mouth.y - 0.5 };
    FX.ellipse(ctx, c, w / 2, h / 2, { origin, color: Palette.mouthDark });
    if (face.mouthOpen > 0.7) {
      FX.fill(ctx, { x: c.x - w / 2 + 2.5, y: c.y + h / 2 - 3, w: w - 5, h: cell * 1.5 }, { origin, color: Palette.teeth },
        (p) => Math.abs(p.x - c.x) <= w / 2 - 2.5 && p.y >= c.y + h / 2 - 3 && p.y <= c.y + h / 2 - 3 + cell * 1.5);
    }
  }
}

export { withAlpha };
