// The quit window's page: a card with «Остаться» and a «Выйти» button that runs from the cursor (rules in runaway.mjs).
import { canBeClicked, phaseAt, step } from './runaway.mjs';

const MAX_FRAME_STEP = 1 / 30;
const MARGIN = 12;                 // the button keeps this far from the window edges (px)
/** The caption under the title, by phase. */
const TAUNTS = {
  panic: ['Не поймаешь!', 'Мимо!', 'Куда тянешься?', 'Хер там!', 'Даже не думай.', 'Ха-ха, промах!'],
  tired: 'Ладно, ладно… устал. Лови, если так хочешь.',
};

const api = window.quitDialog;
const quit = document.getElementById('quit');
const stay = document.getElementById('stay');
const text = document.getElementById('text');
const clock = () => performance.now() / 1000;
const startedAt = clock();
let cursor = { x: -1e4, y: -1e4 };
let center = null;
let last = clock();
let taunt = 0;

const area = () => ({ x: MARGIN, y: MARGIN, w: window.innerWidth - 2 * MARGIN, h: window.innerHeight - 2 * MARGIN });
const size = () => ({ w: quit.offsetWidth, h: quit.offsetHeight });

function place() {
  const { w, h } = size();
  quit.style.transform = `translate(${Math.round(center.x - w / 2)}px, ${Math.round(center.y - h / 2)}px)`;
}

function tauntNext() {
  text.textContent = TAUNTS.panic[taunt++ % TAUNTS.panic.length];
}

function frame() {
  requestAnimationFrame(frame);
  const now = clock();
  const dt = Math.min(now - last, MAX_FRAME_STEP);
  last = now;
  const elapsed = now - startedAt;
  const next = step({ center, size: size(), area: area(), cursor, elapsed, dt });
  if (next.jumped) tauntNext();
  center = next.center;
  place();
  if (phaseAt(elapsed) === 'tired' && !quit.classList.contains('tired')) {
    quit.classList.add('tired');
    text.textContent = TAUNTS.tired;
  }
}

window.addEventListener('pointermove', (e) => { cursor = { x: e.clientX, y: e.clientY }; });
// A click that lands before the button gets tired (a fast flick, a jump that came too late) does not count.
quit.addEventListener('pointerdown', (e) => {
  if (canBeClicked(clock() - startedAt)) return;
  e.preventDefault();
  center = step({ center, size: size(), area: area(), cursor: { x: e.clientX, y: e.clientY }, elapsed: 0, dt: 0 }).center;
  tauntNext();
});
quit.addEventListener('click', (e) => {
  if (!canBeClicked(clock() - startedAt) || e.detail === 0) return;   // detail 0: a keyboard «click»
  api.quit();
});
stay.addEventListener('click', () => api.stay());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.stay();
  if (e.target === quit) e.preventDefault();          // no Enter / Space on the runaway button
});

center = { x: window.innerWidth / 2, y: window.innerHeight / 2 + 120 };
place();
stay.focus();
requestAnimationFrame(frame);
