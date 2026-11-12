'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceBridge', {
  config: () => ipcRenderer.invoke('voice:config'),
  state: (state) => ipcRenderer.send('voice:state', String(state)),
  error: (message) => ipcRenderer.send('voice:error', String(message)),
  heard: (text, confidence) => ipcRenderer.send('voice:heard', String(text), Number(confidence)),
  onHold: (callback) => ipcRenderer.on('voice:hold', (_event, ms) => callback(Number(ms))),
});
