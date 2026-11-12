// The runaway «Выйти» button: pure movement rules, no DOM. The page feeds it the cursor, the clock and the area.
// For the first PANIC_SECONDS it teleports away before the cursor can reach it and refuses clicks; then it gets
// tired and only drifts away, slower and slower, until it can be caught.

/** Seconds the button cannot be caught at all. */
export const PANIC_SECONDS = 15;
/** While panicking, the button jumps once the cursor comes this close to its centre (px). */
export const PANIC_RADIUS = 150;
/** A jump lands at least this far from the cursor (px), when the area is big enough for it. */
export const JUMP_MIN_DISTANCE = 320;
/** Once tired, it drifts away only while the cursor is this close to its centre (px). */
export const TIRED_RADIUS = 170;
/** Drift speed right after the panic ends and the floor it slows down to (px/s). */
export const TIRED_SPEED = { start: 900, floor: 70 };
/** Seconds for the drift speed to fall by e (about 2.7 times). */
export const TIRED_DECAY_SECONDS = 5;
const JUMP_TRIES = 24;

export const phaseAt = (elapsed) => (elapsed < PANIC_SECONDS ? 'panic' : 'tired');
export const canBeClicked = (elapsed) => phaseAt(elapsed) === 'tired';

/** Drift speed (px/s) `elapsed` seconds after the button appeared; 0 while it is still panicking. */
export function tiredSpeed(elapsed) {
  if (elapsed < PANIC_SECONDS) return 0;
  const t = elapsed - PANIC_SECONDS;
  return Math.max(TIRED_SPEED.floor, TIRED_SPEED.start * Math.exp(-t / TIRED_DECAY_SECONDS));
}

const clampTo = (area, size, p) => ({
  x: Math.min(Math.max(p.x, area.x + size.w / 2), area.x + area.w - size.w / 2),
  y: Math.min(Math.max(p.y, area.y + size.h / 2), area.y + area.h - size.h / 2),
});

/** A random centre for the button inside `area`, as far from `cursor` as a few tries can find. */
export function jumpTarget(area, size, cursor, random = Math.random) {
  let best = null, bestDistance = -1;
  for (let i = 0; i < JUMP_TRIES; i++) {
    const p = clampTo(area, size, { x: area.x + random() * area.w, y: area.y + random() * area.h });
    const d = Math.hypot(p.x - cursor.x, p.y - cursor.y);
    if (d >= JUMP_MIN_DISTANCE) return p;
    if (d > bestDistance) { best = p; bestDistance = d; }
  }
  return best;
}

/**
 * The button's next centre.
 * @param s {{ center, size: {w,h}, area: {x,y,w,h}, cursor, elapsed, dt }} all in page px, y down
 * @returns {{ center, jumped: boolean }}
 */
export function step({ center, size, area, cursor, elapsed, dt }, random = Math.random) {
  const dx = center.x - cursor.x, dy = center.y - cursor.y;
  const distance = Math.hypot(dx, dy);
  if (phaseAt(elapsed) === 'panic') {
    if (distance > PANIC_RADIUS) return { center, jumped: false };
    return { center: jumpTarget(area, size, cursor, random), jumped: true };
  }
  if (distance > TIRED_RADIUS) return { center, jumped: false };
  // away from the cursor; straight sideways when the cursor sits exactly on the centre
  const ux = distance > 0.5 ? dx / distance : 1, uy = distance > 0.5 ? dy / distance : 0;
  const move = tiredSpeed(elapsed) * dt;
  let next = clampTo(area, size, { x: center.x + ux * move, y: center.y + uy * move });
  // cornered: slide along the wall that stopped it instead of sticking
  if (Math.hypot(next.x - center.x, next.y - center.y) < move * 0.2) {
    next = clampTo(area, size, { x: center.x - uy * move, y: center.y + ux * move });
  }
  return { center: next, jumped: false };
}
