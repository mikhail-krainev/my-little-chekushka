// Physics of a thrown bottle: flight, impact, shards flying over the desktop, droplets; and of spit on the screen.
// Shards lie on the floor until `Config.shardLifetime` seconds after the impact, then fade away.
// Coordinates: y up, origin bottom-left of the screen layer.
import { Config } from './geometry.mjs';

/** Deterministic generator so the glass simulation can be tested. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DROPLET_LIFETIME = 0.8;
export const SPLAT_LIFETIME = 5;
export const SPLAT_FADE = 1;

export const shardAlpha = (s) => {
  const fadeStart = Config.shardLifetime - Config.shardFadeDuration;
  return s.age < fadeStart ? 1 : Math.max(0, 1 - (s.age - fadeStart) / Config.shardFadeDuration);
};
export const globProgress = (g) => Math.min(1, g.age / g.flight);
export function globPosition(g) {
  const k = globProgress(g);
  return { x: g.start.x + (g.target.x - g.start.x) * k, y: g.start.y + (g.target.y - g.start.y) * k + g.arc * Math.sin(k * Math.PI) };
}
export const splatAlpha = (s) => (s.age < SPLAT_LIFETIME - SPLAT_FADE ? 1 : Math.max(0, 1 - (s.age - (SPLAT_LIFETIME - SPLAT_FADE)) / SPLAT_FADE));
export const dripLength = (s, d) => Math.min(d.maxLength, d.speed * s.age * (1 - 0.12 * s.age));

export class ShatterWorld {
  /** `bounds` = { minX, maxX } horizontal limits of the playground. */
  constructor({ floor, bounds, seed = Math.floor(Math.random() * 2 ** 32) }) {
    this.floor = floor;
    this.bounds = bounds;
    this.bottles = [];
    this.shards = [];
    this.droplets = [];
    this.spits = [];
    this.splats = [];
    this.random = mulberry32(seed);
  }

  get isEmpty() {
    return !(this.bottles.length || this.shards.length || this.droplets.length || this.spits.length || this.splats.length);
  }

  rand(a, b) { return a + this.random() * (b - a); }
  randInt(a, b) { return Math.floor(this.rand(a, b + 1)); }

  throwBottle(kind, from, velocity) {
    this.bottles.push({ kind, pos: { ...from }, vel: { ...velocity }, angle: 0, spin: this.rand(9, 15) * (velocity.x >= 0 ? -1 : 1) });
  }

  launchSpit(from, target) {
    const distance = Math.hypot(target.x - from.x, target.y - from.y);
    this.spits.push({ start: { ...from }, target: { ...target }, flight: 0.45 + distance / 2200, arc: 40 + distance * 0.12, age: 0 });
  }

  step(dtRaw) {
    const dt = Math.min(dtRaw, 1 / 30);
    this.#stepBottles(dt);
    this.#stepShards(dt);
    this.#stepDroplets(dt);
    this.#stepSpits(dt);
  }

  #stepSpits(dt) {
    const flying = [];
    for (const glob of this.spits) {
      glob.age += dt;
      if (globProgress(glob) >= 1) this.#splash(glob.target); else flying.push(glob);
    }
    this.spits = flying;
    for (const s of this.splats) s.age += dt;
    this.splats = this.splats.filter((s) => s.age < SPLAT_LIFETIME);
  }

  #splash(p) {
    const radius = this.rand(9, 13);
    const drips = Array.from({ length: this.randInt(2, 4) }, () => ({
      dx: this.rand(-radius * 0.6, radius * 0.6), speed: this.rand(14, 30), maxLength: this.rand(14, 42), width: this.randInt(1, 2),
    }));
    const specks = Array.from({ length: this.randInt(6, 10) }, () => {
      const angle = this.rand(0, 2 * Math.PI), dist = this.rand(radius * 1.1, radius * 2.1);
      return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, cells: this.randInt(1, 2) };
    });
    this.splats.push({ pos: { ...p }, radius, drips, specks, age: 0 });
  }

  #stepBottles(dt) {
    const survivors = [];
    for (const b of this.bottles) {
      b.vel.y -= Config.gravity * dt;
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.angle += b.spin * dt;
      if (b.pos.x < this.bounds.minX || b.pos.x > this.bounds.maxX) {
        b.pos.x = Math.min(Math.max(b.pos.x, this.bounds.minX), this.bounds.maxX);
        b.vel.x = -b.vel.x * 0.5;
      }
      if (b.pos.y <= this.floor + 6) this.#shatter(b); else survivors.push(b);
    }
    this.bottles = survivors;
  }

  #shatter(b) {
    const impact = { x: b.pos.x, y: this.floor + 3 };
    const count = b.kind === 'beer' ? 34 : 26;
    for (let i = 0; i < count; i++) {
      const angle = this.rand(0.12 * Math.PI, 0.88 * Math.PI);
      const speed = this.rand(250, 1050);
      const big = i < 3;                                      // a few larger chunks: base, neck, side
      const size = big ? this.rand(9, 14) : this.rand(3, 8.5);
      this.shards.push({
        kind: b.kind,
        pos: { x: impact.x + this.rand(-8, 8), y: impact.y + this.rand(0, 6) },
        vel: { x: Math.cos(angle) * speed + b.vel.x * 0.35, y: Math.sin(angle) * speed * 0.75 + 140 },
        angle: this.rand(0, 2 * Math.PI),
        spin: this.rand(-18, 18),
        points: this.#shardPolygon(size, i % 5 === 4),
        radius: size * 0.45,
        age: 0,
        isResting: false,
      });
    }
    for (let i = 0; i < 16; i++) {
      const angle = this.rand(0.05 * Math.PI, 0.95 * Math.PI);
      const speed = this.rand(150, 600);
      this.droplets.push({ kind: b.kind, pos: { ...impact }, vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, radius: this.rand(1.3, 3.2), age: 0 });
    }
  }

  #shardPolygon(size, long) {
    const sides = this.randInt(3, 5);
    const stretch = long ? 2.2 : this.rand(0.5, 1.4);
    const pts = [];
    let angle = this.rand(0, 2 * Math.PI);
    for (let i = 0; i < sides; i++) {
      const r = size * this.rand(0.45, 1.0);
      pts.push({ x: Math.cos(angle) * r * stretch, y: Math.sin(angle) * r });
      angle += ((2 * Math.PI) / sides) * this.rand(0.7, 1.3);
    }
    return pts;
  }

  #stepShards(dt) {
    for (const s of this.shards) {
      s.age += dt;
      if (s.isResting) continue;
      s.vel.y -= Config.gravity * dt;
      s.pos.x += s.vel.x * dt;
      s.pos.y += s.vel.y * dt;
      s.angle += s.spin * dt;
      if (s.pos.x < this.bounds.minX) { s.pos.x = this.bounds.minX; s.vel.x = Math.abs(s.vel.x) * 0.5; }
      if (s.pos.x > this.bounds.maxX) { s.pos.x = this.bounds.maxX; s.vel.x = -Math.abs(s.vel.x) * 0.5; }
      if (s.pos.y - s.radius <= this.floor) {
        s.pos.y = this.floor + s.radius;
        if (Math.abs(s.vel.y) > 120) {
          s.vel.y = -s.vel.y * 0.32;
          s.vel.x *= 0.78;
          s.spin *= 0.6;
        } else {
          s.vel.y = 0;
          s.vel.x *= Math.max(0, 1 - 7 * dt);              // slide to a stop
          s.spin *= Math.max(0, 1 - 9 * dt);
          if (Math.abs(s.vel.x) < 8) { s.vel.x = 0; s.spin = 0; s.isResting = true; }
        }
      }
    }
    this.shards = this.shards.filter((s) => s.age < Config.shardLifetime);
  }

  #stepDroplets(dt) {
    for (const d of this.droplets) {
      d.age += dt;
      d.vel.y -= Config.gravity * dt * 0.8;
      d.pos.x += d.vel.x * dt;
      d.pos.y += d.vel.y * dt;
      if (d.pos.y < this.floor) { d.pos.y = this.floor; d.vel = { x: d.vel.x * 0.5, y: 0 }; }
    }
    this.droplets = this.droplets.filter((d) => d.age < DROPLET_LIFETIME);
  }
}
