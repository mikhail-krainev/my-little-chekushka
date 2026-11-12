'use strict';
// Generate isolated README media, never recording the user's desktop.
// Run: npm run showcase (ffmpeg must be installed and available on PATH).
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

app.whenReady().then(async () => {
  const out = path.resolve(process.argv[2] || '../docs/screenshots');
  let win;
  let frames;
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    fs.mkdirSync(out, { recursive: true });
    frames = fs.mkdtempSync(path.join(os.tmpdir(), 'chekushka-showcase-'));
    win = new BrowserWindow({ show: false, width: 1200, height: 640, webPreferences: { sandbox: true } });
    await win.loadFile(path.join(__dirname, 'src/showcase.html'));
    const started = Date.now();
    while (!await win.webContents.executeJavaScript('window.__showcaseReady')) {
      const error = await win.webContents.executeJavaScript('window.__showcaseError');
      if (error) throw new Error(error);
      if (Date.now() - started > 15000) throw new Error('Showcase sprite loading timed out');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    for (const set of ['life', 'mischief']) {
      for (let i = 0; i < 150; i++) {
        const png = await win.webContents.executeJavaScript(`window.drawShowcase(${i / 15}, ${JSON.stringify(set)})`);
        const bytes = Buffer.from(png, 'base64');
        fs.writeFileSync(path.join(frames, `${String(i).padStart(3, '0')}.png`), bytes);
        if (i === 67) fs.writeFileSync(path.join(out, `${set}.png`), bytes);
      }
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '15', '-i', path.join(frames, '%03d.png'),
        '-filter_complex', 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
        '-loop', '0', path.join(out, `${set}.gif`)], { stdio: 'inherit' });
      console.log(`wrote ${set}.png and ${set}.gif`);
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    win?.destroy();
    if (frames) fs.rmSync(frames, { recursive: true, force: true });
    app.exit(process.exitCode || 0);
  }
});
