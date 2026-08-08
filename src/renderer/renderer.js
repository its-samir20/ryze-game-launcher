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
  libSearch: ''
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
    cards = results.slice(0, 6).map(g => ({ tag: 'Search', game: g }));
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
  for (let i = 0; i < 6; i++) {
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
    if (g.usesNewDetection) sub += '   ·   new detection';
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
    cardsEl.appendChild(card);
  }

  updateFeatured();
}

// ---------------- library ----------------
function renderLibrary() {
  const term = state.libSearch.trim().toLowerCase();
  const listEl = $('libraryList');
  const countEl = $('libraryCount');

  const games = [...state.myGames].sort((a, b) => {
    if (!!a.isFavorite !== !!b.isFavorite) return a.isFavorite ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });

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
    row.innerHTML = `
      <div class="row-top">
        ${logo}
        <div class="row-name">${esc(g.isFavorite ? '★  ' : '')}${esc(g.name)}</div>
      </div>
      <div class="row-sub">${esc(g.exe)}   ·   App ID ${esc(g.appId || '—')}</div>
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
  $('detailSub').textContent = `${game.exe}   ·   App ID ${game.appId || '—'}`;

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
    noteEl.textContent = 'New detection (no fixed executable).';
  } else {
    noteEl.textContent = '';
  }

  const note = $('detailNote');
  if (nd) {
    note.textContent = 'Note: this game uses new detection (no fixed executable). The status is set directly via rich presence.';
    note.style.display = 'block';
  } else {
    note.style.display = 'none';
  }

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
  $('updateStatus').textContent = 'Checking for updates...';
  $('updateStatus').className = 'update-status';
  $('updateDownload').style.display = 'none';
  $('verVal').textContent = '...';
  $('updateDate').textContent = '...';
  $('fixList').innerHTML = '';
  let res;
  try {
    res = await launcherApi.checkForUpdates();
  } catch (err) {
    $('updateStatus').textContent = 'Could not reach the update server.';
    $('updateStatus').className = 'update-status err';
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
    $('updateDownload').onclick = () => launcherApi.openExternal(res.url);
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
}

$('modalClose').addEventListener('click', () => {
  $('updateModal').style.display = 'none';
});

$('updateModal').addEventListener('click', (e) => {
  if (e.target === $('updateModal')) $('updateModal').style.display = 'none';
});

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
  launcherApi.openExternal('https://github.com/samircloudnxt');
});

$('devFacebook').addEventListener('click', () => {
  launcherApi.openExternal('https://www.facebook.com/its.not.samir');
});

$('devInstagram').addEventListener('click', () => {
  launcherApi.openExternal('https://www.instagram.com/its_not_samir_/');
});

async function openTermsModal() {
  $('termsModal').style.display = 'flex';
}

$('termsClose').addEventListener('click', () => {
  $('termsModal').style.display = 'none';
});

$('termsModal').addEventListener('click', (e) => {
  if (e.target === $('termsModal')) $('termsModal').style.display = 'none';
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
  $('setTrayOnClose').checked = !!appSettings.trayOnClose;
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
$('setTrayOnClose').addEventListener('change', (e) => saveSetting({ trayOnClose: e.target.checked }));

$('setBrowse').addEventListener('click', async () => {
  const folder = await launcherApi.selectFolder();
  if (!folder) return;
  $('setGamePath').value = folder;
  saveSetting({ gamePath: folder });
});

$('featuredBtn').addEventListener('click', async () => {
  if (state._featured) await addToLibrary(state._featured);
});

$('storeSearch').addEventListener('input', async (e) => {
  state.storeSearch = e.target.value;
  renderStore();
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
  if (e.key === 'Escape') { closeContextMenu(); closeHamburgerMenu(); }
});

window.addEventListener('blur', () => { closeContextMenu(); closeHamburgerMenu(); });

launcherApi.onGameExited(() => {
  if (!state.running) return;
  state.running = false;
  state.runningGame = null;
  setLaunchUi();
  showToast('Process exited.', 'danger');
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

(async function init() {
  await loadAppSettings();
  await ensureDatabaseSynced();
  await refreshMyGames();
  loadDatabaseUntil(() => state.db.length >= 50).then(() => {
    renderStore();
    renderLibrary();
  });
  initAutoScrollbar();
})();
