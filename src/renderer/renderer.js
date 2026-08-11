/* global launcherApi */

const RECENT_KEY = 'ryze.recentlyPlayed';

const $ = (id) => document.getElementById(id);

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const state = {
  db: [],
  dbLoaded: false,
  dbLoading: false,
  dbDone: false,
  dbOffset: 0,
  myGames: [],
  selected: null,
  running: false,
  runningGame: null,
  storeFilter: '',
  currentTab: 'store',
  storeSearch: '',
  libSearch: '',
  storeSort: 'az',
  libSort: 'name',
  playtimes: {}
};

let contextMenuEl = null;

function log(msg, level) {
  const classes = {
    success: 'log-success',
    danger: 'log-danger',
    warn: 'log-warn',
    accent: 'log-accent'
  };
  const el = document.getElementById('logArea');
  if (!el) return;
  const div = document.createElement('div');
  div.className = 'log-entry ' + (classes[level] || '');
  const t = new Date().toLocaleTimeString([], { hour12: false });
  div.innerHTML = `<span class="log-time">[${t}]</span> ${esc(msg)}`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function switchTab(name) {
  state.currentTab = name;
  const store = $('storePage');
  const lib = $('libraryPage');
  if (name === 'store') {
    store.style.display = 'flex';
    lib.style.display = 'none';
  } else {
    lib.style.display = 'flex';
    store.style.display = 'none';
  }
  $('tabStore').classList.toggle('active', name === 'store');
  $('tabLibrary').classList.toggle('active', name === 'library');
}

function isInLibrary(g) {
  return state.myGames.some(mg =>
    String(mg.appId) === String(g.id) && String(mg.exe) === String(g.exe));
}

function appIdLabel(g) {
  if (g && g.custom) return 'Custom Game';
  return 'App ID ' + String(g?.appId || '—');
}

function ptKey(g) {
  return String((g && (g.appId || g.id)) || '') + '::' + String((g && g.exe) || '');
}

function getPlaytimeEntry(g) {
  return state.playtimes[ptKey(g)] || null;
}

function fmtTime(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm';
  return s + 's';
}

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - (Number(ts) || 0));
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return min + 'm ago';
  const h = Math.floor(min / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  return d + 'd ago';
}

function getRecentlyPlayed() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function rememberPlayed(entry) {
  const list = getRecentlyPlayed().filter(r => !(String(r.appId) === String(entry.appId) && String(r.exe) === String(entry.exe)));
  list.unshift({ appId: entry.appId, exe: entry.exe, name: entry.name });
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* ignore */
  }
}

// ---------------- database loading ----------------
async function loadDatabase() {
  if (state.dbLoading) return;
  state.dbLoading = true;
  try {
    const page = await launcherApi.getDatabaseGames('', state.dbOffset, 500);
    const items = Array.isArray(page?.items) ? page.items : [];
    for (const g of items) {
      g._nameLower = String(g.name || '').toLowerCase();
      state.db.push(g);
    }
    state.dbOffset += items.length;
    if (!page?.hasMore || items.length === 0) state.dbDone = true;
  } catch {
    state.dbDone = true;
  }
  state.dbLoading = false;
  state.dbLoaded = true;
}

async function loadDatabaseUntil(predicate) {
  while (!state.dbDone && !predicate()) {
    const before = state.db.length;
    await loadDatabase();
    if (state.db.length === before) break;
  }
}

async function searchDatabase(term) {
  const page = await launcherApi.getDatabaseGames(term, 0, 200);
  return Array.isArray(page?.items) ? page.items : [];
}

// ---------------- store ----------------
function updateFeatured() {
  const featured = state.db.find(g => !isInLibrary(g)) || null;
  state._featured = featured;
  const title = $('featuredTitle');
  const sub = $('featuredSub');
  const btn = $('featuredBtn');

  if (featured) {
    title.textContent = featured.name;
    let s = featured.exe;
    if (featured.usesNewDetection) s += '   ·   new detection (RPC status)';
    sub.textContent = s;
    btn.disabled = false;
    btn.textContent = '+  Add to Library';
  } else if (!state.db.length) {
    title.textContent = 'Loading game database…';
    sub.textContent = "Fetching the game list. This can take a moment on first run.";
    btn.disabled = true;
    btn.textContent = '…';
  } else {
    title.textContent = 'All games are in your library';
    sub.textContent = 'Sync for new titles, or wait for the database to refresh.';
    btn.disabled = true;
    btn.textContent = '✓  In Library';
  }
}

function fillCards(cards, fresh, max, tag) {
  const used = new Set(cards.map(c => c.game.id + '::' + c.game.exe));
  for (const g of fresh) {
    if (cards.length >= max) break;
    if (used.has(g.id + '::' + g.exe)) continue;
    cards.push({ tag, game: g });
    used.add(g.id + '::' + g.exe);
  }
  return cards;
}

function recentlyPlayedCards() {
  const fresh = state.db.filter(g => !isInLibrary(g));
  const cards = [];
  for (const r of getRecentlyPlayed()) {
    const g = fresh.find(x => String(x.id) === String(r.appId) && String(x.exe) === String(r.exe));
    if (!g) continue;
    cards.push({ tag: 'Recently Played', game: g });
    if (cards.length >= 6) break;
  }
  return fillCards(cards, fresh, 6, 'Recently Played');
}

function newlyLaunchedCards() {
  const fresh = state.db.filter(g => !isInLibrary(g)).slice();
  fresh.sort(() => Math.random() - 0.5);
  return fillCards([], fresh, 6, 'Newly Launched');
}

function recommendedCards() {
  const fresh = state.db.filter(g => !isInLibrary(g)).slice();
  fresh.sort(() => Math.random() - 0.5);
  return fillCards([], fresh, 6, 'Recommended');
}

function defaultStoreCards() {
  const fresh = state.db.filter(g => !isInLibrary(g));
  const cards = [];
  for (const r of getRecentlyPlayed()) {
    const g = fresh.find(x => String(x.id) === String(r.appId) && String(x.exe) === String(r.exe));
    if (!g) continue;
    cards.push({ tag: 'Recently Played', game: g });
    if (cards.length >= 2) break;
  }
  fillCards(cards, fresh, 4, 'Newly Launched');
  fillCards(cards, fresh, 6, 'Recommended');
  return cards.slice(0, 6);
}

function buildStoreCards() {
  switch (state.storeFilter) {
    case 'recent': return recentlyPlayedCards();
    case 'new': return newlyLaunchedCards();
    case 'recommended': return recommendedCards();
    default: return defaultStoreCards();
  }
}

function buildStoreStatus() {
  if (!state.storeFilter) return 'Browse random, recently played, and newly launched picks';
  const labels = { recent: 'Recently played picks', new: 'Newly launched picks', recommended: 'Recommended picks' };
  return labels[state.storeFilter];
}

async function renderStore() {
  const term = state.storeSearch.trim().toLowerCase();
  const status = $('storeStatus');
  const cardsEl = $('storeCards');

  let cards;
  if (term) {
    const results = (await searchDatabase(term)).filter(g => !isInLibrary(g));
    status.textContent = `Search results for '${term}' (${results.length} found)`;
    cards = results.slice(0, 12).map(g => ({ tag: 'Search', game: g }));
  } else {
    if (!state.db.length) {
      status.textContent = 'Game database loading…';
      cards = [];
    } else {
      cards = buildStoreCards();
      status.textContent = buildStoreStatus();
    }
  }

  cardsEl.innerHTML = '';
  cardsEl.style.display = term ? 'none' : '';
  const maxCards = term ? 12 : 6;
  for (let i = 0; i < maxCards; i++) {
    const item = cards[i];
    if (!item) {
      const empty = document.createElement('div');
      empty.className = 'card card-empty';
      empty.textContent = i === 0 && !term && !state.db.length ? 'Loading…' : '';
      cardsEl.appendChild(empty);
      continue;
    }
    const g = item.game;
    const card = document.createElement('div');
    card.className = 'card';
    let sub = g.exe;
    if (g.usesNewDetection) sub += '   ·   new detection (RPC status)';
    const logo = gameIcon(g)
      ? `<img class="card-img" src="${esc(gameIcon(g))}" alt="" onerror="this.remove()">`
      : `<div class="card-img card-img-ph">${esc((g.name || '?').charAt(0).toUpperCase())}</div>`;
    card.innerHTML = `
      <div class="card-head">
        ${logo}
        <div class="card-tag">${esc(item.tag)}</div>
      </div>
      <div class="card-title">${esc(g.name)}</div>
      <div class="card-sub">${esc(sub)}</div>
      <button class="card-action" data-idx="${i}">Add to Library</button>
    `;
    card.querySelector('.card-action').addEventListener('click', async (e) => {
      e.stopPropagation();
      await addToLibrary(g);
    });
    card.addEventListener('click', () => openGameModal(g));
    cardsEl.appendChild(card);
  }

  updateFeatured();
  renderStoreAllGames();
}

// ---------------- library ----------------
function renderLibrary() {
  const term = state.libSearch.trim().toLowerCase();
  const listEl = $('libraryList');
  const countEl = $('libraryCount');

  const games = [...state.myGames];
  if (state.libSort === 'recent') {
    games.sort((a, b) => (getPlaytimeEntry(b)?.lastPlayed || 0) - (getPlaytimeEntry(a)?.lastPlayed || 0));
  } else if (state.libSort === 'played') {
    games.sort((a, b) => (getPlaytimeEntry(b)?.seconds || 0) - (getPlaytimeEntry(a)?.seconds || 0));
  } else {
    games.sort((a, b) => {
      if (!!a.isFavorite !== !!b.isFavorite) return a.isFavorite ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    });
  }

  const visible = games.filter(g =>
    !term || String(g.name).toLowerCase().includes(term) || String(g.exe).toLowerCase().includes(term));

  countEl.textContent = String(visible.length);
  listEl.innerHTML = '';

  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'rail-empty';
    empty.textContent = 'No games in your library yet.';
    listEl.appendChild(empty);
    return;
  }

  for (const g of visible) {
    const selected = state.selected === g;
    const row = document.createElement('div');
    row.className = 'library-row' + (selected ? ' selected' : '');
    const iconUrl = gameIcon(g);
    const logo = iconUrl
      ? `<img class="row-img" src="${esc(iconUrl)}" alt="" onerror="this.remove()">`
      : `<div class="row-img row-img-ph">${esc((g.name || '?').charAt(0).toUpperCase())}</div>`;
    const pt = getPlaytimeEntry(g);
    const playLine = pt && (pt.seconds > 0 || pt.lastPlayed)
      ? `<div class="row-play">${esc(fmtTime(pt.seconds))}${pt.lastPlayed ? '   ·   last ' + esc(timeAgo(pt.lastPlayed)) : ''}</div>`
      : '';
    row.innerHTML = `
      <div class="row-top">
        ${logo}
        <div class="row-name">${esc(g.isFavorite ? '★  ' : '')}${esc(g.name)}</div>
      </div>
      <div class="row-sub">${esc(g.exe)}   ·   ${esc(appIdLabel(g))}</div>
      ${playLine}
    `;
    row.addEventListener('click', () => selectGame(g));
    row.addEventListener('dblclick', () => {
      if (state.selected === g) toggleLaunch();
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      selectGame(g);
      openContextMenu(e.clientX, e.clientY);
    });
    listEl.appendChild(row);
  }
}

function selectGame(game) {
  state.selected = game;
  $('emptyState').style.display = 'none';
  $('detail').style.display = 'flex';
  $('detailTitle').textContent = game.name;
  $('detailBannerTitle').textContent = game.name;
  $('detailBannerSub').textContent = game.exe;
  $('detailSub').textContent = `${game.exe}   ·   ${appIdLabel(game)}`;
  const pt = getPlaytimeEntry(game);
  $('detailPlay').textContent = pt && pt.seconds > 0
    ? `Played ${fmtTime(pt.seconds)}${pt.lastPlayed ? '   ·   last ' + timeAgo(pt.lastPlayed) : ''}`
    : 'Not played yet';

  const artBox = $('artBox');
  const iconUrl = gameIcon(game);
  if (iconUrl) {
    artBox.innerHTML = `<img src="${esc(iconUrl)}" alt="" class="art-img" onerror="this.parentElement.innerHTML='Game Art'">`;
  } else {
    artBox.textContent = 'Game Art';
  }

  const nd = getNewDetectionFlag(game);
  const noteEl = $('detailBannerNote');
  if (nd) {
    noteEl.textContent = 'New detection - shows on Discord via Rich Presence.';
  } else {
    noteEl.textContent = '';
  }

  const note = $('detailNote');
  if (nd) {
    note.textContent = 'Note: this game has no fixed executable, so its status is set via Discord Rich Presence. Make sure Discord is running with Activity Status enabled (Settings > Activity Privacy).';
    note.style.display = 'block';
  } else {
    note.style.display = 'none';
  }

  const themes = getThemesForGame(game);
  const thEl = $('detailThemes');
  thEl.innerHTML = '';
  (themes || []).slice(0, 8).forEach(t => {
    const s = document.createElement('span');
    s.className = 'detail-theme-tag';
    s.textContent = t;
    thEl.appendChild(s);
  });

  renderFavBtn();
  setLaunchUi();
  renderLibrary();
}

function gameIcon(g) {
  if (g && g.icon) return String(g.icon);
  if (!g) return '';
  const match = state.db.find(d => String(d.id) === String(g.appId || g.id) && String(d.exe) === String(g.exe));
  return match && match.icon ? String(match.icon) : '';
}

function getThemesForGame(game) {
  if (game && Array.isArray(game.themes)) return game.themes;
  const match = state.db.find(d => String(d.id) === String(game?.appId || game?.id) && String(d.exe) === String(game?.exe));
  return (match && match.themes) || [];
}

function getNewDetectionFlag(game) {
  if (game.usesNewDetection != null) return Boolean(game.usesNewDetection);
  const match = state.db.find(g => String(g.id) === String(game.appId) && String(g.exe) === String(game.exe));
  return match ? Boolean(match.usesNewDetection) : false;
}

function isCurrentGameRunning() {
  return Boolean(
    state.running &&
    state.runningGame &&
    state.selected &&
    String(state.runningGame.appId) === String(state.selected.appId) &&
    String(state.runningGame.exe) === String(state.selected.exe)
  );
}

function updateStatus() {
  const pill = $('detailStatus');
  if (isCurrentGameRunning()) {
    pill.textContent = '●  Playing Now';
    pill.classList.add('playing');
  } else {
    pill.textContent = '●  Ready';
    pill.classList.remove('playing');
  }
}

function renderFavBtn() {
  const btn = $('favBtn');
  const fav = Boolean(state.selected && state.selected.isFavorite);
  btn.textContent = (fav ? '★' : '♡') + '  Favorite';
  btn.classList.toggle('favorited', fav);
}

function openContextMenu(x, y) {
  closeContextMenu();
  contextMenuEl = document.createElement('div');
  contextMenuEl.className = 'context-menu';

  const shortcut = document.createElement('div');
  shortcut.className = 'context-item';
  shortcut.textContent = 'Create shortcut';
  shortcut.addEventListener('click', async () => {
    closeContextMenu();
    await createShortcut();
  });

  const del = document.createElement('div');
  del.className = 'context-item danger';
  del.textContent = 'Delete from library';
  del.addEventListener('click', async () => {
    closeContextMenu();
    await deleteGame();
  });

  contextMenuEl.appendChild(shortcut);
  contextMenuEl.appendChild(del);
  document.body.appendChild(contextMenuEl);

  contextMenuEl.style.display = 'block';
  contextMenuEl.style.left = x + 'px';
  contextMenuEl.style.top = y + 'px';

  requestAnimationFrame(() => {
    const rect = contextMenuEl.getBoundingClientRect();
    const margin = 8;
    let left = x;
    let top = y;
    if (left + rect.width + margin > window.innerWidth) left = Math.max(margin, window.innerWidth - rect.width - margin);
    if (top + rect.height + margin > window.innerHeight) top = Math.max(margin, window.innerHeight - rect.height - margin);
    contextMenuEl.style.left = left + 'px';
    contextMenuEl.style.top = top + 'px';
  });
}

function closeContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.remove();
    contextMenuEl = null;
  }
}

// ---------------- actions ----------------
async function addToLibrary(g, switchToLibrary = true) {
  const installed = await launcherApi.addGame({
    id: g.id,
    name: g.name,
    exe: g.exe,
    icon: g.icon || '',
    usesNewDetection: Boolean(g.usesNewDetection)
  });
  await refreshMyGames();
  const added = state.myGames.find(mg =>
    String(mg.appId) === String(installed.appId) && String(mg.exe) === String(installed.exe));
  if (added) selectGame(added);
  if (switchToLibrary) switchTab('library');
  await renderStore();
}

async function refreshMyGames() {
  state.myGames = await launcherApi.getMyGames();
  renderLibrary();
}

async function toggleLaunch() {
  if (!state.selected) return;
  if (isCurrentGameRunning()) {
    await stopGame();
    return;
  }
  if (state.running) {
    showToast('Stop the running game before launching another.', 'danger');
    return;
  }
  await launchGame();
}

async function launchGame() {
  const entry = state.selected;
  const name = entry?.name || 'Game';
  showLaunchModal('launching', `${name} is launching...`, 'Preparing the game and starting rich presence', '');
  let r;
  try {
    r = await launcherApi.launchGame(entry);
  } catch (e) {
    showLaunchModal('err', `Couldn't launch ${name}`, String(e.message || e), '');
    return;
  }
  if (r.ok) {
    state.running = true;
    state.runningGame = { appId: entry.appId, exe: entry.exe };
    rememberPlayed(entry);
    setLaunchUi();
    showLaunchModal('ok', `${name} is now running`, 'You should now appear as playing. If it does not show, enable Activity Status in your app settings (Settings > Activity Privacy).', '');
  } else {
    showLaunchModal('err', `Couldn't launch ${name}`, r.error || 'Unknown error', '');
  }
}

function showLaunchModal(stateName, title, sub, hint) {
  const modal = $('launchModal');
  $('launchSpinner').style.display = stateName === 'launching' ? 'flex' : 'none';
  $('launchOk').style.display = stateName === 'ok' ? 'flex' : 'none';
  $('launchErr').style.display = stateName === 'err' ? 'flex' : 'none';
  $('launchTitle').textContent = title;
  $('launchSub').textContent = sub;
  const hintEl = $('launchHint');
  if (hint) {
    hintEl.textContent = hint;
    hintEl.style.display = 'block';
  } else {
    hintEl.style.display = 'none';
  }
  $('launchOkBtn').style.display = stateName === 'launching' ? 'none' : 'block';
  modal.style.display = 'flex';
}

$('launchOkBtn').addEventListener('click', () => {
  $('launchModal').style.display = 'none';
});

async function stopGame() {
  await launcherApi.stopGame();
  state.running = false;
  state.runningGame = null;
  setLaunchUi();
}

function setLaunchUi() {
  const isRunning = isCurrentGameRunning();
  const btn = $('launchBtn');
  btn.textContent = isRunning ? '■  Stop Game' : '▶  Launch Game';
  btn.classList.toggle('running', isRunning);
  updateStatus();
}

async function createShortcut() {
  if (!state.selected) return;
  const r = await launcherApi.createShortcut(state.selected.appId, state.selected.exe);
  if (!r?.ok) {
    showToast(`Shortcut failed: ${r?.error || 'unknown error'}`, 'danger');
    return;
  }
  showToast(`Shortcut created: ${r.path}`, 'success');
}

async function deleteGame() {
  if (!state.selected) return;
  const g = state.selected;
  if (isCurrentGameRunning()) {
    showToast('Stop the running game before deleting it.', 'danger');
    return;
  }
  await launcherApi.deleteGame(g.appId, g.exe);
  state.selected = null;
  $('detail').style.display = 'none';
  $('emptyState').style.display = 'flex';
  await refreshMyGames();
  renderLibrary();
  showToast(`Deleted ${g.name} from library.`, 'danger');
}

async function toggleFavorite() {
  if (!state.selected) return;
  const updated = await launcherApi.toggleFavorite(state.selected.appId, state.selected.exe);
  if (updated) {
    state.selected.isFavorite = updated.isFavorite;
    renderFavBtn();
    renderLibrary();
  }
}

function showToast(msg, level) {
  if (!window.ryzeToast) {
    window.ryzeToast = true;
    const t = document.createElement('div');
    t.id = 'ryzeToast';
    t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--bg-deep);color:var(--text);padding:10px 18px;border-radius:4px;border:1px solid var(--border);font-size:11px;z-index:200;box-shadow:0 4px 14px rgba(0,0,0,.4);';
    document.body.appendChild(t);
  }
  const t = document.getElementById('ryzeToast');
  t.textContent = msg;
  t.style.borderColor = level === 'danger' ? 'var(--red)' : level === 'success' ? 'var(--green)' : 'var(--border)';
  t.style.display = 'block';
  clearTimeout(window._toastT);
  window._toastT = setTimeout(() => { t.style.display = 'none'; }, 3500);
}

// ---------------- sync ----------------
async function ensureDatabaseSynced() {
  try {
    await launcherApi.syncGameList();
  } catch (e) {
    showToast(`Could not sync gamelist.json: ${String(e.message || e)}`, 'danger');
  }
}

// ---------------- wiring ----------------
$('tabStore').addEventListener('click', () => switchTab('store'));
$('tabLibrary').addEventListener('click', () => switchTab('library'));
$('minBtn').addEventListener('click', () => launcherApi.minimize());
$('maxBtn').addEventListener('click', () => launcherApi.maximize());
$('closeBtn').addEventListener('click', () => launcherApi.close());

const hamburgerMenu = $('hamburgerMenu');

function closeHamburgerMenu() {
  if (hamburgerMenu) hamburgerMenu.style.display = 'none';
  const picker = $('zoomPicker');
  if (picker) picker.style.display = 'none';
}

$('settingsBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = hamburgerMenu.style.display === 'block';
  closeHamburgerMenu();
  if (isOpen) return;
  const rect = $('settingsBtn').getBoundingClientRect();
  hamburgerMenu.style.display = 'block';
  hamburgerMenu.style.left = Math.max(6, Math.round(rect.left - 2)) + 'px';
  hamburgerMenu.style.top = Math.round(rect.bottom + 8) + 'px';
});

document.querySelectorAll('.ham-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    if (item.classList.contains('has-sub')) return;
    const action = item.dataset.action;
    if (action === 'update') {
      closeHamburgerMenu();
      openUpdateModal();
      return;
    }
    if (action === 'settings') {
      closeHamburgerMenu();
      openSettingsModal();
      return;
    }
    if (action === 'zoom-ctrl') return;
    if (action === 'support' || action === 'feedback') {
      closeHamburgerMenu();
      launcherApi.openExternal('https://www.instagram.com/its_not_samir_/');
      return;
    }
    if (action === 'bug-report' || action === 'bug-related') {
      closeHamburgerMenu();
      launcherApi.openExternal('https://ig.me/m/its_not_samir_');
      return;
    }
    if (action === 'about-app') {
      closeHamburgerMenu();
      openAboutModal();
      return;
    }
    if (action === 'about-dev') {
      closeHamburgerMenu();
      openAboutDevModal();
      return;
    }
    if (action === 'terms') {
      closeHamburgerMenu();
      openTermsModal();
      return;
    }
    if (action === 'touch') {
      closeHamburgerMenu();
      launcherApi.openExternal('https://discord.gg/GRYdRdGPsT');
      return;
    }
    if (action === 'backup-export') { closeHamburgerMenu(); doBackupExport(); return; }
    if (action === 'backup-import') { closeHamburgerMenu(); doBackupImport(); return; }
    if (action === 'data-folder') { closeHamburgerMenu(); launcherApi.openDataFolder(); return; }
    if (action === 'github') { closeHamburgerMenu(); launcherApi.openGitHub(); return; }
    if (action === 'restart') { closeHamburgerMenu(); launcherApi.restart(); return; }
    if (action === 'whatsnew') { closeHamburgerMenu(); openWhatsNewMenu(); return; }
    if (action === 'shortcuts') { closeHamburgerMenu(); openShortcutsModal(); return; }
    closeHamburgerMenu();
    const labels = { support: 'Support', feedback: 'Share Feedback', bug: 'Report a Bug', settings: 'Settings' };
    const label = labels[action] || action;
    showToast(`${label} menu coming soon`, 'accent');
  });
});

document.querySelectorAll('.zoom-btn').forEach(el => {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    doZoom(el.dataset.action);
  });
});

let currentZoomFactor = 1;
const ZOOM_OPTIONS = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];

function buildZoomPicker() {
  const picker = $('zoomPicker');
  picker.innerHTML = '';
  ZOOM_OPTIONS.forEach(p => {
    const opt = document.createElement('div');
    opt.className = 'zoom-opt';
    opt.textContent = p + '%';
    opt.dataset.zoom = p;
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      doZoom(p / 100);
    });
    picker.appendChild(opt);
  });
}

function toggleZoomPicker() {
  const picker = $('zoomPicker');
  if (picker.style.display === 'block') {
    picker.style.display = 'none';
    return;
  }
  buildZoomPicker();
  const current = Math.round(currentZoomFactor * 100);
  picker.querySelectorAll('.zoom-opt').forEach(o => o.classList.toggle('active', +o.dataset.zoom === current));
  picker.style.display = 'block';
}

$('zoomPct').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleZoomPicker();
});

async function doZoom(target) {
  try {
    const factor = await launcherApi.zoom(target);
    currentZoomFactor = factor;
    $('zoomPct').textContent = Math.round(factor * 100) + '%';
    $('zoomPicker').style.display = 'none';
  } catch (err) {
    showToast('Zoom failed', 'danger');
  }
}

async function openUpdateModal() {
  $('updateModal').style.display = 'flex';
  await runUpdateCheck();
}

async function runUpdateCheck() {
  window._updateRetried = false;
  $('updateStatus').textContent = 'Checking for updates...';
  $('updateStatus').className = 'update-status';
  $('updateDownload').style.display = 'none';
  $('updateRefresh').style.display = 'none';
  $('updateProgress').style.display = 'none';
  let res;
  try {
    res = await launcherApi.checkForUpdates();
  } catch (err) {
    $('updateStatus').textContent = 'Could not reach the update server.';
    $('updateStatus').className = 'update-status err';
    $('updateRefresh').style.display = 'inline-block';
    if (!window._updateRetried) {
      window._updateRetried = true;
      setTimeout(() => runUpdateCheck(), 2500);
    }
    return;
  }
  $('verVal').textContent = res.current;
  $('updateDate').textContent = res.published || 'Not published yet';
  const list = $('fixList');
  list.innerHTML = '';
  (res.notes || []).forEach(f => {
    const li = document.createElement('li');
    li.textContent = f;
    list.appendChild(li);
  });
  if (res.hasUpdate) {
    $('updateStatus').textContent = `New version ${res.latest} is available!`;
    $('updateStatus').className = 'update-status ok';
    $('updateDownload').style.display = 'inline-block';
    $('updateDownload').disabled = false;
    $('updateDownload').textContent = 'Download Update';
    $('updateProgress').style.display = 'none';
    $('updateDownload').onclick = async () => {
      $('updateDownload').disabled = true;
      $('updateDownload').textContent = 'Downloading...';
      $('updateProgress').style.display = 'block';
      $('updateProgressFill').style.width = '0%';
      $('updateProgressText').textContent = 'Downloading update...';
      window._updateDownloaded = false;
      window._lastDlProgress = Date.now();
      armDownloadWatchdog();
      const r = await launcherApi.installUpdate();
      clearTimeout(window._dlWatchdog);
      if (!r.ok) {
        $('updateStatus').textContent = 'Download failed: ' + (r.error || 'unknown error');
        $('updateStatus').className = 'update-status err';
        $('updateDownload').disabled = false;
        $('updateDownload').textContent = 'Try Again';
        $('updateRefresh').style.display = 'inline-block';
        return;
      }
    };
  } else if (!res.reachable) {
    $('updateStatus').textContent = 'Could not reach the update server.';
    $('updateStatus').className = 'update-status err';
  } else if (!res.releaseFound) {
    $('updateStatus').textContent = 'No release published on GitHub yet.';
    $('updateStatus').className = 'update-status ok';
  } else {
    $('updateStatus').textContent = 'You are on the latest version.';
    $('updateStatus').className = 'update-status ok';
  }
  $('updateRefresh').style.display = 'inline-block';
}

function armDownloadWatchdog() {
  clearTimeout(window._dlWatchdog);
  window._dlWatchdog = setTimeout(() => {
    if (window._updateDownloaded) return;
    $('updateStatus').textContent = 'Download seems stuck. Your connection may be slow - wait or hit Refresh. If it keeps failing, grab the installer from the GitHub release page.';
    $('updateStatus').className = 'update-status err';
    $('updateRefresh').style.display = 'inline-block';
  }, 45000);
}

$('updateRefresh').addEventListener('click', runUpdateCheck);

$('modalClose').addEventListener('click', () => {
  $('updateModal').style.display = 'none';
});

$('updateModal').addEventListener('click', (e) => {
  if (e.target === $('updateModal')) $('updateModal').style.display = 'none';
});

launcherApi.onUpdateProgress((p) => {
  const pct = Math.round(p.percent || 0);
  $('updateProgressFill').style.width = pct + '%';
  $('updateProgressText').textContent = `Downloading update... ${pct}%`;
  $('updateDownload').textContent = `Downloading ${pct}%`;
  window._lastDlProgress = Date.now();
  armDownloadWatchdog();
});

launcherApi.onUpdateDownloaded(() => {
  window._updateDownloaded = true;
  clearTimeout(window._dlWatchdog);
  $('updateProgressFill').style.width = '100%';
  $('updateProgressText').textContent = 'Download complete.';
  $('updateStatus').textContent = 'Ready to install. The app will close and restart automatically.';
  $('updateStatus').className = 'update-status ok';
  $('updateDownload').disabled = false;
  $('updateDownload').textContent = 'Install & Restart';
  $('updateDownload').onclick = () => launcherApi.quitAndInstallUpdate();
});

launcherApi.onUpdateError((err) => {
  clearTimeout(window._dlWatchdog);
  $('updateStatus').textContent = 'Update failed: ' + (err.message || String(err));
  $('updateStatus').className = 'update-status err';
  $('updateDownload').disabled = false;
  $('updateDownload').textContent = 'Try Again';
  $('updateRefresh').style.display = 'inline-block';
});

function showUpdateToast(version) {
  if ($('updateToast').style.display !== 'none') return;
  if (version) $('toastTitle').textContent = `New update arrived! v${version}`;
  $('updateToast').style.display = 'block';
  setTimeout(() => { if ($('updateToast').style.display !== 'none') $('updateToast').style.display = 'none'; }, 30000);
}

launcherApi.onUpdateAvailable((info) => {
  if (info && info.state === 'available') showUpdateToast(info.version);
});

$('updateToast').addEventListener('click', (e) => {
  if (e.target.closest('#toastClose')) {
    $('updateToast').style.display = 'none';
    return;
  }
  $('updateToast').style.display = 'none';
  openUpdateModal();
});

function showWhatsNewModal(w) {
  return new Promise((resolve) => {
    $('wnVersion').textContent = w.version || '...';
    $('wnDate').textContent = w.published ? 'Updated ' + w.published : 'Just updated';
    const list = $('wnList');
    list.innerHTML = '';
    const notes = (w.notes && w.notes.length)
      ? w.notes
      : ['Improved performance and stability', 'Bug fixes', 'New features and improvements'];
    notes.forEach((n) => {
      const li = document.createElement('li');
      li.textContent = n;
      list.appendChild(li);
    });
    $('whatsNewModal').style.display = 'flex';
    $('wnClose').onclick = () => {
      $('whatsNewModal').style.display = 'none';
      resolve();
    };
  });
}

function openShortcutsModal() {
  $('shortcutsModal').style.display = 'flex';
}

function openWhatsNewMenu() {
  showWhatsNewModal({
    version: '0.3.0',
    published: '',
    notes: [
      'Update checking now retries automatically and warns when a download gets stuck',
      'Game detail popup with cover art, themes and Steam/Web links',
      'Add your own games with a custom .exe',
      'Library backup: export and import',
      'Store sorting (A-Z / Newest / Random) and Surprise Me',
      'Smarter search with more aliases and duplicate-free browsing',
      'Playtime tracking and Recently Played sorting in your library',
      'Keyboard shortcuts: Ctrl+F, Ctrl+Enter, Esc',
      'Minimize to system tray'
    ]
  });
}

async function openAboutModal() {
  $('aboutModal').style.display = 'flex';
  try {
    const info = await launcherApi.getAppInfo();
    $('aboutVersion').textContent = info.version;
    $('aboutUpdateDate').textContent = info.lastUpdate;
  } catch {
    // ignore
  }
}

$('aboutClose').addEventListener('click', () => {
  $('aboutModal').style.display = 'none';
});

$('shortcutsClose').addEventListener('click', () => {
  $('shortcutsModal').style.display = 'none';
});

$('aboutModal').addEventListener('click', (e) => {
  if (e.target === $('aboutModal')) $('aboutModal').style.display = 'none';
});

async function openAboutDevModal() {
  $('aboutDevModal').style.display = 'flex';
  const img = $('devAvatarImg');
  const fb = $('devAvatarFallback');
  img.style.display = 'none';
  fb.style.display = 'flex';
  try {
    const profile = await launcherApi.getDevProfile();
    if (profile && profile.avatarUrl) {
      img.onload = () => {
        img.style.display = 'block';
        fb.style.display = 'none';
      };
      img.onerror = () => {
        img.style.display = 'none';
        fb.style.display = 'flex';
      };
      img.src = profile.avatarUrl;
    }
  } catch {
    // keep fallback letter
  }
}

$('aboutDevClose').addEventListener('click', () => {
  $('aboutDevModal').style.display = 'none';
});

$('aboutDevModal').addEventListener('click', (e) => {
  if (e.target === $('aboutDevModal')) $('aboutDevModal').style.display = 'none';
});

$('devGithub').addEventListener('click', () => {
  launcherApi.openExternal('https://github.com/its-samir20');
});

$('devFacebook').addEventListener('click', () => {
  launcherApi.openExternal('https://www.facebook.com/its.not.samir');
});

$('devInstagram').addEventListener('click', () => {
  launcherApi.openExternal('https://www.instagram.com/its_not_samir_/');
});

async function openTermsModal() {
  $('termsAgreeRow').style.display = 'none';
  $('termsClose').style.display = 'block';
  $('termsModal').style.display = 'flex';
}

function showFirstRunTerms() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      $('termsAgreeRow').style.display = 'none';
      $('termsClose').style.display = 'block';
      $('termsModal').style.display = 'none';
      $('termsCheckbox').onchange = null;
      $('termsAgreeBtn').onclick = null;
      resolve();
    };
    $('termsAgreeRow').style.display = 'block';
    $('termsClose').style.display = 'none';
    $('termsCheckbox').checked = false;
    $('termsAgreeBtn').disabled = true;
    $('termsModal').style.display = 'flex';
    $('termsCheckbox').onchange = () => {
      $('termsAgreeBtn').disabled = !$('termsCheckbox').checked;
    };
    $('termsAgreeBtn').onclick = async () => {
      if (!$('termsCheckbox').checked) return;
      await saveSetting({ termsAccepted: true });
      finish();
    };
  });
}

$('termsClose').addEventListener('click', () => {
  $('termsModal').style.display = 'none';
});

$('termsModal').addEventListener('click', (e) => {
  if (e.target === $('termsModal') && $('termsAgreeRow').style.display !== 'block') {
    $('termsModal').style.display = 'none';
  }
});

let appSettings = {};

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || 'black';
  document.querySelectorAll('.theme-card').forEach(c => {
    c.classList.toggle('active', c.dataset.themeOpt === (theme || 'black'));
  });
}

async function loadAppSettings() {
  try {
    appSettings = await launcherApi.getSettings();
  } catch {
    appSettings = {};
  }
  applyTheme(appSettings.theme);
}

async function openSettingsModal() {
  if (!appSettings.theme) await loadAppSettings();
  $('setStartup').checked = !!appSettings.startup;
  $('setAutoScan').checked = appSettings.autoScan !== false;
  $('setScanInterval').value = String(appSettings.scanInterval || 60);
  $('setGamePath').value = appSettings.gamePath || '';
  $('setCloseOnLaunch').checked = !!appSettings.closeOnLaunch;
  $('setReopenOnExit').checked = appSettings.reopenOnExit !== false;
  applyTheme(appSettings.theme);
  $('settingsModal').style.display = 'flex';
  try {
    const info = await launcherApi.getAppInfo();
    $('setVersion').textContent = info.version;
    $('setUpdateDate').textContent = info.lastUpdate;
  } catch {
    // ignore
  }
}

function closeSettingsModal() {
  $('settingsModal').style.display = 'none';
}

async function saveSetting(patch) {
  try {
    appSettings = await launcherApi.setSettings(patch);
  } catch {
    // ignore
  }
}

$('settingsClose').addEventListener('click', closeSettingsModal);

$('settingsModal').addEventListener('click', (e) => {
  if (e.target === $('settingsModal')) closeSettingsModal();
});

document.querySelectorAll('.theme-card').forEach(card => {
  card.addEventListener('click', () => {
    const theme = card.dataset.themeOpt;
    applyTheme(theme);
    saveSetting({ theme });
  });
});

$('setStartup').addEventListener('change', (e) => saveSetting({ startup: e.target.checked }));
$('setAutoScan').addEventListener('change', (e) => saveSetting({ autoScan: e.target.checked }));
$('setScanInterval').addEventListener('change', (e) => saveSetting({ scanInterval: parseInt(e.target.value, 10) }));
$('setCloseOnLaunch').addEventListener('change', (e) => saveSetting({ closeOnLaunch: e.target.checked }));
$('setReopenOnExit').addEventListener('change', (e) => saveSetting({ reopenOnExit: e.target.checked }));

$('setBrowse').addEventListener('click', async () => {
  const folder = await launcherApi.selectFolder();
  if (!folder) return;
  $('setGamePath').value = folder;
  saveSetting({ gamePath: folder });
});

async function doBackupExport() {
  const r = await launcherApi.exportBackup();
  if (!r?.ok) {
    if (!r?.canceled) showToast('Export failed: ' + (r?.error || 'unknown error'), 'danger');
    return;
  }
  showToast(`Backup saved (${r.count} games): ${r.path}`, 'success');
}

$('backupExport').addEventListener('click', doBackupExport);

async function doBackupImport() {
  const r = await launcherApi.importBackup();
  if (!r?.ok) {
    if (!r?.canceled) showToast('Import failed: ' + (r?.error || 'unknown error'), 'danger');
    return;
  }
  await refreshMyGames();
  await loadAppSettings();
  applyTheme(appSettings.theme);
  $('setStartup').checked = !!appSettings.startup;
  showToast(`Backup imported (${r.count} games).`, 'success');
}

$('backupImport').addEventListener('click', doBackupImport);

$('featuredBtn').addEventListener('click', async () => {
  if (state._featured) await addToLibrary(state._featured);
});

let storeSearchTimer = null;
$('storeSearch').addEventListener('input', (e) => {
  state.storeSearch = e.target.value;
  clearTimeout(storeSearchTimer);
  storeSearchTimer = setTimeout(renderStore, 250);
});

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const f = chip.dataset.filter;
    state.storeFilter = state.storeFilter === f ? '' : f;
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip && state.storeFilter === f));
    renderStore();
  });
});

$('librarySearch').addEventListener('input', (e) => {
  state.libSearch = e.target.value;
  renderLibrary();
});

$('libSort').addEventListener('change', (e) => {
  state.libSort = e.target.value;
  renderLibrary();
});

$('launchBtn').addEventListener('click', toggleLaunch);
$('favBtn').addEventListener('click', toggleFavorite);
$('deleteBtn').addEventListener('click', deleteGame);
$('shortcutBtn').addEventListener('click', createShortcut);

document.querySelectorAll('.link').forEach(btn => {
  btn.addEventListener('click', () => {
    if (state.selected) showToast(`Link action requested: ${btn.dataset.link} for ${state.selected.name}`, 'accent');
  });
});

document.addEventListener('click', (e) => {
  if (contextMenuEl && !contextMenuEl.contains(e.target)) closeContextMenu();
  if (hamburgerMenu && hamburgerMenu.style.display === 'block' && !hamburgerMenu.contains(e.target) && !e.target.closest('#settingsBtn')) closeHamburgerMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeContextMenu();
    closeHamburgerMenu();
    const openModals = ['gameModal', 'customModal', 'updateModal', 'settingsModal', 'aboutModal', 'aboutDevModal', 'termsModal', 'whatsNewModal', 'shortcutsModal', 'launchModal'];
    for (const id of openModals) {
      const el = $(id);
      if (el && el.style.display === 'flex') el.style.display = 'none';
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    if (state.currentTab === 'library') {
      $('librarySearch').focus();
      $('librarySearch').select();
    } else {
      $('storeSearch').focus();
      $('storeSearch').select();
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (state.selected && !state.running) toggleLaunch();
  }
});

window.addEventListener('blur', () => { closeContextMenu(); closeHamburgerMenu(); });

async function refreshPlaytimes() {
  try {
    state.playtimes = await launcherApi.getPlaytimes();
  } catch {
    state.playtimes = state.playtimes || {};
  }
  renderLibrary();
}

launcherApi.onGameExited(() => {
  if (!state.running) return;
  state.running = false;
  state.runningGame = null;
  setLaunchUi();
  showToast('Process exited.', 'danger');
  refreshPlaytimes();
});

function initAutoScrollbar() {
  const bar = document.createElement('div');
  bar.id = 'auto-scrollbar';
  document.body.appendChild(bar);
  let hideTimer = null;
  let target = null;

  function paint() {
    if (!target || !target.isConnected) { bar.style.opacity = '0'; return; }
    const { clientHeight, scrollHeight, scrollTop } = target;
    if (scrollHeight <= clientHeight + 1) { bar.style.opacity = '0'; return; }
    const barH = Math.max(24, (clientHeight / scrollHeight) * clientHeight);
    const maxTop = clientHeight - barH;
    const top = (scrollTop / (scrollHeight - clientHeight)) * maxTop;
    const r = target.getBoundingClientRect();
    bar.style.height = barH + 'px';
    bar.style.top = (r.top + top) + 'px';
    bar.style.left = (r.right - 8) + 'px';
    bar.style.opacity = '1';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { bar.style.opacity = '0'; }, 2000);
  }

  document.addEventListener('scroll', (e) => {
    const el = e.target;
    if (el instanceof Element && el.scrollHeight > el.clientHeight + 1) {
      target = el;
      paint();
    }
  }, true);

  document.addEventListener('wheel', (e) => {
    let node = (e.target instanceof Element) ? e.target : document.body;
    while (node && node !== document.documentElement) {
      if (node.scrollHeight > node.clientHeight + 1) { target = node; paint(); break; }
      node = node.parentElement;
    }
  }, true);
}


// ---------------- browse all games ----------------
let storeOffset = 0;
let storeDone = false;
let storeLoading = false;
const STORE_BATCH = 200;
const STORE_CAP = 10000;

function storeGridCardHtml(g) {
  const icon = g.icon
    ? '<img class="game-img" loading="lazy" src="' + esc(g.icon) + '" onerror="this.style.display=\'none\';this.parentElement.classList.add(\'no-cover\');" onload="this.style.display=\'block\';">'
    : '<div class="game-cover-ph">' + esc((g.name || '?').charAt(0).toUpperCase()) + '</div>';
  return '<div class="game-cover">' + icon + '</div>' +
         '<div class="game-info">' +
         '<div class="game-name" title="' + esc(g.name) + '">' + esc(g.name) + '</div>' +
         '<div class="game-sub">' + esc(g.exe) + '</div>' +
         '<button class="game-add" type="button">Add to Library</button>' +
         '</div>';
}

function renderStoreChips() {
  const wrap = $('storeCats');
  if (!wrap) return;
  const cats = ['All'].concat(state.storeThemes || []);
  const active = state.storeCat || 'All';
  let html = '';
  for (const c of cats) {
    html += '<button class="cat-btn' + (c === active ? ' active' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
  }
  wrap.innerHTML = html;
}

function setupStoreCats() {
  const wrap = $('storeCats');
  if (!wrap || wrap.dataset.wired) return;
  wrap.dataset.wired = '1';
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('.cat-btn');
    if (!b) return;
    state.storeCat = b.dataset.cat;
    wrap.querySelectorAll('.cat-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    storeOffset = 0;
    storeDone = false;
    const grid = $('storeGrid');
    if (grid) grid.innerHTML = '';
    const msg = $('storeMore');
    if (msg) { msg.style.display = 'block'; msg.textContent = 'Loading games...'; }
    loadStoreBatch();
  });
}

async function loadStoreBatch() {
  if (storeDone || storeLoading) return;
  storeLoading = true;
  try {
    const cat = state.storeCat || 'All';
    const q = String(state.storeSearch || '').trim();
    const page = await launcherApi.getDatabaseGames(q, storeOffset, STORE_BATCH, cat, state.storeSort || 'az');
    const items = Array.isArray(page?.items) ? page.items : [];
    storeOffset += items.length;
    if (items.length < STORE_BATCH || storeOffset >= STORE_CAP) storeDone = true;
    const themes = new Set(state.storeThemes || []);
    const seen = new Set(state.db.map((x) => String(x.id) + '::' + String(x.exe)));
    for (const g of items) {
      for (const t of (g.themes || [])) themes.add(t);
      const key = String(g.id) + '::' + String(g.exe);
      if (!seen.has(key)) { seen.add(key); state.db.push(g); }
    }
    state.storeThemes = Array.from(themes).sort();
    renderStoreChips();
    setupStoreCats();
    const grid = $('storeGrid');
    if (grid) {
      for (const g of items) {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.dataset.id = g.id;
        card.dataset.exe = g.exe;
        card.innerHTML = storeGridCardHtml(g);
        grid.appendChild(card);
      }
    }
    const msg = $('storeMore');
    if (msg) {
      if (storeDone) msg.style.display = 'none';
      else if (!items.length) { msg.textContent = 'No more games.'; msg.style.display = 'block'; }
      else { msg.textContent = 'Loading more games...'; msg.style.display = 'block'; }
    }
  } catch (e) {
    storeDone = true;
    const msg = $('storeMore');
    if (msg) { msg.textContent = 'Could not load more games.'; msg.style.display = 'block'; }
  } finally {
    storeLoading = false;
  }
}

function renderStoreAllGames() {
  storeOffset = 0;
  storeDone = false;
  storeLoading = false;
  const grid = $('storeGrid');
  if (grid) grid.innerHTML = '';
  const msg = $('storeMore');
  if (msg) { msg.style.display = 'block'; msg.textContent = 'Loading games...'; }
  renderStoreChips();
  setupStoreCats();
  setupStoreSort();
  loadStoreBatch();
}

function setupStoreScroll() {
  const sentinel = $('storeMore');
  if (!sentinel || sentinel.dataset.wired) return;
  if (!('IntersectionObserver' in window)) {
    window.addEventListener('scroll', () => {
      if (!storeLoading && !storeDone && window.innerHeight + window.scrollY > document.body.scrollHeight - 600) loadStoreBatch();
    });
    return;
  }
  sentinel.dataset.wired = '1';
  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadStoreBatch();
  }, { rootMargin: '700px' }).observe(sentinel);
}

function setupStoreGridActions() {
  const grid = $('storeGrid');
  if (!grid || grid.dataset.wired) return;
  grid.dataset.wired = '1';
  grid.addEventListener('click', async (e) => {
    const card = e.target.closest('.game-card');
    if (!card) return;
    const g = state.db.find((x) => String(x.id) === String(card.dataset.id) && String(x.exe) === String(card.dataset.exe));
    if (!g) return;
    if (e.target.closest('.game-add')) {
      await addToLibrary(g);
    } else {
      openGameModal(g);
    }
  });
}

function openGameModal(g) {
  if (!g) return;
  $('gmName').textContent = g.name;
  $('gmExe').textContent = g.exe;
  $('gmAppId').textContent = g.id ? 'App ID ' + g.id : '';
  const ph = $('gmArtPh');
  const img = $('gmArtImg');
  const iconUrl = gameIcon(g);
  if (iconUrl) {
    ph.style.display = 'none';
    img.style.display = 'none';
    img.onload = () => { img.style.display = 'block'; ph.style.display = 'none'; };
    img.onerror = () => { img.style.display = 'none'; ph.style.display = 'flex'; };
    img.src = iconUrl;
  } else {
    img.style.display = 'none';
    ph.style.display = 'flex';
    ph.textContent = (g.name || '?').charAt(0).toUpperCase();
  }
  const themes = $('gmThemes');
  themes.innerHTML = '';
  (g.themes || []).slice(0, 8).forEach(t => {
    const s = document.createElement('span');
    s.className = 'gm-theme-tag';
    s.textContent = t;
    themes.appendChild(s);
  });
  const nd = getNewDetectionFlag(g);
  const note = $('gmNote');
  if (nd) {
    note.textContent = 'New detection (no fixed executable) - shows on Discord via Rich Presence.';
    note.style.display = 'block';
  } else {
    note.style.display = 'none';
  }
  const addBtn = $('gmAdd');
  if (isInLibrary(g)) {
    addBtn.textContent = 'In Library \u2713';
    addBtn.disabled = true;
  } else {
    addBtn.textContent = 'Add to Library';
    addBtn.disabled = false;
    addBtn.onclick = async () => {
      await addToLibrary(g, false);
      addBtn.textContent = 'In Library \u2713';
      addBtn.disabled = true;
      showToast(g.name + ' added to library.', 'success');
    };
  }
  $('gmSteam').onclick = () => launcherApi.openExternal('https://store.steampowered.com/search/?term=' + encodeURIComponent(g.name));
  $('gmGoogle').onclick = () => launcherApi.openExternal('https://www.google.com/search?q=' + encodeURIComponent(g.name));
  $('gameModal').style.display = 'flex';
}

$('gmClose').addEventListener('click', () => {
  $('gameModal').style.display = 'none';
});

$('gameModal').addEventListener('click', (e) => {
  if (e.target === $('gameModal')) $('gameModal').style.display = 'none';
});

function openCustomModal() {
  $('cgName').value = '';
  $('cgPath').value = '';
  $('customModal').style.display = 'flex';
  $('cgName').focus();
}

$('addCustomBtn').addEventListener('click', openCustomModal);

$('cgBrowse').addEventListener('click', async () => {
  const p = await launcherApi.selectFile();
  if (p) $('cgPath').value = p;
});

$('cgCancel').addEventListener('click', () => {
  $('customModal').style.display = 'none';
});

$('customModal').addEventListener('click', (e) => {
  if (e.target === $('customModal')) $('customModal').style.display = 'none';
});

$('cgAdd').addEventListener('click', async () => {
  const name = $('cgName').value.trim();
  const exe = $('cgPath').value.trim();
  if (!name || !exe) {
    showToast('Enter a name and pick an .exe.', 'danger');
    return;
  }
  $('cgAdd').disabled = true;
  let r;
  try {
    r = await launcherApi.addCustomGame(name, exe);
  } catch (err) {
    r = { ok: false, error: String(err?.message || err) };
  }
  $('cgAdd').disabled = false;
  if (!r?.ok) {
    showToast('Custom game failed: ' + (r.error || 'unknown error'), 'danger');
    return;
  }
  $('customModal').style.display = 'none';
  await refreshMyGames();
  const added = state.myGames.find(g => g && g.custom && String(g.exe).toLowerCase() === exe.toLowerCase());
  if (added) selectGame(added);
  switchTab('library');
  showToast((r.existed ? 'Already in library: ' : 'Added: ') + (r.entry?.name || name), 'success');
});

function setupStoreSort() {
  const sel = $('storeSort');
  if (!sel || sel.dataset.wired) return;
  sel.dataset.wired = '1';
  sel.addEventListener('change', () => {
    state.storeSort = sel.value;
    storeOffset = 0;
    storeDone = false;
    const grid = $('storeGrid');
    if (grid) grid.innerHTML = '';
    const msg = $('storeMore');
    if (msg) { msg.style.display = 'block'; msg.textContent = 'Loading games...'; }
    loadStoreBatch();
  });
}

async function surpriseMe() {
  let batch;
  try {
    batch = await launcherApi.getDatabaseGames('', 0, 300, 'All', 'random');
  } catch {
    showToast('Could not load games.', 'danger');
    return;
  }
  const items = (Array.isArray(batch && batch.items) ? batch.items : []).filter(g => !isInLibrary(g));
  if (!items.length) {
    showToast('Every game is already in your library!', 'accent');
    return;
  }
  openGameModal(items[Math.floor(Math.random() * items.length)]);
}

$('surpriseBtn').addEventListener('click', surpriseMe);

(async function init() {
  await loadAppSettings();
  if (!appSettings.termsAccepted) {
    await showFirstRunTerms();
  }
  try {
    const wn = await launcherApi.getWhatsNew();
    if (wn && wn.show) {
      await showWhatsNewModal(wn);
      await launcherApi.markWhatsNewSeen();
    }
  } catch {
    // ignore whats-new failures
  }
  await ensureDatabaseSynced();
  await refreshMyGames();
  try {
    state.playtimes = await launcherApi.getPlaytimes();
  } catch {
    state.playtimes = {};
  }
  loadDatabaseUntil(() => state.db.length >= 50).then(() => {
    renderStore();
    renderLibrary();
  });
  initAutoScrollbar();
  setupStoreScroll();
  setupStoreGridActions();
})();
