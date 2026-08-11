/**
 * Omni tab collector — runs only on omni.variational.io while the user is logged in.
 * Triggered by the Hypersheets extension panel (1 click).
 * PC file download is handled by the background service worker (chrome.downloads).
 */
(function () {
  const COLLECT_SCRIPT_VERSION = 6;
  // Re-injects bump this so stale listeners from older injects ignore messages.
  window.__hsOmniCollectVersion = COLLECT_SCRIPT_VERSION;
  const VERSION = 3;
  const HOST = 'omni.variational.io';

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function api(path, params) {
    const url = new URL('https://' + HOST + path);
    Object.keys(params || {}).forEach((k) => url.searchParams.append(k, params[k]));
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, { credentials: 'include' });
      } catch (_) {
        if (attempt < 4) {
          await sleep(900 * (attempt + 1));
          continue;
        }
        throw new Error('Network error on ' + path);
      }
      // Omni sometimes flaps with 429 / 5xx on heavy endpoints (transfers).
      if ((res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) && attempt < 5) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error('Not logged in on Omni — sign in, then retry');
      }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' on ' + path);
      return res.json();
    }
  }

  async function softPageAll(path, params, opts) {
    try {
      const rows = await pageAll(path, params, opts);
      return { rows: rows || [], skipped: null };
    } catch (e) {
      const msg = (e && e.message) || String(e);
      return { rows: [], skipped: msg };
    }
  }

  async function pageAll(path, params, opts) {
    const limit = (opts && opts.limit) || 100;
    const cap = (opts && opts.cap) || 40000;
    const key = opts && opts.key;
    const seen = key ? new Set() : null;
    const out = [];
    let offset = 0;
    const onProgress = opts && opts.onProgress;
    while (out.length < cap) {
      const data = await api(path, Object.assign({ limit, offset }, params));
      const rows = Array.isArray(data) ? data : data.result || [];
      let added = 0;
      for (const row of rows) {
        if (seen) {
          const k = key(row);
          if (seen.has(k)) continue;
          seen.add(k);
        }
        out.push(row);
        added++;
      }
      if (typeof onProgress === 'function') onProgress(opts.label || path, out.length);
      if (rows.length < limit) break;
      if (seen && added === 0) break;
      offset += limit;
      await sleep(70);
    }
    return out;
  }

  async function collect(onProgress) {
    const progress = typeof onProgress === 'function' ? onProgress : () => {};
    progress('points', 0);
    const points = await pageAll(
      '/api/points/history',
      {},
      {
        limit: 20,
        cap: 500,
        label: 'points',
        key: (e) =>
          e.start_window +
          '|' +
          e.end_window +
          '|' +
          e.total_points +
          '|' +
          e.self_points +
          '|' +
          e.referral_points,
        onProgress: (label, n) => progress(label, n),
      }
    );
    let summary = null;
    try {
      summary = await api('/api/points/summary');
    } catch (_) {}

    progress('competition', 0);
    let board = null;
    try {
      const entries = [];
      const seenAddr = new Set();
      let selfRow = null;
      // Cap leaderboard pull — we only need `self` for wallet identity; full board freezes Collecte
      for (let offset = 0; offset < 500; offset += 100) {
        const page = await api('/api/competition', {
          limit: 100,
          offset,
          ranking: 'score',
          order: 'desc',
        });
        const res = (page && page.result) || {};
        const rows = res.entries || [];
        if (res.self && !selfRow) selfRow = res.self;
        for (const row of rows) {
          if (seenAddr.has(row.address)) continue;
          seenAddr.add(row.address);
          entries.push(row);
        }
        progress('competition', entries.length);
        if (rows.length < 100) break;
        await sleep(70);
      }
      board = {
        pulled_at: new Date().toISOString(),
        ranking: 'score',
        entries,
        self: selfRow,
      };
    } catch (_) {}

    progress('refunds', 0);
    const refundsRes = await softPageAll(
      '/api/loss_refund/history',
      { won_lottery: 'true' },
      { limit: 20, cap: 2000, label: 'refunds', onProgress: (l, n) => progress(l, n) }
    );
    const refunds = refundsRes.rows;
    progress('trades', 0);
    const trades = await pageAll(
      '/api/trades',
      { order_by: 'created_at', order: 'desc' },
      { label: 'trades', onProgress: (l, n) => progress(l, n) }
    );
    progress('transfers', 0);
    const transfersRes = await softPageAll(
      '/api/transfers',
      { order_by: 'created_at', order: 'desc' },
      { label: 'transfers', onProgress: (l, n) => progress(l, n) }
    );
    const transfers = transfersRes.rows;
    const warnings = [];
    if (refundsRes.skipped) warnings.push('refunds: ' + refundsRes.skipped);
    if (transfersRes.skipped) warnings.push('transfers: ' + transfersRes.skipped);

    return {
      format: 'variational-dashboard-export',
      version: VERSION,
      exported_at: new Date().toISOString(),
      counts: {
        trades: trades.length,
        transfers: transfers.length,
        points: points.length,
        refunds: refunds.length,
        competition: board ? board.entries.length : 0,
      },
      warnings: warnings.length ? warnings : undefined,
      trades,
      transfers,
      points_history: points,
      points_summary: summary,
      competition: board,
      loss_refunds: refunds,
    };
  }

  function buildAutoFileName(payload) {
    const stamp = new Date().toISOString().slice(0, 10);
    let suffix = 'XX';
    try {
      const addr =
        (payload.competition && payload.competition.self && payload.competition.self.address) ||
        (payload.points_summary && payload.points_summary.address) ||
        (payload.points_summary && payload.points_summary.user && payload.points_summary.user.address) ||
        '';
      if (addr && addr.length >= 2) suffix = String(addr).slice(-2).toUpperCase();
    } catch (_) {}
    let trades = 0;
    try {
      trades = (payload.counts && payload.counts.trades) || (payload.trades && payload.trades.length) || 0;
    } catch (_) {}
    let pts = 0;
    try {
      const sum = payload.points_summary;
      pts = Math.round(parseFloat((sum && (sum.total_points || sum.self_points)) || 0)) || 0;
    } catch (_) {}
    return suffix + '_' + trades + 't_' + pts + 'pts_' + stamp + '.json';
  }

  let busy = false;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (window.__hsOmniCollectVersion !== COLLECT_SCRIPT_VERSION) return undefined;
    // V2 only — ignore legacy HS_OMNI_COLLECT so stale injects cannot download.
    if (!msg || msg.type !== 'HS_OMNI_COLLECT_V2') return undefined;
    if (busy) {
      sendResponse({ ok: false, error: 'Collection already running' });
      return false;
    }
    busy = true;
    const downloadName = msg.fileName ? String(msg.fileName) : '';
    (async () => {
      try {
        const payload = await collect((label, n) => {
          try {
            chrome.runtime.sendMessage({
              type: 'HS_OMNI_COLLECT_PROGRESS',
              label,
              count: n,
            });
          } catch (_) {}
        });
        const autoName = buildAutoFileName(payload);
        const isGeneric = !downloadName
          || /^variational-export(-\d{4}-\d{2}-\d{2})?(\.json)?$/i.test(downloadName.trim())
          || /^variational-export-ext(\.json)?$/i.test(downloadName.trim());
        const finalName = isGeneric ? autoName : downloadName;
        // Never download from the page — background chrome.downloads owns the PC file name.
        sendResponse({
          ok: true,
          payload,
          mb: null,
          counts: payload.counts,
          warnings: payload.warnings || [],
          fileName: finalName,
        });
      } catch (e) {
        sendResponse({
          ok: false,
          error: (e && e.message) || String(e),
        });
      } finally {
        busy = false;
      }
    })();
    return true;
  });
})();
