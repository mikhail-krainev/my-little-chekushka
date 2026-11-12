'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updateBanner', {
  getState: () => ipcRenderer.invoke('update-banner:state'),
  onState: (callback) => ipcRenderer.on('update-banner:state', (_event, state) => callback(state)),
  act: (action) => ipcRenderer.send('update-banner:action', String(action)),
  fit: (height) => ipcRenderer.send('update-banner:fit', Number(height)),
});
