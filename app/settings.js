'use strict';
// User switches for the pranks (right-click menu on the mascot, tray menu), kept as JSON in the app's userData folder.
const fs = require('node:fs');
const path = require('node:path');

/** Every prank is on until the user turns it off. */
const DEFAULTS = Object.freeze({
  peekFolders: true,     // peeks into a folder window the user opens
  moveFolders: true,     // pushes folder icons around the desktop
  throwCursor: true,     // grabs the cursor and flings it away
  searchPrank: true,     // opens a search bar and tries to type «крутить собак онлайн»
  fightCursor: true,     // sometimes boxes the cursor away when it comes over him
  soundEffects: true,    // quiet sound effects for everything he does
});

class Settings {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.values = { ...DEFAULTS, ...this.#read() };
  }

  get(name) { return this.values[name]; }

  all() { return { ...this.values }; }

  set(name, value) {
    if (!(name in DEFAULTS)) throw new Error(`unknown setting: ${name}`);
    this.values = { ...this.values, [name]: Boolean(value) };
    this.#write();
  }

  #read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      // Only known boolean switches survive a hand-edited or stale file.
      return Object.fromEntries(Object.entries(parsed).filter(([k, v]) => k in DEFAULTS && typeof v === 'boolean'));
    } catch (err) {
      if (err.code !== 'ENOENT') console.error(`settings: cannot read ${this.file}, using defaults:`, err.message);
      return {};
    }
  }

  #write() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.values, null, 2));
    } catch (err) {
      console.error(`settings: cannot save ${this.file}:`, err.message);
    }
  }
}

module.exports = { Settings, SETTING_NAMES: Object.keys(DEFAULTS) };
