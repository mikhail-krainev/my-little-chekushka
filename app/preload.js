'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel) => (callback) => {
  ipcRenderer.on(channel, (_event, payload) => callback(payload));
};

contextBridge.exposeInMainWorld('mellstroy', {
  getScreen: () => ipcRenderer.invoke('screen:get'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('mouse:ignore', Boolean(ignore)),
  reportError: (message) => ipcRenderer.send('app:error', String(message)),
  onCursor: subscribe('cursor'),
  onScreen: subscribe('screen'),
  onSystemEvent: subscribe('system-event'),
  onTrigger: subscribe('trigger'),
});
