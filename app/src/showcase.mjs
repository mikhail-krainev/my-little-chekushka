// Presentation frames use the real sprite renderer. No desktop, files, audio or OS hooks are captured.
import * as A from './animator.mjs';
import { newFace } from './pose.mjs';
import { beginYUp, drawMascot, loadSprites, mouthPoint } from './renderer.mjs';
import { ShatterWorld } from './shatter.mjs';
import { drawSmokes } from './shatter-draw.mjs';
import { fight } from './stunts.mjs';

const canvas = document.getElementById('showcase');
const ctx = canvas.getContext('2d');
const base = newFace();
const scale = 1.25;
const performances = Object.fromEntries(['burger', 'pizza', 'sleep', 'hookah'].map((kind) => [kind, A.makePerformance(kind, { side: 1, vomits: false })]));
performances.sleep.duration = 12;
const performance = (kind) => performances[kind];
const scenes = {
  life: [
    ['01 / ХАРАКТЕР', 'Всегда рядом', 'Гуляет, бегает и машет руками', (t) => A.walk(t * 5, 1, false, base)],
    ['02 / АППЕТИТ', 'Бургер — любовь', 'Откусывает, радуется, хвастается', (t) => A.performance(performance('burger'), t, base)],
    ['03 / ОТДЫХ', 'Тихий час', 'Устраивается поудобнее и засыпает', (t) => A.performance(performance('sleep'), t, base)],
  ],
  mischief: [
    ['04 / ДЫМ', 'С характером', 'Настоящие клубы пиксельного дыма', (t) => A.performance(performance('hookah'), t + 5, base), 'hookah'],
    ['05 / ЕДА', 'Пицца не сдаётся', 'Три попытки откусить — и возмущение', (t) => A.performance(performance('pizza'), t + 3, base)],
    ['06 / ПРОДЕЛКИ', 'Курсор, держись', 'Боксирует при встрече с мышью', (t) => fight(t % 2, 1, base)],
  ],
};

function text(value, x, y, size, color, weight = 400) {
  ctx.font = `${weight} ${size}px -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function smokeAt(t, origin) {
  const p = performance('hookah');
  const cues = A.cues(p).filter((cue) => cue.type === 'exhale');
  const world = new ShatterWorld({ floor: -10000, bounds: { minX: -10000, maxX: 10000 }, seed: 3 });
  let next = 0;
  for (let clock = 0; clock <= t; clock += 1 / 60) {
    while (next < cues.length && cues[next].at <= clock) {
      const cue = cues[next++];
      const pt = mouthPoint(A.performance(p, cue.at, base));
      world.puffSmoke({ x: origin.x + pt.x * scale, y: origin.y + pt.y * scale }, { size: cue.size, life: cue.life, drift: cue.drift });
    }
    world.step(1 / 60);
  }
  return world;
}

window.drawShowcase = (t = 0, set = 'life') => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#191b23'; ctx.fillRect(0, 0, 1200, 640);
  text('ЧЕКУШКА-МЕЛЛ', 40, 65, 44, '#f6dfaa', 800);
  text('МОЙ МИЛЫЙ ПИТОМЕЦ', 42, 102, 20, '#fcf5e9', 600);
  text('ПИКСЕЛЬНЫЙ ХАРАКТЕР НА ВАШЕМ РАБОЧЕМ СТОЛЕ', 42, 131, 12, '#a4a8b8', 500);
  scenes[set].forEach(([tag, title, caption, poseAt, smoke], i) => {
    const x = 40 + i * 380;
    ctx.fillStyle = '#eee9df';
    ctx.beginPath(); ctx.roundRect(x, 160, 360, 414, 18); ctx.fill();
    text(tag, x + 22, 196, 12, '#74614b', 700);
    text(title, x + 22, 230, 23, '#272932', 700);
    // Isolate each card so props and smoke cannot cover neighbouring cards or captions.
    ctx.save();
    ctx.beginPath(); ctx.rect(x, 244, 360, 280); ctx.clip();
    const origin = { x: x + 86, y: 136 };
    beginYUp(ctx, 640, 1);
    ctx.translate(origin.x, origin.y); ctx.scale(scale, scale);
    drawMascot(ctx, poseAt(t));
    ctx.restore();
    if (smoke) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, 244, 360, 280); ctx.clip();
      beginYUp(ctx, 640, 1);
      drawSmokes(ctx, smokeAt(t + 5, origin));
      ctx.restore();
    }
    text(caption, x + 22, 549, 13, '#65636a');
  });
  text('macOS + Windows', 42, 612, 14, '#f6dfaa', 600);
  text('Локально · Без аккаунта · Без API-ключей', 762, 612, 14, '#b7bac7');
  return canvas.toDataURL('image/png').split(',')[1];
};

loadSprites('../assets/sprites').then(() => {
  window.drawShowcase(4);
  window.__showcaseReady = true;
}).catch((err) => { window.__showcaseError = String(err.stack ?? err); });
