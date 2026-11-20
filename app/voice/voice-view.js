'use strict';
// The hidden voice page: microphone → Vosk recogniser → finished phrases to the main process.
/* global Vosk */

const BUFFER_SIZE = 4096;                 // samples per chunk handed to the recogniser
const LOAD_TIMEOUT_MS = 180000;           // unpacking the model the first time takes a while on slow machines

const api = window.voiceBridge;
let holdUntil = 0;                        // performance.now() until which the microphone is ignored
let recognizer = null;

const isHeld = () => performance.now() < holdUntil;

function loadModel(url) {
  return new Promise((resolve, reject) => {
    const model = new Vosk.Model(url);
    const timer = setTimeout(() => reject(new Error('speech model did not load in time')), LOAD_TIMEOUT_MS);
    model.on('load', (message) => {
      clearTimeout(timer);
      if (message.result) resolve(model); else reject(new Error('speech model failed to load'));
    });
    model.on('error', (message) => { clearTimeout(timer); reject(new Error(message.error ?? 'speech model error')); });
  });
}

function createRecognizer(model, sampleRate) {
  const current = new model.KaldiRecognizer(sampleRate);
  current.setWords(true);                 // per-word confidence, to tell speech to him from background noise
  current.on('result', (message) => {
    const text = message.result?.text;
    if (!text || recognizer !== current || isHeld()) return;
    const words = message.result.result ?? [];
    const confidence = words.length ? words.reduce((sum, w) => sum + w.conf, 0) / words.length : undefined;
    api.heard(text, confidence);
  });
  current.on('error', (message) => {
    if (recognizer === current) api.error(message.error ?? 'recognizer error');
  });
  return current;
}

async function start() {
  const config = await api.config();
  if (!config?.modelUrl) throw new Error('no speech model');
  const model = await loadModel(config.modelUrl);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: false,
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const audio = new AudioContext();
  await audio.resume();

  // ScriptProcessor rather than an AudioWorklet: the recogniser takes AudioBuffers on this thread anyway.
  const source = audio.createMediaStreamSource(stream);
  const processor = audio.createScriptProcessor(BUFFER_SIZE, 1, 1);
  processor.onaudioprocess = (event) => {
    if (isHeld()) return;
    recognizer ??= createRecognizer(model, audio.sampleRate);
    recognizer.acceptWaveform(event.inputBuffer);
  };
  source.connect(processor);
  processor.connect(audio.destination);   // a processor only runs while connected; its output stays silent
  api.state('listening');
}

api.onHold((ms) => {
  holdUntil = Math.max(holdUntil, performance.now() + ms);
  // A partial utterance or a queued result from before playback must never cross the hold.
  recognizer?.remove();
  recognizer = null;
});
api.state('loading');
start().catch((err) => api.error(err?.message ?? String(err)));
