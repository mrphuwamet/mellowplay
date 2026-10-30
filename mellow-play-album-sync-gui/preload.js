// contextIsolation is on and nodeIntegration is off (main.js), so the page
// gets exactly this surface and nothing else — no raw fs/child_process
// reachable from anything the window ever loads.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('albumSync', {
  browseFolder: () => ipcRenderer.invoke('browse-folder'),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  checkLogin: (s) => ipcRenderer.invoke('check-login', s),
  listAlbums: (s) => ipcRenderer.invoke('list-albums', s),

  startSync: (s) => ipcRenderer.invoke('start-sync', s),
  stopSync: () => ipcRenderer.invoke('stop-sync'),
  isSyncRunning: () => ipcRenderer.invoke('is-sync-running'),
  onSyncLog: (cb) => ipcRenderer.on('sync-log', (_e, line) => cb(line)),
  onSyncStopped: (cb) => ipcRenderer.on('sync-stopped', () => cb()),

  startLumabooth: (s) => ipcRenderer.invoke('start-lumabooth', s),
  stopLumabooth: () => ipcRenderer.invoke('stop-lumabooth'),
  isLumaboothRunning: () => ipcRenderer.invoke('is-lumabooth-running'),
  onLumaboothLog: (cb) => ipcRenderer.on('lumabooth-log', (_e, line) => cb(line)),
  onLumaboothStopped: (cb) => ipcRenderer.on('lumabooth-stopped', () => cb()),
});
