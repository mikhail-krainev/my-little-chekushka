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
    const { DESKTOP_DEMOS } = await import('./src/desktop-demo.mjs');
    const desktopOnly = process.argv.includes('--desktop');
    const sets = [
      ...(!desktopOnly ? ['life', 'mischief'].map((name) => ({ name, duration: 10, fps: 15 })) : []),
      ...DESKTOP_DEMOS.map((demo) => ({ ...demo, desktop: true, fps: 12 })),
    ];
    for (const demo of sets) {
      const set = demo.name;
      const frameDir = path.join(frames, set);
      fs.mkdirSync(frameDir);
      await win.loadFile(path.join(__dirname, `src/${demo.desktop ? 'desktop-showcase' : 'showcase'}.html`));
      const started = Date.now();
      while (!await win.webContents.executeJavaScript('window.__showcaseReady')) {
        const error = await win.webContents.executeJavaScript('window.__showcaseError');
        if (error) throw new Error(error);
        if (Date.now() - started > 15000) throw new Error('Showcase sprite loading timed out');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      for (let i = 0; i < demo.duration * demo.fps; i++) {
        const png = await win.webContents.executeJavaScript(`window.drawShowcase(${i / demo.fps}, ${JSON.stringify(set)})`);
        const bytes = Buffer.from(png, 'base64');
        fs.writeFileSync(path.join(frameDir, `${String(i).padStart(4, '0')}.png`), bytes);
        if (i === Math.round((demo.desktop ? demo.duration / 2 : 67 / 15) * demo.fps)) fs.writeFileSync(path.join(out, `${set}.png`), bytes);
      }
      const input = ['-framerate', String(demo.fps), '-i', path.join(frameDir, '%04d.png')];
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...input,
        '-filter_complex', 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
        '-loop', '0', path.join(out, `${set}.gif`)], { stdio: 'inherit' });
      console.log(`wrote ${set}.png and ${set}.gif`);
      if (demo.desktop) {
        const audioInputs = demo.speech.flatMap(({ key }) => ['-i', path.join(__dirname, 'assets/phrases', `${key}.ogg`)]);
        const delays = demo.speech.map(({ at }, i) => `[${i + 2}:a]adelay=${Math.round(at * 1000)}:all=1[a${i}]`);
        const mix = `[1:a]${demo.speech.map((_, i) => `[a${i}]`).join('')}amix=inputs=${demo.speech.length + 1}:duration=first:normalize=0[audio]`;
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...input,
          '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', ...audioInputs,
          '-filter_complex', [...delays, mix].join(';'), '-map', '0:v', '-map', '[audio]', '-t', String(demo.duration),
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'medium',
          '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(out, `${set}.mp4`)], { stdio: 'inherit' });
        console.log(`wrote ${set}.mp4 with reviewed voice clips`);
      }
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
