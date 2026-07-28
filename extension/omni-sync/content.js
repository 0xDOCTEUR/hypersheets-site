/**
 * Hypersheets page bridge — CGU-compliant.
 * Only announces extension presence. Refuses session sync requests.
 * Guards against "Extension context invalidated" after reload.
 */
(function () {
  const SOURCE = 'hs-omni-ext';
  const VERSION = 9;

  function stripInPageFab() {
    try {
      document.getElementById('hs-dn-widget-root')?.remove();
      document.querySelectorAll('[data-hs-widget="1"]').forEach((el) => el.remove());
    } catch (_) {}
  }

  // Strip leftover / race-injected FAB from older builds (side panel is enough here).
  stripInPageFab();
  try {
    const mo = new MutationObserver(() => stripInPageFab());
    const root = document.documentElement || document.body;
    if (root) mo.observe(root, { childList: true, subtree: true });
    [0, 500, 1500, 4000, 10000].forEach((ms) => setTimeout(stripInPageFab, ms));
    setTimeout(() => {
      try { mo.disconnect(); } catch (_) {}
      stripInPageFab();
    }, 20000);
  } catch (_) {}

  function extAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function postToPage(data) {
    try {
      window.postMessage(Object.assign({ source: SOURCE }, data), '*');
    } catch (_) {}
  }

  function safeSend(msg, cb) {
    if (!extAlive()) {
      if (typeof cb === 'function') cb(null, 'Extension context invalidated');
      return;
    }
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        let errMsg = null;
        try {
          const err = chrome.runtime.lastError;
          if (err) errMsg = err.message || 'Extension error';
        } catch (_) {
          errMsg = 'Extension context invalidated';
        }
        if (typeof cb === 'function') cb(res, errMsg);
      });
    } catch (e) {
      if (typeof cb === 'function') cb(null, (e && e.message) || 'Extension context invalidated');
    }
  }

  function announce() {
    if (!extAlive()) return;
    postToPage({
      type: 'HS_OMNI_EXT_PONG',
      version: VERSION,
      installed: true,
      cguCompliant: true,
      name: 'Hypersheets Omni Helper',
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.source === SOURCE) return;

    if (data.type === 'HS_OMNI_EXT_PING') {
      if (!extAlive()) {
        postToPage({ type: 'HS_OMNI_EXT_PONG', installed: false, error: 'Extension context invalidated — reload this page' });
        return;
      }
      announce();
      safeSend({ type: 'HS_OMNI_EXT_PING' }, (res, err) => {
        if (err || !res) {
          postToPage({
            type: 'HS_OMNI_EXT_PONG',
            installed: false,
            error: err || 'Extension unavailable — reload this page',
          });
          return;
        }
        postToPage({
          type: 'HS_OMNI_EXT_PONG',
          installed: true,
          cguCompliant: true,
          version: res.version || VERSION,
          name: res.name || 'Hypersheets Omni Helper',
        });
      });
      return;
    }

    if (data.type === 'HS_OMNI_EXT_SYNC' || data.type === 'HS_OMNI_EXT_SYNC_POSITIONS') {
      // No background round-trip needed — refuse locally (avoids invalidated context errors).
      postToPage({
        type: 'HS_OMNI_EXT_RESULT',
        ok: false,
        cguBlocked: true,
        error:
          'Blocked: Variational ToS — use manual JSON/CSV import on Hypersheets → Variational → Activity.',
      });
    }
  });

  if (extAlive()) {
    announce();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', announce, { once: true });
    } else {
      setTimeout(announce, 0);
    }
  }

  // Apply Omni export collected by the extension (from Omni tab).
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'HS_OMNI_EXPORT_APPLY') return;
      if (!msg.payload) return;
      try {
        window.postMessage(
          {
            source: 'hs-omni-ext',
            type: 'HS_OMNI_PAGE_IMPORT',
            payload: msg.payload,
            fileName: msg.fileName || 'variational-export-ext.json',
          },
          '*'
        );
      } catch (_) {}
    });
  } catch (_) {}
})();
