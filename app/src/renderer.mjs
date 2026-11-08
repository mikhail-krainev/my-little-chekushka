// Composes the mascot from pixel-art parts cut from the reference picture. Sprite units, origin bottom-left, y up.
// Every draw function expects a y-up context (see beginYUp).
import { CELL, MascotRig, Palette, RefMap, Side, rgb, withAlpha } from './geometry.mjs';
import { dome, grain, tone } from './artstyle.mjs';
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

/** Where the mouth ends up in sprite units (used to launch spit and smoke). */
export const mouthPoint = (pose) => bodyPoint(pose, MascotRig.mouth);

/** A point given in a held prop's local frame, in body units (before the body transform). */
function propLocalToBody(pose, prop, local) {
  const hand = MascotRig.solveArm(prop.side, pose.hands[prop.side] ?? MascotRig.restHand[prop.side]).hand;
  const [sx, sy] = propScale(prop);
  const x = local.x * sx, y = local.y * sy, c = Math.cos(prop.angle), s = Math.sin(prop.angle);
  return { x: hand.x + x * c - y * s, y: hand.y + x * s + y * c };
}

/** A prop pushed toward the viewer (`depth` 1) looks bigger and foreshortened along its length. */
const propScale = (prop) => {
  const d = prop.depth ?? 0;
  return [prop.scale * (1 + 0.5 * d), prop.scale * (1 + 0.5 * d) * (1 - 0.8 * d)];
};

/** Burning end of the held cigarette in sprite units, or null (used to place the burn mark). */
export function emberPoint(pose) {
  const prop = pose.prop;
  if (!prop || prop.kind !== 'cigarette') return null;
  return bodyPoint(pose, propLocalToBody(pose, prop, Props.cigaretteEmber(prop.burnt)));
}

// MARK: Drawing

/** `talkingFace` (optional, from PhrasePlayer.face()) replaces the painted face with a frame of a meme clip. */
export function drawMascot(ctx, pose, talkingFace = null) {
  if (!sprites) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  drawShadow(ctx, pose);
  if (pose.effects.hookah) drawHookahScene(ctx, pose);
  ctx.save();
  applyBodyTransform(ctx, pose);
  for (const side of Side.both) drawLeg(ctx, pose, side);
  drawPart(ctx, sprites.body, RefMap.point(241, 581), 0);
  if (talkingFace) drawTalkingFace(ctx, talkingFace);
  else drawFaceOverlay(ctx, pose.face, pose.isBlinking);
  if (pose.prop) drawProp(ctx, pose, pose.prop);
  if (pose.prop2) drawProp(ctx, pose, pose.prop2);
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
  const [sx, sy] = propScale(prop);
  ctx.scale(sx, sy);
  Props.draw(ctx, prop);
  ctx.restore();
}

/** The hookah is drawn a little larger than its pixel grid so it reads next to the sitting mascot. */
const HOOKAH_SIZE = 1.2;

/** Hookah on the floor beside the mascot and the hose to the mouthpiece in its hand. Drawn behind the body. */
function drawHookahScene(ctx, pose) {
  const h = pose.effects.hookah;
  const base = { x: MascotRig.centerX + h.side * h.distance, y: 0 };
  const facing = -h.side;                                     // the hose port faces the mascot
  ctx.save();
  FX.ellipse(ctx, { x: base.x, y: 1 }, 15 * h.scale, 3, { color: rgb(0, 0, 0, 0.18) });
  ctx.translate(base.x, base.y);
  ctx.scale(h.scale * HOOKAH_SIZE, h.scale * HOOKAH_SIZE);
  Props.drawHookah(ctx, { side: facing, glow: h.glow, bubbles: h.bubbles, time: h.time });
  ctx.restore();
  if (h.scale < 0.9) return;
  const port = { x: base.x + facing * (Props.HOOKAH_PORT.length + 1.5) * CELL * HOOKAH_SIZE, y: (Props.HOOKAH_PORT.row + 1) * CELL * HOOKAH_SIZE };
  const pipe = pose.prop?.kind === 'mouthpiece' && pose.prop.scale > 0.5 ? pose.prop : null;
  const end = pipe ? bodyPoint(pose, propLocalToBody(pose, pipe, Props.MOUTHPIECE_HOSE_JOINT)) : { x: port.x + facing * 14, y: 3 };
  Props.drawHose(ctx, port, end);
}

// MARK: Effects

const SPARKLE = ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..'];
const TEARDROP = ['.X.', '.X.', 'XXX', 'XXX', '.X.'];
const LETTER_Z = ['XXXXX', '....X', '...X.', '.X...', 'XXXXX'];
const SMOKE_GREY = rgb(0.80, 0.81, 0.83);
const STAR = rgb(0.92, 0.78, 0.36);
const SWEAT = rgb(0.62, 0.76, 0.86);
const SLEEP_BLUE = rgb(0.32, 0.40, 0.62);

function drawBodyEffects(ctx, pose) {
  const e = pose.effects, mouth = MascotRig.mouth;
  if (e.puff > 0) {                                           // exhaled breath: small shaded cloud puffs
    const k = e.puff;
    for (let i = 0; i < 4; i++) {
      const c = { x: mouth.x + e.puffSide * (9 + 20 * k + i * 6 * k), y: mouth.y + 2 + 12 * k + i * 3 * k };
      const r = 2.5 + 5 * k + i * 0.8;
      FX.paint(ctx, { x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r }, {}, (p, ix, iy) => {
        const dx = (p.x - c.x) / r, dy = (p.y - c.y) / r;
        if (dx * dx + dy * dy > 1) return null;
        return tone(SMOKE_GREY, dome(dx, dy) * 1.15, grain(ix, iy, i) * 0.05, 0.8 * (1 - k));
      });
    }
  }
  if (e.dizzy > 0.02) {
    for (let i = 0; i < 3; i++) {
      const a = pose.time * 4 + i * 2.09;
      const c = { x: MascotRig.headTop.x + Math.cos(a) * 20, y: MascotRig.headTop.y + 6 + Math.sin(a) * 5 };
      FX.bitmap(ctx, SPARKLE, { x: c.x - 3, y: c.y + 3 }, { color: tone(STAR, 1, 0, e.dizzy) });
      FX.block(ctx, { x: c.x, y: c.y }, { color: tone(STAR, 1.25, 0, e.dizzy) });
    }
  }
  if (e.sweat > 0.02) {
    FX.bitmap(ctx, TEARDROP, { x: 85, y: 142 - 6 * e.sweat }, { color: tone(SWEAT, 1, 0, 0.9 * (1 - e.sweat * 0.4)) });
    FX.block(ctx, { x: 86.5, y: 138.5 - 6 * e.sweat }, { color: tone(SWEAT, 1.3, 0, 0.9 * (1 - e.sweat * 0.4)) });
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
  if (pose.effects.emberSmoke > 0.02) drawEmberSmoke(ctx, pose);
  if (pose.effects.vomit) {
    drawVomit(ctx, pose.effects.vomit, { mouth: bodyPoint(pose, MascotRig.mouth), puddleX: MascotRig.centerX + pose.shift.x });
  }
  if (!pose.effects.zzz) return;
  const head = bodyPoint(pose, MascotRig.headTop);
  for (let i = 0; i < 3; i++) {
    const phase = (pose.time * 0.55 + i / 3) % 1;
    const origin = { x: head.x + 8 + phase * 22 + Math.sin(phase * 9) * 3, y: head.y + 4 + phase * 34 };
    FX.bitmap(ctx, LETTER_Z, origin, { scale: phase < 0.45 ? 1 : 2, color: tone(SLEEP_BLUE, 1, 0, 1 - phase) });
  }
}

/** A thin ribbon of smoke curling up from the cigarette end. */
function drawEmberSmoke(ctx, pose) {
  const ember = emberPoint(pose);
  if (!ember) return;
  const k = pose.effects.emberSmoke, t = pose.time;
  for (let i = 0; i < 16; i++) {
    const age = (t * 0.7 + i / 16) % 1;
    const p = { x: ember.x + Math.sin(age * 9 + t * 2) * 3 * age + age * 4, y: ember.y + 2 + age * 34 };
    FX.block(ctx, p, { cells: age > 0.4 ? 2 : 1, color: tone(SMOKE_GREY, 1.05, 0, 0.75 * k * (1 - age * 0.8)) });
  }
}

/** A frame of a meme clip laid over the face, on the body sprite's own pixel grid (`rect` is in body.png pixels). */
function drawTalkingFace(ctx, { image, sx, sy, sw, sh, rect }) {
  const body = sprites.body;
  const [rx, ry, rw, rh] = body.rect, [px, py] = body.pivot;
  const k = RefMap.scale, artPixel = rw * k / body.image.naturalWidth;
  const anchor = RefMap.point(px, py);
  ctx.save();
  ctx.translate(anchor.x + (rx - px) * k, anchor.y + (py - (ry + rh)) * k + rh * k);   // top-left of body.png, y-up
  ctx.scale(1, -1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, sx, sy, sw, sh, rect.x * artPixel, rect.y * artPixel, rect.w * artPixel, rect.h * artPixel);
  ctx.restore();
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
