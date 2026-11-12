'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quitDialog', {
  quit: () => ipcRenderer.send('quit-dialog:quit'),
  stay: () => ipcRenderer.send('quit-dialog:stay'),
  say: (key) => ipcRenderer.send('quit-dialog:say', String(key)),
});
