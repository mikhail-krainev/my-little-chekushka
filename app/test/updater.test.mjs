import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { isNewer, parseVersion } = require('../updater/version.js');
const { UpdateManager, UpdateError } = require('../updater/manager.js');
const { MacUpdater, SWAP_SCRIPT, adminScript, bundleOf, pickMacAsset } = require('../updater/mac.js');
const { WindowsUpdater } = require('../updater/windows.js');

const isMac = process.platform === 'darwin';
const REPO_DOWNLOAD = 'https://github.com/mikhail-krainev/my-little-chekushka/releases/download';

test('versions: only plain releases count, compared part by part', () => {
  assert.deepEqual(parseVersion('v1.10.2'), [1, 10, 2]);
  assert.equal(parseVersion('1.4.0-beta.1'), null);
  assert.equal(isNewer('1.10.0', '1.9.9'), true);
  assert.equal(isNewer('v2.0.0', '1.99.99'), true);
  assert.equal(isNewer('1.3.0', '1.3.0'), false);
  assert.equal(isNewer('1.2.9', '1.3.0'), false);
  assert.equal(isNewer('garbage', '1.0.0'), false);
});

// MARK: the shared flow

function fakeTimers() {
  const pending = [];
  return {
    pending,
    setTimeout: (fn, ms) => { const t = { fn, ms }; pending.push(t); return t; },
    clearTimeout: (t) => { const i = pending.indexOf(t); if (i >= 0) pending.splice(i, 1); },
    setInterval: () => ({}),
    clearInterval: () => {},
  };
}

function harness(backend) {
  const shown = [];
  let hidden = 0;
  const banner = { show: (s) => shown.push(s), hide: () => { hidden += 1; } };
  const timers = fakeTimers();
  const manager = new UpdateManager({ backend, currentVersion: '1.3.0', banner, timers, log: () => {} });
  return { manager, shown, timers, hidden: () => hidden };
}

test('an update is offered, downloaded with progress and installed', async () => {
  const calls = [];
  const backend = {
    check: async () => ({ version: '1.4.0' }),
    download: async (progress) => { calls.push('download'); progress(0.5); progress(1); },
    install: async () => { calls.push('install'); },
  };
  const { manager, shown } = harness(backend);
  await manager.check();
  assert.equal(manager.availableVersion, '1.4.0');
  assert.deepEqual(shown.at(-1), { phase: 'available', version: '1.4.0', current: '1.3.0' });
  await manager.install();
  assert.deepEqual(calls, ['download', 'install']);
  assert.deepEqual(shown.map((s) => s.phase), ['available', 'downloading', 'downloading', 'downloading', 'installing']);
  assert.equal(shown.find((s) => s.progress === 0.5)?.phase, 'downloading');
});

test('a scheduled check stays quiet when offline or up to date; a manual one says so', async () => {
  let fail = true;
  const backend = { check: async () => { if (fail) throw new Error('offline'); return null; } };
  const { manager, shown, timers, hidden } = harness(backend);
  await manager.check();
  assert.equal(shown.length, 0);
  assert.equal(manager.state.phase, 'idle');
  await manager.check({ manual: true });
  assert.equal(shown.at(-1).phase, 'error');
  fail = false;
  await manager.check();
  assert.equal(shown.length, 1);
  await manager.check({ manual: true });
  assert.equal(shown.at(-1).phase, 'upToDate');
  timers.pending.at(-1).fn();
  assert.equal(hidden(), 1);
});

test('a failed install shows the user-facing reason and can be retried', async () => {
  let attempts = 0;
  const backend = {
    check: async () => ({ version: '1.4.0' }),
    download: async () => { attempts += 1; if (attempts === 1) throw new UpdateError('Установка отменена'); },
    install: async () => {},
  };
  const { manager, shown } = harness(backend);
  await manager.check();
  await manager.install();
  assert.deepEqual(shown.at(-1), { phase: 'error', version: '1.4.0', message: 'Установка отменена', current: '1.3.0' });
  assert.equal(manager.availableVersion, '1.4.0');
  await manager.install();
  assert.equal(shown.at(-1).phase, 'installing');
});

test('windows: electron-updater only downloads and installs when asked', async () => {
  const events = [];
  const fake = {
    listeners: {},
    on(name, fn) { this.listeners[name] = fn; },
    removeListener(name) { delete this.listeners[name]; },
    checkForUpdates: async () => ({ updateInfo: { version: '1.4.0' } }),
    downloadUpdate: async () => { fake.listeners['download-progress']({ percent: 40 }); },
    quitAndInstall: (silent, runAfter) => events.push({ silent, runAfter }),
  };
  const updater = new WindowsUpdater(fake, '1.3.0');
  assert.equal(fake.autoDownload, false);
  assert.equal(fake.autoInstallOnAppQuit, false);
  assert.deepEqual(await updater.check(), { version: '1.4.0' });
  const progress = [];
  await updater.download((p) => progress.push(p));
  assert.deepEqual(progress, [0.4]);
  assert.equal(fake.listeners['download-progress'], undefined);
  fake.checkForUpdates = async () => ({ updateInfo: { version: '1.3.0' } });
  assert.equal(await updater.check(), null);
});

// MARK: macOS

const release = (version, assets) => ({ tag_name: `v${version}`, draft: false, prerelease: false, assets });
const zipAsset = (version, arch, extra = {}) => ({
  name: `Chekushka-${version}-mac-${arch}.zip`, size: 10, digest: `sha256:${'a'.repeat(64)}`,
  browser_download_url: `${REPO_DOWNLOAD}/v${version}/Chekushka-${version}-mac-${arch}.zip`, ...extra,
});

test('mac: picks the zip for its own CPU and refuses one without a checksum or from elsewhere', () => {
  const r = release('1.4.0', [zipAsset('1.4.0', 'x64'), zipAsset('1.4.0', 'arm64')]);
  assert.equal(pickMacAsset(r, '1.4.0', 'arm64').name, 'Chekushka-1.4.0-mac-arm64.zip');
  assert.equal(pickMacAsset(release('1.4.0', [zipAsset('1.4.0', 'arm64', { digest: null })]), '1.4.0', 'arm64'), null);
  assert.equal(pickMacAsset(release('1.4.0', [zipAsset('1.4.0', 'arm64', { browser_download_url: 'https://evil.example/x.zip' })]), '1.4.0', 'arm64'), null);
  assert.equal(pickMacAsset(r, '1.4.0', 'ppc'), null);
});

test('mac: finds the bundle around the executable', () => {
  assert.equal(bundleOf('/Applications/Chekushka.app/Contents/MacOS/Chekushka'), '/Applications/Chekushka.app');
  assert.equal(bundleOf('/usr/local/bin/node'), null);
});

test('mac: the password prompt quotes every path safely', () => {
  const script = adminScript('/tmp/a b/swap.sh', ['/Applications/It\'s "x".app'], 'Prompt');
  assert.match(script, /^do shell script quoted form of "\/bin\/sh" & " " & quoted form of "\/tmp\/a b\/swap.sh"/);
  assert.ok(script.includes('quoted form of "/Applications/It\'s \\"x\\".app"'));
  assert.ok(script.endsWith('with administrator privileges with prompt "Prompt"'));
});

// A fake Chekushka.app with just an Info.plist and a marker file.
function makeBundle(dir, version, { id = 'com.mikhailkrainev.chekushka', marker = version } = {}) {
  const app = path.join(dir, 'Chekushka.app');
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${id}</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
</dict></plist>`);
  fs.writeFileSync(path.join(app, 'Contents', 'MacOS', 'Chekushka'), '');
  fs.writeFileSync(path.join(app, 'Contents', marker), marker);
  return app;
}

function fakeGitHub(version, zipBytes, digest = crypto.createHash('sha256').update(zipBytes).digest('hex')) {
  const asset = zipAsset(version, 'arm64', { size: zipBytes.length, digest: `sha256:${digest}` });
  return async (url) => {
    if (url === 'feed') return { ok: true, json: async () => release(version, [asset]) };
    if (url === asset.browser_download_url) {
      const half = Math.floor(zipBytes.length / 2);
      return { ok: true, body: (async function* () { yield zipBytes.subarray(0, half); yield zipBytes.subarray(half); })() };
    }
    return { ok: false, status: 404 };
  };
}

function scenario(t, { newId, corrupt = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chekushka-updater-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installed = makeBundle(fs.mkdtempSync(path.join(root, 'apps-')), '1.3.0', { marker: 'only-in-old' });
  const build = makeBundle(fs.mkdtempSync(path.join(root, 'build-')), '1.4.0', { id: newId, marker: 'only-in-new' });
  const zip = path.join(root, 'update.zip');
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', build, zip]);
  const bytes = fs.readFileSync(zip);
  const fetch = fakeGitHub('1.4.0', bytes, corrupt ? '0'.repeat(64) : undefined);
  const updater = new MacUpdater({
    currentVersion: '1.3.0', execPath: path.join(installed, 'Contents', 'MacOS', 'Chekushka'), arch: 'arm64', fetch,
    feedUrl: 'feed', tempRoot: root,
  });
  return { root, installed, updater };
}

test('mac: downloads, verifies and swaps the whole bundle, leaving nothing of the old one', { skip: !isMac }, async (t) => {
  const { root, installed, updater } = scenario(t);
  assert.deepEqual(await updater.check(), { version: '1.4.0' });
  const progress = [];
  await updater.download((p) => progress.push(p));
  assert.equal(progress.at(-1), 1);
  await updater.install();
  const contents = path.join(installed, 'Contents');
  assert.ok(fs.existsSync(path.join(contents, 'only-in-new')));
  assert.equal(fs.existsSync(path.join(contents, 'only-in-old')), false);
  assert.deepEqual(fs.readdirSync(path.dirname(installed)), ['Chekushka.app']);         // no backup left behind
  assert.deepEqual(fs.readdirSync(root).filter((n) => n.startsWith('chekushka-update-')), []);   // staging cleaned up
});

test('mac: a corrupted download or a foreign bundle is never installed', { skip: !isMac }, async (t) => {
  for (const options of [{ corrupt: true }, { newId: 'com.example.other' }]) {
    const { installed, updater } = scenario(t, options);
    await updater.check();
    await assert.rejects(updater.download(() => {}));
    await assert.rejects(updater.install(), /не скачано/);
    assert.ok(fs.existsSync(path.join(installed, 'Contents', 'only-in-old')));
  }
});

test('mac: the swap script puts the old bundle back when the new one cannot be moved in', { skip: process.platform === 'win32' }, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chekushka-swap-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = path.join(root, 'swap.sh');
  fs.writeFileSync(script, SWAP_SCRIPT);
  const old = path.join(root, 'App.app');
  fs.mkdirSync(old);
  fs.writeFileSync(path.join(old, 'marker'), 'old');
  assert.throws(() => execFileSync('/bin/sh', [script, old, path.join(root, 'missing.app'), path.join(root, '.backup.app')], { stdio: 'ignore' }));
  assert.equal(fs.readFileSync(path.join(old, 'marker'), 'utf8'), 'old');
  assert.equal(fs.existsSync(path.join(root, '.backup.app')), false);
});
