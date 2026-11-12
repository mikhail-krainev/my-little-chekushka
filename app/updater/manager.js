'use strict';
// Update flow shared by every platform: check now and then, offer the update in a banner, download it, install it.
// A backend does the platform part: { check() → { version } | null, download(onProgress 0…1), install() }.

const FIRST_CHECK_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const UP_TO_DATE_BANNER_MS = 5_000;

/** An error whose message is written for the user (shown in the banner as is). */
class UpdateError extends Error {}

class UpdateManager {
  /**
   * @param opts.backend         platform backend (see the top of this file)
   * @param opts.currentVersion  version of the running app
   * @param opts.banner          { show(state), hide() }
   * @param opts.onChange        called with the state whenever it changes (tray menu)
   * @param opts.log             (message) => void
   * @param opts.timers          setTimeout/setInterval/clearTimeout/clearInterval (tests pass fakes)
   */
  constructor({ backend, currentVersion, banner, onChange = () => {}, log = console.error, timers = globalThis }) {
    this.backend = backend;
    this.currentVersion = currentVersion;
    this.banner = banner;
    this.onChange = onChange;
    this.log = log;
    this.timers = timers;
    this.state = { phase: 'idle', current: currentVersion };
    this.hideTimer = null;
    this.firstTimer = null;
    this.interval = null;
  }

  start() {
    this.firstTimer = this.timers.setTimeout(() => this.check(), FIRST_CHECK_DELAY_MS);
    this.interval = this.timers.setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  stop() {
    this.timers.clearTimeout(this.firstTimer);
    this.timers.clearInterval(this.interval);
    this.timers.clearTimeout(this.hideTimer);
  }

  /** The version waiting to be installed, or null. */
  get availableVersion() {
    return ['available', 'error'].includes(this.state.phase) ? this.state.version ?? null : null;
  }

  get isBusy() {
    return ['checking', 'downloading', 'installing'].includes(this.state.phase);
  }

  /** Looks for a newer release. `manual` (from the menu) also reports "up to date" and failures in the banner. */
  async check({ manual = false } = {}) {
    if (this.isBusy) return;
    const before = this.state;
    this.#set({ phase: 'checking' }, false);
    let found;
    try {
      found = await this.backend.check();
    } catch (err) {
      this.log(`update check failed: ${err.stack ?? err.message}`);
      if (manual) this.#set({ phase: 'error', message: messageOf(err, 'Не удалось проверить обновления. Проверьте интернет.') }, true);
      else this.#set(before.phase === 'available' ? before : { phase: 'idle' }, false);
      return;
    }
    if (found) {
      this.#set({ phase: 'available', version: found.version }, true);
    } else {
      this.#set({ phase: 'upToDate' }, manual);
      if (manual) this.#hideLater();
    }
  }

  /** "Обновить": download, then install (the app quits or restarts on its own). */
  async install() {
    const version = this.availableVersion;
    if (!version || this.isBusy) return;
    this.#set({ phase: 'downloading', version, progress: 0 }, true);
    try {
      await this.backend.download((progress) => this.#progress(version, progress));
      this.#set({ phase: 'installing', version }, true);
      await this.backend.install();
    } catch (err) {
      this.log(`update to ${version} failed: ${err.stack ?? err.message}`);
      this.#set({ phase: 'error', version, message: messageOf(err, 'Не получилось установить обновление.') }, true);
    }
  }

  /** "Позже" / "Закрыть": hide the banner; the next scheduled check offers the update again. */
  dismiss() {
    if (this.isBusy) return;
    this.timers.clearTimeout(this.hideTimer);
    this.banner.hide();
  }

  #progress(version, progress) {
    const value = Math.max(0, Math.min(1, Number(progress) || 0));
    if (this.state.phase !== 'downloading' || Math.round(value * 100) === Math.round(this.state.progress * 100)) return;
    this.#set({ phase: 'downloading', version, progress: value }, true);
  }

  #hideLater() {
    this.timers.clearTimeout(this.hideTimer);
    this.hideTimer = this.timers.setTimeout(() => this.banner.hide(), UP_TO_DATE_BANNER_MS);
  }

  #set(next, showBanner) {
    this.state = { ...next, current: this.currentVersion };
    if (showBanner) {
      this.timers.clearTimeout(this.hideTimer);
      this.banner.show(this.state);
    }
    this.onChange(this.state);
  }
}

const messageOf = (err, fallback) => (err instanceof UpdateError ? err.message : fallback);

module.exports = { UpdateManager, UpdateError, CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS };
