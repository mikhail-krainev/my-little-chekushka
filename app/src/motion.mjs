// Small timing and arm helpers shared by all scenes. Pure functions, no DOM.
import { MascotRig, lerp } from './geometry.mjs';
import { tipDistance } from './props.mjs';

/** 0 before `a`, 1 after `b`, linear in between. */
export const seg = (t, a, b) => (b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : (t >= b ? 1 : 0));
export const ease = (x) => x * x * (3 - 2 * x);
/** Overshoots a little before settling: things that pop into existence. */
export const easeOutBack = (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
/** Bell between a and b (0 outside, 1 in the middle). */
export const bump = (t, a, b) => Math.sin(seg(t, a, b) * Math.PI);
export const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
/** Hand target for an arm swinging rigidly about the shoulder (see `MascotRig.armTarget`). */
export const swing = (side, angle) => MascotRig.armTarget(side, angle);

/** Prop angle (right-hand frame) that puts the far end of a held prop on the mascot's mouth for a hand at `hand`. */
export const aimAtMouth = (hand) => Math.atan2(-(MascotRig.mouth.x - hand.x), MascotRig.mouth.y + 1 - hand.y);

/** Arm swing (right arm) that puts the fist exactly one prop length from the mouth, so the far end reaches it. */
export function mouthSwing(kind) {
  const s = MascotRig.shoulder.right, m = MascotRig.mouth, len = MascotRig.armLength;
  const dx = s.x - m.x, dy = s.y - m.y, reach = Math.hypot(dx, dy);
  const tip = tipDistance(kind);
  const sine = (tip * tip - dx * dx - dy * dy - len * len) / (2 * len * reach);
  return Math.asin(Math.max(-1, Math.min(1, sine))) + Math.atan2(dy, dx);
}
