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
    // Perps HL (dex principal)
    BTC: 'BTC', ETH: 'ETH', SOL: 'SOL', HYPE: 'HYPE', ZEC: 'ZEC', XRP: 'XRP',
    // Métaux — codes Variational (ISO) → symboles HIP-3 Hyperliquid
    XAU: 'xyz:GOLD', XAG: 'xyz:SILVER', XPT: 'xyz:PLATINUM', XPD: 'xyz:PALLADIUM',
    GOLD: 'xyz:GOLD', SILVER: 'xyz:SILVER', PLATINUM: 'xyz:PLATINUM', PALLADIUM: 'xyz:PALLADIUM',
    PAXG: 'xyz:GOLD', XAUT: 'xyz:GOLD',
    // Énergie / matières premières
    CL: 'xyz:CL', BRENTOIL: 'xyz:BRENTOIL', NATGAS: 'xyz:NATGAS', COPPER: 'xyz:COPPER',
    ALUM: 'xyz:ALUMINIUM', ALUMINIUM: 'xyz:ALUMINIUM',
    WHEAT: 'xyz:WHEAT', CORN: 'xyz:CORN', URANIUM: 'xyz:URANIUM', URNM: 'xyz:URNM',
  };
  /** Indices et actions HIP-3 : même ticker ou alias connu. */
  const VAR_HL_TICKER_ALIASES = {
    US500: 'xyz:SP500', SPX: 'xyz:SP500', SP500: 'xyz:SP500',
    NDX: 'xyz:XYZ100', QQQ: 'xyz:XYZ100',
    AAPL: 'xyz:AAPL', NVDA: 'xyz:NVDA', TSLA: 'xyz:TSLA', MSFT: 'xyz:MSFT',
    META: 'xyz:META', GOOGL: 'xyz:GOOGL', AMZN: 'xyz:AMZN', COIN: 'xyz:COIN',
    PLTR: 'xyz:PLTR', MSTR: 'xyz:MSTR', MU: 'xyz:MU', NFLX: 'xyz:NFLX',
    AMD: 'xyz:AMD', INTC: 'xyz:INTC', TSM: 'xyz:TSM', ARM: 'xyz:ARM',
    HOOD: 'xyz:HOOD', HIMS: 'xyz:HIMS', RKLB: 'xyz:RKLB', CBRS: 'xyz:CBRS',
    SPCX: 'xyz:SPCX', LLY: 'xyz:LLY', CRCL: 'xyz:CRCL', MRVL: 'xyz:MRVL',
    LITE: 'xyz:LITE', SNDK: 'xyz:SNDK', SKHX: 'xyz:SKHX', DRAM: 'xyz:DRAM',
    EWJ: 'xyz:EWJ', EWY: 'xyz:EWY', NOK: 'xyz:NOK', QCOM: 'xyz:QCOM',
    AVGO: 'xyz:AVGO', BABA: 'xyz:BABA', GME: 'xyz:GME', ORCL: 'xyz:ORCL',
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

  /** API funding_rate = décimal par intervalle (×100 → % par intervalle). Voir docs Variational. */
  function varFundingIntervalPct(rate) {
    const r = parseFloat(rate || 0);
    if (!isFinite(r)) return null;
    if (Math.abs(r) <= 1.5) return r * 100;
    return r;
  }
  function varFundingDailyPct(rate, intervalS) {
    const pctInterval = varFundingIntervalPct(rate);
    const iv = parseFloat(intervalS || 28800);
    if (pctInterval == null || !isFinite(iv) || iv <= 0) return null;
    return pctInterval * (86400 / iv);
  }
  function varFmtFundingDaily(pct, signed) {
    if (pct == null || !isFinite(pct)) return '—';
    if (Math.abs(pct) >= 500) {
      const cap = (pct > 0 ? '>' : '<') + '500';
      return signed && pct > 0 ? '+' + cap : cap;
    }
    const body = Math.abs(pct).toLocaleString(varLoc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sfx = varT('var.perDay');
    if (!signed) return body + sfx;
    return (pct >= 0 ? '+' : '−') + body + sfx;
  }
  function varFundingIntervalLabel(intervalS) {
    const iv = parseFloat(intervalS || 28800);
    if (!isFinite(iv) || iv <= 0) return '';
    const h = iv / 3600;
    if (h >= 1 && Math.abs(h - Math.round(h)) < 0.01) {
      const n = Math.round(h);
      return n === 1 ? varT('var.interval1h') : varT('var.intervalH').replace('{h}', String(n));
    }
    return varT('var.intervalCustom').replace('{s}', String(Math.round(iv)));
  }
  function varFmtMark(px) {
    const n = parseFloat(px);
    if (!isFinite(n) || n <= 0) return '—';
    if (n >= 1000) return n.toLocaleString(varLoc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n >= 1) return n.toLocaleString(varLoc(), { maximumFractionDigits: 2 });
    return n.toLocaleString(varLoc(), { maximumFractionDigits: 4 });
  }
  function hlFundingDailyPct(fundingHr) {
    const f = parseFloat(fundingHr || 0);
    if (!isFinite(f)) return null;
    return f * 24 * 100;
  }

  let _varListingsCache = [];
  let _varLegPreviewTimer = null;

  function varHasWallets() {
    return typeof wallets !== 'undefined' && Array.isArray(wallets) && wallets.length > 0;
  }

  function varHlPositionsLoaded() {
    return typeof allPositions !== 'undefined' && Array.isArray(allPositions) && allPositions.length > 0;
  }

  function varPopulateLegTickers(listings) {
    const dl = document.getElementById('varLegTickerList');
    if (!dl) return;
    const rows = [...(listings || [])]
      .filter(L => parseFloat(L.volume_24h || 0) >= 10000)
      .sort((a, b) => parseFloat(b.volume_24h || 0) - parseFloat(a.volume_24h || 0))
      .slice(0, 120);
    dl.innerHTML = rows.map(L => {
      const tick = String(L.ticker || '').toUpperCase();
      const vol = varFmtVol(parseFloat(L.volume_24h || 0));
      return `<option value="${tick}">${varHlAssetLabel(tick)} · ${vol}</option>`;
    }).join('');
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
    if (VAR_HL_TICKER_ALIASES[u]) return VAR_HL_TICKER_ALIASES[u];
    return u;
  }

  function varHlCoinShort(ticker) {
    return varHlCoinForTicker(ticker).replace(/^xyz:/i, '');
  }

  function varHlAssetLabel(ticker) {
    const u = String(ticker || '').toUpperCase();
    const hl = varHlCoinShort(u);
    return hl !== u ? `${u} → ${hl}` : u;
  }

  function varHlMapLookup(hlMap, ticker) {
    if (!hlMap) return null;
    const u = String(ticker || '').toUpperCase();
    const coin = varHlCoinForTicker(u);
    const short = coin.replace(/^xyz:/i, '').toUpperCase();
    return hlMap[coin.toUpperCase()] || hlMap[short] || hlMap[u] || hlMap['XYZ:' + u] || null;
  }

  function varHlPositionForTicker(ticker) {
    const coin = varHlCoinForTicker(ticker);
    const coinShort = coin.replace(/^xyz:/i, '').toUpperCase();
    const positions = typeof getActivePositions === 'function' ? getActivePositions() : (window.allPositions || []);
    for (const p of positions || []) {
      const c = String(p.coin || '');
      const cUp = c.toUpperCase();
      const short = c.replace(/^xyz:/i, '').toUpperCase();
      if (c === coin || cUp === coin.toUpperCase() || short === coinShort) {
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
    let rows = [...(listings || [])];
    if (mode === 'funding' || mode === 'spread') {
      rows = rows.filter(L => parseFloat(L.volume_24h || 0) >= 25000);
    }
    if (mode === 'funding') {
      rows.sort((a, b) => Math.abs(varFundingDailyPct(b.funding_rate, b.funding_interval_s) || 0) - Math.abs(varFundingDailyPct(a.funding_rate, a.funding_interval_s) || 0));
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
      const hl = varHlMapLookup(hlMap, tick);
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
    let head = `<tr><th>${varT('var.colAsset')}</th><th class="text-right">${varT('var.colMark')}</th>`;
    if (mode === 'funding') {
      head += `<th class="text-right">${varT('var.colFundingOmni')}</th><th class="text-right">${varT('var.colFundingHl')}</th><th class="text-right">${varT('var.colFundingGap')}</th><th class="text-right">${varT('var.colVol24h')}</th>`;
    } else if (mode === 'spread') {
      head += `<th class="text-right">${varT('var.colSpread')}</th><th class="text-right">${varT('var.colVol24h')}</th>`;
    } else {
      head += `<th class="text-right">${varT('var.colVol24h')}</th><th class="text-right">${varT('var.colFundingOmni')}</th>`;
    }
    head += '</tr>';
    const body = rows.map(L => {
      const tick = String(L.ticker || '').toUpperCase();
      const mark = parseFloat(L.mark_price || 0);
      const vol = parseFloat(L.volume_24h || 0);
      const varD = varFundingDailyPct(L.funding_rate, L.funding_interval_s);
      const hl = varHlMapLookup(hlMap, tick);
      const hlD = hl ? hlFundingDailyPct(hl.fundingHr) : null;
      let cells = `<td class="font-medium" title="${varHlCoinShort(tick)}">${varHlAssetLabel(tick)}</td><td class="text-right mono">${mark > 0 ? varFmtMark(mark) : '—'}</td>`;
      if (mode === 'funding') {
        const diff = varD != null && hlD != null ? varD - hlD : null;
        const diffCls = diff > 0 ? 'color:var(--success)' : diff < 0 ? 'color:var(--danger)' : '';
        const ivLbl = varFundingIntervalLabel(L.funding_interval_s);
        cells += `<td class="text-right mono" title="${ivLbl}">${varD != null ? varFmtFundingDaily(varD, true) : '—'}</td>`;
        cells += `<td class="text-right mono">${hlD != null ? varFmtFundingDaily(hlD, true) : varT('var.hlNa')}</td>`;
        cells += `<td class="text-right mono" style="${diffCls}">${diff != null ? varFmtFundingDaily(diff, true) : '—'}</td>`;
        cells += `<td class="text-right mono">${varFmtVol(vol)}</td>`;
      } else if (mode === 'spread') {
        cells += `<td class="text-right mono">${parseFloat(L.base_spread_bps || 0).toFixed(1)}</td>`;
        cells += `<td class="text-right mono">${varFmtVol(vol)}</td>`;
      } else {
        cells += `<td class="text-right mono">${varFmtVol(vol)}</td>`;
        cells += `<td class="text-right mono">${varD != null ? varFmtFundingDaily(varD, true) : '—'}</td>`;
      }
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<p class="text-xs" style="color:var(--muted);padding:8px 0 4px;margin:0">${varT('var.radarHint')}</p><table class="hs-trades-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
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
      _varListingsCache = listings;
      varPopulateLegTickers(listings);
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
    const body = rows.map(r => {
      const cls = r.diff > 0 ? 'color:var(--success)' : r.diff < 0 ? 'color:var(--danger)' : '';
      return `<tr>
        <td class="font-medium" title="${varHlCoinShort(r.ticker)}">${varHlAssetLabel(r.ticker)}</td>
        <td class="text-right mono">${varFmtFundingDaily(r.varDaily, true)}</td>
        <td class="text-right mono">${varFmtFundingDaily(r.hlDaily, true)}</td>
        <td class="text-right mono" style="${cls}">${varFmtFundingDaily(r.diff, true)}</td>
        <td class="text-right mono">${varFmtVol(r.vol)}</td>
      </tr>`;
    }).join('');
    return `<p class="text-xs" style="color:var(--muted);padding:8px 0 4px;margin:0">${varT('var.compareHint')}</p><table class="hs-trades-table"><thead><tr>
      <th>${varT('var.colAsset')}</th>
      <th class="text-right">${varT('var.colFundingOmni')}</th>
      <th class="text-right">${varT('var.colFundingHl')}</th>
      <th class="text-right">${varT('var.colFundingGap')}</th>
      <th class="text-right">${varT('var.colVol24h')}</th>
    </tr></thead><tbody>${body}</tbody></table>`;
  }

  function varReadLegFromForm(persist) {
    const ticker = (document.getElementById('varLegTicker')?.value || '').trim().toUpperCase();
    const side = document.getElementById('varLegSide')?.value === 'long' ? 'long' : 'short';
    const notional = parseFloat(document.getElementById('varLegNotional')?.value || 0);
    const entryPx = parseFloat(document.getElementById('varLegEntry')?.value || 0);
    if (!ticker || !isFinite(notional) || notional <= 0) return null;
    const leg = { ticker, side, notional, entryPx: isFinite(entryPx) ? entryPx : 0, updatedAt: Date.now() };
    if (persist) varLegSave(leg);
    return leg;
  }

  function varScheduleLegPreview() {
    clearTimeout(_varLegPreviewTimer);
    _varLegPreviewTimer = setTimeout(() => renderVarHedge(true), 280);
  }

  function varSuggestedHlSide(omniSide) {
    return omniSide === 'short' ? 'long' : 'short';
  }

  function varFundingForTicker(ticker, listings, hlMap) {
    const tick = String(ticker || '').toUpperCase();
    const L = (listings || _varListingsCache || []).find(x => String(x.ticker || '').toUpperCase() === tick);
    const varD = L ? varFundingDailyPct(L.funding_rate, L.funding_interval_s) : null;
    const hl = hlMap ? varHlMapLookup(hlMap, tick) : null;
    const hlD = hl ? hlFundingDailyPct(hl.fundingHr) : null;
    return { varD, hlD, diff: varD != null && hlD != null ? varD - hlD : null, listing: L };
  }

  async function varRefreshHlLeg() {
    if (!varHasWallets()) {
      if (typeof toast === 'function') toast(varT('var.noWallet'), true);
      return;
    }
    if (typeof loadData === 'function') {
      if (typeof toast === 'function') toast(varT('var.hlRefreshing'), false);
      await loadData();
    }
    renderVarHedge(true);
  }

  function renderVarHedge(previewOnly) {
    const saved = varLegLoad();
    const leg = varReadLegFromForm(false) || saved;
    const tickEl = document.getElementById('varLegTicker');
    const sideEl = document.getElementById('varLegSide');
    const notEl = document.getElementById('varLegNotional');
    const pxEl = document.getElementById('varLegEntry');
    if (saved && !previewOnly) {
      if (tickEl && !tickEl.matches(':focus')) tickEl.value = saved.ticker || '';
      if (sideEl) sideEl.value = saved.side || 'short';
      if (notEl && !notEl.matches(':focus')) notEl.value = saved.notional || '';
      if (pxEl && !pxEl.matches(':focus')) pxEl.value = saved.entryPx || '';
    }
    const sum = document.getElementById('varHedgeSummary');
    const statusEl = document.getElementById('varHedgeStatus');
    if (!sum) return;

    if (!varHasWallets()) {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--warning-brand)">${varT('var.noWallet')}</span>`;
    } else if (!varHlPositionsLoaded()) {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--muted)">${varT('var.hlLoadHint')}</span> <button type="button" class="btn btn-ghost text-xs" style="margin-left:6px;padding:4px 10px" onclick="varRefreshHlLeg()">${varT('var.refreshHl')}</button>`;
    } else if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--muted)">${varT('var.hlReady')}</span> <button type="button" class="btn btn-ghost text-xs" style="margin-left:6px;padding:4px 10px" onclick="varRefreshHlLeg()">${varT('var.refreshHl')}</button>`;
    }

    if (!leg) {
      sum.innerHTML = `<p style="color:var(--muted);font-size:.85rem;margin:0">${varT('var.hedgeEmpty')}</p>`;
      return;
    }

    const hlPos = varHlPositionForTicker(leg.ticker);
    const delta = varComputeDelta(leg, hlPos);
    const fund = varFundingForTicker(leg.ticker, _varListingsCache, _varHlFunding?.map);
    const suggested = varSuggestedHlSide(leg.side);
    const targetUsd = Math.abs(parseFloat(leg.notional || 0));
    const hlUsd = hlPos ? hlPos.notionalUsd : 0;
    const sizeGap = targetUsd > 0 ? Math.abs(targetUsd - hlUsd) / targetUsd * 100 : 0;
    const driftWarn = delta && delta.driftPct > 5;
    const sizeWarn = sizeGap > 15;
    const fundCls = fund.diff > 0 ? 'color:var(--success)' : fund.diff < 0 ? 'color:var(--danger)' : '';

    sum.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div class="card2 p3">
          <div class="kpi-label">${varT('var.cardOmni')}</div>
          <div class="kpi-val" style="font-size:1.05rem">${leg.side === 'short' ? varT('var.sideShort') : varT('var.sideLong')} · ${varFmtUsd(targetUsd)}</div>
          <div class="kpi-sub">${leg.ticker}${varHlCoinShort(leg.ticker) !== leg.ticker ? ' · HL ' + varHlCoinShort(leg.ticker) : ''}</div>
        </div>
        <div class="card2 p3">
          <div class="kpi-label">${varT('var.cardHl')}</div>
          <div class="kpi-val" style="font-size:1.05rem">${hlPos ? (hlPos.szi > 0 ? varT('var.sideLong') : varT('var.sideShort')) + ' · ' + varFmtUsd(hlUsd) : '—'}</div>
          <div class="kpi-sub">${hlPos ? hlPos.coin : varT('var.hlMissing')}</div>
        </div>
        <div class="card2 p3">
          <div class="kpi-label">${varT('var.cardNetDelta')}</div>
          <div class="kpi-val" style="font-size:1.05rem;color:${driftWarn ? 'var(--danger)' : 'var(--success)'}">${delta ? varFmtUsd(delta.net) : '—'}</div>
          <div class="kpi-sub">${delta ? varT('var.driftPct').replace('{pct}', delta.driftPct.toFixed(1)) : ''}</div>
        </div>
        <div class="card2 p3">
          <div class="kpi-label">${varT('var.cardFundingGap')}</div>
          <div class="kpi-val" style="font-size:1.05rem;${fundCls}">${fund.diff != null ? varFmtFundingDaily(fund.diff, true) : '—'}</div>
          <div class="kpi-sub">${fund.varD != null ? 'Omni ' + varFmtFundingDaily(fund.varD, true) : ''}${fund.hlD != null ? ' · HL ' + varFmtFundingDaily(fund.hlD, true) : ''}</div>
        </div>
      </div>
      <div class="card2 p3 mb-3" style="border-left:3px solid var(--var-accent,#4c9af8)">
        <div style="font-size:.78rem;font-weight:600;margin-bottom:6px">${varT('var.actionTitle')}</div>
        <p style="font-size:.8rem;color:var(--muted);margin:0 0 8px;line-height:1.45">${varT('var.actionBody')
          .replace('{hlSide}', suggested === 'long' ? varT('var.sideLong') : varT('var.sideShort'))
          .replace('{usd}', varFmtUsd(targetUsd))
          .replace('{ticker}', leg.ticker)
          .replace('{hlTicker}', varHlCoinShort(leg.ticker))}</p>
        ${!hlPos ? `<p style="font-size:.8rem;color:var(--warning-brand);margin:0">${varT('var.hlMissingHint')}</p>` : ''}
        ${hlPos && sizeWarn ? `<p style="font-size:.8rem;color:var(--warning-brand);margin:8px 0 0">${varT('var.sizeGapWarn').replace('{pct}', sizeGap.toFixed(0))}</p>` : ''}
        ${driftWarn ? `<p style="font-size:.8rem;color:var(--danger);margin:8px 0 0">${varT('var.driftWarn')}</p>` : (!sizeWarn && hlPos ? `<p style="font-size:.8rem;color:var(--muted);margin:8px 0 0">${varT('var.hedgeHint')}</p>` : '')}
      </div>`;
  }

  function varSaveLegFromForm() {
    const leg = varReadLegFromForm(true);
    if (!leg) {
      if (typeof toast === 'function') toast(varT('var.legInvalid'), true);
      return;
    }
    if (typeof toast === 'function') toast(varT('var.legSaved'));
    renderVarHedge(true);
  }

  function varTranslateSide(side) {
    const s = String(side || '').toLowerCase();
    if (s === 'buy' || s === 'long') return varT('var.sideLong');
    if (s === 'sell' || s === 'short') return varT('var.sideShort');
    return side || '—';
  }

  function varTranslateTransferType(tt) {
    const m = {
      deposit: 'var.typeDeposit',
      withdrawal: 'var.typeWithdrawal',
      realized_pnl: 'var.typePnl',
      funding: 'var.typeFunding',
      fee: 'var.typeFee',
      trade: 'var.typeTrade',
    };
    const key = m[String(tt || '').toLowerCase()];
    return key ? varT(key) : (tt || '—');
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
    const body = slice.map(ev => {
      const r = ev.row;
      if (ev.type === 'trade') {
        const px = parseFloat(r.price || 0);
        const qty = parseFloat(r.qty || 0);
        return `<tr>
          <td style="color:var(--muted)" class="mono">${r.created_at ? new Date(r.created_at).toLocaleString(varLoc()) : '—'}</td>
          <td>${varT('var.typeTrade')}</td>
          <td class="font-medium">${(r.underlying || '').toUpperCase()}</td>
          <td>${varTranslateSide(r.side)}</td>
          <td class="text-right mono">${varFmtUsd(px * qty)}</td>
        </tr>`;
      }
      return `<tr>
        <td style="color:var(--muted)" class="mono">${r.created_at ? new Date(r.created_at).toLocaleString(varLoc()) : '—'}</td>
        <td>${varTranslateTransferType(r.transfer_type || 'transfer')}</td>
        <td class="font-medium">${(r.underlying || r.asset || '').toUpperCase()}</td>
        <td>—</td>
        <td class="text-right mono">${varFmtUsd(parseFloat(r.qty || 0))}</td>
      </tr>`;
    }).join('');
    tbl.innerHTML = `<table class="hs-trades-table"><thead><tr>
      <th>${varT('var.colDate')}</th><th>${varT('var.colType')}</th><th>${varT('var.colAsset')}</th><th>${varT('var.colSide')}</th><th class="text-right">${varT('var.colUsd')}</th>
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
    try {
      const stats = await fetchVarStats(!!force);
      _varListingsCache = stats?.listings || [];
      varPopulateLegTickers(_varListingsCache);
      await fetchHlFundingMap();
    } catch (_) {}
    varBindLegForm();
    varSetSub(_varSub, null);
    if (force) _varStatsCache = null;
    if (_varSub === 'radar') await renderVarRadar();
    else if (_varSub === 'hedge') renderVarHedge(false);
    else renderVarActivity();
  }

  function varBindLegForm() {
    ['varLegTicker', 'varLegSide', 'varLegNotional', 'varLegEntry'].forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.dataset.varBound) return;
      el.dataset.varBound = '1';
      el.addEventListener('input', varScheduleLegPreview);
      el.addEventListener('change', varScheduleLegPreview);
    });
  }

  window.varRefreshHlLeg = varRefreshHlLeg;
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
