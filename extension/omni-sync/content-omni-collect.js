/**
 * Omni tab collector — runs only on omni.variational.io while the user is logged in.
 * Triggered by the Hypersheets extension panel (1 click).
 * PC file download is handled by the background service worker (chrome.downloads).
 */
(function () {
  const COLLECT_SCRIPT_VERSION = 9;
  // Re-injects bump this so stale listeners from older injects ignore messages.
  window.__hsOmniCollectVersion = COLLECT_SCRIPT_VERSION;
  const VERSION = 3;
  const HOST = 'omni.variational.io';

  /** Last 2 hex chars from full or truncated Omni addr (e.g. 0x3…ed0f → 0F). */
  function walletSuffixFromAddr(addr) {
    const a = String(addr || '').trim();
    if (!a) return '';
    const hex = a.replace(/[^a-fA-F0-9]/g, '');
    if (hex.length >= 2) return hex.slice(-2).toUpperCase();
    return '';
  }

  /**
   * Connected wallet on the Omni page (wagmi / localStorage / DOM).
   * Prefer this over competition.self — self can lag or follow a reconnected wallet
   * while /api/trades still serves another company.
   */
  function discoverConnectedAddress() {
    const full = [];
    const truncated = [];
    const pushFull = (s) => {
      const m = String(s || '').match(/0x[a-fA-F0-9]{40}/gi);
      if (!m) return;
      for (const a of m) full.push(a.toLowerCase());
    };
    const pushTrunc = (s) => {
      const m = String(s || '').match(/0x[a-fA-F0-9]{1,8}[.…·\u2026]+[a-fA-F0-9]{2,8}/gi);
      if (!m) return;
      for (const a of m) truncated.push(a);
    };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        const v = localStorage.getItem(k) || '';
        if (/wagmi|wallet|rainbow|privy|account|viem|connector/i.test(k) || /0x/i.test(v)) {
          pushFull(v);
          pushTrunc(v);
        }
      }
    } catch (_) {}
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i) || '';
        const v = sessionStorage.getItem(k) || '';
        if (/wagmi|wallet|rainbow|privy|account|viem|connector/i.test(k) || /0x/i.test(v)) {
          pushFull(v);
          pushTrunc(v);
        }
      }
    } catch (_) {}
    try {
      const eth = window.ethereum;
      if (eth && Array.isArray(eth.selectedAddress) === false && eth.selectedAddress) {
        pushFull(eth.selectedAddress);
      }
    } catch (_) {}
    try {
      // Header chip often shows 0x12…abcd — scan visible text lightly.
      const text = (document.body && document.body.innerText) || '';
      pushTrunc(text.slice(0, 8000));
      pushFull(text.slice(0, 8000));
    } catch (_) {}

    const uniqFull = [...new Set(full)];
    if (uniqFull.length === 1) return { address: uniqFull[0], source: 'page-full' };
    if (uniqFull.length > 1) {
      // Prefer an address also hinted by truncated UI chips.
      for (const a of uniqFull) {
        const suf = a.slice(-4).toLowerCase();
        if (truncated.some((t) => t.toLowerCase().replace(/[^a-f0-9]/g, '').endsWith(suf))) {
          return { address: a, source: 'page-full-matched' };
        }
      }
      return { address: uniqFull[0], source: 'page-full-first' };
    }
    const uniqTrunc = [...new Set(truncated)];
    if (uniqTrunc.length === 1) return { address: uniqTrunc[0], source: 'page-trunc' };
    if (uniqTrunc.length > 1) {
      // Prefer header-looking short forms (… + 4 hex).
      const prefer = uniqTrunc.find((t) => /0x[a-f0-9]{2,4}[.…·\u2026]+[a-f0-9]{4}/i.test(t));
      return { address: prefer || uniqTrunc[0], source: 'page-trunc-multi' };
    }
    return { address: '', source: '' };
  }

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
    // Transfers are required for Omni PnL (Suivi uses the same /api/transfers rows).
    // Retry harder than softPageAll — a single 429 used to leave Hypersheets at $0 PnL.
    let transfers = [];
    let transfersSkipped = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const transfersRes = await softPageAll(
        '/api/transfers',
        { order_by: 'created_at', order: 'desc' },
        { label: 'transfers', onProgress: (l, n) => progress(l, n) }
      );
      transfers = transfersRes.rows || [];
      if (transfers.length) {
        transfersSkipped = null;
        break;
      }
      transfersSkipped = transfersRes.skipped || 'empty';
      await sleep(1500 * (attempt + 1));
    }
    const warnings = [];
    if (refundsRes.skipped) warnings.push('refunds: ' + refundsRes.skipped);
    if (transfersSkipped) warnings.push('transfers: ' + transfersSkipped);

    // Wallet identity for PC filename + jambe label.
    // Prefer the address connected on the page; competition.self is truncated and can
    // belong to another wallet after a tab reload / account switch race.
    const pageWallet = discoverConnectedAddress();
    let omniAddress = '';
    let walletSource = '';
    try {
      if (pageWallet.address) {
        omniAddress = String(pageWallet.address);
        walletSource = pageWallet.source || 'page';
      } else if (board && board.self && board.self.address) {
        omniAddress = String(board.self.address);
        walletSource = 'competition.self';
      } else if (summary && summary.address) {
        omniAddress = String(summary.address);
        walletSource = 'points_summary';
      } else if (summary && summary.user && summary.user.address) {
        omniAddress = String(summary.user.address);
        walletSource = 'points_summary.user';
      }
    } catch (_) {}
    const company =
      (summary && summary.company)
      || (trades[0] && trades[0].company)
      || '';
    let walletSuffix = walletSuffixFromAddr(omniAddress) || 'XX';
    // If page + competition.self disagree on suffix, prefer page (connected wallet).
    try {
      const selfSuf = walletSuffixFromAddr(board && board.self && board.self.address);
      const pageSuf = walletSuffixFromAddr(pageWallet.address);
      if (pageSuf && selfSuf && pageSuf !== selfSuf) {
        walletSuffix = pageSuf;
        omniAddress = pageWallet.address;
        walletSource = (pageWallet.source || 'page') + '-over-self';
        warnings.push('wallet_suffix: page ' + pageSuf + ' != competition.self ' + selfSuf);
      }
    } catch (_) {}
    const fullAddr = /^0x[a-f0-9]{40}$/i.test(String(omniAddress || '').trim())
      ? String(omniAddress).trim().toLowerCase()
      : '';

    return {
      format: 'variational-dashboard-export',
      version: VERSION,
      exported_at: new Date().toISOString(),
      omni_address: fullAddr || undefined,
      omni_address_raw: omniAddress || undefined,
      wallet_suffix: walletSuffix,
      wallet_suffix_source: walletSource || undefined,
      company: company || undefined,
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
    let suffix = (payload && payload.wallet_suffix) || '';
    try {
      if (!suffix || suffix === 'XX') {
        suffix = walletSuffixFromAddr(payload && payload.omni_address)
          || walletSuffixFromAddr(payload && payload.competition && payload.competition.self && payload.competition.self.address)
          || walletSuffixFromAddr(payload && payload.points_summary && payload.points_summary.address)
          || walletSuffixFromAddr(payload && payload.points_summary && payload.points_summary.user && payload.points_summary.user.address)
          || 'XX';
      }
    } catch (_) {
      suffix = 'XX';
    }
    let trades = 0;
    try {
      trades = (payload.counts && payload.counts.trades) || (payload.trades && payload.trades.length) || 0;
    } catch (_) {}
    let pts = 0;
    try {
      const sum = payload.points_summary;
      pts = Math.round(parseFloat((sum && (sum.total_points || sum.self_points)) || 0)) || 0;
    } catch (_) {}
    return 'omni-' + suffix + '_' + trades + 't_' + pts + 'pts_' + stamp + '.json';
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
