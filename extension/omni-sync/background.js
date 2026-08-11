/**
 * Hypersheets Omni Live — service worker.
 * - One-click Omni collect (logged-in session APIs via content script)
 * - Widget data: Hypersheets imports + public marks + HL public API
 */
const VERSION = 23;
const NAME = 'Hypersheets Omni Live';
const VAR_STATS = 'https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats';
const HL_INFO = 'https://api.hyperliquid.xyz/info';
const HL_FILLS_FLOOR = Date.parse('2023-01-01T00:00:00Z');
const DETACHED_KEY = 'hsDetachedWindowId';
const LOCK_KEY = 'hsWidgetLocked';
const LOCK_POS_KEY = 'hsWidgetLockPos';
const MAX_LEGS = 10;
const VOL_FILLS_CACHE_MS = 60 * 1000;

const CGU_MSG =
  'Use Collect Omni in the side panel while logged into Omni, or import JSON/CSV on a jambe.';

function isHlWallet(w) {
  return typeof w === 'string' && /^0x[a-fA-F0-9]{40}$/.test(w);
}

function omniSlotIds(accounts) {
  if (accounts && Array.isArray(accounts.slotOrder) && accounts.slotOrder.length) {
    return accounts.slotOrder.filter((id) => accounts.slots && accounts.slots[id]);
  }
  return accounts?.slots ? Object.keys(accounts.slots) : [];
}

function omniSlotLabel(slot, id, index) {
  if (slot && slot.label) return String(slot.label);
  return '';
}

function emptyCsv() {
  return { trades: [], funding: [], realizedPnl: [], transfers: [], files: {} };
}

const MAX_CSV_LIBRARY = 24;

function newCsvId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function tradeDedupeKey(t) {
  if (!t || typeof t !== 'object') return '';
  if (t.id != null && t.id !== '') return 'id:' + String(t.id);
  if (t.trade_id != null && t.trade_id !== '') return 'tid:' + String(t.trade_id);
  const u = String(t.underlying || (t.instrument && t.instrument.underlying) || '');
  const ts = String(t.created_at || t.timestamp || '');
  const px = String(t.price || t.mark_price || '');
  const qty = String(t.qty || '');
  const side = String(t.side || '');
  return [u, ts, px, qty, side].join('|');
}

function rowDedupeKey(row, kind) {
  if (!row || typeof row !== 'object') return '';
  if (row.id != null && row.id !== '') return kind + ':id:' + String(row.id);
  return kind + ':' + JSON.stringify(row).slice(0, 240);
}

function mergeCsvBundles(bundles) {
  const out = emptyCsv();
  const seen = { trades: new Set(), funding: new Set(), realizedPnl: new Set(), transfers: new Set() };
  for (const b of bundles || []) {
    if (!b || typeof b !== 'object') continue;
    for (const t of b.trades || []) {
      const k = tradeDedupeKey(t);
      if (k && seen.trades.has(k)) continue;
      if (k) seen.trades.add(k);
      out.trades.push(t);
    }
    for (const kind of ['funding', 'realizedPnl', 'transfers']) {
      for (const row of b[kind] || []) {
        const k = rowDedupeKey(row, kind);
        if (k && seen[kind].has(k)) continue;
        if (k) seen[kind].add(k);
        out[kind].push(row);
      }
    }
    if (b.files && typeof b.files === 'object') {
      out.files = Object.assign({}, out.files, b.files);
    }
  }
  return out;
}

function normalizeCsvLibrary(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const id = e.id ? String(e.id) : newCsvId();
    const bundle = e.bundle && typeof e.bundle === 'object'
      ? {
          trades: Array.isArray(e.bundle.trades) ? e.bundle.trades : [],
          funding: Array.isArray(e.bundle.funding) ? e.bundle.funding : [],
          realizedPnl: Array.isArray(e.bundle.realizedPnl) ? e.bundle.realizedPnl : [],
          transfers: Array.isArray(e.bundle.transfers) ? e.bundle.transfers : [],
          files: e.bundle.files && typeof e.bundle.files === 'object' ? e.bundle.files : {},
        }
      : emptyCsv();
    out.push({
      id,
      label: typeof e.label === 'string' ? e.label.slice(0, 48) : '',
      omniAddress: typeof e.omniAddress === 'string' ? e.omniAddress.toLowerCase() : '',
      importedAt: Number(e.importedAt) || Date.now(),
      tradeCount: Array.isArray(bundle.trades) ? bundle.trades.length : (Number(e.tradeCount) || 0),
      marketsHint: typeof e.marketsHint === 'string' ? e.marketsHint : '',
      bundle,
    });
    if (out.length >= MAX_CSV_LIBRARY) break;
  }
  return out;
}

function csvEntryLabel(bundle, meta) {
  if (meta && meta.label) return String(meta.label).slice(0, 48);
  const hint = marketsHintFromCsv(bundle);
  if (hint) return hint.slice(0, 48);
  const n = (bundle && bundle.trades && bundle.trades.length) || 0;
  const addr = meta && meta.omniAddress ? shortOmniAddr(meta.omniAddress) : '';
  if (addr && n) return addr + ' · ' + n + ' trades';
  if (addr) return addr;
  return n ? n + ' trades' : 'CSV';
}

function upsertCsvLibraryEntry(library, bundle, meta) {
  const list = Array.isArray(library) ? library : [];
  const opts = meta || {};
  const addr = opts.omniAddress ? String(opts.omniAddress).toLowerCase() : '';
  const marketsHint = marketsHintFromCsv(bundle);
  const tradeCount = (bundle && bundle.trades && bundle.trades.length) || 0;
  const label = csvEntryLabel(bundle, opts);

  // Collect same Omni wallet → refresh that library entry (keeps dropdown id stable)
  // File "Ajouter CSV" always creates a new dropdown option (forceNew)
  if (!opts.forceNew && addr) {
    const hit = list.find((e) => e.omniAddress && e.omniAddress === addr);
    if (hit) {
      hit.bundle = bundle || emptyCsv();
      hit.tradeCount = tradeCount;
      hit.marketsHint = marketsHint;
      hit.importedAt = Date.now();
      hit.label = label;
      hit.omniAddress = addr;
      return hit;
    }
  }

  const entry = {
    id: newCsvId(),
    label,
    omniAddress: addr,
    importedAt: Date.now(),
    tradeCount,
    marketsHint,
    bundle: bundle || emptyCsv(),
  };
  list.unshift(entry);
  while (list.length > MAX_CSV_LIBRARY) list.pop();
  return entry;
}

function rebuildSlotCsvFromIds(slot, library) {
  const ids = Array.isArray(slot.csvIds) ? slot.csvIds.map(String) : [];
  const byId = {};
  (library || []).forEach((e) => { byId[e.id] = e; });
  const bundles = [];
  const validIds = [];
  for (const id of ids) {
    if (byId[id] && byId[id].bundle) {
      bundles.push(byId[id].bundle);
      validIds.push(id);
    }
  }
  // Legacy: no ids but csv present
  if (!validIds.length && slot.csv && ((slot.csv.trades && slot.csv.trades.length) || (slot.csv.transfers && slot.csv.transfers.length))) {
    return { csv: slot.csv, csvIds: [] };
  }
  const csv = bundles.length ? mergeCsvBundles(bundles) : emptyCsv();
  return { csv, csvIds: validIds };
}

function defaultAccounts() {
  return {
    slotOrder: ['a'],
    activeImportSlot: 'a',
    slots: {
      a: {
        id: 'a',
        label: '',
        csv: null,
        csvIds: [],
        points: null,
        hlWallet: '',
        omniAddress: '',
        marketsHint: '',
        importedAt: null,
      },
    },
  };
}

function normalizeAccounts(raw) {
  const base = defaultAccounts();
  if (!raw || typeof raw !== 'object') return base;
  const slotsIn = raw.slots && typeof raw.slots === 'object' ? raw.slots : {};
  let order = Array.isArray(raw.slotOrder)
    ? raw.slotOrder.map(String).filter((id) => slotsIn[id])
    : Object.keys(slotsIn);
  if (!order.length) return base;
  order = order.slice(0, MAX_LEGS);
  const slots = {};
  order.forEach((id) => {
    const s = slotsIn[id] || {};
    let marketsHint = typeof s.marketsHint === 'string' ? s.marketsHint : '';
    const csvIds = Array.isArray(s.csvIds)
      ? s.csvIds.map(String).filter(Boolean).slice(0, MAX_CSV_LIBRARY)
      : [];
    slots[id] = {
      id,
      label: typeof s.label === 'string' ? s.label : '',
      csv: s.csv || null,
      csvIds,
      points: s.points || null,
      hlWallet: '',
      omniAddress: typeof s.omniAddress === 'string' ? s.omniAddress.toLowerCase() : '',
      marketsHint,
      importedAt: s.importedAt || null,
    };
    if (typeof s.hlWallet === 'string' && isHlWallet(s.hlWallet)) {
      slots[id].hlWallet = s.hlWallet;
    }
  });
  let active = String(raw.activeImportSlot || order[0]);
  if (!slots[active]) active = order[0];
  return { slotOrder: order, activeImportSlot: active, slots };
}

function walletsFromAccounts(accounts) {
  const acc = normalizeAccounts(accounts);
  const out = [];
  const seen = new Set();
  omniSlotIds(acc).forEach((id) => {
    const w = acc.slots[id] && acc.slots[id].hlWallet;
    if (isHlWallet(w) && !seen.has(w.toLowerCase())) {
      seen.add(w.toLowerCase());
      out.push(w);
    }
  });
  return out;
}

function mergeWalletsList(accounts, wallets) {
  const fromSlots = walletsFromAccounts(accounts);
  const extra = (Array.isArray(wallets) ? wallets : []).filter(isHlWallet);
  const seen = new Set(fromSlots.map((w) => w.toLowerCase()));
  const merged = fromSlots.slice();
  for (const w of extra) {
    if (!seen.has(w.toLowerCase())) {
      seen.add(w.toLowerCase());
      merged.push(w);
    }
  }
  return merged.slice(0, MAX_LEGS);
}

async function loadSyncState() {
  if (synced) return synced;
  try {
    const st = await chrome.storage.local.get(['hsWidgetSync']);
    if (st.hsWidgetSync) synced = st.hsWidgetSync;
  } catch (_) {}
  return synced;
}

async function persistSyncState(next) {
  synced = next;
  await chrome.storage.local.set({ hsWidgetSync: synced });
  // Never block Collecte / mutate on HL+marks network — refresh in background.
  try {
    void refreshWidgetSnapshot();
  } catch (_) {}
  return synced;
}

function defaultAccountsGuard() {
  return { deletedSlots: {}, clearedSlots: {} };
}

function normalizeAccountsGuard(raw) {
  const base = defaultAccountsGuard();
  if (!raw || typeof raw !== 'object') return base;
  const deletedSlots = {};
  const clearedSlots = {};
  if (raw.deletedSlots && typeof raw.deletedSlots === 'object') {
    Object.keys(raw.deletedSlots).forEach((id) => {
      const t = Number(raw.deletedSlots[id]);
      if (t > 0) deletedSlots[String(id)] = t;
    });
  }
  if (raw.clearedSlots && typeof raw.clearedSlots === 'object') {
    Object.keys(raw.clearedSlots).forEach((id) => {
      const t = Number(raw.clearedSlots[id]);
      if (t > 0) clearedSlots[String(id)] = t;
    });
  }
  return { deletedSlots, clearedSlots };
}

function slotImportScore(slot) {
  if (!slot || typeof slot !== 'object') return 0;
  const csv = slot.csv && typeof slot.csv === 'object' ? slot.csv : null;
  const trades = csv && Array.isArray(csv.trades) ? csv.trades.length : 0;
  const funding = csv && Array.isArray(csv.funding) ? csv.funding.length : 0;
  const transfers = csv && Array.isArray(csv.transfers) ? csv.transfers.length : 0;
  const importedAt = Number(slot.importedAt) || 0;
  const rows = trades + funding + transfers;
  const pts = slot.points;
  const hasPts = !!(pts && (
    pts.points_summary
    || (Array.isArray(pts.points_history) && pts.points_history.length)
    || pts.competition
  ));
  if (!rows && !hasPts) return 0;
  // Points-only jambes must still beat empty slots in merge.
  return rows * 1e6 + (hasPts ? 5e5 : 0) + importedAt;
}

/**
 * Hypersheets page → extension: never wipe richer local Omni legs,
 * never resurrect slots the user just deleted/cleared in the widget.
 */
function mergeAccountsFromHypersheets(localRaw, remoteRaw, guardRaw) {
  const local = normalizeAccounts(localRaw);
  const guard = normalizeAccountsGuard(guardRaw);
  if (!remoteRaw || typeof remoteRaw !== 'object') {
    return { accounts: local, accountsGuard: guard };
  }
  const remote = normalizeAccounts(remoteRaw);
  const deleted = Object.assign({}, guard.deletedSlots);
  const cleared = Object.assign({}, guard.clearedSlots);

  const out = {
    slotOrder: local.slotOrder.slice(),
    activeImportSlot: local.activeImportSlot,
    slots: {},
  };
  local.slotOrder.forEach((id) => {
    out.slots[id] = Object.assign({}, local.slots[id]);
  });

  remote.slotOrder.forEach((id) => {
    const r = remote.slots[id];
    if (!r) return;
    const remAt = Number(r.importedAt) || 0;
    const remScore = slotImportScore(r);

    if (deleted[id] && remAt <= deleted[id]) return;
    if (deleted[id] && remAt > deleted[id]) delete deleted[id];

    const l = out.slots[id];
    if (!l) {
      if (remScore > 0 && out.slotOrder.length < MAX_LEGS) {
        out.slots[id] = Object.assign({}, r);
        out.slotOrder.push(id);
      }
      return;
    }

    const clearAt = cleared[id] || 0;
    const locAt = Number(l.importedAt) || 0;
    if (remScore > 0 && remAt > locAt && remAt > clearAt) {
      out.slots[id].csv = r.csv;
      out.slots[id].importedAt = r.importedAt;
      if (r.points) out.slots[id].points = r.points;
      if (cleared[id]) delete cleared[id];
    }
    if (!out.slots[id].hlWallet && r.hlWallet) out.slots[id].hlWallet = r.hlWallet;
    if (!out.slots[id].label && r.label) out.slots[id].label = r.label;
  });

  if (!out.slots[out.activeImportSlot] && out.slotOrder[0]) {
    out.activeImportSlot = out.slotOrder[0];
  }
  return {
    accounts: normalizeAccounts(out),
    accountsGuard: { deletedSlots: deleted, clearedSlots: cleared },
  };
}

/**
 * Ensure csvLibrary exists and migrate legacy slot.csv → library entries.
 */
function hydrateCsvLibrary(state) {
  const library = normalizeCsvLibrary(state.csvLibrary);
  const accounts = normalizeAccounts(state.accounts);
  const known = new Set(library.map((e) => e.id));

  for (const id of omniSlotIds(accounts)) {
    const slot = accounts.slots[id];
    if (!slot) continue;
    let ids = Array.isArray(slot.csvIds) ? slot.csvIds.map(String) : [];

    // Legacy jambe with csv but no library link → promote into library
    if (
      (!ids.length) &&
      slot.csv &&
      ((slot.csv.trades && slot.csv.trades.length) ||
        (slot.csv.transfers && slot.csv.transfers.length) ||
        (slot.csv.funding && slot.csv.funding.length))
    ) {
      const entry = upsertCsvLibraryEntry(library, slot.csv, {
        label: slot.label || '',
        omniAddress: slot.omniAddress || '',
      });
      if (!known.has(entry.id)) known.add(entry.id);
      ids = [entry.id];
    }

    ids = ids.filter((cid) => known.has(cid) || library.some((e) => e.id === cid));
    const rebuilt = rebuildSlotCsvFromIds(
      Object.assign({}, slot, { csvIds: ids }),
      library
    );
    slot.csvIds = rebuilt.csvIds.length ? rebuilt.csvIds : ids;
    if (rebuilt.csvIds.length) {
      slot.csv = rebuilt.csv;
      slot.marketsHint = marketsHintFromCsv(rebuilt.csv) || slot.marketsHint || '';
    }
  }

  state.csvLibrary = library;
  state.accounts = accounts;
  return state;
}

async function ensureSyncAccounts() {
  const prev = await loadSyncState();
  if (!prev) {
    const fresh = {
      accounts: defaultAccounts(),
      wallets: [],
      csvLibrary: [],
      legacyCsv: null,
      pairOverrides: {},
      accountsGuard: defaultAccountsGuard(),
      syncedAt: Date.now(),
      origin: 'extension-local',
    };
    synced = fresh;
    try {
      await chrome.storage.local.set({ hsWidgetSync: fresh });
    } catch (_) {}
    return fresh;
  }
  const accounts = normalizeAccounts(prev.accounts);
  const wallets = mergeWalletsList(accounts, prev.wallets);
  const state = {
    accounts,
    wallets,
    csvLibrary: normalizeCsvLibrary(prev.csvLibrary),
    legacyCsv: prev.legacyCsv || null,
    pairOverrides: prev.pairOverrides && typeof prev.pairOverrides === 'object' ? prev.pairOverrides : {},
    accountsGuard: normalizeAccountsGuard(prev.accountsGuard),
    syncedAt: prev.syncedAt || Date.now(),
    origin: prev.origin || 'extension-local',
  };
  hydrateCsvLibrary(state);
  return state;
}

function nextSlotId(order) {
  const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  for (const id of letters) {
    if (!order.includes(id)) return id;
  }
  return null;
}

async function getWidgetState() {
  const state = await ensureSyncAccounts();
  return {
    ok: true,
    accounts: state.accounts,
    wallets: state.wallets,
    csvLibrary: state.csvLibrary || [],
    activeImportSlot: state.accounts.activeImportSlot,
  };
}

async function mutateAccounts(mutator) {
  const state = await ensureSyncAccounts();
  const accounts = normalizeAccounts(state.accounts);
  if (!state.accountsGuard || typeof state.accountsGuard !== 'object') {
    state.accountsGuard = defaultAccountsGuard();
  } else {
    state.accountsGuard = normalizeAccountsGuard(state.accountsGuard);
  }
  mutator(accounts, state);
  state.accounts = normalizeAccounts(accounts);
  state.wallets = mergeWalletsList(state.accounts, state.wallets);
  state.csvLibrary = normalizeCsvLibrary(state.csvLibrary);
  if (!state.pairOverrides || typeof state.pairOverrides !== 'object') state.pairOverrides = {};
  state.accountsGuard = normalizeAccountsGuard(state.accountsGuard);
  state.syncedAt = Date.now();
  state.origin = 'extension-local';
  await persistSyncState(state);
  // Keep Hypersheets localStorage aligned so content-hs-sync cannot resurrect deletes.
  try {
    void pushAccountsToHypersheetsTabs();
  } catch (_) {}
  return getWidgetState();
}

async function pushAccountsToHypersheetsTabs() {
  const state = await ensureSyncAccounts();
  const patterns = [
    'https://hypersheets.xyz/*',
    'http://localhost/*',
    'http://127.0.0.1/*',
  ];
  const tabs = await new Promise((resolve) => {
    chrome.tabs.query({ url: patterns }, (list) => resolve(list || []));
  });
  let sent = 0;
  for (const tab of tabs) {
    if (tab.id == null) continue;
    try {
      await injectHsBridge(tab.id);
    } catch (_) {}
    const ok = await new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'HS_ACCOUNTS_APPLY',
            accounts: state.accounts,
            wallets: state.wallets,
            syncedAt: state.syncedAt,
          },
          (res) => {
            void chrome.runtime.lastError;
            resolve(!!(res && res.ok));
          }
        );
      } catch (_) {
        resolve(false);
      }
    });
    if (ok) sent += 1;
  }
  return sent;
}

/** @type {{ accounts: any, wallets: string[], syncedAt: number } | null} */
let synced = null;
let refreshBusy = false;
let lastFolioCache = { at: 0, data: null };
let lastMarksRefreshAt = 0;
const HL_FOLIO_CACHE_MS = 45 * 1000;
const MARKS_REFRESH_MIN_MS = 8 * 1000;
const PNL_ALERT_KEY = 'hsWidgetPnlAlert';
const PNL_ALERT_STATE_KEY = 'hsWidgetPnlAlertState';
const HL_MISSING_ALERT_STATE_KEY = 'hsWidgetHlMissingAlertState';
const REMINDER_STATE_KEY = 'hsWidgetReminderState';
const REDUNDANCY_STATE_KEY = 'hsWidgetRedundancyState';
const ALERT_OFFSCREEN_PATH = 'offscreen.html';
/** @type {Map<string, { at: number, fills: any[], incomplete: boolean }>} */
const volFillsCache = new Map();
/** @type {number|null} */
let detachedWindowId = null;

async function getDetachedWindowId() {
  if (detachedWindowId != null) return detachedWindowId;
  try {
    const st = await chrome.storage.local.get([DETACHED_KEY]);
    if (st[DETACHED_KEY] != null) detachedWindowId = st[DETACHED_KEY];
  } catch (_) {}
  return detachedWindowId;
}

async function setDetachedWindowId(id) {
  detachedWindowId = id == null ? null : id;
  try {
    if (id == null) await chrome.storage.local.remove([DETACHED_KEY]);
    else await chrome.storage.local.set({ [DETACHED_KEY]: id });
  } catch (_) {}
}

function windowExists(id) {
  return new Promise((resolve) => {
    if (id == null) return resolve(false);
    try {
      chrome.windows.get(id, (win) => {
        if (chrome.runtime.lastError || !win) return resolve(false);
        resolve(true);
      });
    } catch (_) {
      resolve(false);
    }
  });
}

async function closeAllDetachedWidgets() {
  const url = chrome.runtime.getURL('widget.html');
  try {
    const all = await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] });
    for (const w of all || []) {
      const tabs = w.tabs || [];
      const isOurs = tabs.some((t) => t.url && t.url.indexOf(url) === 0);
      if (isOurs && w.id != null) {
        try {
          await chrome.windows.remove(w.id);
        } catch (_) {}
      }
    }
  } catch (_) {}
  await setDetachedWindowId(null);
}

async function disableSidePanelEverywhere() {
  // no-op — side panel is the main UI again
}

async function findOmniTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: ['https://omni.variational.io/*', 'https://*.variational.io/*'] }, (tabs) => {
      const list = tabs || [];
      const preferred = list.find((t) => t.active) || list[0] || null;
      resolve(preferred);
    });
  });
}

async function ensureOmniTab() {
  const existing = await findOmniTab();
  if (existing && existing.id != null) {
    try {
      await chrome.tabs.update(existing.id, { active: true });
    } catch (_) {}
    return existing;
  }
  return new Promise((resolve) => {
    chrome.tabs.create(
      { url: 'https://omni.variational.io/?ref=OMNILD9IBR89', active: true },
      (tab) => resolve(tab || null)
    );
  });
}

function waitTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { chrome.tabs.onUpdated.removeListener(onUpd); } catch (_) {}
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs || 20000);
    function onUpd(id, info) {
      if (id !== tabId) return;
      if (info.status === 'complete') {
        clearTimeout(timer);
        finish(true);
      }
    }
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timer);
        return finish(false);
      }
      if (tab && tab.status === 'complete') {
        clearTimeout(timer);
        return finish(true);
      }
      chrome.tabs.onUpdated.addListener(onUpd);
    });
  });
}

async function broadcastExportToHypersheets(payload) {
  const patterns = [
    'https://hypersheets.xyz/*',
    'http://localhost/*',
    'http://127.0.0.1/*',
  ];
  const tabs = await new Promise((resolve) => {
    chrome.tabs.query({ url: patterns }, (list) => resolve(list || []));
  });
  let sent = 0;
  for (const tab of tabs) {
    if (tab.id == null) continue;
    const ok = await pushExportToTab(tab.id, payload);
    if (ok) sent += 1;
  }
  return sent;
}

function injectHsBridge(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.scripting.executeScript(
        { target: { tabId }, files: ['content.js', 'content-hs-sync.js'] },
        () => resolve(!chrome.runtime.lastError)
      );
    } catch (_) {
      resolve(false);
    }
  });
}

function sendExportMessage(tabId, payload) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(
        tabId,
        {
          type: 'HS_OMNI_EXPORT_APPLY',
          payload,
          fileName: 'variational-export-ext.json',
          hash: '#var-omni-live',
        },
        (res) => {
          if (chrome.runtime.lastError) return resolve(false);
          resolve(!!(res && res.ok !== false));
        }
      );
    } catch (_) {
      resolve(false);
    }
  });
}

function forceOmniLiveHash(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () => {
            try {
              var onOmni = /\/omni\/?$/.test(location.pathname) || location.pathname.indexOf('/omni/') === 0;
              if (!onOmni) {
                location.replace('/omni/#var-omni-live');
                return;
              }
              if (location.hash !== '#var-omni-live') {
                history.replaceState(null, '', '#var-omni-live');
              }
            } catch (_) {}
          },
        },
        () => resolve(!chrome.runtime.lastError)
      );
    } catch (_) {
      resolve(false);
    }
  });
}

async function pushExportToTab(tabId, payload) {
  await waitTabComplete(tabId, 25000);
  await forceOmniLiveHash(tabId);
  try { await chrome.tabs.update(tabId, { active: true }); } catch (_) {}
  let ok = await sendExportMessage(tabId, payload);
  if (ok) {
    await forceOmniLiveHash(tabId);
    return true;
  }
  await injectHsBridge(tabId);
  await new Promise((r) => setTimeout(r, 200));
  ok = await sendExportMessage(tabId, payload);
  if (ok) {
    await forceOmniLiveHash(tabId);
    return true;
  }
  // One more delayed retry — page bridge may still be binding.
  await new Promise((r) => setTimeout(r, 800));
  ok = await sendExportMessage(tabId, payload);
  if (ok) await forceOmniLiveHash(tabId);
  return ok;
}

async function syncToHypersheets() {
  const payload = await rebuildExportFromState();
  let n = await broadcastExportToHypersheets(payload);
  if (!n) {
    const tabId = await new Promise((resolve) => {
      chrome.tabs.create(
        { url: 'https://hypersheets.xyz/omni/#var-omni-live', active: true },
        (tab) => resolve(tab && tab.id != null ? tab.id : null)
      );
    });
    if (tabId != null) {
      const ok = await pushExportToTab(tabId, payload);
      n = ok ? 1 : 0;
    }
  }
  return {
    ok: n > 0,
    hsTabs: n,
    counts: payload.counts || null,
    error: n > 0 ? null : 'Hypersheets tab not ready — open hypersheets.xyz/omni and retry',
  };
}

function injectOmniCollector(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.scripting.executeScript(
        { target: { tabId }, files: ['content-omni-collect.js'] },
        () => resolve(!chrome.runtime.lastError)
      );
    } catch (_) {
      resolve(false);
    }
  });
}

function sendCollect(tabId, opts) {
  const fileName = opts && opts.fileName ? String(opts.fileName).slice(0, 120) : '';
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'HS_OMNI_COLLECT', fileName }, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve({ ok: false, error: err.message || 'Omni tab not ready — reload Omni and retry' });
      resolve(res || { ok: false, error: 'No response from Omni collector' });
    });
  });
}

function slotHasTrades(slot) {
  return !!(slot && slot.csv && Array.isArray(slot.csv.trades) && slot.csv.trades.length);
}

function emptySlotTemplate(id, label) {
  return {
    id,
    label: label || '',
    csv: null,
    csvIds: [],
    points: null,
    hlWallet: '',
    omniAddress: '',
    marketsHint: '',
    importedAt: null,
  };
}

/**
 * Pick which jambe receives an Omni collect/import.
 * - Same Omni address → refresh that jambe (never wipe another wallet)
 * - Empty jambe → fill it
 * - Active jambe already filled by another Omni wallet → create a new jambe
 */
async function ensureTargetImportSlot(opts) {
  const options = opts || {};
  const state = await ensureSyncAccounts();
  const accounts = normalizeAccounts(state.accounts);
  const requestedLabel = typeof options.label === 'string' ? options.label.trim().slice(0, 32) : '';
  let targetSlotId = options.slotId ? String(options.slotId) : '';
  const omniAddress = typeof options.omniAddress === 'string'
    ? options.omniAddress.toLowerCase().trim()
    : '';
  const activeId = accounts.activeImportSlot || accounts.slotOrder[0] || 'a';
  const activeSlot = accounts.slots[activeId];
  const activeHasTrades = slotHasTrades(activeSlot);
  const activeOmni = activeSlot && activeSlot.omniAddress
    ? String(activeSlot.omniAddress).toLowerCase()
    : '';

  // Explicit slot (user clicked Cible / drop target)
  if (targetSlotId && accounts.slots[targetSlotId]) {
    accounts.activeImportSlot = targetSlotId;
    state.accounts = normalizeAccounts(accounts);
    state.syncedAt = Date.now();
    await persistSyncState(state);
    return { slotId: targetSlotId, newLeg: false, matchedBy: 'explicit' };
  }
  targetSlotId = '';

  // Same Omni wallet already collected → always refresh THAT jambe
  if (omniAddress) {
    for (const id of accounts.slotOrder) {
      const s = accounts.slots[id];
      if (s && s.omniAddress && String(s.omniAddress).toLowerCase() === omniAddress) {
        accounts.activeImportSlot = id;
        state.accounts = normalizeAccounts(accounts);
        state.syncedAt = Date.now();
        await persistSyncState(state);
        return { slotId: id, newLeg: false, matchedBy: 'omniAddress' };
      }
    }
  }

  const filledCount = accounts.slotOrder.filter((id) => slotHasTrades(accounts.slots[id])).length;
  // Protect existing jambes: never wipe wallet A when collecting wallet B.
  // If the only filled jambe has no Omni address yet, bind/refresh it once.
  const otherWalletOnActive =
    activeHasTrades &&
    options.protectFilled !== false &&
    (
      (!!omniAddress && !!activeOmni && activeOmni !== omniAddress) ||
      (!omniAddress && filledCount >= 1) ||
      (!!omniAddress && !activeOmni && filledCount > 1)
    );

  // New jambe: explicit flag, or auto when active is occupied by another / unknown Omni wallet
  const wantNewLeg = !!(
    options.newLeg ||
    (options.autoNewLeg === true && activeHasTrades) ||
    otherWalletOnActive
  );

  if (!wantNewLeg) {
    // Prefer empty active, else first empty jambe
    if (!activeHasTrades) {
      return { slotId: activeId, newLeg: false, matchedBy: 'active-empty' };
    }
    const emptyId = accounts.slotOrder.find((id) => !slotHasTrades(accounts.slots[id]));
    if (emptyId) {
      accounts.activeImportSlot = emptyId;
      state.accounts = normalizeAccounts(accounts);
      state.syncedAt = Date.now();
      await persistSyncState(state);
      return { slotId: emptyId, newLeg: false, matchedBy: 'empty' };
    }
    return { slotId: activeId, newLeg: false, matchedBy: 'active-overwrite' };
  }

  // Reuse an empty jambe before creating one
  const emptyId = accounts.slotOrder.find((id) => !slotHasTrades(accounts.slots[id]));
  if (emptyId) {
    accounts.activeImportSlot = emptyId;
    if (requestedLabel && accounts.slots[emptyId] && !String(accounts.slots[emptyId].label || '').trim()) {
      accounts.slots[emptyId].label = requestedLabel;
    }
    state.accounts = normalizeAccounts(accounts);
    state.syncedAt = Date.now();
    await persistSyncState(state);
    return { slotId: emptyId, newLeg: false, matchedBy: 'empty' };
  }

  if (accounts.slotOrder.length < MAX_LEGS) {
    const id = nextSlotId(accounts.slotOrder);
    if (id) {
      accounts.slots[id] = emptySlotTemplate(id, requestedLabel);
      accounts.slotOrder.push(id);
      accounts.activeImportSlot = id;
      state.accounts = normalizeAccounts(accounts);
      state.syncedAt = Date.now();
      await persistSyncState(state);
      return { slotId: id, newLeg: true, matchedBy: 'created' };
    }
  }

  // Max legs reached — last resort overwrite active
  return { slotId: activeId, newLeg: false, matchedBy: 'active-overwrite-max' };
}

async function runOmniCollect(preferredLabel, fileName) {
  const tab = await ensureOmniTab();
  if (!tab || tab.id == null) return { ok: false, error: 'Could not open Omni tab' };
  await waitTabComplete(tab.id, 25000);
  // Give Omni SPA a moment after "complete"
  await new Promise((r) => setTimeout(r, 1200));

  const collectOpts = { fileName: fileName || '' };
  let result = await sendCollect(tab.id, collectOpts);
  if (!result.ok && /Receiving end does not exist|Could not establish connection/i.test(String(result.error || ''))) {
    const injected = await injectOmniCollector(tab.id);
    if (injected) {
      await new Promise((r) => setTimeout(r, 200));
      result = await sendCollect(tab.id, collectOpts);
    }
  }

  if (!result || !result.ok || !result.payload) return result;

  try {
    // Keep a slim last-export (competition board can be huge and block storage)
    const slim = slimPayloadForStorage(result.payload);
    await chrome.storage.local.set({
      hsOmniLastExport: {
        at: Date.now(),
        counts: result.counts || null,
        payload: slim,
        fileName: fileName || result.fileName || null,
      },
    });
  } catch (_) {}

  // Route by Omni wallet address so a 2nd collect never wipes the 1st wallet.
  const omniAddress = extractOmniAddress(result.payload);
  const target = await ensureTargetImportSlot({
    label: preferredLabel,
    omniAddress,
    protectFilled: true,
  });

  let applied = null;
  try {
    applied = await applyLocalOmniPayload(result.payload, 'omni-collect', target.slotId, preferredLabel);
  } catch (e) {
    return {
      ok: false,
      error: 'Collecte OK Omni mais sync locale echouee: ' + String(e && e.message || e),
      counts: result.counts,
    };
  }

  if (!applied || !applied.ok) {
    return {
      ok: false,
      error: (applied && applied.error) || 'Sync locale echouee',
      counts: result.counts,
    };
  }

  // Single sync path: accounts push only. Do NOT also PAGE_IMPORT the payload
  // (that re-applied onto the active jambe and made old jambes look duplicated).
  try {
    void pushAccountsToHypersheetsTabs();
  } catch (_) {}

  return {
    ok: true,
    counts: result.counts,
    mb: result.mb,
    warnings: result.warnings || result.payload.warnings || [],
    hsTabs: null,
    widgetSynced: true,
    newLeg: !!(target && target.newLeg),
    matchedBy: target && target.matchedBy,
    slotId: applied.slotId,
    slotLabel: applied.slotLabel,
    marketsHint: applied.marketsHint,
    omniAddress: applied.omniAddress || omniAddress,
    duplicateSlot: applied.duplicateSlot,
    fileName: fileName || result.fileName || null,
    duplicateLabel: applied.duplicateLabel,
  };
}

/** Drop bulky competition board entries — keep self for Omni address identity. */
function slimPayloadForStorage(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = Object.assign({}, payload);
  if (out.competition && typeof out.competition === 'object') {
    out.competition = {
      pulled_at: out.competition.pulled_at || null,
      ranking: out.competition.ranking || 'score',
      self: out.competition.self || null,
      entries: Array.isArray(out.competition.entries)
        ? out.competition.entries.slice(0, 20)
        : [],
    };
  }
  return out;
}

function normalizeTradeRow(t) {
  if (!t || typeof t !== 'object') return t;
  const underlying = t.underlying || (t.instrument && t.instrument.underlying) || '';
  return Object.assign({}, t, { underlying });
}

function payloadToCsvBundle(payload) {
  const trades = (payload && payload.trades ? payload.trades : []).map(normalizeTradeRow);
  const transfers = (payload && payload.transfers ? payload.transfers : []).slice();
  return {
    trades,
    funding: [],
    realizedPnl: [],
    transfers,
    files: {
      trades: { name: 'omni-export.json', at: Date.now(), rows: trades.length },
      transfers: transfers.length
        ? { name: 'omni-export.json', at: Date.now(), rows: transfers.length }
        : undefined,
    },
  };
}

async function applyLocalOmniBundle(bundle, origin, points, preferredSlotId, preferredLabel, omniMeta, applyOpts) {
  const options = applyOpts || {};
  const replace = options.replace === true;
  const state = await ensureSyncAccounts();
  const accounts = normalizeAccounts(state.accounts);
  const library = normalizeCsvLibrary(state.csvLibrary);
  const requestedLabel = typeof preferredLabel === 'string' ? preferredLabel.trim().slice(0, 32) : '';
  let active = preferredSlotId && accounts.slots[preferredSlotId]
    ? preferredSlotId
    : (accounts.activeImportSlot || accounts.slotOrder[0] || 'a');
  if (!accounts.slots[active]) {
    accounts.slots[active] = emptySlotTemplate(active, '');
    if (!accounts.slotOrder.includes(active)) accounts.slotOrder.push(active);
  }
  accounts.activeImportSlot = active;
  const incoming = bundle || emptyCsv();
  const prevSlot = accounts.slots[active];
  const nextPoints = mergePointsPreferRich(prevSlot.points || null, points);
  const omniAddress = (omniMeta && omniMeta.omniAddress) || '';
  // File imports always add a new dropdown option. Omni collect updates same-address entry.
  const forceNew =
    options.forceNew === true ||
    (!!origin && /drop|import/i.test(String(origin)));
  const entry = upsertCsvLibraryEntry(library, incoming, {
    label: requestedLabel || (options.fileName ? String(options.fileName).slice(0, 48) : '') || prevSlot.label || '',
    omniAddress: omniAddress || '',
    forceNew,
  });

  // One CSV linked per position (dropdown) — joining adds to library then selects it
  const csvIds = [entry.id];

  const rebuilt = rebuildSlotCsvFromIds({ csvIds, csv: null }, library);
  const csv = rebuilt.csv;
  const marketsHint = marketsHintFromCsv(csv);
  const autoLabel = suggestLabelFromCsv(csv);
  const label = (prevSlot.label && String(prevSlot.label).trim())
    ? prevSlot.label
    : (requestedLabel || autoLabel || '');

  // Prefer address from this import, else from selected source, else previous
  let resolvedOmni = omniAddress || '';
  if (!resolvedOmni) {
    const e = library.find((x) => x.id === entry.id);
    if (e && e.omniAddress) resolvedOmni = e.omniAddress;
  }
  if (!resolvedOmni) resolvedOmni = prevSlot.omniAddress || '';

  // Warn if this Omni wallet was already collected into another jambe
  let duplicateSlot = null;
  if (resolvedOmni) {
    for (const id of accounts.slotOrder) {
      if (id === active) continue;
      const other = accounts.slots[id];
      if (other && other.omniAddress && other.omniAddress === resolvedOmni) {
        duplicateSlot = id;
        break;
      }
    }
  }

  accounts.slots[active] = {
    id: active,
    label,
    csv,
    csvIds: rebuilt.csvIds,
    points: nextPoints != null ? nextPoints : (prevSlot.points || null),
    hlWallet: prevSlot.hlWallet || '',
    omniAddress: resolvedOmni || '',
    marketsHint,
    importedAt: Date.now(),
  };

  // Any other jambe that joins this CSV source must refresh its merged open positions
  for (const sid of accounts.slotOrder) {
    if (sid === active) continue;
    const s = accounts.slots[sid];
    if (!s || !Array.isArray(s.csvIds) || !s.csvIds.includes(entry.id)) continue;
    const other = rebuildSlotCsvFromIds(s, library);
    s.csvIds = other.csvIds;
    s.csv = other.csv;
    s.marketsHint = marketsHintFromCsv(other.csv) || s.marketsHint || '';
  }

  const guard = normalizeAccountsGuard(state.accountsGuard);
  if (guard.deletedSlots[active]) delete guard.deletedSlots[active];
  if (guard.clearedSlots[active]) delete guard.clearedSlots[active];
  state.accountsGuard = guard;
  state.accounts = normalizeAccounts(accounts);
  state.csvLibrary = library;
  // legacyCsv mirrors active jambe only — other jambes keep their own csv
  state.legacyCsv = csv;
  state.wallets = mergeWalletsList(state.accounts, state.wallets);
  state.syncedAt = Date.now();
  state.origin = origin || 'extension-local';
  await persistSyncState(state);
  try {
    void pushAccountsToHypersheetsTabs();
  } catch (_) {}
  return {
    ok: true,
    tradeCount: (csv.trades || []).length,
    csvId: entry.id,
    csvIds: rebuilt.csvIds,
    merged: forceNew,
    libraryCount: library.length,
    slotId: active,
    slotLabel: label || active,
    marketsHint,
    omniAddress: resolvedOmni,
    duplicateSlot,
    duplicateLabel: duplicateSlot
      ? ((state.accounts.slots[duplicateSlot] && state.accounts.slots[duplicateSlot].label) || duplicateSlot)
      : null,
    hasPoints: !!(points && (points.points_summary || (points.points_history && points.points_history.length))),
  };
}

function pointsFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const hist = Array.isArray(payload.points_history) ? payload.points_history : [];
  const has =
    payload.points_summary ||
    hist.length ||
    payload.competition;
  if (!has) return null;
  let competition = payload.competition || null;
  if (competition && typeof competition === 'object') {
    competition = {
      pulled_at: competition.pulled_at || null,
      ranking: competition.ranking || 'score',
      self: competition.self || null,
      // Keep a tiny slice — full leaderboard blows chrome.storage and freezes Collecte
      entries: Array.isArray(competition.entries) ? competition.entries.slice(0, 20) : [],
    };
  }
  return {
    v: 1,
    points_summary: payload.points_summary || null,
    points_history: hist,
    competition,
    exported_at: payload.exported_at || null,
    sourceFile: 'omni-collect',
    importedAt: Date.now(),
  };
}

/** Prefer non-empty history/summary — never let a competition-only shell wipe earning epochs. */
function mergePointsPreferRich(prev, next) {
  if (!next) return prev || null;
  if (!prev) return next;
  const prevHist = Array.isArray(prev.points_history) ? prev.points_history : [];
  const nextHist = Array.isArray(next.points_history) ? next.points_history : [];
  const hist = nextHist.length ? nextHist : prevHist;
  const summary = next.points_summary || prev.points_summary || null;
  const competition = next.competition || prev.competition || null;
  if (!summary && !hist.length && !competition) return prev;
  return {
    v: 1,
    points_summary: summary,
    points_history: hist,
    competition,
    exported_at: next.exported_at || prev.exported_at || null,
    sourceFile: next.sourceFile || prev.sourceFile || null,
    importedAt: next.importedAt || prev.importedAt || Date.now(),
  };
}

async function applyLocalOmniPayload(payload, origin, preferredSlotId, preferredLabel, applyOpts) {
  return applyLocalOmniBundle(
    payloadToCsvBundle(payload),
    origin || 'omni-payload',
    pointsFromPayload(payload),
    preferredSlotId,
    preferredLabel,
    { omniAddress: extractOmniAddress(payload) },
    applyOpts
  );
}

async function rebuildExportFromState() {
  const state = await ensureSyncAccounts();
  const accounts = normalizeAccounts(state.accounts);
  const active = accounts.activeImportSlot || accounts.slotOrder[0];
  const slot = active && accounts.slots[active];
  const csv = (slot && slot.csv) || state.legacyCsv || emptyCsv();
  const pts = (slot && slot.points) || null;
  const hasSlotData =
    (csv.trades && csv.trades.length) ||
    (pts && (pts.points_summary || (pts.points_history && pts.points_history.length)));
  if (!hasSlotData) {
    const stored = await chrome.storage.local.get(['hsOmniLastExport']);
    if (stored.hsOmniLastExport && stored.hsOmniLastExport.payload) {
      return stored.hsOmniLastExport.payload;
    }
  }
  return {
    format: 'variational-dashboard-export',
    version: 3,
    exported_at: new Date().toISOString(),
    counts: {
      trades: (csv.trades || []).length,
      transfers: (csv.transfers || []).length,
      points: pts && pts.points_history ? pts.points_history.length : 0,
    },
    trades: csv.trades || [],
    transfers: csv.transfers || [],
    points_history: (pts && pts.points_history) || [],
    points_summary: (pts && pts.points_summary) || null,
    competition: (pts && pts.competition) || null,
  };
}

async function getPointsState() {
  const state = await ensureSyncAccounts();
  const accounts = normalizeAccounts(state.accounts);
  const active = accounts.activeImportSlot || accounts.slotOrder[0];
  let points = active && accounts.slots[active] && accounts.slots[active].points;
  if (!points) {
    const stored = await chrome.storage.local.get(['hsOmniLastExport']);
    const payload = stored.hsOmniLastExport && stored.hsOmniLastExport.payload;
    points = pointsFromPayload(payload);
  }
  return {
    ok: true,
    slotId: active,
    slotLabel: active && accounts.slots[active] ? accounts.slots[active].label : null,
    points: points || null,
  };
}

async function showWidgetInActiveTab() {
  try {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id != null) {
        await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'widget.html', enabled: true });
        await chrome.sidePanel.open({ tabId: tab.id });
        return { ok: true, mode: 'side-panel' };
      }
      const win = await chrome.windows.getCurrent();
      if (win && win.id != null) {
        await chrome.sidePanel.open({ windowId: win.id });
        return { ok: true, mode: 'side-panel' };
      }
    }
  } catch (_) {}
  try {
    return await openOrFocusDetachedWidget();
  } catch (_) {
    return { ok: false, reason: 'open-failed' };
  }
}

function wireActionClick() {
  try {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      // Toolbar icon opens the side panel with widget.html (no in-page FAB).
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    }
  } catch (_) {}
  try {
    chrome.action.onClicked.removeListener(onActionClicked);
  } catch (_) {}
}

function onActionClicked() {
  showWidgetInActiveTab().catch(() => {});
}

async function openOrFocusDetachedWidget() {
  // Free OS popup window — can be dragged to another monitor via the title bar.
  const url = chrome.runtime.getURL('widget.html');
  const existingId = await getDetachedWindowId();
  if (existingId != null && (await windowExists(existingId))) {
    return new Promise((resolve) => {
      chrome.windows.update(existingId, { focused: true, drawAttention: true }, (win) => {
        resolve({
          ok: !chrome.runtime.lastError,
          windowId: win && win.id,
          focused: true,
          mode: 'detached',
        });
      });
    });
  }

  // Place on the right half of the current screen when possible.
  let left = 100;
  let top = 80;
  let width = 440;
  let height = 640;
  try {
    const cur = await chrome.windows.getCurrent();
    if (cur && Number.isFinite(cur.width) && Number.isFinite(cur.left)) {
      width = Math.max(380, Math.min(520, Math.floor((cur.width || 1200) * 0.38)));
      height = Math.max(480, Math.min(800, Math.floor((cur.height || 800) * 0.85)));
      left = Math.floor((cur.left || 0) + (cur.width || 1200) - width - 24);
      top = Math.floor((cur.top || 0) + 48);
    }
  } catch (_) {}

  return new Promise((resolve) => {
    chrome.windows.create(
      {
        url,
        type: 'popup',
        width,
        height,
        left,
        top,
        focused: true,
      },
      async (win) => {
        const err = chrome.runtime.lastError;
        if (!err && win && win.id != null) await setDetachedWindowId(win.id);
        resolve({ ok: !err, windowId: win && win.id, mode: 'detached' });
      }
    );
  });
}

async function captureLockPosition() {
  const id = await getDetachedWindowId();
  if (id == null || !(await windowExists(id))) return;
  return new Promise((resolve) => {
    chrome.windows.get(id, async (win) => {
      if (chrome.runtime.lastError || !win) return resolve();
      const pos = {
        left: win.left,
        top: win.top,
        width: win.width,
        height: win.height,
      };
      try {
        await chrome.storage.local.set({ [LOCK_POS_KEY]: pos });
      } catch (_) {}
      resolve();
    });
  });
}

async function enforceLockedPosition() {
  const st = await chrome.storage.local.get([LOCK_KEY, LOCK_POS_KEY]);
  if (!st[LOCK_KEY] || !st[LOCK_POS_KEY]) return;
  const id = await getDetachedWindowId();
  if (id == null || !(await windowExists(id))) return;
  const pos = st[LOCK_POS_KEY];
  return new Promise((resolve) => {
    chrome.windows.get(id, (win) => {
      if (chrome.runtime.lastError || !win) return resolve();
      const moved =
        win.left !== pos.left ||
        win.top !== pos.top;
      if (!moved) return resolve();
      chrome.windows.update(
        id,
        { left: pos.left, top: pos.top },
        () => resolve()
      );
    });
  });
}

try {
  chrome.windows.onRemoved.addListener((windowId) => {
    if (detachedWindowId === windowId) {
      setDetachedWindowId(null);
    }
  });
} catch (_) {}

function normalizeMarket(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/^XYZ:/i, '')
    .replace(/-PERP$/i, '')
    .replace(/\/USD[CT]?$/i, '')
    .replace(/-USD[CT]?$/i, '')
    .trim();
}

function rebuildOpenFromTrades(bundle) {
  const tradesAll = [...(bundle?.trades || [])]
    .filter((t) => !t.status || t.status === 'confirmed')
    .map((t) => ({
      underlying: normalizeMarket(t.underlying || t.instrument?.underlying || ''),
      ts: Date.parse(t.created_at || 0),
      px: parseFloat(t.price || t.mark_price || 0),
      qty: parseFloat(t.qty || 0),
      sign: String(t.side || '').toLowerCase() === 'buy' ? 1 : -1,
    }))
    .filter((t) => isFinite(t.ts) && t.underlying && isFinite(t.px) && t.px > 0 && isFinite(t.qty) && t.qty > 0)
    .sort((a, b) => a.ts - b.ts);

  const state = {};
  for (const t of tradesAll) {
    const s = state[t.underlying] || { qty: 0, entry: 0, openedAt: 0 };
    const signed = t.sign * t.qty;
    const prev = s.qty;
    const next = prev + signed;
    if (Math.abs(next) < 1e-10) {
      delete state[t.underlying];
      continue;
    }
    if (prev === 0) {
      s.openedAt = t.ts;
    }
    if (prev === 0 || Math.sign(prev) === Math.sign(signed)) {
      const prevAbs = Math.abs(prev);
      const addAbs = Math.abs(signed);
      s.entry = prevAbs + addAbs > 0
        ? (prevAbs * s.entry + addAbs * t.px) / (prevAbs + addAbs)
        : t.px;
    } else if (Math.sign(prev) !== Math.sign(next)) {
      s.entry = t.px;
      s.openedAt = t.ts;
    }
    s.qty = next;
    state[t.underlying] = s;
  }

  return Object.keys(state).map((u) => {
    const s = state[u];
    const qty = Math.abs(s.qty);
    return {
      market: u,
      side: s.qty > 0 ? 'long' : 'short',
      qty,
      entry: s.entry || 0,
      openedAt: s.openedAt || 0,
      notional: qty * (s.entry || 0),
    };
  }).filter((p) => p.qty > 0);
}

function marketsHintFromCsv(bundle) {
  const open = rebuildOpenFromTrades(bundle);
  if (!open.length) return '';
  open.sort((a, b) => (b.notional || 0) - (a.notional || 0));
  return open
    .slice(0, 4)
    .map((p) => p.market + ' ' + p.side)
    .join(' · ');
}

function suggestLabelFromCsv(bundle) {
  const open = rebuildOpenFromTrades(bundle);
  if (!open.length) return '';
  open.sort((a, b) => (b.notional || 0) - (a.notional || 0));
  if (open.length === 1) return open[0].market;
  return open.slice(0, 2).map((p) => p.market).join('+');
}

function extractOmniAddress(payload) {
  const self = payload && payload.competition && payload.competition.self;
  if (self && self.address) return String(self.address).toLowerCase();
  const sum = payload && payload.points_summary;
  if (sum && sum.address) return String(sum.address).toLowerCase();
  if (sum && sum.user && sum.user.address) return String(sum.user.address).toLowerCase();
  return '';
}

function shortOmniAddr(addr) {
  const a = String(addr || '');
  if (!/^0x[a-fA-F0-9]{40}$/i.test(a)) return '';
  return a.slice(0, 6) + '…' + a.slice(-4);
}

function quoteMid(listing) {
  // Prefer live quote mid — public mark_price is often sticky for minutes.
  // Same rule as Hypersheets dashboard / earlier extension builds.
  const q = listing?.quotes?.base || listing?.quotes?.size_1k || listing?.quotes?.size_100k;
  const bid = parseFloat(q?.bid || 0);
  const ask = parseFloat(q?.ask || 0);
  if (bid > 0 && ask >= bid) return (bid + ask) / 2;
  const m = parseFloat(listing?.mark_price || 0);
  return m > 0 ? m : 0;
}

async function fetchMarksMap() {
  const url = VAR_STATS + '?_hs=' + Date.now();
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : null;
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res.ok) throw new Error('stats ' + res.status);
    const data = await res.json();
    const map = Object.create(null);
    for (const L of data.listings || []) {
      const tick = normalizeMarket(L.ticker);
      const mid = quoteMid(L);
      if (tick && mid > 0) map[tick] = mid;
      // Also index by raw ticker variants Omni may use
      const raw = String(L.ticker || '').toUpperCase();
      if (raw && mid > 0) map[raw] = mid;
    }
    return map;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function hlPost(body) {
  const res = await fetch(HL_INFO, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('hl ' + res.status);
  return res.json();
}

async function fetchHlPortfolio(wallets) {
  const positions = [];
  const accounts = [];
  const list = (wallets || []).slice(0, MAX_LEGS);
  for (const raw of list) {
    if (!raw || typeof raw !== 'string') continue;
    const w = raw.trim();
    if (!isHlWallet(w)) continue;
    // Hyperliquid info API expects lowercase EVM address
    const user = w.toLowerCase();
    try {
      const [hlState, xyzState] = await Promise.all([
        hlPost({ type: 'clearinghouseState', user }),
        hlPost({ type: 'clearinghouseState', user, dex: 'xyz' }).catch(() => null),
      ]);
      const take = (state, dex) => {
        const ms = state?.crossMarginSummary || state?.marginSummary || {};
        let accountValue = parseFloat(ms.accountValue || 0);
        if (!(accountValue > 0)) {
          const cross = parseFloat(state?.crossMarginSummary?.accountValue || 0);
          const margin = parseFloat(state?.marginSummary?.accountValue || 0);
          accountValue = cross > 0 ? cross : margin;
        }
        const withdrawable = parseFloat(ms.withdrawable || 0);
        let upnlSum = 0;
        let openCount = 0;
        (state?.assetPositions || []).forEach((ap) => {
          const p = ap?.position;
          if (!p) return;
          const szi = parseFloat(p.szi || 0);
          if (Math.abs(szi) < 1e-12) return;
          const coin = String(p.coin || '');
          const entry = parseFloat(p.entryPx || 0);
          const upnl = parseFloat(p.unrealizedPnl || 0);
          const levRaw = p.leverage && typeof p.leverage === 'object'
            ? (p.leverage.value ?? p.leverage.leverage ?? p.leverage.raw)
            : (p.leverage ?? ap?.leverage ?? null);
          const leverage = parseFloat(levRaw || 0);
          let mark = entry;
          if (Math.abs(szi) > 1e-12 && isFinite(upnl) && isFinite(entry)) {
            mark = entry + upnl / szi;
          }
          if (!(mark > 0)) {
            const pv = Math.abs(parseFloat(p.positionValue || 0));
            if (pv > 0) mark = pv / Math.abs(szi);
          }
          openCount += 1;
          if (isFinite(upnl)) upnlSum += upnl;
          positions.push({
            coin,
            market: normalizeMarket(coin),
            side: szi > 0 ? 'long' : 'short',
            qty: Math.abs(szi),
            entry,
            mark: mark > 0 ? mark : entry,
            notionalUsd: Math.abs(szi) * (mark > 0 ? mark : entry),
            upnl: isFinite(upnl) ? upnl : null,
            leverage: isFinite(leverage) && leverage > 0 ? leverage : null,
            dex,
            wallet: w,
          });
        });
        return { accountValue: isFinite(accountValue) ? accountValue : 0, withdrawable: isFinite(withdrawable) ? withdrawable : 0, upnlSum, openCount };
      };
      const hl = take(hlState, 'HL');
      const xyz = xyzState ? take(xyzState, 'XYZ') : { accountValue: 0, withdrawable: 0, upnlSum: 0, openCount: 0 };
      accounts.push({
        wallet: w,
        short: w.slice(0, 6) + '…' + w.slice(-4),
        hlEquity: hl.accountValue,
        hlWithdrawable: hl.withdrawable,
        hlUpnl: hl.upnlSum,
        hlOpen: hl.openCount,
        xyzEquity: xyz.accountValue,
        xyzWithdrawable: xyz.withdrawable,
        xyzUpnl: xyz.upnlSum,
        xyzOpen: xyz.openCount,
        equity: (hl.accountValue || 0) + (xyz.accountValue || 0),
        upnl: (hl.upnlSum || 0) + (xyz.upnlSum || 0),
      });
    } catch (_) {}
  }
  return { positions, accounts };
}

async function fetchHlPositions(wallets) {
  const folio = await fetchHlPortfolio(wallets);
  return folio.positions;
}

/* ── Volume: periods + Omni / HL / XYZ aggregates ── */

function epochStartUtc(ts) {
  const x = new Date(ts);
  const day = x.getUTCDay();
  const diff = (day + 3) % 7; // days since Thursday
  x.setUTCDate(x.getUTCDate() - diff);
  x.setUTCHours(0, 0, 0, 0);
  return +x;
}

function fmtUtcShort(ts) {
  if (!(ts > 0)) return '—';
  const d = new Date(ts);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return mon + ' ' + dd + ' ' + hh + ':' + mm + ' UTC';
}

/** @returns {{ start: number, end: number, label: string }} */
function volumeWindow(source, period, now) {
  const t = now || Date.now();
  const src = source === 'hl' || source === 'xyz' ? source : 'omni';
  const p = String(period || (src === 'omni' ? 'epoch' : '1d'));

  if (src === 'omni' && p === 'epoch') {
    const start = epochStartUtc(t);
    return { start, end: t, label: 'Epoch · ' + fmtUtcShort(start) + ' → now' };
  }
  if (p === '1d' || p === 'daily') {
    if (src === 'omni') {
      const d = new Date(t);
      d.setUTCHours(0, 0, 0, 0);
      return { start: +d, end: t, label: '1D · ' + fmtUtcShort(+d) + ' → now' };
    }
    const start = t - 864e5;
    return { start, end: t, label: '1D · rolling 24h' };
  }
  if (p === '7d' || p === 'weekly') {
    const start = t - 7 * 864e5;
    return { start, end: t, label: '7D · rolling' };
  }
  if (p === 'mtd' || (p === 'monthly' && src === 'omni') || p === 'month') {
    const d = new Date(t);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return { start: +d, end: t, label: 'MTD · ' + fmtUtcShort(+d) + ' → now' };
  }
  if (p === '30d' || (p === 'monthly' && src !== 'omni')) {
    const start = t - 30 * 864e5;
    return { start, end: t, label: '30D · rolling' };
  }
  if (p === 'ytd' || p === 'year') {
    const d = new Date(Date.UTC(new Date(t).getUTCFullYear(), 0, 1));
    return { start: +d, end: t, label: 'YTD · ' + fmtUtcShort(+d) + ' → now' };
  }
  // all
  return {
    start: src === 'omni' ? 0 : HL_FILLS_FLOOR,
    end: t,
    label: src === 'omni' ? 'All time' : 'All · since 2023',
  };
}

function collectOmniTrades(payload, slotId) {
  const out = [];
  const accounts = payload?.accounts ? normalizeAccounts(payload.accounts) : null;
  const want = slotId && slotId !== 'all' ? String(slotId) : null;
  if (accounts?.slots) {
    for (const id of omniSlotIds(accounts)) {
      if (want && id !== want) continue;
      const trades = accounts.slots[id]?.csv?.trades;
      if (Array.isArray(trades)) {
        for (const t of trades) out.push(t);
      }
    }
  } else if (!want && Array.isArray(payload?.legacyCsv?.trades)) {
    for (const t of payload.legacyCsv.trades) out.push(t);
  }
  return out;
}

function listOmniVolumeLegs(payload) {
  const accounts = payload?.accounts ? normalizeAccounts(payload.accounts) : null;
  const legs = [];
  if (!accounts?.slots) {
    const n = Array.isArray(payload?.legacyCsv?.trades) ? payload.legacyCsv.trades.length : 0;
    if (n > 0) legs.push({ id: 'all', label: 'All', trades: n });
    return legs;
  }
  let total = 0;
  omniSlotIds(accounts).forEach((id, index) => {
    const slot = accounts.slots[id];
    const n = Array.isArray(slot?.csv?.trades) ? slot.csv.trades.length : 0;
    if (!(n > 0)) return;
    total += n;
    legs.push({
      id,
      label: omniSlotLabel(slot, id, index),
      trades: n,
    });
  });
  if (legs.length > 1) {
    legs.unshift({ id: 'all', label: 'All', trades: total });
  } else if (legs.length === 1) {
    // Single jambe — keep it selectable but default is that one
  }
  return legs;
}

function collectOmniPointWindows(payload, slotId) {
  const out = [];
  const accounts = payload?.accounts ? normalizeAccounts(payload.accounts) : null;
  const want = slotId && slotId !== 'all' ? String(slotId) : null;
  const pushRows = (rows) => {
    for (const row of rows || []) {
      const start = Date.parse(row?.start_window || 0);
      const end = Date.parse(row?.end_window || 0);
      if (start > 0 && end > start) out.push({ start, end });
    }
  };
  if (accounts?.slots) {
    for (const id of omniSlotIds(accounts)) {
      if (want && id !== want) continue;
      pushRows(accounts.slots[id]?.points?.points_history);
    }
  } else if (!want) {
    pushRows(payload?.points_history);
  }
  return out;
}

function currentOmniEpochWindow(payload, slotId, now) {
  const t = now || Date.now();
  const rows = collectOmniPointWindows(payload, slotId);
  let active = null;
  let latest = null;
  for (const row of rows) {
    if (!latest || row.end > latest.end) latest = row;
    if (row.start <= t && t < row.end) {
      if (!active || row.start > active.start) active = row;
    }
  }
  if (active) {
    return {
      start: active.start,
      end: Math.min(t, active.end - 1),
      label: 'Epoch · ' + fmtUtcShort(active.start) + ' → now',
    };
  }
  if (latest && latest.end > t - 21 * 864e5) {
    const nextStart = latest.end;
    const nextEnd = nextStart + 7 * 864e5;
    if (nextStart <= t && t < nextEnd) {
      return {
        start: nextStart,
        end: t,
        label: 'Epoch · ' + fmtUtcShort(nextStart) + ' → now',
      };
    }
  }
  const start = epochStartUtc(t);
  return { start, end: t, label: 'Epoch · ' + fmtUtcShort(start) + ' → now' };
}

function omniTradeVolume(trades, start, end) {
  let volume = 0;
  let count = 0;
  for (const t of trades || []) {
    if (t.status && t.status !== 'confirmed') continue;
    const ts = Date.parse(t.created_at || 0);
    if (!(ts > 0)) continue;
    if (start > 0 && ts < start) continue;
    if (end > 0 && ts > end) continue;
    const px = parseFloat(t.price || t.mark_price || 0);
    const qty = parseFloat(t.qty || 0);
    if (!(px > 0) || !(qty > 0)) continue;
    volume += Math.abs(px * qty);
    count += 1;
  }
  return { volume, count };
}

function fillNotional(f) {
  const sz = Math.abs(parseFloat(f?.sz ?? f?.size ?? f?.qty ?? 0));
  const px = parseFloat(f?.px ?? f?.price ?? 0);
  return sz > 0 && px > 0 ? sz * px : 0;
}

function fillIdentity(f) {
  return f && f.tid != null
    ? String(f.tid)
    : [f?.time || 0, f?.coin || '', f?.px || f?.price || 0, f?.sz || f?.size || f?.qty || 0].join('|');
}

function isUnitLikeFill(f) {
  const coin = String(f?.coin || '').trim();
  if (!coin.includes('/') && !coin.startsWith('@')) return false;
  if (coin.includes('/')) {
    const base = coin.split('/')[0].toUpperCase();
    if (!base.startsWith('U') || base.length < 3) return false;
    return !['USDC', 'USDT', 'USD1', 'USDE', 'USD'].includes(base);
  }
  return false;
}

function isXyzFill(f) {
  const coin = String(f?.coin || '').toLowerCase();
  const market = String(f?._market || '').toLowerCase();
  return market === 'hip3' || coin.startsWith('xyz:');
}

async function fetchUserFillsByTime(wallet, startTime, dex, maxPages) {
  const PAGE = 2000;
  const MAX = maxPages || (startTime <= HL_FILLS_FLOOR + 864e5 ? 40 : 20);
  const user = String(wallet).toLowerCase();
  const seen = new Set();
  const results = [];
  let incomplete = false;
  let cursorStart = startTime;
  let cursorEnd = Date.now();
  let order = null;

  for (let p = 0; p < MAX; p++) {
    const body = {
      type: 'userFillsByTime',
      user,
      startTime: cursorStart,
      endTime: cursorEnd,
      aggregateByTime: false,
    };
    if (dex) body.dex = dex;
    let batch;
    try {
      batch = await hlPost(body);
    } catch (_) {
      incomplete = true;
      break;
    }
    if (!Array.isArray(batch)) {
      incomplete = true;
      break;
    }
    if (!batch.length) break;

    if (order == null && batch.length > 1) {
      order = batch[0].time <= batch[batch.length - 1].time ? 'asc' : 'desc';
    }

    let minTime = Infinity;
    let maxTime = -Infinity;
    let newCount = 0;
    for (const f of batch) {
      const tid = f.tid != null ? String(f.tid) : (f.time + '|' + f.coin + '|' + f.px + '|' + f.sz);
      if (seen.has(tid)) continue;
      seen.add(tid);
      results.push(f);
      newCount += 1;
      const tm = Number(f.time) || 0;
      if (tm < minTime) minTime = tm;
      if (tm > maxTime) maxTime = tm;
    }
    if (batch.length < PAGE) break;
    if (newCount === 0) break;

    if (order === 'asc') {
      cursorStart = maxTime + 1;
    } else {
      cursorEnd = minTime - 1;
    }
    if (cursorEnd < cursorStart) break;
  }

  if (results.length >= MAX * PAGE * 0.95) incomplete = true;
  return { fills: results, incomplete };
}

async function getCachedFills(wallet, startTime, dex) {
  const key = String(wallet).toLowerCase() + '::' + (dex || 'hl') + '::' + String(startTime);
  const hit = volFillsCache.get(key);
  if (hit && Date.now() - hit.at < VOL_FILLS_CACHE_MS) return hit;
  const fetched = await fetchUserFillsByTime(wallet, startTime, dex);
  const entry = { at: Date.now(), fills: fetched.fills, incomplete: fetched.incomplete };
  volFillsCache.set(key, entry);
  // Cap cache size
  if (volFillsCache.size > 40) {
    const first = volFillsCache.keys().next().value;
    volFillsCache.delete(first);
  }
  return entry;
}

function sumFillsVolume(fills, start, end, opts) {
  const excludeUnit = !!(opts && opts.excludeUnit);
  let volume = 0;
  let count = 0;
  for (const f of fills || []) {
    const tm = Number(f.time) || 0;
    if (start > 0 && tm < start) continue;
    if (end > 0 && tm > end) continue;
    if (excludeUnit && isUnitLikeFill(f)) continue;
    const v = fillNotional(f);
    if (!(v > 0)) continue;
    volume += v;
    count += 1;
  }
  return { volume, count };
}

function listHlVolumeWallets(payload) {
  const accounts = payload?.accounts ? normalizeAccounts(payload.accounts) : null;
  const wallets = mergeWalletsList(accounts, payload?.wallets || []);
  const legs = wallets.slice(0, MAX_LEGS).map((w) => ({
    id: w,
    label: w.slice(0, 6) + '…' + w.slice(-4),
    trades: null,
  }));
  if (legs.length > 1) {
    legs.unshift({ id: 'all', label: 'All', trades: null });
  }
  return legs;
}

function pickVolumeSlot(legs, slotId) {
  let slot = slotId && slotId !== 'all' ? String(slotId) : 'all';
  if (!legs.length) return 'all';
  if (legs.length === 1) return legs[0].id;
  if (slot !== 'all' && !legs.some((l) => l.id === slot)) {
    return legs.some((l) => l.id === 'all') ? 'all' : legs[0].id;
  }
  if (slot === 'all' && !legs.some((l) => l.id === 'all')) return legs[0].id;
  return slot;
}

async function computeVolumeReport(source, period, slotId) {
  const src = source === 'hl' ? 'hl' : source === 'xyz' ? 'xyz' : 'omni';
  let per = String(period || '');
  if (src !== 'omni' && per === 'epoch') per = '1d';
  if (src === 'omni' && (per === '30d' || per === 'monthly')) per = 'mtd';
  if (!per) per = src === 'omni' ? 'epoch' : '1d';

  const win = volumeWindow(src, per, Date.now());
  const stored = await chrome.storage.local.get(['hsWidgetSync']);
  const payload = synced || stored.hsWidgetSync || null;

  if (src === 'omni') {
    const legs = listOmniVolumeLegs(payload);
    const slot = pickVolumeSlot(legs, slotId);
    const effectiveWin = per === 'epoch' ? currentOmniEpochWindow(payload, slot, Date.now()) : win;
    if (!payload || !legs.length) {
      return {
        ok: true,
        source: src,
        period: per,
        slotId: slot,
        legs,
        volume: 0,
        count: 0,
        window: effectiveWin,
        hintKey: 'volHintCollectOmni',
      };
    }
    const trades = collectOmniTrades(payload, slot);
    const agg = omniTradeVolume(trades, effectiveWin.start, effectiveWin.end);
    return {
      ok: true,
      source: src,
      period: per,
      slotId: slot,
      legs,
      volume: agg.volume,
      count: agg.count,
      window: effectiveWin,
      unit: 'trades',
    };
  }

  const accounts = payload?.accounts ? normalizeAccounts(payload.accounts) : null;
  const allWallets = mergeWalletsList(accounts, payload?.wallets || []);
  const legs = listHlVolumeWallets(payload);
  const slot = pickVolumeSlot(legs, slotId);
  if (!allWallets.length) {
    return {
      ok: true,
      source: src,
      period: per,
      slotId: slot,
      legs,
      volume: 0,
      count: 0,
      window: win,
      hintKey: 'volHintAddWallet',
    };
  }

  const wallets =
    slot && slot !== 'all'
      ? allWallets.filter((w) => w.toLowerCase() === String(slot).toLowerCase())
      : allWallets.slice(0, MAX_LEGS);

  const fetchStart = Math.max(win.start || HL_FILLS_FLOOR, HL_FILLS_FLOOR);
  let volume = 0;
  let count = 0;
  let incomplete = false;
  for (const w of wallets) {
    try {
      const allCached = await getCachedFills(w, fetchStart, null);
      const xyzCached = await getCachedFills(w, fetchStart, 'xyz');
      if (allCached.incomplete || xyzCached.incomplete) incomplete = true;
      const merged = [];
      const seen = new Set();
      for (const f of [ ...(allCached.fills || []), ...(xyzCached.fills || []) ]) {
        const key = fillIdentity(f);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(f);
      }
      const fills = merged.filter((f) => src === 'xyz' ? isXyzFill(f) : !isXyzFill(f));
      const agg = sumFillsVolume(fills, win.start, win.end, {
        excludeUnit: src === 'hl',
      });
      volume += agg.volume;
      count += agg.count;
    } catch (_) {
      incomplete = true;
    }
  }

  return {
    ok: true,
    source: src,
    period: per,
    slotId: slot,
    legs,
    volume,
    count,
    window: win,
    unit: 'fills',
    incomplete,
  };
}

function omniLegsFromSync(payload) {
  const legs = [];
  const accounts = payload?.accounts ? normalizeAccounts(payload.accounts) : null;
  if (accounts?.slots) {
    const ids = omniSlotIds(accounts);
    ids.forEach((id, index) => {
      const slot = accounts.slots[id];
      const trades = slot?.csv?.trades;
      if (!trades?.length) return;
      const rebuilt = rebuildOpenFromTrades(slot.csv);
      for (const p of rebuilt) {
        legs.push({
          ...p,
          accountId: id,
          accountLabel: omniSlotLabel(slot, id, index),
          hlWallet: isHlWallet(slot.hlWallet) ? slot.hlWallet : '',
        });
      }
    });
  } else if (payload?.legacyCsv?.trades?.length) {
    const wallet = Array.isArray(payload.wallets) && isHlWallet(payload.wallets[0])
      ? payload.wallets[0]
      : '';
    for (const p of rebuildOpenFromTrades(payload.legacyCsv)) {
      legs.push({
        ...p,
        accountId: 'a',
        accountLabel: '',
        hlWallet: wallet,
      });
    }
  }
  return legs;
}

function pairOverrideKey(accountId, market) {
  return String(accountId || 'a') + '::' + normalizeMarket(market);
}

function hedgePosKey(h) {
  if (!h) return '';
  return [
    String(h.wallet || '').toLowerCase(),
    String(h.dex || 'HL').toUpperCase(),
    normalizeMarket(h.market || h.coin),
  ].join('|');
}

function parseHedgeOverride(ovr) {
  if (ovr == null || ovr === 'auto') return { mode: 'auto' };
  if (ovr === '__none__' || ovr === '') return { mode: 'none' };
  const s = String(ovr);
  if (s.indexOf('|') >= 0) {
    const parts = s.split('|');
    return {
      mode: 'key',
      wallet: String(parts[0] || '').toLowerCase(),
      dex: String(parts[1] || 'HL').toUpperCase(),
      market: normalizeMarket(parts[2] || ''),
      raw: s,
    };
  }
  return { mode: 'market', market: normalizeMarket(s), raw: s };
}

function marketAliases(tick) {
  const t = normalizeMarket(tick);
  const aliases = [t];
  if (t === 'XAU') aliases.push('GOLD');
  if (t === 'GOLD') aliases.push('XAU');
  if (t === 'XAG') aliases.push('SILVER');
  if (t === 'SILVER') aliases.push('XAG');
  return aliases;
}

function hedgeMarketMatch(h, aliases) {
  const m = normalizeMarket(h.market || h.coin);
  const short = String(h.coin || '').replace(/^xyz:/i, '').toUpperCase();
  return aliases.includes(m) || aliases.includes(short);
}

function oppositeHedgeSide(omniSide, hlSide) {
  return (
    (omniSide === 'long' && hlSide === 'short') ||
    (omniSide === 'short' && hlSide === 'long')
  );
}

function scoreHedgeCandidate(omni, h, preferWallet) {
  let score = 0;
  const opp = oppositeHedgeSide(omni.side, h.side);
  if (opp) score += 20000;
  else score -= 40000;

  const oN = Number(omni.notional) || 0;
  const hN = Number(h.notionalUsd) || 0;
  if (oN > 0 && hN > 0) {
    const gap = Math.abs(hN - oN) / Math.max(oN, hN);
    score -= gap * 8000;
    // Prefer hedges that can cover at least ~50% of Omni size
    if (hN < oN * 0.45) score -= 3000;
  }

  if (String(h.dex || '').toUpperCase() === 'XYZ') score += 800;
  const pref = preferWallet ? String(preferWallet).toLowerCase() : '';
  if (pref && String(h.wallet || '').toLowerCase() === pref) score += 2500;

  return score;
}

/**
 * Pick a HL/XYZ hedge for one Omni leg.
 * - Exclusive: skips keys already in `claimed`
 * - Override key: wallet|DEX|MARKET
 * - Override legacy: market ticker only
 * - Auto: opposite side + size + prefer slot wallet + prefer XYZ
 */
function pickHedgeForOmni(omni, hlPositions, claimed, override, preferWallet) {
  const parsed = parseHedgeOverride(override);
  if (parsed.mode === 'none') return null;

  const claimedSet = claimed instanceof Set ? claimed : new Set();
  const aliases = marketAliases(omni.market);

  if (parsed.mode === 'key') {
    // Manual key wins over auto claim (uPnL still de-duped in buildSnapshot)
    return (
      (hlPositions || []).find((h) => {
        return (
          String(h.wallet || '').toLowerCase() === parsed.wallet &&
          String(h.dex || 'HL').toUpperCase() === parsed.dex &&
          normalizeMarket(h.market || h.coin) === parsed.market
        );
      }) || null
    );
  }

  let candidates = (hlPositions || []).filter((h) => {
    const key = hedgePosKey(h);
    if (claimedSet.has(key)) return false;
    return hedgeMarketMatch(h, aliases);
  });

  if (parsed.mode === 'market') {
    candidates = candidates.filter((h) => {
      const m = normalizeMarket(h.market || h.coin);
      return m === parsed.market || marketAliases(parsed.market).includes(m);
    });
  }

  if (!candidates.length) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const h of candidates) {
    const s = scoreHedgeCandidate(omni, h, preferWallet);
    // Auto: require opposite side. Manual market override: still prefer opposite but allow fallback.
    if (parsed.mode === 'auto' && !oppositeHedgeSide(omni.side, h.side)) continue;
    if (s > bestScore) {
      bestScore = s;
      best = h;
    }
  }

  // Legacy/manual market override: if nothing opposite, take best same-ticker anyway
  if (!best && parsed.mode === 'market') {
    for (const h of candidates) {
      const s = scoreHedgeCandidate(omni, h, preferWallet) + 50000; // neutralize side penalty for display
      if (s > bestScore) {
        bestScore = s;
        best = h;
      }
    }
  }

  return best;
}

/** @deprecated — use pickHedgeForOmni */
function findHlForMarket(hlPositions, market, wallet, overrideMarket) {
  return pickHedgeForOmni(
    { market, side: 'long', notional: 0 },
    hlPositions,
    new Set(),
    overrideMarket == null ? 'auto' : overrideMarket,
    wallet
  );
}

function buildSnapshot(omniLegs, hlPositions, marks, hlAccounts, pairOverrides) {
  const pairs = [];
  let netUpnl = 0;
  let netDeltaUsd = 0;
  const omniByAccount = {};
  const overrides = pairOverrides && typeof pairOverrides === 'object' ? pairOverrides : {};
  const claimed = new Set();
  const hlUpnlClaimed = new Set(); // avoid double-counting hedge uPnL in net

  // Largest Omni notionals claim hedges first
  const ordered = (omniLegs || []).slice().sort((a, b) => {
    const na = Math.abs((a.qty || 0) * (a.entry || 0));
    const nb = Math.abs((b.qty || 0) * (b.entry || 0));
    return nb - na;
  });

  for (const o of ordered) {
    const mark = marks[o.market] || o.entry || 0;
    const notional = o.qty * (mark || o.entry || 0);
    let omniUpnl = null;
    if (o.entry > 0 && mark > 0 && o.qty > 0) {
      omniUpnl = (o.side === 'short' ? -1 : 1) * (mark - o.entry) * o.qty;
    }
    const oKey = pairOverrideKey(o.accountId, o.market);
    const hasOvr = Object.prototype.hasOwnProperty.call(overrides, oKey);
    const ovr = hasOvr ? overrides[oKey] : undefined;
    const hl = pickHedgeForOmni(
      { market: o.market, side: o.side, notional, qty: o.qty },
      hlPositions,
      claimed,
      hasOvr ? ovr : 'auto',
      o.hlWallet || ''
    );
    const hlKey = hl ? hedgePosKey(hl) : '';
    if (hlKey) claimed.add(hlKey);

    let hlUpnl = hl?.upnl ?? null;
    let hlUpnlInNet = 0;
    if (hlKey && hlUpnl != null && isFinite(hlUpnl) && !hlUpnlClaimed.has(hlKey)) {
      hlUpnlClaimed.add(hlKey);
      hlUpnlInNet = Number(hlUpnl) || 0;
    }

    let deltaUsd = 0;
    if (hl) {
      const hlNotional = hl.notionalUsd || 0;
      const signedOmni = o.side === 'short' ? -notional : notional;
      const signedHl = hl.side === 'short' ? -hlNotional : hlNotional;
      deltaUsd = signedOmni + signedHl;
    } else {
      deltaUsd = o.side === 'short' ? -notional : notional;
    }
    const pairUpnl = (Number(omniUpnl) || 0) + hlUpnlInNet;
    netUpnl += pairUpnl;
    netDeltaUsd += deltaUsd;
    pairs.push({
      accountId: o.accountId,
      accountLabel: o.accountLabel,
      hlWallet: hl?.wallet || o.hlWallet || '',
      market: o.market,
      omniSide: o.side,
      omniQty: o.qty,
      omniEntry: o.entry,
      omniOpenedAt: o.openedAt || null,
      omniNotional: notional,
      omniUpnl,
      hlSide: hl?.side || null,
      hlDex: hl?.dex || null,
      hlMarket: hl?.market || null,
      hlKey: hlKey || null,
      hlQty: hl?.qty || null,
      hlNotional: hl?.notionalUsd || null,
      hlUpnl,
      hlLeverage: hl?.leverage || null,
      hlOpposite: hl ? oppositeHedgeSide(o.side, hl.side) : false,
      mark,
      deltaUsd,
      deltaNotional: hl
        ? (o.side === 'short' ? -notional : notional) +
          (hl.side === 'short' ? -(hl.notionalUsd || 0) : (hl.notionalUsd || 0))
        : (o.side === 'short' ? -notional : notional),
      paired: !!hl,
      pairOverride: hasOvr ? ovr : null,
      pairAuto: !hasOvr,
      hlConflict: false,
    });

    const aid = o.accountId || 'a';
    if (!omniByAccount[aid]) {
      omniByAccount[aid] = {
        accountId: aid,
        label: o.accountLabel || '',
        open: 0,
        notional: 0,
        upnl: 0,
        legs: [],
      };
    }
    omniByAccount[aid].open += 1;
    omniByAccount[aid].notional += notional || 0;
    omniByAccount[aid].upnl += Number(omniUpnl) || 0;
    omniByAccount[aid].legs.push({
      market: o.market,
      side: o.side,
      qty: o.qty,
      notional,
      upnl: omniUpnl,
      mark,
    });
  }

  // Flag duplicate hedge claims (manual override can steal from auto)
  {
    const keyCounts = {};
    for (const p of pairs) {
      if (!p.hlKey) continue;
      keyCounts[p.hlKey] = (keyCounts[p.hlKey] || 0) + 1;
    }
    for (const p of pairs) {
      if (p.hlKey && keyCounts[p.hlKey] > 1) p.hlConflict = true;
    }
  }

  pairs.sort((a, b) => Math.abs(b.omniNotional || 0) - Math.abs(a.omniNotional || 0));

  const omniAccounts = Object.values(omniByAccount);
  const omniUpnlTotal = omniAccounts.reduce((s, a) => s + (a.upnl || 0), 0);
  const omniNotionalTotal = omniAccounts.reduce((s, a) => s + (a.notional || 0), 0);
  const hlAccs = Array.isArray(hlAccounts) ? hlAccounts : [];
  const hlEquity = hlAccs.reduce((s, a) => s + (a.equity || 0), 0);
  const hlUpnlTotal = hlAccs.reduce((s, a) => s + (a.upnl || 0), 0);

  const hlByWallet = {};
  const hlOpen = [];
  const unpairedHl = [];
  for (const h of hlPositions || []) {
    const w = String(h.wallet || '').toLowerCase();
    if (!hlByWallet[w]) hlByWallet[w] = [];
    const key = hedgePosKey(h);
    const row = {
      market: h.market,
      side: h.side,
      dex: h.dex,
      upnl: h.upnl,
      notionalUsd: h.notionalUsd,
      qty: h.qty,
      leverage: h.leverage,
      entry: h.entry,
      mark: h.mark,
      wallet: h.wallet,
      coin: h.coin,
      key,
    };
    hlByWallet[w].push(row);
    const paired = claimed.has(key);
    const openRow = Object.assign({}, row, { paired });
    hlOpen.push(openRow);
    if (!paired) unpairedHl.push(openRow);
  }

  // XYZ first, then HL · largest notional
  hlOpen.sort((a, b) => {
    const da = String(a.dex || '').toUpperCase() === 'XYZ' ? 0 : 1;
    const db = String(b.dex || '').toUpperCase() === 'XYZ' ? 0 : 1;
    if (da !== db) return da - db;
    return Math.abs(b.notionalUsd || 0) - Math.abs(a.notionalUsd || 0);
  });
  unpairedHl.sort((a, b) => Math.abs(b.notionalUsd || 0) - Math.abs(a.notionalUsd || 0));

  return {
    ok: true,
    cguCompliant: true,
    pairs,
    netUpnl,
    netDeltaUsd,
    omniCount: (omniLegs || []).length,
    hlCount: (hlPositions || []).length,
    hlByWallet,
    hlOpen,
    unpairedHl,
    portfolio: {
      hlEquity,
      hlUpnl: hlUpnlTotal,
      omniNotional: omniNotionalTotal,
      omniUpnl: omniUpnlTotal,
      omniAccounts,
      hlAccounts: hlAccs,
    },
    updatedAt: Date.now(),
  };
}

function normalizePnlAlert(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let threshold = Number(src.threshold);
  if (!Number.isFinite(threshold) || threshold < 0) threshold = 100;
  const positions = {};
  if (src.positions && typeof src.positions === 'object') {
    for (const id of Object.keys(src.positions)) {
      const rule = src.positions[id] && typeof src.positions[id] === 'object' ? src.positions[id] : {};
      let posThreshold = Number(rule.threshold);
      if (!Number.isFinite(posThreshold) || posThreshold < 0) posThreshold = 100;
      positions[id] = {
        enabled: !!rule.enabled,
        direction: rule.direction === 'below' ? 'below' : 'above',
        threshold: Math.round(posThreshold * 100) / 100,
      };
    }
  }
  const reminders = Array.isArray(src.reminders) ? src.reminders.map((item, index) => ({
    id: item && item.id ? String(item.id) : 'r' + index,
    enabled: !(item && item.enabled === false),
    time: item && /^\d{2}:\d{2}$/.test(String(item.time || '')) ? String(item.time) : '09:00',
    title: item && item.title ? String(item.title).slice(0, 48) : '',
    sound: item && (item.sound === 'none' || item.sound === 'double' || item.sound === 'ping') ? item.sound : 'beep',
    positionId: item && item.positionId ? String(item.positionId) : '',
  })) : [];
  let redundancyHours = Number(src.redundancy && src.redundancy.everyHours);
  if (!Number.isFinite(redundancyHours) || redundancyHours < 1) redundancyHours = 1;
  if (redundancyHours > 24) redundancyHours = 24;
  return {
    enabled: !!src.enabled,
    scope: src.scope === 'position' ? 'position' : 'total',
    direction: src.direction === 'below' ? 'below' : 'above',
    threshold: Math.round(threshold * 100) / 100,
    sound: src.sound === 'none' || src.sound === 'double' || src.sound === 'ping' ? src.sound : 'beep',
    hlMissing: !!src.hlMissing,
    positions,
    reminders,
    redundancy: {
      enabled: !!(src.redundancy && src.redundancy.enabled),
      everyHours: Math.round(redundancyHours),
      title: src.redundancy && src.redundancy.title ? String(src.redundancy.title).slice(0, 48) : '',
    },
  };
}

function pairNetUpnl(pair) {
  return (Number(pair && pair.omniUpnl) || 0) + (Number(pair && pair.hlUpnl) || 0);
}

function alertCandidateFromSnapshot(snap, alertCfg) {
  if (!snap || !snap.ok) return null;
  const direction = alertCfg.direction === 'below' ? 'below' : 'above';
  const threshold = Number(alertCfg.threshold) || 0;
  const cfgKey = [alertCfg.scope, direction, Math.round(threshold * 100)].join(':');
  if (alertCfg.scope === 'position') {
    const pairs = Array.isArray(snap.pairs) ? snap.pairs : [];
    if (!pairs.length) return null;
    let best = null;
    for (const pair of pairs) {
      const value = pairNetUpnl(pair);
      if (!best || (direction === 'above' ? value > best.value : value < best.value)) {
        best = { pair, value };
      }
    }
    if (!best) return null;
    const pair = best.pair || {};
    return {
      key: cfgKey + ':position:' + String(pair.accountId || '') + ':' + String(pair.market || ''),
      label: [pair.accountLabel || pair.accountId || 'Position', pair.market || ''].filter(Boolean).join(' · '),
      value: best.value,
      conditionMet: direction === 'above' ? best.value >= threshold : best.value <= -threshold,
    };
  }
  const total = Number(snap.netUpnl) || 0;
  return {
    key: cfgKey + ':total',
    label: 'Total PnL',
    value: total,
    conditionMet: direction === 'above' ? total >= threshold : total <= -threshold,
  };
}

function positionAlertEntries(snap, alertCfg) {
  const pairs = Array.isArray(snap && snap.pairs) ? snap.pairs : [];
  const byId = {};
  for (const pair of pairs) {
    const id = String(pair.accountId || 'a');
    if (!byId[id]) {
      byId[id] = {
        id,
        label: pair.accountLabel || id.toUpperCase(),
        value: 0,
      };
    }
    byId[id].value += pairNetUpnl(pair);
  }
  return Object.keys(alertCfg.positions || {}).map((id) => {
    const rule = alertCfg.positions[id] || {};
    const item = byId[id] || { id, label: id.toUpperCase(), value: 0 };
    const threshold = Number(rule.threshold) || 0;
    return {
      id,
      label: item.label,
      value: item.value,
      enabled: !!rule.enabled,
      key: ['slot', id, rule.direction || 'above', Math.round(threshold * 100)].join(':'),
      conditionMet: (rule.direction === 'below')
        ? item.value <= -threshold
        : item.value >= threshold,
    };
  });
}

async function ensureAlertOffscreen() {
  if (!chrome.offscreen || !chrome.runtime.getContexts) return false;
  const url = chrome.runtime.getURL(ALERT_OFFSCREEN_PATH);
  try {
    const ctx = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [url],
    });
    if (ctx && ctx.length) return true;
  } catch (_) {}
  try {
    await chrome.offscreen.createDocument({
      url: ALERT_OFFSCREEN_PATH,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play configurable extension alert sounds',
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function playAlertSound(sound) {
  if (!sound || sound === 'none') return;
  const ok = await ensureAlertOffscreen();
  if (!ok) return;
  try {
    chrome.runtime.sendMessage({ type: 'HS_WIDGET_PLAY_SOUND', sound }, () => {
      void chrome.runtime.lastError;
    });
  } catch (_) {}
}

async function notifyAlert(title, message, sound) {
  try {
    chrome.notifications.create('hs-alert-' + Date.now(), {
      type: 'basic',
      iconUrl: 'icons/128.png',
      title,
      message,
      priority: 2,
    });
  } catch (_) {}
  await playAlertSound(sound);
}

function localDateKey(now) {
  const d = now instanceof Date ? now : new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function localTimeKey(now) {
  const d = now instanceof Date ? now : new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function reminderPositionLabel(syncState, positionId) {
  if (!positionId) return '';
  const acc = syncState && syncState.accounts ? normalizeAccounts(syncState.accounts) : null;
  const slot = acc && acc.slots && acc.slots[positionId] ? acc.slots[positionId] : null;
  return slot && slot.label ? slot.label : String(positionId).toUpperCase();
}

async function evaluateDailyReminders(now) {
  let stored;
  try {
    stored = await chrome.storage.local.get([PNL_ALERT_KEY, REMINDER_STATE_KEY, 'hsWidgetSync']);
  } catch (_) {
    return;
  }
  const alertCfg = normalizePnlAlert(stored[PNL_ALERT_KEY]);
  const reminders = Array.isArray(alertCfg.reminders) ? alertCfg.reminders : [];
  const state = stored[REMINDER_STATE_KEY] && typeof stored[REMINDER_STATE_KEY] === 'object'
    ? stored[REMINDER_STATE_KEY]
    : {};
  const today = localDateKey(now);
  const hhmm = localTimeKey(now);
  const nextState = {};
  for (const reminder of reminders) {
    if (!reminder || !reminder.enabled || reminder.time !== hhmm) continue;
    const stateKey = [reminder.time, reminder.title, reminder.positionId || '', reminder.sound].join('|');
    const stamp = today + '|' + stateKey;
    if (state[reminder.id] === stamp) {
      nextState[reminder.id] = stamp;
      continue;
    }
    const posLabel = reminderPositionLabel(stored.hsWidgetSync, reminder.positionId);
    const title = reminder.title || (posLabel ? 'Reminder · ' + posLabel : 'Trading reminder');
    const message = posLabel ? posLabel + ' · ' + hhmm : hhmm;
    await notifyAlert(title, message, reminder.sound);
    nextState[reminder.id] = stamp;
  }
  try {
    await chrome.storage.local.set({ [REMINDER_STATE_KEY]: nextState });
  } catch (_) {}
}

async function evaluateRedundancyReminder(now) {
  let stored;
  try {
    stored = await chrome.storage.local.get([PNL_ALERT_KEY, REDUNDANCY_STATE_KEY]);
  } catch (_) {
    return;
  }
  const alertCfg = normalizePnlAlert(stored[PNL_ALERT_KEY]);
  const redundancy = alertCfg.redundancy || {};
  if (!redundancy.enabled) return;
  const d = now instanceof Date ? now : new Date();
  const every = Math.max(1, Math.min(24, Number(redundancy.everyHours) || 1));
  if (d.getMinutes() !== 0) return;
  if (d.getHours() % every !== 0) return;
  const bucket = localDateKey(d) + '|' + String(d.getHours()).padStart(2, '0');
  if (stored[REDUNDANCY_STATE_KEY] === bucket) return;
  const title = redundancy.title || ('Reminder every ' + every + 'h');
  await notifyAlert(title, 'Every ' + every + 'h', alertCfg.sound);
  try {
    await chrome.storage.local.set({ [REDUNDANCY_STATE_KEY]: bucket });
  } catch (_) {}
}

async function evaluatePnlAlert(snap) {
  let stored;
  try {
    stored = await chrome.storage.local.get([PNL_ALERT_KEY, PNL_ALERT_STATE_KEY]);
  } catch (_) {
    return;
  }
  const alertCfg = normalizePnlAlert(stored[PNL_ALERT_KEY]);
  const prevState = stored[PNL_ALERT_STATE_KEY] && typeof stored[PNL_ALERT_STATE_KEY] === 'object'
    ? stored[PNL_ALERT_STATE_KEY]
    : {};
  const nextState = {
    triggeredKey: '',
    triggeredAt: 0,
    value: 0,
    positions: prevState.positions && typeof prevState.positions === 'object' ? prevState.positions : {},
  };
  if (alertCfg.enabled) {
    const candidate = alertCandidateFromSnapshot(snap, alertCfg);
    if (candidate && candidate.conditionMet) {
      nextState.triggeredKey = candidate.key;
      nextState.triggeredAt = prevState.triggeredKey === candidate.key ? (prevState.triggeredAt || Date.now()) : Date.now();
      nextState.value = candidate.value;
      if (prevState.triggeredKey !== candidate.key) {
        const usd = Math.abs(Number(candidate.value) || 0).toFixed(2);
        const isGain = Number(candidate.value) >= 0;
        await notifyAlert(
          isGain ? 'PnL alert hit' : 'PnL drawdown hit',
          candidate.label + ' · ' + (isGain ? '+' : '-') + '$' + usd,
          alertCfg.sound
        );
      }
    }
  }
  const prevPositions = nextState.positions && typeof nextState.positions === 'object' ? nextState.positions : {};
  const posState = {};
  for (const entry of positionAlertEntries(snap, alertCfg)) {
    if (!entry.enabled) continue;
    if (entry.conditionMet) {
      posState[entry.id] = entry.key;
      if (prevPositions[entry.id] !== entry.key) {
        const usd = Math.abs(Number(entry.value) || 0).toFixed(2);
        const isGain = Number(entry.value) >= 0;
        await notifyAlert(
          isGain ? 'Position alert hit' : 'Position drawdown hit',
          entry.label + ' · ' + (isGain ? '+' : '-') + '$' + usd,
          alertCfg.sound
        );
      }
    }
  }
  nextState.positions = posState;
  if (!nextState.triggeredKey && !Object.keys(nextState.positions).length) {
    try { await chrome.storage.local.remove([PNL_ALERT_STATE_KEY]); } catch (_) {}
    return;
  }
  try {
    await chrome.storage.local.set({ [PNL_ALERT_STATE_KEY]: nextState });
  } catch (_) {}
}

function linkedHlPairKey(pair) {
  return [
    String(pair && pair.accountId || ''),
    normalizeMarket(pair && pair.market || ''),
    String(pair && pair.hlWallet || '').toLowerCase(),
  ].join('::');
}

function linkedHlPairSignature(pair) {
  if (!pair || !pair.paired || !pair.hlMarket) return '';
  return [
    String(pair.hlWallet || '').toLowerCase(),
    String(pair.hlDex || 'HL').toUpperCase(),
    normalizeMarket(pair.hlMarket || ''),
  ].join('::');
}

async function evaluateHlMissingAlert(snap, reliable, alertCfg) {
  const currentMap = {};
  const pairs = Array.isArray(snap && snap.pairs) ? snap.pairs : [];
  for (const pair of pairs) {
    const key = linkedHlPairKey(pair);
    if (!key) continue;
    currentMap[key] = {
      label: [pair.accountLabel || pair.accountId || 'Position', pair.market || ''].filter(Boolean).join(' · '),
      linkedSig: linkedHlPairSignature(pair),
    };
  }
  let prev = {};
  try {
    const stored = await chrome.storage.local.get([HL_MISSING_ALERT_STATE_KEY]);
    prev = stored[HL_MISSING_ALERT_STATE_KEY] && typeof stored[HL_MISSING_ALERT_STATE_KEY] === 'object'
      ? stored[HL_MISSING_ALERT_STATE_KEY]
      : {};
  } catch (_) {}
  const prevSeen = prev.seen && typeof prev.seen === 'object' ? prev.seen : {};
  if (alertCfg.hlMissing && reliable && Object.keys(prevSeen).length) {
    const disappeared = Object.keys(currentMap).filter((key) => {
      const wasLinked = prevSeen[key] && prevSeen[key].linkedSig;
      const isLinked = currentMap[key] && currentMap[key].linkedSig;
      return !!wasLinked && !isLinked;
    });
    if (disappeared.length) {
      const first = currentMap[disappeared[0]];
      const label = first && first.label ? first.label : 'Linked HL position';
      try {
        await notifyAlert(
          'Linked HL hedge disappeared',
          disappeared.length > 1 ? label + ' +' + (disappeared.length - 1) + ' more' : label,
          alertCfg.sound
        );
      } catch (_) {}
    }
  }
  try {
    await chrome.storage.local.set({
      [HL_MISSING_ALERT_STATE_KEY]: {
        seen: currentMap,
        updatedAt: Date.now(),
      },
    });
  } catch (_) {}
}

async function refreshWidgetSnapshot(opts) {
  const marksOnly = !!(opts && opts.marksOnly);
  const now = Date.now();
  if (marksOnly && now - lastMarksRefreshAt < MARKS_REFRESH_MIN_MS) return;
  if (refreshBusy) return;
  refreshBusy = true;
  try {
    const stored = await chrome.storage.local.get(['hsWidgetSync']);
    const payload = synced || stored.hsWidgetSync || null;
    if (!payload) {
      await chrome.storage.local.set({
        hsWidgetSnapshot: { ok: false, reason: 'no-sync', updatedAt: Date.now() },
      });
      return;
    }
    const omniLegs = omniLegsFromSync(payload);
    const accounts = payload.accounts ? normalizeAccounts(payload.accounts) : null;
    const wallets = mergeWalletsList(accounts, payload.wallets || []);
    const folioFresh =
      lastFolioCache.data && now - lastFolioCache.at < HL_FOLIO_CACHE_MS
        ? lastFolioCache.data
        : null;
    const needHl = wallets.length > 0 && (!marksOnly || !folioFresh);
    const [marks, folio] = await Promise.all([
      fetchMarksMap().catch(() => ({})),
      needHl
        ? fetchHlPortfolio(wallets)
            .then((f) => {
              lastFolioCache = { at: Date.now(), data: f };
              return f;
            })
            .catch(() => folioFresh || { positions: [], accounts: [] })
        : Promise.resolve(folioFresh || { positions: [], accounts: [] }),
    ]);
    lastMarksRefreshAt = Date.now();
    const alertStore = await chrome.storage.local.get([PNL_ALERT_KEY]);
    const alertCfg = normalizePnlAlert(alertStore[PNL_ALERT_KEY]);
    const snap = buildSnapshot(
      omniLegs,
      folio.positions || [],
      marks,
      folio.accounts || [],
      payload.pairOverrides || {}
    );
    // Still show UI scaffolding when only wallets/legs exist (no Omni trades yet)
    if (!omniLegs.length && (wallets.length || (accounts && omniSlotIds(accounts).length))) {
      snap.ok = true;
      snap.pairs = snap.pairs || [];
      snap.reason = omniLegs.length ? undefined : 'no-omni-trades';
    }
    await evaluatePnlAlert(snap);
    await evaluateHlMissingAlert(
      snap,
      wallets.length === 0 || !!((folio.accounts || []).length),
      alertCfg
    );
    await chrome.storage.local.set({ hsWidgetSnapshot: snap });
  } catch (e) {
    await chrome.storage.local.set({
      hsWidgetSnapshot: {
        ok: false,
        reason: String(e && e.message || e),
        updatedAt: Date.now(),
      },
    });
  } finally {
    refreshBusy = false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('hs-widget-refresh', { periodInMinutes: 1 });
  refreshWidgetSnapshot();
  ensureAlertOffscreen();
  wireActionClick();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlertOffscreen();
  wireActionClick();
});

// Ensure behavior after SW wake
wireActionClick();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'hs-widget-refresh') {
    refreshWidgetSnapshot();
    evaluateDailyReminders();
    evaluateRedundancyReminder();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return undefined;

  if (msg.type === 'HS_OMNI_EXT_PING') {
    sendResponse({
      ok: true,
      installed: true,
      version: VERSION,
      name: NAME,
      cguCompliant: true,
      widget: true,
    });
    return false;
  }

  if (msg.type === 'HS_WIDGET_PREVIEW_SOUND') {
    playAlertSound(msg.sound || 'beep')
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === 'HS_OMNI_EXT_SYNC' || msg.type === 'HS_OMNI_EXT_SYNC_POSITIONS') {
    sendResponse({ ok: false, cguBlocked: true, error: CGU_MSG });
    return false;
  }

  if (msg.type === 'HS_OMNI_COLLECT_RUN') {
    runOmniCollect(msg.label || '', msg.fileName || '')
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_IMPORT_LOCAL') {
    (async () => {
      const omniAddress = msg.payload ? extractOmniAddress(msg.payload) : '';
      const target = await ensureTargetImportSlot({
        slotId: msg.slotId ? String(msg.slotId) : '',
        newLeg: !!msg.newLeg,
        autoNewLeg: msg.autoNewLeg === true,
        label: msg.label || '',
        omniAddress,
        protectFilled: msg.slotId ? false : true,
      });
      const targetSlotId = target.slotId;
      const applyOpts = {
        replace: msg.replace === true,
        forceNew: msg.forceNew !== false,
        fileName: msg.fileName ? String(msg.fileName).slice(0, 48) : '',
      };

      const apply = msg.payload
        ? applyLocalOmniPayload(msg.payload, msg.origin || 'extension-drop', targetSlotId, msg.label || '', applyOpts)
        : applyLocalOmniBundle(
            msg.legacyCsv || null,
            msg.origin || 'extension-drop',
            null,
            targetSlotId,
            msg.label || '',
            { omniAddress },
            applyOpts
          );
      let res = await apply;
      if (msg.payload && msg.broadcast) {
        try {
          void broadcastExportToHypersheets(slimPayloadForStorage(msg.payload));
        } catch (_) {}
      }
      if (target.newLeg) res = Object.assign({}, res, { newLeg: true });
      if (target.matchedBy) res = Object.assign({}, res, { matchedBy: target.matchedBy });
      return res;
    })()
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_GET_STATE') {
    getWidgetState()
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_SET_WALLETS') {
    const list = (Array.isArray(msg.wallets) ? msg.wallets : [])
      .map((w) => (typeof w === 'string' ? w.trim() : ''))
      .filter(isHlWallet)
      .slice(0, MAX_LEGS);
    mutateAccounts((accounts, state) => {
      state.wallets = list.slice();
      // Keep slot links if still in list; clear orphaned
      const set = new Set(list.map((w) => w.toLowerCase()));
      omniSlotIds(accounts).forEach((id) => {
        const cur = accounts.slots[id].hlWallet;
        if (cur && !set.has(String(cur).toLowerCase())) {
          accounts.slots[id].hlWallet = '';
        }
      });
    })
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_ADD_WALLET') {
    const wallet = typeof msg.wallet === 'string' ? msg.wallet.trim() : '';
    if (!isHlWallet(wallet)) {
      sendResponse({ ok: false, error: 'Adresse EVM invalide (0x + 40 hex)' });
      return false;
    }
    mutateAccounts((accounts, state) => {
      const list = mergeWalletsList(accounts, state.wallets);
      if (list.some((w) => w.toLowerCase() === wallet.toLowerCase())) return;
      if (list.length >= MAX_LEGS) return;
      list.push(wallet);
      state.wallets = list;
      // Auto-link first empty Omni jambe, or create one
      let linked = false;
      omniSlotIds(accounts).forEach((id) => {
        if (linked) return;
        if (!accounts.slots[id].hlWallet) {
          accounts.slots[id].hlWallet = wallet;
          linked = true;
        }
      });
      if (!linked && accounts.slotOrder.length < MAX_LEGS) {
        const id = nextSlotId(accounts.slotOrder);
        if (id) {
          const n = accounts.slotOrder.length + 1;
          accounts.slots[id] = {
            id,
            label: '',
            csv: null,
            points: null,
            hlWallet: wallet,
            importedAt: null,
          };
          accounts.slotOrder.push(id);
        }
      }
    })
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_REMOVE_WALLET') {
    const wallet = typeof msg.wallet === 'string' ? msg.wallet.trim().toLowerCase() : '';
    mutateAccounts((accounts, state) => {
      const list = mergeWalletsList(accounts, state.wallets).filter(
        (w) => w.toLowerCase() !== wallet
      );
      state.wallets = list;
      omniSlotIds(accounts).forEach((id) => {
        if (String(accounts.slots[id].hlWallet || '').toLowerCase() === wallet) {
          accounts.slots[id].hlWallet = '';
        }
      });
    })
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_SET_SLOT_WALLET') {
    const id = String(msg.slotId || '');
    const wallet = typeof msg.wallet === 'string' ? msg.wallet.trim() : '';
    if (wallet && !isHlWallet(wallet)) {
      sendResponse({ ok: false, error: 'Adresse HL invalide (0x…)' });
      return false;
    }
    mutateAccounts((accounts, state) => {
      if (!accounts.slots[id]) return;
      accounts.slots[id].hlWallet = wallet || '';
      if (wallet) {
        const list = mergeWalletsList(accounts, state.wallets);
        if (!list.some((w) => w.toLowerCase() === wallet.toLowerCase()) && list.length < MAX_LEGS) {
          list.push(wallet);
        }
        state.wallets = list;
      }
    })
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_SET_SLOT_CSVS') {
    const id = String(msg.slotId || '');
    const want = Array.isArray(msg.csvIds) ? msg.csvIds.map(String) : [];
    mutateAccounts((accounts, state) => {
      if (!accounts.slots[id]) return;
      const library = normalizeCsvLibrary(state.csvLibrary);
      state.csvLibrary = library;
      const known = new Set(library.map((e) => e.id));
      const csvIds = want.filter((cid) => known.has(cid)).slice(0, MAX_CSV_LIBRARY);
      const rebuilt = rebuildSlotCsvFromIds({ csvIds, csv: null }, library);
      accounts.slots[id].csvIds = rebuilt.csvIds;
      accounts.slots[id].csv = rebuilt.csvIds.length ? rebuilt.csv : null;
      accounts.slots[id].marketsHint = rebuilt.csvIds.length
        ? marketsHintFromCsv(rebuilt.csv)
        : '';
      accounts.slots[id].importedAt = rebuilt.csvIds.length ? Date.now() : null;
      // Address from first selected source that has one
      let addr = accounts.slots[id].omniAddress || '';
      for (const cid of rebuilt.csvIds) {
        const e = library.find((x) => x.id === cid);
        if (e && e.omniAddress) {
          addr = e.omniAddress;
          break;
        }
      }
      if (rebuilt.csvIds.length) accounts.slots[id].omniAddress = addr || '';
      else accounts.slots[id].omniAddress = '';
    })
      .then((res) => {
        refreshWidgetSnapshot().then(() => sendResponse(res)).catch(() => sendResponse(res));
      })
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_REMOVE_CSV') {
    const csvId = String(msg.csvId || '');
    if (!csvId) {
      sendResponse({ ok: false, error: 'CSV id manquant' });
      return false;
    }
    mutateAccounts((accounts, state) => {
      const library = normalizeCsvLibrary(state.csvLibrary).filter((e) => e.id !== csvId);
      state.csvLibrary = library;
      for (const sid of omniSlotIds(accounts)) {
        const slot = accounts.slots[sid];
        if (!slot) continue;
        const ids = (Array.isArray(slot.csvIds) ? slot.csvIds : []).filter((x) => x !== csvId);
        const rebuilt = rebuildSlotCsvFromIds({ csvIds: ids, csv: null }, library);
        slot.csvIds = rebuilt.csvIds;
        slot.csv = rebuilt.csvIds.length ? rebuilt.csv : null;
        slot.marketsHint = rebuilt.csvIds.length ? marketsHintFromCsv(rebuilt.csv) : '';
      }
    })
      .then((res) => {
        refreshWidgetSnapshot().then(() => sendResponse(res)).catch(() => sendResponse(res));
      })
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_ADD_SLOT') {
    mutateAccounts((accounts) => {
      if (accounts.slotOrder.length >= MAX_LEGS) return;
      const id = nextSlotId(accounts.slotOrder);
      if (!id) return;
      const n = accounts.slotOrder.length + 1;
      accounts.slots[id] = {
        id,
        label: '',
        csv: null,
        points: null,
        hlWallet: '',
        importedAt: null,
      };
      accounts.slotOrder.push(id);
      accounts.activeImportSlot = id;
    })
      .then((res) => {
        if (res.accounts && res.accounts.slotOrder.length >= MAX_LEGS && msg.forceCheck) {
          /* no-op */
        }
        sendResponse(res);
      })
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_REMOVE_SLOT') {
    const id = String(msg.slotId || '');
    mutateAccounts((accounts, state) => {
      if (!accounts.slots[id]) return;
      const guard = normalizeAccountsGuard(state.accountsGuard);
      const now = Date.now();
      // Dernière jambe : on vide au lieu de bloquer
      if (accounts.slotOrder.length <= 1) {
        const keep = accounts.slots[id];
        accounts.slots[id] = {
          id,
          label: keep.label || '',
          csv: null,
          points: null,
          hlWallet: keep.hlWallet || '',
          importedAt: null,
        };
        guard.clearedSlots[id] = now;
        state.accountsGuard = guard;
        return;
      }
      delete accounts.slots[id];
      accounts.slotOrder = accounts.slotOrder.filter((x) => x !== id);
      if (accounts.activeImportSlot === id) {
        accounts.activeImportSlot = accounts.slotOrder[0];
      }
      guard.deletedSlots[id] = now;
      if (guard.clearedSlots[id]) delete guard.clearedSlots[id];
      state.accountsGuard = guard;
    })
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_SET_PAIR_OVERRIDE') {
    const accountId = String(msg.accountId || 'a');
    const market = normalizeMarket(msg.market || '');
    let hlMarket = msg.hlMarket;
    // Keep full keys wallet|DEX|MARKET; only normalize bare tickers
    if (hlMarket != null && hlMarket !== '__none__' && hlMarket !== '' && hlMarket !== 'auto') {
      const s = String(hlMarket);
      if (s.indexOf('|') < 0) hlMarket = normalizeMarket(s);
      else hlMarket = s;
    }
    if (!market) {
      sendResponse({ ok: false, error: 'Market manquant' });
      return false;
    }
    const key = pairOverrideKey(accountId, market);
    mutateAccounts((_accounts, state) => {
      const ovr = Object.assign({}, state.pairOverrides || {});
      if (hlMarket == null || hlMarket === 'auto') {
        delete ovr[key];
      } else {
        ovr[key] = hlMarket === '__none__' ? '__none__' : hlMarket;
      }
      state.pairOverrides = ovr;
    })
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_RENAME_SLOT') {
    const id = String(msg.slotId || '');
    const label = String(msg.label || '').trim().slice(0, 32);
    mutateAccounts((accounts) => {
      if (!accounts.slots[id] || !label) return;
      accounts.slots[id].label = label;
    })
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_SET_ACTIVE_SLOT') {
    const id = String(msg.slotId || '');
    mutateAccounts((accounts) => {
      if (!accounts.slots[id]) return;
      accounts.activeImportSlot = id;
    })
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_CLEAR_SLOT') {
    const id = String(msg.slotId || '');
    mutateAccounts((accounts, state) => {
      if (!accounts.slots[id]) return;
      accounts.slots[id].csv = null;
      accounts.slots[id].csvIds = [];
      accounts.slots[id].points = null;
      accounts.slots[id].marketsHint = '';
      accounts.slots[id].omniAddress = '';
      accounts.slots[id].importedAt = null;
      if (accounts.activeImportSlot === id) state.legacyCsv = null;
      const guard = normalizeAccountsGuard(state.accountsGuard);
      guard.clearedSlots[id] = Date.now();
      state.accountsGuard = guard;
    })
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_SYNC_HYPERSHEETS') {
    syncToHypersheets()
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_GET_POINTS') {
    getPointsState()
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_SYNC') {
    const rawWallets = Array.isArray(msg.wallets) ? msg.wallets : [];
    const wallets = rawWallets.map((w) => {
      if (typeof w === 'string') return w;
      if (w && typeof w === 'object') return w.address || w.wallet || w.addr || '';
      return '';
    }).filter(isHlWallet);

    Promise.resolve(loadSyncState()).then((prev) => {
      const prevAcc = prev && prev.accounts ? normalizeAccounts(prev.accounts) : null;
      const prevGuard = prev && prev.accountsGuard
        ? normalizeAccountsGuard(prev.accountsGuard)
        : defaultAccountsGuard();

      // Prefer merge over replace: Hypersheets must not wipe extension Omni legs.
      let accounts;
      let accountsGuard = prevGuard;
      if (msg.accounts && prevAcc) {
        const merged = mergeAccountsFromHypersheets(prevAcc, msg.accounts, prevGuard);
        accounts = merged.accounts;
        accountsGuard = merged.accountsGuard;
      } else if (msg.accounts && !prevAcc) {
        accounts = normalizeAccounts(msg.accounts);
      } else {
        accounts = prevAcc || defaultAccounts();
      }

      // Preserve / map hlWallet + points when page sync has none
      if (prevAcc && accounts.slots) {
        omniSlotIds(accounts).forEach((id) => {
          const p = prevAcc.slots[id];
          if (!p) return;
          if (!accounts.slots[id].hlWallet && p.hlWallet) {
            accounts.slots[id].hlWallet = p.hlWallet;
          }
          if (!accounts.slots[id].points && p.points) {
            accounts.slots[id].points = p.points;
          }
        });
        let wi = 0;
        omniSlotIds(accounts).forEach((id) => {
          if (!accounts.slots[id].hlWallet && wallets[wi]) {
            accounts.slots[id].hlWallet = wallets[wi];
            wi += 1;
          }
        });
      } else if (wallets.length) {
        omniSlotIds(accounts).forEach((id, i) => {
          if (!accounts.slots[id].hlWallet && wallets[i]) {
            accounts.slots[id].hlWallet = wallets[i];
          }
        });
      }
      accounts = normalizeAccounts(accounts);
      const nextWallets = mergeWalletsList(accounts, wallets);
      const nextLegacy = (prev && prev.legacyCsv) || msg.legacyCsv || null;
      const nextPair = (prev && prev.pairOverrides) || {};
      let nextOrigin = msg.origin || (prev && prev.origin) || null;
      let nextSyncedAt = msg.syncedAt || Date.now();

      // Never let a poorer page snapshot clobber a richer local import clock.
      if (prev && prev.syncedAt && prev.origin === 'extension-local') {
        const localScore = omniSlotIds(prevAcc || defaultAccounts()).reduce(
          (s, id) => s + slotImportScore((prevAcc && prevAcc.slots[id]) || null),
          0
        );
        const nextScore = omniSlotIds(accounts).reduce(
          (s, id) => s + slotImportScore(accounts.slots[id]),
          0
        );
        if (localScore > nextScore) {
          accounts = prevAcc;
          accountsGuard = prevGuard;
          nextOrigin = 'extension-local';
          nextSyncedAt = prev.syncedAt;
        }
      }

      const fpOf = (acc, wals, guard) => {
        try {
          const a = normalizeAccounts(acc);
          const g = normalizeAccountsGuard(guard);
          return JSON.stringify({
            order: a.slotOrder,
            active: a.activeImportSlot,
            slots: a.slotOrder.map((id) => {
              const s = a.slots[id] || {};
              return {
                id,
                label: s.label || '',
                hl: s.hlWallet || '',
                at: s.importedAt || null,
                n: (s.csv && s.csv.trades && s.csv.trades.length) || 0,
                pts: !!(s.points && s.points.points_summary),
              };
            }),
            wallets: (wals || []).map((w) => String(w).toLowerCase()),
            del: Object.keys(g.deletedSlots || {}).sort(),
            clr: Object.keys(g.clearedSlots || {}).sort(),
          });
        } catch (_) {
          return String(Date.now());
        }
      };
      const prevFp = prev ? fpOf(prev.accounts, prev.wallets, prev.accountsGuard) : '';
      const nextFp = fpOf(accounts, nextWallets, accountsGuard);
      if (prevFp && prevFp === nextFp) {
        sendResponse({ ok: true, unchanged: true });
        return;
      }

      synced = {
        accounts,
        wallets: nextWallets,
        csvLibrary: normalizeCsvLibrary(prev && prev.csvLibrary),
        legacyCsv: nextLegacy,
        pairOverrides: nextPair,
        accountsGuard,
        syncedAt: nextSyncedAt,
        origin: nextOrigin,
      };
      const toStore = { hsWidgetSync: synced };
      if (msg.origin) toStore.hsHypersheetsOrigin = msg.origin;
      chrome.storage.local.set(toStore, () => {
        refreshWidgetSnapshot().then(() => sendResponse({ ok: true }));
      });
    });
    return true;
  }

  if (msg.type === 'HS_WIDGET_REFRESH') {
    refreshWidgetSnapshot({ marksOnly: !!msg.marksOnly })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_VOLUME') {
    computeVolumeReport(msg.source, msg.period, msg.slotId)
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_SHOW') {
    // Side panel (right of browser) — stays in the Chrome window.
    showWidgetInActiveTab()
      .then((res) => sendResponse(res))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_DETACH') {
    // Free floating OS window — can move to another monitor.
    openOrFocusDetachedWidget()
      .then((res) => sendResponse(res))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_CLOSE_DETACHED') {
    closeAllDetachedWidgets().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'HS_WIDGET_LOCK') {
    const locked = !!msg.locked;
    chrome.storage.local.set({ [LOCK_KEY]: locked }, () => {
      sendResponse({ ok: true, locked });
    });
    return true;
  }

  if (msg.type === 'HS_WIDGET_ENFORCE_POS') {
    // Legacy no-op (lock is handled in-page now).
    sendResponse({ ok: true });
    return false;
  }

  return undefined;
});

// Cold start
chrome.storage.local.get(['hsWidgetSync', DETACHED_KEY], (res) => {
  if (res.hsWidgetSync) synced = res.hsWidgetSync;
  if (res[DETACHED_KEY] != null) detachedWindowId = res[DETACHED_KEY];
  refreshWidgetSnapshot();
  evaluateDailyReminders();
  evaluateRedundancyReminder();
  ensureAlertOffscreen();
});
try {
  chrome.alarms.create('hs-widget-refresh', { periodInMinutes: 1 });
} catch (_) {}
