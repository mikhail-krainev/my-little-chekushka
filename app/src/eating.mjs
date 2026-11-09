// Floor scenes with food. Pure functions: time in, pose out.
//  burger: takes a burger out, bites, is delighted, turns it in his hand to show how good it is, bites again, done.
//  pizza:  opens a pizza box on the floor, takes a slice, tries to bite it three times but it is hard as plastic,
//          gets furious, puts it back, shuts the box and throws the whole thing away.
import { MascotRig, Side, lerp } from './geometry.mjs';
import { aimAtMouth, bump, ease, easeOutBack, mouthSwing, seg, swing } from './motion.mjs';
import { mirrored, newFoot, newPose } from './pose.mjs';

export const BURGER_SCENE = (() => {
  const tl = { pull: 0.5, show: 1.3, raise: 1.8, bite: 2.0, chewEnd: 3.4 };
  tl.brag = tl.chewEnd;                       // the delighted phrase
  tl.joyEnd = tl.brag + 1.4;
  tl.twirlEnd = tl.joyEnd + 2.6;
  tl.raise2 = tl.twirlEnd + 0.5;
  tl.bite2 = tl.raise2 + 0.2;
  tl.lowerEnd = tl.bite2 + 0.6;
  tl.gone = tl.lowerEnd + 0.3;
  tl.end = tl.gone + 0.5;
  return tl;
})();

export const PIZZA_SCENE = (() => {
  const tl = { place: 0.6, open: 1.3, take: 1.9, raise: 2.4, tries: 3, tryTime: 0.8 };
  tl.triesEnd = tl.raise + tl.tries * tl.tryTime;
  tl.puzzled = tl.triesEnd + 0.6;
  tl.rage = tl.puzzled;                       // the angry phrase
  tl.rageEnd = tl.rage + 1.5;
  tl.putBack = tl.rageEnd + 0.5;
  tl.shut = tl.putBack + 0.3;
  tl.pickUp = tl.shut + 0.4;
  tl.windupEnd = tl.pickUp + 0.6;
  tl.release = tl.windupEnd + 0.22;           // the box leaves the hand
  tl.end = tl.release + 1.1;
  /** Box distance from the mascot's centre line, sprite units. */
  tl.distance = 84;
  return tl;
})();

const HOLD = 1.1;              // food held out beside the body
const SHOW = 1.45;             // arm stretched toward the viewer to show it off

// MARK: Burger

export function burger(t, side, base) {
  const T = BURGER_SCENE, p = newPose(base);
  const work = Side.fromSign(side), support = Side.other(work), rest = MascotRig.restSwing;
  const arm = (a) => swing(work, a);
  const atMouth = mouthSwing('burger');
  const mouthAngle = aimAtMouth(mirrored(arm(atMouth), side));
  const food = { kind: 'burger', side: work, angle: 0, bites: 0, spin: 0, scale: ease(seg(t, T.pull - 0.1, T.pull + 0.15)) * (1 - ease(seg(t, T.lowerEnd, T.gone))) };
  food.bites = t >= T.bite2 ? 2 : t >= T.bite ? 1 : 0;
  p.hands[support] = swing(support, rest);

  if (t < T.pull) {                                            // out of the pocket
    p.hands[work] = arm(lerp(rest, 0.8, ease(seg(t, 0, T.pull))));
  } else if (t < T.show) {                                     // holds it up and looks at it
    const k = ease(seg(t, T.pull, T.show));
    p.hands[work] = arm(lerp(0.8, HOLD + 0.2, k));
    p.tilt = side * 0.05 * k;
  } else if (t < T.chewEnd) {                                  // big bite, then chewing
    biteAndChew(p, food, t - T.show, { side, arm, atMouth, mouthAngle, from: HOLD + 0.2, bite: T.bite - T.show });
  } else if (t < T.joyEnd) {                                   // delighted: hops, pumps the free fist
    const k = t - T.brag;
    p.hands[work] = arm(lerp(HOLD, 1.9, ease(seg(k, 0, 0.3))));
    p.hands[support] = swing(support, 2.5 + 0.3 * Math.sin(k * 16));
    p.shift.y = 9 * Math.abs(Math.sin(k * 7)) * (1 - seg(k, 1.1, 1.4));
    p.squash = -0.03 * Math.abs(Math.sin(k * 7));
    p.face.mouthOpen = 0.35;
  } else if (t < T.twirlEnd) {                                 // turns the burger round toward the viewer
    const k = t - T.joyEnd;
    p.hands[work] = arm(lerp(1.9, SHOW, ease(seg(k, 0, 0.35))));
    food.depth = 0.45 * ease(seg(k, 0, 0.35));
    food.spin = Math.max(0, k - 0.3) * 5.5;
    food.angle = side * 0.12 * Math.sin(k * 3);
    p.hands[support] = swing(support, 2.0 + 0.05 * Math.sin(k * 9));     // thumbs up
    p.tilt = -side * 0.05 + Math.sin(k * 2.5) * 0.03;
    p.shift.y = 1.5 * Math.abs(Math.sin(k * 5));
  } else if (t < T.lowerEnd) {                                 // one more bite
    biteAndChew(p, food, t - T.twirlEnd, { side, arm, atMouth, mouthAngle, from: SHOW, bite: T.bite2 - T.twirlEnd });
  } else {                                                     // finished: pats the belly
    const k = ease(seg(t, T.lowerEnd, T.end));
    p.hands[work] = arm(lerp(HOLD, rest, k));
    p.hands[support] = swing(support, lerp(rest, -0.6 + 0.08 * Math.sin(t * 18), bump(t, T.lowerEnd, T.end)));
    p.squash = -0.02 * bump(t, T.lowerEnd, T.end);
  }
  p.prop = food.scale > 0.01 ? food : null;
  return p;
}

/** Raises the food to the mouth from arm angle `from`, chomps at `bite`, lowers it and chews. `u` = scene time. */
function biteAndChew(p, food, u, { side, arm, atMouth, mouthAngle, from, bite }) {
  const up = ease(seg(u, 0, bite)) * (1 - ease(seg(u, bite + 0.15, bite + 0.5)));
  p.hands[food.side] = arm(lerp(lerp(from, HOLD, seg(u, bite, bite + 0.5)), atMouth, up));
  food.angle = side * lerp(0, mouthAngle, up);
  food.depth = 0;
  p.face.mouthOpen = 0.9 * bump(u, bite - 0.25, bite) + 0.3 * Math.abs(Math.sin(u * 14)) * seg(u, bite + 0.2, bite + 0.3);
  p.squash = 0.03 * bump(u, bite, bite + 0.12) + 0.012 * Math.sin(u * 14) * seg(u, bite + 0.2, bite + 0.3);
  p.tilt = side * 0.06 * up + Math.sin(u * 7) * 0.02 * seg(u, bite, bite + 0.3);
}

// MARK: Pizza

export function pizza(t, side, base) {
  const T = PIZZA_SCENE, p = newPose(base);
  const work = Side.fromSign(side), support = Side.other(work), rest = MascotRig.restSwing;
  const arm = (a) => swing(work, a);
  const atMouth = mouthSwing('pizzaSlice');
  const mouthAngle = aimAtMouth(mirrored(arm(atMouth), side));
  const box = {
    side, distance: T.distance, time: t,
    scale: easeOutBack(seg(t, 0.1, T.place)) * (t < T.pickUp ? 1 : 0),
    lid: ease(seg(t, T.place, T.open)) * (1 - ease(seg(t, T.putBack, T.shut))),
    taken: t >= T.take - 0.3 && t < T.putBack ? 1 : 0,
  };
  const slice = { kind: 'pizzaSlice', side: work, angle: 0, scale: t >= T.take - 0.3 && t < T.putBack ? 1 : 0 };
  const held = { kind: 'pizzaBox', side: work, angle: 0, scale: t >= T.pickUp && t < T.release ? 1 : 0 };
  p.hands[support] = swing(support, rest);
  const reachDown = (k) => { p.hands[work] = arm(lerp(rest, 0.75, k)); p.tilt = -side * 0.16 * k; p.squash = 0.06 * k; };

  if (t < T.open) {                                            // sets the box down and lifts the lid
    reachDown(bump(t, 0, T.place) + (t >= T.place ? bump(t, T.place, T.open) * 0.8 : 0));
  } else if (t < T.take) {                                     // takes a slice
    reachDown(bump(t, T.open, T.take));
  } else if (t < T.raise) {
    p.hands[work] = arm(lerp(rest + 0.3, HOLD, ease(seg(t, T.take, T.raise))));
  } else if (t < T.triesEnd) {                                 // bites that do not go in
    const n = Math.floor((t - T.raise) / T.tryTime);
    tryToBite(p, slice, (t - T.raise) - n * T.tryTime, { side, arm, atMouth, mouthAngle });
  } else if (t < T.puzzled) {                                  // looks at it: what is this?
    const k = seg(t, T.triesEnd, T.puzzled);
    p.hands[work] = arm(lerp(HOLD + 0.2, SHOW, ease(k)));
    slice.angle = side * 0.25 * Math.sin(k * 9);
    p.tilt = side * 0.12 * ease(k);
    p.effects.sweat = 0.6;
  } else if (t < T.rageEnd) {                                  // furious: stamps, shakes it over his head
    const k = t - T.rage;
    p.hands[work] = arm(2.4 + 0.25 * Math.sin(k * 20));
    slice.angle = side * (0.3 * Math.sin(k * 20));
    p.hands[support] = swing(support, 2.3 + 0.25 * Math.sin(k * 20 + Math.PI));
    for (const s of Side.both) p.feet[s] = newFoot(0, Math.max(0, Side.sign(s) * Math.sin(k * 9)) * 8, 0.2);
    p.shift.y = 2 * Math.abs(Math.sin(k * 9));
    p.tilt = Math.sin(k * 18) * 0.05;
    p.face.mouthOpen = 0.5;
  } else if (t < T.pickUp) {                                   // slice back in, lid shut
    reachDown(bump(t, T.rageEnd, T.pickUp));
  } else if (t < T.windupEnd) {                                // box up over the head
    const k = ease(seg(t, T.pickUp, T.windupEnd));
    p.hands[work] = arm(lerp(0.75, 2.8, k));
    held.angle = side * lerp(0, 0.6, k);
    p.tilt = side * 0.15 * k;
  } else if (t < T.release) {                                  // and away
    const k = ease(seg(t, T.windupEnd, T.release));
    p.hands[work] = arm(lerp(2.8, 1.4, k));
    held.angle = side * lerp(0.6, -0.8, k);
    p.tilt = side * lerp(0.15, -0.18, k);
  } else {                                                     // dusts off his hands, still huffing
    const k = seg(t, T.release, T.end);
    p.hands[work] = arm(lerp(1.4, rest, ease(seg(k, 0, 0.4))));
    p.hands[support] = swing(support, rest + 0.3 * bump(k, 0.3, 0.9));
    p.effects.puff = bump(k, 0.2, 0.8) * 0.6;
    p.effects.puffSide = side;
    p.tilt = side * lerp(-0.18, 0, ease(seg(k, 0, 0.4)));
  }
  p.prop = slice.scale > 0 ? slice : held.scale > 0 ? held : null;
  p.effects.pizzaBox = box.scale > 0.01 ? box : null;
  return p;
}

/** One bite attempt, `u` = time since it started: in to the mouth, teeth clamp and tug, the slice does not give. */
function tryToBite(p, slice, u, { side, arm, atMouth, mouthAngle }) {
  const T = PIZZA_SCENE;
  const up = ease(seg(u, 0, 0.22)) * (1 - ease(seg(u, T.tryTime - 0.18, T.tryTime)));
  const tug = seg(u, 0.25, T.tryTime - 0.18) > 0 && u < T.tryTime - 0.18 ? 1 : 0;
  p.hands[slice.side] = arm(lerp(HOLD, atMouth, up) - 0.06 * tug * Math.abs(Math.sin(u * 40)));
  slice.angle = side * (lerp(0, mouthAngle, up) + 0.05 * tug * Math.sin(u * 45));
  p.face.mouthOpen = 0.8 * bump(u, 0.05, 0.25) + 0.2 * tug;
  p.tilt = -side * 0.08 * tug + Math.sin(u * 50) * 0.02 * tug;        // head pulls away, the slice stays whole
  p.squash = 0.025 * tug * Math.abs(Math.sin(u * 30));
  p.effects.sweat = Math.min(1, 0.3 + 0.7 * tug);
}
