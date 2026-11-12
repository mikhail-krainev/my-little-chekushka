'use strict';
// The update banner: a small card in the top-right corner of the main display, above every window.
const path = require('node:path');
const { BrowserWindow, ipcMain, screen } = require('electron');

const WIDTH = 360;
const HEIGHT = 130;                // until the page reports its own height
const MIN_HEIGHT = 60;
const MAX_HEIGHT = 300;
const MARGIN = 16;
const ACTIONS = new Set(['install', 'later', 'openPage']);

class UpdateBanner {
  /** @param onAction (action) => void for 'install' | 'later' | 'openPage' */
  constructor(onAction) {
    this.onAction = onAction;
    this.window = null;
    this.state = null;
    this.height = HEIGHT;
    ipcMain.on('update-banner:action', (event, action) => {
      if (!this.window || event.sender !== this.window.webContents || !ACTIONS.has(action)) return;
      this.onAction(action);
    });
    ipcMain.on('update-banner:fit', (event, height) => {
      if (!this.window || event.sender !== this.window.webContents || !Number.isFinite(height)) return;
      this.height = Math.round(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height)));
      this.#place();
    });
    ipcMain.handle('update-banner:state', (event) => (this.window && event.sender === this.window.webContents ? this.state : null));
  }

  show(state) {
    this.state = state;
    if (!this.window) this.#create();
    else this.window.webContents.send('update-banner:state', state);
    if (this.window.isVisible()) return;
    this.#place();
    if (!this.window.webContents.isLoading()) this.window.showInactive();
  }

  hide() {
    this.window?.hide();
  }

  #create() {
    this.window = new BrowserWindow({
      width: WIDTH, height: HEIGHT, show: false, frame: false, transparent: true, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, 'banner-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    this.window.setAlwaysOnTop(true, 'pop-up-menu');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.window.webContents.on('will-navigate', (event) => event.preventDefault());
    this.window.once('ready-to-show', () => { this.#place(); this.window.showInactive(); });
    this.window.on('closed', () => { this.window = null; });
    this.window.loadFile(path.join(__dirname, 'banner.html'));
  }

  #place() {
    const area = screen.getPrimaryDisplay().workArea;
    this.window.setBounds({ x: area.x + area.width - WIDTH - MARGIN, y: area.y + MARGIN, width: WIDTH, height: this.height });
  }
}

module.exports = { UpdateBanner };
