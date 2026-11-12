'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel) => (callback) => {
  ipcRenderer.on(channel, (_event, payload) => callback(payload));
};

contextBridge.exposeInMainWorld('mellstroy', {
  getScreen: () => ipcRenderer.invoke('screen:get'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('mouse:ignore', Boolean(ignore)),
  reportError: (message) => ipcRenderer.send('app:error', String(message)),
  onFolderDrag: subscribe('folder-drag'),
  onLeftButton: subscribe('left-button'),
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
  wobbleCursor: (request) => ipcRenderer.send('cursor:wobble', request),
  nudgeCursor: (request) => ipcRenderer.send('cursor:nudge', request),
  toggleVoice: () => ipcRenderer.send('voice:toggle'),
  voiceHold: (seconds) => ipcRenderer.send('voice:hold', Number(seconds)),
  onVoiceState: subscribe('voice-state'),
  onVoiceHeard: subscribe('voice-heard'),
  onSayPhrase: subscribe('say-phrase'),
});
