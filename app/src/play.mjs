// Timings and poses for the slot cabinet and the inflatable ring. Positions are in y-up sprite units.
import { Config, MascotRig, Side, clamp, lerp } from './geometry.mjs';
import { bump, ease, seg, swing } from './motion.mjs';
import { blendPoses, newFoot, newPose } from './pose.mjs';

export const CABINET_X = 137;
export const CABINET_WIDTH = 88;
export const CABINET_HEIGHT = 167;
const CABINET_FLIGHT = 216;
const CABINET_MIN_FLIGHT = 68;
const CABINET_DEBRIS_REACH = 157;
export const SLOT_RUNUP = 100;
const CABINET_REACH = CABINET_X + CABINET_WIDTH / 2 + CABINET_DEBRIS_REACH - MascotRig.centerX;
export const SLOT_REACH = CABINET_REACH + CABINET_FLIGHT;
const LEVER_PULL = 0.38;
export const FLOAT = { catches: [1.03, 1.91], on: 2.96, run: 3.43, settle: 14.43, end: 15.58, radius: 70 };
export const FLOAT_STRIDE = 21;
const FLOAT_SPEED = { x: 435, y: 290 };
const WALL_RECOIL = 0.24;

export const IDLE_SYMBOLS = [2, 1, 3];
const ROUNDS = {
  slotsWin: { symbols: [0, 0, 0], hold: 2.3, win: true },
  slotsWinAgain: { symbols: [1, 1, 1], hold: 2.55, win: true },
  slotsLoss: { symbols: [2, 2, 1], hold: 1.8, win: false },
  slotsBroke: { symbols: [1, 3, 2], hold: 2.95, win: false },
};
const SPIN_TIME = 1.38;

export function slotTimeline(wins) {
  const order = ['slotsWin', ...(wins === 2 ? ['slotsWinAgain'] : []), 'slotsLoss', 'slotsBroke'];
  let next = 0.75;
  let previous = IDLE_SYMBOLS;
  const rounds = order.map((type) => {
    const spin = next + LEVER_PULL;
    const stop = spin + SPIN_TIME;
    next = stop + ROUNDS[type].hold;
    const round = { ...ROUNDS[type], type, previous, pull: spin - LEVER_PULL, spin, stop };
    previous = round.symbols;
    return round;
  });
  const charge = next + 0.36;
  const takeoff = charge + 0.61, hit = takeoff + 0.34, land = hit + 0.91;
  return {
    rounds, stand: rounds.at(-1).stop + 1.35, backUp: charge - 0.89, charge, takeoff,
    shout: takeoff - 0.36, hit, land, end: land + 2.4,
  };
}

export function slotPlacement(pos, work, side) {
  const half = Config.mascotSize.width / 2;
  const centre = pos.x + half;
  const width = work.maxX - work.minX;
  const runwayRoom = CABINET_REACH + CABINET_MIN_FLIGHT + MascotRig.centerX;
  const runup = clamp(width / Config.spriteScale - runwayRoom, 34, SLOT_RUNUP);
  const flight = clamp(width / Config.spriteScale - runup - MascotRig.centerX - CABINET_REACH, CABINET_MIN_FLIGHT, CABINET_FLIGHT);
  const reach = (CABINET_REACH + flight) * Config.spriteScale;
  const runway = (runup + MascotRig.centerX) * Config.spriteScale;
  const range = (dir) => dir > 0 ? [work.minX + runway, work.maxX - reach] : [work.minX + reach, work.maxX - runway];
  const nearest = (dir) => {
    const [left, right] = range(dir);
    return left <= right ? clamp(centre, left, right) : (left + right) / 2;
  };
  if (Math.abs(nearest(-side) - centre) < Math.abs(nearest(side) - centre)) side = -side;
  return { x: nearest(side) - half, side, runup, flight };
}

function leverMotion(t, round) {
  if (!round) return { pull: 0, grip: 0 };
  const { pull, spin } = round;
  const load = 0.23 * ease(seg(t, pull, spin - 0.16));
  const yank = 0.77 * ease(seg(t, spin - 0.16, spin));
  const recovery = seg(t, spin, spin + 0.3);
  return {
    pull: (load + yank) * (1 - ease(recovery)) + 0.16 * Math.sin(recovery * 4 * Math.PI) * (1 - recovery) ** 2,
    grip: ease(seg(t, pull - 0.24, pull + 0.04)) * (1 - ease(seg(t, spin, spin + 0.12))),
  };
}

function slotPlayer(t, { rounds, stand }, side, base) {
  const p = newPose(base);
  const front = Side.fromSign(side), back = Side.other(front);
  const round = rounds.findLast(({ pull }) => t >= pull);
  const lever = leverMotion(t, rounds.find(({ pull, spin }) => t >= pull - 0.24 && t < spin + 0.30));
  const { pull, grip } = lever;
  const seated = ease(seg(t, 0.08, 0.63)) * (1 - ease(seg(t, stand, stand + 0.52)));
  const cheer = round?.win ? bump(t, round.stop, round.stop + 0.68) : 0;
  const slump = round && !round.win ? bump(t, round.stop, round.stop + 1.2) : 0;
  const rise = bump(t, stand, stand + 0.6);
  p.shift = { x: side * (4 * seated + 3 * pull * grip),
    y: -9 * seated + 14 * cheer - 5 * slump - 6 * rise - 3 * pull * grip };
  p.squash = 0.068 * seated + 0.06 * slump - 0.05 * cheer + 0.09 * rise;
  p.tilt = side * (-0.04 * pull * grip - 0.075 * slump - 0.07 * rise);
  p.face.mouthOpen = 0.65 * cheer;
  p.hands[front] = swing(front, lerp(0.47, 2.65 - 0.49 * pull, grip) + 2.3 * cheer + 0.65 * rise);
  p.hands[back] = swing(back, 0.3 + 2.4 * cheer + 0.35 * rise);
  for (const foot of Side.both) {
    p.feet[foot] = newFoot(18 * side * seated + Side.sign(foot) * 6 * seated, 14 * seated + 5 * cheer, 0.42 * seated);
  }
  return { pose: p, round, pull, grip };
}

function slotFootwork(t, { backUp, charge, takeoff }, side, runup, base, walk) {
  const backing = t < charge;
  const k = backing ? seg(t, backUp, charge) : seg(t, charge, takeoff);
  const phase = k * (backing ? Math.PI * 4 : Math.PI * 5);
  const stride = bump(k, 0, 1) ** 0.55;
  const p = blendPoses(newPose(base), walk(phase, backing ? -side : side, !backing, base), stride);
  const distance = backing ? -runup * ease(k) : lerp(-runup, -34, k ** 1.55);
  const brace = ease(seg(k, 0.72, 1)) * (backing ? 0 : 1);
  p.shift.x = side * distance;
  p.squash += 0.15 * brace;
  p.shift.y -= 4 * brace;
  return p;
}

function slotKick(t, { takeoff, hit, land }, side, base) {
  const p = newPose(base);
  const airborne = t < hit;
  const touchdown = hit + 0.46;
  const k = airborne ? seg(t, takeoff, hit) : seg(t, hit, touchdown);
  const extension = airborne ? ease(seg(k, 0.13, 1)) : 1 - ease(seg(k, 0.03, 0.84));
  const recoil = airborne ? 0 : 1 - (1 - k) ** 2;
  const settle = airborne ? 0 : ease(seg(t, touchdown + 0.24, land + 0.86));
  const impactX = 12;
  p.pivot = { x: MascotRig.centerX, y: 85 };
  p.shift.x = side * (airborne ? lerp(-34, impactX, k) : lerp(lerp(impactX, -51, recoil), 0, settle));
  p.shift.y = airborne ? lerp(-4, 5, k) + 27 * Math.sin(k * Math.PI) : 5 * (1 - k) + 21 * Math.sin(k * Math.PI);
  p.tilt = side * (1.52 * extension + 0.17 * bump(t, touchdown - 0.14, touchdown + 0.24));
  p.squash = 0.15 * (1 - ease(seg(k, 0, 0.29))) * (airborne ? 1 : 0) + 0.17 * bump(t, touchdown - 0.04, touchdown + 0.24);
  p.face.mouthOpen = 0.8 * extension;
  for (const foot of Side.both) {
    p.feet[foot] = newFoot((side * 3 - 8 * Side.sign(foot)) * extension,
      (foot === Side.fromSign(side) ? -4 : 1) * extension, 0.52 * extension);
    p.hands[foot] = swing(foot, 0.32 + 1.15 * extension + 0.5 * bump(k, 0, 0.55));
  }
  return p;
}

function cabinetMotion(t, { hit, land }, flight) {
  const progress = seg(t, hit, land);
  const angle = 1.68 * progress;
  const airGap = 4 * 78 * progress * (1 - progress);
  const support = (CABINET_WIDTH * Math.abs(Math.sin(angle)) + CABINET_HEIGHT * Math.abs(Math.cos(angle))) / 2;
  return {
    recoil: t - hit, broken: t >= hit, shattered: t >= land, crash: t - land,
    angle, airGap, centreY: support + airGap, travel: flight * progress,
  };
}

export function slots(t, perf, base, walk) {
  const { side, slots: timeline, runup = SLOT_RUNUP, flight = CABINET_FLIGHT } = perf;
  const { pose, round, pull, grip } = slotPlayer(t, timeline, side, base);
  const p = t < timeline.backUp ? pose : t < timeline.takeoff
    ? slotFootwork(t, timeline, side, runup, base, walk) : slotKick(t, timeline, side, base);
  p.effects.slots = {
    side, round, time: t, pull, grip, ...cabinetMotion(t, timeline, flight),
    shadowX: p.shift.x, shadowHeight: Math.max(0, p.shift.y),
    opacity: ease(seg(t, 0, 0.26)) * (1 - ease(seg(t, timeline.end - 0.62, timeline.end))),
  };
  return p;
}

export function floatPose(t, dir, base, motion, runPose) {
  const running = t >= FLOAT.run && t < FLOAT.settle;
  const p = running ? runPose : newPose(base);
  const [firstCatch, secondCatch] = FLOAT.catches;
  const raise = ease(seg(t, 0.12, 0.70));
  const firstPull = bump(t, firstCatch - 0.06, firstCatch + 0.42);
  const secondPull = bump(t, secondCatch - 0.08, secondCatch + 0.52);
  const stuck = firstPull + secondPull;
  const duck = ease(seg(t, 0.77, 1.14)) * (1 - ease(seg(t, 2.12, 2.76)));
  const snap = bump(t, FLOAT.on - 0.18, FLOAT.on + 0.2);
  const off = ease(seg(t, FLOAT.end - 0.53, FLOAT.end));
  const impact = 1 - ease(seg(t - (motion?.impactAt ?? -Infinity), 0, WALL_RECOIL));
  const hitX = (motion?.hitX ?? 0) * impact;
  const hitY = (motion?.hitY ?? 0) * impact;
  p.squash += impact * 0.12 + 0.07 * duck + 0.07 * stuck;
  p.tilt += hitX * 0.19 + dir * (0.06 * raise * (1 - duck) * (1 - ease(seg(t, 2.6, FLOAT.on)))
    + 0.15 * (firstPull - secondPull));
  p.shift.x += dir * 3 * (firstPull - secondPull) - hitX * 5;
  p.shift.y += -hitY * 5 - 8 * duck + 8 * snap;
  p.face.mouthOpen = 0.36 * stuck;
  const overHead = ease(seg(t, 0.78, 1.08));
  const overShoulders = ease(seg(t, 1.44, 1.99));
  const toWaist = ease(seg(t, 2.42, FLOAT.on));
  const grip = 0.95 + 1.61 * raise - 0.42 * overHead - 0.46 * overShoulders - 0.63 * toWaist
    + 0.13 * stuck + 0.24 * impact - 0.61 * off;
  const front = Side.fromSign(dir), back = Side.other(front);
  p.hands[front] = swing(front, grip + 0.16 * (firstPull - secondPull));
  p.hands[back] = swing(back, grip - 0.16 * (firstPull - secondPull));

  const height = 86 + 88 * raise - 47 * overHead - 41 * overShoulders - 29 * toWaist;
  p.effects.float = {
    x: dir * (42 * (1 - raise) + 3 * (firstPull - secondPull)),
    y: height - 3 * stuck - 6 * snap - 28 * off + (running ? 2 * Math.sin(t * FLOAT_STRIDE) : 0),
    spin: dir * (0.59 * (1 - raise) + 0.18 * (secondPull - firstPull)) + hitX * 0.15
      + (running ? dir * 0.055 * Math.sin(t * FLOAT_STRIDE) : 0),
    sx: 1 - 0.33 * (1 - raise) + 0.17 * stuck - 0.11 * snap - Math.abs(hitX) * 0.19 + Math.abs(hitY) * 0.08,
    sy: 1 - 0.27 * stuck + 0.13 * snap + Math.abs(hitX) * 0.15 - Math.abs(hitY) * 0.24,
    opacity: ease(seg(t, 0, 0.23)) * (1 - off),
    inFront: t < 0.71,
  };
  return p;
}

/** Moves the mascot in its work area; returns true on a new impact so the controller can play the sound. */
export function stepFloat(motion, pos, bounds, dt, time) {
  if (time >= FLOAT.settle) {
    motion.settleY ??= pos.y;
    pos.y = lerp(motion.settleY, bounds.minY, ease(seg(time, FLOAT.settle, FLOAT.end - 0.37)));
    return false;
  }

  // Allow for the ring's overlap beyond the mascot's nominal sprite width.
  const inset = (FLOAT.radius - MascotRig.centerX + 12) * Config.spriteScale;
  const maxX = bounds.maxX - Config.mascotSize.width;
  const left = Math.min(bounds.minX + inset, (bounds.minX + maxX) / 2);
  const right = Math.max(left, maxX - inset);
  const top = Math.max(bounds.minY, bounds.maxY - Config.mascotSize.height);
  if (time < FLOAT.run) {
    const reach = 24 * (1 - ease(seg(time, 0.12, 0.70)));
    const safeLeft = Math.min(right, left + (motion.x < 0 ? reach : 0));
    const safeRight = Math.max(safeLeft, right - (motion.x > 0 ? reach : 0));
    pos.x = clamp(pos.x, safeLeft, safeRight);
    return false;
  }
  const speed = 0.38 + 0.62 * ease(seg(time, FLOAT.run, FLOAT.run + 0.58));
  const x = pos.x + motion.x * FLOAT_SPEED.x * speed * dt;
  const y = pos.y + motion.y * FLOAT_SPEED.y * speed * dt;
  const hitX = right > left ? (x < left && motion.x < 0 ? -1 : x > right && motion.x > 0 ? 1 : 0) : 0;
  const hitY = top > bounds.minY ? (y < bounds.minY ? -1 : y > top ? 1 : 0) : 0;
  pos.x = clamp(x, left, right);
  pos.y = clamp(y, bounds.minY, top);
  if (!hitX && !hitY) return false;
  if (hitX) motion.x = -hitX;
  if (hitY) motion.y = -hitY;
  Object.assign(motion, { impactAt: time, hitX, hitY });
  return true;
}
