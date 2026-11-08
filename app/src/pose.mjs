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
    prop: null,                  // { kind, side, angle, fill, capOn, scale }
    effects: newEffects(),
    hangTilt: 0,                 // swing around the hand pinned to the cursor
    time: 0,                     // seconds, drives decorations
  };
}

export const mirrored = (p, side) => (side > 0 ? p : { x: MascotRig.size.width - p.x, y: p.y });

export { Side };
