// Pose model of the mascot. Logical units: sprite is 120x180, origin bottom-left, y up.
import { MascotRig, Side } from './geometry.mjs';

/** The photo face never emotes: it only blinks. The mouth opens solely for spitting and being sick. */
export const newFace = () => ({ eyesClosed: false, mouthOpen: 0 });
export const newFoot = (x = 0, y = 0, toeUp = 0) => ({ offset: { x, y }, toeUp });

export function newEffects() {
  return {
    zzz: false,
    puff: 0,               // exhale smoke progress 0 none, 0...1
    puffSide: 1,           // smoke drifts toward +1 right or -1 left
    dizzy: 0,              // 0...1 stars over the head
    capFlight: 0,          // flying bottle cap progress 0 none, 0...1
    capSide: 1,
    capOrigin: { x: 0, y: 0 },
    sweat: 0,
    vomit: null,           // { elapsed, flowEnd, side, isBeer, fade }
    emberSmoke: 0,         // 0...1 thin smoke curling up from a held cigarette
    hookah: null,          // { side, scale, glow, bubbles, time, distance } hookah standing on the floor
  };
}

export function newPose(face = newFace()) {
  return {
    face: { ...face },
    isBlinking: false,
    shift: { x: 0, y: 0 },       // body offset, logical units
    tilt: 0,                     // radians around `pivot`, + = counter-clockwise
    pivot: { x: 60, y: 0 },
    squash: 0,                   // + squat (wider, shorter), - stretched
    hands: { left: { ...MascotRig.restHand.left }, right: { ...MascotRig.restHand.right } },
    feet: { left: newFoot(), right: newFoot() },
    prop: null,                  // held item { kind, side, angle, scale, ... } (bottle: fill, capOn; cigarette: burnt, glow, depth)
    prop2: null,                 // second held item (the lighter)
    effects: newEffects(),
    hangTilt: 0,                 // swing around the hand pinned to the cursor
    time: 0,                     // seconds, drives decorations
  };
}

export const mirrored = (p, side) => (side > 0 ? p : { x: MascotRig.size.width - p.x, y: p.y });

export { Side };

/**
 * Pose between `a` and `b` (k 0 = a, 1 = b) used to smooth the switch from one action to the next.
 * Body transforms with different pivots are re-expressed around `b`'s pivot first, so nothing jumps.
 * Face, props and effects come from `b`.
 */
export function blendPoses(a, b, k) {
  if (k >= 1) return b;
  const lerp = (x, y) => x + (y - x) * k;
  const mixPt = (p, q) => ({ x: lerp(p.x, q.x), y: lerp(p.y, q.y) });
  const shiftA = shiftAround(a, b.pivot);
  const out = { ...b, hands: {}, feet: {} };
  out.shift = mixPt(shiftA, b.shift);
  out.tilt = lerp(a.tilt, b.tilt);
  out.squash = lerp(a.squash, b.squash);
  out.hangTilt = lerp(a.hangTilt, b.hangTilt);
  for (const side of Side.both) {
    out.hands[side] = mixPt(a.hands[side], b.hands[side]);
    out.feet[side] = { offset: mixPt(a.feet[side].offset, b.feet[side].offset), toeUp: lerp(a.feet[side].toeUp, b.feet[side].toeUp) };
  }
  return out;
}

/** Shift that gives pose `p` the same body transform when it turns about `pivot` instead of `p.pivot`. */
function shiftAround(p, pivot) {
  const dx = pivot.x - p.pivot.x, dy = pivot.y - p.pivot.y;
  const sx = dx * (1 + p.squash * 0.6), sy = dy * (1 - p.squash);
  const c = Math.cos(p.tilt), s = Math.sin(p.tilt);
  return { x: p.shift.x + (sx * c - sy * s) - dx, y: p.shift.y + (sx * s + sy * c) - dy };
}
