// The quit window's page: a card with the mascot and «Остаться», and a «Выйти» button that runs from the cursor
// (rules in runaway.mjs). Every time it slips away the mascot trolls the user with a phrase from his pool; the voice
// and the talking face come from the mascot's own window, the caption is shown here in the bubble.
import { PHRASE_CLIPS } from '../src/phrase-clips.mjs';
import { ShuffleBag } from '../src/talk.mjs';
import { TRIGGER_PHRASES } from '../src/triggers.mjs';
import { canBeClicked, phaseAt, step } from './runaway.mjs';

const MAX_FRAME_STEP = 1 / 30;
const MARGIN = 12;                 // the button keeps this far from the window edges (px)
/** Seconds of silence after a phrase before the next jump may start another one. */
const TAUNT_GAP = 0.5;

const api = window.quitDialog;
const quit = document.getElementById('quit');
const stay = document.getElementById('stay');
const caption = document.getElementById('text');
const clock = () => performance.now() / 1000;
const startedAt = clock();
let cursor = { x: -1e4, y: -1e4 };
let center = null;
let last = clock();
let quietUntil = 0;                // no new phrase before this moment, so one never cuts off the last

const clipsByKey = new Map(PHRASE_CLIPS.map((clip) => [clip.key, clip]));
const bag = (trigger) => new ShuffleBag((TRIGGER_PHRASES[trigger] ?? []).map((key) => clipsByKey.get(key)).filter(Boolean));
const opening = bag('quitAttempt');
const taunts = bag('quitTaunt');
const giveUp = bag('quitGiveUp');

const area = () => ({ x: MARGIN, y: MARGIN, w: window.innerWidth - 2 * MARGIN, h: window.innerHeight - 2 * MARGIN });
const size = () => ({ w: quit.offsetWidth, h: quit.offsetHeight });

function place() {
  const { w, h } = size();
  quit.style.transform = `translate(${Math.round(center.x - w / 2)}px, ${Math.round(center.y - h / 2)}px)`;
}

/** The mascot says `clip` (his window plays it) and the bubble here shows its text. */
function speak(clip) {
  if (!clip) return;
  caption.textContent = clip.text;
  api.say(clip.key);
  quietUntil = clock() + clip.duration + TAUNT_GAP;
}

/** A jump: a fresh taunt, unless he is still finishing the last one. */
function taunt() {
  if (clock() >= quietUntil) speak(taunts.next());
}

function frame() {
  requestAnimationFrame(frame);
  const now = clock();
  const dt = Math.min(now - last, MAX_FRAME_STEP);
  last = now;
  const elapsed = now - startedAt;
  const next = step({ center, size: size(), area: area(), cursor, elapsed, dt });
  if (next.jumped) taunt();
  center = next.center;
  place();
  if (phaseAt(elapsed) === 'tired' && !quit.classList.contains('tired')) {
    quit.classList.add('tired');
    speak(giveUp.next());
  }
}

window.addEventListener('pointermove', (e) => { cursor = { x: e.clientX, y: e.clientY }; });
// A click that lands before the button gets tired (a fast flick, a jump that came too late) does not count.
quit.addEventListener('pointerdown', (e) => {
  if (canBeClicked(clock() - startedAt)) return;
  e.preventDefault();
  center = step({ center, size: size(), area: area(), cursor: { x: e.clientX, y: e.clientY }, elapsed: 0, dt: 0 }).center;
  taunt();
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

center = { x: window.innerWidth / 2, y: window.innerHeight / 2 + 150 };
place();
stay.focus();
speak(opening.next());
requestAnimationFrame(frame);
