/**
 * Hypersheets → extension sync (CGU-safe).
 * Guards against Extension context invalidated after reload.
 * Also accepts HS_ACCOUNTS_APPLY so the extension can keep page localStorage
 * aligned after delete/clear (prevents resurrecting removed Omni legs).
 */
(function () {
  function extAlive() {
    try {
      return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  let dead = false;
  let applyQuietUntil = 0;
  const KEYS = ['hs-var-omni-accounts', 'hf-wallets', 'hs-var-csv-bundle'];

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (_) {
      return null;
    }
  }

  function pushSync() {
    if (dead || !extAlive()) {
      dead = true;
      return;
    }
    if (Date.now() < applyQuietUntil) return;
    const accounts = readJson('hs-var-omni-accounts');
    const wallets = readJson('hf-wallets');
    const legacyCsv = readJson('hs-var-csv-bundle');
    try {
      chrome.runtime.sendMessage({
        type: 'HS_WIDGET_SYNC',
        accounts,
        wallets: Array.isArray(wallets) ? wallets : [],
        legacyCsv,
        syncedAt: Date.now(),
        origin: location.origin,
      }, () => {
        try {
          const err = chrome.runtime.lastError;
          if (err && /invalidated|Cannot access/i.test(err.message || '')) dead = true;
        } catch (_) {
          dead = true;
        }
      });
    } catch (e) {
      if (/invalidated|Cannot access/i.test(String(e && e.message || e))) dead = true;
    }
  }

  function applyAccountsFromExtension(msg) {
    try {
      if (!msg || !msg.accounts || typeof msg.accounts !== 'object') {
        return { ok: false, error: 'no accounts' };
      }
      // Brief quiet window so we don't immediately echo a stale read.
      applyQuietUntil = Date.now() + 2500;
      localStorage.setItem('hs-var-omni-accounts', JSON.stringify(msg.accounts));
      const order = Array.isArray(msg.accounts.slotOrder) ? msg.accounts.slotOrder : [];
      const activeId = msg.accounts.activeImportSlot || order[0];
      const active = activeId && msg.accounts.slots ? msg.accounts.slots[activeId] : null;
      try {
        if (active && active.csv) {
          localStorage.setItem('hs-var-csv-bundle', JSON.stringify(active.csv));
        } else {
          localStorage.removeItem('hs-var-csv-bundle');
        }
      } catch (_) {}
      try {
        if (active && active.points) {
          localStorage.setItem('hs-var-points-export', JSON.stringify(active.points));
        }
      } catch (_) {}
      if (Array.isArray(msg.wallets)) {
        try {
          localStorage.setItem('hf-wallets', JSON.stringify(msg.wallets));
        } catch (_) {}
      }
      try {
        window.postMessage(
          {
            source: 'hs-omni-ext',
            type: 'HS_OMNI_ACCOUNTS_APPLIED',
            syncedAt: msg.syncedAt || Date.now(),
            hasPoints: !!(active && active.points && (
              active.points.points_summary
              || (Array.isArray(active.points.points_history) && active.points.points_history.length)
            )),
          },
          '*'
        );
      } catch (_) {}
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== 'HS_ACCOUNTS_APPLY') return;
      const res = applyAccountsFromExtension(msg);
      try {
        sendResponse(res);
      } catch (_) {}
      return true;
    });
  } catch (_) {}

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== 'hs-page') return;
    if (data.type !== 'HS_OMNI_EXT_GET_POINTS') return;
    if (dead || !extAlive()) {
      try {
        window.postMessage({ source: 'hs-omni-ext', type: 'HS_OMNI_POINTS_STATE', ok: false }, '*');
      } catch (_) {}
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: 'HS_WIDGET_GET_POINTS' }, (res) => {
        try {
          const err = chrome.runtime.lastError;
          if (err) {
            window.postMessage({ source: 'hs-omni-ext', type: 'HS_OMNI_POINTS_STATE', ok: false }, '*');
            return;
          }
          window.postMessage({
            source: 'hs-omni-ext',
            type: 'HS_OMNI_POINTS_STATE',
            ok: !!(res && res.ok),
            points: res && res.points ? res.points : null,
            slotId: res && res.slotId,
          }, '*');
        } catch (_) {}
      });
    } catch (_) {
      try {
        window.postMessage({ source: 'hs-omni-ext', type: 'HS_OMNI_POINTS_STATE', ok: false }, '*');
      } catch (__) {}
    }
  });

  pushSync();
  const timer = setInterval(() => {
    if (dead || !extAlive()) {
      dead = true;
      clearInterval(timer);
      return;
    }
    pushSync();
  }, 4000);

  window.addEventListener('storage', (ev) => {
    if (dead) return;
    if (!ev.key || KEYS.includes(ev.key)) pushSync();
  });

  document.addEventListener('visibilitychange', () => {
    if (dead) return;
    if (document.visibilityState === 'visible') pushSync();
  });
})();
