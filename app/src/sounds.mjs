// When each floor scene makes which sound (names from sfx.mjs), in seconds from the start of the scene.
// Pure: the controller plays them as the scene time passes them, the same way it fires `cues`.
import { SPIT_RELEASE, STRETCH_DURATION, drinkTimeline } from './animator.mjs';
import { BURGER_SCENE, PIZZA_SCENE } from './eating.mjs';
import { HOOKAH, SMOKE } from './smoking.mjs';

/** Sounds `{ at, name, gain? }` every `step` seconds from `from` while before `to`. */
const every = (from, to, step, name, gain) => {
  const out = [];
  for (let at = from; at < to - 1e-9; at += step) out.push({ at, name, gain });
  return out;
};

function drinkSounds(kind, vomits) {
  const tl = drinkTimeline(kind, vomits);
  const gulpStep = (tl.chugEnd - tl.raise) / tl.gulps;
  return [
    { at: tl.pull, name: 'grab' },
    ...every(tl.show + 0.05, tl.open, 0.14, 'click', 0.7),          // twisting the cap
    { at: tl.open, name: 'pop' },
    ...every(tl.raise + gulpStep * 0.5, tl.chugEnd, gulpStep, 'gulp'),
    { at: tl.lowerEnd + 0.05, name: 'brr' },
    ...(vomits ? [{ at: tl.swayEnd + 0.8, name: 'vomit' }] : []),
    { at: tl.release - 0.12, name: 'whoosh' },
  ];
}

function smokeSounds() {
  const T = SMOKE;
  return [
    { at: T.pocket, name: 'grab' },
    { at: T.flameOn - 0.05, name: 'flick' },
    { at: T.lit - 0.3, name: 'inhale', gain: 0.6 },
    ...Array.from({ length: T.puffs }, (_, i) => [
      { at: T.firstPuff + i * T.cycle + 0.1, name: 'inhale' },
      { at: T.firstPuff + i * T.cycle + T.exhaleAt, name: 'exhale' },
    ]).flat(),
    { at: T.burnAt, name: 'sizzle' },
  ];
}

function hookahSounds() {
  const T = HOOKAH;
  return [
    { at: T.place - 0.1, name: 'thud', gain: 0.6 },
    { at: T.sitEnd - 0.1, name: 'thud' },
    ...Array.from({ length: T.puffs }, (_, i) => {
      const start = T.firstPuff + i * T.cycle;
      return [
        ...every(start + T.raiseEnd, start + T.inhaleEnd, 0.13, 'bubble'),
        { at: start + T.exhaleAt, name: 'exhale', gain: 1.3 },
      ];
    }).flat(),
    { at: T.putDown, name: 'thud', gain: 0.5 },
  ];
}

function burgerSounds() {
  const T = BURGER_SCENE;
  return [
    { at: T.pull, name: 'grab' },
    { at: T.bite, name: 'crunch' },
    ...every(T.bite + 0.3, T.chewEnd, 0.22, 'chew'),
    ...every(T.brag + 0.2, T.joyEnd - 0.2, 0.45, 'hop'),
    ...every(T.joyEnd + 0.3, T.twirlEnd, 0.57, 'swish', 0.6),       // one turn of the burger
    { at: T.bite2, name: 'crunch' },
    ...every(T.bite2 + 0.25, T.gone, 0.22, 'chew'),
    ...every(T.lowerEnd + 0.1, T.end, 0.12, 'puff', 0.6),            // pats the belly
  ];
}

function pizzaSounds() {
  const T = PIZZA_SCENE;
  return [
    { at: T.place - 0.15, name: 'thud', gain: 0.7 },
    { at: T.open - 0.35, name: 'flap' },
    { at: T.take - 0.3, name: 'grab' },
    ...Array.from({ length: T.tries }, (_, i) => [
      { at: T.raise + i * T.tryTime + 0.22, name: 'clack' },
      { at: T.raise + i * T.tryTime + 0.3, name: 'strain' },
    ]).flat(),
    ...every(T.rage + 0.1, T.rageEnd, 0.35, 'stomp'),
    { at: T.shut - 0.05, name: 'flap' },
    { at: T.pickUp, name: 'grab' },
    { at: T.release - 0.12, name: 'whoosh' },
  ];
}

function stretchSounds() {
  return [
    { at: 0.35, name: 'inhale', gain: 0.8 },
    ...every(6.2, 8.3, 0.8, 'puff'),                                  // squats
    ...every(8.3 + 0.275, 10.4, 0.55, 'clap'),                        // jumping jacks
    ...every(8.3 + 0.55, 10.4, 0.55, 'land', 0.5),
    { at: STRETCH_DURATION - 0.6, name: 'exhale' },
  ];
}

/** Every sound of floor scene `perf` ({ kind, duration, vomits }), sorted by time. */
export function soundCues(perf) {
  let list;
  switch (perf.kind) {
    case 'sit': list = [{ at: 0.42, name: 'thud' }, { at: perf.duration - 0.3, name: 'puff' }]; break;
    case 'sleep': list = [{ at: 1.5, name: 'thud' }, ...every(2.4, perf.duration - 1.2, 2.4, 'snore')]; break;
    case 'stretch': list = stretchSounds(); break;
    case 'vodka': case 'beer': list = drinkSounds(perf.kind, perf.vomits); break;
    case 'spit': list = [...every(0.45, 1.5, 0.37, 'hawk'), { at: SPIT_RELEASE - 0.02, name: 'ptoo' }]; break;
    case 'smoke': list = smokeSounds(); break;
    case 'hookah': list = hookahSounds(); break;
    case 'burger': list = burgerSounds(); break;
    case 'pizza': list = pizzaSounds(); break;
    default: list = [];
  }
  return list.filter((s) => s.at >= 0 && s.at < perf.duration).sort((a, b) => a.at - b.at);
}
