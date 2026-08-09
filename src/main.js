const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

const DISCORD_DETECTABLE_URL = 'https://discord.com/api/applications/detectable';
const UPDATE_REPO = 'its-samir20/ryze-game-launcher';
const UPDATE_DOWNLOAD_BASE = `https://github.com/${UPDATE_REPO}/releases/latest/download`;
const UPDATE_ATOM_URL = `https://github.com/${UPDATE_REPO}/releases.atom`;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function sendUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update/status', payload);
  }
}

autoUpdater.on('update-available', (info) => {
  sendUpdateStatus({ state: 'available', version: String(info.version || '') });
});
autoUpdater.on('update-not-available', () => {
  sendUpdateStatus({ state: 'not-available' });
});
autoUpdater.on('download-progress', (p) => {
  sendUpdateStatus({ state: 'downloading', percent: Math.round(p.percent || 0) });
});
autoUpdater.on('update-downloaded', (info) => {
  sendUpdateStatus({ state: 'downloaded', version: String(info.version || '') });
});
autoUpdater.on('error', (err) => {
  sendUpdateStatus({ state: 'error', message: String(err && err.message ? err.message : err) });
});

function cleanUpdaterCache() {
  try {
    const cacheDir = path.join(app.getPath('localAppData'), 'ryze-game-launcher-updater');
    if (!fs.existsSync(cacheDir)) return;
    const current = app.getVersion();
    let freed = 0;
    for (const entry of fs.readdirSync(cacheDir)) {
      const full = path.join(cacheDir, entry);
      try {
        if (entry === 'pending') {
          if (fs.statSync(full).isDirectory()) {
            fs.rmSync(full, { recursive: true, force: true });
            freed++;
          }
          continue;
        }
        if (entry.startsWith('temp-')) {
          fs.rmSync(full, { recursive: true, force: true });
          freed++;
          continue;
        }
        if (/\.exe(\.blockmap)?$/i.test(entry) && !entry.includes(current)) {
          fs.rmSync(full, { recursive: true, force: true });
          freed++;
        }
      } catch {
        // file in use or permission issue - skip
      }
    }
    if (freed > 0) {
      console.log(`[updater] cleaned ${freed} stale file(s) from update cache`);
    }
  } catch {
    // cache dir not accessible - ignore
  }
}

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

function decodeHtmlEntities(str) {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function parseLatestYml(text) {
  const version = /^version:\s*(\S+)\s*$/m.exec(String(text || ''));
  const pathM = /^path:\s*(\S+)\s*$/m.exec(String(text || ''));
  const urlM = /^\s*-\s*url:\s*(\S+)\s*$/m.exec(String(text || ''));
  return {
    version: version ? version[1] : '',
    path: pathM ? pathM[1] : '',
    url: urlM ? urlM[1] : ''
  };
}

function parseAtomEntry(entryStr) {
  const titleM = /<title>(.*?)<\/title>/.exec(entryStr);
  const updatedM = /<updated>(.*?)<\/updated>/.exec(entryStr);
  const contentM = /<content[^>]*>(.*?)<\/content>/s.exec(entryStr);
  const title = titleM ? decodeHtmlEntities(titleM[1]).trim() : '';
  const published = updatedM
    ? (new Date(updatedM[1]).toLocaleDateString() || '')
    : '';
  let notes = [];
  if (contentM) {
    const html = decodeHtmlEntities(decodeHtmlEntities(contentM[1]));
    const lis = html.match(/<li>(.*?)<\/li>/gs) || [];
    notes = lis
      .map((l) => decodeHtmlEntities(l.replace(/<\/?li>/g, '')).trim())
      .filter(Boolean);
    if (!notes.length) {
      const ps = html.match(/<p>(.*?)<\/p>/gs) || [];
      notes = ps
        .map((p) => decodeHtmlEntities(p.replace(/<\/?p>/g, '')).trim())
        .filter(Boolean);
    }
  }
  return { title, notes, published };
}

function splitAtomEntries(text) {
  return String(text || '').split(/<entry[ >]/).slice(1);
}

app.setPath('userData', path.join(app.getPath('appData'), 'ryze-game-launcher'));

let databaseCache = { loaded: false, gameListPath: null, games: [] };
let mainWindow = null;
let runningProc = null;
let tray = null;
let isQuitting = false;

const DEFAULT_SETTINGS = {
  theme: 'black',
  startup: false,
  autoScan: true,
  scanInterval: 60,
  gamePath: '',
  closeOnLaunch: false,
  reopenOnExit: true,
  trayOnClose: false,
  termsAccepted: false,
  lastSeenVersion: ''
};

let settings = { ...DEFAULT_SETTINGS };

function settingsFilePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsFilePath())) {
      const parsed = JSON.parse(fs.readFileSync(settingsFilePath(), 'utf8'));
      settings = { ...DEFAULT_SETTINGS, ...(parsed || {}) };
    }
  } catch {
    // ignore corrupt settings
  }
}

function saveSettings() {
  try {
    ensureDirSync(app.getPath('userData'));
    fs.writeFileSync(settingsFilePath(), JSON.stringify(settings, null, 2));
  } catch {
    // ignore
  }
}

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function getUserDataPaths() {
  const userData = app.getPath('userData');
  return {
    userData,
    myGamesPath: path.join(userData, 'myGames.json'),
    gameListPath: path.join(userData, 'gamelist.json'),
    gamesRoot: path.join(userData, 'games')
  };
}

function sanitizeFolderName(name) {
  return (name || 'UnknownApp')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\u0000-\u001F]/g, '_')
    .trim()
    .slice(0, 128);
}

function fallbackExeNameFromTitle(name) {
  const base = sanitizeFolderName(String(name || 'Game'))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const safeBase = base || 'Game';
  return safeBase.toLowerCase().endsWith('.exe') ? safeBase : `${safeBase}.exe`;
}

function normalizeExeRelPath(exeName) {
  return (exeName || '')
    .replace(/^>+/, '')
    .replace(/\\/g, path.sep)
    .replace(/\//g, path.sep);
}

function pickBestExecutable(appEntry) {
  const exes = Array.isArray(appEntry.executables) ? appEntry.executables : [];
  const nonLauncherWin32 = exes.find(e =>
    String(e?.os || '').toLowerCase() === 'win32' && !e?.is_launcher && e?.name);
  if (nonLauncherWin32) return nonLauncherWin32;
  const anyWin32 = exes.find(e =>
    String(e?.os || '').toLowerCase() === 'win32' && e?.name);
  return anyWin32 || null;
}

function cleanGameName(name) {
  const cleaned = String(name || '').replace(/^[_\-\s]+/, '').trim();
  return cleaned || String(name || '');
}

function toDatabaseGames(detectableApps) {
  const result = [];
  for (const appEntry of detectableApps || []) {
    if (!appEntry?.name) continue;
    const rawName = String(appEntry.name);
    if (!/[A-Za-z]/.test(rawName)) continue;
    if (/^[_\-\s]/.test(rawName)) continue;
    const bestExe = pickBestExecutable(appEntry);
    const appId = String(appEntry.id || '');
    const exeName = bestExe?.name ? String(bestExe.name) : fallbackExeNameFromTitle(appEntry.name);
    const iconHash = String(appEntry.icon_hash || '');
    result.push({
      id: appId,
      name: cleanGameName(rawName),
      exe: exeName,
      isLauncher: Boolean(bestExe?.is_launcher),
      usesNewDetection: !bestExe || !bestExe.name,
      icon: iconHash ? `https://cdn.discordapp.com/app-icons/${appId}/${iconHash}.png?size=128` : '',
      themes: Array.isArray(appEntry.themes) ? appEntry.themes : [],
      _nameLower: cleanGameName(rawName).toLowerCase()
    });
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

async function loadDatabaseCache(gameListPath) {
  if (!gameListPath) return;
  try {
    const detectableApps = await readJsonIfExists(gameListPath, []);
    databaseCache = { loaded: true, gameListPath, games: toDatabaseGames(detectableApps) };
  } catch {
    // keep old cache
  }
}

const GAME_ALIASES = {
  'gta': ['grand theft auto'],
  'gta v': ['grand theft auto v'],
  'gta v enhanced': ['grand theft auto v'],
  'gta5 enhanced': ['grand theft auto v'],
  'gta 5 enhanced': ['grand theft auto v'],
  'gta5': ['grand theft auto v'],
  'gta 5': ['grand theft auto v'],
  'gtav': ['grand theft auto v'],
  'gta iv': ['grand theft auto iv'],
  'gta 4': ['grand theft auto iv'],
  'gta san andreas': ['grand theft auto san andreas'],
  'gta sa': ['grand theft auto san andreas'],
  'gta vice city': ['grand theft auto vice city'],
  'gta 3': ['grand theft auto iii'],
  'gta 6': ['grand theft auto vi'],
  'gtavice': ['grand theft auto vice city'],
  'rdr': ['red dead redemption'],
  'rdr2': ['red dead redemption 2'],
  'rdr 2': ['red dead redemption 2'],
  'red dead': ['red dead redemption'],
  'csgo': ['counter-strike global offensive'],
  'cs': ['counter-strike', 'counter strike'],
  'cs2': ['counter-strike 2'],
  'cod': ['call of duty'],
  'warzone': ['call of duty'],
  'pubg': ['playerunknown'],
  'playerunknown': ['playerunknown'],
  'lol': ['league of legends'],
  'league': ['league of legends'],
  'apex': ['apex legends'],
  'valorant': ['valorant'],
  'fortnite': ['fortnite'],
  'minecraft': ['minecraft'],
  'mc': ['minecraft'],
  'terraria': ['terraria'],
  'among us': ['among us'],
  'fall guys': ['fall guys'],
  'skyrim': ['skyrim'],
  'witcher': ['the witcher'],
  'witcher 3': ['the witcher 3'],
  'gmod': ['garry'],
  'garrys mod': ['garry'],
  'rust': ['rust'],
  'dbd': ['dead by daylight'],
  'overwatch': ['overwatch'],
  'ow2': ['overwatch 2'],
  'stardew': ['stardew valley'],
  'hollow knight': ['hollow knight'],
  'cyberpunk': ['cyberpunk 2077'],
  'elden ring': ['elden ring'],
  'elden': ['elden ring'],
  'hogwarts': ['hogwarts legacy'],
  'destiny': ['destiny'],
  'dota': ['dota 2'],
  'dota2': ['dota 2'],
  'fifa': ['fifa'],
  'rocket league': ['rocket league'],
  'rl': ['rocket league'],
  'ark': ['ark'],
  'roblox': ['roblox'],
  'subnautica': ['subnautica'],
  'valheim': ['valheim'],
  'phasmophobia': ['phasmophobia'],
  'sea of thieves': ['sea of thieves'],
  'genshin': ['genshin impact'],
  'honkai': ['honkai'],
  'assassins creed': ['assassin'],
  'assassins': ['assassin'],
  'forza': ['forza'],
  'halo': ['halo'],
  'god of war': ['god of war'],
  'gow': ['god of war'],
  'the last of us': ['the last of us'],
  'spiderman': ['spider-man'],
  'spider man': ['spider-man'],
  'far cry': ['far cry'],
  'watch dogs': ['watch dogs'],
  'watchdogs': ['watch dogs'],
  'doom': ['doom'],
  'resident evil': ['resident evil'],
  'left 4 dead': ['left 4 dead'],
  'l4d': ['left 4 dead'],
  'borderlands': ['borderlands'],
  'diablo': ['diablo'],
  'wow': ['world of warcraft'],
  'hearthstone': ['hearthstone'],
  'starcraft': ['starcraft'],
  'geometry dash': ['geometry dash'],
  'brawlhalla': ['brawlhalla'],
  'osu': ['osu'],
  'dying light': ['dying light'],
  'far cry 5': ['far cry 5']
};

function gameNameMatchesTerm(game, term) {
  if (game._nameLower.includes(term)) return true;
  const aliases = GAME_ALIASES[term];
  if (!aliases) return false;
  for (const a of aliases) {
    if (game._nameLower.includes(a)) return true;
  }
  return false;
}

function pageDatabaseGames({ filter, offset, limit, category }) {
  const term = String(filter || '').trim().toLowerCase();
  const start = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  const pageSize = Number.isFinite(limit) ? Math.min(500, Math.max(1, limit)) : 200;
  const items = [];
  let matchIndex = 0;
  let hasMore = false;
  const games = databaseCache.games;
  const cat = String(category || 'All');
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    if (cat !== 'All' && !(g.themes || []).includes(cat)) continue;
    if (term && !gameNameMatchesTerm(g, term)) continue;
    if (matchIndex >= start && items.length < pageSize) {
      items.push({
        id: g.id,
        name: g.name,
        exe: g.exe,
        icon: g.icon || '',
        isLauncher: g.isLauncher,
        usesNewDetection: g.usesNewDetection,
        themes: Array.isArray(g.themes) ? g.themes : []
      });
    }
    matchIndex++;
    if (items.length >= pageSize && matchIndex > start + pageSize) {
      hasMore = true;
      break;
    }
  }
  return { items, offset: start, limit: pageSize, hasMore };
}

async function readJsonIfExists(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2) + os.EOL, 'utf8');
}

async function syncGameList(gameListPath) {
  const res = await fetch(DISCORD_DETECTABLE_URL, {
    headers: {
      'User-Agent': 'RYZEGameLauncher/0.1.0',
      'Accept': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`Game API error: ${res.status} ${res.statusText}`);
  const text = (await res.text()).trim();
  let localTrimmed = null;
  try {
    localTrimmed = (await fsp.readFile(gameListPath, 'utf8')).trim();
  } catch {
    localTrimmed = null;
  }
  if (localTrimmed !== text) {
    if (localTrimmed != null) {
      try { await fsp.copyFile(gameListPath, gameListPath + '.bak'); } catch { /* ignore */ }
    }
    await fsp.writeFile(gameListPath, text + os.EOL, 'utf8');
    return { updated: true };
  }
  return { updated: false };
}

async function findDummyGameTemplate() {
  if (process.env.DUMMYGAME_EXE && fs.existsSync(process.env.DUMMYGAME_EXE)) {
    return process.env.DUMMYGAME_EXE;
  }
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'dummygame', 'DummyGame.exe');
    if (fs.existsSync(bundled)) return bundled;
  }
  const repoBundled = path.join(app.getAppPath(), 'resources', 'dummygame', 'DummyGame.exe');
  if (fs.existsSync(repoBundled)) return repoBundled;
  return null;
}

async function ensureFakeExeForGame(game, paths) {
  const dummySourceExe = await findDummyGameTemplate();
  if (!dummySourceExe) {
    throw new Error('Could not find DummyGame.exe. Set DUMMYGAME_EXE env var to its path.');
  }
  ensureDirSync(paths.gamesRoot);
  const appIdFolder = String(game.appId || game.id) || sanitizeFolderName(game.name);
  const exeRelPath = normalizeExeRelPath(game.exe);
  const exeFolderPart = path.dirname(exeRelPath) === '.' ? '' : path.dirname(exeRelPath);
  const exeFileName = path.basename(exeRelPath);
  const gameFolder = path.join(paths.gamesRoot, appIdFolder, exeFolderPart);
  ensureDirSync(gameFolder);
  const destExePath = path.join(gameFolder, exeFileName);

  try {
    await fsp.copyFile(dummySourceExe, destExePath);
  } catch {
    // keep existing copy (e.g. file in use)
  }
  const sourceDir = path.dirname(dummySourceExe);
  const dummyBase = path.basename(dummySourceExe, path.extname(dummySourceExe));
  const sidecars = await fsp.readdir(sourceDir);
  for (const fileName of sidecars) {
    if (!fileName.toLowerCase().startsWith(dummyBase.toLowerCase() + '.')) continue;
    if (fileName.toLowerCase() === path.basename(dummySourceExe).toLowerCase()) continue;
    const src = path.join(sourceDir, fileName);
    const dest = path.join(gameFolder, fileName);
    try {
      await fsp.copyFile(src, dest);
    } catch {
      // ignore
    }
  }
  const existing = await fsp.readdir(gameFolder);
  for (const fileName of existing) {
    const lower = fileName.toLowerCase();
    if (lower === exeFileName.toLowerCase()) continue;
    if (lower.startsWith(dummyBase.toLowerCase() + '.')) {
      try {
        await fsp.unlink(path.join(gameFolder, fileName));
      } catch {
        // ignore
      }
    }
  }
  return { destExePath, workingDirectory: path.dirname(destExePath) };
}

function createTray() {
  if (tray) return;
  tray = new Tray(path.join(__dirname, '..', 'resources', 'tray-icon.png'));
  tray.setToolTip('RYZE Game Launcher');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show RYZE', click: () => showMainWindow() },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('click', () => showMainWindow());
}

function showMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#36393f',
    icon: path.join(__dirname, 'renderer', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      createTray();
    }
  });
  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.whenReady().then(async () => {
  loadSettings();
  cleanUpdaterCache();
  if (settings.startup) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
  await createWindow();
  createTray();
  setTimeout(() => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdates().catch(() => {});
    }
  }, 3000);
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('app/window/minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('app/window/maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('app/window/close', () => {
  mainWindow?.close();
});

let zoomFactor = 1.0;

ipcMain.handle('app/zoom', (_e, dir) => {
  if (typeof dir === 'number') {
    zoomFactor = Math.min(2.0, Math.max(0.5, dir));
  } else if (dir === 'zoom-in') {
    zoomFactor = Math.min(2.0, Math.round((zoomFactor + 0.1) * 10) / 10);
  } else if (dir === 'zoom-out') {
    zoomFactor = Math.max(0.5, Math.round((zoomFactor - 0.1) * 10) / 10);
  } else {
    zoomFactor = 1.0;
  }
  mainWindow?.webContents.setZoomFactor(zoomFactor);
  return zoomFactor;
});

ipcMain.handle('app/settings/get', () => ({ ...settings }));

ipcMain.handle('app/settings/set', (_e, patch) => {
  settings = { ...settings, ...(patch || {}) };
  saveSettings();
  if (patch && 'startup' in patch) {
    app.setLoginItemSettings({ openAtLogin: !!patch.startup });
  }
  return { ...settings };
});

ipcMain.handle('app/folder/select', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const res = await dialog.showOpenDialog(win, {
    title: 'Select games folder',
    properties: ['openDirectory']
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle('app/openExternal', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
});

ipcMain.handle('app/getInfo', () => ({
  version: app.getVersion(),
  lastUpdate: 'August 9, 2026',
  fixes: [
    'Terms & Conditions gate on first launch (I agree + confirm)',
    'Update notification popup right when a new update arrives',
    'What\'s New popup after every update (point-by-point release notes)',
    'In-app auto-update with download progress and Install & Restart',
    'Auto-cleanup of old update cache files',
    'Fake game window for rich presence',
    'Store with search, popular aliases and category filters'
  ]
}));

ipcMain.handle('app/whatsnew', async () => {
  const current = app.getVersion();
  if (settings.lastSeenVersion === current) return { show: false };
  let notes = [];
  let published = '';
  try {
    const atomRes = await fetch(UPDATE_ATOM_URL, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'ryze-game-launcher' }
    });
    if (atomRes.ok) {
      const entries = splitAtomEntries(await atomRes.text());
      for (const entry of entries) {
        const parsed = parseAtomEntry(entry);
        if (parsed.title.includes(current)) {
          notes = parsed.notes;
          published = parsed.published;
          break;
        }
      }
    }
  } catch {
    // offline - show popup with generic message
  }
  return { show: true, version: current, notes, published };
});

ipcMain.handle('app/whatsnew/markSeen', () => {
  settings.lastSeenVersion = app.getVersion();
  saveSettings();
  return true;
});

const DEV_DISCORD_ID = '924218650301456414';
const DEV_DISCORD_AVATAR_FALLBACK = 'https://cdn.discordapp.com/avatars/924218650301456414/8e41cc1375823e4fcc61524cdc944b70?size=128';

ipcMain.handle('app/dev/profile', async () => {
  try {
    const res = await fetch(`https://discordpfp.vercel.app/api/avatar?id=${DEV_DISCORD_ID}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000)
    });
    const loc = res.headers.get('location');
    if (loc) return { avatarUrl: loc.replace(/size=\d+/, 'size=128') };
  } catch {
    // fall back to known CDN url
  }
  return { avatarUrl: DEV_DISCORD_AVATAR_FALLBACK };
});

ipcMain.handle('app/update/check', async () => {
  const current = app.getVersion();
  let reachable = false;
  let releaseFound = false;
  let latest = '';
  let url = '';
  let notes = [];
  let published = '';
  try {
    const ymlRes = await fetch(`${UPDATE_DOWNLOAD_BASE}/latest.yml`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'ryze-game-launcher' }
    });
    reachable = ymlRes.ok;
    if (ymlRes.ok) {
      const info = parseLatestYml(await ymlRes.text());
      releaseFound = !!info.version;
      latest = info.version;
      url = info.path ? `${UPDATE_DOWNLOAD_BASE}/${info.path}` : '';
    }
  } catch {
    // offline or unreachable
  }
  if (latest) {
    try {
      const atomRes = await fetch(UPDATE_ATOM_URL, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'ryze-game-launcher' }
      });
      if (atomRes.ok) {
        const first = splitAtomEntries(await atomRes.text())[0];
        if (first) {
          const parsed = parseAtomEntry(first);
          notes = parsed.notes;
          published = parsed.published;
        }
      }
    } catch {
      // release notes are optional
    }
  }
  return {
    current,
    latest,
    hasUpdate: releaseFound && latest !== '' && compareVersions(latest, current) > 0,
    releaseFound,
    reachable,
    url,
    notes,
    published
  };
});

ipcMain.handle('app/update/startDownload', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('app/update/install', async () => {
  try {
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('launcher/syncGameList', async () => {
  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);
  const result = await syncGameList(paths.gameListPath);
  await loadDatabaseCache(paths.gameListPath);
  return { ...result, gameListPath: paths.gameListPath };
});

ipcMain.handle('launcher/getDatabaseGames', async (_evt, { filter, offset, limit, category } = {}) => {
  const paths = getUserDataPaths();
  if (!databaseCache.loaded || databaseCache.gameListPath !== paths.gameListPath) {
    await loadDatabaseCache(paths.gameListPath);
  }
  return pageDatabaseGames({ filter, offset, limit, category });
});

ipcMain.handle('launcher/getMyGames', async () => {
  const paths = getUserDataPaths();
  const list = await readJsonIfExists(paths.myGamesPath, []);
  const safe = Array.isArray(list) ? list : [];
  if (databaseCache.loaded) {
    for (const g of safe) {
      if (!g.icon) {
        const match = databaseCache.games.find(d => String(d.id) === String(g.appId) && String(d.exe) === String(g.exe));
        if (match && match.icon) g.icon = match.icon;
      }
    }
  }
  return safe;
});

ipcMain.handle('launcher/addGame', async (_evt, game) => {
  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);
  const myGames = await readJsonIfExists(paths.myGamesPath, []);
  const safeList = Array.isArray(myGames) ? myGames : [];
  const entry = {
    appId: String(game?.id || ''),
    name: String(game?.name || 'Game'),
    exe: String(game?.exe || ''),
    icon: String(game?.icon || ''),
    isFavorite: false,
    usesNewDetection: Boolean(game?.usesNewDetection)
  };
  const key = `${entry.appId}::${entry.exe}`;
  const existingKey = (g) => `${String(g?.appId || '')}::${String(g?.exe || '')}`;
  if (!safeList.some(g => existingKey(g) === key)) {
    safeList.push(entry);
    await writeJson(paths.myGamesPath, safeList);
  }
  return entry;
});

ipcMain.handle('launcher/toggleFavorite', async (_evt, { appId, exe }) => {
  const paths = getUserDataPaths();
  const myGames = await readJsonIfExists(paths.myGamesPath, []);
  const safeList = Array.isArray(myGames) ? myGames : [];
  let updated = null;
  for (const g of safeList) {
    if (String(g?.appId || '') === String(appId || '') && String(g?.exe || '') === String(exe || '')) {
      g.isFavorite = !g.isFavorite;
      updated = g;
      break;
    }
  }
  await writeJson(paths.myGamesPath, safeList);
  return updated;
});

ipcMain.handle('launcher/deleteGame', async (_evt, { appId, exe }) => {
  const paths = getUserDataPaths();
  const myGames = await readJsonIfExists(paths.myGamesPath, []);
  const safeList = Array.isArray(myGames) ? myGames : [];
  const before = safeList.length;
  const filtered = safeList.filter(g => !(
    String(g?.appId || '') === String(appId || '') &&
    String(g?.exe || '') === String(exe || '')
  ));
  if (filtered.length !== before) {
    await writeJson(paths.myGamesPath, filtered);
  }
  return { ok: true, removed: before - filtered.length };
});

ipcMain.handle('launcher/createShortcut', async (_evt, { appId, exe }) => {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Shortcuts are only supported on Windows.' };
  }
  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);
  const myGames = await readJsonIfExists(paths.myGamesPath, []);
  const safeList = Array.isArray(myGames) ? myGames : [];
  const game = safeList.find(g =>
    String(g?.appId || '') === String(appId || '') &&
    String(g?.exe || '') === String(exe || '')
  );
  if (!game) return { ok: false, error: 'Game not found in library.' };

  try {
    const { destExePath, workingDirectory } = await ensureFakeExeForGame(game, paths);
    const desktopDir = app.getPath('desktop');
    const baseName = sanitizeFolderName(game.name || path.basename(destExePath, path.extname(destExePath))) || 'Game';
    let shortcutPath = path.join(desktopDir, `${baseName}.lnk`);
    if (fs.existsSync(shortcutPath)) {
      for (let i = 2; i < 1000; i++) {
        const candidate = path.join(desktopDir, `${baseName} (${i}).lnk`);
        if (!fs.existsSync(candidate)) {
          shortcutPath = candidate;
          break;
        }
      }
    }
    const displayName = String(game?.name || path.basename(destExePath));
    const escaped = displayName.replace(/"/g, '\\"');
    const args = `"${escaped}"`;
    const ok = shell.writeShortcutLink(shortcutPath, {
      target: destExePath,
      cwd: workingDirectory,
      args
    });
    if (!ok) return { ok: false, error: 'Failed to create shortcut.' };
    return { ok: true, path: shortcutPath };
  } catch (e) {
    return { ok: false, error: String(e?.message || e || 'Failed to create shortcut') };
  }
});

ipcMain.handle('launcher/selectGame', async () => {
  return true;
});

ipcMain.handle('launcher/launchGame', async (_evt, game) => {
  if (runningProc) {
    return { ok: false, error: 'A game is already running.' };
  }
  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);
  const { destExePath, workingDirectory } = await ensureFakeExeForGame(game, paths);
  const displayName = String(game?.name || path.basename(destExePath));

  runningProc = spawn(destExePath, [displayName, settings.theme || 'black'], {
    cwd: workingDirectory,
    windowsHide: false,
    stdio: 'ignore'
  });

  runningProc.once('exit', () => {
    runningProc = null;
    if (settings.reopenOnExit && mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow?.webContents.send('launcher/gameExited');
  });

  if (settings.closeOnLaunch) mainWindow?.hide();

  return { ok: true, exePath: destExePath };
});

ipcMain.handle('launcher/stopGame', async () => {
  if (!runningProc) return { ok: true };
  try {
    runningProc.kill();
  } catch {
    // ignore
  }
  runningProc = null;
  return { ok: true };
});
