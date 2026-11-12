'use strict';
// Windows: electron-updater reads latest.yml from the newest GitHub release, downloads the NSIS installer, checks its
// sha512 and runs it silently. The one-click installer uninstalls the previous version first (same appId, same
// per-user folder), so no old files or second copy are left behind, and starts the new version when it is done.
const { isNewer } = require('./version');

class WindowsUpdater {
  /** @param autoUpdater electron-updater's autoUpdater; @param currentVersion version of the running app */
  constructor(autoUpdater, currentVersion) {
    this.updater = autoUpdater;
    this.currentVersion = currentVersion;
    this.updater.autoDownload = false;          // only after the user said "Обновить"
    this.updater.autoInstallOnAppQuit = false;  // never behind the user's back
    this.updater.logger = null;
  }

  async check() {
    const result = await this.updater.checkForUpdates();
    const version = result?.updateInfo?.version;
    return version && isNewer(version, this.currentVersion) ? { version } : null;
  }

  async download(onProgress) {
    const listener = (info) => onProgress(Number(info?.percent) / 100);
    this.updater.on('download-progress', listener);
    try {
      await this.updater.downloadUpdate();
    } finally {
      this.updater.removeListener('download-progress', listener);
    }
  }

  async install() {
    // Silent install, then start the new version. Deferred so the banner can show "installing" first.
    setTimeout(() => this.updater.quitAndInstall(true, true), 300);
  }
}

module.exports = { WindowsUpdater };
