'use strict';
// Talking to the mascot: the microphone is heard by Vosk (offline speech recognition, WASM) in a hidden window of its
// own, so the eval that its WebAssembly glue needs never reaches the mascot's page. The model is downloaded on the
// first use (model.js) and served to that window through the chekushka-voice: scheme.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BrowserWindow, ipcMain, net, protocol, session, systemPreferences } = require('electron');
const { MODEL, downloadModel } = require('./model');

const SCHEME = 'chekushka-voice';
const MODEL_URL = `${SCHEME}://model/${MODEL.file}`;
/** Download progress goes to the mascot at most this often (fraction of the whole). */
const PROGRESS_STEP = 0.01;
/** Longest a heard phrase may be (characters); Vosk never gives more in one go, this only guards the IPC. */
const MAX_HEARD_LENGTH = 500;
const STATES = new Set(['loading', 'listening']);

/** Call before app is ready: the model is fetched by a worker, which needs a scheme with fetch and CORS. */
function registerVoiceScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  ]);
}

class VoiceService {
  /**
   * @param dir folder for the downloaded model
   * @param onState ({ state: 'off'|'downloading'|'loading'|'listening'|'error', progress?, error? }) => void
   * @param onHeard (text) => void
   */
  constructor({ dir, onState, onHeard }) {
    this.dir = dir;
    this.onState = onState;
    this.onHeard = onHeard;
    this.window = null;
    this.modelFile = null;
    this.download = null;            // the model download in flight, shared if the user toggles meanwhile
    this.status = { state: 'off' };
    this.#serveModel();
    this.#guardMicrophone();
    const fromVoice = (event) => this.window && event.sender === this.window.webContents;
    ipcMain.handle('voice:config', (event) => (fromVoice(event) ? { modelUrl: MODEL_URL } : null));
    ipcMain.on('voice:state', (event, state) => { if (fromVoice(event) && STATES.has(state)) this.#set({ state }); });
    ipcMain.on('voice:error', (event, message) => { if (fromVoice(event)) this.#fail(String(message)); });
    ipcMain.on('voice:heard', (event, text) => {
      if (!fromVoice(event) || typeof text !== 'string') return;
      const heard = text.trim().slice(0, MAX_HEARD_LENGTH);
      if (heard) this.onHeard(heard);
    });
  }

  get isOn() { return this.status.state !== 'off' && this.status.state !== 'error'; }

  toggle() {
    if (this.isOn) this.disable(); else this.enable();
  }

  async enable() {
    if (this.isOn) return;
    try {
      if (process.platform === 'darwin' && !(await systemPreferences.askForMediaAccess('microphone'))) {
        throw new Error('Нет доступа к микрофону. Разреши его в Настройках → Конфиденциальность → Микрофон.');
      }
      let reported = -1;
      this.#set({ state: 'downloading', progress: 0 });
      this.download ??= downloadModel(this.dir, (progress) => {
        if (progress - reported < PROGRESS_STEP && progress < 1) return;
        reported = progress;
        if (this.status.state === 'downloading') this.#set({ state: 'downloading', progress });
      }).finally(() => { this.download = null; });
      this.modelFile = await this.download;
      if (this.status.state !== 'downloading') return;          // turned off while downloading
      this.#set({ state: 'loading' });
      this.#openWindow();
    } catch (err) {
      console.error('voice:', err.message);
      this.#fail(err.message.startsWith('Нет доступа') ? err.message : 'Не получилось включить микрофон.');
    }
  }

  disable() {
    this.#closeWindow();
    this.#set({ state: 'off' });
  }

  /** Stop listening for `seconds` (the mascot is talking and must not hear himself). */
  hold(seconds) {
    if (Number.isFinite(seconds) && seconds > 0) this.window?.webContents.send('voice:hold', Math.min(seconds, 30) * 1000);
  }

  dispose() {
    this.#closeWindow();
  }

  #set(status) {
    this.status = status;
    this.onState(status);
  }

  #fail(message) {
    this.#closeWindow();
    this.#set({ state: 'error', error: message });
  }

  #openWindow() {
    this.window = new BrowserWindow({
      show: false, width: 200, height: 100, skipTaskbar: true, focusable: false,
      webPreferences: {
        preload: path.join(__dirname, 'voice-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    const contents = this.window.webContents;
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.on('render-process-gone', (_e, details) => this.#fail(`Распознавание речи упало (${details.reason}).`));
    this.window.on('closed', () => { this.window = null; });
    this.window.loadFile(path.join(__dirname, 'voice.html'));
  }

  #closeWindow() {
    const win = this.window;
    this.window = null;
    if (win && !win.isDestroyed()) win.destroy();
  }

  /** chekushka-voice://model/<file> → the downloaded archive; nothing else is served. */
  #serveModel() {
    protocol.handle(SCHEME, async (request) => {
      const url = new URL(request.url);
      if (url.hostname !== 'model' || url.pathname !== `/${MODEL.file}` || !this.modelFile) {
        return new Response('not found', { status: 404 });
      }
      const file = await net.fetch(pathToFileURL(this.modelFile).toString());
      const headers = new Headers(file.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(file.body, { status: file.status, headers });
    });
  }

  /** Only the voice window may use the microphone; other permissions behave as before. */
  #guardMicrophone() {
    const isVoice = (contents) => Boolean(this.window && contents === this.window.webContents);
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      if (permission !== 'media') { callback(true); return; }
      const audioOnly = (details.mediaTypes ?? []).every((type) => type === 'audio');
      callback(isVoice(contents) && audioOnly);
    });
    session.defaultSession.setPermissionCheckHandler((contents, permission) => permission !== 'media' || isVoice(contents));
  }
}

module.exports = { VoiceService, registerVoiceScheme };
