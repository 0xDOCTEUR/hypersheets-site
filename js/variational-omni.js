/**
 * Hypersheets — Variational Omni (radar marché, delta-neutral, import CSV)
 * API publique: GET /metadata/stats
 */
(function () {
  'use strict';

  const VAR_API_BASE = 'https://omni-client-api.prod.ap-northeast-1.variational.io';
  const HS_VAR_LEG_KEY = 'hs-var-manual-leg';
  const HS_VAR_CSV_KEY = 'hs-var-csv-bundle';
  const VAR_STATS_CACHE_MS = 5 * 60 * 1000;
  const VAR_HL_TICKER_MAP = {
    BTC: 'BTC', ETH: 'ETH', SOL: 'SOL', HYPE: 'HYPE', ZEC: 'ZEC',
    GOLD: 'xyz:GOLD', SILVER: 'xyz:SILVER', SPX: 'xyz:SPX', NDX: 'xyz:NDX',
    TSLA: 'xyz:TSLA', NVDA: 'xyz:NVDA', AAPL: 'xyz:AAPL',
  };

  let _varStatsCache = null;
  let _varStatsTime = 0;
  let _varHlFunding = null;
  let _varSub = 'radar';

  function varT(key) {
    return typeof t === 'function' ? t(key) : key;
  }
  function varLoc() {
    return typeof locale === 'function' ? locale() : 'en-US';
  }
  function varFmtUsd(n) {
    if (typeof fmtUsd === 'function') return fmtUsd(n);
    if (n == null || !isFinite(n)) return '—';
    return '$' + Number(n).toLocaleString(varLoc(), { maximumFractionDigits: 0 });
  }
  function varFmtPct(n, digits) {
    if (n == null || !isFinite(n)) return '—';
    return Number(n).toFixed(digits != null ? digits : 2) + '%';
  }
  function varFmtVol(n) {
    if (typeof fmtLbVol === 'function') return fmtLbVol(n);
    if (n == null || !isFinite(n) || n <= 0) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
  }

  async function varFetchJson(url) {
    const proxy = typeof HS_CONFIG !== 'undefined' && HS_CONFIG.variationalProxyUrl;
    const tries = [];
    if (proxy) tries.push(proxy + encodeURIComponent(url));
    tries.push(url);
    let lastErr = null;
    for (const u of tries) {
      try {
        const res = await fetch(u, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('fetch failed');
  }

  async function fetchVarStats(force) {
    if (!force && _varStatsCache && Date.now() - _varStatsTime < VAR_STATS_CACHE_MS) {
      return _varStatsCache;
    }
    const data = await varFetchJson(VAR_API_BASE + '/metadata/stats');
    _varStatsCache = data;
    _varStatsTime = Date.now();
    return data;
  }

  async function fetchHlFundingMap() {
    if (_varHlFunding && Date.now() - _varHlFunding.ts < VAR_STATS_CACHE_MS) {
      return _varHlFunding.map;
    }
    const map = {};
    if (typeof hlPost !== 'function') {
      _varHlFunding = { map, ts: Date.now() };
      return map;
    }
    try {
      const data = await hlPost({ type: 'metaAndAssetCtxs' });
      const uni = data?.[0]?.universe || [];
      const ctxs = data?.[1] || [];
      uni.forEach((u, i) => {
        const name = u?.name;
        if (!name) return;
        const c = ctxs[i] || {};
        const mark = parseFloat(c.markPx || 0);
        const fund = parseFloat(c.funding || 0);
        if (mark > 0) map[name.toUpperCase()] = { coin: name, markPx: mark, fundingHr: fund };
      });
      const xyz = await hlPost({ type: 'metaAndAssetCtxs', dex: 'xyz' }).catch(() => null);
      if (xyz?.[0]?.universe) {
        xyz[0].universe.forEach((u, i) => {
          const name = u?.name;
          if (!name) return;
          const c = (xyz[1] || [])[i] || {};
          const mark = parseFloat(c.markPx || 0);
          const fund = parseFloat(c.funding || 0);
          const short = name.replace(/^xyz:/i, '').toUpperCase();
          const entry = { coin: name, markPx: mark, fundingHr: fund };
          map[short] = entry;
          map[name.toUpperCase()] = entry;
        });
      }
    } catch (_) {}
    _varHlFunding = { map, ts: Date.now() };
    return map;
  }

  function varFundingDailyPct(rate, intervalS) {
    const r = parseFloat(rate || 0);
    const iv = parseFloat(intervalS || 28800);
    if (!isFinite(r) || !isFinite(iv) || iv <= 0) return null;
    return r * (86400 / iv) * 100;
  }
  function hlFundingDailyPct(fundingHr) {
    const f = parseFloat(fundingHr || 0);
    if (!isFinite(f)) return null;
    return f * 24 * 100;
  }

  function varLegLoad() {
    try {
      const raw = JSON.parse(localStorage.getItem(HS_VAR_LEG_KEY) || 'null');
      if (!raw || !raw.ticker) return null;
      return raw;
    } catch {
      return null;
    }
  }
  function varLegSave(leg) {
    try {
      localStorage.setItem(HS_VAR_LEG_KEY, JSON.stringify(leg));
    } catch (_) {}
  }
  function varLegClear() {
    try { localStorage.removeItem(HS_VAR_LEG_KEY); } catch (_) {}
  }

  function varCsvLoad() {
    try {
      return JSON.parse(localStorage.getItem(HS_VAR_CSV_KEY) || 'null') || null;
    } catch {
      return null;
    }
  }
  function varCsvSave(bundle) {
    try {
      localStorage.setItem(HS_VAR_CSV_KEY, JSON.stringify(bundle));
    } catch (_) {}
  }

  function parseCsvText(text) {
    const rows = [];
    let i = 0;
    const s = String(text || '').replace(/^\uFEFF/, '');
    while (i < s.length) {
      const row = [];
      while (i < s.length) {
        if (s[i] === '"') {
          i++;
          let cell = '';
          while (i < s.length) {
            if (s[i] === '"') {
              if (s[i + 1] === '"') { cell += '"'; i += 2; }
              else { i++; break; }
            } else { cell += s[i++]; }
          }
          row.push(cell);
          if (s[i] === ',') i++;
          else if (s[i] === '\r') { i++; if (s[i] === '\n') i++; break; }
          else if (s[i] === '\n' || i >= s.length) { if (s[i] === '\n') i++; break; }
        } else {
          let cell = '';
          while (i < s.length && s[i] !== ',' && s[i] !== '\n' && s[i] !== '\r') cell += s[i++];
          row.push(cell);
          if (s[i] === ',') i++;
          else if (s[i] === '\r') { i++; if (s[i] === '\n') i++; break; }
          else if (s[i] === '\n' || i >= s.length) { if (s[i] === '\n') i++; break; }
        }
      }
      if (row.some(c => String(c).trim() !== '')) rows.push(row);
    }
    return rows;
  }
  function csvRowsToObjects(matrix) {
    if (!matrix?.length) return [];
    const headers = matrix[0].map(h => String(h).trim().toLowerCase());
    const out = [];
    for (let r = 1; r < matrix.length; r++) {
      const o = {};
      headers.forEach((h, ci) => { o[h] = matrix[r][ci] != null ? String(matrix[r][ci]).trim() : ''; });
      out.push(o);
    }
    return out;
  }

  function aggregateVarCsv(trades, transfers) {
    const agg = {
      tradeVol: 0, tradeCount: 0, funding: 0, realizedPnl: 0, fees: 0,
      deposits: 0, withdrawals: 0, lastAt: 0,
    };
    for (const row of trades || []) {
      if (row.status && row.status !== 'confirmed') continue;
      const px = parseFloat(row.price || 0);
      const qty = parseFloat(row.qty || 0);
      if (isFinite(px) && isFinite(qty)) agg.tradeVol += Math.abs(px * qty);
      agg.tradeCount++;
      const ts = Date.parse(row.created_at || 0);
      if (ts > agg.lastAt) agg.lastAt = ts;
    }
    for (const row of transfers || []) {
      if (row.status && row.status !== 'confirmed') continue;
      const qty = parseFloat(row.qty || 0);
      const tt = (row.transfer_type || '').toLowerCase();
      if (tt === 'funding') agg.funding += qty;
      else if (tt === 'realized_pnl') agg.realizedPnl += qty;
      else if (tt === 'fee') agg.fees += Math.abs(qty);
      else if (tt === 'deposit') agg.deposits += qty;
      else if (tt === 'withdrawal') agg.withdrawals += Math.abs(qty);
      const ts = Date.parse(row.created_at || 0);
      if (ts > agg.lastAt) agg.lastAt = ts;
    }
    return agg;
  }

  function varHlCoinForTicker(ticker) {
    const u = String(ticker || '').toUpperCase();
    if (VAR_HL_TICKER_MAP[u]) return VAR_HL_TICKER_MAP[u];
    return u;
  }

  function varHlPositionForTicker(ticker) {
    const coin = varHlCoinForTicker(ticker);
    const positions = typeof getActivePositions === 'function' ? getActivePositions() : (window.allPositions || []);
    for (const p of positions || []) {
      const c = String(p.coin || '');
      const cUp = c.toUpperCase();
      const short = c.replace(/^xyz:/i, '').toUpperCase();
      if (c === coin || cUp === coin.toUpperCase() || short === ticker.toUpperCase()) {
        const szi = parseFloat(p.szi || 0);
        const entry = parseFloat(p.entryPx || 0);
        const mark = parseFloat(p.markPx || 0) || entry;
        return { coin: c, szi, entry, mark, notionalUsd: Math.abs(szi) * mark };
      }
    }
    return null;
  }

  function varComputeDelta(leg, hlPos) {
    if (!leg) return null;
    const sign = leg.side === 'short' ? -1 : 1;
    const varNotional = sign * Math.abs(parseFloat(leg.notional || 0));
    let hlNotional = 0;
    if (hlPos) hlNotional = hlPos.szi * (hlPos.mark || 0);
    const net = varNotional + hlNotional;
    const denom = Math.max(Math.abs(varNotional), Math.abs(hlNotional), 1);
    const driftPct = Math.abs(net) / denom * 100;
    return { varNotional, hlNotional, net, driftPct };
  }

  function varRadarSort(listings, mode) {
    const rows = [...(listings || [])];
    if (mode === 'funding') {
      rows.sort((a, b) => Math.abs(parseFloat(b.funding_rate || 0)) - Math.abs(parseFloat(a.funding_rate || 0)));
    } else if (mode === 'spread') {
      rows.sort((a, b) => parseFloat(b.base_spread_bps || 0) - parseFloat(a.base_spread_bps || 0));
    } else {
      rows.sort((a, b) => parseFloat(b.volume_24h || 0) - parseFloat(a.volume_24h || 0));
    }
    return rows.slice(0, 60);
  }

  function varCompareRows(listings, hlMap, minVol) {
    const out = [];
    for (const L of listings || []) {
      const vol = parseFloat(L.volume_24h || 0);
      if (vol < minVol) continue;
      const tick = String(L.ticker || '').toUpperCase();
      const hlKey = varHlCoinForTicker(tick);
      const hl = hlMap[hlKey] || hlMap[tick] || hlMap['XYZ:' + tick];
      if (!hl) continue;
      const varDaily = varFundingDailyPct(L.funding_rate, L.funding_interval_s);
      const hlDaily = hlFundingDailyPct(hl.fundingHr);
      if (varDaily == null || hlDaily == null) continue;
      out.push({
        ticker: tick,
        varDaily,
        hlDaily,
        diff: varDaily - hlDaily,
        markVar: parseFloat(L.mark_price || 0),
        markHl: hl.markPx,
        vol,
      });
    }
    out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    return out.slice(0, 40);
  }

  function varSetSub(sub, el) {
    _varSub = sub;
    document.querySelectorAll('#page-variational .var-sub-tab').forEach(t => {
      const on = t.dataset.varsub === sub;
      t.classList.toggle('active', on);
      t.style.background = on ? 'var(--var-accent, #4c9af8)' : 'transparent';
      t.style.color = on ? '#0b0d14' : 'var(--muted)';
    });
    document.querySelectorAll('#page-variational .var-sub-panel').forEach(p => {
      p.style.display = p.dataset.varpanel === sub ? 'block' : 'none';
    });
    if (sub === 'radar') renderVarRadar();
    else if (sub === 'hedge') renderVarHedge();
    else if (sub === 'activity') renderVarActivity();
  }

  async function renderVarPlatformKpis(stats) {
    const el = (id, v, sub) => {
      const n = document.getElementById(id);
      if (n) n.textContent = v;
      const s = document.getElementById(id + 'Sub');
      if (s && sub != null) s.textContent = sub;
    };
    if (!stats) {
      el('varKpiVol', '—'); el('varKpiTvl', '—'); el('varKpiOi', '—'); el('varKpiMkts', '—');
      return;
    }
    el('varKpiVol', varFmtUsd(parseFloat(stats.total_volume_24h || 0)), '24h');
    el('varKpiTvl', varFmtUsd(parseFloat(stats.tvl || 0)));
    el('varKpiOi', varFmtUsd(parseFloat(stats.open_interest || 0)));
    el('varKpiMkts', String(stats.num_markets || (stats.listings || []).length || '—'),
      stats.loss_refund ? varT('var.lossRefund') + ' ' + varFmtUsd(parseFloat(stats.loss_refund.refunded_24h || 0)) : '');
  }

  function varRadarTableHtml(rows, mode, hlMap) {
    if (!rows.length) {
      return `<div class="text-center text-sm py-10" style="color:var(--muted)">${varT('var.noData')}</div>`;
    }
    const isFr = typeof currentLang !== 'undefined' && currentLang === 'fr';
    let head = `<tr><th>${isFr ? 'Actif' : 'Asset'}</th><th class="text-right">Mark</th>`;
    if (mode === 'funding') head += `<th class="text-right">${isFr ? 'Funding /j' : 'Fund. /day'}</th><th class="text-right">HL /j</th><th class="text-right">Δ</th>`;
    else if (mode === 'spread') head += `<th class="text-right">Spread bps</th><th class="text-right">${isFr ? 'Vol 24h' : '24h vol'}</th>`;
    else head += `<th class="text-right">${isFr ? 'Vol 24h' : '24h vol'}</th><th class="text-right">${isFr ? 'Funding /j' : 'Fund. /day'}</th>`;
    head += '</tr>';
    const body = rows.map(L => {
      const tick = String(L.ticker || '').toUpperCase();
      const mark = parseFloat(L.mark_price || 0);
      const vol = parseFloat(L.volume_24h || 0);
      const varD = varFundingDailyPct(L.funding_rate, L.funding_interval_s);
      const hl = hlMap[varHlCoinForTicker(tick)] || hlMap[tick];
      const hlD = hl ? hlFundingDailyPct(hl.fundingHr) : null;
      let cells = `<td class="font-medium">${tick}</td><td class="text-right mono">${mark > 0 ? mark.toLocaleString(varLoc(), { maximumFractionDigits: 4 }) : '—'}</td>`;
      if (mode === 'funding') {
        const diff = varD != null && hlD != null ? varD - hlD : null;
        const diffCls = diff > 0 ? 'color:var(--success)' : diff < 0 ? 'color:var(--danger)' : '';
        cells += `<td class="text-right mono">${varD != null ? varFmtPct(varD, 3) : '—'}</td>`;
        cells += `<td class="text-right mono">${hlD != null ? varFmtPct(hlD, 3) : '—'}</td>`;
        cells += `<td class="text-right mono" style="${diffCls}">${diff != null ? (diff >= 0 ? '+' : '') + diff.toFixed(3) + '%' : '—'}</td>`;
      } else if (mode === 'spread') {
        cells += `<td class="text-right mono">${parseFloat(L.base_spread_bps || 0).toFixed(1)}</td>`;
        cells += `<td class="text-right mono">${varFmtVol(vol)}</td>`;
      } else {
        cells += `<td class="text-right mono">${varFmtVol(vol)}</td>`;
        cells += `<td class="text-right mono">${varD != null ? varFmtPct(varD, 3) : '—'}</td>`;
      }
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table class="hs-trades-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  async function renderVarRadar() {
    const host = document.getElementById('varRadarTable');
    const modeSel = document.getElementById('varRadarSort');
    if (!host) return;
    const mode = modeSel?.value || 'funding';
    host.innerHTML = `<div class="text-center text-sm py-10" style="color:var(--muted)">${varT('loading')}</div>`;
    try {
      const [stats, hlMap] = await Promise.all([fetchVarStats(false), fetchHlFundingMap()]);
      await renderVarPlatformKpis(stats);
      const listings = stats?.listings || [];
      let rows;
      if (mode === 'compare') {
        rows = varCompareRows(listings, hlMap, 50000);
        host.innerHTML = varCompareTableHtml(rows);
      } else {
        rows = varRadarSort(listings, mode);
        host.innerHTML = varRadarTableHtml(rows, mode, hlMap);
      }
      const ts = document.getElementById('varRadarUpdated');
      if (ts) ts.textContent = new Date().toLocaleTimeString(varLoc());
    } catch (e) {
      host.innerHTML = `<div class="text-center text-sm py-10" style="color:var(--danger)">${varT('var.apiError')}: ${e.message}</div>`;
    }
  }

  function varCompareTableHtml(rows) {
    if (!rows.length) return `<div class="text-center text-sm py-10" style="color:var(--muted)">${varT('var.noCompare')}</div>`;
    const isFr = typeof currentLang !== 'undefined' && currentLang === 'fr';
    const body = rows.map(r => {
      const cls = r.diff > 0 ? 'color:var(--success)' : r.diff < 0 ? 'color:var(--danger)' : '';
      return `<tr>
        <td class="font-medium">${r.ticker}</td>
        <td class="text-right mono">${varFmtPct(r.varDaily, 3)}</td>
        <td class="text-right mono">${varFmtPct(r.hlDaily, 3)}</td>
        <td class="text-right mono" style="${cls}">${r.diff >= 0 ? '+' : ''}${r.diff.toFixed(3)}%</td>
        <td class="text-right mono">${varFmtVol(r.vol)}</td>
      </tr>`;
    }).join('');
    return `<table class="hs-trades-table"><thead><tr>
      <th>${isFr ? 'Actif' : 'Asset'}</th>
      <th class="text-right">Omni /j</th>
      <th class="text-right">HL /j</th>
      <th class="text-right">Δ</th>
      <th class="text-right">${isFr ? 'Vol Omni' : 'Omni vol'}</th>
    </tr></thead><tbody>${body}</tbody></table>`;
  }

  function renderVarHedge() {
    const leg = varLegLoad();
    const tickEl = document.getElementById('varLegTicker');
    const sideEl = document.getElementById('varLegSide');
    const notEl = document.getElementById('varLegNotional');
    const pxEl = document.getElementById('varLegEntry');
    if (leg) {
      if (tickEl && !tickEl.matches(':focus')) tickEl.value = leg.ticker || '';
      if (sideEl) sideEl.value = leg.side || 'short';
      if (notEl && !notEl.matches(':focus')) notEl.value = leg.notional || '';
      if (pxEl && !pxEl.matches(':focus')) pxEl.value = leg.entryPx || '';
    }
    const hlPos = leg ? varHlPositionForTicker(leg.ticker) : null;
    const delta = leg ? varComputeDelta(leg, hlPos) : null;
    const sum = document.getElementById('varHedgeSummary');
    if (!sum) return;
    if (!leg) {
      sum.innerHTML = `<p style="color:var(--muted);font-size:.85rem">${varT('var.hedgeEmpty')}</p>`;
      return;
    }
    const isFr = typeof currentLang !== 'undefined' && currentLang === 'fr';
    const driftWarn = delta && delta.driftPct > 5;
    sum.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div class="card2 p3"><div class="kpi-label">Omni</div><div class="kpi-val" style="font-size:1.1rem">${leg.side.toUpperCase()} ${varFmtUsd(Math.abs(leg.notional))}</div><div class="kpi-sub">${leg.ticker}</div></div>
        <div class="card2 p3"><div class="kpi-label">Hyperliquid</div><div class="kpi-val" style="font-size:1.1rem">${hlPos ? (hlPos.szi > 0 ? 'LONG' : 'SHORT') + ' ' + varFmtUsd(hlPos.notionalUsd) : '—'}</div><div class="kpi-sub">${hlPos ? hlPos.coin : (isFr ? 'Aucune position' : 'No position')}</div></div>
        <div class="card2 p3"><div class="kpi-label">${isFr ? 'Delta net (USD)' : 'Net delta (USD)'}</div><div class="kpi-val" style="font-size:1.1rem;color:${driftWarn ? 'var(--danger)' : 'var(--success)'}">${delta ? varFmtUsd(delta.net) : '—'}</div><div class="kpi-sub">${delta ? (isFr ? 'Dérive' : 'Drift') + ' ' + delta.driftPct.toFixed(1) + '%' : ''}</div></div>
      </div>
      ${driftWarn ? `<p style="font-size:.8rem;color:var(--warning-brand);margin:0">${varT('var.driftWarn')}</p>` : `<p style="font-size:.8rem;color:var(--muted);margin:0">${varT('var.hedgeHint')}</p>`}`;
  }

  function varSaveLegFromForm() {
    const ticker = (document.getElementById('varLegTicker')?.value || '').trim().toUpperCase();
    const side = document.getElementById('varLegSide')?.value === 'long' ? 'long' : 'short';
    const notional = parseFloat(document.getElementById('varLegNotional')?.value || 0);
    const entryPx = parseFloat(document.getElementById('varLegEntry')?.value || 0);
    if (!ticker || !isFinite(notional) || notional <= 0) {
      if (typeof toast === 'function') toast(varT('var.legInvalid'), true);
      return;
    }
    varLegSave({ ticker, side, notional, entryPx: isFinite(entryPx) ? entryPx : 0, updatedAt: Date.now() });
    if (typeof toast === 'function') toast(varT('var.legSaved'));
    renderVarHedge();
  }

  function renderVarActivity() {
    const bundle = varCsvLoad();
    const agg = bundle ? aggregateVarCsv(bundle.trades, bundle.transfers) : null;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    if (!agg) {
      set('varActVol', '—'); set('varActTrades', '—'); set('varActFunding', '—');
      set('varActPnl', '—'); set('varActFees', '—');
      const tbl = document.getElementById('varActivityTable');
      if (tbl) tbl.innerHTML = `<div class="text-center text-sm py-10" style="color:var(--muted)">${varT('var.csvEmpty')}</div>`;
      return;
    }
    set('varActVol', varFmtUsd(agg.tradeVol));
    set('varActTrades', String(agg.tradeCount));
    set('varActFunding', varFmtUsd(agg.funding));
    set('varActPnl', varFmtUsd(agg.realizedPnl));
    set('varActFees', varFmtUsd(agg.fees));
    const tbl = document.getElementById('varActivityTable');
    if (!tbl) return;
    const events = [];
    (bundle.trades || []).forEach(r => {
      events.push({ t: Date.parse(r.created_at || 0), type: 'trade', row: r });
    });
    (bundle.transfers || []).forEach(r => {
      events.push({ t: Date.parse(r.created_at || 0), type: 'transfer', row: r });
    });
    events.sort((a, b) => b.t - a.t);
    const slice = events.slice(0, 150);
    if (!slice.length) {
      tbl.innerHTML = `<div class="text-center text-sm py-10" style="color:var(--muted)">${varT('var.noData')}</div>`;
      return;
    }
    const isFr = typeof currentLang !== 'undefined' && currentLang === 'fr';
    const body = slice.map(ev => {
      const r = ev.row;
      if (ev.type === 'trade') {
        const px = parseFloat(r.price || 0);
        const qty = parseFloat(r.qty || 0);
        return `<tr>
          <td style="color:var(--muted)" class="mono">${r.created_at ? new Date(r.created_at).toLocaleString(varLoc()) : '—'}</td>
          <td>trade</td>
          <td class="font-medium">${(r.underlying || '').toUpperCase()}</td>
          <td>${r.side || ''}</td>
          <td class="text-right mono">${varFmtUsd(px * qty)}</td>
        </tr>`;
      }
      return `<tr>
        <td style="color:var(--muted)" class="mono">${r.created_at ? new Date(r.created_at).toLocaleString(varLoc()) : '—'}</td>
        <td>${r.transfer_type || 'transfer'}</td>
        <td class="font-medium">${(r.underlying || r.asset || '').toUpperCase()}</td>
        <td>—</td>
        <td class="text-right mono">${varFmtUsd(parseFloat(r.qty || 0))}</td>
      </tr>`;
    }).join('');
    tbl.innerHTML = `<table class="hs-trades-table"><thead><tr>
      <th>${isFr ? 'Date' : 'Date'}</th><th>${isFr ? 'Type' : 'Type'}</th><th>${isFr ? 'Actif' : 'Asset'}</th><th>Side</th><th class="text-right">USD</th>
    </tr></thead><tbody>${body}</tbody></table>`;
  }

  function varImportCsvFiles(input) {
    const files = input?.files;
    if (!files?.length) return;
    let trades = [];
    let transfers = [];
    let pending = files.length;
    const onDone = () => {
      pending--;
      if (pending > 0) return;
      const bundle = { trades, transfers, importedAt: Date.now() };
      varCsvSave(bundle);
      if (typeof toast === 'function') toast(varT('var.csvImported'));
      renderVarActivity();
      input.value = '';
    };
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const matrix = parseCsvText(reader.result);
          const objs = csvRowsToObjects(matrix);
          const name = (file.name || '').toLowerCase();
          if (name.includes('transfer') || objs[0]?.transfer_type) transfers = transfers.concat(objs);
          else trades = trades.concat(objs);
        } catch (_) {}
        onDone();
      };
      reader.readAsText(file);
    }
  }

  function varClearCsv() {
    try { localStorage.removeItem(HS_VAR_CSV_KEY); } catch (_) {}
    if (typeof toast === 'function') toast(varT('var.csvCleared'));
    renderVarActivity();
  }

  async function initVarPage(force) {
    await renderVarPlatformKpis(_varStatsCache);
    varSetSub(_varSub, null);
    if (force) {
      _varStatsCache = null;
      await fetchVarStats(true);
    }
    if (_varSub === 'radar') await renderVarRadar();
    else if (_varSub === 'hedge') renderVarHedge();
    else renderVarActivity();
  }

  window.varSetSub = varSetSub;
  window.renderVarRadar = renderVarRadar;
  window.renderVarHedge = renderVarHedge;
  window.renderVarActivity = renderVarActivity;
  window.varSaveLegFromForm = varSaveLegFromForm;
  window.varLegClear = function () { varLegClear(); renderVarHedge(); if (typeof toast === 'function') toast(varT('var.legCleared')); };
  window.varImportCsvFiles = varImportCsvFiles;
  window.varClearCsv = varClearCsv;
  window.initVarPage = initVarPage;
})();
