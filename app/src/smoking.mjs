// Smoking scenes. Pure functions: time in, pose out.
//  smoke:  takes a cigarette out of the pocket, lights it, three drags, then presses the butt out on the screen.
//  hookah: puts a hookah down beside itself, sits, and takes long pulls; every exhaled cloud hangs for 5 s.
import { MascotRig, Side, lerp } from './geometry.mjs';
import { aimAtMouth, bump, ease, easeOutBack, mouthSwing, seg, swing } from './motion.mjs';
import { mirrored, newFoot, newPose } from './pose.mjs';
import { HOOKAH_SMOKE_LIFETIME } from './shatter.mjs';

const HALF_PI = Math.PI / 2;

// MARK: Cigarette

export const SMOKE = (() => {
  const tl = {
    pocket: 0.5, meet: 1.0, flameOn: 1.15, lit: 1.75, flameOff: 2.05, toMouth: 2.25, firstPuff: 2.8,
    cycle: 2.8, puffs: 3, inhaleEnd: 1.0, lowerEnd: 1.4, exhaleAt: 1.45, cloudLife: 2.4,
  };
  tl.puffsEnd = tl.firstPuff + tl.puffs * tl.cycle;
  tl.pressStart = tl.puffsEnd + 0.6;
  tl.burnAt = tl.pressStart + 0.3;
  tl.flickAt = tl.pressStart + 0.95;
  tl.pressEnd = tl.pressStart + 1.15;
  tl.end = tl.pressEnd + 0.8;
  return tl;
})();

const CIG_HOLD = 0.7;          // arm swing between drags, cigarette upright beside the body
const CIG_BELLY = -0.5;        // both hands meet in front of the belly to light it
const LIGHTER_SWING = -0.72;
const CIG_PRESS = 1.35;        // arm straight out toward the screen
const LIT_GLOW = 0.45;

export function smoke(t, side, base) {
  const T = SMOKE, p = newPose(base);
  const work = Side.fromSign(side), support = Side.other(work), rest = MascotRig.restSwing;
  const arm = (a) => swing(work, a);
  const atMouth = mouthSwing('cigarette');
  const mouthAngle = aimAtMouth(mirrored(arm(atMouth), side));
  const cig = {
    kind: 'cigarette', side: work, angle: 0, scale: ease(seg(t, 0.45, 0.7)), time: t,
    burnt: seg(t, T.firstPuff, T.puffsEnd), glow: 0, depth: 0,
  };
  const lighter = { kind: 'lighter', side: support, angle: 0, scale: 0, flame: 0, time: t };
  const LIGHTER_SIZE = 1.35;
  p.hands[work] = arm(rest);
  p.hands[support] = swing(support, rest);

  if (t < T.pocket) {                                          // hand into the trouser pocket
    const k = ease(seg(t, 0, T.pocket));
    p.hands[work] = arm(lerp(rest, 0.05, k));
    p.tilt = -side * 0.05 * k;
  } else if (t < T.meet) {                                     // cigarette out, lighter out, hands meet
    const k = ease(seg(t, T.pocket, T.meet));
    p.hands[work] = arm(lerp(0.05, CIG_BELLY, k));
    p.hands[support] = swing(support, lerp(rest, LIGHTER_SWING, k));
    cig.angle = -side * HALF_PI * k;
    lighter.scale = k;
    p.tilt = -side * 0.05 * (1 - k);
  } else if (t < T.toMouth) {                                  // flick, flame, the end catches
    const flick = bump(t, T.flameOn - 0.08, T.flameOn + 0.04);
    p.hands[work] = arm(CIG_BELLY);
    p.hands[support] = swing(support, LIGHTER_SWING + 0.06 * flick);
    cig.angle = -side * HALF_PI;
    lighter.scale = 1;
    lighter.flame = ease(seg(t, T.flameOn, T.flameOn + 0.1)) * (1 - seg(t, T.flameOff - 0.1, T.flameOff));
    cig.glow = ease(seg(t, T.flameOn + 0.3, T.lit)) * (0.6 + 0.4 * bump(t, T.lit - 0.2, T.flameOff));
    p.tilt = side * 0.05 * ease(seg(t, T.meet, T.flameOn));     // leans over the flame
    p.squash = 0.02 * ease(seg(t, T.meet, T.flameOn));
  } else if (t < T.firstPuff) {                                // cigarette to the lips, lighter away
    const k = ease(seg(t, T.toMouth, T.firstPuff));
    const away = ease(seg(t, T.toMouth, T.toMouth + 0.4));
    p.hands[work] = arm(lerp(CIG_BELLY, atMouth, k));
    p.hands[support] = swing(support, lerp(LIGHTER_SWING, rest, away));
    cig.angle = side * lerp(-HALF_PI, mouthAngle, k);
    cig.glow = LIT_GLOW + 0.3 * (1 - k);
    lighter.scale = 1 - away;
    p.tilt = side * 0.05 * (1 - k);
  } else if (t < T.puffsEnd) {
    cigaretteDrag(p, cig, (t - T.firstPuff) % T.cycle, { side, arm, atMouth, mouthAngle });
  } else if (t < T.pressStart) {                               // arm out toward the viewer
    const k = ease(seg(t, T.puffsEnd, T.pressStart));
    p.hands[work] = arm(lerp(CIG_HOLD, CIG_PRESS, k));
    cig.angle = side * lerp(-0.15, 0, k);
    cig.glow = LIT_GLOW;
    p.effects.emberSmoke = 1 - k;
    p.tilt = -side * 0.08 * k;
  } else if (t < T.pressEnd) {                                 // press the butt out on the screen and grind it
    const push = ease(seg(t, T.pressStart, T.burnAt));
    const grind = seg(t, T.burnAt + 0.05, T.flickAt) > 0 && t < T.flickAt ? Math.sin((t - T.burnAt) * 32) : 0;
    p.hands[work] = arm(CIG_PRESS + 0.04 * grind);
    cig.depth = push;
    cig.angle = side * 0.25 * grind;
    cig.glow = t < T.burnAt ? LIT_GLOW : 0;
    cig.scale = 1 - ease(seg(t, T.flickAt, T.flickAt + 0.12));
    p.tilt = -side * (0.08 + 0.06 * push) + 0.015 * grind;
    p.shift.x = side * 3 * push;
    p.squash = 0.03 * bump(t, T.burnAt - 0.05, T.burnAt + 0.2);
  } else {                                                     // done: arm back, a satisfied shake
    const k = ease(seg(t, T.pressEnd, T.pressEnd + 0.5));
    cig.scale = 0;                                             // the butt was flicked away
    p.hands[work] = arm(lerp(CIG_PRESS, rest, k));
    p.tilt = -side * 0.14 * (1 - k) + Math.sin(t * 9) * 0.02 * bump(t, T.pressEnd + 0.3, T.end);
    p.shift.x = side * 3 * (1 - k);
  }
  p.prop = t >= 0.45 && cig.scale > 0.01 ? cig : null;
  p.prop2 = lighter.scale > 0.01 ? { ...lighter, scale: lighter.scale * LIGHTER_SIZE } : null;
  return p;
}

/** One drag, `u` = time since it started: inhale at the lips (ember flares), lower the hand, blow the smoke out. */
function cigaretteDrag(p, cig, u, { side, arm, atMouth, mouthAngle }) {
  const T = SMOKE;
  if (u < T.inhaleEnd) {
    const k = ease(seg(u, 0, T.inhaleEnd));
    p.hands[cig.side] = arm(atMouth - 0.03 * k);
    cig.angle = side * mouthAngle;
    cig.glow = lerp(LIT_GLOW, 1, ease(seg(u, 0, 0.3)));
    p.squash = -0.025 * k;                                     // chest fills
    p.shift.y = 1.2 * k;
    p.tilt = -side * 0.03 * k;
    return;
  }
  const k = ease(seg(u, T.inhaleEnd, T.lowerEnd));
  p.hands[cig.side] = arm(lerp(atMouth, CIG_HOLD, k));
  cig.angle = side * lerp(mouthAngle, -0.15, k);
  cig.glow = lerp(1, LIT_GLOW, k);
  p.squash = -0.025 * (1 - k);
  p.shift.y = 1.2 * (1 - ease(seg(u, T.lowerEnd, T.lowerEnd + 0.4)));
  p.face.mouthOpen = 0.32 * bump(u, T.exhaleAt - 0.1, T.exhaleAt + 0.6);
  p.tilt = side * 0.05 * bump(u, T.exhaleAt - 0.1, T.exhaleAt + 0.7);   // head back while blowing
  p.effects.emberSmoke = ease(seg(u, T.lowerEnd, T.lowerEnd + 0.3));
}

// MARK: Hookah

export const HOOKAH = (() => {
  const tl = {
    place: 0.8, sitEnd: 1.4, grab: 1.75, firstPuff: 2.0, cycle: 3.8, puffs: 4,
    raiseEnd: 0.5, inhaleEnd: 2.0, lowerEnd: 2.5, exhaleAt: 2.35, cloudLife: HOOKAH_SMOKE_LIFETIME,
    /** Hookah distance from the mascot's centre line, sprite units. */
    distance: 72,
  };
  tl.puffsEnd = tl.firstPuff + tl.puffs * tl.cycle;
  tl.putDown = tl.puffsEnd + 0.5;
  tl.standEnd = tl.putDown + 0.6;
  tl.packEnd = tl.standEnd + 0.6;
  tl.end = tl.packEnd + 0.4;
  return tl;
})();

const PIPE_HOLD = 0.62;        // mouthpiece held low beside the knee between pulls

export function hookah(t, side, base) {
  const T = HOOKAH, p = newPose(base);
  const work = Side.fromSign(side), support = Side.other(work), rest = MascotRig.restSwing;
  const arm = (a) => swing(work, a);
  const atMouth = mouthSwing('mouthpiece');
  const mouthAngle = aimAtMouth(mirrored(arm(atMouth), side));
  const pipe = { kind: 'mouthpiece', side: work, angle: side * 0.1, scale: ease(seg(t, T.sitEnd, T.grab)) * (1 - ease(seg(t, T.putDown - 0.3, T.putDown))) };
  const fx = {
    side, scale: easeOutBack(seg(t, 0.15, T.place)) * (1 - ease(seg(t, T.standEnd, T.packEnd))),
    glow: 0.35, bubbles: 0, time: t, distance: T.distance,
  };

  // sitting down cross-legged next to it, like `sit`
  const s = ease(seg(t, T.place, T.sitEnd)) - ease(seg(t, T.putDown, T.standEnd));
  const thud = bump(t, T.sitEnd - 0.1, T.sitEnd + 0.25) * 0.04;
  p.shift.y = -21 * s - thud * 10;
  p.squash = 0.04 * s + thud;
  for (const sd of Side.both) p.feet[sd] = newFoot(Side.sign(sd) * 17 * s, 16 * s, 0.55 * s);
  p.hands[support] = swing(support, rest + 0.45 * s);

  if (t < T.place) {                                           // reaches down and sets the hookah on the floor
    p.hands[work] = arm(lerp(rest, 0.8, bump(t, 0, T.place)));
    p.tilt = -side * 0.12 * bump(t, 0, T.place);
  } else if (t < T.firstPuff) {                                // grabs the mouthpiece
    p.hands[work] = arm(lerp(rest + 0.45, PIPE_HOLD, ease(seg(t, T.sitEnd, T.grab))));
  } else if (t < T.puffsEnd) {
    hookahPull(p, pipe, fx, (t - T.firstPuff) % T.cycle, { side, arm, atMouth, mouthAngle });
  } else {                                                     // puts the mouthpiece down and gets up
    p.hands[work] = arm(lerp(PIPE_HOLD, rest, ease(seg(t, T.puffsEnd, T.putDown))));
    fx.glow = 0.35 * (1 - seg(t, T.puffsEnd, T.packEnd));
  }
  p.tilt += Math.sin(t * 1.3) * 0.012 * s;
  p.prop = pipe.scale > 0.01 ? pipe : null;
  p.effects.hookah = fx.scale > 0.01 ? fx : null;
  return p;
}

/** One pull, `u` = time since it started: mouthpiece up, long inhale (water bubbles, coals flare), exhale a cloud. */
function hookahPull(p, pipe, fx, u, { side, arm, atMouth, mouthAngle }) {
  const T = HOOKAH;
  const up = ease(seg(u, 0, T.raiseEnd)) * (1 - ease(seg(u, T.inhaleEnd, T.lowerEnd)));
  p.hands[pipe.side] = arm(lerp(PIPE_HOLD, atMouth, up));
  pipe.angle = side * lerp(0.1, mouthAngle, up);
  const inhale = u >= T.raiseEnd && u < T.inhaleEnd ? 1 : 0;
  const deep = ease(seg(u, T.raiseEnd, T.inhaleEnd)) * (1 - ease(seg(u, T.inhaleEnd, T.lowerEnd + 0.2)));
  fx.bubbles = inhale;
  fx.glow = 0.35 + 0.65 * deep;
  p.squash -= 0.035 * deep;                                    // chest swells
  p.shift.y += 1.5 * deep;
  p.face.mouthOpen = 0.38 * bump(u, T.exhaleAt - 0.1, T.exhaleAt + 0.9);
  p.tilt = side * 0.08 * bump(u, T.exhaleAt - 0.15, T.exhaleAt + 1.0) - side * 0.03 * deep;   // chin up to blow
}
