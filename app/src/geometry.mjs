// Geometry, constants and the skeleton of the bottle mascot.
// Logical sprite units: the sprite is 120x180, origin bottom-left, y up. Points are {x, y}.

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));

/** Colour with components 0...1. `css` is cached so equal colours compare equal as strings. */
export function rgb(r, g, b, a = 1) {
  const css = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
  return { r, g, b, a, css };
}
export const withAlpha = (c, a) => rgb(c.r, c.g, c.b, a);

export const Side = {
  sign: (side) => (side === 'left' ? -1 : 1),
  other: (side) => (side === 'left' ? 'right' : 'left'),
  fromSign: (s) => (s < 0 ? 'left' : 'right'),
  both: ['left', 'right'],
};

/** Maps reference-picture pixels (y down, bottle centre x = 241, shoe soles y = 581) to sprite units (y up). */
export const RefMap = {
  scale: 0.409,
  centerX: 241,
  groundY: 581,
  point(x, y) {
    return { x: (x - this.centerX) * this.scale + 60, y: (this.groundY - y) * this.scale };
  },
  mirroredX(x) { return 2 * this.centerX - x; },
};

const R = RefMap;
const both = (left, right) => ({ left, right });

export const MascotRig = {
  size: { width: 120, height: 180 },
  centerX: 60,
  shoulder: both(R.point(163, 380), R.point(R.mirroredX(163), 380)),
  elbowRest: both(R.point(143, 442), R.point(R.mirroredX(143), 442)),
  restHand: both(R.point(140, 497), R.point(R.mirroredX(140), 497)),
  hip: both(R.point(196, 520), R.point(293, 520)),
  mouth: R.point(259, 355),
  eyes: both(R.point(232, 291), R.point(284, 292)),
  headTop: { x: 60, y: 172 },
  /** The hand that is pinned to the cursor while hanging from it. */
  hangHand: { x: 104, y: 127 },
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
MascotRig.upperArm = dist(MascotRig.elbowRest.left, MascotRig.shoulder.left);
MascotRig.foreArm = dist(MascotRig.restHand.left, MascotRig.elbowRest.left);
MascotRig.armLength = MascotRig.upperArm + MascotRig.foreArm;
MascotRig.restSwing = Math.atan2(
  Math.abs(MascotRig.restHand.left.x - MascotRig.shoulder.left.x),
  MascotRig.shoulder.left.y - MascotRig.restHand.left.y,
);

/** Where the fist is when the whole arm swings by `swing` radians about the shoulder.
 *  0 = hanging straight down, ±π/2 = horizontal (+ away from the body, - across it), π = straight up. */
MascotRig.armTarget = (side, swing) => {
  const s = MascotRig.shoulder[side];
  return { x: s.x + Side.sign(side) * Math.sin(swing) * MascotRig.armLength, y: s.y - Math.cos(swing) * MascotRig.armLength };
};

/** The arm is a rigid piece cut from the reference: it swings about the shoulder and keeps its shape.
 *  Only the direction of `target` matters; the fist always ends at full reach along it. */
MascotRig.solveArm = (side, target) => {
  const s = MascotRig.shoulder[side], rest = MascotRig.restHand[side], elbow0 = MascotRig.elbowRest[side];
  const vx = target.x - s.x, vy = target.y - s.y;
  if (Math.hypot(vx, vy) <= 0.001) return { shoulder: s, elbow: elbow0, hand: rest };
  const turn = Math.atan2(vy, vx) - Math.atan2(rest.y - s.y, rest.x - s.x);
  const turned = (p) => {
    const dx = p.x - s.x, dy = p.y - s.y;
    return { x: s.x + dx * Math.cos(turn) - dy * Math.sin(turn), y: s.y + dx * Math.sin(turn) + dy * Math.cos(turn) };
  };
  return { shoulder: s, elbow: turned(elbow0), hand: turned(rest) };
};

/** One art pixel in sprite units (3 reference px per art pixel). */
export const CELL = 3 * RefMap.scale;

/** Central, tunable constants. */
export const Config = {
  spriteScale: 0.85,
  /** Transparent margin around the sprite: room for outstretched arms, the lying pose and swinging on the cursor. */
  spritePad: 56,
  hangDuration: 12,
  gravity: 1800,
  walkSpeed: 75,
  runSpeed: 230,
  throwVelocityCap: 2400,
  crouchDuration: 0.22,
  landDuration: 0.32,
  shardLifetime: 5,
  shardFadeDuration: 0.6,
  spitScreenMargin: 40,
  bubbleDuration: 2,
  bubbleMaxTextWidth: 260,
  dragThreshold: 4,
  velocityWindow: 0.1,
};
Config.pixelSize = CELL * Config.spriteScale;
Config.mascotSize = {
  width: MascotRig.size.width * Config.spriteScale + 2 * Config.spritePad,
  height: MascotRig.size.height * Config.spriteScale + 2 * Config.spritePad,
};

/** Colours of the drawn extras (bottle labels, overlays), sampled from the reference picture. */
export const Palette = {
  labelBlue: rgb(0.10, 0.15, 0.58),
  labelRed: rgb(0.78, 0.12, 0.17),
  skinLid: rgb(0.47, 0.35, 0.37),
  armSkin: rgb(0.58, 0.41, 0.35),
  lash: rgb(0.22, 0.13, 0.15),
  mouthDark: rgb(0.20, 0.08, 0.10),
  teeth: rgb(0.72, 0.66, 0.64),
};
