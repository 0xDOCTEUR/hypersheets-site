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

  const VAR_CAT_ORDER = ['crypto', 'stocks', 'commodities', 'indices', 'forex'];
  const VAR_CAT_COMMODITIES = new Set([
    'XAU', 'XAG', 'XPT', 'XPD', 'GOLD', 'SILVER', 'PLATINUM', 'PALLADIUM', 'PAXG', 'XAUT',
    'CL', 'BRENTOIL', 'NATGAS', 'COPPER', 'ALUM', 'ALUMINIUM', 'WHEAT', 'CORN', 'URANIUM', 'URNM', 'TTF',
  ]);
  const VAR_CAT_INDICES = new Set([
    'US500', 'SP500', 'SPX', 'NDX', 'QQQ', 'XYZ100', 'NIFTY', 'JP225', 'KR200', 'IBOV', 'SMH', 'VIX', 'VOL', 'DXY', 'EWJ', 'EWY', 'EWZ', 'XLE',
  ]);
  const VAR_CAT_FOREX = new Set(['EUR', 'GBP', 'JPY', 'KRW', 'CHF', 'AUD', 'CAD']);
  const VAR_CAT_STOCKS = new Set([
    'AAPL', 'NVDA', 'TSLA', 'MSFT', 'META', 'GOOGL', 'AMZN', 'COIN', 'PLTR', 'MSTR', 'MU', 'NFLX',
    'AMD', 'INTC', 'TSM', 'ARM', 'HOOD', 'HIMS', 'RKLB', 'CBRS', 'SPCX', 'LLY', 'CRCL', 'MRVL',
    'LITE', 'SNDK', 'SKHX', 'DRAM', 'NOK', 'QCOM', 'AVGO', 'BABA', 'GME', 'ORCL', 'AMAT', 'ASML',
    'BB', 'BE', 'BIRD', 'BOT', 'BX', 'COST', 'CRWV', 'DELL', 'DKNG', 'EBAY', 'H100', 'HYUNDAI',
    'IBM', 'KIOXIA', 'MINIMAX', 'NBIS', 'NOW', 'PURRDAT', 'QNT', 'RIVN', 'SMSN', 'SOFTBANK', 'STRC',
    'USAR', 'WDC', 'ZHIPU', 'ZM', 'RIVN', 'SMCI', 'RIVN',
  ]);
  Object.keys(VAR_HL_TICKER_ALIASES).forEach(k => {
    if (!VAR_CAT_INDICES.has(k) && !VAR_CAT_FOREX.has(k)) VAR_CAT_STOCKS.add(k);
  });

  function varAssetCategory(ticker) {
    const u = String(ticker || '').toUpperCase();
    const hl = varHlCoinShort(u);
    const test = (sym) => {
      if (VAR_CAT_COMMODITIES.has(sym)) return 'commodities';
      if (VAR_CAT_INDICES.has(sym)) return 'indices';
      if (VAR_CAT_FOREX.has(sym)) return 'forex';
      if (VAR_CAT_STOCKS.has(sym)) return 'stocks';
      return null;
    };
    return test(hl) || test(u) || 'crypto';
  }

  function varCatLabel(cat) {
    return varT('var.cat.' + cat) || cat;
  }

  function varCatBadge(cat) {
    const colors = {
      crypto: '#7c6cf0', stocks: '#4c9af8', commodities: '#d4a017', indices: '#2ecc71', forex: '#e67e22',
    };
    const c = colors[cat] || 'var(--muted)';
    return `<span style="display:inline-block;font-size:.65rem;font-weight:600;padding:1px 6px;border-radius:4px;background:${c}22;color:${c};margin-right:6px;vertical-align:middle">${varCatLabel(cat)}</span>`;
  }

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

  /** API : funding_rate = % par intervalle (ex. 0,08 = 0,08 % / intervalle). */
  function varFundingIntervalPct(rate) {
    const r = parseFloat(rate || 0);
    if (!isFinite(r)) return null;
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

  function varCsvEmptyBundle() {
    return { v: 2, trades: [], funding: [], realizedPnl: [], transfers: [], files: {} };
  }

  function varCsvNormalize(bundle) {
    if (!bundle) return null;
    if (bundle.v === 2) {
      return {
        v: 2,
        trades: bundle.trades || [],
        funding: bundle.funding || [],
        realizedPnl: bundle.realizedPnl || [],
        transfers: bundle.transfers || [],
        files: bundle.files || {},
      };
    }
    const funding = [];
    const realizedPnl = [];
    const transfers = [];
    for (const row of bundle.transfers || []) {
      const tt = (row.transfer_type || '').toLowerCase();
      if (tt === 'funding') funding.push(row);
      else if (tt === 'realized_pnl') realizedPnl.push(row);
      else transfers.push(row);
    }
    return {
      v: 2,
      trades: bundle.trades || [],
      funding,
      realizedPnl,
      transfers,
      files: {},
    };
  }

  function varCsvLoad() {
    try {
      const raw = JSON.parse(localStorage.getItem(HS_VAR_CSV_KEY) || 'null') || null;
      return varCsvNormalize(raw);
    } catch {
      return null;
    }
  }
  function varCsvSave(bundle) {
    try {
      localStorage.setItem(HS_VAR_CSV_KEY, JSON.stringify(bundle));
    } catch (_) {}
  }

  const VAR_CSV_KINDS = ['trades', 'funding', 'realizedPnl', 'transfers'];
  const VAR_CSV_KIND_I18N = {
    trades: 'var.csvKindTrades',
    funding: 'var.csvKindFunding',
    realizedPnl: 'var.csvKindPnl',
    transfers: 'var.csvKindTransfers',
  };

  function varDedupeRows(rows) {
    const seen = new Set();
    const out = [];
    for (const row of rows || []) {
      const id = row?.id;
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      out.push(row);
    }
    return out;
  }

  function varDetectCsvKind(objs, fileName) {
    if (!objs?.length) return null;
    const first = objs[0];
    const name = (fileName || '').toLowerCase();
    if (first.price != null && first.qty != null && (first.side || first.trade_type)) return 'trades';
    if (first.transfer_type) {
      const types = new Set(objs.map(r => String(r.transfer_type || '').toLowerCase()).filter(Boolean));
      if (types.size === 1) {
        const only = [...types][0];
        if (only === 'funding') return 'funding';
        if (only === 'realized_pnl') return 'realizedPnl';
        return 'transfers';
      }
      return 'mixed';
    }
    if (name.includes('trade')) return 'trades';
    if (name.includes('fund')) return 'funding';
    if (name.includes('pnl') || name.includes('realized')) return 'realizedPnl';
    if (name.includes('transfer') || name.includes('deposit') || name.includes('withdraw')) return 'transfers';
    return null;
  }

  function varSplitTransferRows(objs) {
    const funding = [];
    const realizedPnl = [];
    const transfers = [];
    for (const row of objs || []) {
      const tt = (row.transfer_type || '').toLowerCase();
      if (tt === 'funding') funding.push(row);
      else if (tt === 'realized_pnl') realizedPnl.push(row);
      else transfers.push(row);
    }
    return { funding, realizedPnl, transfers };
  }

  function varApplyCsvImport(bundle, kind, rows, fileName) {
    const next = varCsvNormalize(bundle) || varCsvEmptyBundle();
    const deduped = varDedupeRows(rows);
    const meta = { name: fileName || '', at: Date.now(), rows: deduped.length };
    if (kind === 'mixed') {
      const split = varSplitTransferRows(deduped);
      if (split.funding.length) {
        next.funding = split.funding;
        next.files.funding = { ...meta, rows: split.funding.length };
      }
      if (split.realizedPnl.length) {
        next.realizedPnl = split.realizedPnl;
        next.files.realizedPnl = { ...meta, rows: split.realizedPnl.length };
      }
      if (split.transfers.length) {
        next.transfers = split.transfers;
        next.files.transfers = { ...meta, rows: split.transfers.length };
      }
      return next;
    }
    next[kind] = deduped;
    next.files[kind] = meta;
    return next;
  }

  function varRenderCsvImportStatus(bundle) {
    const norm = varCsvNormalize(bundle);
    const slots = {
      trades: 'varCsvMetaTrades',
      funding: 'varCsvMetaFunding',
      realizedPnl: 'varCsvMetaPnl',
      transfers: 'varCsvMetaTransfers',
    };
    for (const kind of VAR_CSV_KINDS) {
      const el = document.getElementById(slots[kind]);
      const slot = document.querySelector(`.var-csv-slot[data-csv-kind="${kind}"]`);
      const meta = norm?.files?.[kind];
      const rows = norm?.[kind]?.length || 0;
      if (el) {
        el.innerHTML = meta?.name
          ? varT('var.csvMeta').replace('{rows}', String(meta.rows || rows)).replace('{file}', meta.name)
          : varT('var.csvNotImported');
      }
      if (slot) slot.classList.toggle('var-csv-slot--ok', !!(meta?.name || rows));
    }
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

  function aggregateVarCsv(bundle) {
    const b = varCsvNormalize(bundle);
    if (!b) return null;
    const agg = {
      tradeVol: 0, tradeCount: 0, funding: 0, realizedPnl: 0, fees: 0,
      deposits: 0, withdrawals: 0, lastAt: 0,
    };
    for (const row of b.trades || []) {
      if (row.status && row.status !== 'confirmed') continue;
      const px = parseFloat(row.price || 0);
      const qty = parseFloat(row.qty || 0);
      if (isFinite(px) && isFinite(qty)) agg.tradeVol += Math.abs(px * qty);
      agg.tradeCount++;
      const ts = Date.parse(row.created_at || 0);
      if (ts > agg.lastAt) agg.lastAt = ts;
    }
    for (const row of b.funding || []) {
      if (row.status && row.status !== 'confirmed') continue;
      agg.funding += parseFloat(row.qty || 0);
      const ts = Date.parse(row.created_at || 0);
      if (ts > agg.lastAt) agg.lastAt = ts;
    }
    for (const row of b.realizedPnl || []) {
      if (row.status && row.status !== 'confirmed') continue;
      agg.realizedPnl += parseFloat(row.qty || 0);
      const ts = Date.parse(row.created_at || 0);
      if (ts > agg.lastAt) agg.lastAt = ts;
    }
    for (const row of b.transfers || []) {
      if (row.status && row.status !== 'confirmed') continue;
      const qty = parseFloat(row.qty || 0);
      const tt = (row.transfer_type || '').toLowerCase();
      if (tt === 'fee') agg.fees += Math.abs(qty);
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

  function varRadarSort(listings, mode, noSlice) {
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
    return noSlice ? rows : rows.slice(0, 60);
  }

  function varRadarFilterCategory(rows, catFilter) {
    if (!catFilter || catFilter === 'all') return rows;
    return rows.filter(L => varAssetCategory(L.ticker) === catFilter);
  }

  function varRadarGroupByCategory(rows, perCat) {
    const groups = {};
    VAR_CAT_ORDER.forEach(c => { groups[c] = []; });
    rows.forEach(L => {
      const c = varAssetCategory(L.ticker);
      if (groups[c]) groups[c].push(L);
    });
    const out = [];
    VAR_CAT_ORDER.forEach(c => {
      const slice = groups[c].slice(0, perCat || 12);
      if (slice.length) out.push({ cat: c, rows: slice });
    });
    return out;
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

  function varFmtSetupShort(rec, ticker) {
    if (!rec) return '—';
    const omni = rec.omniSide === 'short' ? varT('var.sideShort') : varT('var.sideLong');
    const hl = rec.hlSide === 'short' ? varT('var.sideShort') : varT('var.sideLong');
    const hlTick = varHlCoinShort(ticker);
    return `${omni} Omni · ${hl} HL (${hlTick})`;
  }

  function varRadarIntroHtml(mode) {
    const key = mode === 'compare' ? 'var.radarIntroCompare' : mode === 'spread' ? 'var.radarIntroSpread' : mode === 'volume' ? 'var.radarIntroVolume' : 'var.radarIntroFunding';
    return `<div class="card2 p3 mb-2" style="border-left:3px solid var(--var-accent,#4c9af8);margin:8px 0 10px">
      <div style="font-size:.78rem;font-weight:600;margin-bottom:4px">${varT('var.radarIntroTitle')}</div>
      <p style="font-size:.8rem;color:var(--muted);margin:0;line-height:1.5">${varT(key)}</p>
    </div>`;
  }

  function varThHint(label, hint) {
    return `<span title="${hint}">${label}</span>`;
  }

  function varFundingWhoPays(pct) {
    if (pct == null || !isFinite(pct) || Math.abs(pct) < 0.001) return varT('var.fundingFlat');
    return pct > 0 ? varT('var.fundingLongsPay') : varT('var.fundingShortsPay');
  }

  function varRadarListingRow(L, mode, hlMap) {
    const tick = String(L.ticker || '').toUpperCase();
    const cat = varAssetCategory(tick);
    const mark = parseFloat(L.mark_price || 0);
    const vol = parseFloat(L.volume_24h || 0);
    const varD = varFundingDailyPct(L.funding_rate, L.funding_interval_s);
    const hl = varHlMapLookup(hlMap, tick);
    const hlD = hl ? hlFundingDailyPct(hl.fundingHr) : null;
    const assetCell = `${varCatBadge(cat)}<span class="font-medium" title="${varHlCoinShort(tick)}">${varHlAssetLabel(tick)}</span>`;
    if (mode === 'funding') {
      const rec = hlD != null && varD != null ? varRecommendSides(tick, [L], hlMap) : null;
      const net = rec ? rec.netDaily : null;
      const diffCls = net > 0 ? 'color:var(--success)' : net < 0 ? 'color:var(--danger)' : '';
      const setup = rec
        ? `<span style="font-size:.78rem;line-height:1.35">${varFmtSetupShort(rec, tick)}</span>`
        : `<span style="font-size:.78rem;color:var(--muted)">${varT('var.hlNa')}</span>`;
      return `<tr>
        <td>${assetCell}</td>
        <td>${setup}</td>
        <td class="text-right mono" title="${varFundingWhoPays(varD)}">${varD != null ? varFmtFundingDaily(varD, true) : '—'}</td>
        <td class="text-right mono" title="${hlD != null ? varFundingWhoPays(hlD) : ''}">${hlD != null ? varFmtFundingDaily(hlD, true) : varT('var.hlNa')}</td>
        <td class="text-right mono" style="${diffCls}" title="${varT('var.colNetFundingHint')}">${net != null ? varFmtFundingDaily(net, true) : '—'}</td>
        <td class="text-right mono">${varFmtVol(vol)}</td>
      </tr>`;
    }
    let cells = `<td>${assetCell}</td><td class="text-right mono">${mark > 0 ? varFmtMark(mark) : '—'}</td>`;
    if (mode === 'spread') {
      cells += `<td class="text-right mono">${parseFloat(L.base_spread_bps || 0).toFixed(1)}</td>`;
      cells += `<td class="text-right mono">${varFmtVol(vol)}</td>`;
    } else {
      cells += `<td class="text-right mono">${varFmtVol(vol)}</td>`;
      cells += `<td class="text-right mono">${varD != null ? varFmtFundingDaily(varD, true) : '—'}</td>`;
    }
    return `<tr>${cells}</tr>`;
  }

  function varRadarSectionRow(cat, colSpan) {
    return `<tr class="var-radar-cat-row"><td colspan="${colSpan}" style="background:var(--surface-2);font-weight:600;font-size:.75rem;padding:8px 12px;color:var(--text);border-top:1px solid var(--border)">${varCatLabel(cat)}</td></tr>`;
  }

  function varRadarTableHtml(rows, mode, hlMap, catFilter) {
    if (!rows.length) {
      return `<div class="text-center text-sm py-10" style="color:var(--muted)">${varT('var.noData')}</div>`;
    }
    const colSpan = mode === 'funding' ? 6 : (mode === 'spread' ? 4 : 4);
    let head = `<tr><th>${varT('var.colAsset')}</th>`;
    if (mode === 'funding') {
      head += `<th>${varT('var.colSetup')}</th>`;
      head += `<th class="text-right">${varThHint(varT('var.colFundingOmni'), varT('var.colFundingOmniHint'))}</th>`;
      head += `<th class="text-right">${varThHint(varT('var.colFundingHl'), varT('var.colFundingHlHint'))}</th>`;
      head += `<th class="text-right">${varThHint(varT('var.colNetFunding'), varT('var.colNetFundingHint'))}</th>`;
      head += `<th class="text-right">${varT('var.colVol24h')}</th>`;
    } else {
      head += `<th class="text-right">${varT('var.colMark')}</th>`;
      if (mode === 'spread') {
        head += `<th class="text-right">${varT('var.colSpread')}</th><th class="text-right">${varT('var.colVol24h')}</th>`;
      } else {
        head += `<th class="text-right">${varT('var.colVol24h')}</th><th class="text-right">${varT('var.colFundingOmni')}</th>`;
      }
    }
    head += '</tr>';
    let body = '';
    if (!catFilter || catFilter === 'all') {
      varRadarGroupByCategory(rows, 15).forEach(g => {
        body += varRadarSectionRow(g.cat, colSpan);
        body += g.rows.map(L => varRadarListingRow(L, mode, hlMap)).join('');
      });
    } else {
      body = rows.slice(0, 60).map(L => varRadarListingRow(L, mode, hlMap)).join('');
    }
    const hintKey = mode === 'funding' ? 'var.radarHintFunding' : mode === 'spread' ? 'var.radarHintSpread' : 'var.radarHintVolume';
    return `${varRadarIntroHtml(mode)}<p class="text-xs" style="color:var(--muted);padding:0 0 6px;margin:0">${varT(hintKey)}</p><table class="hs-trades-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  async function renderVarRadar() {
    const host = document.getElementById('varRadarTable');
    const modeSel = document.getElementById('varRadarSort');
    const catSel = document.getElementById('varRadarCat');
    if (!host) return;
    const mode = modeSel?.value || 'funding';
    const catFilter = catSel?.value || 'all';
    host.innerHTML = `<div class="text-center text-sm py-10" style="color:var(--muted)">${varT('loading')}</div>`;
    try {
      const [stats, hlMap] = await Promise.all([fetchVarStats(false), fetchHlFundingMap()]);
      await renderVarPlatformKpis(stats);
      const listings = stats?.listings || [];
      _varListingsCache = listings;
      varPopulateLegTickers(listings);
      if (mode === 'compare') {
        let rows = varCompareRows(listings, hlMap, 50000);
        rows = catFilter === 'all' ? rows : rows.filter(r => varAssetCategory(r.ticker) === catFilter);
        host.innerHTML = varCompareTableHtml(rows, catFilter);
      } else {
        let list = listings;
        if (mode === 'funding') {
          list = listings.filter(L => varHlMapLookup(hlMap, L.ticker) && parseFloat(L.volume_24h || 0) >= 25000);
        }
        let rows = varRadarSort(list, mode, true);
        rows = varRadarFilterCategory(rows, catFilter);
        host.innerHTML = varRadarTableHtml(rows, mode, hlMap, catFilter);
      }
      const ts = document.getElementById('varRadarUpdated');
      if (ts) ts.textContent = new Date().toLocaleTimeString(varLoc());
    } catch (e) {
      host.innerHTML = `<div class="text-center text-sm py-10" style="color:var(--danger)">${varT('var.apiError')}: ${e.message}</div>`;
    }
  }

  function varCompareTableHtml(rows, catFilter) {
    if (!rows.length) return `<div class="text-center text-sm py-10" style="color:var(--muted)">${varT('var.noCompare')}</div>`;
    const colSpan = 6;
    let body = '';
    const renderCompareRow = (r) => {
      const net = Math.abs(r.diff);
      const cls = r.diff >= 0 ? 'color:var(--success)' : 'color:var(--danger)';
      const fakeRec = {
        omniSide: r.diff >= 0 ? 'short' : 'long',
        hlSide: r.diff >= 0 ? 'long' : 'short',
      };
      const cat = varAssetCategory(r.ticker);
      return `<tr>
        <td>${varCatBadge(cat)}<span class="font-medium" title="${varHlCoinShort(r.ticker)}">${varHlAssetLabel(r.ticker)}</span></td>
        <td><span style="font-size:.78rem;line-height:1.35">${varFmtSetupShort(fakeRec, r.ticker)}</span></td>
        <td class="text-right mono">${varFmtFundingDaily(r.varDaily, true)}</td>
        <td class="text-right mono">${varFmtFundingDaily(r.hlDaily, true)}</td>
        <td class="text-right mono" style="${cls}">${varFmtFundingDaily(net, true)}</td>
        <td class="text-right mono">${varFmtVol(r.vol)}</td>
      </tr>`;
    };
    if (!catFilter || catFilter === 'all') {
      const groups = {};
      VAR_CAT_ORDER.forEach(c => { groups[c] = []; });
      rows.forEach(r => { const c = varAssetCategory(r.ticker); if (groups[c]) groups[c].push(r); });
      VAR_CAT_ORDER.forEach(c => {
        const slice = groups[c].slice(0, 15);
        if (!slice.length) return;
        body += varRadarSectionRow(c, colSpan);
        body += slice.map(renderCompareRow).join('');
      });
    } else {
      body = rows.slice(0, 40).map(renderCompareRow).join('');
    }
    return `${varRadarIntroHtml('compare')}<p class="text-xs" style="color:var(--muted);padding:0 0 6px;margin:0">${varT('var.compareHint')}</p><table class="hs-trades-table"><thead><tr>
      <th>${varT('var.colAsset')}</th>
      <th>${varT('var.colSetup')}</th>
      <th class="text-right">${varThHint(varT('var.colFundingOmni'), varT('var.colFundingOmniHint'))}</th>
      <th class="text-right">${varThHint(varT('var.colFundingHl'), varT('var.colFundingHlHint'))}</th>
      <th class="text-right">${varThHint(varT('var.colNetFunding'), varT('var.colNetFundingHint'))}</th>
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

  function varRecommendSides(ticker, listings, hlMap) {
    const fund = varFundingForTicker(ticker, listings, hlMap);
    const { varD, hlD } = fund;
    if (varD == null || hlD == null) return null;
    const diff = varD - hlD;
    if (diff >= 0) {
      return { omniSide: 'short', hlSide: 'long', netDaily: diff, varD, hlD };
    }
    return { omniSide: 'long', hlSide: 'short', netDaily: -diff, varD, hlD };
  }

  function varApplyRecommendSide() {
    const tick = (document.getElementById('varLegTicker')?.value || '').trim().toUpperCase();
    const rec = varRecommendSides(tick, _varListingsCache, _varHlFunding?.map);
    if (!rec) return;
    const sideEl = document.getElementById('varLegSide');
    if (sideEl) sideEl.value = rec.omniSide;
    renderVarHedge(true);
  }

  function varSidePill(side) {
    const isLong = side === 'long';
    return `<span class="var-hedge-pill ${isLong ? 'var-hedge-pill-long' : 'var-hedge-pill-short'}">${isLong ? varT('var.sideLong') : varT('var.sideShort')}</span>`;
  }

  function varDriftBar(pct) {
    const w = Math.min(100, Math.max(0, parseFloat(pct) || 0));
    const ok = w <= 5;
    return `<div class="var-hedge-drift-track" title="${varT('var.driftPct').replace('{pct}', w.toFixed(1))}"><div class="var-hedge-drift-fill" style="width:${w}%;background:${ok ? 'var(--success)' : 'var(--danger)'}"></div></div>`;
  }

  function varRenderHedgeRec(ticker, legSide) {
    const host = document.getElementById('varHedgeRec');
    if (!host) return;
    const tick = String(ticker || '').trim().toUpperCase();
    if (!tick) {
      host.innerHTML = '';
      return;
    }
    const rec = varRecommendSides(tick, _varListingsCache, _varHlFunding?.map);
    if (!rec) {
      host.innerHTML = `<div class="var-hedge-rec-card muted"><div class="var-hedge-rec-title" style="color:var(--muted)">${varT('var.recTitle')}</div><p style="font-size:.8rem;color:var(--muted);margin:0">${varT('var.recNoData')}</p></div>`;
      return;
    }
    const hlTick = varHlCoinShort(tick);
    const netLbl = varFmtFundingDaily(rec.netDaily, true);
    const omniLbl = rec.omniSide === 'short' ? varT('var.sideShort') : varT('var.sideLong');
    const hlLbl = rec.hlSide === 'short' ? varT('var.sideShort') : varT('var.sideLong');
    const mismatch = legSide && legSide !== rec.omniSide;
    host.innerHTML = `
      <div class="var-hedge-rec-card${mismatch ? '' : ''}">
        <div class="var-hedge-rec-title">${varT('var.recTitle')}</div>
        <div class="var-hedge-rec-bridge">
          ${varSidePill(rec.omniSide)} <strong>${tick}</strong>
          <span class="var-hedge-rec-arrow">↔</span>
          ${varSidePill(rec.hlSide)} <strong>${hlTick}</strong>
        </div>
        <p style="font-size:.8rem;color:var(--muted);margin:0 0 8px;line-height:1.45">${varT('var.recNetLine').replace('{net}', netLbl)}</p>
        <p style="font-size:.72rem;color:var(--muted);margin:0 0 10px">Omni ${varFmtFundingDaily(rec.varD, true)} · HL ${varFmtFundingDaily(rec.hlD, true)}</p>
        ${mismatch ? `<p style="font-size:.76rem;color:var(--warning-brand);margin:0 0 10px">${varT('var.recMismatch').replace('{net}', netLbl)}</p>` : ''}
        <button type="button" class="btn btn-ghost text-xs" style="padding:4px 12px" onclick="varApplyRecommendSide()">${varT('var.recApply')}</button>
      </div>`;
  }

  function varSuggestedHlSide(omniSide) {
    return omniSide === 'short' ? 'long' : 'short';
  }

  function varFundingLegDailyPct(side, rateDaily) {
    if (rateDaily == null || !isFinite(rateDaily)) return null;
    return side === 'long' ? -rateDaily : rateDaily;
  }

  function varFundingNetForSides(omniSide, hlSide, varD, hlD) {
    const o = varFundingLegDailyPct(omniSide, varD);
    const h = varFundingLegDailyPct(hlSide, hlD);
    if (o == null || h == null) return null;
    return o + h;
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
    const tickPreview = (document.getElementById('varLegTicker')?.value || '').trim().toUpperCase();
    const sidePreview = document.getElementById('varLegSide')?.value;
    varRenderHedgeRec(tickPreview || leg?.ticker, leg?.side || sidePreview);
    if (!sum) return;

    if (!varHasWallets()) {
      if (statusEl) statusEl.innerHTML = `<span class="var-hedge-status-pill warn">${varT('var.noWallet')}</span>`;
    } else if (!varHlPositionsLoaded()) {
      if (statusEl) statusEl.innerHTML = `<span class="var-hedge-status-pill warn">${varT('var.hlLoadHint')}</span> <button type="button" class="btn btn-ghost text-xs" style="margin-left:6px;padding:4px 10px" onclick="varRefreshHlLeg()">${varT('var.refreshHl')}</button>`;
    } else if (statusEl) {
      statusEl.innerHTML = `<span class="var-hedge-status-pill ok">✓ ${varT('var.hlReady')}</span> <button type="button" class="btn btn-ghost text-xs" style="margin-left:6px;padding:4px 10px" onclick="varRefreshHlLeg()">${varT('var.refreshHl')}</button>`;
    }

    if (!leg) {
      sum.innerHTML = `<div class="card2 p3" style="text-align:center;padding:32px 16px"><p style="color:var(--muted);font-size:.88rem;margin:0;line-height:1.5">${varT('var.hedgeEmpty')}</p></div>`;
      return;
    }

    const hlPos = varHlPositionForTicker(leg.ticker);
    const delta = varComputeDelta(leg, hlPos);
    const fund = varFundingForTicker(leg.ticker, _varListingsCache, _varHlFunding?.map);
    const suggested = varSuggestedHlSide(leg.side);
    const hlSideActual = hlPos ? (hlPos.szi > 0 ? 'long' : 'short') : suggested;
    const fundNet = varFundingNetForSides(leg.side, hlSideActual, fund.varD, fund.hlD);
    const targetUsd = Math.abs(parseFloat(leg.notional || 0));
    const hlUsd = hlPos ? hlPos.notionalUsd : 0;
    const fundBaseUsd = hlPos ? (targetUsd + hlUsd) / 2 : targetUsd;
    const fundUsdDay = fundNet != null && fundBaseUsd > 0 ? fundBaseUsd * fundNet / 100 : null;
    const sizeGap = targetUsd > 0 ? Math.abs(targetUsd - hlUsd) / targetUsd * 100 : 0;
    const driftWarn = delta && delta.driftPct > 5;
    const sizeWarn = sizeGap > 15;
    const fundCls = fundNet > 0 ? 'color:var(--success)' : fundNet < 0 ? 'color:var(--danger)' : '';
    const omniFundLeg = varFundingLegDailyPct(leg.side, fund.varD);
    const hlFundLeg = varFundingLegDailyPct(hlSideActual, fund.hlD);

    const fundUsdMonth = fundUsdDay != null ? fundUsdDay * 30 : null;
    const omniSideLbl = leg.side === 'short' ? varT('var.sideShort') : varT('var.sideLong');
    const hlSideLbl = hlPos ? (hlPos.szi > 0 ? varT('var.sideLong') : varT('var.sideShort')) : (suggested === 'long' ? varT('var.sideLong') : varT('var.sideShort'));

    sum.innerHTML = `
      <p class="var-hedge-split-title" data-i18n="var.hedgeResultTitle">${varT('var.hedgeResultTitle')}</p>
      <div class="var-hedge-bridge">
        <div class="var-hedge-leg var-hedge-leg--omni">
          <div class="var-hedge-leg-label">Variational Omni</div>
          <div class="var-hedge-leg-val">${varSidePill(leg.side)} ${varFmtUsd(targetUsd)}</div>
          <div class="var-hedge-leg-sub"><strong>${leg.ticker}</strong>${varHlCoinShort(leg.ticker) !== leg.ticker ? ' → HL ' + varHlCoinShort(leg.ticker) : ''}</div>
        </div>
        <div class="var-hedge-bridge-mid">↔<span>delta</span></div>
        <div class="var-hedge-leg var-hedge-leg--hl">
          <div class="var-hedge-leg-label">Hyperliquid</div>
          <div class="var-hedge-leg-val">${hlPos ? varSidePill(hlSideActual) + ' ' + varFmtUsd(hlUsd) : '—'}</div>
          <div class="var-hedge-leg-sub">${hlPos ? hlPos.coin : varT('var.hlMissing')}</div>
        </div>
      </div>
      <div class="var-hedge-hero">
        <div class="var-hedge-hero-label">${varT('var.cardFundingEarn')}</div>
        <div class="var-hedge-hero-val" style="${fundCls}">${fundNet != null ? varFmtFundingDaily(fundNet, true) : '—'}</div>
        <div class="var-hedge-hero-sub">${fundUsdDay != null ? varT('var.fundingUsdDay').replace('{usd}', varFmtUsd(fundUsdDay)).replace('{size}', varFmtUsd(fundBaseUsd)) : ''}${fundUsdMonth != null ? ' · ' + varT('var.fundingUsdMonth').replace('{usd}', varFmtUsd(fundUsdMonth)) : ''}</div>
      </div>
      <div class="var-hedge-metrics">
        <div class="var-hedge-metric">
          <div class="var-hedge-metric-label">${varT('var.cardNetDelta')}</div>
          <div class="var-hedge-metric-val" style="color:${driftWarn ? 'var(--danger)' : 'var(--success)'}">${delta ? varFmtUsd(delta.net) : '—'}</div>
          ${delta ? varDriftBar(delta.driftPct) : ''}
          <div style="font-size:.68rem;color:var(--muted);margin-top:4px">${delta ? varT('var.earnDeltaShort') : ''}</div>
        </div>
        <div class="var-hedge-metric">
          <div class="var-hedge-metric-label">${varT('var.sizeMatch')}</div>
          <div class="var-hedge-metric-val" style="color:${sizeWarn ? 'var(--warning-brand)' : 'var(--success)'}">${hlPos ? (100 - sizeGap).toFixed(0) + '%' : '—'}</div>
          <div style="font-size:.68rem;color:var(--muted);margin-top:4px">${hlPos ? varFmtUsd(targetUsd) + ' / ' + varFmtUsd(hlUsd) : varT('var.hlMissing')}</div>
        </div>
      </div>
      <div class="var-hedge-action-card mb-3">
        <div class="var-hedge-action-title">${varT('var.actionTitle')}</div>
        <p style="font-size:.82rem;color:var(--text);margin:0 0 8px;line-height:1.5">${varT('var.actionBody')
          .replace('{hlSide}', suggested === 'long' ? varT('var.sideLong') : varT('var.sideShort'))
          .replace('{usd}', varFmtUsd(targetUsd))
          .replace('{ticker}', leg.ticker)
          .replace('{hlTicker}', varHlCoinShort(leg.ticker))}</p>
        ${!hlPos ? `<p style="font-size:.78rem;color:var(--warning-brand);margin:0">${varT('var.hlMissingHint')}</p>` : ''}
        ${hlPos && sizeWarn ? `<p style="font-size:.78rem;color:var(--warning-brand);margin:8px 0 0">${varT('var.sizeGapWarn').replace('{pct}', sizeGap.toFixed(0))}</p>` : ''}
        ${driftWarn ? `<p style="font-size:.78rem;color:var(--danger);margin:8px 0 0">${varT('var.driftWarn')}</p>` : (!sizeWarn && hlPos ? `<p style="font-size:.78rem;color:var(--muted);margin:8px 0 0">${varT('var.hedgeHint')}</p>` : '')}
      </div>
      <div class="card2 p3" style="border-radius:12px">
        <div style="font-size:.75rem;font-weight:600;margin-bottom:4px">${varT('var.earnTitle')}</div>
        <p style="font-size:.76rem;color:var(--muted);margin:0 0 10px;line-height:1.45">${varT('var.earnExplain')}</p>
        <div class="var-hedge-earn-grid">
          <div class="var-hedge-earn-item"><span>${varT('var.earnPrice')}</span><strong style="color:${driftWarn ? 'var(--danger)' : 'var(--success)'}">${delta ? varFmtUsd(delta.net) : '—'}</strong></div>
          <div class="var-hedge-earn-item"><span>Omni ${omniSideLbl}</span><strong>${omniFundLeg != null ? varFmtFundingDaily(omniFundLeg, true) : '—'}</strong></div>
          <div class="var-hedge-earn-item"><span>HL ${hlSideLbl}</span><strong>${hlFundLeg != null ? varFmtFundingDaily(hlFundLeg, true) : '—'}</strong></div>
        </div>
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
    varRenderCsvImportStatus(bundle);
    const agg = bundle ? aggregateVarCsv(bundle) : null;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    if (!agg || (!bundle.trades?.length && !bundle.funding?.length && !bundle.realizedPnl?.length && !bundle.transfers?.length)) {
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
    (bundle.funding || []).forEach(r => {
      events.push({ t: Date.parse(r.created_at || 0), type: 'funding', row: r });
    });
    (bundle.realizedPnl || []).forEach(r => {
      events.push({ t: Date.parse(r.created_at || 0), type: 'realizedPnl', row: r });
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
      const tt = ev.type === 'funding' ? 'funding' : ev.type === 'realizedPnl' ? 'realized_pnl' : (r.transfer_type || 'transfer');
      return `<tr>
        <td style="color:var(--muted)" class="mono">${r.created_at ? new Date(r.created_at).toLocaleString(varLoc()) : '—'}</td>
        <td>${varTranslateTransferType(tt)}</td>
        <td class="font-medium">${(r.underlying || r.asset || '').toUpperCase()}</td>
        <td>—</td>
        <td class="text-right mono">${varFmtUsd(parseFloat(r.qty || 0))}</td>
      </tr>`;
    }).join('');
    tbl.innerHTML = `<table class="hs-trades-table"><thead><tr>
      <th>${varT('var.colDate')}</th><th>${varT('var.colType')}</th><th>${varT('var.colAsset')}</th><th>${varT('var.colSide')}</th><th class="text-right">${varT('var.colUsd')}</th>
    </tr></thead><tbody>${body}</tbody></table>`;
  }

  function varImportCsvFiles(input, forcedKind) {
    const files = input?.files;
    if (!files?.length) return;
    let bundle = varCsvLoad() || varCsvEmptyBundle();
    let pending = files.length;
    let hadError = false;
    const importedKinds = new Set();
    const onDone = () => {
      pending--;
      if (pending > 0) return;
      varCsvSave(bundle);
      if (typeof toast === 'function') {
        if (hadError) toast(varT('var.csvUnknown'), true);
        else if (importedKinds.size === 1) {
          const k = [...importedKinds][0];
          toast(varT('var.csvImportedKind').replace('{kind}', varT(VAR_CSV_KIND_I18N[k] || k)));
        } else toast(varT('var.csvImported'));
      }
      renderVarActivity();
      input.value = '';
    };
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const matrix = parseCsvText(reader.result);
          const objs = csvRowsToObjects(matrix);
          let kind = forcedKind || varDetectCsvKind(objs, file.name);
          if (!kind) {
            hadError = true;
          } else {
            bundle = varApplyCsvImport(bundle, kind, objs, file.name);
            if (kind === 'mixed') {
              ['funding', 'realizedPnl', 'transfers'].forEach(k => { if (bundle[k]?.length) importedKinds.add(k); });
            } else {
              importedKinds.add(kind);
            }
          }
        } catch (_) {
          hadError = true;
        }
        onDone();
      };
      reader.readAsText(file);
    }
  }

  function varClearCsvKind(kind) {
    const bundle = varCsvLoad() || varCsvEmptyBundle();
    if (!VAR_CSV_KINDS.includes(kind)) return;
    bundle[kind] = [];
    if (bundle.files) delete bundle.files[kind];
    const empty = !VAR_CSV_KINDS.some(k => (bundle[k] || []).length);
    if (empty) {
      try { localStorage.removeItem(HS_VAR_CSV_KEY); } catch (_) {}
    } else {
      varCsvSave(bundle);
    }
    if (typeof toast === 'function') {
      toast(varT('var.csvClearedKind').replace('{kind}', varT(VAR_CSV_KIND_I18N[kind] || kind)));
    }
    renderVarActivity();
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
  window.varApplyRecommendSide = varApplyRecommendSide;
  window.varSetSub = varSetSub;
  window.renderVarRadar = renderVarRadar;
  window.renderVarHedge = renderVarHedge;
  window.renderVarActivity = renderVarActivity;
  window.varSaveLegFromForm = varSaveLegFromForm;
  window.varLegClear = function () { varLegClear(); renderVarHedge(); if (typeof toast === 'function') toast(varT('var.legCleared')); };
  window.varImportCsvFiles = varImportCsvFiles;
  window.varClearCsv = varClearCsv;
  window.varClearCsvKind = varClearCsvKind;
  window.initVarPage = initVarPage;
})();
