// Owns the mascot's life: roaming, jumping, scripted floor actions (sit, sleep, warm-up, drinking),
// drag & throw physics, reactions to system events, hanging from the cursor.
// Coordinates: y up, origin bottom-left of the screen layer. `pos` is the origin of the mascot box (sprite + margin).
import * as Animator from './animator.mjs';
import { Config, Side, clamp, rand } from './geometry.mjs';
import { newFace } from './pose.mjs';
import { handPoint, mouthPoint } from './renderer.mjs';

const SIZE = Config.mascotSize;

/** Events that make the mascot hop. */
const EXCITING = new Set(['excited', 'surprised']);

export class MascotController {
  /**
   * @param env.getScreen () => { work: {minX, minY, maxX, maxY} }  the usable screen area
   * @param env.getCursor () => {x, y}                               global cursor, y up
   * @param env.overlay   { throwBottle(kind, origin, velocity), spit(origin, target) }
   * @param env.clock     () => seconds
   */
  constructor(env) {
    this.env = env;
    this.onClick = null;
    this.state = { type: 'idle', until: 0 };
    this.pos = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.pendingPerformance = null;
    this.didThrow = false;
    this.spitTarget = null;
    this.facingRight = true;
    this.walkPhase = 0;
    this.nextBlink = 0;
    this.blinkUntil = 0;
    this.lastTick = null;
    this.swingAngle = 0;
    this.swingVelocity = 0;
    this.prevCursor = { x: 0, y: 0 };
    this.prevCursorVx = 0;
    this.grab = { x: 0, y: 0 };
    this.pose = Animator.idle(0, newFace());
    const work = env.getScreen().work;
    this.pos = { x: (work.minX + work.maxX) / 2, y: work.minY };
  }

  get now() { return this.env.clock(); }
  get dir() { return this.facingRight ? 1 : -1; }
  /** Visible sprite rect (without the transparent margin), used to hit-test and to place bubbles. y up. */
  get frame() {
    return { x: this.pos.x + Config.spritePad, y: this.pos.y + Config.spritePad, w: SIZE.width - 2 * Config.spritePad, h: SIZE.height - 2 * Config.spritePad };
  }
  get isHanging() { return this.state.type === 'hanging'; }
  get isSleeping() { return this.state.type === 'perform' && this.state.perf.kind === 'sleep'; }
  get canBeInterrupted() { return !['dragged', 'hanging', 'air'].includes(this.state.type); }

  // MARK: Outside world

  react(event) {
    if (this.isSleeping) this.state = { type: 'idle', until: this.now + 1 };
    if (this.state.type === 'idle' && EXCITING.has(event.emote)) this.#hop(this.#bounds, 0.4);
  }

  /** Starts a floor action now (menu / debugging); walks down to the floor first if needed. */
  trigger(kind) {
    if (!this.canBeInterrupted) return;
    this.#schedule(Animator.makePerformance(kind, { side: this.dir }));
  }

  wakeAndStare() {
    if (this.isSleeping) this.state = { type: 'idle', until: this.now + 1 };
  }

  // MARK: Mouse (called by the app)

  hoverChanged(inside) {
    if (inside && this.isSleeping) this.wakeAndStare();
  }

  clicked() {
    this.wakeAndStare();
    this.onClick?.();
  }

  dragBegan(cursor) {
    this.grab = { x: cursor.x - this.pos.x, y: cursor.y - this.pos.y };
    this.pendingPerformance = null;
    this.state = { type: 'dragged' };
  }

  dragMoved(cursor) {
    this.pos = { x: cursor.x - this.grab.x, y: cursor.y - this.grab.y };
  }

  dragEnded(v) {
    const cap = Config.throwVelocityCap;
    this.vel = { x: clamp(v.x, -cap, cap), y: clamp(v.y, -cap, cap) };
    this.state = { type: 'air' };
  }

  // MARK: Simulation

  get #bounds() {
    // Window origins may go `spritePad` past the screen edge: the margin is transparent.
    const w = this.env.getScreen().work, pad = Config.spritePad;
    return { minX: w.minX - pad, minY: w.minY - pad, maxX: w.maxX + pad, maxY: w.maxY + pad };
  }

  /** Advances the simulation to the current clock time and returns the pose to draw. */
  tick() {
    const t = this.now;
    const dt = this.lastTick === null ? 0 : Math.min(t - this.lastTick, 0.05);
    this.lastTick = t;
    const b = this.#bounds;
    const maxX = b.maxX - SIZE.width, ground = b.minY;
    const base = newFace();
    const clock = t % 10000;
    const st = this.state;
    let pose;

    switch (st.type) {
      case 'idle':
        pose = Animator.idle(clock, base);
        if (t > st.until) this.#pickNext(b);
        break;
      case 'walk': {
        this.walkPhase += dt * (st.run ? 14 : 8);
        const arrived = this.#stepToward(st.to, st.run ? Config.runSpeed : Config.walkSpeed, dt);
        pose = Animator.walk(this.walkPhase, this.dir, st.run, base);
        if (arrived || t > st.until) this.#finishMove(rand(0.5, 2.5));
        break;
      }
      case 'perform': {
        const el = t - st.start;
        pose = Animator.performance(st.perf, el, base);
        const release = Animator.releaseTime(st.perf);
        if (release !== null && !this.didThrow && el >= release) this.#releaseHeldItem(st.perf, release, base);
        if (el >= st.perf.duration) this.state = { type: 'idle', until: t + rand(0.6, 1.5) };
        break;
      }
      case 'crouch': {
        const k = (t - st.start) / Config.crouchDuration;
        pose = Animator.crouch(Math.min(1, k), this.dir, base);
        if (k >= 1) this.state = { type: 'leap', jump: st.jump, start: t };
        break;
      }
      case 'leap': {
        const j = st.jump;
        const k = Math.min(1, (t - st.start) / j.duration);
        const arc = Math.min(100, 0.3 * Math.hypot(j.to.x - j.from.x, j.to.y - j.from.y) + 40) * Math.sin(k * Math.PI);
        this.pos = { x: j.from.x + (j.to.x - j.from.x) * k, y: j.from.y + (j.to.y - j.from.y) * k + arc };
        pose = Animator.airborne(k, this.dir, base);
        if (k >= 1) {
          this.pos = { ...j.to };
          if (j.chaseCursor && this.#cursorIsNear()) this.#grabCursor(); else this.state = { type: 'land', start: t };
        }
        break;
      }
      case 'land': {
        const k = (t - st.start) / Config.landDuration;
        pose = Animator.land(Math.min(1, k), base);
        if (k >= 1) this.#finishMove(rand(0.3, 1.5));
        break;
      }
      case 'air':
        pose = Animator.flung(clock, this.vel.x, base);
        this.#stepAir(dt, b, maxX, ground);
        break;
      case 'dragged':
        pose = Animator.dragged(clock, base);
        break;
      case 'hanging':
        this.#swingOnCursor(dt);
        pose = Animator.hanging(clock, this.swingAngle, base);
        if (t > st.until) this.#releaseCursor();
        break;
      default:
        throw new Error(`unknown state: ${st.type}`);
    }

    this.pos.x = clamp(this.pos.x, b.minX, maxX);
    this.pos.y = clamp(this.pos.y, ground, b.maxY - SIZE.height);
    if (t > this.nextBlink) { this.blinkUntil = t + 0.12; this.nextBlink = t + rand(2, 5); }
    pose.isBlinking = t < this.blinkUntil;
    pose.time = clock;
    this.pose = pose;
    return pose;
  }

  #stepAir(dt, b, maxX, ground) {
    this.vel.y -= Config.gravity * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.x < b.minX) { this.pos.x = b.minX; this.vel.x = Math.abs(this.vel.x) * 0.5; }
    if (this.pos.x > maxX) { this.pos.x = maxX; this.vel.x = -Math.abs(this.vel.x) * 0.5; }
    const ceiling = b.maxY - SIZE.height;
    if (this.pos.y > ceiling) { this.pos.y = ceiling; this.vel.y = -Math.abs(this.vel.y) * 0.4; }
    if (!(this.pos.y <= ground && this.vel.y < 0)) return;
    this.pos.y = ground;
    if (Math.abs(this.vel.y) > 350) { this.vel.y = -this.vel.y * 0.4; this.vel.x *= 0.7; return; }
    this.vel = { x: 0, y: 0 };
    this.state = { type: 'land', start: this.now };
  }

  /** Moves toward `target` (2D, anywhere on screen). Returns true on arrival. */
  #stepToward(target, speed, dt) {
    const dx = target.x - this.pos.x, dy = target.y - this.pos.y;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > 1) this.facingRight = dx > 0;
    if (dist < 2) return true;
    const move = Math.min(dist, speed * dt);
    this.pos.x += (dx / dist) * move;
    this.pos.y += (dy / dist) * move;
    return false;
  }

  /** After a walk or a landing: start the queued floor action or rest a moment. */
  #finishMove(afterIdle) {
    const p = this.pendingPerformance;
    this.pendingPerformance = null;
    if (p && this.#isOnFloor) this.#begin(p); else this.state = { type: 'idle', until: this.now + afterIdle };
  }

  // MARK: Decisions

  get #isOnFloor() { return this.pos.y - this.#bounds.minY < 3; }

  #randomPoint(b) {
    return { x: rand(b.minX, b.maxX - SIZE.width), y: rand(b.minY, b.maxY - SIZE.height) };
  }

  #pickNext(b) {
    const t = this.now, roll = Math.floor(Math.random() * 100);
    if (roll < 26) this.state = { type: 'walk', to: this.#randomPoint(b), until: t + 20, run: false };
    else if (roll < 38) this.state = { type: 'walk', to: this.#randomPoint(b), until: t + 12, run: true };
    else if (roll < 47) this.#schedule(Animator.makePerformance('sit', { side: this.dir }));
    else if (roll < 55) this.#schedule(Animator.makePerformance('sleep', { side: this.dir }));
    else if (roll < 63) this.#schedule(Animator.makePerformance('stretch', { side: this.dir }));
    else if (roll < 70) this.#schedule(Animator.makePerformance('vodka', { side: this.dir }));
    else if (roll < 77) this.#schedule(Animator.makePerformance('beer', { side: this.dir }));
    else if (roll < 84) this.#schedule(Animator.makePerformance('spit', { side: this.dir }));
    else if (roll < 92) this.#hop(b);
    else if (roll < 97) this.#jumpToCursor(b);
    else this.state = { type: 'idle', until: t + rand(1, 3) };
  }

  /** Floor actions start on the floor: hop down first when the mascot is up on the screen. */
  #schedule(perf) {
    if (this.#isOnFloor) { this.#begin(perf); return; }
    this.pendingPerformance = perf;
    const b = this.#bounds;
    this.#startJump({ x: clamp(this.pos.x + rand(-80, 80), b.minX, b.maxX - SIZE.width), y: b.minY }, false);
  }

  #begin(perf) {
    const p = { ...perf };
    this.didThrow = false;
    if (p.kind === 'spit') this.#aimSpit(p);
    if (p.kind === 'vodka' || p.kind === 'beer' || p.kind === 'spit') this.facingRight = p.side > 0;
    this.state = { type: 'perform', perf: p, start: this.now };
  }

  /** Picks a random spot anywhere on the screen to spit at and turns toward it. */
  #aimSpit(perf) {
    const w = this.env.getScreen().work, m = Config.spitScreenMargin;
    this.spitTarget = { x: rand(w.minX + m, w.maxX - m), y: rand(w.minY + m, w.maxY - m) };
    perf.side = this.spitTarget.x >= this.pos.x + SIZE.width / 2 ? 1 : -1;
  }

  /** Short leap to a nearby spot (can be higher up on the screen). */
  #hop(b, power = 1) {
    const reach = 260 * power;
    this.#startJump({
      x: clamp(this.pos.x + rand(-reach, reach), b.minX, b.maxX - SIZE.width),
      y: clamp(this.pos.y + rand(-reach, reach), b.minY, b.maxY - SIZE.height),
    }, false);
  }

  #startJump(to, chase) {
    const dist = Math.hypot(to.x - this.pos.x, to.y - this.pos.y);
    if (Math.abs(to.x - this.pos.x) > 1) this.facingRight = to.x >= this.pos.x;
    const jump = { from: { ...this.pos }, to, duration: Math.max(0.4, Math.min(1.0, dist / 600)), chaseCursor: chase };
    this.state = { type: 'crouch', jump, start: this.now };
  }

  // MARK: Throwing the empty bottle, spitting

  #releaseHeldItem(perf, release, base) {
    this.didThrow = true;
    if (perf.kind === 'spit') this.#spit(perf, release, base); else this.#throwBottle(perf, release, base);
  }

  #spriteToScreen(p) {
    return { x: this.pos.x + Config.spritePad + p.x * Config.spriteScale, y: this.pos.y + Config.spritePad + p.y * Config.spriteScale };
  }

  #spit(perf, release, base) {
    if (!this.spitTarget) return;
    const mouth = mouthPoint(Animator.performance(perf, release, base));
    this.env.overlay.spit(this.#spriteToScreen(mouth), this.spitTarget);
    this.spitTarget = null;
  }

  #throwBottle(perf, release, base) {
    const hand = handPoint(Animator.performance(perf, release, base), Side.fromSign(perf.side));
    const velocity = { x: perf.side * rand(480, 640), y: rand(330, 480) };
    this.env.overlay.throwBottle(perf.kind, this.#spriteToScreen(hand), velocity);
  }

  // MARK: Cursor grabbing

  /** Offset from the box origin to the raised right hand, which is pinned to the cursor. */
  #handOffset() {
    return { x: Config.spritePad + 104 * Config.spriteScale, y: Config.spritePad + 127 * Config.spriteScale };
  }

  #cursorIsNear() {
    const m = this.env.getCursor(), off = this.#handOffset();
    return Math.hypot(m.x - (this.pos.x + off.x), m.y - (this.pos.y + off.y)) < 80;
  }

  #jumpToCursor(b) {
    const m = this.env.getCursor();
    if (!(m.x >= b.minX && m.x <= b.maxX && m.y >= b.minY && m.y <= b.maxY)) { this.state = { type: 'idle', until: this.now + 1 }; return; }
    const off = this.#handOffset();
    this.#startJump({
      x: clamp(m.x - off.x, b.minX, b.maxX - SIZE.width),
      y: clamp(m.y - off.y, b.minY, b.maxY - SIZE.height),
    }, true);
  }

  #grabCursor() {
    this.swingAngle = 0; this.swingVelocity = 0;
    this.prevCursor = { ...this.env.getCursor() }; this.prevCursorVx = 0;
    this.state = { type: 'hanging', until: this.now + Config.hangDuration };
  }

  /** The mascot follows the cursor like a pendulum. The cursor itself is never touched. */
  #swingOnCursor(dt) {
    if (!(dt > 0)) return;
    const m = this.env.getCursor(), off = this.#handOffset();
    const follow = Math.min(1, dt * 16);
    this.pos.x += (m.x - off.x - this.pos.x) * follow;
    this.pos.y += (m.y - off.y - this.pos.y) * follow;

    const vx = this.prevCursorVx * 0.6 + ((m.x - this.prevCursor.x) / dt) * 0.4;
    this.swingVelocity += (-35 * this.swingAngle - 3 * this.swingVelocity) * dt;     // gravity + damping
    this.swingVelocity += -(vx - this.prevCursorVx) * 0.0035;                         // cursor acceleration kicks the body
    this.swingVelocity = clamp(this.swingVelocity, -12, 12);
    this.swingAngle = clamp(this.swingAngle + this.swingVelocity * dt, -1, 1);
    this.prevCursor = { ...m }; this.prevCursorVx = vx;
  }

  #releaseCursor() {
    this.vel = { x: 0, y: 0 };
    this.state = { type: 'air' };                  // lets go and drops to the floor
  }
}
