// Owns the mascot's life: roaming, jumping, scripted floor actions (sit, sleep, warm-up, drinking, smoking),
// drag & throw physics, reactions to system events, hanging from the cursor, and the desktop pranks: peeking into an
// opened folder window, pushing folder icons, flinging the cursor away, typing into a search bar.
// Coordinates: y up, origin bottom-left of the screen layer. `pos` is the origin of the mascot box (sprite + margin).
import * as Animator from './animator.mjs';
import { Config, Side, clamp, rand } from './geometry.mjs';
import { blendPoses, newFace } from './pose.mjs';
import { emberPoint, handPoint, mouthPoint } from './renderer.mjs';
import * as Stunts from './stunts.mjs';

const SIZE = Config.mascotSize;

/** Events that make the mascot hop. */
const EXCITING = new Set(['excited', 'surprised']);
/** Seconds over which one action eases into the next instead of snapping. */
const BLEND_TIME = 0.22;
/** A throw at least this fast (px/s) counts as being thrown, not just put down. */
const THROWN_SPEED = 1100;
/** Hitting a screen edge at least this fast (px/s) is worth a word. */
const WALL_HIT_SPEED = 700;
/** Floor actions announced as they start; smoking ones speak after the first drag instead (see #fireCues). */
const SPOKEN_AT_START = new Set(['sit', 'sleep', 'stretch']);
/** Actions done facing the working side. */
const SIDED = new Set(['vodka', 'beer', 'spit', 'smoke', 'hookah']);
/** How far (px) the mascot's front reaches over the edge of a folder window he peeks into. */
const PEEK_OVERLAP = 34;
/** Folder icons: half an icon (px) between the hands and the icon centre, push speed (px/s), push distance range,
 *  room kept to the screen edge, and how often the icon is told where to go while it moves (s). */
const ICON_HALF = 30;
const PUSH_SPEED = 85;
const PUSH_DISTANCE = { min: 140, max: 280 };
const FOLDER_MARGIN = 70;
const FOLDER_SEND_INTERVAL = 0.12;
/** The drawn search bar (px), its height from the top of the work area (share of it), and the bounce off it (px/s). */
const SEARCH_BAR = { width: 560, height: 46, fromTop: 0.3 };
const SEARCH_KNOCKBACK = { x: { min: 700, max: 950 }, y: { min: 450, max: 620 } };
/** Cursor fling: chance per grab, delay after the grab, wind-up, flight time of the cursor (s). */
const CURSOR_THROW_CHANCE = 0.6;
const CURSOR_THROW_DELAY = { min: 2.5, max: 5 };
const CURSOR_WINDUP = 0.35;
const CURSOR_FLIGHT = 0.5;
/** Chance per decision that the mascot starts a prank on his own (when its switch is on). */
const PRANK_CHANCE = { moveFolders: 0.05, searchPrank: 0.03, throwCursor: 0.03 };

export class MascotController {
  /**
   * @param env.getScreen () => { work: {minX, minY, maxX, maxY} }  the usable screen area
   * @param env.getCursor () => {x, y}                               global cursor, y up
   * @param env.overlay   { throwBottle(kind, origin, velocity), spit(origin, target), smoke(origin, opts), burn(at) }
   * @param env.clock     () => seconds
   * @param env.allows    (switchName) => boolean    peekFolders | moveFolders | throwCursor | searchPrank
   * @param env.listFolders () => Promise<[{ name, x, y }]>  desktop folder icons (centres, y up)
   * @param env.moveFolder  (name, {x, y}) => void           puts an icon centre there
   * @param env.throwCursor ({ to, duration }) => void       flings the system cursor to `to`
   * @param env.overlay.search { open(rect), type(text), zap() }  the drawn search bar
   * `onEvent(name, { requested })` (optional) hears what happens to the mascot: pickedUp, thrown, hitWall, grabbedCursor,
   * wokenUp, and from floor actions sit, sleep, stretch, smoke, hookah, spit, drunk, vomit; `requested` is true when the
   * user chose that action from the menu. Pranks always speak (requested): folderPeek, folderPush, cursorThrown,
   * searchAngry.
   */
  constructor(env) {
    this.env = env;
    this.onClick = null;
    this.onEvent = null;
    this.state = { type: 'idle', until: 0 };
    this.pos = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.pendingPerformance = null;
    this.pendingScene = null;          // a prank to start where the current jump lands
    this.throwPlanned = false;         // the next cursor grab ends in a throw
    this.cueIndex = 0;
    this.spitTarget = null;
    this.blendFrom = null;
    this.blendStart = 0;
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
  get isHanging() { return this.state.type === 'hanging' || this.state.type === 'windup'; }
  get isSleeping() { return this.state.type === 'perform' && this.state.perf.kind === 'sleep'; }
  get canBeInterrupted() { return !['dragged', 'hanging', 'windup', 'air'].includes(this.state.type); }
  get #isBusyWithPrank() { return this.state.type === 'scene' || this.pendingScene !== null; }

  // MARK: Outside world

  react(event) {
    if (this.isSleeping) this.state = { type: 'idle', until: this.now + 1 };
    if (this.state.type === 'idle' && EXCITING.has(event.emote)) this.#hop(this.#bounds, 0.4);
  }

  /** Starts a floor action the user asked for (menu / debugging); hops down to the floor first if needed. While he is
   *  held, hanging or flying it waits and starts once he lands. Its phrase is marked as requested (see onEvent). */
  trigger(kind) {
    if (kind === 'pushFolder' || kind === 'search' || kind === 'throwCursor') { this.#startPrank(kind); return; }
    const perf = { ...Animator.makePerformance(kind, { side: this.dir }), requested: true };
    if (this.canBeInterrupted) this.#schedule(perf); else this.pendingPerformance = perf;
  }

  /** A folder window opened at `rect` ({ x, y, width, height }, y up): leap over and peek in. */
  peekInto(rect) {
    if (!this.canBeInterrupted || this.#isBusyWithPrank || !this.#allows('peekFolders')) return;
    const w = this.env.getScreen().work, pad = Config.spritePad, spriteW = SIZE.width - 2 * pad;
    const side = rect.x - w.minX >= w.maxX - (rect.x + rect.width) ? 1 : -1;      // stand where there is more room
    const x = side > 0 ? rect.x + PEEK_OVERLAP - pad - spriteW : rect.x + rect.width - PEEK_OVERLAP - pad;
    this.#startScene({ kind: 'peek', side }, { x, y: rect.y + rect.height * 0.3 - pad });
  }

  wakeAndStare() {
    if (this.isSleeping) this.state = { type: 'idle', until: this.now + 1 };
  }

  // MARK: Mouse (called by the app)

  hoverChanged(inside) {
    if (!inside || !this.isSleeping) return;
    this.wakeAndStare();
    this.onEvent?.('wokenUp');
  }

  clicked() {
    this.wakeAndStare();
    this.onClick?.();
  }

  dragBegan(cursor) {
    this.grab = { x: cursor.x - this.pos.x, y: cursor.y - this.pos.y };
    if (this.state.type === 'scene' && this.state.scene.kind === 'search') this.env.overlay.search?.zap();
    this.pendingPerformance = null;
    this.pendingScene = null;
    this.state = { type: 'dragged' };
    this.onEvent?.('pickedUp');
  }

  dragMoved(cursor) {
    this.pos = { x: cursor.x - this.grab.x, y: cursor.y - this.grab.y };
  }

  dragEnded(v) {
    const cap = Config.throwVelocityCap;
    this.vel = { x: clamp(v.x, -cap, cap), y: clamp(v.y, -cap, cap) };
    this.state = { type: 'air' };
    if (Math.hypot(this.vel.x, this.vel.y) >= THROWN_SPEED) this.onEvent?.('thrown');
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
        this.#fireCues(st.perf, el, base);
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
          if (j.chaseCursor && this.#cursorIsNear()) this.#grabCursor();
          else {
            if (j.chaseCursor) this.throwPlanned = false;
            this.state = { type: 'land', start: t };
          }
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
        if (st.throwAt !== null && t > st.throwAt) this.#windUp();
        else if (t > st.until) this.#releaseCursor();
        break;
      case 'windup': {
        this.#swingOnCursor(dt);
        const k = Math.min(1, (t - st.start) / CURSOR_WINDUP);
        pose = Animator.hanging(clock, this.swingAngle + Stunts.windupSwing(k, st.dir), base);
        if (k >= 1) this.#flingCursor(st.dir);
        break;
      }
      case 'scene':
        pose = this.#tickScene(st, t, dt, base);
        break;
      default:
        throw new Error(`unknown state: ${st.type}`);
    }

    this.pos.x = clamp(this.pos.x, b.minX, maxX);
    this.pos.y = clamp(this.pos.y, ground, b.maxY - SIZE.height);
    if (t > this.nextBlink) { this.blinkUntil = t + 0.12; this.nextBlink = t + rand(2, 5); }
    pose.isBlinking = t < this.blinkUntil;
    pose.time = clock;
    if (this.state !== st) { this.blendFrom = this.pose; this.blendStart = t; }    // ease into the next action
    else if (this.blendFrom) {
      const k = (t - this.blendStart) / BLEND_TIME;
      if (k >= 1) this.blendFrom = null; else pose = blendPoses(this.blendFrom, pose, k * k * (3 - 2 * k));
    }
    this.pose = pose;
    return pose;
  }

  #stepAir(dt, b, maxX, ground) {
    this.vel.y -= Config.gravity * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    const impact = Math.hypot(this.vel.x, this.vel.y);
    let hitWall = false;
    if (this.pos.x < b.minX) { this.pos.x = b.minX; this.vel.x = Math.abs(this.vel.x) * 0.5; hitWall = true; }
    if (this.pos.x > maxX) { this.pos.x = maxX; this.vel.x = -Math.abs(this.vel.x) * 0.5; hitWall = true; }
    const ceiling = b.maxY - SIZE.height;
    if (this.pos.y > ceiling) { this.pos.y = ceiling; this.vel.y = -Math.abs(this.vel.y) * 0.4; hitWall = true; }
    if (hitWall && impact >= WALL_HIT_SPEED) this.onEvent?.('hitWall');
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
    const scene = this.pendingScene;
    if (scene) { this.pendingScene = null; this.pendingPerformance = null; this.#beginScene(scene); return; }
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
    if (this.#maybePrank()) return;
    const t = this.now, roll = Math.floor(Math.random() * 100);
    if (roll < 26) this.state = { type: 'walk', to: this.#randomPoint(b), until: t + 20, run: false };
    else if (roll < 38) this.state = { type: 'walk', to: this.#randomPoint(b), until: t + 12, run: true };
    else if (roll < 47) this.#schedule(Animator.makePerformance('sit', { side: this.dir }));
    else if (roll < 55) this.#schedule(Animator.makePerformance('sleep', { side: this.dir }));
    else if (roll < 63) this.#schedule(Animator.makePerformance('stretch', { side: this.dir }));
    else if (roll < 70) this.#schedule(Animator.makePerformance('vodka', { side: this.dir }));
    else if (roll < 77) this.#schedule(Animator.makePerformance('beer', { side: this.dir }));
    else if (roll < 82) this.#schedule(Animator.makePerformance('spit', { side: this.dir }));
    else if (roll < 87) this.#schedule(Animator.makePerformance('smoke', { side: this.dir }));
    else if (roll < 91) this.#schedule(Animator.makePerformance('hookah', { side: this.dir }));
    else if (roll < 95) this.#hop(b);
    else if (roll < 98) this.#jumpToCursor(b);
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
    this.cueIndex = 0;
    if (p.kind === 'spit') this.#aimSpit(p);
    if (p.kind === 'hookah') this.#roomForHookah(p);
    if (SIDED.has(p.kind)) this.facingRight = p.side > 0;
    this.state = { type: 'perform', perf: p, start: this.now };
    if (SPOKEN_AT_START.has(p.kind)) this.#announce(p, p.kind);
  }

  /** The hookah stands beside the mascot: put it on the side with room on the screen. */
  #roomForHookah(perf) {
    const b = this.#bounds, centre = this.pos.x + SIZE.width / 2, need = 110;
    if (perf.side > 0 && centre + need > b.maxX) perf.side = -1;
    else if (perf.side < 0 && centre - need < b.minX) perf.side = 1;
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

  // MARK: Things that leave the mascot: thrown bottle, spit, smoke, cigarette burn

  /** Fires every cue of the scene whose time has come, each once. The pose at the cue time places the effect. */
  #fireCues(perf, elapsed, base) {
    const list = Animator.cues(perf);
    while (this.cueIndex < list.length && elapsed >= list[this.cueIndex].at) {
      const cue = list[this.cueIndex++];
      const pose = Animator.performance(perf, cue.at, base);
      switch (cue.type) {
        case 'throw': this.#throwBottle(perf, pose); break;
        case 'spit': this.#spit(pose); this.#announce(perf, 'spit'); break;
        case 'vomit': case 'drunk': this.#announce(perf, cue.type); break;
        case 'exhale':
          if (this.cueIndex - 1 === list.findIndex((c) => c.type === 'exhale')) this.#announce(perf, perf.kind);   // first puff
          this.env.overlay.smoke(this.#spriteToScreen(mouthPoint(pose)), { size: cue.size, life: cue.life, drift: perf.side * (cue.drift ?? 1) });
          break;
        case 'burn': {
          const ember = emberPoint(pose);
          if (ember) this.env.overlay.burn(this.#spriteToScreen(ember));
          break;
        }
        default: throw new Error(`unknown cue: ${cue.type}`);
      }
    }
  }

  /** Tells the app a floor action reached the moment for its phrase. */
  #announce(perf, name) {
    this.onEvent?.(name, { requested: perf.requested === true });
  }

  #spriteToScreen(p) {
    return { x: this.pos.x + Config.spritePad + p.x * Config.spriteScale, y: this.pos.y + Config.spritePad + p.y * Config.spriteScale };
  }

  #spit(pose) {
    if (!this.spitTarget) return;
    const mouth = mouthPoint(pose);
    this.env.overlay.spit(this.#spriteToScreen(mouth), this.spitTarget);
    this.spitTarget = null;
  }

  #throwBottle(perf, pose) {
    const hand = handPoint(pose, Side.fromSign(perf.side));
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
    const throws = this.throwPlanned || (this.#allows('throwCursor') && Math.random() < CURSOR_THROW_CHANCE);
    const delay = this.throwPlanned ? 0.8 : rand(CURSOR_THROW_DELAY.min, CURSOR_THROW_DELAY.max);
    this.throwPlanned = false;
    this.state = { type: 'hanging', until: this.now + Config.hangDuration, throwAt: throws ? this.now + delay : null };
    this.onEvent?.('grabbedCursor');
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

  // MARK: Pranks

  #allows(name) { return this.env.allows?.(name) === true; }

  /** Sometimes, instead of the usual pick, starts a prank whose switch is on. Returns true if one started. */
  #maybePrank() {
    for (const [name, chance] of Object.entries(PRANK_CHANCE)) {
      if (!this.#allows(name) || Math.random() >= chance) continue;
      this.#startPrank({ moveFolders: 'pushFolder', searchPrank: 'search', throwCursor: 'throwCursor' }[name]);
      return true;
    }
    return false;
  }

  /** `kind`: pushFolder | search | throwCursor. Ignored while he is held, flying or already pranking. */
  #startPrank(kind) {
    if (!this.canBeInterrupted && !(kind === 'throwCursor' && this.state.type === 'hanging')) return;
    if (this.#isBusyWithPrank) return;
    if (this.isSleeping) this.state = { type: 'idle', until: this.now + 1 };
    switch (kind) {
      case 'pushFolder': this.#pushFolder(); break;
      case 'search': this.#startSearch(); break;
      case 'throwCursor':
        if (this.state.type === 'hanging') { this.state = { ...this.state, throwAt: this.now }; break; }
        this.throwPlanned = true;
        this.#jumpToCursor(this.#bounds);
        break;
      default: throw new Error(`unknown prank: ${kind}`);
    }
  }

  /** Leaps to `to` (box origin, clamped to the screen) and starts `scene` on landing. */
  #startScene(scene, to) {
    const b = this.#bounds;
    const target = { x: clamp(to.x, b.minX, b.maxX - SIZE.width), y: clamp(to.y, b.minY, b.maxY - SIZE.height) };
    this.pendingPerformance = null;
    this.pendingScene = scene;
    if (Math.hypot(target.x - this.pos.x, target.y - this.pos.y) < 4) { this.pos = target; this.#finishMove(0); return; }
    this.#startJump(target, false);
  }

  #beginScene(scene) {
    if (scene.side !== undefined) this.facingRight = scene.side > 0;
    if (scene.dir !== undefined) this.facingRight = scene.dir > 0;
    this.state = { type: 'scene', scene: { ...scene }, start: this.now };
    if (scene.kind === 'angry') this.#say('searchAngry');
  }

  #endScene(afterIdle = rand(0.6, 1.5)) {
    this.state = { type: 'idle', until: this.now + afterIdle };
  }

  #say(name) { this.onEvent?.(name, { requested: true }); }

  #tickScene(st, t, dt, base) {
    const sc = st.scene, el = t - st.start;
    switch (sc.kind) {
      case 'peek':
        if (!sc.spoke && el >= Stunts.PEEK_STARTLE) { sc.spoke = true; this.#say('folderPeek'); }
        if (el >= Stunts.PEEK_DURATION) this.#endScene();
        return Stunts.peek(el, sc.side, base);
      case 'push': return this.#stepPush(sc, t, dt, base);
      case 'search': return this.#stepSearch(sc, el, base);
      case 'angry':
        if (el >= Stunts.ANGRY_DURATION) this.#endScene();
        return Stunts.angry(el, base);
      default: throw new Error(`unknown scene: ${sc.kind}`);
    }
  }

  /** Box offset of the working hand in a pose: where to stand so that the hand lands on a point. */
  #handReach(pose, side) {
    const hand = handPoint(pose, side);
    return { x: Config.spritePad + hand.x * Config.spriteScale, y: Config.spritePad + hand.y * Config.spriteScale };
  }

  // Folder icons

  async #pushFolder() {
    this.state = { type: 'idle', until: this.now + 2 };          // stands still while the desktop is read
    let folders;
    try {
      folders = await this.env.listFolders();
    } catch (err) {
      console.error('Cannot read the desktop folders', err);
      return;
    }
    if (folders.length === 0 || this.state.type !== 'idle' || this.#isBusyWithPrank) return;
    const icon = folders[Math.floor(Math.random() * folders.length)];
    const w = this.env.getScreen().work;
    const distance = rand(PUSH_DISTANCE.min, PUSH_DISTANCE.max);
    const fits = (d) => icon.x + d * distance <= w.maxX - FOLDER_MARGIN && icon.x + d * distance >= w.minX + FOLDER_MARGIN;
    let dir = Math.random() < 0.5 ? 1 : -1;
    if (!fits(dir)) dir = -dir;
    const end = clamp(icon.x + dir * distance, w.minX + FOLDER_MARGIN, w.maxX - FOLDER_MARGIN);
    if (Math.abs(end - icon.x) < 40) return;
    const hand = this.#handReach(Stunts.push(0, dir, newFace()), Side.fromSign(dir));
    const to = { x: icon.x - dir * ICON_HALF - hand.x, y: icon.y - hand.y };
    this.#startScene({ kind: 'push', dir, name: icon.name, icon: { x: icon.x, y: icon.y }, end }, to);
  }

  /** Walks the icon along: it keeps its offset from the mascot until it reaches `end` or he hits the screen edge. */
  #stepPush(sc, t, dt, base) {
    if (!sc.offset) {
      sc.offset = { x: sc.icon.x - this.pos.x, y: sc.icon.y - this.pos.y };
      sc.sentAt = -Infinity;
      this.#say('folderPush');
    }
    this.walkPhase += dt * 7;
    const b = this.#bounds;
    const remaining = (sc.end - (this.pos.x + sc.offset.x)) * sc.dir;
    const nextX = clamp(this.pos.x + sc.dir * Math.min(Math.max(remaining, 0), PUSH_SPEED * dt), b.minX, b.maxX - SIZE.width);
    const stuck = remaining > 0.5 && Math.abs(nextX - this.pos.x) < 1e-6 && dt > 0;
    this.pos.x = nextX;
    const done = remaining <= 0.5 || stuck;
    if (done || t - sc.sentAt >= FOLDER_SEND_INTERVAL) {
      this.env.moveFolder(sc.name, { x: this.pos.x + sc.offset.x, y: this.pos.y + sc.offset.y });
      sc.sentAt = t;
    }
    if (done) this.#endScene();
    return Stunts.push(this.walkPhase, sc.dir, base);
  }

  // Search bar

  #startSearch() {
    const w = this.env.getScreen().work;
    const width = Math.min(SEARCH_BAR.width, (w.maxX - w.minX) * 0.6), h = SEARCH_BAR.height;
    const rect = { x: (w.minX + w.maxX) / 2 - width / 2, y: w.maxY - (w.maxY - w.minY) * SEARCH_BAR.fromTop - h, w: width, h };
    const dir = 1;                                                // stands at the left end, typing to the right
    const hand = this.#handReach(Stunts.typing(Stunts.SEARCH_TYPE_START, dir, newFace()), 'right');
    this.#startScene({ kind: 'search', dir, rect }, { x: rect.x + 10 - hand.x, y: rect.y + h / 2 - hand.y });
  }

  #stepSearch(sc, el, base) {
    const bar = this.env.overlay.search;
    if (!sc.opened && el >= Stunts.SEARCH_OPEN) { sc.opened = true; bar?.open(sc.rect); }
    if (sc.opened) bar?.type(Stunts.typedText(el));
    const pose = Stunts.typing(el, sc.dir, base);
    if (el >= Stunts.SEARCH_ZAP) {
      bar?.zap();
      this.vel = { x: -sc.dir * rand(SEARCH_KNOCKBACK.x.min, SEARCH_KNOCKBACK.x.max), y: rand(SEARCH_KNOCKBACK.y.min, SEARCH_KNOCKBACK.y.max) };
      this.pendingScene = { kind: 'angry' };
      this.state = { type: 'air' };
    }
    return pose;
  }

  // Cursor

  #windUp() {
    const m = this.env.getCursor(), w = this.env.getScreen().work;
    const dir = m.x - w.minX < w.maxX - m.x ? 1 : -1;             // throw toward the far side
    this.state = { type: 'windup', start: this.now, dir };
  }

  #flingCursor(dir) {
    const w = this.env.getScreen().work;
    const to = {
      x: dir > 0 ? w.maxX - rand(10, 80) : w.minX + rand(10, 80),
      y: rand(w.minY + (w.maxY - w.minY) * 0.4, w.maxY - 20),
    };
    this.env.throwCursor?.({ to, duration: CURSOR_FLIGHT });
    this.#say('cursorThrown');
    this.vel = { x: -dir * 220, y: 140 };                          // recoil, then drops to the floor
    this.state = { type: 'air' };
  }
}
