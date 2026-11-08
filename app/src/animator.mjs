// Pure functions: state and time in, pose out. No DOM, so poses are testable and previewable.
import { MascotRig, Side, lerp, rand } from './geometry.mjs';
import { newPose, newFoot, mirrored } from './pose.mjs';
import { tipDistance } from './props.mjs';

export const PERFORMANCE_KINDS = ['sit', 'sleep', 'stretch', 'vodka', 'beer', 'spit'];
/** Chance that a drinker is sick after the bottle. */
export const VOMIT_CHANCE = 0.5;
export const STRETCH_DURATION = 11.6;
export const VOMIT_DURATION = 3.4;
export const SPIT_RELEASE = 2.05;
export const SPIT_DURATION = 3.4;

const VOMIT_FLOW_START = 0.8;
const VOMIT_FLOW_END = 2.5;
const HAWK_START = 0.4, HAWK_END = 1.5, HAWK_PULSES = 3, DRAW_BACK_END = 1.95;

// MARK: Helpers

export const seg = (t, a, b) => (b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : (t >= b ? 1 : 0));
export const ease = (x) => x * x * (3 - 2 * x);
/** Bell between a and b (0 outside, 1 in the middle). */
export const bump = (t, a, b) => Math.sin(seg(t, a, b) * Math.PI);
export const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
/** Hand target for an arm swinging rigidly about the shoulder (see `MascotRig.armTarget`). */
export const swing = (side, angle) => MascotRig.armTarget(side, angle);
const fist = swing;

/** A scripted action that runs on the floor. `side` +1 acts toward the right (working arm is the right one), -1 mirrored. */
export function makePerformance(kind, { side = Math.random() < 0.5 ? 1 : -1, vomits = Math.random() < VOMIT_CHANCE } = {}) {
  let duration, sick = false;
  switch (kind) {
    case 'sit': duration = 1.1 + rand(3, 6); break;
    case 'sleep': duration = 2.4 + rand(7, 13); break;
    case 'stretch': duration = STRETCH_DURATION; break;
    case 'vodka': case 'beer': sick = vomits; duration = drinkTimeline(kind, vomits).end; break;
    case 'spit': duration = SPIT_DURATION; break;
    default: throw new Error(`unknown performance: ${kind}`);
  }
  return { kind, duration, side, vomits: sick };
}

// MARK: Locomotion

export function idle(t, base) {
  const p = newPose(base);
  p.time = t;
  p.squash = Math.sin(t * 2.3) * 0.010;
  p.tilt = Math.sin(t * 1.1) * 0.012;
  for (const side of Side.both) p.hands[side] = swing(side, MascotRig.restSwing + Math.sin(t * 1.6 + (side === 'left' ? 0 : 1.3)) * 0.02);
  return p;
}

/** `phase` advances while moving; `dir` is +1/-1 along x. */
export function walk(phase, dir, run, base) {
  const p = newPose(base);
  const bob = Math.abs(Math.sin(phase)) * (run ? 5 : 2.4);
  const lift = run ? 11 : 5.5;
  const reach = run ? 12 : 7;
  p.shift.y = bob;
  p.tilt = Math.sin(phase) * (run ? 0.05 : 0.07) - dir * (run ? 0.13 : 0.035);
  p.squash = (1 - Math.abs(Math.sin(phase))) * (run ? 0.03 : 0.015);
  for (const side of Side.both) {
    const ph = phase + (side === 'left' ? 0 : Math.PI);
    const planted = -bob;
    const up = Math.max(0, Math.cos(ph));
    p.feet[side] = newFoot(Math.sin(ph) * reach * 0.45, up * lift + (up > 0 ? 0 : planted), up * 0.25);
    // arms swing out and in against the legs; wider and faster when running
    p.hands[side] = run ? swing(side, 0.5 + Math.sin(ph) * 0.45) : swing(side, MascotRig.restSwing + 0.04 + Math.sin(ph + Math.PI) * 0.14);
  }
  return p;
}

export function crouch(k, dir, base) {
  const p = newPose(base);
  const e = ease(k);
  p.squash = 0.17 * e;
  p.tilt = -dir * 0.05 * e;
  for (const side of Side.both) {
    p.hands[side] = swing(side, MascotRig.restSwing + 0.3 * e);
    p.feet[side] = newFoot(Side.sign(side) * 3 * e, 0, 0);
  }
  return p;
}

/** k: 0 take-off ... 1 touch-down. */
export function airborne(k, dir, base) {
  const p = newPose(base);
  const up = Math.cos(k * Math.PI);                     // +1 rising, -1 falling
  p.squash = -0.08 * Math.sin(k * Math.PI);
  p.tilt = -dir * 0.1 * up;
  for (const side of Side.both) {
    const spread = 1 - Math.max(0, up);                 // arms shoot up, then open for balance
    p.hands[side] = swing(side, 2.6 - 0.9 * spread);
    const tuck = Math.sin(k * Math.PI);
    p.feet[side] = newFoot(-Side.sign(side) * 3 * tuck, 9 * tuck, -0.25 * tuck);
  }
  return p;
}

export function land(k, base) {
  const p = newPose(base);
  p.squash = 0.17 * (1 - ease(k)) * Math.cos(k * 5);    // soft rebound
  for (const side of Side.both) p.hands[side] = swing(side, MascotRig.restSwing + 0.5 * (1 - k));
  return p;
}

/** Thrown by the user: tumbling, flailing. */
export function flung(t, velocityX, base) {
  const p = newPose(base);
  p.time = t;
  p.tilt = Math.max(-0.7, Math.min(0.7, -velocityX / 1800)) + Math.sin(t * 16) * 0.05;
  for (const side of Side.both) {
    const w = Math.sin(t * 18 + (side === 'left' ? 0 : 2));
    p.hands[side] = swing(side, 1.9 + 0.4 * w);
    p.feet[side] = newFoot(-Side.sign(side) * 4, 8 + 5 * Math.sin(t * 14 + (side === 'left' ? 1 : 0)), 0.2);
  }
  return p;
}

export function dragged(t, base) {
  const p = flung(t, 0, base);
  p.tilt = Math.sin(t * 7) * 0.08;
  return p;
}

/** Dangling from the cursor by the raised right hand. */
export function hanging(t, swingAngle, base) {
  const p = newPose(base);
  p.time = t;
  p.hangTilt = swingAngle;
  p.hands.right = { ...MascotRig.hangHand };
  p.hands.left = swing('left', 0.7 + 0.15 * Math.sin(t * 3));
  for (const side of Side.both) {
    const o = side === 'left' ? 0 : 1.5;
    p.feet[side] = newFoot(Math.sin(t * 5 + o) * 3 - Side.sign(side) * 2, 6 + Math.cos(t * 5 + o) * 3, -0.3);
  }
  return p;
}

// MARK: Scenes on the floor

export function performance(perf, t, base) {
  const d = perf.duration;
  let p;
  switch (perf.kind) {
    case 'sit': p = sit(t, d, base); break;
    case 'sleep': p = sleep(t, d, perf.side, base); break;
    case 'stretch': p = stretch(t, base); break;
    case 'vodka': p = drink('vodka', perf.vomits, t, perf.side, base); break;
    case 'beer': p = drink('beer', perf.vomits, t, perf.side, base); break;
    case 'spit': p = spit(t, perf.side, base); break;
    default: throw new Error(`unknown performance: ${perf.kind}`);
  }
  p.time = t;
  return p;
}

function sit(t, d, base) {
  const p = newPose(base);
  const down = ease(seg(t, 0, 0.45)), up = ease(seg(t, d - 0.55, d));
  const s = down - up;
  const thud = bump(t, 0.4, 0.8) * 0.05 + bump(t, d - 0.3, d) * 0.03;         // settles with a bounce
  p.shift.y = -21 * s - thud * 10;
  p.squash = 0.04 * s + thud;
  p.tilt = Math.sin(t * 1.3) * 0.015 * s;
  const scratch = bump(t, 1.5, 3.2);
  for (const side of Side.both) {
    p.feet[side] = newFoot(Side.sign(side) * 17 * s, 16 * s, 0.55 * s);
    p.hands[side] = swing(side, MascotRig.restSwing + 0.45 * s);
  }
  // the right hand scratches the back of the head
  if (scratch > 0.01) p.hands.right = mix(p.hands.right, swing('right', 2.7 + Math.sin(t * 14) * 0.1), scratch);
  return p;
}

function sleep(t, d, side, base) {
  const p = newPose(base);
  const stretchIn = bump(t, 0, 0.8);
  const fall = seg(t, 0.8, 1.5), rise = seg(t, d - 1.0, d - 0.15);
  // topple like a skittle: accelerates, then a little bounce
  const lying = Math.max(0, Math.min(1, fall * fall - ease(rise)));
  const bounce = bump(t, 1.5, 1.95) * 0.06;
  p.pivot = { x: 60, y: 70 };
  p.tilt = -side * (lying * (Math.PI / 2) + bounce * lying);
  p.shift.y = -40 * lying;
  const asleep = ease(seg(t, 1.4, 2.0)) * (1 - ease(seg(t, d - 1.0, d - 0.4)));
  p.face.eyesClosed = asleep > 0.5;
  p.squash += asleep * 0.012 * Math.sin(t * 1.9);
  p.effects.zzz = asleep > 0.9;
  // arms: the lower one is tucked, the upper one rests on the belly; both stretch up on falling asleep and waking
  const lowSide = side > 0 ? 'right' : 'left';
  const stretchUp = Math.max(stretchIn, bump(t, d - 0.95, d - 0.1));
  p.hands[lowSide] = swing(lowSide, lerp(MascotRig.restSwing, 2.9, stretchUp));
  p.hands[Side.other(lowSide)] = swing(Side.other(lowSide), lerp(MascotRig.restSwing + 0.25 + Math.sin(t * 1.9) * 0.02, 2.9, stretchUp));
  for (const s of Side.both) p.feet[s] = newFoot(-Side.sign(s) * 3 * lying, 4 * lying, -0.3 * lying);
  return p;
}

function stretch(t, base) {
  const p = newPose(base);
  const rest = MascotRig.restSwing;
  const breathe = bump(t, 0, 0.7);

  if (t < 0.7) {                                          // arms away from the sides, deep breath
    for (const s of Side.both) p.hands[s] = swing(s, lerp(rest, 0.85, ease(seg(t, 0, 0.3))));
    p.squash = -0.025 * breathe;
  } else if (t < 3.3) {                                   // big arm sweeps: out and up, down again (never across the belly)
    const ramp = ease(seg(t, 0.7, 1.1));
    const spin = (t - 0.7) * 5.2;
    for (const s of Side.both) p.hands[s] = swing(s, lerp(0.85, 1.9 + Math.sin(spin - Math.PI / 2) * 1.0, ramp));
    p.tilt = Math.sin(spin) * 0.03;
  } else if (t < 5.9) {                                   // side bends with an arm over the head
    const k = t - 3.3;
    const sway = Math.sin((k / 2.6) * Math.PI * 2 * 1.5);  // left, right, left
    p.tilt = sway * 0.3;
    p.shift.x = -sway * 4;
    const up = sway > 0 ? 'right' : 'left';              // arm opposite to the lean goes over
    const ramp = ease(seg(t, 3.3, 3.8));
    for (const s of Side.both) {
      p.hands[s] = swing(s, lerp(0.85, s === up ? 2.85 : 0.6, ramp));
      p.feet[s] = newFoot(Side.sign(s) * 5 * ramp, 0, 0);
    }
  } else if (t < 8.3) {                                   // squats
    const k = t - 5.9;
    const squat = ((1 - Math.cos((k / 0.8) * Math.PI * 2)) / 2) * ease(seg(t, 5.9, 6.2));
    p.squash = 0.10 * squat;
    p.shift.y = -4 * squat;
    for (const s of Side.both) {
      p.hands[s] = swing(s, 0.85 + 0.35 * squat);
      p.feet[s] = newFoot(Side.sign(s) * (5 + 5 * squat), 0, 0.1 * squat);
    }
  } else if (t < 10.4) {                                  // jumping jacks
    const k = t - 8.3;
    const wave = (1 - Math.cos((k / 0.55) * Math.PI * 2)) / 2;   // 0 closed, 1 open
    p.shift.y = Math.abs(Math.sin((k / 0.55) * Math.PI)) * 6;
    for (const s of Side.both) {
      p.hands[s] = swing(s, lerp(rest + 0.1, 2.7, wave));
      p.feet[s] = newFoot(Side.sign(s) * 12 * wave, 0, 0.1);
    }
  } else {                                                // shake out, wipe the forehead
    const k = seg(t, 10.4, 11.6);
    p.effects.puff = bump(t, 10.4, 11.2) > 0 ? seg(t, 10.4, 11.2) : 0;
    p.effects.sweat = bump(t, 10.4, 11.4);
    p.hands.left = swing('left', 0.6 + Math.sin(t * 25) * 0.12);
    p.hands.right = swing('right', lerp(rest, 2.4, bump(t, 10.6, 11.6)));
    p.squash = -0.02 * (1 - k);
  }
  return p;
}

// MARK: Drinking: take the bottle out, open it, drink, shudder, sway, (sometimes) be sick, throw it away.

export function drinkTimeline(kind, vomits = false) {
  const [chug, gulps] = kind === 'beer' ? [4.2, 6] : [2.4, 3];        // 0.5 l: long pull, 0.2 l: three gulps
  const tl = { pull: 0.5, show: 1.3, open: 1.8, raise: 2.4, gulps, vomits };
  tl.chugEnd = tl.raise + chug;
  tl.lowerEnd = tl.chugEnd + 0.6;
  tl.grimaceEnd = tl.lowerEnd + 1.3;
  tl.swayEnd = tl.grimaceEnd + 0.9;
  tl.vomitEnd = tl.swayEnd + (vomits ? VOMIT_DURATION : 0);   // equals swayEnd when the drinker keeps it down
  tl.windupEnd = tl.vomitEnd + 0.7;
  tl.throwEnd = tl.windupEnd + 0.25;
  tl.end = tl.throwEnd + 1.1;
  tl.release = tl.throwEnd - 0.04;                            // moment the bottle leaves the hand
  return tl;
}

/** Bottle angle (right-hand frame) that puts the neck tip on the mascot's mouth for a hand at `hand`. */
const aimAtMouth = (hand) => Math.atan2(-(MascotRig.mouth.x - hand.x), MascotRig.mouth.y + 1 - hand.y);

/** Arm swing (right arm) that puts the fist exactly one bottle length from the mouth, so the neck tip reaches it. */
function chugSwing(kind) {
  const s = MascotRig.shoulder.right, m = MascotRig.mouth, len = MascotRig.armLength;
  const dx = s.x - m.x, dy = s.y - m.y, reach = Math.hypot(dx, dy);
  const tip = tipDistance(kind);
  const sine = (tip * tip - dx * dx - dy * dy - len * len) / (2 * len * reach);
  return Math.asin(Math.max(-1, Math.min(1, sine))) + Math.atan2(dy, dx);
}

/** The moment something leaves the mascot (bottle thrown, spit launched), or null for scenes without one. */
export function releaseTime(perf) {
  switch (perf.kind) {
    case 'vodka': case 'beer': return drinkTimeline(perf.kind, perf.vomits).release;
    case 'spit': return SPIT_RELEASE;
    default: return null;
  }
}

export function drink(kind, vomits, t, side, base) {
  const tl = drinkTimeline(kind, vomits);
  const p = newPose(base);
  const work = Side.fromSign(side), support = Side.other(work);
  const rest = MascotRig.restSwing;
  const held = fist(work, 1.3);                               // arm out to the side, bottle presented
  const arm = (angle) => fist(work, angle);
  const toRight = (pt) => mirrored(pt, side);
  const prop = { kind, side: work, angle: 0, fill: 1, capOn: true, scale: ease(seg(t, tl.pull - 0.05, tl.pull + 0.2)) };
  let hasProp = t >= tl.pull - 0.05 && t < tl.release;
  const chug = chugSwing(kind);
  p.hands[work] = arm(rest); p.hands[support] = fist(support, rest);

  if (t < tl.pull) {                                          // reach out for the bottle
    const k = ease(seg(t, 0, tl.pull));
    p.hands[work] = arm(lerp(rest, 0.75, k));
    p.tilt = -side * 0.04 * k;
  } else if (t < tl.show) {                                   // hold it out, inspect
    const k = ease(seg(t, tl.pull, tl.show));
    p.hands[work] = arm(lerp(0.75, 1.3, k));
    prop.angle = side * -0.12 * k;
    p.hands[support] = fist(support, lerp(rest, 0.5, k));
  } else if (t < tl.open) {                                   // twist the cap off
    const k = seg(t, tl.show, tl.open);
    p.hands[work] = arm(1.3 + 0.04 * Math.sin(k * 40));
    prop.angle = side * (-0.12 + 0.1 * Math.sin(k * 40));
    p.hands[support] = fist(support, 0.5);
    p.tilt = Math.sin(k * 30) * 0.012;
  } else if (t < tl.raise) {                                  // cap flies off, bottle goes up
    const k = ease(seg(t, tl.open, tl.raise));
    prop.capOn = false;
    p.hands[work] = arm(lerp(1.3, chug, k));
    prop.angle = side * lerp(-0.12, aimAtMouth(toRight(arm(chug))), k);
    p.hands[support] = fist(support, lerp(0.5, rest, ease(seg(t, tl.open, tl.open + 0.3))));
    p.effects.capFlight = seg(t, tl.open, tl.open + 0.7);
    p.effects.capSide = side;
    p.effects.capOrigin = { x: held.x + side * 2, y: held.y + tipDistance(kind) };
    p.effects.puff = kind === 'beer' ? bump(t, tl.open, tl.open + 0.45) * 0.4 : 0;
    p.effects.puffSide = side;
  } else if (t < tl.chugEnd) {                                // gulps
    const k = seg(t, tl.raise, tl.chugEnd);
    const gulp = (Math.sin(k * tl.gulps * Math.PI * 2 - Math.PI / 2) + 1) / 2;   // 0...1 per gulp
    prop.capOn = false;
    const tip = ease(Math.min(1, k * 3));
    p.hands[work] = arm(chug - 0.04 * gulp);
    prop.angle = side * (aimAtMouth(toRight(arm(chug))) + 0.15 * tip);
    prop.fill = Math.max(0, 1 - k);
    p.tilt = side * (0.06 + 0.1 * ease(Math.min(1, k * 3))) - side * 0.025 * gulp;
    p.shift.y = -1.2 * gulp;
    p.squash = 0.012 * gulp;
  } else if (t < tl.lowerEnd) {                               // bottle comes down, empty
    const k = ease(seg(t, tl.chugEnd, tl.lowerEnd));
    prop.capOn = false; prop.fill = 0;
    prop.angle = side * lerp(aimAtMouth(toRight(arm(chug))) + 0.15, 0.0, k);
    p.hands[work] = arm(lerp(chug, 0.6, k));
    p.tilt = side * lerp(0.16, 0, k);
  } else if (t < tl.grimaceEnd) {                             // "brrr": shudder and exhale
    const k = seg(t, tl.lowerEnd, tl.grimaceEnd);
    prop.capOn = false; prop.fill = 0;
    prop.angle = side * -0.05;
    p.hands[work] = arm(0.6 + 0.04 * Math.sin(t * 12));
    p.tilt = Math.sin(t * 38) * 0.05 * (1 - k);
    p.shift.y = 1.5 * Math.abs(Math.sin(t * 19)) * (1 - k);
    p.effects.puff = seg(k, 0, 0.7);
    p.effects.puffSide = side;
    p.effects.dizzy = k * 0.5;
  } else if (t < tl.swayEnd) {                                // tipsy sway
    const k = seg(t, tl.grimaceEnd, tl.swayEnd);
    prop.capOn = false; prop.fill = 0;
    prop.angle = side * -0.05;
    p.hands[work] = arm(0.6);
    p.tilt = Math.sin(t * 4.2) * 0.10;
    p.shift.x = Math.sin(t * 4.2) * 3;
    p.effects.dizzy = 0.5 + 0.5 * k;
    p.hands[support] = fist(support, rest + 0.25 + 0.15 * Math.sin(t * 4.2));
  } else if (t < tl.vomitEnd) {                               // too much: bends over and is sick
    vomitScene(p, prop, t - tl.swayEnd, side, support, work);
  } else if (t < tl.windupEnd) {                              // swing the arm back
    const k = ease(seg(t, tl.vomitEnd, tl.windupEnd));
    prop.capOn = false; prop.fill = 0;
    p.hands[work] = arm(lerp(0.6, 2.7, k));
    prop.angle = side * lerp(-0.05, 0.9, k);
    p.tilt = side * 0.18 * k + Math.sin(t * 4.2) * 0.04 * (1 - k);
    p.effects.dizzy = 0.8 * (1 - k);
  } else if (t < tl.release) {                                // the throw
    const k = ease(seg(t, tl.windupEnd, tl.release));
    prop.capOn = false; prop.fill = 0;
    p.hands[work] = arm(lerp(2.7, 1.45, k));
    prop.angle = side * lerp(0.9, -1.2, k);
    p.tilt = side * lerp(0.18, -0.2, k);
    p.shift.y = 2 * k;
  } else {                                                    // follow-through, pleased with itself
    const k = seg(t, tl.release, tl.end);
    const settle = ease(seg(t, tl.release, tl.release + 0.5));
    p.hands[work] = arm(lerp(1.45, rest, settle));
    p.tilt = side * lerp(-0.2, 0, settle) + Math.sin(t * 4.2) * 0.05 * (1 - k);
    p.effects.dizzy = 0.6 * (1 - k);
    p.shift.y = 3 * bump(t, tl.release + 0.5, tl.release + 0.75);       // hiccup bounce
    p.squash = 0.03 * bump(t, tl.release + 0.5, tl.release + 0.75);
    hasProp = false;
  }
  p.prop = hasProp ? prop : null;
  if (tl.vomits) {
    const streamStart = tl.swayEnd + VOMIT_FLOW_START;
    const fade = seg(t, tl.end - 0.8, tl.end);
    if (t >= streamStart) {
      p.effects.vomit = { elapsed: t - streamStart, flowEnd: VOMIT_FLOW_END - VOMIT_FLOW_START, side, isBeer: kind === 'beer', fade };
    }
  }
  return p;
}

/** `k` is the time since the scene began. The mascot bows from the hips, heaves, and the stream goes to the floor. */
function vomitScene(p, prop, k, side, support, work) {
  const rest = MascotRig.restSwing;
  const bow = ease(seg(k, 0, 0.7)) * (1 - ease(seg(k, 2.8, VOMIT_DURATION)));
  const streaming = seg(k, VOMIT_FLOW_START, VOMIT_FLOW_START + 0.15) * (1 - seg(k, VOMIT_FLOW_END - 0.15, VOMIT_FLOW_END));
  const heave = streaming * (0.5 + 0.5 * Math.sin(k * 15));
  p.pivot = { x: 60, y: 58 };
  p.tilt = -side * (0.5 * bow + 0.05 * heave);
  p.squash = 0.04 * heave + 0.02 * bow;
  p.shift.y = -3 * bow;
  p.face.mouthOpen = 0.25 * bow + 0.75 * streaming;
  p.effects.dizzy = 0.6;
  // the bottle hangs from the working hand, kept upright against the bow and out of the stream's way
  p.hands[work] = fist(work, lerp(0.6, 0.35, bow));
  prop.capOn = false; prop.fill = 0;
  prop.angle = side * (0.5 * bow - 0.05);
  // the free arm swings out for balance while heaving, then wipes the face
  const wipe = ease(seg(k, 2.6, 3.0)) * (1 - ease(seg(k, 3.2, VOMIT_DURATION)));
  const balance = rest + (0.35 + 0.1 * heave) * bow;
  p.hands[support] = fist(support, lerp(balance, 2.45 + 0.08 * Math.sin(k * 22), wipe));
}

// MARK: Spitting: hawk up, throw the head back, lunge and spit at a spot anywhere on the screen.

export function spit(t, side, base) {
  const p = newPose(base);
  const work = Side.fromSign(side), support = Side.other(work);
  p.pivot = { x: 60, y: 58 };

  // 1. hawking: three chest heaves, the head dips with each one
  const hawking = seg(t, HAWK_START, HAWK_END);
  const heave = hawking > 0 && hawking < 1 ? Math.max(0, Math.sin(hawking * HAWK_PULSES * Math.PI * 2)) : 0;
  // 2. head thrown back, 3. lunge forward
  const back = ease(seg(t, HAWK_END, DRAW_BACK_END));
  const lunge = ease(seg(t, DRAW_BACK_END, SPIT_RELEASE));
  const recover = ease(seg(t, SPIT_RELEASE, SPIT_RELEASE + 0.6));
  p.tilt = side * (-0.12 * heave + 0.3 * back - 0.62 * lunge + 0.32 * recover);
  p.squash = 0.05 * heave - 0.03 * lunge;
  p.shift.y = -2 * heave;
  const throatOpen = 0.3 * heave + 0.55 * back * (1 - lunge);
  p.face.mouthOpen = throatOpen + 0.35 * bump(t, SPIT_RELEASE - 0.1, SPIT_RELEASE + 0.35);

  // both arms jerk outward with every heave; afterwards the working arm wipes the mouth
  const rest = MascotRig.restSwing;
  const wipe = ease(seg(t, 2.4, 2.65)) * (1 - ease(seg(t, 3.0, 3.25)));
  p.hands[support] = swing(support, rest + 0.12 + 0.25 * heave);
  p.hands[work] = swing(work, lerp(rest + 0.25 * heave, 2.45 + Math.sin(t * 24) * 0.08, wipe));
  for (const s of Side.both) p.feet[s] = newFoot(Side.sign(s) * 4, 0, 0);
  return p;
}
