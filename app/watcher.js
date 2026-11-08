'use strict';
// Watches files in Desktop / Documents / Downloads and the apps that are running.
// Calls `onEvent({ type, name, folder?, isDirectory? })` with type fileCreated | fileDeleted | appLaunched | appQuit;
// file events also say which watched folder (Desktop, Documents, Downloads) they happened in.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const FILE_DEBOUNCE_MS = 1500;
const APP_POLL_MS = 4000;
const MAX_TRACKED_PATHS = 500;
const WATCHED_FOLDERS = ['Desktop', 'Documents', 'Downloads'];
const IGNORED_SUFFIXES = ['.crdownload', '.download', '.part', '.tmp', '.swp'];

class SystemWatcher {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.watchers = [];
    this.lastSeen = new Map();
    this.knownApps = null;
    this.pollTimer = null;
  }

  start() {
    this.#watchFolders();
    this.#pollApps();
    this.pollTimer = setInterval(() => this.#pollApps(), APP_POLL_MS);
  }

  stop() {
    this.watchers.forEach((w) => w.close());
    this.watchers = [];
    clearInterval(this.pollTimer);
  }

  #watchFolders() {
    for (const name of WATCHED_FOLDERS) {
      const folder = path.join(os.homedir(), name);
      if (!fs.existsSync(folder)) continue;
      try {
        // Recursive watching is native on macOS and Windows, which are the platforms we ship.
        const watcher = fs.watch(folder, { recursive: true }, (_type, file) => file && this.#onFsChange(path.join(folder, file), name));
        watcher.on('error', (err) => console.error(`watch ${folder} failed:`, err.message));
        this.watchers.push(watcher);
      } catch (err) {
        console.error(`cannot watch ${folder}:`, err.message);
      }
    }
  }

  #onFsChange(fullPath, folder) {
    const name = path.basename(fullPath);
    if (name.startsWith('.') || name.startsWith('~$') || IGNORED_SUFFIXES.some((s) => name.endsWith(s))) return;
    if (this.#isDuplicate(fullPath, FILE_DEBOUNCE_MS)) return;
    // fs.watch only says "something changed": existence tells created from deleted.
    fs.stat(fullPath, (err, stats) => this.onEvent(err
      ? { type: 'fileDeleted', name, folder }
      : { type: 'fileCreated', name, folder, isDirectory: stats.isDirectory() }));
  }

  #isDuplicate(key, windowMs) {
    const now = Date.now();
    const last = this.lastSeen.get(key);
    if (last !== undefined && now - last < windowMs) return true;
    this.lastSeen.set(key, now);
    if (this.lastSeen.size > MAX_TRACKED_PATHS) {
      for (const [k, v] of this.lastSeen) if (now - v > 60_000) this.lastSeen.delete(k);
    }
    return false;
  }

  #pollApps() {
    listUserApps((err, apps) => {
      if (err) return;
      if (this.knownApps) {
        for (const app of apps) if (!this.knownApps.has(app)) this.onEvent({ type: 'appLaunched', name: app });
        for (const app of this.knownApps) if (!apps.has(app)) this.onEvent({ type: 'appQuit', name: app });
      }
      this.knownApps = apps;
    });
  }
}

/** Names of the apps the user can see: .app bundles on macOS, processes with a window on Windows. */
function listUserApps(callback) {
  const done = (err, out, parse) => (err ? callback(err) : callback(null, parse(out)));
  if (process.platform === 'darwin') {
    execFile('ps', ['-axo', 'comm='], { maxBuffer: 8 * 1024 * 1024 }, (err, out) => done(err, out, (text) => {
      const apps = new Set();
      for (const line of text.split('\n')) {
        const m = line.match(/\/([^/]+)\.app\/Contents\/MacOS\//);
        if (m && !line.includes('.app/Contents/Frameworks') && !line.includes('Helper')) apps.add(m[1]);
      }
      return apps;
    }));
  } else if (process.platform === 'win32') {
    const script = '(Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -ExpandProperty ProcessName) -join "`n"';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10_000 }, (err, out) => done(err, out, (text) => (
      new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))
    )));
  } else {
    callback(new Error('unsupported platform'));
  }
}

module.exports = { SystemWatcher };
