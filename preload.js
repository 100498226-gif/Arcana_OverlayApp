const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  collapseWindow: () => ipcRenderer.send('window:collapse'),
  expandWindow:  () => ipcRenderer.send('window:expand'),
});
