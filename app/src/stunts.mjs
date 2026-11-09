// Poses for the desktop pranks: peeking into a folder window, pushing a folder icon, typing into the search bar,
// and the angry stomp after being knocked off it. Pure functions: time in, pose out. `side` / `dir` +1 = to the right.
import { MascotRig, Side, lerp } from './geometry.mjs';
import { bump, ease, mix, seg, swing } from './motion.mjs';
import { newFoot, newPose } from './pose.mjs';
import { walk } from './animator.mjs';

/** Peek: leans in over the window edge, startles at PEEK_STARTLE, settles by the end. */
export const PEEK_DURATION = 3.4;
export const PEEK_STARTLE = 1.3;
/** Search: the bar pops up at SEARCH_OPEN, letters go in from SEARCH_TYPE_START, one every SEARCH_KEY_TIME. */
export const SEARCH_OPEN = 0.25;
export const SEARCH_TYPE_START = 0.7;
export const SEARCH_KEY_TIME = 0.13;
export const SEARCH_TEXT = 'крутить собак онлайн';
/** Typing ends, then a short pause before the bar throws him off. */
export const SEARCH_ZAP = SEARCH_TYPE_START + SEARCH_TEXT.length * SEARCH_KEY_TIME + 0.45;
export const ANGRY_DURATION = 3.2;

/** How much of SEARCH_TEXT is typed `t` seconds into the search scene. */
export function typedText(t) {
  const keys = Math.floor((t - SEARCH_TYPE_START) / SEARCH_KEY_TIME) + 1;
  return SEARCH_TEXT.slice(0, Math.max(0, Math.min(SEARCH_TEXT.length, keys)));
}

/** Leans over the edge of a window on `side`, then jumps back with hands up. */
export function peek(t, side, base) {
  const p = newPose(base);
  const front = Side.fromSign(side), back = Side.other(front);
  const lean = ease(seg(t, 0.1, 1.0)) * (1 - ease(seg(t, PEEK_STARTLE, PEEK_STARTLE + 0.2)));
  const fright = ease(seg(t, PEEK_STARTLE, PEEK_STARTLE + 0.15)) * (1 - ease(seg(t, PEEK_DURATION - 0.8, PEEK_DURATION)));
  const hop = bump(t, PEEK_STARTLE, PEEK_STARTLE + 0.45);
  p.pivot = { x: 60, y: 0 };
  p.tilt = -side * 0.42 * lean + side * 0.12 * fright;
  p.shift = { x: side * 6 * lean - side * 10 * fright, y: 18 * hop };
  p.squash = -0.06 * hop + 0.02 * lean;
  p.face.mouthOpen = 0.8 * fright;
  const shake = Math.sin(t * 30) * 0.08 * fright;
  const leanHands = { [front]: swing(front, 1.35), [back]: swing(back, MascotRig.restSwing + 0.2) };
  for (const s of Side.both) {
    p.hands[s] = mix(leanHands[s], swing(s, 2.7 + shake), fright);
    p.feet[s] = newFoot(-Side.sign(s) * 3 * hop, 8 * hop + 3 * lean * (s === back ? 1 : 0), 0.3 * lean);
  }
  return p;
}

/** Walks along leaning into a folder icon held out in front with both hands. */
export function push(phase, dir, base) {
  const p = walk(phase, dir, false, base);
  const front = Side.fromSign(dir), back = Side.other(front);
  p.tilt = -dir * 0.2 + Math.sin(phase) * 0.03;
  p.hands[front] = swing(front, 1.45 + Math.sin(phase * 2) * 0.04);
  p.hands[back] = swing(back, -1.2 + Math.sin(phase * 2 + 1) * 0.04);
  return p;
}

/** Opens the search bar with a raised hand, then hammers the keys in front of him. */
export function typing(t, dir, base) {
  const p = newPose(base);
  const front = Side.fromSign(dir), back = Side.other(front);
  const open = bump(t, 0, SEARCH_TYPE_START);
  const busy = seg(t, SEARCH_TYPE_START - 0.2, SEARCH_TYPE_START);
  p.tilt = -dir * 0.08 * busy + Math.sin(t * 2.3) * 0.01;
  p.squash = Math.sin(t * 22) * 0.008 * busy;
  const tapFront = swing(front, 1.3 + 0.14 * Math.sin(t * 22));
  const tapBack = swing(back, -1.0 + 0.14 * Math.sin(t * 22 + Math.PI));
  const rest = { [front]: swing(front, MascotRig.restSwing), [back]: swing(back, MascotRig.restSwing) };
  p.hands[front] = mix(mix(rest[front], swing(front, 2.6), open), tapFront, busy);
  p.hands[back] = mix(rest[back], tapBack, busy);
  return p;
}

/** Stamps his feet and shakes both fists over his head. */
export function angry(t, base) {
  const p = newPose(base);
  const on = ease(seg(t, 0, 0.25)) * (1 - ease(seg(t, ANGRY_DURATION - 0.4, ANGRY_DURATION)));
  const step = t * 9;
  p.shift.y = 3 * Math.abs(Math.sin(step)) * on;
  p.squash = 0.05 * Math.abs(Math.cos(step)) * on;
  p.tilt = Math.sin(t * 18) * 0.05 * on;
  p.face.mouthOpen = 0.5 * on;
  for (const s of Side.both) {
    const lift = Math.max(0, Side.sign(s) * Math.sin(step)) * 9 * on;
    p.feet[s] = newFoot(0, lift, 0.2 * lift / 9);
    const fist = swing(s, 2.35 + 0.3 * Math.sin(t * 20 + (s === 'left' ? 0 : Math.PI)));
    p.hands[s] = mix(swing(s, MascotRig.restSwing), fist, on);
  }
  return p;
}

/** Hanging from the cursor, swinging back to fling it: `k` 0 just grabbed ... 1 the moment of the throw. */
export const windupSwing = (k, dir) => -dir * 0.7 * Math.sin(lerp(0, Math.PI / 2, ease(k)));
