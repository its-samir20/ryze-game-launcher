const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherApi', {
  minimize: () => ipcRenderer.invoke('app/window/minimize'),
  maximize: () => ipcRenderer.invoke('app/window/maximize'),
  close: () => ipcRenderer.invoke('app/window/close'),
  getAppInfo: () => ipcRenderer.invoke('app/getInfo'),
  checkForUpdates: () => ipcRenderer.invoke('app/update/check'),
  zoom: (dir) => ipcRenderer.invoke('app/zoom', dir),
  getSettings: () => ipcRenderer.invoke('app/settings/get'),
  setSettings: (patch) => ipcRenderer.invoke('app/settings/set', patch),
  selectFolder: () => ipcRenderer.invoke('app/folder/select'),
  openExternal: (url) => ipcRenderer.invoke('app/openExternal', url),
  getDevProfile: () => ipcRenderer.invoke('app/dev/profile'),

  syncGameList: () => ipcRenderer.invoke('launcher/syncGameList'),
  getDatabaseGames: (filter, offset, limit) => ipcRenderer.invoke('launcher/getDatabaseGames', { filter, offset, limit }),
  getMyGames: () => ipcRenderer.invoke('launcher/getMyGames'),
  addGame: (game) => ipcRenderer.invoke('launcher/addGame', game),
  toggleFavorite: (appId, exe) => ipcRenderer.invoke('launcher/toggleFavorite', { appId, exe }),
  deleteGame: (appId, exe) => ipcRenderer.invoke('launcher/deleteGame', { appId, exe }),
  createShortcut: (appId, exe) => ipcRenderer.invoke('launcher/createShortcut', { appId, exe }),

  selectGame: (game) => ipcRenderer.invoke('launcher/selectGame', game),
  launchGame: (game) => ipcRenderer.invoke('launcher/launchGame', game),
  stopGame: () => ipcRenderer.invoke('launcher/stopGame'),

  onGameExited: (handler) => {
    ipcRenderer.removeAllListeners('launcher/gameExited');
    ipcRenderer.on('launcher/gameExited', handler);
  },

  installUpdate: () => Promise.resolve({ ok: false, error: 'Updates disabled' }),
  remindUpdateLater: () => Promise.resolve({}),
  quitAndInstallUpdate: () => Promise.resolve({}),
  onUpdateAvailable: () => {},
  onUpdateProgress: () => {},
  onUpdateDownloaded: () => {},
  onUpdateError: () => {}
});
