'use strict';
// `electron . --screenshots <dir>` renders the README pictures (pose sheets and broken glass) and quits.
const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow } = require('electron');

const SHEETS = ['poses', 'drinks', 'spit', 'smoke', 'hookah', 'pranks', 'phrases', 'glass'];
const POLL_MS = 50;
const TIMEOUT_MS = 15_000;

async function waitFor(win, expression) {
  const started = Date.now();
  for (;;) {
    const value = await win.webContents.executeJavaScript(expression);
    if (value) return value;
    if (Date.now() - started > TIMEOUT_MS) throw new Error(`timeout waiting for ${expression}`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function renderSheet(name, outDir) {
  const win = new BrowserWindow({ width: 1040, height: 800, show: false, useContentSize: true, webPreferences: { sandbox: true } });
  try {
    await win.loadFile(path.join(__dirname, 'src', 'sheet.html'), { query: { set: name } });
    const error = await win.webContents.executeJavaScript('window.__sheetError');
    if (error) throw new Error(error);
    const size = await waitFor(win, 'window.__sheetSize');
    win.setContentSize(Math.ceil(size.width), Math.ceil(size.height));
    await new Promise((r) => setTimeout(r, 200));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height) });
    const file = path.join(outDir, `${name}.png`);
    fs.writeFileSync(file, image.toPNG());
    console.log(`wrote ${file}`);
  } finally {
    win.destroy();
  }
}

async function renderAll(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of SHEETS) await renderSheet(name, outDir);
}

module.exports = { renderAll };
