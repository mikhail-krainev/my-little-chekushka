'use strict';
// macOS: the builds are not signed with an Apple Developer ID, and Squirrel.Mac (Electron's own updater) refuses
// unsigned apps. So the app updates itself: it reads the newest GitHub release, downloads the .zip for its CPU,
// checks its size and the sha256 GitHub publishes for every release asset, unpacks it with ditto, makes sure it is
// this app in the announced version, and swaps the whole bundle: the old Chekushka.app is moved aside, the new one
// put in its place and the old one deleted, so nothing of the previous version is left. The first update after a
// .pkg install needs an administrator password (the installer leaves the bundle owned by root); later ones do not.
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { UpdateError } = require('./manager');
const { isNewer, parseVersion } = require('./version');

const run = promisify(execFile);

const REPO = 'mikhail-krainev/my-little-chekushka';
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const BUNDLE_ID = 'com.mikhailkrainev.chekushka';
const USER_AGENT = 'Chekushka-Updater';
const ADMIN_PROMPT = 'ЧЕКУШКА-МЕЛЛ устанавливает обновление и заменяет старую версию в папке «Программы».';
const USER_CANCELLED = -128;     // AppleScript error number when the password dialog is cancelled

/** Replaces bundle $1 with bundle $2, keeping $1 at $3 until the new one is in place; puts it back on failure. */
const SWAP_SCRIPT = `set -e
old="$1"; new="$2"; backup="$3"
mv "$old" "$backup"
if mv "$new" "$old"; then
  rm -rf "$backup"
else
  mv "$backup" "$old"
  exit 1
fi
`;

/** The .zip for `arch` in a GitHub release object, with its sha256, or null when it is missing or has no digest. */
function pickMacAsset(release, version, arch) {
  const name = `Chekushka-${version}-mac-${arch}.zip`;
  const asset = (release?.assets ?? []).find((a) => a?.name === name);
  const digest = /^sha256:([0-9a-f]{64})$/.exec(asset?.digest ?? '');
  if (!asset || !digest || !Number.isInteger(asset.size) || asset.size <= 0) return null;
  if (!String(asset.browser_download_url).startsWith(`https://github.com/${REPO}/releases/download/`)) return null;
  return { name, url: asset.browser_download_url, size: asset.size, sha256: digest[1] };
}

/** The .app bundle around an executable (…/X.app/Contents/MacOS/X), or null when it is not inside one. */
function bundleOf(execPath) {
  const bundle = path.resolve(execPath, '..', '..', '..');
  return bundle.endsWith('.app') ? bundle : null;
}

/** An AppleScript string literal. */
const appleString = (text) => `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** AppleScript that runs `/bin/sh script args…` as root after asking for an administrator password. */
function adminScript(scriptPath, args, prompt = ADMIN_PROMPT) {
  const command = ['/bin/sh', scriptPath, ...args].map((part) => `quoted form of ${appleString(part)}`).join(' & " " & ');
  return `do shell script ${command} with administrator privileges with prompt ${appleString(prompt)}`;
}

/** True when the current user may replace `bundle` without a password: owns it and may write to its folder. */
function canReplaceAsUser(bundle) {
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    return fs.statSync(bundle).uid === process.getuid();
  } catch {
    return false;
  }
}

async function plistValue(plist, key) {
  const { stdout } = await run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist]);
  return stdout.trim();
}

class MacUpdater {
  /**
   * @param opts.currentVersion version of the running app
   * @param opts.execPath       process.execPath (locates the bundle to replace)
   * @param opts.arch           'arm64' | 'x64'
   * @param opts.fetch          fetch implementation (Electron's net.fetch: system proxy and certificates)
   * @param opts.feedUrl        GitHub "latest release" API URL (tests point it elsewhere)
   * @param opts.tempRoot       where downloads are staged
   */
  constructor({ currentVersion, execPath, arch, fetch, feedUrl = LATEST_RELEASE_URL, tempRoot = os.tmpdir() }) {
    this.currentVersion = currentVersion;
    this.execPath = execPath;
    this.arch = arch;
    this.fetch = fetch;
    this.feedUrl = feedUrl;
    this.tempRoot = tempRoot;
    this.pending = null;     // { version, asset }
    this.staged = null;      // { dir, app, version }
  }

  async check() {
    const response = await this.fetch(this.feedUrl, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`release feed answered ${response.status}`);
    const release = await response.json();
    const version = String(release?.tag_name ?? '').replace(/^v/, '');
    if (release?.draft || release?.prerelease || !parseVersion(version) || !isNewer(version, this.currentVersion)) return null;
    const asset = pickMacAsset(release, version, this.arch);
    if (!asset) throw new Error(`release ${version} has no verifiable zip for ${this.arch}`);
    this.pending = { version, asset };
    return { version };
  }

  async download(onProgress) {
    if (!this.pending) throw new UpdateError('Сначала нужно проверить обновления.');
    await this.#discardStaged();
    const { version, asset } = this.pending;
    const dir = await fsp.mkdtemp(path.join(this.tempRoot, 'chekushka-update-'));
    try {
      const zip = path.join(dir, asset.name);
      await this.#downloadTo(asset, zip, onProgress);
      const unpacked = path.join(dir, 'unpacked');
      await run('/usr/bin/ditto', ['-x', '-k', zip, unpacked]);
      await fsp.rm(zip, { force: true });
      const app = await this.#verifiedBundle(unpacked, version);
      this.staged = { dir, app, version };
    } catch (err) {
      await fsp.rm(dir, { recursive: true, force: true });
      throw err;
    }
  }

  /** Swaps the bundles, then the caller restarts the app from the same path. */
  async install() {
    if (!this.staged) throw new UpdateError('Обновление ещё не скачано.');
    const bundle = bundleOf(this.execPath);
    if (!bundle) throw new UpdateError('Не нашёл само приложение, обновление невозможно.');
    if (bundle.includes('/AppTranslocation/')) {
      throw new UpdateError('Переместите Chekushka в папку «Программы» и запустите оттуда, тогда обновление установится.');
    }
    const script = path.join(this.staged.dir, 'swap.sh');
    await fsp.writeFile(script, SWAP_SCRIPT, { mode: 0o700 });
    const backup = path.join(path.dirname(bundle), `.${path.basename(bundle, '.app')}-old-${process.pid}.app`);
    const args = [bundle, this.staged.app, backup];
    try {
      if (canReplaceAsUser(bundle)) await run('/bin/sh', [script, ...args]);
      else await run('/usr/bin/osascript', ['-e', adminScript(script, args)]);
    } catch (err) {
      if (String(err.stderr ?? err.message).includes(`(${USER_CANCELLED})`)) {
        throw new UpdateError('Установка отменена: без пароля администратора macOS не даёт заменить приложение.');
      }
      throw err;
    } finally {
      await this.#discardStaged();
    }
  }

  async #downloadTo(asset, file, onProgress) {
    const response = await this.fetch(asset.url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok || !response.body) throw new Error(`download answered ${response.status}`);
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(file);
    let received = 0;
    try {
      for await (const chunk of response.body) {
        received += chunk.length;
        if (received > asset.size) throw new Error('download is larger than announced');
        hash.update(chunk);
        if (!out.write(chunk)) await once(out, 'drain');
        onProgress(received / asset.size);
      }
    } finally {
      out.end();
      await once(out, 'close');
    }
    if (received !== asset.size) throw new Error(`download is ${received} bytes, expected ${asset.size}`);
    if (hash.digest('hex') !== asset.sha256) throw new UpdateError('Скачанный файл повреждён (не сошлась контрольная сумма). Попробуйте ещё раз.');
  }

  /** The single .app in `dir`, checked to be this app in `version`. */
  async #verifiedBundle(dir, version) {
    const apps = (await fsp.readdir(dir)).filter((name) => name.endsWith('.app'));
    if (apps.length !== 1) throw new Error(`expected one .app in the update, found ${apps.length}`);
    const app = path.join(dir, apps[0]);
    const plist = path.join(app, 'Contents', 'Info.plist');
    const id = await plistValue(plist, 'CFBundleIdentifier');
    const shortVersion = await plistValue(plist, 'CFBundleShortVersionString');
    if (id !== BUNDLE_ID || shortVersion !== version) throw new Error(`update bundle is ${id} ${shortVersion}, expected ${BUNDLE_ID} ${version}`);
    return app;
  }

  async #discardStaged() {
    if (!this.staged) return;
    const { dir } = this.staged;
    this.staged = null;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

module.exports = { MacUpdater, pickMacAsset, bundleOf, adminScript, SWAP_SCRIPT, LATEST_RELEASE_URL };
