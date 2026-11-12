'use strict';
// «Выход» from the tray or the mascot's menu: instead of quitting at once, opens a dimmed overlay over the display
// under the cursor with a «Выйти» button that runs away (quit-view.mjs). The app quits only when it is caught.
// The page picks the mascot's taunts; his own window says them (voice and face).
const PHRASE_KEY = /^[a-z_]{1,40}$/;
const path = require('node:path');
const { BrowserWindow, app, ipcMain, screen } = require('electron');

class QuitDialog {
  /** @param onSay (phraseKey) => void, the mascot says this phrase */
  constructor({ onSay } = {}) {
    this.onSay = onSay;
    this.window = null;
    const fromOverlay = (event) => this.window && event.sender === this.window.webContents;
    ipcMain.on('quit-dialog:quit', (event) => { if (fromOverlay(event)) app.quit(); });
    ipcMain.on('quit-dialog:stay', (event) => { if (fromOverlay(event)) this.close(); });
    ipcMain.on('quit-dialog:say', (event, key) => {
      if (fromOverlay(event) && typeof key === 'string' && PHRASE_KEY.test(key)) this.onSay?.(key);
    });
  }

  open() {
    if (this.window) { this.window.focus(); return; }
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    this.window = new BrowserWindow({
      ...area, show: false, frame: false, transparent: true, resizable: false, movable: false, minimizable: false,
      maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, 'quit-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    this.window.setAlwaysOnTop(true, 'screen-saver');   // the mascot's own level: opened later, so above him
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.window.webContents.on('will-navigate', (event) => event.preventDefault());
    this.window.once('ready-to-show', () => {
      if (process.platform === 'darwin') app.focus({ steal: true });   // a menu-bar app is not active on its own
      this.window.show();
      this.window.focus();
    });
    this.window.on('closed', () => { this.window = null; });
    this.window.loadFile(path.join(__dirname, 'quit.html'));
  }

  close() {
    this.window?.close();
  }
}

module.exports = { QuitDialog };
