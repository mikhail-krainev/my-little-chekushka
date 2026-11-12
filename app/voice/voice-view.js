'use strict';
// The hidden voice page: microphone → Vosk recogniser → finished phrases to the main process.
/* global Vosk */

const BUFFER_SIZE = 4096;                 // samples per chunk handed to the recogniser
const LOAD_TIMEOUT_MS = 180000;           // unpacking the model the first time takes a while on slow machines

const api = window.voiceBridge;
let holdUntil = 0;                        // performance.now() until which the microphone is ignored

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

async function start() {
  const config = await api.config();
  if (!config?.modelUrl) throw new Error('no speech model');
  const model = await loadModel(config.modelUrl);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: false,
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const audio = new AudioContext();
  const recognizer = new model.KaldiRecognizer(audio.sampleRate);
  recognizer.on('result', (message) => {
    const text = message.result?.text;
    if (text && !isHeld()) api.heard(text);
  });
  recognizer.on('error', (message) => api.error(message.error ?? 'recognizer error'));

  // ScriptProcessor rather than an AudioWorklet: the recogniser takes AudioBuffers on this thread anyway.
  const source = audio.createMediaStreamSource(stream);
  const processor = audio.createScriptProcessor(BUFFER_SIZE, 1, 1);
  processor.onaudioprocess = (event) => {
    if (!isHeld()) recognizer.acceptWaveform(event.inputBuffer);
  };
  source.connect(processor);
  processor.connect(audio.destination);   // a processor only runs while connected; its output stays silent
  api.state('listening');
}

api.onHold((ms) => { holdUntil = Math.max(holdUntil, performance.now() + ms); });
api.state('loading');
start().catch((err) => api.error(err?.message ?? String(err)));
