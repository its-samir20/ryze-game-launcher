const { contextBridge, ipcRenderer } = require('electron');

const updateStatusHandlers = {
  available: null,
  progress: null,
  downloaded: null,
  error: null
};

function subscribeUpdateStatus(key, states, handler) {
  const list = Array.isArray(states) ? states : states == null ? null : [states];
  const prev = updateStatusHandlers[key];
  if (prev) ipcRenderer.removeListener('update/status', prev);
  const wrapped = (e, payload) => {
    if (payload && (list == null || list.includes(payload.state))) handler(payload);
  };
  updateStatusHandlers[key] = wrapped;
  ipcRenderer.on('update/status', wrapped);
}

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
  selectFile: () => ipcRenderer.invoke('app/file/select'),
  openExternal: (url) => ipcRenderer.invoke('app/openExternal', url),
  openDataFolder: () => ipcRenderer.invoke('app/openDataFolder'),
  openGitHub: () => ipcRenderer.invoke('app/openGitHub'),
  restart: () => ipcRenderer.invoke('app/restart'),
  getDevProfile: () => ipcRenderer.invoke('app/dev/profile'),

  syncGameList: () => ipcRenderer.invoke('launcher/syncGameList'),
  getDatabaseGames: (filter, offset, limit, category, sort) => ipcRenderer.invoke('launcher/getDatabaseGames', { filter, offset, limit, category, sort }),
  getMyGames: () => ipcRenderer.invoke('launcher/getMyGames'),
  getPlaytimes: () => ipcRenderer.invoke('launcher/getPlaytimes'),
  addGame: (game) => ipcRenderer.invoke('launcher/addGame', game),
  addCustomGame: (name, exePath) => ipcRenderer.invoke('launcher/addCustomGame', { name, exePath }),
  exportBackup: () => ipcRenderer.invoke('launcher/backup/export'),
  importBackup: () => ipcRenderer.invoke('launcher/backup/import'),
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
    subscribeUpdateStatus('available', ['available', 'not-available'], handler);
  },
  onUpdateProgress: (handler) => {
    subscribeUpdateStatus('progress', 'downloading', handler);
  },
  onUpdateDownloaded: (handler) => {
    subscribeUpdateStatus('downloaded', 'downloaded', handler);
  },
  onUpdateError: (handler) => {
    subscribeUpdateStatus('error', 'error', handler);
  }
});
