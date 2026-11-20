// Pixel textures and layered effects for the two play scenes. Coordinates are y up.
import { grain, hash, tone } from './artstyle.mjs';
import { lerp, rgb } from './geometry.mjs';
import { ease, seg } from './motion.mjs';
import { CABINET_HEIGHT, CABINET_WIDTH, CABINET_X, FLOAT, IDLE_SYMBOLS } from './play.mjs';

const INK = '#252229', GOLD = '#c89c57', CREAM = '#e1caaa';
const SCREEN = { x: 12, y: 65, w: 57, h: 42 };
const STOOL_X = 51;
const REEL_CELL = 18;

let dog;
let cabinet;
let ring;
let reels;

export async function loadPlayArt() {
  if (dog) return;
  const image = new Image();
  image.src = new URL('../assets/slot-dog.png', import.meta.url).href;
  await image.decode();
  dog = image;
}

function bitmap(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, -1, 0, height);
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  return canvas;
}

function sprite(ctx, image, x, y) {
  ctx.save();
  ctx.translate(x, y + image.height);
  ctx.scale(1, -1);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

function rect(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath();
}

function solid(ctx, color, points) {
  polygon(ctx, points);
  ctx.fillStyle = color;
  ctx.fill();
}

function metal(ctx, points, base, brushed = false) {
  ctx.save();
  polygon(ctx, points);
  ctx.clip();
  for (let y = 0; y < CABINET_HEIGHT; y += 2) {
    const sheen = Math.exp(-(((y - 117) / 29) ** 2));
    for (let x = 0; x < CABINET_WIDTH; x += 2) {
      const light = 0.76 + 0.29 * sheen + 0.12 * Math.sin(x * 0.13);
      const noise = 0.047 * grain(x, y, 4) + (brushed ? 0.055 * grain(0, y, 8) : 0);
      rect(ctx, tone(base, light, noise).css, x, y, 2, 2);
    }
  }
  ctx.restore();
}

function drawCabinet(ctx) {
  const sidePanel = [[66, 1], [88, 10], [88, 149], [71, 157], [72, 56]];
  const face = [[0, 1], [72, 0], [73, 51], [68, 66], [74, 150], [70, 157], [13, 157], [8, 151], [7, 65], [0, 50]];
  solid(ctx, INK, sidePanel);
  metal(ctx, [[73, 4], [86, 12], [86, 146], [73, 153]], rgb(0.27, 0.25, 0.24));
  solid(ctx, INK, face);
  metal(ctx, [[2, 3], [70, 3], [71, 50], [66, 66], [72, 149], [69, 155], [14, 155], [10, 150], [9, 64], [2, 50]],
    rgb(0.70, 0.65, 0.58), true);
  solid(ctx, '#302429', [[5, 5], [67, 5], [67, 39], [4, 39]]);
  metal(ctx, [[7, 7], [65, 7], [65, 37], [6, 37]], rgb(0.22, 0.19, 0.19));
  rect(ctx, '#1e1a20', 21, 13, 32, 11);
  rect(ctx, '#564d46', 23, 14, 28, 3);
  rect(ctx, '#a49b85', 30, 24, 15, 3);
  solid(ctx, '#39272c', [[5, 42], [66, 42], [63, 58], [11, 58]]);
  rect(ctx, '#794448', 12, 45, 50, 8);
  [16, 25, 34, 48, 55].forEach((x, i) => {
    rect(ctx, INK, x, 48, 6, 5);
    rect(ctx, i < 3 ? CREAM : '#bc5851', x + 1, 50, 4, 3);
  });
  rect(ctx, '#503033', 10, 61, 59, 50);
  rect(ctx, GOLD, 11, 63, 59, 46);
  rect(ctx, INK, SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h);
  solid(ctx, '#483035', [[11, 113], [70, 113], [72, 149], [68, 153], [15, 153], [12, 149]]);
  rect(ctx, GOLD, 16, 114, 50, 36);
  rect(ctx, INK, 18, 116, 46, 32);
  for (const x of [13, 68]) {
    for (let y = 116; y < 150; y += 5) rect(ctx, y % 2 ? CREAM : GOLD, x, y, 2, 2);
  }
  for (let y = 130; y < 147; y += 3) rect(ctx, '#171519', 77, y, 8, 1);
  for (const [x, y] of [[5, 5], [66, 6], [13, 111], [67, 111], [16, 150], [67, 150]]) {
    rect(ctx, '#2a262a', x, y, 2, 2);
    rect(ctx, '#c3ada0', x, y + 1, 1, 1);
  }
  rect(ctx, INK, 32, 156, 20, 4);
  rect(ctx, '#752c31', 35, 160, 14, 7);
  rect(ctx, '#b76455', 36, 162, 12, 5);
}

function drawBadge(ctx, side) {
  if (!dog) return;
  ctx.save();
  ctx.translate(side < 0 ? 62 : 20, 146);
  ctx.scale(side, -1);
  ctx.drawImage(dog, 0, 0, 42, 29);
  rect(ctx, 'rgba(52,31,30,0.23)', 0, 0, 42, 29);
  ctx.restore();
}

function symbol(ctx, kind, x, y) {
  ctx.save();
  ctx.translate(x, y);
  if (kind === 0) {
    solid(ctx, '#762031', [[-6, 4], [6, 4], [6, 1], [1, -5], [-3, -5], [1, 1], [-6, 1]]);
    rect(ctx, '#d47365', -5, 3, 10, 1);
  } else if (kind === 1) {
    solid(ctx, '#80552f', [[-7, -1], [-7, 3], [-4, 5], [-2, 3], [2, 3], [4, 5], [7, 3], [7, -1], [4, -3], [-4, -3]]);
    solid(ctx, CREAM, [[-6, 0], [-6, 3], [-4, 4], [-2, 2], [2, 2], [4, 4], [6, 3], [6, 0], [4, -2], [2, 0], [-2, 0], [-4, -2]]);
  } else if (kind === 2) {
    solid(ctx, '#345362', [[-6, 1], [-3, 5], [3, 5], [6, 1], [0, -5]]);
    solid(ctx, '#7aafb0', [[-4, 1], [-2, 4], [2, 4], [4, 1], [0, -3]]);
    rect(ctx, '#b4d0c8', -2, 2, 4, 1);
  } else {
    solid(ctx, '#585041', [[-6, -2], [-4, 0], [-3, 4], [3, 4], [4, 0], [6, -2], [2, -2], [1, -4], [-1, -4], [-2, -2]]);
    rect(ctx, '#c3a358', -2, -1, 4, 5);
    rect(ctx, '#dfc489', -1, 2, 2, 1);
  }
  ctx.restore();
}

function reelStrip(ctx) {
  for (let i = 0; i < 4; i++) {
    const y = i * REEL_CELL;
    rect(ctx, '#aa9b89', 0, y, 16, REEL_CELL);
    rect(ctx, '#e4d6b8', 2, y + 2, 12, REEL_CELL - 3);
    rect(ctx, '#b7a38d', 15, y, 1, REEL_CELL);
    symbol(ctx, i, 8, y + REEL_CELL / 2);
  }
}

function drawReels(ctx, state) {
  const { x, y, w, h } = SCREEN;
  const { round, time, broken, recoil, side } = state;
  rect(ctx, '#28232a', x, y, w, h);
  if (!broken || recoil < 0.22 && Math.floor(recoil * 32) % 2 === 0) {
    reels ??= bitmap(16, 4 * REEL_CELL, reelStrip);
    for (let i = 0; i < 3; i++) {
      const left = x + 2 + i * 18;
      const start = round?.previous[i] ?? IDLE_SYMBOLS[i];
      const end = round?.symbols[i] ?? start;
      const finish = (round?.stop ?? 0) - (2 - i) * 0.18;
      const progress = round ? seg(time, round.spin, finish) : 0;
      const distance = (4 + i) * 4 + (end - start + 4) % 4;
      const brake = seg(time, finish, finish + 0.22);
      const rebound = progress === 1 ? Math.sin(brake * 3 * Math.PI) * (1 - brake) ** 2 * 3 : 0;
      const travel = progress ** 2 * (3 - 2 * progress);
      const offset = ((start + distance * travel) % 4 * REEL_CELL + rebound + reels.height) % reels.height;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, y + 3, 16, h - 6);
      ctx.clip();
      // Undo the cabinet mirror for the symbols on the printed reel strips.
      if (side < 0) { ctx.translate(left * 2 + 16, 0); ctx.scale(-1, 1); }
      for (const copy of [-1, 0, 1]) {
        sprite(ctx, reels, left, Math.round(y + h / 2 - REEL_CELL / 2 - offset + copy * reels.height));
      }
      const blur = 0.36 * Math.sin(Math.PI * progress) ** 2;
      if (blur > 0.07) {
        rect(ctx, `rgba(216,192,151,${blur})`, left, y + 3, 16, h - 6);
        rect(ctx, `rgba(250,231,196,${blur})`, left + 2, y + 10, 2, 22);
      }
      ctx.restore();
    }
    rect(ctx, 'rgba(32,25,30,0.46)', x + 1, y + 3, w - 2, 6);
    rect(ctx, 'rgba(32,25,30,0.38)', x + 1, y + h - 9, w - 2, 6);
    rect(ctx, 'rgba(231,216,177,0.25)', x + 1, y + h - 12, w - 2, 2);
  }
  if (broken) {
    solid(ctx, '#463f4b', [[13, 99], [17, 90], [31, 100], [37, 79], [17, 67], [13, 82]]);
    solid(ctx, '#5a5962', [[18, 105], [46, 104], [40, 96], [31, 100], [17, 90]]);
    solid(ctx, '#403e49', [[68, 65], [51, 65], [47, 78], [62, 89], [68, 86]]);
    ctx.strokeStyle = '#a6acaa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [xx, yy] of [[12, 72], [13, 102], [31, 106], [54, 103], [68, 92], [59, 65], [33, 65]]) {
      ctx.moveTo(17, 90);
      ctx.lineTo(lerp(17, xx, 0.43) + 3, lerp(90, yy, 0.43) - 2);
      ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.strokeStyle = '#6b7c82';
    ctx.beginPath();
    ctx.moveTo(13, 73); ctx.lineTo(23, 81); ctx.lineTo(20, 92); ctx.lineTo(33, 101); ctx.lineTo(51, 105);
    ctx.moveTo(33, 101); ctx.lineTo(39, 91); ctx.lineTo(47, 86); ctx.lineTo(42, 74); ctx.lineTo(49, 65);
    ctx.moveTo(14, 99); ctx.lineTo(24, 96); ctx.lineTo(30, 90); ctx.lineTo(42, 93);
    ctx.stroke();
    if (recoil < 0.1) rect(ctx, `rgba(222,246,237,${1 - recoil * 10})`, 15, 83, 18, 14);
  }
}

function winSparks(ctx, { round, time, opacity }) {
  const winTime = round?.win ? time - round.stop : -1;
  if (winTime >= 0 && winTime < 1.05) {
    for (let i = 0; i < 15; i++) {
      const x = CABINET_X + 39 + (hash(i, 2) - 0.55) * 150 * winTime;
      const y = 129 + (55 + hash(i, 3) * 73) * winTime - 110 * winTime ** 2;
      ctx.globalAlpha = opacity * (1 - winTime / 1.05);
      rect(ctx, i % 3 === 0 ? CREAM : GOLD, Math.round(x), Math.round(y), 3, 3 + i % 3);
    }
  }
}

function flyingGlass(ctx, { recoil, opacity }) {
  if (recoil < 0 || recoil > 1.45) return;
  const gravity = 425;
  for (let i = 0; i < 38; i++) {
    const size = 1.4 + hash(i, 9) * 6;
    const origin = i % 2 === 0 ? 77 : 99;
    const speed = 70 + 135 * hash(i, 0);
    const landing = (speed + Math.sqrt(speed ** 2 + 2 * gravity * origin)) / gravity;
    const bounceTime = recoil - landing;
    const dx = (hash(i, 1) - 0.72) * 215;
    const x = CABINET_X + 18 + dx * Math.min(recoil, landing) + dx * Math.max(0, bounceTime) * 0.36;
    const y = bounceTime < 0 ? origin + recoil * speed - gravity / 2 * recoil ** 2
      : Math.max(0, bounceTime * 60 - gravity / 2 * bounceTime ** 2);
    ctx.globalAlpha = opacity * (1 - ease(seg(recoil, 0.85, 1.45)));
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(i + recoil * (i % 5 + 1));
    solid(ctx, i % 3 ? '#b2c7c6' : '#4f515b', [[0, 0], [size, 1], [size * 0.48, size]]);
    solid(ctx, '#e5e3cf', [[0, 0], [size * 0.48, size], [size * 0.16, size * 0.76]]);
    ctx.restore();
  }
}

function landingDebris(ctx, { crash, travel, opacity }) {
  if (crash < 0 || crash > 0.85) return;
  const centre = CABINET_X + CABINET_WIDTH / 2 + travel;
  for (let i = 0; i < 49; i++) {
    const velocity = 55 + hash(i, 13) * 142;
    const airTime = velocity / 245;
    const flight = Math.min(crash, airTime);
    const dx = (hash(i, 12) - 0.34) * 155;
    const x = centre + (hash(i, 11) - 0.5) * 108 + dx * flight;
    const y = 3 + (velocity - 245 * flight) * flight;
    const size = 2 + hash(i, 14) * 5;
    ctx.globalAlpha = opacity * (1 - ease(seg(crash, 0.32, 0.85)));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(i + flight * 10);
    if (i % 3) {
      solid(ctx, i % 2 ? '#bfc5b9' : '#605b5c', [[0, 0], [size, 0], [size * 0.3, size]]);
    } else {
      rect(ctx, i % 2 ? CREAM : GOLD, 0, 0, size, 2);
    }
    ctx.restore();
  }
}

const WRECK_PIECES = [
  { x: 45, y: 142, dx: 61, rise: 30, spin: 1.4,
    mask: [[0, 114], [28, 119], [52, 110], [88, 116], [88, 167], [0, 167]] },
  { x: 42, y: 91, dx: 22, rise: 23, spin: -1.7,
    mask: [[-22, 63], [14, 64], [39, 58], [65, 63], [88, 67], [88, 116], [52, 110], [28, 119], [-22, 114]] },
  { x: 21, y: 32, dx: -61, rise: 36, spin: 2.0,
    mask: [[-22, 0], [36, 0], [36, 19], [45, 40], [39, 58], [14, 64], [-22, 63]] },
  { x: 66, y: 28, dx: -20, rise: 18, spin: -1.6,
    mask: [[36, 0], [88, 0], [88, 67], [65, 63], [39, 58], [45, 40], [36, 19]] },
];

function wreckPosition(piece, state) {
  const { crash, angle, centreY, travel } = state;
  const a = Math.cos(angle), b = Math.sin(angle);
  const x = piece.x - CABINET_WIDTH / 2, y = piece.y - CABINET_HEIGHT / 2;
  const settle = 1 - (1 - seg(crash, 0, 0.94)) ** 2;
  const rotation = -angle + piece.spin * settle;
  const rotationCos = Math.cos(rotation), rotationSin = Math.sin(rotation);
  const support = Math.max(...piece.mask.map(([px, py]) => -(px - piece.x) * rotationSin - (py - piece.y) * rotationCos));
  const exitHeight = -x * b + y * a + centreY;
  const bounce = piece.rise * bumpFlight(crash, 0.48) + 6 * bumpFlight(crash - 0.48, 0.25);
  return {
    x: CABINET_X + CABINET_WIDTH / 2 + travel + x * a + y * b + piece.dx * settle,
    y: Math.max(support, lerp(exitHeight, support, settle)) + bounce,
    rotation,
  };
}

const bumpFlight = (time, duration) => {
  const k = seg(time, 0, duration);
  return 4 * k * (1 - k);
};

function drawWreck(ctx, state) {
  for (const piece of WRECK_PIECES) {
    const { x, y, rotation } = wreckPosition(piece, state);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.translate(-piece.x, -piece.y);
    polygon(ctx, piece.mask);
    ctx.clip();
    drawCabinetFace(ctx, state);
    ctx.restore();
  }
}

function drawCabinetFace(ctx, state) {
  sprite(ctx, cabinet, 0, 0);
  drawBadge(ctx, state.side);
  drawReels(ctx, state);
  const lit = state.round?.win && state.time >= state.round.stop && state.time - state.round.stop < 1.1;
  if (lit && Math.floor(state.time * 9) % 2 === 0) {
    rect(ctx, '#e2a675', 36, 162, 12, 4);
    rect(ctx, '#f1d19d', 13, 83, 2, 4);
    rect(ctx, '#f1d19d', 66, 83, 2, 4);
  }
  const leverX = Math.round(-15 + (20 + 4 * state.grip) * state.pull);
  const leverY = Math.round(108 - (17 + 4 * state.grip) * state.pull);
  rect(ctx, '#3b3132', 1, 53, 9, 8);
  solid(ctx, '#c1ac96', [[4, 55], [7, 57], [leverX + 1, leverY], [leverX - 2, leverY - 1]]);
  rect(ctx, '#682d36', leverX - 5, leverY - 4, 10, 10);
  rect(ctx, '#a34d50', leverX - 4, leverY - 2, 8, 7);
  rect(ctx, '#d4816c', leverX - 3, leverY + 3, 4, 2);
}

export function drawSlots(ctx, state) {
  if (state.opacity <= 0) return;
  cabinet ??= bitmap(CABINET_WIDTH, CABINET_HEIGHT, drawCabinet);
  ctx.save();
  ctx.translate(60, 0);
  ctx.scale(state.side, 1);
  ctx.translate(-60, 0);
  ctx.globalAlpha = state.opacity;
  const centre = CABINET_X + CABINET_WIDTH / 2 + state.travel;
  const footprint = 88 + Math.sin(state.angle) * 75;
  const shade = (0.28 - state.airGap / 440) * (1 - ease(seg(state.crash, 0, 0.55)));
  rect(ctx, `rgba(26,21,25,${shade})`, centre - footprint / 2, 0, footprint, 4);
  rect(ctx, INK, STOOL_X - 36, 14, 68, 7);
  rect(ctx, '#824a43', STOOL_X - 33, 17, 62, 7);
  rect(ctx, '#a76454', STOOL_X - 30, 23, 55, 2);
  solid(ctx, '#67615b', [[STOOL_X - 35, 0], [STOOL_X - 30, 0], [STOOL_X - 22, 15], [STOOL_X - 27, 15]]);
  solid(ctx, '#514e50', [[STOOL_X + 27, 0], [STOOL_X + 32, 0], [STOOL_X + 24, 15], [STOOL_X + 19, 15]]);
  rect(ctx, '#9b8773', STOOL_X - 27, 5, 54, 3);
  if (state.shattered) {
    drawWreck(ctx, state);
  } else {
    ctx.save();
    ctx.translate(centre, state.centreY);
    ctx.rotate(-state.angle);
    ctx.translate(-CABINET_WIDTH / 2, -CABINET_HEIGHT / 2);
    drawCabinetFace(ctx, state);
    ctx.restore();
  }
  winSparks(ctx, state);
  flyingGlass(ctx, state);
  landingDebris(ctx, state);
  ctx.restore();
}

const RING_HEIGHT = 68;
const RING_CY = 35;
const DOUGH = rgb(0.82, 0.58, 0.32);
const ICING = rgb(0.50, 0.20, 0.16);
const SPRINKLES = ['#d3a24c', '#617d93', '#667e60', '#c86550', '#d5b79a'];

function ringSurface(ctx) {
  const radius = FLOAT.radius;
  for (let y = 0; y < RING_HEIGHT; y++) {
    for (let x = 0; x < radius * 2; x++) {
      const dx = x - radius, dy = y - RING_CY;
      const outer = Math.hypot(dx / radius, dy / (dy < 0 ? 33 : 25));
      const hole = Math.hypot(dx / 40, (dy - 4) / 12);
      const bite = Math.min(...[[-69, 13, 10], [-66, 10, 7], [-68, 3, 7]]
        .map(([bx, by, br]) => Math.hypot(dx - bx, (dy - by) * 1.2) - br));
      if (outer > 1 || hole < 1 || bite < 0) continue;
      const frostingEdge = -23 - 2.6 * Math.sin(dx * 0.15) - 2 * Math.sin(dx * 0.29 + 1.1);
      const iced = dy > frostingEdge && outer < (dy > 0 ? 0.98 : 0.94) && hole > 1.08 && bite > 1;
      const edge = Math.min((1 - outer) * 34, (hole - 1) * 13);
      const bevel = Math.min(1, edge / 5);
      const seam = dy < 0 && outer > 0.94 && outer < 0.977;
      const highlight = 0.33 * Math.exp(-(((dx + 34) / 18) ** 2 + ((dy + 14 + dx * 0.061) / 3.4) ** 2));
      const rim = 0.22 * Math.exp(-(((dx - 41) / 15) ** 2 + ((dy - 14) / 3.8) ** 2));
      const light = 0.58 + 0.29 * bevel + 0.18 * (dy / 30) + highlight + rim + (seam ? 0.14 : 0);
      rect(ctx, tone(iced ? ICING : DOUGH, light, 0.042 * grain(x, y, 9)).css, x, y, 1, 1);
    }
  }
  for (let i = 0; i < 30; i++) {
    const angle = i * Math.PI * 2 / 30 + (hash(i, 8) - 0.5) * 0.14;
    const x = Math.round(radius + (51 + 7 * hash(i, 4)) * Math.cos(angle));
    const y = Math.round(RING_CY + (Math.sin(angle) > 0 ? 20 : 18) * Math.sin(angle));
    if (x < 15 && y > RING_CY) continue;
    const slope = Math.round(4 * grain(i, 5));
    solid(ctx, '#513632', [[x - 3, y - 2], [x - 3, y], [x + 3, y + slope + 1], [x + 3, y + slope - 1]]);
    solid(ctx, SPRINKLES[i % SPRINKLES.length],
      [[x - 3, y], [x - 2, y + 2], [x + 3, y + slope + 2], [x + 3, y + slope]]);
  }
  rect(ctx, '#684d3b', 112, 9, 9, 5);
  rect(ctx, '#b88a56', 113, 11, 7, 3);
  rect(ctx, '#d4ae70', 115, 13, 4, 2);
}

export function drawFloat(ctx, state, front) {
  if (state.opacity <= 0 || state.inFront && !front) return;
  ring ??= bitmap(FLOAT.radius * 2, RING_HEIGHT, ringSurface);
  ctx.save();
  ctx.globalAlpha = state.opacity;
  ctx.translate(60 + state.x, state.y);
  ctx.rotate(state.spin);
  ctx.scale(state.sx, state.sy);
  if (!state.inFront) {
    ctx.beginPath();
    const split = 4;
    ctx.rect(-FLOAT.radius, front ? -RING_CY : split, FLOAT.radius * 2,
      front ? RING_CY + split : RING_HEIGHT - RING_CY - split);
    ctx.clip();
  }
  sprite(ctx, ring, -FLOAT.radius, -RING_CY);
  ctx.restore();
}
