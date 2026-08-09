const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherApi', {
  minimize: () => ipcRenderer.invoke('app/window/minimize'),
  maximize: () => ipcRenderer.invoke('app/window/maximize'),
  close: () => ipcRenderer.invoke('app/window/close'),
  getAppInfo: () => ipcRenderer.invoke('app/getInfo'),
  getWhatsNew: () => ipcRenderer.invoke('app/whatsnew'),
  markWhatsNewSeen: () => ipcRenderer.invoke('app/whatsnew/markSeen'),
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

  installUpdate: () => ipcRenderer.invoke('app/update/startDownload'),
  remindUpdateLater: () => Promise.resolve({}),
  quitAndInstallUpdate: () => ipcRenderer.invoke('app/update/install'),
  onUpdateAvailable: (handler) => {
    ipcRenderer.removeAllListeners('update/status');
    ipcRenderer.on('update/status', (e, payload) => {
      if (payload.state === 'available' || payload.state === 'not-available') handler(payload);
    });
  },
  onUpdateProgress: (handler) => {
    ipcRenderer.removeAllListeners('update/progress');
    ipcRenderer.on('update/status', (e, payload) => {
      if (payload.state === 'downloading') handler(payload);
    });
  },
  onUpdateDownloaded: (handler) => {
    ipcRenderer.removeAllListeners('update/downloaded');
    ipcRenderer.on('update/status', (e, payload) => {
      if (payload.state === 'downloaded') handler(payload);
    });
  },
  onUpdateError: (handler) => {
    ipcRenderer.removeAllListeners('update/error');
    ipcRenderer.on('update/status', (e, payload) => {
      if (payload.state === 'error') handler(payload);
    });
  }
});
