'use strict';
// Wires the update flow into the app: the platform backend, the banner and the release page fallback.
const { app, net, shell } = require('electron');
const { UpdateBanner } = require('./banner');
const { UpdateManager } = require('./manager');

const RELEASES_PAGE = 'https://github.com/mikhail-krainev/my-little-chekushka/releases/latest';

/** The backend for this platform, or null where updates are not supported (or the app runs from sources). */
function createBackend() {
  if (!app.isPackaged) return null;
  const currentVersion = app.getVersion();
  if (process.platform === 'win32') {
    const { autoUpdater } = require('electron-updater');
    const { WindowsUpdater } = require('./windows');
    return new WindowsUpdater(autoUpdater, currentVersion);
  }
  if (process.platform === 'darwin') {
    const { MacUpdater } = require('./mac');
    const mac = new MacUpdater({ currentVersion, execPath: process.execPath, arch: process.arch, fetch: net.fetch });
    // The bundle has been swapped on disk: start the new one from the same path.
    return { check: () => mac.check(), download: (p) => mac.download(p), install: async () => { await mac.install(); app.relaunch(); app.exit(0); } };
  }
  return null;
}

/** Starts periodic checks. Returns the manager, or null when this build cannot update itself. */
function startUpdates({ onChange }) {
  const backend = createBackend();
  if (!backend) return null;
  let manager = null;
  const banner = new UpdateBanner((action) => {
    if (action === 'install') manager.install();
    else if (action === 'later') manager.dismiss();
    else if (action === 'openPage') shell.openExternal(RELEASES_PAGE).catch((err) => console.error('opening the releases page failed:', err.message));
  });
  manager = new UpdateManager({ backend, currentVersion: app.getVersion(), banner, onChange });
  manager.start();
  return manager;
}

module.exports = { startUpdates };
