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
  getSettings: () => ipcRenderer.invoke('settings:get'),
  onSettings: subscribe('settings'),
  showMenu: () => ipcRenderer.send('menu:show'),
  onFolderOpened: subscribe('folder-opened'),
  listFolders: () => ipcRenderer.invoke('folders:list'),
  moveFolder: (name, point) => ipcRenderer.send('folders:move', String(name), { x: Number(point.x), y: Number(point.y) }),
  throwCursor: (request) => ipcRenderer.send('cursor:throw', request),
});
