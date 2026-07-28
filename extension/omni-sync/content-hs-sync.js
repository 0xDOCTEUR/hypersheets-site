/**
 * Hypersheets → extension sync (CGU-safe).
 * Guards against Extension context invalidated after reload.
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
