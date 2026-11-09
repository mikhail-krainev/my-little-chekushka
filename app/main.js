'use strict';
const path = require('node:path');
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = require('electron');
const { flingCursor } = require('./cursor');
const { DesktopFolders, FolderWindowWatcher, createDesktopBackend } = require('./desktop');
const { Settings } = require('./settings');
const { makeStationary } = require('./stationary');
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
  { label: 'Съесть бургер', kind: 'burger' },
  { label: 'Съесть пиццу', kind: 'pizza' },
  { label: 'Сказать фразу', kind: 'say' },
  { label: 'Подвинуть папку', kind: 'pushFolder', setting: 'moveFolders' },
  { label: 'Выкинуть курсор', kind: 'throwCursor', setting: 'throwCursor' },
  { label: 'Крутить собак онлайн', kind: 'search', setting: 'searchPrank' },
];

/** Switches in the right-click and tray menus. */
const SWITCHES = [
  { label: 'Заглядывать в открытые папки', setting: 'peekFolders' },
  { label: 'Двигать папки на рабочем столе', setting: 'moveFolders' },
  { label: 'Выкидывать курсор', setting: 'throwCursor' },
  { label: 'Искать «крутить собак онлайн»', setting: 'searchPrank' },
  { label: 'Драться с курсором', setting: 'fightCursor' },
];

let win = null;
let tray = null;
let watcher = null;
let cursorTimer = null;
let currentDisplay = null;
let settings = null;
let desktop = null;              // platform backend from desktop.js, null where unsupported
let folderWindows = null;
let desktopFolders = null;

function screenshotsDir() {
  const i = process.argv.indexOf('--screenshots');
  return i > 0 ? path.resolve(process.argv[i + 1] ?? 'screenshots') : null;
}

// Phrases are also started from the tray menu, where there is no click in the page to unlock audio.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!screenshotsDir() && !app.requestSingleInstanceLock()) {
  app.quit();
}

/** Developer aid: `--demo <kind>` (any kind from ACTIONS, e.g. smoke, search, pushFolder) starts that action after launch. */
function demoKind() {
  const i = process.argv.indexOf('--demo');
  const kind = i > 0 ? process.argv[i + 1] : null;
  return ACTIONS.some((a) => a.kind === kind) ? kind : null;
}

// MARK: Coordinates. The renderer works in the display's own space with y up; the OS uses global DIP with y down.

const toLayer = (p) => {
  const b = currentDisplay.bounds;
  return { x: p.x - b.x, y: b.height - (p.y - b.y) };
};
const fromLayer = (p) => {
  const b = currentDisplay.bounds;
  return { x: p.x + b.x, y: b.y + b.height - p.y };
};

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
  makeStationary(win);                       // after the two calls above, which add their own flags
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

/** A punch: moves the cursor a short way (layer units, y up), never off the display. */
function nudgeCursor(request) {
  const dx = Number(request?.dx), dy = Number(request?.dy);
  if (!settings.get('fightCursor') || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const limit = 120;
  const b = currentDisplay.bounds, from = screen.getCursorScreenPoint();
  const to = {
    x: Math.min(Math.max(from.x + Math.max(-limit, Math.min(limit, dx)), b.x + 2), b.x + b.width - 2),
    y: Math.min(Math.max(from.y - Math.max(-limit, Math.min(limit, dy)), b.y + 2), b.y + b.height - 2),
  };
  const duration = Math.min(Math.max(Number(request.duration) || 0.12, 0.05), 0.5);
  flingCursor(screen, { from, to, duration, lift: 0 }).catch((err) => console.error('pushing the cursor failed:', err.message));
}

// MARK: Menus

const sendTrigger = (kind) => win?.webContents.send('trigger', kind);

function setSwitch(name, value) {
  settings.set(name, value);
  win?.webContents.send('settings', settings.all());
  rebuildTrayMenu();
}

async function resetFolders() {
  try {
    const count = await desktopFolders.reset();
    if (count > 0) sendTrigger('foldersReset');
  } catch (err) {
    console.error('folder reset failed:', err.message);
  }
  rebuildTrayMenu();
}

/** The same menu on right-clicking the mascot and in the tray: switches, folder reset, actions, exit. */
function menuTemplate() {
  const canMoveFolders = Boolean(desktopFolders);
  return [
    ...SWITCHES.filter((s) => s.setting !== 'moveFolders' || canMoveFolders).map((s) => ({
      label: s.label, type: 'checkbox', checked: settings.get(s.setting), click: (item) => setSwitch(s.setting, item.checked),
    })),
    { label: 'Вернуть папки на место', enabled: canMoveFolders && desktopFolders.hasMoved, click: resetFolders },
    { type: 'separator' },
    {
      label: 'Действия',
      submenu: ACTIONS.filter((a) => a.kind !== 'pushFolder' || canMoveFolders).map((a) => ({
        label: a.label, enabled: !a.setting || settings.get(a.setting), click: () => sendTrigger(a.kind),
      })),
    },
    { type: 'separator' },
    { label: 'Выход', click: () => app.quit() },
  ];
}

function rebuildTrayMenu() {
  tray?.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')).resize({ width: TRAY_SIZE, height: TRAY_SIZE });
  tray = new Tray(icon);
  tray.setToolTip('Чекушка');
  rebuildTrayMenu();
}

// MARK: Desktop pranks

function startDesktop() {
  desktop = createDesktopBackend({ screen, desktopDir: app.getPath('desktop') });
  if (!desktop) return;
  desktopFolders = new DesktopFolders(desktop, app.getPath('userData'));
  folderWindows = new FolderWindowWatcher(desktop, (rect) => {
    if (!win || !settings.get('peekFolders')) return;
    const b = currentDisplay.bounds;
    const visible = rect.x < b.x + b.width && rect.x + rect.width > b.x && rect.y < b.y + b.height && rect.y + rect.height > b.y;
    if (!visible) return;
    const topLeft = toLayer({ x: rect.x, y: rect.y });
    win.webContents.send('folder-opened', { x: topLeft.x, y: topLeft.y - rect.height, width: rect.width, height: rect.height });
  });
  folderWindows.start();
}

async function listFolders() {
  if (!desktopFolders || !settings.get('moveFolders')) return [];
  try {
    return (await desktopFolders.list()).map((f) => ({ name: f.name, ...toLayer(f) }));
  } catch (err) {
    console.error('desktop folders:', err.message);
    return [];
  }
}

function moveFolder(name, point) {
  if (!desktopFolders || !settings.get('moveFolders') || typeof name !== 'string') return;
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  const p = fromLayer(point);
  const hadMoved = desktopFolders.hasMoved;
  desktopFolders.move(name, p.x, p.y)
    .then(() => { if (desktopFolders.hasMoved !== hadMoved) rebuildTrayMenu(); })
    .catch((err) => console.error(`moving folder "${name}" failed:`, err.message));
}

function throwCursor(request) {
  if (!settings.get('throwCursor') || !Number.isFinite(request?.to?.x) || !Number.isFinite(request?.to?.y)) return;
  const b = currentDisplay.bounds;
  const to = fromLayer(request.to);
  const target = { x: Math.min(Math.max(to.x, b.x + 2), b.x + b.width - 2), y: Math.min(Math.max(to.y, b.y + 2), b.y + b.height - 2) };
  const duration = Math.min(Math.max(Number(request.duration) || 0.5, 0.1), 2);
  flingCursor(screen, { from: screen.getCursorScreenPoint(), to: target, duration, lift: 160 })
    .catch((err) => console.error('throwing the cursor failed:', err.message));
}

ipcMain.handle('screen:get', () => screenInfo(currentDisplay));
ipcMain.on('mouse:ignore', (_e, ignore) => win?.setIgnoreMouseEvents(ignore));
ipcMain.on('app:error', (_e, message) => console.error(message));
ipcMain.handle('settings:get', () => settings.all());
ipcMain.on('menu:show', () => win && Menu.buildFromTemplate(menuTemplate()).popup({ window: win }));
ipcMain.handle('folders:list', () => listFolders());
ipcMain.on('folders:move', (_e, name, point) => moveFolder(name, point));
ipcMain.on('cursor:throw', (_e, request) => throwCursor(request));
ipcMain.on('cursor:nudge', (_e, request) => nudgeCursor(request));

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
  settings = new Settings(app.getPath('userData'));
  createWindow(currentDisplay);
  startDesktop();
  createTray();
  startCursorFeed();
  relayoutOnDisplayChange();
  watcher = new SystemWatcher((event) => win?.webContents.send('system-event', event));
  watcher.start();
});

app.on('second-instance', () => win?.showInactive());
app.on('window-all-closed', () => { if (!screenshotsDir()) app.quit(); });
app.on('before-quit', () => {
  watcher?.stop();
  folderWindows?.stop();
  desktop?.dispose();
  clearInterval(cursorTimer);
});
