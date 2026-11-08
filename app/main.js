'use strict';
const path = require('node:path');
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = require('electron');
const { SystemWatcher } = require('./watcher');

const CURSOR_POLL_MS = 16;
const TRAY_SIZE = 18;

const ACTIONS = [
  { label: 'Сесть на пол', kind: 'sit' },
  { label: 'Спать', kind: 'sleep' },
  { label: 'Разминка и растяжка', kind: 'stretch' },
  { label: 'Выпить чекушку (0,2 л)', kind: 'vodka' },
  { label: 'Выпить пиво (0,5 л)', kind: 'beer' },
  { label: 'Плюнуть в экран', kind: 'spit' },
  { label: 'Покурить сигарету', kind: 'smoke' },
  { label: 'Покурить кальян', kind: 'hookah' },
];

let win = null;
let tray = null;
let watcher = null;
let cursorTimer = null;
let currentDisplay = null;

function screenshotsDir() {
  const i = process.argv.indexOf('--screenshots');
  return i > 0 ? path.resolve(process.argv[i + 1] ?? 'screenshots') : null;
}

if (!screenshotsDir() && !app.requestSingleInstanceLock()) {
  app.quit();
}

/** Developer aid: `--demo vodka|beer|sit|sleep|stretch|spit|smoke|hookah` starts that action right after launch. */
function demoKind() {
  const i = process.argv.indexOf('--demo');
  const kind = i > 0 ? process.argv[i + 1] : null;
  return ACTIONS.some((a) => a.kind === kind) ? kind : null;
}

/** Everything the renderer needs to lay out the layer, in the window's own y-down DIP coordinates. */
function screenInfo(display) {
  const b = display.bounds, w = display.workArea;
  const p = screen.getCursorScreenPoint();
  return {
    width: b.width, height: b.height, dpr: display.scaleFactor,
    work: { x: w.x - b.x, y: w.y - b.y, width: w.width, height: w.height },
    cursor: { x: p.x - b.x, y: b.height - (p.y - b.y) },
  };
}

function createWindow(display) {
  const b = display.bounds;
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    transparent: true, frame: false, hasShadow: false, resizable: false, movable: false, fullscreenable: false,
    skipTaskbar: true, focusable: false, alwaysOnTop: true, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.webContents.once('did-finish-load', () => {
    const kind = demoKind();
    if (kind) setTimeout(() => win.webContents.send('trigger', kind), 1500);
  });
  win.on('closed', () => { win = null; });
}

function startCursorFeed() {
  cursorTimer = setInterval(() => {
    if (!win || !currentDisplay) return;
    const p = screen.getCursorScreenPoint(), b = currentDisplay.bounds;
    win.webContents.send('cursor', { x: p.x - b.x, y: b.height - (p.y - b.y) });
  }, CURSOR_POLL_MS);
}

function relayoutOnDisplayChange() {
  const update = () => {
    if (!win) return;
    currentDisplay = screen.getPrimaryDisplay();
    win.setBounds(currentDisplay.bounds);
    win.webContents.send('screen', screenInfo(currentDisplay));
  };
  screen.on('display-metrics-changed', update);
  screen.on('display-added', update);
  screen.on('display-removed', update);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')).resize({ width: TRAY_SIZE, height: TRAY_SIZE });
  tray = new Tray(icon);
  tray.setToolTip('Чекушка');
  const menu = Menu.buildFromTemplate([
    ...ACTIONS.map((a) => ({ label: a.label, click: () => win?.webContents.send('trigger', a.kind) })),
    { type: 'separator' },
    { label: 'Выход', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

ipcMain.handle('screen:get', () => screenInfo(currentDisplay));
ipcMain.on('mouse:ignore', (_e, ignore) => win?.setIgnoreMouseEvents(ignore));
ipcMain.on('app:error', (_e, message) => console.error(message));

app.whenReady().then(async () => {
  const shotsDir = screenshotsDir();
  if (shotsDir) {                                           // documentation mode: render the pictures and quit
    try {
      await require('./screenshots').renderAll(shotsDir);
      app.exit(0);
    } catch (err) {
      console.error(err);
      app.exit(1);
    }
    return;
  }
  if (process.platform === 'darwin') app.dock?.hide();      // menu-bar only, no Dock icon
  currentDisplay = screen.getPrimaryDisplay();
  createWindow(currentDisplay);
  createTray();
  startCursorFeed();
  relayoutOnDisplayChange();
  watcher = new SystemWatcher((event) => win?.webContents.send('system-event', event));
  watcher.start();
});

app.on('second-instance', () => win?.showInactive());
app.on('window-all-closed', () => { if (!screenshotsDir()) app.quit(); });
app.on('before-quit', () => { watcher?.stop(); clearInterval(cursorTimer); });
