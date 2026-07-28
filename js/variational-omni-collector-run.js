/**
 * Hypersheets Omni collector — full runtime.
 * Injected into omni.variational.io by the short bookmarklet loader.
 * Config (optional): window.__HS_OMNI_COLLECTOR__ = { appUrl, logo }
 */
(function () {
  const HOST = 'omni.variational.io';
  const VERSION = 3;
  const cfg = (typeof window !== 'undefined' && window.__HS_OMNI_COLLECTOR__) || {};
  const HS_APP = cfg.appUrl || 'https://hypersheets.xyz/#var-omni-import';
  const HS_LOGO = cfg.logo || 'https://hypersheets.xyz/img/hypersheets-logo.png';

  if (!location.hostname.endsWith('variational.io')) {
    alert('Wrong tab — open Omni (' + HOST + '), stay on that tab, then click this bookmark.');
    return;
  }

  let hsWin = null;
  try { hsWin = window.open(HS_APP, 'hs-var-omni'); } catch (_) {}

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483647;right:18px;bottom:18px;width:290px;background:#0b0d14;border:1px solid rgba(76,154,248,.45);border-radius:14px;padding:16px 18px;color:#f8fafc;font:600 13px -apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.8)';
  box.innerHTML = '<div style="display:flex;align-items:center;gap:10px"><img src="' + HS_LOGO + '" alt="" width="28" height="28" style="width:28px;height:28px;border-radius:50%;object-fit:contain;flex-shrink:0;background:#000"/><div style="font-size:14px;font-weight:800;letter-spacing:-.2px;line-height:1.2">Hypersheets Omni<br><span style="opacity:.55;font-weight:600;font-size:12px">v' + VERSION + '</span></div></div><div id="hs-vdc-msg" style="margin-top:8px;font-weight:500;color:rgba(241,245,249,.65);line-height:1.5">Starting…</div><div style="margin-top:12px;width:254px;height:6px;border-radius:99px;background:rgba(76,154,248,.15);overflow:hidden"><div id="hs-vdc-bar" style="height:6px;width:0;background:#4c9af8;transition:width .3s"></div></div>';
  document.body.appendChild(box);

  const say = (msg, pct) => {
    const m = box.querySelector('#hs-vdc-msg');
    const b = box.querySelector('#hs-vdc-bar');
    if (m) m.textContent = msg;
    if (b && pct != null) b.style.width = Math.round(Math.max(0, Math.min(100, pct)) * 2.54) + 'px';
  };
  const done = (msg, ok) => {
    box.style.borderColor = ok ? 'rgba(16,185,129,.5)' : 'rgba(239,68,68,.55)';
    say(msg);
    setTimeout(() => box.remove(), ok ? 7000 : 14000);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function api(path, params) {
    const url = new URL('https://' + HOST + path);
    Object.keys(params || {}).forEach((k) => url.searchParams.append(k, params[k]));
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, { credentials: 'include' });
      } catch {
        if (attempt < 3) { await sleep(800 * (attempt + 1)); continue; }
        throw new Error('Network error on ' + path);
      }
      if (res.status === 429 && attempt < 3) {
        say('Rate limited, waiting…');
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error('Not logged in — sign in to ' + HOST + ' and retry');
      }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' on ' + path);
      return res.json();
    }
  }

  async function pageAll(path, params, opts) {
    const limit = (opts && opts.limit) || 100;
    const cap = (opts && opts.cap) || 40000;
    const label = (opts && opts.label) || path;
    const key = opts && opts.key;
    const seen = key ? new Set() : null;
    const out = [];
    let offset = 0;
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
      say('Fetching ' + label + ' (' + out.length + ')', (offset / 4000) * 100);
      if (rows.length < limit) break;
      if (seen && added === 0) break;
      offset += limit;
      await sleep(70);
    }
    return out;
  }

  function hsOrigin() {
    try { return new URL(HS_APP).origin; } catch (_) { return '*'; }
  }

  function waitAck(ms) {
    return new Promise((resolve) => {
      let settled = false;
      const t = setTimeout(() => {
        if (!settled) {
          settled = true;
          window.removeEventListener('message', onMsg);
          resolve(false);
        }
      }, ms);
      function onMsg(ev) {
        if (settled) return;
        if (ev.origin !== hsOrigin()) return;
        if (!ev.data || ev.data.type !== 'hs-var-omni-export-ack') return;
        settled = true;
        clearTimeout(t);
        window.removeEventListener('message', onMsg);
        resolve(!!ev.data.ok);
      }
      window.addEventListener('message', onMsg);
    });
  }

  async function pushToHs(payload) {
    const origin = hsOrigin();
    for (let i = 0; i < 24; i++) {
      if (!hsWin || hsWin.closed) {
        try { hsWin = window.open(HS_APP, 'hs-var-omni'); } catch (_) {}
      }
      if (hsWin) {
        try {
          hsWin.postMessage({ type: 'hs-var-omni-export', version: VERSION, payload }, origin);
        } catch (_) {}
      }
      say('Sending to Hypersheets…', 92 + (i % 5));
      if (await waitAck(450)) return true;
    }
    return false;
  }

  function downloadJson(payload) {
    const json = JSON.stringify(payload);
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'variational-export-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return (json.length / 1048576).toFixed(2);
  }

  (async () => {
    try {
      say('Reading points history…', 5);
      const points = await pageAll('/api/points/history', {}, {
        limit: 20, cap: 500, label: 'points',
        key: (e) => e.start_window + '|' + e.end_window + '|' + e.total_points + '|' + e.self_points + '|' + e.referral_points,
      });
      let summary = null;
      try { summary = await api('/api/points/summary'); }
      catch (e) { console.warn('[hypersheets-omni] points summary unavailable', e); }

      say('Reading competition board…', 8);
      let board = null;
      try {
        const entries = [];
        const seenAddr = new Set();
        let selfRow = null;
        for (let offset = 0; offset < 20000; offset += 100) {
          const page = await api('/api/competition', { limit: 100, offset, ranking: 'score', order: 'desc' });
          const res = (page && page.result) || {};
          const rows = res.entries || [];
          if (res.self && !selfRow) selfRow = res.self;
          for (const row of rows) {
            if (seenAddr.has(row.address)) continue;
            seenAddr.add(row.address);
            entries.push(row);
          }
          say('Fetching board (' + entries.length + ')', 8);
          if (rows.length < 100) break;
          await sleep(70);
        }
        board = { pulled_at: new Date().toISOString(), ranking: 'score', entries, self: selfRow };
      } catch (e) {
        console.warn('[hypersheets-omni] competition board unavailable', e);
      }

      say('Reading loss refunds…', 12);
      const refunds = await pageAll('/api/loss_refund/history', { won_lottery: 'true' }, { limit: 20, cap: 2000, label: 'refunds' });
      say('Reading trades…', 20);
      const trades = await pageAll('/api/trades', { order_by: 'created_at', order: 'desc' }, { label: 'trades' });
      say('Reading transfers…', 70);
      const transfers = await pageAll('/api/transfers', { order_by: 'created_at', order: 'desc' }, { label: 'transfers' });

      const payload = {
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
        trades,
        transfers,
        points_history: points,
        points_summary: summary,
        competition: board,
        loss_refunds: refunds,
      };

      say('Importing into Hypersheets…', 90);
      const pushed = await pushToHs(payload);
      if (pushed) {
        done('Imported into Hypersheets — ' + trades.length + ' trades, ' + transfers.length + ' transfers. JSON kept as backup download.', true);
        downloadJson(payload);
      } else {
        const mb = downloadJson(payload);
        done('Auto-import blocked — downloaded ' + trades.length + ' trades / ' + transfers.length + ' transfers (' + mb + ' MB). Drop the file in Hypersheets → Variational → Activity.', true);
      }
    } catch (e) {
      done('Failed: ' + (e && e.message ? e.message : e), false);
      console.error('[hypersheets-omni]', e);
    }
  })();
})();
