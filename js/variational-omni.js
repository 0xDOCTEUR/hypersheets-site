/**
 * Hypersheets — Variational Omni (radar, delta-neutral, activity/points JSON, airdrop)
 * API publique: GET /metadata/stats
 */
(function () {
  'use strict';

  const VAR_API_BASE = 'https://omni-client-api.prod.ap-northeast-1.variational.io';
  const HS_VAR_LEG_KEY = 'hs-var-manual-leg';
  const HS_VAR_CSV_KEY = 'hs-var-csv-bundle';
  const HS_VAR_POINTS_KEY = 'hs-var-points-export';
  const HS_VAR_POSITIONS_KEY = 'hs-var-omni-positions';
  const HS_VAR_ACCOUNTS_KEY = 'hs-var-omni-accounts';
  const HS_VAR_AIRDROP_KEY = 'hs-var-airdrop-assumptions';
  const VAR_OMNI_MIN_SLOTS = 2;
  const VAR_OMNI_MAX_SLOTS = 8;
  const VAR_OMNI_SLOT_DEFAULT_LABELS = { a: 'Omni 1', b: 'Omni 2' };
  const HS_VAR_DASH_PERIOD_KEY = 'hs-var-dash-period';
  const HS_VAR_FUND_HIST_KEY = 'hs-var-fund-hist';
  const HS_VAR_RADAR_SIZE_KEY = 'hs-var-radar-size';
  const HS_VAR_RADAR_HOLD_KEY = 'hs-var-radar-hold';
  const HS_VAR_RADAR_TAKER_KEY = 'hs-var-radar-hl-taker';
  const VAR_AIRDROP_DEFAULTS = { fdvM: 1000, sharePct: 27.5, totalPtsM: 9.3 };
  const VAR_AIRDROP_FDV_SCENARIOS_M = [100, 250, 500, 750, 1000, 1500, 2000];
  const VAR_AIRDROP_COST_TARGETS = [1000, 10000, 100000];
  const VAR_OMNI_EXPORT_FORMATS = ['variational-dashboard-export', 'variational-points-export'];
  /** Public /metadata/stats is CDN-cached ~30–60s; keep client cache short for live marks. */
  const VAR_STATS_CACHE_MS = 12 * 1000;
  const VAR_FUND_HIST_MS = 48 * 60 * 60 * 1000;
  const VAR_FUND_HIST_MIN_PTS = 8;
  const VAR_EXTREME_TRADFI_DAILY = 0.5;
  /** Taux horaire plancher fréquent sur HIP-3 xyz (≈ +5.5% APR). */
  const VAR_HL_FUNDING_FLOOR_HR = 0.00000625;
  const VAR_QUOTE_TIERS = [
    { size: 1000, key: 'size_1k' },
    { size: 100000, key: 'size_100k' },
    { size: 1000000, key: 'size_1m' },
  ];
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
  let _varSub = 'dashboard';
  let _varPointsView = 'points';
  let _varEpochExpanded = new Set();
  let _varEpochMarketsOpen = new Set();
  let _varEpochUiBound = false;
  let _varEpochDidInitExpand = false;
  let _varLabModel = 'rwa-9';
  let _varDashStacked = false;

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
    const tries = [];
    try {
      const cfgProxy = typeof HS_CONFIG !== 'undefined' && HS_CONFIG.variationalProxyUrl;
      if (cfgProxy) tries.push(cfgProxy + encodeURIComponent(url));
      // Local preview: same-origin proxy avoids browser/extension blocks on Omni CDN.
      if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname)) {
        if (/\/metadata\/stats/i.test(url)) tries.push('/api/variational/stats');
        tries.push('/api/variational/proxy?url=' + encodeURIComponent(url));
      }
    } catch (_) {}
    tries.push(url);
    let lastErr = null;
    for (const u of tries) {
      try {
        const res = await fetch(u, {
          cache: 'no-store',
          headers: { accept: 'application/json', 'cache-control': 'no-cache', pragma: 'no-cache' },
        });
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
    // Cache-bust CDN (API returns max-age=30 / s-maxage=60).
    const data = await varFetchJson(VAR_API_BASE + '/metadata/stats?_hs=' + Date.now());
    _varStatsCache = data;
    _varStatsTime = Date.now();
    return data;
  }

  async function fetchHlFundingMap(force) {
    if (!force && _varHlFunding && Date.now() - _varHlFunding.ts < VAR_STATS_CACHE_MS) {
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
        if (mark > 0) map[name.toUpperCase()] = { coin: name, markPx: mark, fundingHr: fund, growthMode: false };
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
          const entry = { coin: name, markPx: mark, fundingHr: fund, growthMode: u?.growthMode === 'enabled' };
          map[short] = entry;
          map[name.toUpperCase()] = entry;
        });
      }
    } catch (_) {}
    _varHlFunding = { map, ts: Date.now() };
    return map;
  }

  let _varHlSpreadCache = null;

  function varHlLevelSz(lv) {
    const sz = parseFloat(lv?.sz ?? lv?.[1] ?? 0);
    return isFinite(sz) && sz > 0 ? sz : 0;
  }

  function varHlLevelPx(lv) {
    const px = parseFloat(lv?.px ?? lv?.[0] ?? 0);
    return isFinite(px) && px > 0 ? px : null;
  }

  function varParseHlL2Book(msg) {
    if (!msg || msg.error) return null;
    let levels = msg.levels;
    if (!levels && Array.isArray(msg) && msg.length >= 2 && Array.isArray(msg[0])) levels = msg;
    if (!Array.isArray(levels) || levels.length < 2) return null;
    const bids = (levels[0] || []).filter(lv => varHlLevelPx(lv) && varHlLevelSz(lv));
    const asks = (levels[1] || []).filter(lv => varHlLevelPx(lv) && varHlLevelSz(lv));
    if (!bids.length || !asks.length) return null;
    const bid = varHlLevelPx(bids[0]);
    const ask = varHlLevelPx(asks[0]);
    if (!bid || !ask || ask < bid) return null;
    const mid = (bid + ask) / 2;
    return { bids, asks, bid, ask, mid, topBps: (ask - bid) / mid * 10000 };
  }

  function varHlWalkSide(levels, notionalUsd) {
    let filledUsd = 0;
    let qty = 0;
    for (const lv of levels || []) {
      const px = varHlLevelPx(lv);
      const sz = varHlLevelSz(lv);
      if (!(px > 0 && sz > 0)) continue;
      const lvlUsd = px * sz;
      const need = notionalUsd - filledUsd;
      if (need <= 0) break;
      const takeUsd = Math.min(lvlUsd, need);
      qty += takeUsd / px;
      filledUsd += takeUsd;
    }
    return {
      vwap: qty > 0 ? filledUsd / qty : null,
      filledUsd,
      insufficient: filledUsd < notionalUsd * 0.999,
    };
  }

  function varHlWalkRoundTripBps(book, notionalUsd) {
    if (!book?.bids?.length || !book?.asks?.length || !(book.mid > 0)) {
      return { bps: null, insufficient: true, buyBps: null, sellBps: null };
    }
    const buy = varHlWalkSide(book.asks, notionalUsd);
    const sell = varHlWalkSide(book.bids, notionalUsd);
    if (buy.insufficient || sell.insufficient || !buy.vwap || !sell.vwap) {
      return { bps: null, insufficient: true, buyBps: null, sellBps: null };
    }
    const buyBps = (buy.vwap - book.mid) / book.mid * 10000;
    const sellBps = (book.mid - sell.vwap) / book.mid * 10000;
    return { bps: buyBps + sellBps, insufficient: false, buyBps, sellBps };
  }

  async function fetchHlBookForCoin(coin) {
    if (typeof hlPost !== 'function' || !coin) return null;
    try {
      const raw = await hlPost({ type: 'l2Book', coin }, { label: `l2Book var ${coin}` });
      return varParseHlL2Book(raw);
    } catch (_) {
      return null;
    }
  }

  async function fetchHlBookMap(coins) {
    const uniq = [...new Set((coins || []).filter(Boolean))];
    const now = Date.now();
    const cached = _varHlSpreadCache?.map || {};
    const fresh = _varHlSpreadCache && now - _varHlSpreadCache.ts < VAR_STATS_CACHE_MS;
    const map = { ...cached };
    const todo = fresh ? uniq.filter(c => map[c] === undefined) : uniq;
    if (!todo.length && fresh) return map;
    const CONC = 8;
    for (let i = 0; i < todo.length; i += CONC) {
      const chunk = todo.slice(i, i + CONC);
      const results = await Promise.all(chunk.map(async coin => ({ coin, book: await fetchHlBookForCoin(coin) })));
      results.forEach(r => { map[r.coin] = r.book ?? null; });
    }
    _varHlSpreadCache = { map, ts: now };
    return map;
  }

  function varHlBookForTicker(ticker, hlMap, bookMap) {
    if (!bookMap) return null;
    const hl = varHlMapLookup(hlMap, ticker);
    const coin = hl?.coin || varHlCoinForTicker(ticker);
    if (!coin) return null;
    return bookMap[coin] ?? bookMap[String(coin).toUpperCase()] ?? null;
  }

  function varRadarHlTakerBpsPerLeg() {
    const el = document.getElementById('varRadarHlTaker');
    const raw = el?.value;
    if (raw === 'custom') {
      const c = parseFloat(document.getElementById('varRadarHlTakerCustom')?.value || '');
      return isFinite(c) && c >= 0 ? c : 4.5;
    }
    const preset = parseFloat(raw || '4.5');
    return isFinite(preset) && preset >= 0 ? preset : 4.5;
  }

  function varHlTakerRoundTripBps(ticker, hlMap) {
    const hl = varHlMapLookup(hlMap, ticker);
    const perLeg = varRadarHlTakerBpsPerLeg();
    const growthScale = hl?.growthMode ? 0.1 : 1;
    return 2 * perLeg * growthScale;
  }

  function varHlSpreadMetricsForTicker(ticker, hlMap, bookMap, notional) {
    const book = varHlBookForTicker(ticker, hlMap, bookMap);
    if (!book) return { bps: null, insufficient: true, buyBps: null, sellBps: null };
    return varHlWalkRoundTripBps(book, notional);
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

  function varMarkSpread(ticker) {
    const tick = String(ticker || '').toUpperCase();
    const markOmni = varOmniLiveMark(tick);
    const hl = varHlMapLookup(_varHlFunding?.map, tick);
    const markHl = hl?.markPx || 0;
    if (!(markOmni > 0) || !(markHl > 0)) return null;
    const mid = (markOmni + markHl) / 2;
    const spreadPct = mid > 0 ? Math.abs(markOmni - markHl) / mid * 100 : 0;
    const firstVenue = markOmni >= markHl ? 'omni' : 'hl';
    return { markOmni, markHl, spreadPct, firstVenue };
  }

  function varOpenOrderTipHtml(ticker) {
    const m = varMarkSpread(ticker);
    if (!m || m.spreadPct < 0.03) return '';
    const venueLbl = m.firstVenue === 'omni' ? 'Variational Omni' : 'Hyperliquid';
    const highMark = m.firstVenue === 'omni' ? m.markOmni : m.markHl;
    const lowMark = m.firstVenue === 'omni' ? m.markHl : m.markOmni;
    return `<p class="var-hedge-open-tip">${varT('var.openOrderTip')
      .replace('{venue}', venueLbl)
      .replace('{high}', varFmtMark(highMark))
      .replace('{low}', varFmtMark(lowMark))
      .replace('{pct}', m.spreadPct.toFixed(2))}</p>`;
  }
  function hlFundingDailyPct(fundingHr) {
    const f = parseFloat(fundingHr || 0);
    if (!isFinite(f)) return null;
    return f * 24 * 100;
  }

  function varDailyToApr(dailyPct) {
    if (dailyPct == null || !isFinite(dailyPct)) return null;
    return dailyPct * 365;
  }

  function varFmtApr(apr, signed) {
    if (apr == null || !isFinite(apr)) return '—';
    if (Math.abs(apr) >= 50000) {
      const cap = (apr > 0 ? '>' : '<') + '50k';
      return signed && apr > 0 ? '+' + cap : cap;
    }
    const body = Math.abs(apr).toLocaleString(varLoc(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const sfx = varT('var.perApr');
    if (!signed) return body + sfx;
    return (apr >= 0 ? '+' : '−') + body + sfx;
  }

  function varQuoteSpreadBps(quote) {
    const bid = parseFloat(quote?.bid || 0);
    const ask = parseFloat(quote?.ask || 0);
    if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
    const mid = (bid + ask) / 2;
    return (ask - bid) / mid * 10000;
  }

  function varOmniSpreadBpsAtSize(L, usdNotional) {
    const q = L?.quotes;
    const fallback = parseFloat(L?.base_spread_bps || 0);
    if (!q) return isFinite(fallback) && fallback > 0 ? fallback : null;
    const points = VAR_QUOTE_TIERS
      .map(t => ({ size: t.size, bps: varQuoteSpreadBps(q[t.key]) }))
      .filter(p => p.bps != null && isFinite(p.bps));
    if (!points.length) return isFinite(fallback) && fallback > 0 ? fallback : null;
    const target = Math.max(100, parseFloat(usdNotional) || 10000);
    if (target <= points[0].size) return points[0].bps;
    if (target >= points[points.length - 1].size) return points[points.length - 1].bps;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (target >= a.size && target <= b.size) {
        const t = (Math.log(target) - Math.log(a.size)) / (Math.log(b.size) - Math.log(a.size));
        return a.bps + t * (b.bps - a.bps);
      }
    }
    return points[points.length - 1].bps;
  }

  function varRadarNotional() {
    const el = document.getElementById('varRadarSize');
    const v = parseFloat(el?.value || 0);
    if (isFinite(v) && v > 0) return v;
    try {
      const saved = parseFloat(localStorage.getItem(HS_VAR_RADAR_SIZE_KEY) || '0');
      if (isFinite(saved) && saved > 0) return saved;
    } catch (_) {}
    const leg = varLegLoad();
    if (leg?.notional > 0) return parseFloat(leg.notional);
    return 10000;
  }

  function varRadarHoldDays() {
    const el = document.getElementById('varRadarHold');
    const v = parseInt(el?.value || '0', 10);
    if (isFinite(v) && v > 0) return v;
    try {
      const saved = parseInt(localStorage.getItem(HS_VAR_RADAR_HOLD_KEY) || '0', 10);
      if (isFinite(saved) && saved > 0) return saved;
    } catch (_) {}
    return 30;
  }

  function varRadarNetMetrics(L, hlMap, notional, holdDays, bookMap) {
    const tick = String(L.ticker || '').toUpperCase();
    const varD = varFundingDailyPct(L.funding_rate, L.funding_interval_s);
    const hl = varHlMapLookup(hlMap, tick);
    const hlD = hl ? hlFundingDailyPct(hl.fundingHr) : null;
    const rec = varD != null && hlD != null ? varRecommendSides(tick, [L], hlMap) : null;
    const grossDaily = rec ? rec.netDaily : null;
    const omniSpreadBps = varOmniSpreadBpsAtSize(L, notional);
    const hlWalk = varHlSpreadMetricsForTicker(tick, hlMap, bookMap, notional);
    const hlBookSpreadBps = hlWalk.insufficient ? null : hlWalk.bps;
    const hlTakerBps = varHlTakerRoundTripBps(tick, hlMap);
    const hlLiquidityInsufficient = hlWalk.insufficient;
    let spreadBps = null;
    if (!hlLiquidityInsufficient && (omniSpreadBps != null || hlBookSpreadBps != null || hlTakerBps > 0)) {
      spreadBps = (omniSpreadBps ?? 0) + (hlBookSpreadBps ?? 0) + hlTakerBps;
    } else if (hlLiquidityInsufficient) {
      spreadBps = null;
    }
    const spreadCostPct = spreadBps != null ? spreadBps / 100 : null;
    const amortDaily = spreadCostPct != null && holdDays > 0 ? spreadCostPct / holdDays : null;
    const netDaily = grossDaily != null && amortDaily != null ? grossDaily - amortDaily : (hlLiquidityInsufficient ? null : grossDaily);
    return {
      grossDaily,
      netDaily,
      grossApr: grossDaily != null ? varDailyToApr(grossDaily) : null,
      netApr: netDaily != null ? varDailyToApr(netDaily) : null,
      spreadBps,
      omniSpreadBps,
      hlBookSpreadBps,
      hlTakerBps,
      hlLiquidityInsufficient,
      spreadCostPct,
      breakEvenDays: grossDaily > 0.001 && spreadCostPct != null ? spreadCostPct / grossDaily : null,
      rec,
      varD,
      hlD,
      varApr: varD != null ? varDailyToApr(varD) : null,
      hlApr: hlD != null ? varDailyToApr(hlD) : null,
    };
  }

  function varFmtSpreadBpsTooltip(m, notional) {
    if (m.hlLiquidityInsufficient) return varT('var.colSpreadIlliq').replace('{usd}', varFmtUsd(notional));
    const omni = m.omniSpreadBps != null ? m.omniSpreadBps.toFixed(1) : '—';
    const hlBook = m.hlBookSpreadBps != null ? m.hlBookSpreadBps.toFixed(1) : '—';
    const hlTaker = m.hlTakerBps != null ? m.hlTakerBps.toFixed(1) : '—';
    return varT('var.colSpreadBreakdown')
      .replace('{omni}', omni)
      .replace('{hl}', hlBook)
      .replace('{taker}', hlTaker)
      .replace('{usd}', varFmtUsd(notional));
  }

  function varRecordFundingHistory(listings) {
    try {
      const raw = JSON.parse(localStorage.getItem(HS_VAR_FUND_HIST_KEY) || '{}');
      const now = Date.now();
      const cut = now - VAR_FUND_HIST_MS;
      for (const L of listings || []) {
        const tick = String(L.ticker || '').toUpperCase();
        const daily = varFundingDailyPct(L.funding_rate, L.funding_interval_s);
        if (daily == null) continue;
        if (!raw[tick]) raw[tick] = [];
        const arr = raw[tick];
        const last = arr[arr.length - 1];
        if (!last || now - last.t > 4 * 60 * 1000) arr.push({ t: now, v: daily });
        raw[tick] = arr.filter(p => p.t >= cut).slice(-240);
      }
      localStorage.setItem(HS_VAR_FUND_HIST_KEY, JSON.stringify(raw));
    } catch (_) {}
  }

  function varFundingHistStats(ticker) {
    let pts = [];
    try {
      const raw = JSON.parse(localStorage.getItem(HS_VAR_FUND_HIST_KEY) || '{}');
      pts = (raw[String(ticker || '').toUpperCase()] || []).filter(p => p.t >= Date.now() - VAR_FUND_HIST_MS);
    } catch (_) {}
    const have = pts.length;
    const need = VAR_FUND_HIST_MIN_PTS;
    const remaining = Math.max(0, need - have);
    return {
      pts,
      have,
      need,
      ready: have >= need,
      remaining,
      etaMin: remaining * 4,
    };
  }

  function varIsExtremeTradFiFunding(cat, grossDaily) {
    if (cat === 'crypto' || grossDaily == null || !isFinite(grossDaily)) return false;
    return Math.abs(grossDaily) >= VAR_EXTREME_TRADFI_DAILY;
  }

  function varRadarSignalQuality(m, tick, cat, holdDays, hlMap) {
    const reasons = [];
    const tags = [];
    const hist = varFundingHistStats(tick);
    if (m.hlLiquidityInsufficient) {
      reasons.push(varT('var.signalIlliq'));
      return { level: 'red', reasons, tags };
    }
    if (m.netApr == null || m.netApr <= 0) {
      reasons.push(varT('var.signalNetNeg'));
      return { level: 'red', reasons, tags };
    }
    const warnReasons = [];
    if (!hist.ready) {
      warnReasons.push(varT('var.signalSparkWait').replace('{n}', String(hist.remaining)).replace('{min}', String(hist.etaMin)));
      tags.push({ key: 'spark', label: varT('var.signalTagSpark') });
    }
    if (varIsExtremeTradFiFunding(cat, m.grossDaily)) {
      warnReasons.push(varT('var.signalExtremeTradFi'));
      tags.push({ key: 'tradfi', label: varT('var.signalTagTradFi') });
    }
    if (m.breakEvenDays != null && isFinite(m.breakEvenDays) && m.breakEvenDays > holdDays) {
      warnReasons.push(varT('var.signalBeLong').replace('{be}', m.breakEvenDays < 1 ? '<1' : String(Math.round(m.breakEvenDays))).replace('{hold}', String(holdDays)));
      tags.push({ key: 'be', label: varT('var.signalTagBe') });
    }
    const hl = hlMap ? varHlMapLookup(hlMap, tick) : null;
    if (varHlFundingAtFloor(hl)) {
      tags.push({ key: 'floor', label: varT('var.signalTagFloor') });
    }
    if (warnReasons.length) {
      if (varHlFundingAtFloor(hl)) warnReasons.push(varT('var.signalHlFloorHint'));
      return { level: 'yellow', reasons: warnReasons, tags };
    }
    const okReasons = [varT('var.signalOk')];
    if (varHlFundingAtFloor(hl)) okReasons.push(varT('var.signalOkFloorNote'));
    return { level: 'green', reasons: okReasons, tags };
  }

  function varRadarSignalHtml(sig) {
    const icon = sig.level === 'green' ? '🟢' : sig.level === 'yellow' ? '🟡' : '🔴';
    const tip = sig.reasons.join(' · ');
    const tags = (sig.tags || []).map(t => `<span class="var-radar-signal-tag">${t.label}</span>`).join('');
    const tagBlock = tags ? `<span class="var-radar-signal-tags">${tags}</span>` : '';
    return `<span class="var-radar-signal-wrap" title="${tip.replace(/"/g, '&quot;')}"><span class="var-radar-signal var-radar-signal--${sig.level}">${icon}</span>${tagBlock}</span>`;
  }

  function varAprColorClass(sig, m) {
    if (sig.level === 'red' || m.hlLiquidityInsufficient) return 'color:var(--danger)';
    if (sig.level === 'yellow') return 'var-radar-apr--caution';
    if (sig.level === 'green' && m.netApr > 0) return 'color:var(--success)';
    return '';
  }

  function varSparklineHtml(ticker) {
    const hist = varFundingHistStats(ticker);
    const pts = hist.pts;
    if (!hist.ready) {
      const prog = varT('var.sparkCollecting')
        .replace('{have}', String(hist.have))
        .replace('{need}', String(hist.need))
        .replace('{min}', String(hist.etaMin));
      return `<span class="var-radar-spark-empty" title="${varT('var.sparkNeedData')}">—<span class="var-radar-spark-progress">${prog}</span></span>`;
    }
    const w = 72;
    const h = 24;
    const vals = pts.map(p => p.v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const poly = vals.map((v, i) => {
      const x = vals.length === 1 ? w / 2 : (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const last = vals[vals.length - 1];
    const color = last >= 0 ? '#3ddc84' : '#ff6b6b';
    return `<svg class="var-radar-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" title="${varT('var.sparkTitle')}"><polyline fill="none" stroke="${color}" stroke-width="1.5" points="${poly}"/></svg>`;
  }

  function varOnRadarParamsChange() {
    const sizeEl = document.getElementById('varRadarSize');
    const holdEl = document.getElementById('varRadarHold');
    const takerEl = document.getElementById('varRadarHlTaker');
    const takerCustom = document.getElementById('varRadarHlTakerCustom');
    if (takerCustom) {
      takerCustom.style.display = takerEl?.value === 'custom' ? '' : 'none';
    }
    try {
      if (sizeEl?.value) localStorage.setItem(HS_VAR_RADAR_SIZE_KEY, String(sizeEl.value));
      if (holdEl?.value) localStorage.setItem(HS_VAR_RADAR_HOLD_KEY, String(holdEl.value));
      if (takerEl?.value) localStorage.setItem(HS_VAR_RADAR_TAKER_KEY, String(takerEl.value));
      if (takerEl?.value === 'custom' && takerCustom?.value) {
        localStorage.setItem(HS_VAR_RADAR_TAKER_KEY + '-custom', String(takerCustom.value));
      }
    } catch (_) {}
    renderVarRadar();
  }

  function varInitRadarParams() {
    const sizeEl = document.getElementById('varRadarSize');
    const holdEl = document.getElementById('varRadarHold');
    const takerEl = document.getElementById('varRadarHlTaker');
    const takerCustom = document.getElementById('varRadarHlTakerCustom');
    if (!sizeEl || sizeEl.dataset.varBound) return;
    sizeEl.dataset.varBound = '1';
    holdEl && (holdEl.dataset.varBound = '1');
    takerEl && (takerEl.dataset.varBound = '1');
    try {
      const savedSize = localStorage.getItem(HS_VAR_RADAR_SIZE_KEY);
      const savedHold = localStorage.getItem(HS_VAR_RADAR_HOLD_KEY);
      const savedTaker = localStorage.getItem(HS_VAR_RADAR_TAKER_KEY);
      const savedTakerCustom = localStorage.getItem(HS_VAR_RADAR_TAKER_KEY + '-custom');
      if (savedSize) sizeEl.value = savedSize;
      else if (!sizeEl.value) sizeEl.value = '10000';
      if (savedHold && holdEl) holdEl.value = savedHold;
      else if (holdEl && !holdEl.value) holdEl.value = '30';
      if (savedTaker && takerEl) takerEl.value = savedTaker;
      if (takerCustom) {
        if (savedTakerCustom) takerCustom.value = savedTakerCustom;
        takerCustom.style.display = takerEl?.value === 'custom' ? '' : 'none';
      }
    } catch (_) {
      if (!sizeEl.value) sizeEl.value = '10000';
      if (holdEl && !holdEl.value) holdEl.value = '30';
    }
    sizeEl.addEventListener('input', varOnRadarParamsChange);
    holdEl?.addEventListener('change', varOnRadarParamsChange);
    takerEl?.addEventListener('change', varOnRadarParamsChange);
    takerCustom?.addEventListener('change', varOnRadarParamsChange);
  }

  let _varListingsCache = [];
  let _varLegPreviewTimer = null;

  function varHasWallets() {
    return typeof wallets !== 'undefined' && Array.isArray(wallets) && wallets.length > 0;
  }

  function varHlPositionsLoaded() {
    return typeof allPositions !== 'undefined' && Array.isArray(allPositions) && allPositions.length > 0;
  }

  let _varLegTickerRows = [];

  function varPopulateLegTickers(listings) {
    _varLegTickerRows = [...(listings || [])].filter(L => parseFloat(L.volume_24h || 0) >= 10000);
    varRenderLegTickerMenu(document.getElementById('varLegTicker')?.value || '', false);
  }

  function varRenderLegTickerMenu(filter, show) {
    const menu = document.getElementById('varLegTickerMenu');
    if (!menu) return;
    const q = String(filter || '').trim().toUpperCase();
    const groups = {};
    VAR_CAT_ORDER.forEach(c => { groups[c] = []; });
    for (const L of _varLegTickerRows) {
      const tick = String(L.ticker || '').toUpperCase();
      const lbl = varHlAssetLabel(tick).toUpperCase();
      if (q && !tick.includes(q) && !lbl.includes(q)) continue;
      const cat = varAssetCategory(tick);
      if (groups[cat]) groups[cat].push(L);
    }
    VAR_CAT_ORDER.forEach(c => {
      groups[c].sort((a, b) => parseFloat(b.volume_24h || 0) - parseFloat(a.volume_24h || 0));
    });
    let html = '';
    VAR_CAT_ORDER.forEach(cat => {
      const slice = groups[cat];
      if (!slice.length) return;
      html += `<div class="var-leg-ticker-cat" data-cat="${cat}">${varCatLabel(cat)}</div>`;
      slice.forEach(L => {
        const tick = String(L.ticker || '').toUpperCase();
        const vol = varFmtVol(parseFloat(L.volume_24h || 0));
        const lbl = varHlAssetLabel(tick);
        const sub = lbl !== tick ? `${lbl} · ${vol}` : vol;
        html += `<button type="button" class="var-leg-ticker-opt" data-tick="${tick}"><span class="var-leg-ticker-opt-main">${tick}</span><span class="var-leg-ticker-opt-sub">${sub}</span></button>`;
      });
    });
    menu.innerHTML = html || `<div class="var-leg-ticker-empty">${varT('var.legTickerEmpty')}</div>`;
    if (show === false) return;
    menu.hidden = !html;
    if (html) varPositionLegTickerMenu();
  }

  function varPositionLegTickerMenu() {
    const inp = document.getElementById('varLegTicker');
    const menu = document.getElementById('varLegTickerMenu');
    if (!inp || !menu || menu.hidden) return;
    const r = inp.getBoundingClientRect();
    const gap = 4;
    const margin = 12;
    const spaceBelow = window.innerHeight - r.bottom - gap - margin;
    const spaceAbove = r.top - gap - margin;
    let maxH = Math.min(420, spaceBelow);
    let top = r.bottom + gap;
    if (maxH < 140 && spaceAbove > spaceBelow) {
      maxH = Math.min(420, spaceAbove);
      top = Math.max(margin, r.top - gap - maxH);
    }
    maxH = Math.max(120, maxH);
    menu.style.top = `${top}px`;
    menu.style.left = `${r.left}px`;
    menu.style.width = `${Math.max(r.width, 240)}px`;
    menu.style.maxHeight = `${maxH}px`;
  }

  function varInitLegTickerPicker() {
    const inp = document.getElementById('varLegTicker');
    const menu = document.getElementById('varLegTickerMenu');
    const wrap = inp?.closest('.var-leg-ticker-wrap');
    if (!inp || inp.dataset.varPickerBound) return;
    inp.dataset.varPickerBound = '1';
    if (menu && !menu.dataset.portaled) {
      menu.dataset.portaled = '1';
      document.body.appendChild(menu);
    }
    const openMenu = () => {
      varRenderLegTickerMenu(inp.value, true);
      requestAnimationFrame(() => varPositionLegTickerMenu());
    };
    inp.addEventListener('focus', openMenu);
    inp.addEventListener('input', openMenu);
    menu?.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.var-leg-ticker-opt');
      if (!btn) return;
      e.preventDefault();
      inp.value = btn.dataset.tick || '';
      menu.hidden = true;
      varScheduleLegPreview();
    });
    const closeIfOutside = (e) => {
      if (!menu || menu.hidden) return;
      if (wrap?.contains(e.target) || menu.contains(e.target)) return;
      menu.hidden = true;
    };
    document.addEventListener('click', closeIfOutside);
    window.addEventListener('resize', () => varPositionLegTickerMenu());
    window.addEventListener('scroll', () => varPositionLegTickerMenu(), true);
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

  function varOmniLabelForIndex(i) {
    return 'Omni ' + (i + 1);
  }

  function varOmniMakeSlot(id, label) {
    return {
      id,
      label: String(label || id).slice(0, 24) || id,
      csv: null,
      points: null,
      importedAt: null,
    };
  }

  function varOmniNextSlotId(existingIds) {
    const have = new Set(existingIds || []);
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    for (let i = 0; i < alphabet.length; i++) {
      const ch = alphabet[i];
      if (!have.has(ch)) return ch;
    }
    let n = 1;
    while (have.has('s' + n)) n += 1;
    return 's' + n;
  }

  function varOmniSlotIds(acc) {
    const a = acc || varAccountsLoad();
    const slots = a.slots && typeof a.slots === 'object' ? a.slots : {};
    const fromOrder = Array.isArray(a.slotOrder)
      ? a.slotOrder.map(String).filter((id) => Object.prototype.hasOwnProperty.call(slots, id))
      : [];
    const ids = fromOrder.slice();
    Object.keys(slots).forEach((id) => {
      if (!ids.includes(id)) ids.push(id);
    });
    return ids;
  }

  function varOmniSlotLabel(slot, id, index) {
    if (slot?.label) return String(slot.label).slice(0, 24);
    if (VAR_OMNI_SLOT_DEFAULT_LABELS[id]) return VAR_OMNI_SLOT_DEFAULT_LABELS[id];
    return varOmniLabelForIndex(index == null ? 0 : index);
  }

  function varOmniRenumberLabels(acc) {
    const ids = varOmniSlotIds(acc);
    ids.forEach((id, i) => {
      if (acc.slots[id]) acc.slots[id].label = varOmniLabelForIndex(i);
    });
    acc.slotOrder = ids.slice();
  }

  function varAccountsEmpty() {
    return {
      v: 2,
      activeImportSlot: 'a',
      slotOrder: ['a', 'b'],
      slots: {
        a: varOmniMakeSlot('a', VAR_OMNI_SLOT_DEFAULT_LABELS.a),
        b: varOmniMakeSlot('b', VAR_OMNI_SLOT_DEFAULT_LABELS.b),
      },
    };
  }

  function varAccountsNormalize(raw) {
    const out = varAccountsEmpty();
    if (!raw || typeof raw !== 'object' || !raw.slots || typeof raw.slots !== 'object') return out;
    let order = Array.isArray(raw.slotOrder)
      ? raw.slotOrder.map(String).filter((id) => Object.prototype.hasOwnProperty.call(raw.slots, id))
      : [];
    Object.keys(raw.slots).forEach((id) => {
      if (!order.includes(id)) order.push(id);
    });
    if (!order.length) {
      if (Object.prototype.hasOwnProperty.call(raw.slots, 'a')) order.push('a');
      if (Object.prototype.hasOwnProperty.call(raw.slots, 'b')) order.push('b');
      Object.keys(raw.slots).forEach((id) => {
        if (!order.includes(id)) order.push(id);
      });
    }
    while (order.length < VAR_OMNI_MIN_SLOTS) {
      const id = varOmniNextSlotId(order);
      order.push(id);
      if (!Object.prototype.hasOwnProperty.call(raw.slots, id)) {
        raw.slots[id] = varOmniMakeSlot(id, varOmniLabelForIndex(order.length - 1));
      }
    }
    order = order.slice(0, VAR_OMNI_MAX_SLOTS);
    out.slotOrder = order;
    out.slots = {};
    order.forEach((id, i) => {
      const s = raw.slots[id] || {};
      out.slots[id] = {
        id,
        label: varOmniSlotLabel(s, id, i),
        csv: s.csv ? varCsvNormalize(s.csv) : null,
        points: s.points || null,
        importedAt: s.importedAt || null,
      };
    });
    out.activeImportSlot = order.includes(raw.activeImportSlot) ? raw.activeImportSlot : order[0];
    out.v = 2;
    return out;
  }

  function varAccountsMigrateFromLegacy() {
    const empty = varAccountsEmpty();
    let csv = null;
    let points = null;
    try { csv = JSON.parse(localStorage.getItem(HS_VAR_CSV_KEY) || 'null'); } catch (_) {}
    try { points = JSON.parse(localStorage.getItem(HS_VAR_POINTS_KEY) || 'null'); } catch (_) {}
    const hasCsv = csv && typeof csv === 'object' && (
      (csv.trades && csv.trades.length) || (csv.funding && csv.funding.length)
      || (csv.realizedPnl && csv.realizedPnl.length) || (csv.transfers && csv.transfers.length)
    );
    if (!hasCsv && !points) return empty;
    empty.slots.a.csv = hasCsv ? varCsvNormalize(csv) : null;
    empty.slots.a.points = points || null;
    empty.slots.a.importedAt = points?.importedAt || Date.now();
    empty.activeImportSlot = 'a';
    return empty;
  }

  let _varAccountsMemo = null;
  let _varAccountsMemoRaw = null;
  let _varCsvViewMemo = null;
  let _varCsvViewMemoKey = '';

  function varAccountsInvalidateMemo() {
    _varAccountsMemo = null;
    _varAccountsMemoRaw = null;
    _varCsvViewMemo = null;
    _varCsvViewMemoKey = '';
  }

  function varAccountsLoad() {
    let rawStr = null;
    try { rawStr = localStorage.getItem(HS_VAR_ACCOUNTS_KEY); } catch (_) {}
    // Extension writes accounts via content-hs-sync without going through varAccountsSave —
    // re-parse when the stored blob changed so points/CSV stay fresh.
    if (_varAccountsMemo && rawStr === _varAccountsMemoRaw) return _varAccountsMemo;
    _varAccountsMemoRaw = rawStr;
    try {
      const raw = rawStr ? JSON.parse(rawStr) : null;
      if (raw && raw.slots && typeof raw.slots === 'object') {
        try {
          _varAccountsMemo = varAccountsNormalize(raw);
          return _varAccountsMemo;
        } catch (err) {
          console.warn('[Hypersheets] omni accounts normalize failed', err);
          // Soft repair — never wipe existing slots on normalize errors.
          const order = Array.isArray(raw.slotOrder) ? raw.slotOrder.map(String) : Object.keys(raw.slots);
          const repaired = {
            v: 2,
            activeImportSlot: raw.activeImportSlot || order[0] || 'a',
            slotOrder: order,
            slots: raw.slots,
          };
          _varAccountsMemo = varAccountsNormalize(repaired);
          return _varAccountsMemo;
        }
      }
    } catch (_) {}
    const migrated = varAccountsMigrateFromLegacy();
    try {
      // Only seed storage when empty — never clobber a parse blip.
      if (!localStorage.getItem(HS_VAR_ACCOUNTS_KEY)) {
        const seeded = JSON.stringify(migrated);
        localStorage.setItem(HS_VAR_ACCOUNTS_KEY, seeded);
        _varAccountsMemoRaw = seeded;
      }
    } catch (_) {}
    _varAccountsMemo = migrated;
    return migrated;
  }

  function varAccountsSave(acc) {
    _varOmniBookMemo = null;
    _varOmniBookMemoTs = 0;
    varAccountsInvalidateMemo();
    const normalized = varAccountsNormalize(acc);
    _varAccountsMemo = normalized;
    try {
      const raw = JSON.stringify(normalized);
      localStorage.setItem(HS_VAR_ACCOUNTS_KEY, raw);
      _varAccountsMemoRaw = raw;
    } catch (_) {}
    const active = normalized.slots[normalized.activeImportSlot] || normalized.slots[normalized.slotOrder[0]];
    try {
      if (active?.csv) localStorage.setItem(HS_VAR_CSV_KEY, JSON.stringify(active.csv));
      else localStorage.removeItem(HS_VAR_CSV_KEY);
    } catch (_) {}
    try {
      if (active?.points) localStorage.setItem(HS_VAR_POINTS_KEY, JSON.stringify(active.points));
      else localStorage.removeItem(HS_VAR_POINTS_KEY);
    } catch (_) {}
  }

  function varAccountsActiveId() {
    const acc = varAccountsLoad();
    const ids = varOmniSlotIds(acc);
    return ids.includes(acc.activeImportSlot) ? acc.activeImportSlot : (ids[0] || 'a');
  }

  function varAccountsScheduleActivityRefresh() {
    if (window.__hsVarSlotsRefreshTimer) clearTimeout(window.__hsVarSlotsRefreshTimer);
    window.__hsVarSlotsRefreshTimer = setTimeout(() => {
      window.__hsVarSlotsRefreshTimer = null;
      try { renderVarActivity(); } catch (_) {}
      try { if (varHedgePanelVisible()) renderVarHedge(true); } catch (_) {}
    }, 0);
  }

  function varAccountsPaintActiveSlot(id) {
    const host = document.getElementById('varOmniSlots');
    if (!host) return;
    host.querySelectorAll('.var-omni-slot').forEach((el) => {
      const on = el.getAttribute('data-slot') === id;
      el.classList.toggle('is-active', on);
      const radio = el.querySelector('input[type="radio"]');
      if (radio) radio.checked = on;
    });
  }

  function varAccountsSetActiveImport(id) {
    const acc = varAccountsLoad();
    if (!varOmniSlotIds(acc).includes(id)) return;
    if (acc.activeImportSlot === id) return;
    acc.activeImportSlot = id;
    varAccountsSave(acc);
    varAccountsPaintActiveSlot(id);
    varAccountsScheduleActivityRefresh();
  }

  function varAccountsAddSlot(opts) {
    const silent = !!(opts && opts.silent);
    const acc = varAccountsLoad();
    const ids = varOmniSlotIds(acc);
    if (ids.length >= VAR_OMNI_MAX_SLOTS) {
      if (!silent && typeof toast === 'function') {
        toast(varT('var.slotMax').replace('{n}', String(VAR_OMNI_MAX_SLOTS)), true);
      }
      return null;
    }
    const id = varOmniNextSlotId(ids);
    acc.slots[id] = varOmniMakeSlot(id, varOmniLabelForIndex(ids.length));
    acc.slotOrder = ids.concat([id]);
    varOmniRenumberLabels(acc);
    acc.activeImportSlot = id;
    varAccountsSave(acc);
    if (!silent && typeof toast === 'function') {
      toast(varT('var.slotAdded').replace('{label}', acc.slots[id].label));
    }
    varAccountsScheduleActivityRefresh();
    return id;
  }

  /** Prefer an empty Omni jambe for a new JSON; create one if needed (max 8). */
  function varAccountsPickSlotForNewImport() {
    const acc = varAccountsLoad();
    const ids = varOmniSlotIds(acc);
    const isEmpty = (id) => {
      const b = acc.slots[id]?.csv;
      return !(b && (
        (b.trades && b.trades.length)
        || (b.funding && b.funding.length)
        || (b.realizedPnl && b.realizedPnl.length)
        || (b.transfers && b.transfers.length)
      ));
    };
    const emptyId = ids.find(isEmpty);
    if (emptyId) {
      if (acc.activeImportSlot !== emptyId) {
        acc.activeImportSlot = emptyId;
        varAccountsSave(acc);
        try { varAccountsPaintActiveSlot(emptyId); } catch (_) {}
      }
      return emptyId;
    }
    return varAccountsAddSlot({ silent: true });
  }

  function varAccountsRemoveSlot(id) {
    // Empêche les multi-listeners / double-clics de vider les jambes puis bloquer avec le toast min.
    if (window.__hsVarSlotRemoveLock) return;
    window.__hsVarSlotRemoveLock = true;
    try {
      id = String(id || '').trim();
      const host = document.getElementById('varOmniSlots');
      const domIds = host
        ? Array.from(host.querySelectorAll('.var-omni-slot[data-slot]'))
            .map((el) => el.getAttribute('data-slot'))
            .filter(Boolean)
        : [];

      let acc = varAccountsLoad();
      let ids = varOmniSlotIds(acc);

      // Si l'UI montre plus de jambes que le storage (désync), reconstruire depuis le DOM.
      if (domIds.length > ids.length) {
        domIds.forEach((domId, i) => {
          if (!acc.slots[domId]) {
            acc.slots[domId] = varOmniMakeSlot(domId, varOmniLabelForIndex(i));
          }
        });
        acc.slotOrder = domIds.slice();
        varOmniRenumberLabels(acc);
        varAccountsSave(acc);
        acc = varAccountsLoad();
        ids = varOmniSlotIds(acc);
      }

      if (!id) {
        id = domIds[domIds.length - 1] || '';
      }
      if (!id || !ids.includes(id)) {
        if (id && domIds.includes(id) && !acc.slots[id]) {
          acc.slots[id] = varOmniMakeSlot(id, varOmniLabelForIndex(domIds.indexOf(id)));
          acc.slotOrder = domIds.slice();
          varAccountsSave(acc);
          acc = varAccountsLoad();
          ids = varOmniSlotIds(acc);
        } else {
          return;
        }
      }

      if (ids.length <= VAR_OMNI_MIN_SLOTS) {
        if (typeof toast === 'function') {
          toast(varT('var.slotMin').replace('{n}', String(VAR_OMNI_MIN_SLOTS)), true);
        }
        return;
      }

      const slot = acc.slots[id];
      const labelBefore = slot?.label || id;
      const hasData = !!(slot?.csv?.trades?.length || slot?.points);
      if (hasData) {
        const ok = typeof window.confirm === 'function'
          ? window.confirm(varT('var.slotRemoveConfirm').replace('{label}', labelBefore))
          : true;
        if (!ok) return;
      }
      delete acc.slots[id];
      acc.slotOrder = ids.filter((x) => x !== id);
      varOmniRenumberLabels(acc);
      if (acc.activeImportSlot === id || !acc.slotOrder.includes(acc.activeImportSlot)) {
        acc.activeImportSlot = acc.slotOrder[0];
      }
      varAccountsSave(acc);
      if (typeof toast === 'function') toast(varT('var.slotRemoved').replace('{label}', labelBefore));
      varAccountsScheduleActivityRefresh();
    } finally {
      setTimeout(() => { window.__hsVarSlotRemoveLock = false; }, 0);
    }
  }

  function varCsvLoad() {
    try {
      const acc = varAccountsLoad();
      const slot = acc.slots[varAccountsActiveId()];
      return varCsvNormalize(slot?.csv || null);
    } catch {
      return null;
    }
  }

  /** Merge trades/funding/… across every Omni CSV slot (wallet-style "Tous"). */
  function varCsvLoadAll() {
    try {
      const acc = varAccountsLoad();
      const ids = varOmniSlotIds(acc);
      const bundles = ids
        .map((id) => varCsvNormalize(acc.slots[id]?.csv || null))
        .filter((b) => b && (
          (b.trades && b.trades.length)
          || (b.funding && b.funding.length)
          || (b.realizedPnl && b.realizedPnl.length)
          || (b.transfers && b.transfers.length)
        ));
      if (!bundles.length) return null;
      if (bundles.length === 1) return bundles[0];
      return varCsvNormalize({
        trades: varDedupeRows(bundles.flatMap((b) => b.trades || [])),
        funding: varDedupeRows(bundles.flatMap((b) => b.funding || [])),
        realizedPnl: varDedupeRows(bundles.flatMap((b) => b.realizedPnl || [])),
        transfers: varDedupeRows(bundles.flatMap((b) => b.transfers || [])),
        files: {},
      });
    } catch {
      return null;
    }
  }

  let _varCsvScope = 'active'; // 'active' | 'all'
  function varCsvScopeLoad() {
    try {
      const v = localStorage.getItem('hs-var-csv-scope');
      if (v === 'all' || v === 'active') _varCsvScope = v;
    } catch (_) {}
    return _varCsvScope;
  }
  function varCsvScopeSave(scope) {
    _varCsvScope = scope === 'all' ? 'all' : 'active';
    try { localStorage.setItem('hs-var-csv-scope', _varCsvScope); } catch (_) {}
  }
  function varCsvLoadForView() {
    varCsvScopeLoad();
    try {
      const acc = varAccountsLoad();
      const id = varAccountsActiveId();
      const slot = acc.slots[id];
      const trades = slot?.csv?.trades;
      const lastAt = trades && trades.length ? (trades[trades.length - 1]?.created_at || '') : '';
      const key = [
        _varCsvScope,
        id,
        slot?.importedAt || 0,
        trades?.length || 0,
        lastAt,
        varOmniSlotIds(acc).length,
      ].join(':');
      if (_varCsvViewMemo && _varCsvViewMemoKey === key) return _varCsvViewMemo;
      const bundle = _varCsvScope === 'all' ? varCsvLoadAll() : varCsvLoad();
      _varCsvViewMemo = bundle;
      _varCsvViewMemoKey = key;
      return bundle;
    } catch (_) {
      return _varCsvScope === 'all' ? varCsvLoadAll() : varCsvLoad();
    }
  }
  function varSetCsvScope(scope) {
    varCsvScopeSave(scope);
    _varOmniBookMemo = null;
    _varOmniBookMemoTs = 0;
    _varCsvViewMemo = null;
    _varCsvViewMemoKey = '';
    varAccountsScheduleActivityRefresh();
    try { if (_varSub === 'points' || _varSub === 'lab') renderVarPoints(); } catch (_) {}
  }
  function varCsvSave(bundle) {
    _varOmniBookMemo = null;
    _varOmniBookMemoTs = 0;
    const acc = varAccountsLoad();
    const id = varAccountsActiveId();
    if (!acc.slots[id]) return;
    acc.slots[id].csv = varCsvNormalize(bundle);
    acc.slots[id].importedAt = Date.now();
    varAccountsSave(acc);
  }

  function varPointsEmpty() {
    return {
      v: 1,
      points_summary: null,
      points_history: [],
      competition: null,
      exported_at: null,
      sourceFile: null,
      importedAt: null,
    };
  }

  function varPointsLoad() {
    try {
      const acc = varAccountsLoad();
      const normalize = (raw) => {
        if (!raw) return null;
        return {
          v: 1,
          points_summary: raw.points_summary || null,
          points_history: Array.isArray(raw.points_history) ? raw.points_history : [],
          competition: raw.competition || null,
          exported_at: raw.exported_at || null,
          sourceFile: raw.sourceFile || null,
          importedAt: raw.importedAt || null,
        };
      };
      const hasPts = (raw) => !!(raw && (
        raw.points_summary
        || (Array.isArray(raw.points_history) && raw.points_history.length)
        || raw.competition
      ));
      const active = acc.slots[varAccountsActiveId()]?.points;
      if (hasPts(active)) return normalize(active);
      // Other jambes may hold the Omni points export while the active jambe is CSV-only.
      for (const id of varOmniSlotIds(acc)) {
        const p = acc.slots[id]?.points;
        if (hasPts(p)) return normalize(p);
      }
      const legacy = JSON.parse(localStorage.getItem(HS_VAR_POINTS_KEY) || 'null');
      if (hasPts(legacy)) return normalize(legacy);
      return null;
    } catch {
      return null;
    }
  }

  function varPointsSave(data) {
    const acc = varAccountsLoad();
    const id = varAccountsActiveId();
    if (acc.slots[id]) {
      acc.slots[id].points = data;
      acc.slots[id].importedAt = data?.importedAt || Date.now();
      varAccountsSave(acc);
      return;
    }
    try {
      localStorage.setItem(HS_VAR_POINTS_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function varPointsClear() {
    const acc = varAccountsLoad();
    const id = varAccountsActiveId();
    if (acc.slots[id]) {
      acc.slots[id].points = null;
      varAccountsSave(acc);
    }
    try { localStorage.removeItem(HS_VAR_POINTS_KEY); } catch (_) {}
  }

  function varNormalizeOmniMarket(raw) {
    return String(raw || '')
      .toUpperCase()
      .replace(/^XYZ:/i, '')
      .replace(/-PERP$/i, '')
      .replace(/\/USD[CT]?$/i, '')
      .replace(/-USD[CT]?$/i, '')
      .trim();
  }

  function varNormalizeLivePosition(p) {
    if (!p || typeof p !== 'object') return null;
    const market = varNormalizeOmniMarket(
      p.underlying
      || p.instrument?.underlying
      || p.reference_instrument?.underlying
      || p.base_asset
      || p.asset
      || p.ticker
      || p.symbol
      || p.market
      || p.instrument_name
      || p.name
      || ''
    );
    if (!market) return null;
    let qty = parseFloat(
      p.qty ?? p.quantity ?? p.size ?? p.position_size ?? p.net_qty ?? p.net_size
      ?? p.amount ?? p.position ?? p.contracts ?? p.signed_qty ?? NaN
    );
    let sideRaw = String(p.side || p.position_side || p.direction || '').toLowerCase();
    if (sideRaw.includes('short') || sideRaw === 'sell') sideRaw = 'short';
    else if (sideRaw.includes('long') || sideRaw === 'buy') sideRaw = 'long';
    else if (isFinite(qty) && qty < 0) sideRaw = 'short';
    else if (isFinite(qty) && qty > 0) sideRaw = 'long';
    else sideRaw = '';
    const entry = parseFloat(p.entry_price ?? p.avg_entry ?? p.average_entry_price ?? p.avg_price ?? p.price ?? p.entry ?? 0);
    const mark = parseFloat(p.mark_price ?? p.mark ?? p.index_price ?? p.oracle_price ?? 0);
    let notional = parseFloat(p.notional ?? p.notional_usd ?? p.position_value ?? p.value_usd ?? NaN);
    if ((!isFinite(qty) || Math.abs(qty) < 1e-12) && isFinite(notional) && Math.abs(notional) > 0) {
      const px = mark > 0 ? mark : entry;
      if (px > 0) qty = notional / px;
    }
    if (!isFinite(qty) || Math.abs(qty) < 1e-12) return null;
    if (!sideRaw) sideRaw = qty < 0 ? 'short' : 'long';
    const absQty = Math.abs(qty);
    if (!isFinite(notional) || notional <= 0) {
      notional = mark > 0 ? absQty * mark : (entry > 0 ? absQty * entry : 0);
    } else {
      notional = Math.abs(notional);
    }
    const upnl = parseFloat(p.upnl ?? p.unrealized_pnl ?? p.u_pnl ?? p.unrealizedPnl ?? NaN);
    const liq = parseFloat(p.liquidation_price ?? p.liq_price ?? p.estimated_liquidation_price ?? NaN);
    return {
      market,
      side: sideRaw,
      qty: absQty,
      signedQty: sideRaw === 'short' ? -absQty : absQty,
      entry: isFinite(entry) ? entry : 0,
      mark: isFinite(mark) ? mark : 0,
      notional: isFinite(notional) ? notional : 0,
      upnl: isFinite(upnl) ? upnl : null,
      liq: isFinite(liq) ? liq : null,
      live: true,
      raw: p,
    };
  }

  function varRebuildOpenPositionsFromTrades(bundle) {
    const src = bundle || varCsvLoad();
    const tradesAll = [...(src?.trades || [])]
      .filter(t => !t.status || t.status === 'confirmed')
      .map(t => ({
        underlying: varNormalizeOmniMarket(t.underlying || t.instrument?.underlying || ''),
        ts: Date.parse(t.created_at || 0),
        px: parseFloat(t.price || t.mark_price || 0),
        qty: parseFloat(t.qty || 0),
        sign: String(t.side || '').toLowerCase() === 'buy' ? 1 : -1,
      }))
      .filter(t => isFinite(t.ts) && t.underlying && isFinite(t.px) && t.px > 0 && isFinite(t.qty) && t.qty > 0)
      .sort((a, b) => a.ts - b.ts);
    const state = {}; // underlying -> { qty: signed, entry }
    for (const t of tradesAll) {
      const s = state[t.underlying] || { qty: 0, entry: 0 };
      const signed = t.sign * t.qty;
      const prev = s.qty;
      const next = prev + signed;
      if (Math.abs(next) < 1e-10) {
        delete state[t.underlying];
        continue;
      }
      if (prev === 0 || Math.sign(prev) === Math.sign(signed)) {
        const prevAbs = Math.abs(prev);
        const addAbs = Math.abs(signed);
        s.entry = prevAbs + addAbs > 0
          ? (prevAbs * s.entry + addAbs * t.px) / (prevAbs + addAbs)
          : t.px;
      } else if (Math.sign(prev) !== Math.sign(next)) {
        s.entry = t.px;
      }
      // else reducing same side: keep entry
      s.qty = next;
      state[t.underlying] = s;
    }
    return Object.keys(state)
      .map(u => {
        const s = state[u];
        const qty = Math.abs(s.qty);
        const side = s.qty > 0 ? 'long' : 'short';
        const live = varOmniLiveMark(u);
        const mark = live > 0 ? live : 0;
        const entry = s.entry || 0;
        let upnl = null;
        if (entry > 0 && mark > 0 && qty > 0) {
          const signed = side === 'short' ? -1 : 1;
          upnl = signed * (mark - entry) * qty;
        }
        return {
          market: u,
          side,
          qty,
          signedQty: s.qty,
          entry,
          mark,
          notional: qty * (mark || entry || 0),
          upnl,
          liq: null,
          live: false,
          fromFills: true,
        };
      })
      .filter(p => p.qty > 0 && (p.notional > 1 || p.entry > 0))
      .sort((a, b) => b.notional - a.notional);
  }

  function varFillPosByMarketMap() {
    const fills = varRebuildOpenPositionsFromTrades();
    const map = Object.create(null);
    for (const f of fills) {
      map[String(f.market || '').toUpperCase()] = f;
      for (const c of varOmniListingCandidates(f.market)) map[c] = f;
    }
    return { fills, map };
  }

  function varLookupFillPos(market, fillMap) {
    const tick = String(market || '').toUpperCase();
    if (!tick || !fillMap) return null;
    if (fillMap[tick]) return fillMap[tick];
    for (const c of varOmniListingCandidates(tick)) {
      if (fillMap[c]) return fillMap[c];
    }
    return null;
  }

  let _varOmniBookMemo = null;
  let _varOmniBookMemoTs = 0;

  function varCsvTradeFingerprint(bundle) {
    const trades = bundle?.trades || [];
    if (!trades.length) return '';
    const ids = trades.map((t) => String(t.id || t.trade_id || '')).filter(Boolean).sort();
    if (ids.length >= 2) {
      return `id:${ids.length}:${ids[0]}:${ids[ids.length - 1]}:${ids[Math.floor(ids.length / 2)]}`;
    }
    if (ids.length === 1) return `id:1:${ids[0]}`;
    const first = trades[0];
    const last = trades[trades.length - 1];
    return `n:${trades.length}:${first?.created_at || ''}:${last?.created_at || ''}:${first?.underlying || ''}`;
  }

  /** Slot ids for the open-book view — respects Actif / Tous scope. */
  function varOmniBookSlotIds(acc) {
    const a = acc || varAccountsLoad();
    const all = varOmniSlotIds(a);
    varCsvScopeLoad();
    if (_varCsvScope === 'all') return all;
    const active = varAccountsActiveId();
    return all.includes(active) ? [active] : all.slice(0, 1);
  }

  function varHasAnyOmniCsv() {
    try {
      const acc = varAccountsLoad();
      return varOmniSlotIds(acc).some((id) => {
        const b = acc.slots[id]?.csv;
        return !!(b && (
          (b.trades && b.trades.length)
          || (b.funding && b.funding.length)
          || (b.realizedPnl && b.realizedPnl.length)
          || (b.transfers && b.transfers.length)
        ));
      });
    } catch (_) {
      return false;
    }
  }

  function varGetOmniBookPositions() {
    if (_varOmniBookMemo && Date.now() - _varOmniBookMemoTs < 1200) return _varOmniBookMemo;
    const acc = varAccountsLoad();
    const slotIds = varOmniBookSlotIds(acc);
    const positions = [];
    let anyFills = false;
    let latestAt = 0;
    const seenFp = new Set();
    for (const id of slotIds) {
      const slot = acc.slots[id];
      const bundle = slot?.csv ? varCsvNormalize(slot.csv) : null;
      if (!bundle?.trades?.length) continue;
      anyFills = true;
      const fp = varCsvTradeFingerprint(bundle);
      // Skip cloned jambi that hold the exact same trade export.
      if (fp && seenFp.has(fp)) continue;
      if (fp) seenFp.add(fp);
      if (slot.importedAt && slot.importedAt > latestAt) latestAt = slot.importedAt;
      const fills = varRebuildOpenPositionsFromTrades(bundle);
      for (const p of fills) {
        if (!(p.qty > 0)) continue;
        positions.push({
          ...p,
          accountId: id,
          accountLabel: varOmniSlotLabel(slot, id),
          live: false,
          fromFills: true,
          hasEntry: !!(p.entry > 0),
          // Keep rebuild uPnL when mark was available; enrich will refresh.
          upnl: p.upnl != null && isFinite(p.upnl) ? p.upnl : null,
        });
      }
    }
    positions.sort((a, b) => (b.notional || 0) - (a.notional || 0));
    const result = positions.length
      ? {
          positions,
          source: 'fills',
          meta: {
            importedAt: latestAt || Date.now(),
            multiAccount: slotIds.length > 1,
            scope: _varCsvScope || 'active',
          },
        }
      : { positions: [], source: anyFills ? 'fills' : 'none', meta: null };
    _varOmniBookMemo = result;
    _varOmniBookMemoTs = Date.now();
    return result;
  }

  function varPositionsLoad() {
    try {
      const raw = JSON.parse(localStorage.getItem(HS_VAR_POSITIONS_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return null;
      return raw;
    } catch {
      return null;
    }
  }

  function varPositionsSave(data) {
    try { localStorage.setItem(HS_VAR_POSITIONS_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function varPositionsClear() {
    try { localStorage.removeItem(HS_VAR_POSITIONS_KEY); } catch (_) {}
  }

  function varApplyLivePositions(data) {
    _varOmniBookMemo = null;
    _varOmniBookMemoTs = 0;
    const rows = Array.isArray(data?.positions) ? data.positions
      : Array.isArray(data) ? data
        : [];
    const positions = rows.map(varNormalizeLivePosition).filter(Boolean)
      .sort((a, b) => b.notional - a.notional);
    const meta = data?.positions_meta || {};
    const err = meta.error || data?.error || null;
    if (!positions.length && err) {
      const prev = varPositionsLoad();
      if (prev?.positions?.length) {
        varPositionsSave({
          ...prev,
          error: err,
          path: meta.path || data?.path || prev.path || null,
          pulled_at: meta.pulled_at || data?.exported_at || new Date().toISOString(),
          from: meta.from || data?.from || prev.from || null,
        });
        return varPositionsLoad();
      }
    }
    varPositionsSave({
      v: 1,
      positions,
      path: meta.path || data?.path || null,
      pulled_at: meta.pulled_at || data?.exported_at || new Date().toISOString(),
      from: meta.from || data?.from || null,
      error: err,
      importedAt: Date.now(),
    });
    return varPositionsLoad();
  }

  function varAirdropLoadAssumptions() {
    try {
      const raw = JSON.parse(localStorage.getItem(HS_VAR_AIRDROP_KEY) || 'null');
      if (!raw) return { ...VAR_AIRDROP_DEFAULTS };
      return {
        fdvM: isFinite(raw.fdvM) ? raw.fdvM : VAR_AIRDROP_DEFAULTS.fdvM,
        sharePct: isFinite(raw.sharePct) ? raw.sharePct : VAR_AIRDROP_DEFAULTS.sharePct,
        totalPtsM: isFinite(raw.totalPtsM) ? raw.totalPtsM : VAR_AIRDROP_DEFAULTS.totalPtsM,
      };
    } catch {
      return { ...VAR_AIRDROP_DEFAULTS };
    }
  }

  function varAirdropSaveAssumptions(a) {
    try { localStorage.setItem(HS_VAR_AIRDROP_KEY, JSON.stringify(a)); } catch (_) {}
  }

  function varIsOmniExport(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const fmt = String(obj.format || '').toLowerCase();
    if (VAR_OMNI_EXPORT_FORMATS.includes(fmt)) return true;
    if (obj.points_summary && (Array.isArray(obj.trades) || Array.isArray(obj.points_history))) return true;
    if (Array.isArray(obj.positions) && (obj.source || obj.positions_meta)) return true;
    return false;
  }

  function varNormalizeOmniTrade(t) {
    if (!t || typeof t !== 'object') return t;
    const underlying = t.underlying || t.instrument?.underlying || '';
    return { ...t, underlying };
  }

  function varNormalizeOmniTransfer(t) {
    if (!t || typeof t !== 'object') return t;
    const underlying = t.underlying || t.reference_instrument?.underlying || t.asset || '';
    return { ...t, underlying };
  }

  function varApplyOmniExport(data, fileName) {
    const trades = (data.trades || []).map(varNormalizeOmniTrade);
    const transfersRaw = (data.transfers || []).map(varNormalizeOmniTransfer);
    const split = varSplitTransferRows(transfersRaw);
    const bundle = varCsvEmptyBundle();
    const metaBase = { name: fileName || 'variational-export.json', at: Date.now() };
    if (trades.length) {
      bundle.trades = varDedupeRows(trades);
      bundle.files.trades = { ...metaBase, rows: bundle.trades.length };
    }
    if (split.funding.length) {
      bundle.funding = varDedupeRows(split.funding);
      bundle.files.funding = { ...metaBase, rows: bundle.funding.length };
    }
    if (split.realizedPnl.length) {
      bundle.realizedPnl = varDedupeRows(split.realizedPnl);
      bundle.files.realizedPnl = { ...metaBase, rows: bundle.realizedPnl.length };
    }
    if (split.transfers.length) {
      bundle.transfers = varDedupeRows(split.transfers);
      bundle.files.transfers = { ...metaBase, rows: bundle.transfers.length };
    }
    varCsvSave(bundle);

    const competition = data.competition;
    const hasCompetition = competition && (
      (Array.isArray(competition) && competition.length) ||
      (typeof competition === 'object' && Object.keys(competition).length)
    );
    varPointsSave({
      v: 1,
      points_summary: data.points_summary || null,
      points_history: Array.isArray(data.points_history) ? data.points_history : [],
      competition: hasCompetition ? competition : null,
      exported_at: data.exported_at || null,
      sourceFile: fileName || null,
      importedAt: Date.now(),
    });
    if (data.positions != null || data.positions_meta != null) {
      varApplyLivePositions(data);
    }
    return { bundle, points: varPointsLoad() };
  }

  function varFmtCompactUsd(n) {
    const v = Number(n);
    if (!isFinite(v)) return '—';
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(abs >= 10e9 ? 1 : 2) + 'B';
    if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(abs >= 10e6 ? 1 : 2) + 'M';
    if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(abs >= 10e3 ? 0 : 1) + 'K';
    return sign + '$' + abs.toFixed(abs >= 100 ? 0 : 2);
  }

  function varFmtPoints(n) {
    const v = parseFloat(n);
    if (!isFinite(v)) return '—';
    if (Math.abs(v) >= 1000) return v.toLocaleString(varLoc(), { maximumFractionDigits: 2 });
    if (Math.abs(v) >= 10) return v.toLocaleString(varLoc(), { maximumFractionDigits: 2 });
    return v.toLocaleString(varLoc(), { maximumFractionDigits: 4 });
  }

  function varFmtPtsRate(n, estimated) {
    const v = parseFloat(n);
    if (!isFinite(v)) return '—';
    const body = v.toLocaleString(varLoc(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return estimated ? `~${body}` : body;
  }

  /** Competition score is PnL×√vol — not Omni points. Keep it compact. */
  function varFmtCompScore(n) {
    const v = parseFloat(n);
    if (!isFinite(v)) return '—';
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e6) {
      return sign + (abs / 1e6).toLocaleString(varLoc(), { maximumFractionDigits: 2 }) + 'M';
    }
    if (abs >= 1000) {
      return v.toLocaleString(varLoc(), { maximumFractionDigits: 0 });
    }
    return v.toLocaleString(varLoc(), { maximumFractionDigits: 2 });
  }

  function varFmtPtsMillions(m) {
    const v = Number(m);
    if (!isFinite(v)) return '—';
    return v.toFixed(v >= 10 ? 1 : 1) + 'M';
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
    const coinUp = coin.toUpperCase();
    const coinShort = coin.replace(/^xyz:/i, '').toUpperCase();
    const preferXyz = /^xyz:/i.test(coin);
    const positions = typeof getActivePositions === 'function' ? getActivePositions() : (window.allPositions || []);
    let best = null;
    let bestScore = -1;
    for (const p of positions || []) {
      const norm = varNormalizeTradePos(p);
      if (!norm) continue;
      const c = norm.coin;
      const cUp = c.toUpperCase();
      const short = c.replace(/^xyz:/i, '').toUpperCase();
      let score = 0;
      if (c === coin || cUp === coinUp) score = 100;
      else if (short === coinShort) score = preferXyz ? (norm.dex === 'XYZ' ? 80 : 40) : (norm.dex === 'HL' ? 80 : 50);
      else continue;
      if (score > bestScore) {
        bestScore = score;
        best = norm;
      }
    }
    return best;
  }

  function varNormalizeTradePos(p) {
    if (!p || typeof p !== 'object') return null;
    const szi = parseFloat(p.szi || 0);
    if (!isFinite(szi) || Math.abs(szi) < 1e-12) return null;
    const entry = parseFloat(p.entryPx || 0);
    const coin = String(p.coin || '');
    if (!coin) return null;
    const dex = p._dex === 'XYZ' || /^xyz:/i.test(coin) ? 'XYZ' : 'HL';
    const liveMark = varHlLiveMarkForCoin(coin);
    const mark = liveMark || parseFloat(p.markPx || 0) || entry;
    let upnl = parseFloat(p.unrealizedPnl ?? p.upnl ?? NaN);
    if ((!isFinite(upnl) || liveMark > 0) && entry > 0 && mark > 0) {
      upnl = szi * (mark - entry);
    }
    return {
      coin,
      szi,
      entry,
      mark,
      notionalUsd: Math.abs(szi) * (mark || 0),
      qty: Math.abs(szi),
      side: szi > 0 ? 'long' : 'short',
      upnl: isFinite(upnl) ? upnl : null,
      dex,
      venue: dex === 'XYZ' ? 'Trade XYZ' : 'Hyperliquid',
      wallet: p._wallet || null,
      markLive: liveMark > 0,
    };
  }

  const VAR_OMNI_LISTING_ALIASES = {
    GOLD: 'XAU', SILVER: 'XAG', PLATINUM: 'XPT', PALLADIUM: 'XPD',
    PAXG: 'XAU',
    SP500: 'US500', SPX: 'US500',
    XYZ100: 'NDX', QQQ: 'NDX',
    BRENTOIL: 'BRENTOIL', ALUMINIUM: 'ALUM',
  };

  function varOmniListingCandidates(ticker) {
    const tick = String(ticker || '').toUpperCase().replace(/^XYZ:/i, '').trim()
      .replace(/-PERP$/i, '')
      .replace(/\/USD[CT]?$/i, '')
      .replace(/-USD[CT]?$/i, '');
    if (!tick) return [];
    const out = [];
    const push = (t) => { if (t && !out.includes(t)) out.push(t); };
    push(tick);
    push(VAR_OMNI_LISTING_ALIASES[tick]);
    try {
      const hl = typeof varHlCoinForTicker === 'function' ? varHlCoinForTicker(tick) : tick;
      const short = String(hl || '').replace(/^xyz:/i, '').toUpperCase();
      push(short);
      push(VAR_OMNI_LISTING_ALIASES[short]);
      if (short === 'GOLD' || tick === 'GOLD') push('XAU');
      if (short === 'SILVER' || tick === 'SILVER') push('XAG');
      if (short === 'PLATINUM') push('XPT');
      if (short === 'PALLADIUM') push('XPD');
      if (short === 'SP500') push('US500');
    } catch (_) {}
    return out;
  }

  let _varListingsByTicker = Object.create(null);
  const _varOmniMarkCache = Object.create(null);

  function varIndexOmniListings(listings) {
    const by = Object.create(null);
    const now = Date.now();
    for (const L of listings || []) {
      try {
        const tick = varNormalizeOmniMarket(L?.ticker);
        if (!tick) continue;
        by[tick] = L;
        const { mid } = varOmniQuoteMid(L);
        const apiMark = parseFloat(L.mark_price || 0);
        // Prefer live quote mid when present — public mark_price is often sticky.
        const m = mid > 0 ? mid : apiMark;
        if (m > 0) {
          const entry = { mark: m, at: now, source: mid > 0 ? 'quote' : 'mark' };
          _varOmniMarkCache[tick] = entry;
          for (const c of varOmniListingCandidates(tick)) {
            _varOmniMarkCache[c] = entry;
            if (!by[c]) by[c] = L;
          }
        }
      } catch (_) {}
    }
    _varListingsByTicker = by;
    _varListingsCache = listings || [];
  }

  function varFindOmniListing(ticker) {
    const tick = varNormalizeOmniMarket(ticker);
    if (!tick) return null;
    if (!_varListingsCache?.length && _varStatsCache?.listings?.length) {
      varIndexOmniListings(_varStatsCache.listings);
    }
    for (const c of varOmniListingCandidates(tick)) {
      const hit = _varListingsByTicker[c]
        || (_varListingsCache || []).find(x => String(x.ticker || '').toUpperCase() === c);
      if (hit) return hit;
    }
    // Exact normalized scan (covers odd ticker casing / late index).
    const hit = (_varListingsCache || []).find(x => varNormalizeOmniMarket(x.ticker) === tick);
    return hit || null;
  }

  /** Mark Omni = public mark_price only (CGU). Never substitute HL/XYZ marks. */

  function varOmniLiveMark(ticker) {
    return varOmniLiveMarkMeta(ticker).mark || 0;
  }

  function varOmniQuoteMid(listing) {
    const q = listing?.quotes?.base || listing?.quotes?.size_1k || listing?.quotes?.size_100k;
    const bid = parseFloat(q?.bid || 0);
    const ask = parseFloat(q?.ask || 0);
    if (bid > 0 && ask >= bid) return { mid: (bid + ask) / 2, bid, ask };
    return { mid: 0, bid, ask };
  }

  function varOmniCachedMark(tick) {
    for (const c of varOmniListingCandidates(tick)) {
      const hit = _varOmniMarkCache[c];
      if (hit?.mark > 0) return hit;
    }
    return null;
  }

  function varOmniLiveMarkMeta(ticker) {
    const tick = varNormalizeOmniMarket(ticker);
    if (!tick) return { mark: 0, source: null, listing: null };
    const L = varFindOmniListing(tick);
    const { mid, bid, ask } = varOmniQuoteMid(L);
    const apiMark = parseFloat(L?.mark_price || 0);
    const quoteAt = L?.quotes?.updated_at ? Date.parse(L.quotes.updated_at) : 0;
    const quoteFresh = quoteAt > 0 && Date.now() - quoteAt < 5 * 60 * 1000;

    // Public mark_price is often sticky (origin returns same value for minutes).
    // Indicative quote mid (bid/ask) updates with quotes.updated_at — use that for live UI/uPnL.
    if (mid > 0 && (quoteFresh || !(apiMark > 0))) {
      const entry = { mark: mid, at: Date.now(), source: 'quote' };
      for (const c of varOmniListingCandidates(tick)) _varOmniMarkCache[c] = entry;
      return { mark: mid, bid, ask, apiMark, quoteMid: mid, source: 'quote', listing: L };
    }

    if (apiMark > 0) {
      const entry = { mark: apiMark, at: Date.now(), source: 'mark' };
      for (const c of varOmniListingCandidates(tick)) _varOmniMarkCache[c] = entry;
      return { mark: apiMark, bid, ask, apiMark, quoteMid: mid, source: 'mark', listing: L };
    }

    // Stale-while-revalidate: keep last good Omni mark for a long time if refresh fails.
    const cached = varOmniCachedMark(tick);
    if (cached?.mark > 0 && Date.now() - cached.at < 30 * 60 * 1000) {
      return {
        mark: cached.mark, bid, ask, apiMark, quoteMid: mid,
        source: cached.source || 'cache', listing: L,
      };
    }

    if (mid > 0) {
      return { mark: mid, bid, ask, apiMark, quoteMid: mid, source: 'quote', listing: L };
    }

    if (cached?.mark > 0) {
      return {
        mark: cached.mark, bid, ask, apiMark, quoteMid: mid,
        source: 'cache', listing: L,
      };
    }
    return { mark: 0, bid, ask, apiMark, quoteMid: mid, source: null, listing: L };
  }

  function varHlLiveMarkForCoin(coin) {
    const map = _varHlFunding?.map;
    if (!map || !coin) return 0;
    const c = String(coin);
    const short = c.replace(/^xyz:/i, '').toUpperCase();
    const e = map[c.toUpperCase()] || map[short] || map['XYZ:' + short] || map['xyz:' + short];
    const m = parseFloat(e?.markPx || 0);
    return m > 0 ? m : 0;
  }

  function varFmtPx(n) {
    const v = Number(n);
    if (!isFinite(v) || v <= 0) return '—';
    if (v >= 1000) return v.toLocaleString(varLoc(), { maximumFractionDigits: 2 });
    if (v >= 1) return v.toLocaleString(varLoc(), { maximumFractionDigits: 4 });
    return v.toLocaleString(varLoc(), { maximumFractionDigits: 6 });
  }

  function varFmtQty(n) {
    const v = Number(n);
    if (!isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 100) return v.toLocaleString(varLoc(), { maximumFractionDigits: 2 });
    if (a >= 1) return v.toLocaleString(varLoc(), { maximumFractionDigits: 4 });
    return v.toLocaleString(varLoc(), { maximumFractionDigits: 6 });
  }

  function varPnlStyle(n) {
    if (n == null || !isFinite(n)) return '';
    if (n > 0) return 'color:var(--success)';
    if (n < 0) return 'color:var(--danger)';
    return '';
  }

  function varEnrichOmniLive(p) {
    if (!p) return null;
    const meta = varOmniLiveMarkMeta(p.market);
    const posMark = parseFloat(p.mark) > 0 ? parseFloat(p.mark) : 0;
    // Never keep a stale imported mark over a fresh public mark_price.
    const mark = meta.mark > 0 ? meta.mark : (posMark || 0);
    const entry = parseFloat(p.entry) > 0 ? parseFloat(p.entry) : 0;
    const qty = parseFloat(p.qty) > 0 ? parseFloat(p.qty) : 0;
    const notional = qty > 0 && mark > 0 ? qty * mark : (qty > 0 && entry > 0 ? qty * entry : (parseFloat(p.notional) || 0));
    let upnl = null;
    if (entry > 0 && mark > 0 && qty > 0) {
      upnl = (p.side === 'short' ? -1 : 1) * (mark - entry) * qty;
    } else if (p.upnl != null && isFinite(Number(p.upnl))) {
      upnl = Number(p.upnl);
    }
    return {
      ...p,
      mark,
      entry,
      qty,
      notional,
      upnl,
      markLive: meta.mark > 0,
      markSource: meta.source,
      listingTicker: meta.listing?.ticker || p.market,
      hasEntry: entry > 0,
    };
  }

  function varResolveOmniLegLive(leg) {
    if (!leg?.ticker) return null;
    const saved = varLegLoad();
    const book = (varGetOmniBookPositions().positions || [])
      .map(varEnrichOmniLive)
      .find(p => {
        const m = String(p.market || '').toUpperCase();
        const t = String(leg.ticker || '').toUpperCase();
        if (m === t) return true;
        const cands = varOmniListingCandidates(t);
        return cands.includes(m) || cands.includes(String(p.listingTicker || '').toUpperCase());
      });
    const meta = varOmniLiveMarkMeta(leg.ticker);
    const markLive = meta.mark || book?.mark || 0;
    const formEntry = parseFloat(leg.entryPx) > 0 ? parseFloat(leg.entryPx) : 0;
    const savedEntry = (saved && String(saved.ticker || '').toUpperCase() === String(leg.ticker || '').toUpperCase()
      && parseFloat(saved.entryPx) > 0)
      ? parseFloat(saved.entryPx) : 0;
    const entry = formEntry || savedEntry || book?.entry || 0;
    const mark = markLive > 0 ? markLive : 0;
    let qty = book?.qty || 0;
    const notionForm = Math.abs(parseFloat(leg.notional) || 0);
    if (!(qty > 0) && notionForm > 0) {
      const px = entry > 0 ? entry : mark;
      qty = px > 0 ? notionForm / px : 0;
    }
    const notional = qty > 0 && mark > 0 ? qty * mark : (qty > 0 && entry > 0 ? qty * entry : notionForm);
    let upnl = null;
    if (entry > 0 && mark > 0 && qty > 0) {
      upnl = (leg.side === 'short' ? -1 : 1) * (mark - entry) * qty;
    }
    return {
      ticker: leg.ticker,
      side: leg.side,
      qty,
      entry,
      mark,
      notional,
      upnl,
      markLive: mark > 0,
      markSource: meta.source,
      listingTicker: meta.listing?.ticker || leg.ticker,
      fromBook: !!book,
      needsEntry: !(entry > 0) && qty > 0 && mark > 0,
    };
  }

  let _varHedgePollTimer = null;
  let _varHedgePollBusy = false;
  let _varHedgePollActive = false;
  let _varHedgeLastTickAt = 0;
  const VAR_HEDGE_POLL_MS = 5000;

  function varStopHedgeLivePoll() {
    _varHedgePollActive = false;
    if (_varHedgePollTimer) {
      clearTimeout(_varHedgePollTimer);
      _varHedgePollTimer = null;
    }
  }

  function varHedgePanelVisible() {
    return false;
  }

  function varStartHedgeLivePoll() {
    varStopHedgeLivePoll();
  }

  function varWithTimeout(promise, ms) {
    let to;
    return Promise.race([
      Promise.resolve(promise).finally(() => { if (to) clearTimeout(to); }),
      new Promise((_, rej) => { to = setTimeout(() => rej(new Error('timeout')), ms); }),
    ]);
  }

  async function varRefreshOmniMarksOnly() {
    const stats = await varWithTimeout(fetchVarStats(true), 8000);
    if (stats?.listings?.length) {
      varIndexOmniListings(stats.listings);
      _varOmniBookMemo = null;
      _varOmniBookMemoTs = 0;
      return true;
    }
    return false;
  }

  async function varHedgeLiveTick() {
    if (!varHedgePanelVisible()) return;
    if (_varHedgePollBusy) return;
    _varHedgePollBusy = true;
    _varOmniBookMemo = null;
    _varOmniBookMemoTs = 0;
    try {
      // Parallel: Omni stats + HL marks so Omni leg can fall back to XYZ mark if needed
      await Promise.all([
        varRefreshOmniMarksOnly().catch(() => false),
        varWithTimeout(fetchHlFundingMap(true), 6000).catch(() => null),
      ]);
      _varHedgeLastTickAt = Date.now();
      if (varHedgePanelVisible()) renderVarHedge(true);

      await varRefreshHlPositionsLight().catch(() => {});
      _varHedgeLastTickAt = Date.now();
      if (varHedgePanelVisible()) renderVarHedge(true);
    } catch (_) {
      _varHedgeLastTickAt = Date.now();
      if (varHedgePanelVisible()) {
        try { renderVarHedge(true); } catch (__) {}
      }
    } finally {
      _varHedgePollBusy = false;
    }
  }

  async function varRefreshHlPositionsLight() {
    if (typeof hlPost !== 'function' || typeof wallets === 'undefined' || !wallets?.length) return false;
    let changed = false;
    // Active wallet first for speed; others optional
    const active = typeof activeWallet !== 'undefined' && activeWallet ? activeWallet : null;
    const ordered = active
      ? [active, ...wallets.filter(w => w !== active)]
      : wallets.slice();
    const targets = ordered.slice(0, Math.min(ordered.length, 2));
    for (const w of targets) {
      try {
        const [hlState, xyzState] = await Promise.all([
          varWithTimeout(hlPost({ type: 'clearinghouseState', user: w }), 5000),
          varWithTimeout(hlPost({ type: 'clearinghouseState', user: w, dex: 'xyz' }), 5000).catch(() => null),
        ]);
        const pos = [];
        const take = (state, dex) => {
          (state?.assetPositions || []).forEach(ap => {
            const p = ap?.position;
            if (!p) return;
            if (Math.abs(parseFloat(p.szi || 0)) < 1e-12) return;
            pos.push({ ...p, _wallet: w, _dex: dex });
          });
        };
        take(hlState, 'HL');
        if (xyzState) take(xyzState, 'XYZ');
        if (typeof fillsByWallet !== 'undefined') {
          if (!fillsByWallet[w]) fillsByWallet[w] = { hl: [], xyz: [], bridge: [], funding: [], positions: [] };
          fillsByWallet[w].positions = pos;
        }
        changed = true;
      } catch (_) {}
    }
    if (changed && typeof fillsByWallet !== 'undefined' && typeof allPositions !== 'undefined') {
      const merged = [];
      for (const w of wallets) {
        const ps = fillsByWallet[w]?.positions;
        if (ps?.length) merged.push(...ps);
      }
      // Keep other wallets' previous positions if we skipped them this tick
      if (targets.length < wallets.length) {
        const kept = new Set(targets);
        for (const p of allPositions || []) {
          if (p?._wallet && !kept.has(p._wallet)) merged.push(p);
        }
      }
      allPositions = merged;
    }
    return changed;
  }

  function varHedgeLastTickLabel() {
    if (!_varHedgeLastTickAt) return varT('var.hedgeLiveTick');
    try {
      const when = new Date(_varHedgeLastTickAt).toLocaleTimeString(varLoc(), {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      return varT('var.hedgeLastTick').replace('{when}', when);
    } catch (_) {
      return varT('var.hedgeLiveTick');
    }
  }

  function varEsc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function varVenuePill(dex) {
    const isXyz = dex === 'XYZ';
    return `<span class="var-hedge-book-venue${isXyz ? ' var-hedge-book-venue--xyz' : ''}">${isXyz ? varT('var.venueXyz') : varT('var.venueHl')}</span>`;
  }

  function varGetTradeBooks() {
    const omniBook = varGetOmniBookPositions();
    const omni = (omniBook.positions || []).map(varEnrichOmniLive).filter(Boolean)
      .sort((a, b) => b.notional - a.notional);
    const raw = typeof getActivePositions === 'function' ? getActivePositions() : (window.allPositions || []);
    const trade = (raw || []).map(varNormalizeTradePos).filter(Boolean)
      .sort((a, b) => b.notionalUsd - a.notionalUsd);
    return {
      omni,
      omniSource: omniBook.source,
      trade,
      omniMeta: omniBook.meta,
      pulledAt: omniBook.meta?.pulled_at || omniBook.meta?.importedAt || null,
    };
  }

  function varTradePosKey(p) {
    return `${p.dex}|${String(p.coin || '').toUpperCase()}|${p.wallet || ''}`;
  }

  function varHedgeLivePairs(books) {
    const used = new Set();
    const pairs = [];
    for (const o of books.omni || []) {
      let hedge = varHlPositionForTicker(o.market);
      if (hedge) {
        const key = varTradePosKey(hedge);
        // One HL/XYZ claim per hedge position — avoid double-counting uPnL on Omni clones.
        if (used.has(key)) hedge = null;
        else used.add(key);
      }
      const leg = {
        ticker: o.market,
        side: o.side,
        notional: o.notional || (o.qty * (o.mark || o.entry || 0)),
      };
      const delta = varComputeDelta(leg, hedge);
      pairs.push({ omni: o, hedge, delta });
    }
    const unpairedTrade = (books.trade || []).filter(p => !used.has(varTradePosKey(p)));
    return { pairs, unpairedTrade };
  }

  function varFmtOmniAge(meta, source) {
    const acc = varAccountsLoad();
    const filled = varOmniSlotIds(acc).filter(id => (acc.slots[id]?.csv?.trades || []).length);
    if (filled.length > 1) {
      return filled.map(id => acc.slots[id].label).join(' + ');
    }
    if (source === 'fills') return varT('var.hedgeBooksFromFills');
    const ts = meta?.importedAt || (meta?.pulled_at ? Date.parse(meta.pulled_at) : 0);
    if (!ts || !isFinite(ts)) {
      if (meta?.error) return String(meta.error);
      return varT('var.hedgeBooksStale');
    }
    let when;
    try {
      when = new Date(ts).toLocaleString(varLoc(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (_) {
      when = new Date(ts).toISOString();
    }
    return varT('var.hedgeBooksAge').replace('{when}', when);
  }

  function varHedgeBookOmniRow(o, activeTick, paired) {
    const usd = o.notional || (o.qty * (o.mark || o.entry || 0));
    const active = activeTick && String(activeTick).toUpperCase() === o.market;
    const cls = `var-hedge-book-row${active ? ' is-active' : ''}${paired ? ' is-paired' : ' is-unpaired'}`;
    const src = o.live ? 'LIVE' : (o.fromFills ? varT('var.hedgeBooksFillsTag') : '');
    const acct = o.accountLabel
      ? `<span class="var-hedge-book-acct" style="display:inline-block;font-size:.62rem;font-weight:700;padding:1px 6px;border-radius:4px;background:rgba(76,154,248,.18);color:var(--var-accent,#4c9af8);margin-right:6px">${varEsc(o.accountLabel)}</span>`
      : '';
    const sub = paired ? varT('var.hedgeBooksPaired') : varT('var.hedgeBooksUnpaired');
    const pnl = o.upnl;
    return `<button type="button" class="${cls}" onclick="varHedgeUseLiveOmni('${varEsc(o.market)}')">
      <div class="var-hedge-book-main">${acct}${varSidePill(o.side)} <strong>${varEsc(o.market)}</strong>${src ? ` <span style="color:var(--var-accent,#4c9af8);font-size:.62rem">${src}</span>` : ''}</div>
      <div class="var-hedge-book-usd">${varFmtUsd(usd)}</div>
      <div class="var-hedge-book-sub">${sub} · ${varT('var.hedgeSz')} ${varFmtQty(o.qty)} · ${varT('var.hedgeMark')} ${varFmtPx(o.mark)}${o.entry ? ' · ' + varT('var.hedgeEntry') + ' ' + varFmtPx(o.entry) : ''}${pnl != null ? ` · <span style="${varPnlStyle(pnl)}">${varFmtSignedUsd(pnl)}</span>` : ''}</div>
    </button>`;
  }

  function varHedgeBookTradeRow(p, activeTick) {
    const short = String(p.coin || '').replace(/^xyz:/i, '');
    const mapped = activeTick ? varHlCoinForTicker(activeTick) : '';
    const active = mapped && (
      String(p.coin).toUpperCase() === mapped.toUpperCase()
      || short.toUpperCase() === mapped.replace(/^xyz:/i, '').toUpperCase()
    );
    const cls = `var-hedge-book-row${active ? ' is-active' : ''}`;
    const pnl = p.upnl;
    return `<div class="${cls}" style="cursor:default">
      <div class="var-hedge-book-main">${varVenuePill(p.dex)} ${varSidePill(p.side)} <strong>${varEsc(short)}</strong></div>
      <div class="var-hedge-book-usd">${varFmtUsd(p.notionalUsd)}</div>
      <div class="var-hedge-book-sub">${varEsc(p.coin)} · ${varT('var.hedgeSz')} ${varFmtQty(p.qty)} · ${varT('var.hedgeMark')} ${varFmtPx(p.mark)}${p.entry ? ' · ' + varT('var.hedgeEntry') + ' ' + varFmtPx(p.entry) : ''}${pnl != null ? ` · <span style="${varPnlStyle(pnl)}">${varFmtSignedUsd(pnl)}</span>` : ''}</div>
    </div>`;
  }

  function renderVarHedgeLiveBooks(activeTick) {
    const host = document.getElementById('varHedgeLiveBooks');
    if (!host) return;
    const books = varGetTradeBooks();
    // If Omni books exist but marks are missing, force a public stats refresh once.
    if ((books.omni || []).some(o => !(o.mark > 0)) && !window.__hsVarMarkKick) {
      window.__hsVarMarkKick = 1;
      varRefreshOmniMarksOnly().then((ok) => {
        window.__hsVarMarkKick = 0;
        if (ok && varHedgePanelVisible()) renderVarHedge(true);
      }).catch(() => { window.__hsVarMarkKick = 0; });
    }
    const { pairs, unpairedTrade } = varHedgeLivePairs(books);
    const pairedMarkets = new Set(pairs.filter(x => x.hedge).map(x => x.omni.market));
    const omniRows = books.omni.length
      ? books.omni.map(o => varHedgeBookOmniRow(o, activeTick, pairedMarkets.has(o.market))).join('')
      : `<div class="var-hedge-books-empty">${varT('var.hedgeBooksEmptyOmni')}<div style="margin-top:8px"><button type="button" class="btn btn-ac text-xs" style="padding:4px 10px" onclick="varFocusOmniImport()">${varT('var.importJson')}</button></div></div>`;
    const tradeRows = books.trade.length
      ? books.trade.map(p => varHedgeBookTradeRow(p, activeTick)).join('')
      : `<div class="var-hedge-books-empty">${varT('var.hedgeBooksEmptyTrade')}</div>`;

    const matched = pairs.filter(x => x.hedge);
    let pairsHtml = '';
    if (matched.length) {
      pairsHtml = `<div class="var-hedge-pairs"><p class="var-hedge-pairs-title">${varT('var.hedgeBooksPairs')}</p>${matched.map(x => {
        const d = x.delta;
        const ok = d && d.driftPct <= 5;
        const hedgeShort = String(x.hedge.coin || '').replace(/^xyz:/i, '');
        const netPnl = (x.omni.upnl != null || x.hedge.upnl != null)
          ? (Number(x.omni.upnl) || 0) + (Number(x.hedge.upnl) || 0)
          : null;
        return `<button type="button" class="var-hedge-pair" onclick="varHedgeUseLiveOmni('${varEsc(x.omni.market)}')">
          <div>${x.omni.accountLabel ? `<span style="font-size:.62rem;font-weight:700;color:var(--var-accent,#4c9af8);margin-right:4px">${varEsc(x.omni.accountLabel)}</span>` : ''}${varSidePill(x.omni.side)} <strong>${varEsc(x.omni.market)}</strong> <span style="color:var(--muted);font-size:.72rem">${varFmtUsd(x.omni.notional)}</span>${x.omni.upnl != null ? ` <span style="font-size:.72rem;${varPnlStyle(x.omni.upnl)}">${varFmtSignedUsd(x.omni.upnl)}</span>` : ''}</div>
          <div class="var-hedge-pair-mid">↔</div>
          <div>${varVenuePill(x.hedge.dex)} ${varSidePill(x.hedge.side)} <strong>${varEsc(hedgeShort)}</strong> <span style="color:var(--muted);font-size:.72rem">${varFmtUsd(x.hedge.notionalUsd)}</span>${x.hedge.upnl != null ? ` <span style="font-size:.72rem;${varPnlStyle(x.hedge.upnl)}">${varFmtSignedUsd(x.hedge.upnl)}</span>` : ''}</div>
          <div class="var-hedge-pair-delta ${ok ? 'ok' : 'warn'}">${netPnl != null ? `<span style="${varPnlStyle(netPnl)}">${varFmtSignedUsd(netPnl)}</span>` : varT('var.hedgeBooksDelta').replace('{usd}', varFmtUsd(d ? d.net : 0))}</div>
        </button>`;
      }).join('')}</div>`;
    }

    host.innerHTML = `
      <div class="var-hedge-books-head">
        <p class="var-hedge-books-title">${varT('var.hedgeBooksTitle')}</p>
        <div class="var-hedge-books-actions">
          <button type="button" class="btn btn-ghost text-xs" style="padding:4px 10px" onclick="varRefreshOmniFromLocal()">${varT('var.hedgeBooksRefreshOmni')}</button>
          <button type="button" class="btn btn-ghost text-xs" style="padding:4px 10px" onclick="varRefreshHlLeg()">${varT('var.hedgeBooksRefreshTrade')}</button>
        </div>
        <div class="var-hedge-books-meta">${varFmtOmniAge(books.omniMeta, books.omniSource)} · Omni ${books.omni.length} · HL/XYZ ${books.trade.length}${unpairedTrade.length ? ' · ' + unpairedTrade.length + ' ' + varT('var.hedgeBooksUnpaired').toLowerCase() : ''} · <span id="varHedgeLiveClock" style="color:var(--var-accent,#4c9af8)">${varHedgeLastTickLabel()}</span></div>
      </div>
      <div class="var-hedge-books-grid">
        <div class="var-hedge-books-col var-hedge-books-col--omni">
          <div class="var-hedge-books-col-h">${varT('var.hedgeBooksOmni')}</div>
          ${omniRows}
        </div>
        <div class="var-hedge-books-col var-hedge-books-col--trade">
          <div class="var-hedge-books-col-h">${varT('var.hedgeBooksTrade')}</div>
          ${tradeRows}
        </div>
      </div>
      ${pairsHtml}`;
  }

  function varHedgeUseLiveOmni(market) {
    const tick = String(market || '').trim().toUpperCase();
    const book = varGetOmniBookPositions();
    const o = (book.positions || []).find(p => String(p.market || '').toUpperCase() === tick);
    if (!o) {
      if (typeof toast === 'function') toast(varT('var.hedgeBooksEmptyOmni'), true);
      return;
    }
    const notional = o.notional || (o.qty * (o.mark || o.entry || 0));
    const leg = {
      ticker: o.market,
      side: o.side === 'long' ? 'long' : 'short',
      notional: notional > 0 ? notional : 0,
      entryPx: o.entry || 0,
      updatedAt: Date.now(),
      fromLive: true,
    };
    if (!leg.notional) {
      if (typeof toast === 'function') toast(varT('var.hedgeBooksEmptyOmni'), true);
      return;
    }
    varLegSave(leg);
    const tickEl = document.getElementById('varLegTicker');
    const sideEl = document.getElementById('varLegSide');
    const notEl = document.getElementById('varLegNotional');
    const pxEl = document.getElementById('varLegEntry');
    if (tickEl) tickEl.value = leg.ticker;
    if (sideEl) sideEl.value = leg.side;
    if (notEl) notEl.value = String(Math.round(leg.notional * 100) / 100);
    if (pxEl) pxEl.value = leg.entryPx ? String(leg.entryPx) : '';
    renderVarHedge(false);
    if (typeof toast === 'function') toast(varT('var.hedgeBooksApplied'));
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

  function varRadarSort(listings, mode, hlMap, noSlice, bookMap) {
    let rows = [...(listings || [])];
    const notional = varRadarNotional();
    const holdDays = varRadarHoldDays();
    if (mode === 'funding' || mode === 'spread') {
      rows = rows.filter(L => parseFloat(L.volume_24h || 0) >= 25000);
    }
    if (mode === 'funding') {
      rows.sort((a, b) => {
        const na = varRadarNetMetrics(a, hlMap, notional, holdDays, bookMap).netApr;
        const nb = varRadarNetMetrics(b, hlMap, notional, holdDays, bookMap).netApr;
        return (nb ?? -1e9) - (na ?? -1e9);
      });
    } else if (mode === 'spread') {
      rows.sort((a, b) => {
        const sa = varOmniSpreadBpsAtSize(a, notional) || 0;
        const sb = varOmniSpreadBpsAtSize(b, notional) || 0;
        return sb - sa;
      });
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

  function varHlFundingAtFloor(hl) {
    const f = parseFloat(hl?.fundingHr);
    return isFinite(f) && Math.abs(f - VAR_HL_FUNDING_FLOOR_HR) < 1e-10;
  }

  function varFmtHlAprCell(hlDaily, hl) {
    if (hlDaily == null || !isFinite(hlDaily)) return '—';
    const body = varFmtApr(varDailyToApr(hlDaily), true);
    const rawTip = varT('var.hlFundingRawHint')
      .replace('{coin}', hl?.coin || '—')
      .replace('{hr}', hl?.fundingHr != null ? String(hl.fundingHr) : '—');
    const floorTip = varHlFundingAtFloor(hl) ? ` · ${varT('var.hlFundingFloorHint')}` : '';
    const tip = rawTip + floorTip;
    if (varHlFundingAtFloor(hl)) {
      return `<span title="${tip.replace(/"/g, '&quot;')}">${body}<span style="font-size:.65rem;color:var(--muted);margin-left:2px" title="${varT('var.hlFundingFloorHint')}">⬚</span></span>`;
    }
    return `<span title="${tip.replace(/"/g, '&quot;')}">${body}</span>`;
  }

  function varCompareListings(listings, hlMap, minVol) {
    const out = [];
    for (const L of listings || []) {
      const vol = parseFloat(L.volume_24h || 0);
      if (vol < minVol) continue;
      const tick = String(L.ticker || '').toUpperCase();
      if (!varHlMapLookup(hlMap, tick)) continue;
      const varDaily = varFundingDailyPct(L.funding_rate, L.funding_interval_s);
      if (varDaily == null) continue;
      out.push(L);
    }
    return out;
  }

  function varCompareSortRows(rows, hlMap, bookMap) {
    const notional = varRadarNotional();
    const holdDays = varRadarHoldDays();
    return [...rows].sort((a, b) => {
      const na = varRadarNetMetrics(a, hlMap, notional, holdDays, bookMap).netApr;
      const nb = varRadarNetMetrics(b, hlMap, notional, holdDays, bookMap).netApr;
      return (nb ?? -1e9) - (na ?? -1e9);
    }).slice(0, 40);
  }

  function varNormalizeSub(sub) {
    const s = String(sub || '');
    if (s === 'activity' || s === 'hedge' || s === 'live' || s === 'farm') return 'dashboard';
    if (s === 'overview' || s === 'trading' || s === 'history') return 'dashboard';
    if (s === 'rank' || s === 'ranking') return 'classement';
    if (s === 'track' || s === 'tracking' || s === 'farm-suivi') return 'suivi';
    if (s === 'ext' || s === 'install') return 'extension';
    if (s === 'labs') return 'lab';
    return s || 'dashboard';
  }

  function varIsLiveDashTab(sub) {
    const t = sub == null ? _varSub : sub;
    return t === 'dashboard' || t === 'live';
  }

  function varIsPointsTab(sub) {
    return sub === 'points' || sub === 'lab' || sub === 'competition' || sub === 'airdrop';
  }

  function varIsMoreTab(sub) {
    return false;
  }

  function varCloseMoreMenu() {
    const menu = document.getElementById('varMoreMenu');
    if (menu) menu.open = false;
  }

  function varEnsureFarmVariaFrame(tab) {
    const id = tab === 'classement' ? 'varClassementFrame' : 'varSuiviFrame';
    const hash = tab === 'classement' ? '#classement' : '#suivi';
    const frame = document.getElementById(id);
    if (!frame) return;
    const want = 'farm-varia.html?embed=1' + hash;
    try {
      const cur = String(frame.getAttribute('src') || '');
      if (!cur.includes(hash.replace('#', '')) || !cur.includes('embed=1')) {
        frame.src = want;
      } else if (frame.contentWindow && frame.contentWindow.location) {
        const h = String(frame.contentWindow.location.hash || '');
        if (h !== hash) frame.contentWindow.location.hash = hash.slice(1) ? hash : hash;
      }
    } catch (_) {
      frame.src = want;
    }
  }

  function varSetSub(sub, el) {
    const tab = varNormalizeSub(sub);
    _varSub = tab;
    if (tab === 'airdrop') _varPointsView = 'airdrop';
    else if (tab === 'lab') _varPointsView = 'lab';
    else if (tab === 'competition') _varPointsView = 'competition';
    else if (tab === 'points') _varPointsView = 'points';

    document.querySelectorAll('#page-variational .var-dash-nav .var-sub-tab[data-varsub]').forEach(t => {
      t.classList.toggle('active', t.dataset.varsub === tab);
    });
    const more = document.getElementById('varMoreMenu');
    if (more) {
      more.classList.toggle('is-active', varIsMoreTab(tab));
      more.querySelectorAll('[data-varsub]').forEach(btn => {
        btn.classList.toggle('is-on', btn.dataset.varsub === tab);
      });
    }

    const act = document.querySelector('#page-variational .var-sub-panel[data-varpanel="activity"]');
    const pts = document.querySelector('#page-variational .var-sub-panel[data-varpanel="points"]');
    const radar = document.querySelector('#page-variational .var-sub-panel[data-varpanel="radar"]');
    const hedge = document.querySelector('#page-variational .var-sub-panel[data-varpanel="hedge"]');
    const overview = document.getElementById('varSecOverviewPanel');
    const suivi = document.getElementById('varSecSuivi');
    const classement = document.getElementById('varSecClassement');
    const extension = document.getElementById('varSecExtension');
    const onboard = document.getElementById('varActivityOnboard');
    const dashCta = document.getElementById('varDashExtCta');
    const actTable = document.getElementById('varActivityTable');
    const actKpiGrid = document.getElementById('varActVol') && document.getElementById('varActVol').closest('.grid');
    const pointsInner = document.querySelector('#page-variational .var-points-inner');

    const hideAll = () => {
      if (overview) overview.style.display = 'none';
      if (act) act.style.display = 'none';
      if (pts) pts.style.display = 'none';
      if (radar) radar.style.display = 'none';
      if (hedge) hedge.style.display = 'none';
      if (suivi) suivi.style.display = 'none';
      if (classement) classement.style.display = 'none';
      if (extension) extension.style.display = 'none';
    };
    hideAll();

    if (actTable) actTable.style.display = 'none';
    if (actKpiGrid) actKpiGrid.style.display = 'none';

    if (tab === 'dashboard' || tab === 'live') {
      if (act) act.style.display = 'block';
      if (hedge) hedge.style.display = 'none';
      const liveHead = act && act.querySelector(':scope > .border-b');
      if (liveHead) liveHead.style.display = '';
      varStopHedgeLivePoll();
      try { varBindJsonDrop(); } catch (_) {}
      try { varUpdateOmniExtUi(); } catch (_) {}
      setTimeout(() => {
        if (_varSub !== 'dashboard') return;
        try { renderVarActivity(); } catch (_) {}
        varRefreshHlPositionsLight().then(() => {
          if (_varSub === 'dashboard') {
            try { varRenderLiveDashboard(); } catch (_) {}
          }
        }).catch(() => {});
      }, 0);
    } else if (tab === 'suivi') {
      if (suivi) suivi.style.display = 'block';
      varStopHedgeLivePoll();
      varEnsureFarmVariaFrame('suivi');
    } else if (tab === 'classement') {
      if (classement) classement.style.display = 'block';
      varStopHedgeLivePoll();
      varEnsureFarmVariaFrame('classement');
    } else if (tab === 'extension') {
      if (extension) extension.style.display = 'block';
      if (onboard) onboard.style.display = '';
      varStopHedgeLivePoll();
      try { varUpdateOmniExtUi(); } catch (_) {}
    } else if (tab === 'history' || tab === 'overview') {
      if (overview) overview.style.display = 'block';
      if (hedge) hedge.style.display = 'none';
      if (onboard) onboard.style.display = 'none';
      if (dashCta) dashCta.style.display = 'none';
      const ready = document.getElementById('varLiveReady');
      if (ready) { ready.style.display = 'none'; ready.hidden = true; }
      const dashEl = document.getElementById('varDash');
      if (dashEl) dashEl.style.display = '';
      const hero = document.getElementById('varUserHeroKpis');
      if (hero) hero.style.display = 'none';
      const overviewLead = document.querySelector('#varSecOverview .var-overview-lead');
      if (overviewLead) overviewLead.style.display = 'none';
      varStopHedgeLivePoll();
      setTimeout(() => {
        try { renderVarDash(); } catch (_) {}
      }, 0);
    } else if (varIsPointsTab(tab)) {
      if (pts) pts.style.display = 'block';
      if (onboard) onboard.style.display = 'none';
      const ready = document.getElementById('varLiveReady');
      if (ready) { ready.style.display = 'none'; ready.hidden = true; }
      if (pointsInner) {
        const showInner = tab === 'points' || tab === 'competition';
        pointsInner.hidden = !showInner;
        pointsInner.style.display = showInner ? '' : 'none';
      }
      renderVarPoints();
      if (tab === 'airdrop') {
        try { renderVarAirdrop(); } catch (_) {}
      }
    } else if (tab === 'radar') {
      if (radar) radar.style.display = 'block';
      renderVarRadar();
    }

    try {
      const hashMap = {
        dashboard: '#var-omni-live',
        live: '#var-omni-live',
        suivi: '#var-suivi',
        classement: '#var-classement',
        extension: '#var-extension',
        points: '#var-points',
        lab: '#var-lab',
        competition: '#var-competition',
        airdrop: '#var-airdrop',
        radar: '#var-radar',
        history: '#var-history',
      };
      const nextHash = hashMap[tab];
      if (nextHash && location.hash !== nextHash) {
        history.replaceState(null, '', nextHash);
      }
    } catch (_) {}

    if (el) {
      const target = document.getElementById('varDashboard') || document.getElementById('page-variational');
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function varSetPointsView(view, el) {
    if (view === 'airdrop') varSetSub('airdrop', el || null);
    else if (view === 'lab') varSetSub('lab', el || null);
    else if (view === 'points') varSetSub('points', el || null);
    else varSetSub('competition', el || null);
  }

  function varScrollToDashSection(sub) {
    varSetSub(varNormalizeSub(sub), null);
  }

  function varModeFromSub(sub) {
    const tab = varNormalizeSub(sub);
    if (tab === 'live') return 'live';
    return 'dashboard';
  }

  function renderVarUserHeroKpis() {
    const el = (id, v, sub) => {
      const n = document.getElementById(id);
      if (n) {
        n.textContent = v;
        n.classList.remove('pos', 'neg', 'pnl-pos', 'pnl-neg');
      }
      const s = document.getElementById(id + 'Sub');
      if (s && sub != null) s.textContent = sub;
    };
    const setSigned = (id, num, sub) => {
      const n = document.getElementById(id);
      if (n) {
        n.textContent = varFmtSignedUsd(num);
        n.classList.toggle('pos', num > 0);
        n.classList.toggle('neg', num < 0);
        n.classList.toggle('pnl-pos', num > 0);
        n.classList.toggle('pnl-neg', num < 0);
      }
      const s = document.getElementById(id + 'Sub');
      if (s && sub != null) s.textContent = sub;
    };

    const bundle = varCsvLoadForView();
    const points = varPointsLoad();
    const hasTrades = !!(bundle && bundle.trades && bundle.trades.length);
    const hasPoints = !!(points && (points.points_summary || (points.points_history && points.points_history.length) || points.competition));
    const meta = document.getElementById('varOverviewMeta');

    if (!hasTrades && !hasPoints) {
      el('varKpiVol', '—', varT('var.kpiVolSubEmpty'));
      el('varKpiTvl', '—', '');
      el('varKpiOi', '—', '');
      el('varKpiMkts', '—', '');
      if (meta) meta.textContent = varT('var.overviewEmpty');
      return;
    }

    const dash = hasTrades ? varBuildDashAnalyticsCached(bundle, 'all', { light: true }) : null;
    if (dash) {
      el('varKpiVol', varFmtCompactUsd(dash.volume), varT('var.kpiTradesSub').replace('{n}', String(dash.tradeCount || 0)));
      setSigned('varKpiTvl', dash.realizedPnl,
        dash.winRate != null ? varT('var.kpiWinRateSub').replace('{pct}', dash.winRate.toFixed(1)) : '');
    } else {
      el('varKpiVol', '—', varT('var.kpiVolSubEmpty'));
      el('varKpiTvl', '—', '');
    }

    const sum = points?.points_summary || {};
    const totalPts = parseFloat(sum.total_points ?? sum.total ?? NaN);
    const selfPts = parseFloat(sum.self_points ?? sum.self ?? NaN);
    const refPts = parseFloat(sum.referral_points ?? sum.referral ?? NaN);
    if (isFinite(totalPts)) {
      el('varKpiOi', (Math.round(totalPts * 100) / 100).toLocaleString(varLoc()),
        varT('var.kpiPointsSub')
          .replace('{self}', isFinite(selfPts) ? (Math.round(selfPts * 100) / 100).toLocaleString(varLoc()) : '—')
          .replace('{ref}', isFinite(refPts) ? (Math.round(refPts * 100) / 100).toLocaleString(varLoc()) : '—'));
    } else {
      el('varKpiOi', '—', '');
    }

    const self = points?.competition && !Array.isArray(points.competition) ? points.competition.self : null;
    const place = self && (self.place ?? self.rank ?? self.position);
    const score = self && (self.score ?? self.comp_score);
    if (place != null && place !== '') {
      el('varKpiMkts', '#' + String(place),
        score != null ? varT('var.kpiCompSub').replace('{score}', String(score)) : '');
    } else {
      el('varKpiMkts', '—', '');
    }

    if (meta) {
      const bits = [];
      if (dash && dash.totalTrades) bits.push(dash.totalTrades + ' ' + varT('var.actTrades').toLowerCase());
      if (points?.importedAt) bits.push(varT('var.overviewImported').replace('{ago}', varRelativeAgo(points.importedAt)));
      else if (dash) bits.push(varT('var.dashAll'));
      meta.textContent = bits.join(' · ') || '';
    }
  }

  async function renderVarPlatformKpis(_stats) {
    renderVarUserHeroKpis();
  }

  function varFmtSetupShort(rec, ticker) {
    if (!rec) return '—';
    const omni = rec.omniSide === 'short' ? varT('var.sideShort') : varT('var.sideLong');
    const hl = rec.hlSide === 'short' ? varT('var.sideShort') : varT('var.sideLong');
    const hlTick = varHlCoinShort(ticker);
    return `${omni} Omni · ${hl} HL (${hlTick})`;
  }

  function varFmtSetupPills(rec, ticker) {
    if (!rec) return `<span style="font-size:.78rem;color:var(--muted)">—</span>`;
    const hlTick = varHlCoinShort(ticker);
    const tip = varFmtSetupShort(rec, ticker).replace(/"/g, '&quot;');
    const omniCls = rec.omniSide === 'long' ? 'var-radar-pill-long' : 'var-radar-pill-short';
    const hlCls = rec.hlSide === 'long' ? 'var-radar-pill-long' : 'var-radar-pill-short';
    const omniLbl = rec.omniSide === 'short' ? varT('var.sideShort') : varT('var.sideLong');
    const hlLbl = rec.hlSide === 'short' ? varT('var.sideShort') : varT('var.sideLong');
    return `<span class="var-radar-setup-pills" title="${tip}"><span class="var-radar-pill ${omniCls}">${omniLbl}</span><span class="var-radar-pill-venue">Omni</span><span class="var-radar-pill ${hlCls}">${hlLbl}</span><span class="var-radar-pill-venue">HL · ${hlTick}</span></span>`;
  }

  function varRadarRowAttrs(tick, rec) {
    if (!rec?.omniSide) return '';
    const hint = varT('var.radarRowClickHint').replace(/"/g, '&quot;');
    return ` class="var-radar-row" data-var-tick="${tick}" data-var-side="${rec.omniSide}" onclick="varRadarOpenHedge(this.dataset.varTick,this.dataset.varSide)" title="${hint}"`;
  }

  function varHedgeLegDraft() {
    const saved = varLegLoad();
    const tickRaw = (document.getElementById('varLegTicker')?.value || '').trim().toUpperCase();
    if (tickRaw) {
      const side = document.getElementById('varLegSide')?.value === 'long' ? 'long' : 'short';
      const notional = parseFloat(document.getElementById('varLegNotional')?.value || 0);
      return { ticker: tickRaw, side, notional: isFinite(notional) && notional > 0 ? notional : saved?.notional };
    }
    return saved;
  }

  function varRadarOpenHedge(ticker, omniSide) {
    const tick = String(ticker || '').toUpperCase();
    const side = omniSide === 'long' ? 'long' : omniSide === 'short' ? 'short' : '';
    if (!tick || !side) return;
    const existing = varHedgeLegDraft();
    const notional = varRadarNotional();
    if (existing?.ticker) {
      if (existing.ticker !== tick) {
        if (!confirm(varT('var.radarReplaceLegOther').replace('{old}', existing.ticker).replace('{new}', tick))) return;
      } else if (existing.side !== side) {
        if (!confirm(varT('var.radarReplaceLegSide').replace('{tick}', tick).replace('{old}', existing.side).replace('{new}', side))) return;
      }
    }
    varLegSave({ ticker: tick, side, notional, entryPx: 0, updatedAt: Date.now() });
    const tickEl = document.getElementById('varLegTicker');
    const sideEl = document.getElementById('varLegSide');
    const notEl = document.getElementById('varLegNotional');
    const pxEl = document.getElementById('varLegEntry');
    if (tickEl) tickEl.value = tick;
    if (sideEl) sideEl.value = side;
    if (notEl) notEl.value = String(notional);
    if (pxEl) pxEl.value = '';
    const hedgeTab = document.querySelector('#page-variational .var-sub-tab[data-varsub="dashboard"]');
    varSetSub('dashboard', hedgeTab);
    if (typeof toast === 'function') toast(varT('var.radarLegPrefilled'), false);
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

  function varRadarListingRow(L, mode, hlMap, bookMap) {
    const tick = String(L.ticker || '').toUpperCase();
    const cat = varAssetCategory(tick);
    const mark = parseFloat(L.mark_price || 0);
    const vol = parseFloat(L.volume_24h || 0);
    const notional = varRadarNotional();
    const holdDays = varRadarHoldDays();
    const m = varRadarNetMetrics(L, hlMap, notional, holdDays, bookMap);
    const assetCell = `${varCatBadge(cat)}<span class="font-medium" title="${varHlCoinShort(tick)}">${varHlAssetLabel(tick)}</span>`;
    if (mode === 'funding') {
      const sig = varRadarSignalQuality(m, tick, cat, holdDays, hlMap);
      const netStyle = varAprColorClass(sig, m);
      const netCls = netStyle.startsWith('color:') ? netStyle : '';
      const netClass = netStyle.startsWith('var-') ? netStyle : '';
      const grossCaution = varIsExtremeTradFiFunding(cat, m.grossDaily) ? 'var-radar-apr--caution' : '';
      const setup = m.rec
        ? varFmtSetupPills(m.rec, tick)
        : `<span style="font-size:.78rem;color:var(--muted)">${varT('var.hlNa')}</span>`;
      const beLbl = m.breakEvenDays != null && isFinite(m.breakEvenDays)
        ? m.breakEvenDays < 1 ? '<1' + varT('var.daysShort') : m.breakEvenDays.toFixed(0) + varT('var.daysShort')
        : '—';
      const spreadTip = varFmtSpreadBpsTooltip(m, notional);
      const spreadLbl = m.hlLiquidityInsufficient
        ? varT('var.spreadIlliqShort')
        : (m.spreadBps != null ? m.spreadBps.toFixed(1) : '—');
      const netAprLbl = m.hlLiquidityInsufficient ? '—' : (m.netApr != null ? varFmtApr(m.netApr, true) : '—');
      const sigTip = sig.reasons.join(' · ');
      return `<tr${varRadarRowAttrs(tick, m.rec)}>
        <td class="text-center">${varRadarSignalHtml(sig)}</td>
        <td>${assetCell}</td>
        <td title="${varT('var.colSetupHint')}">${setup}</td>
        <td class="text-right mono ${grossCaution}" title="${varT('var.colGrossAprHint')}">${m.grossApr != null ? varFmtApr(m.grossApr, true) : '—'}</td>
        <td class="text-right mono" style="${m.hlLiquidityInsufficient ? 'color:var(--warning,#e6a817)' : ''}" title="${spreadTip}">${spreadLbl}</td>
        <td class="text-right mono ${netClass}" style="${netCls}" title="${m.hlLiquidityInsufficient ? spreadTip : sigTip}">${netAprLbl}</td>
        <td class="text-right mono" style="color:var(--muted)" title="${varT('var.colBreakEvenHint')}">${beLbl}</td>
        <td class="text-center">${varSparklineHtml(tick)}</td>
        <td class="text-right mono">${varFmtVol(vol)}</td>
      </tr>`;
    }
    const varD = m.varD;
    let cells = `<td>${assetCell}</td><td class="text-right mono">${mark > 0 ? varFmtMark(mark) : '—'}</td>`;
    if (mode === 'spread') {
      const sbps = varOmniSpreadBpsAtSize(L, notional);
      cells += `<td class="text-right mono" title="${varT('var.colSpreadHint').replace('{usd}', varFmtUsd(notional))}">${sbps != null ? sbps.toFixed(1) : parseFloat(L.base_spread_bps || 0).toFixed(1)}</td>`;
      cells += `<td class="text-right mono">${varFmtVol(vol)}</td>`;
    } else {
      cells += `<td class="text-right mono">${varFmtVol(vol)}</td>`;
      cells += `<td class="text-right mono">${varD != null ? varFmtApr(varDailyToApr(varD), true) : '—'}</td>`;
    }
    return `<tr>${cells}</tr>`;
  }

  function varRadarSectionRow(cat, colSpan) {
    return `<tr class="var-radar-cat-row"><td colspan="${colSpan}" style="background:var(--surface-2);font-weight:600;font-size:.75rem;padding:8px 12px;color:var(--text);border-top:1px solid var(--border)">${varCatLabel(cat)}</td></tr>`;
  }

  function varRadarTableHtml(rows, mode, hlMap, catFilter, bookMap) {
    if (!rows.length) {
      return `<div class="text-center text-sm py-10" style="color:var(--muted)">${varT('var.noData')}</div>`;
    }
    const colSpan = mode === 'funding' ? 9 : (mode === 'spread' ? 4 : 4);
    let head = `<tr>`;
    if (mode === 'funding') {
      head += `<th class="text-center" style="min-width:3.4rem">${varThHint(varT('var.colSignal'), varT('var.colSignalHint'))}</th>`;
      head += `<th>${varT('var.colAsset')}</th>`;
      head += `<th>${varThHint(varT('var.colSetup'), varT('var.colSetupHint'))}</th>`;
      head += `<th class="text-right">${varThHint(varT('var.colGrossApr'), varT('var.colGrossAprHint'))}</th>`;
      head += `<th class="text-right">${varThHint(varT('var.colSpreadAt'), varT('var.colSpreadHint').replace('{usd}', varFmtUsd(varRadarNotional())))}</th>`;
      head += `<th class="text-right">${varThHint(varT('var.colNetApr'), varT('var.colNetAprHint').replace('{days}', String(varRadarHoldDays())))}</th>`;
      head += `<th class="text-right">${varThHint(varT('var.colBreakEven'), varT('var.colBreakEvenHint'))}</th>`;
      head += `<th class="text-center">${varThHint(varT('var.colSpark'), varT('var.sparkTitle'))}</th>`;
      head += `<th class="text-right">${varT('var.colVol24h')}</th>`;
    } else {
      head += `<th>${varT('var.colAsset')}</th>`;
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
        body += g.rows.map(L => varRadarListingRow(L, mode, hlMap, bookMap)).join('');
      });
    } else {
      body = rows.slice(0, 60).map(L => varRadarListingRow(L, mode, hlMap, bookMap)).join('');
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
      varIndexOmniListings(listings);
      varRecordFundingHistory(listings);
      varPopulateLegTickers(listings);
      varInitRadarParams();
      let bookMap = {};
      if (mode === 'funding' || mode === 'compare') {
        const minVol = mode === 'compare' ? 50000 : 25000;
        const fundList = listings.filter(L => varHlMapLookup(hlMap, L.ticker) && parseFloat(L.volume_24h || 0) >= minVol);
        const coins = fundList.map(L => {
          const hl = varHlMapLookup(hlMap, L.ticker);
          return hl?.coin || varHlCoinForTicker(L.ticker);
        });
        bookMap = await fetchHlBookMap(coins);
      }
      if (mode === 'compare') {
        let list = varCompareListings(listings, hlMap, 50000);
        list = varCompareSortRows(list, hlMap, bookMap);
        list = catFilter === 'all' ? list : list.filter(L => varAssetCategory(L.ticker) === catFilter);
        host.innerHTML = varCompareTableHtml(list, hlMap, bookMap, catFilter);
      } else {
        let list = listings;
        if (mode === 'funding') {
          list = listings.filter(L => varHlMapLookup(hlMap, L.ticker) && parseFloat(L.volume_24h || 0) >= 25000);
        }
        let rows = varRadarSort(list, mode, hlMap, true, bookMap);
        rows = varRadarFilterCategory(rows, catFilter);
        host.innerHTML = varRadarTableHtml(rows, mode, hlMap, catFilter, bookMap);
      }
      const ts = document.getElementById('varRadarUpdated');
      if (ts) ts.textContent = new Date().toLocaleTimeString(varLoc());
    } catch (e) {
      host.innerHTML = `<div class="text-center text-sm py-10" style="color:var(--danger)">${varT('var.apiError')}: ${e.message}</div>`;
    }
  }

  function varCompareTableHtml(rows, hlMap, bookMap, catFilter) {
    if (!rows.length) return `<div class="text-center text-sm py-10" style="color:var(--muted)">${varT('var.noCompare')}</div>`;
    const notional = varRadarNotional();
    const holdDays = varRadarHoldDays();
    const colSpan = 9;
    const warn = `<div class="var-radar-compare-warn card2 p3 mb-2" style="border-left:3px solid var(--warning,#e6a817);margin:8px 0 10px;background:rgba(230,168,23,.07)">
      <div style="font-size:.78rem;font-weight:600;margin-bottom:4px;color:var(--warning,#e6a817)">${varT('var.radarCompareWarnTitle')}</div>
      <p style="font-size:.8rem;color:var(--muted);margin:0;line-height:1.5">${varT('var.radarCompareWarnBody')}</p>
    </div>`;
    let body = '';
    const renderCompareRow = (L) => {
      const tick = String(L.ticker || '').toUpperCase();
      const cat = varAssetCategory(tick);
      const hl = varHlMapLookup(hlMap, tick);
      const m = varRadarNetMetrics(L, hlMap, notional, holdDays, bookMap);
      const sig = varRadarSignalQuality(m, tick, cat, holdDays, hlMap);
      const varD = m.varD;
      const hlD = m.hlD;
      const grossGap = m.grossDaily != null ? Math.abs(m.grossDaily) : null;
      const netStyle = varAprColorClass(sig, m);
      const netCls = netStyle.startsWith('color:') ? netStyle : '';
      const netClass = netStyle.startsWith('var-') ? netStyle : '';
      const setup = m.rec
        ? varFmtSetupPills(m.rec, tick)
        : `<span style="font-size:.78rem;color:var(--muted)">${varT('var.hlNa')}</span>`;
      const netAprLbl = m.hlLiquidityInsufficient ? '—' : (m.netApr != null ? varFmtApr(m.netApr, true) : '—');
      const sigTip = sig.reasons.join(' · ');
      return `<tr${varRadarRowAttrs(tick, m.rec)}>
        <td class="text-center">${varRadarSignalHtml(sig)}</td>
        <td>${varCatBadge(cat)}<span class="font-medium" title="${varHlCoinShort(tick)}">${varHlAssetLabel(tick)}</span></td>
        <td title="${varT('var.colSetupHint')}">${setup}</td>
        <td class="text-right mono">${varD != null ? varFmtApr(varDailyToApr(varD), true) : '—'}</td>
        <td class="text-right mono">${hlD != null ? varFmtHlAprCell(hlD, hl) : '—'}</td>
        <td class="text-right mono" style="color:var(--muted)">${grossGap != null ? varFmtApr(varDailyToApr(grossGap), true) : '—'}</td>
        <td class="text-right mono ${netClass}" style="${netCls}" title="${sigTip}">${netAprLbl}</td>
        <td class="text-right mono">${varFmtVol(parseFloat(L.volume_24h || 0))}</td>
      </tr>`;
    };
    if (!catFilter || catFilter === 'all') {
      const groups = {};
      VAR_CAT_ORDER.forEach(c => { groups[c] = []; });
      rows.forEach(L => { const c = varAssetCategory(L.ticker); if (groups[c]) groups[c].push(L); });
      VAR_CAT_ORDER.forEach(c => {
        const slice = groups[c].slice(0, 15);
        if (!slice.length) return;
        body += varRadarSectionRow(c, colSpan);
        body += slice.map(renderCompareRow).join('');
      });
    } else {
      body = rows.slice(0, 40).map(renderCompareRow).join('');
    }
    return `${varRadarIntroHtml('compare')}${warn}<p class="text-xs" style="color:var(--muted);padding:0 0 6px;margin:0">${varT('var.compareHint')}</p><table class="hs-trades-table"><thead><tr>
      <th class="text-center" style="min-width:3.4rem">${varThHint(varT('var.colSignal'), varT('var.colSignalHint'))}</th>
      <th>${varT('var.colAsset')}</th>
      <th>${varThHint(varT('var.colSetup'), varT('var.colSetupHint'))}</th>
      <th class="text-right">${varThHint(varT('var.colOmniApr'), varT('var.colFundingOmniHint'))}</th>
      <th class="text-right">${varThHint(varT('var.colHlApr'), varT('var.colFundingHlHint'))}</th>
      <th class="text-right">${varThHint(varT('var.colGapApr'), varT('var.colGapAprRawHint'))}</th>
      <th class="text-right">${varThHint(varT('var.colNetApr'), varT('var.colNetAprHint').replace('{days}', String(holdDays)))}</th>
      <th class="text-right">${varT('var.colVol24h')}</th>
    </tr></thead><tbody>${body}</tbody></table>`;
  }

  function varReadLegFromForm(persist) {
    const ticker = (document.getElementById('varLegTicker')?.value || '').trim().toUpperCase();
    const side = document.getElementById('varLegSide')?.value === 'long' ? 'long' : 'short';
    const notional = parseFloat(document.getElementById('varLegNotional')?.value || 0);
    let entryPx = parseFloat(document.getElementById('varLegEntry')?.value || 0);
    if (!ticker || !isFinite(notional) || notional <= 0) return null;
    // Don't wipe saved entry when the input is empty (poll/preview path).
    if (!(entryPx > 0)) {
      const saved = varLegLoad();
      if (saved && String(saved.ticker || '').toUpperCase() === ticker && parseFloat(saved.entryPx) > 0) {
        entryPx = parseFloat(saved.entryPx);
      }
    }
    const leg = { ticker, side, notional, entryPx: entryPx > 0 ? entryPx : 0, updatedAt: Date.now() };
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

  function varUpdateHedgeSteps(leg, hlPos, driftWarn, sizeWarn) {
    const steps = document.querySelectorAll('.var-hedge-steps .var-hedge-step');
    if (!steps.length) return;
    const s1 = !!(leg && leg.ticker && parseFloat(leg.notional) > 0);
    const s2 = !!(hlPos && !sizeWarn && !driftWarn);
    const active = !s1 ? 1 : !s2 ? 2 : 3;
    steps.forEach((el, i) => {
      const n = i + 1;
      el.classList.remove('done', 'active', 'pending');
      if (n < active) el.classList.add('done');
      else if (n === active) el.classList.add('active');
      else el.classList.add('pending');
    });
  }

  function varRenderHedgeRec(ticker, legSide, notional) {
    const host = document.getElementById('varHedgeRec');
    if (!host) return;
    const tick = String(ticker || '').trim().toUpperCase();
    if (!tick) {
      host.innerHTML = '';
      return;
    }
    const rec = varRecommendSides(tick, _varListingsCache, _varHlFunding?.map);
    if (!rec) {
      host.innerHTML = `<div class="var-hedge-rec-compact"><span class="var-hedge-rec-compact-kicker">${varT('var.recTitle')}</span><span>${varT('var.recNoData')}</span></div>`;
      return;
    }
    const hlTick = varHlCoinShort(tick);
    const netLbl = varFmtFundingDaily(rec.netDaily, true);
    const usdLbl = parseFloat(notional) > 0 ? varFmtUsd(Math.abs(parseFloat(notional))) : '—';
    const mismatch = legSide && legSide !== rec.omniSide;
    const compactLine = varT('var.recCompactLine')
      .replace('{hlTicker}', hlTick)
      .replace('{usd}', usdLbl)
      .replace('{net}', netLbl);
    host.innerHTML = `
      <div class="var-hedge-rec-compact" title="${varT('var.recWhy').replace(/"/g, '&quot;')}">
        <span class="var-hedge-rec-compact-kicker">${varT('var.recCompactKicker')}</span>
        <span class="var-hedge-rec-compact-line">${varSidePill(rec.hlSide)} ${compactLine}</span>
        ${mismatch ? `<button type="button" class="btn btn-ghost text-xs" style="padding:2px 10px;margin-left:auto" onclick="varApplyRecommendSide()">${varT('var.recApply')}</button>` : ''}
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
    let leg = varReadLegFromForm(false);
    if (leg && saved && String(saved.ticker || '').toUpperCase() === leg.ticker) {
      if (!(parseFloat(leg.entryPx) > 0) && parseFloat(saved.entryPx) > 0) {
        leg = { ...leg, entryPx: parseFloat(saved.entryPx) };
      }
    } else if (!leg) {
      leg = saved;
    }
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
    // Keep entry visible during live polls (previewOnly) so uPnL never drops.
    if (leg?.entryPx > 0 && pxEl && !pxEl.matches(':focus') && !String(pxEl.value || '').trim()) {
      pxEl.value = String(leg.entryPx);
    }
    const sum = document.getElementById('varHedgeSummary');
    const statusEl = document.getElementById('varHedgeStatus');
    const tickPreview = (document.getElementById('varLegTicker')?.value || '').trim().toUpperCase();
    const sidePreview = document.getElementById('varLegSide')?.value;
    varRenderHedgeRec(tickPreview || leg?.ticker, leg?.side || sidePreview, leg?.notional);
    renderVarHedgeLiveBooks(tickPreview || leg?.ticker);
    if (!sum) return;

    if (!varHasWallets()) {
      if (statusEl) statusEl.innerHTML = `<span class="var-hedge-status-pill warn">${varT('var.noWallet')}</span>`;
    } else if (!varHlPositionsLoaded()) {
      if (statusEl) statusEl.innerHTML = `<span class="var-hedge-status-pill warn">${varT('var.hlLoadHint')}</span> <button type="button" class="btn btn-ghost text-xs" style="margin-left:6px;padding:4px 10px" onclick="varRefreshHlLeg()">${varT('var.refreshHl')}</button>`;
    } else if (statusEl) {
      statusEl.innerHTML = `<span class="var-hedge-status-pill ok">✓ ${varT('var.hlReady')}</span> <button type="button" class="btn btn-ghost text-xs" style="margin-left:6px;padding:4px 10px" onclick="varRefreshHlLeg()">${varT('var.refreshHl')}</button>`;
    }

    if (!leg) {
      varUpdateHedgeSteps(null, null, false, false);
      sum.innerHTML = `<div class="card2 p3" style="text-align:center;padding:32px 16px"><p style="color:var(--muted);font-size:.88rem;margin:0;line-height:1.5">${varT('var.hedgeEmpty')}</p></div>`;
      return;
    }

    const hlPos = varHlPositionForTicker(leg.ticker);
    const omniLive = varResolveOmniLegLive(leg);
    // Persist discovered entry so uPnL can recompute on every mark tick.
    if (omniLive?.entry > 0 && !(parseFloat(leg.entryPx) > 0)) {
      const pxEl = document.getElementById('varLegEntry');
      if (pxEl && !pxEl.matches(':focus') && !String(pxEl.value || '').trim()) {
        pxEl.value = String(Math.round(omniLive.entry * 1e6) / 1e6);
      }
      try {
        varLegSave({ ...leg, entryPx: omniLive.entry, updatedAt: Date.now() });
        leg.entryPx = omniLive.entry;
      } catch (_) {}
    }
    const deltaLeg = omniLive
      ? { ticker: leg.ticker, side: leg.side, notional: omniLive.notional }
      : leg;
    const delta = varComputeDelta(deltaLeg, hlPos);
    const fund = varFundingForTicker(leg.ticker, _varListingsCache, _varHlFunding?.map);
    const suggested = varSuggestedHlSide(leg.side);
    const hlSideActual = hlPos ? (hlPos.szi > 0 ? 'long' : 'short') : suggested;
    const fundNet = varFundingNetForSides(leg.side, hlSideActual, fund.varD, fund.hlD);
    const targetUsd = omniLive?.notional > 0 ? omniLive.notional : Math.abs(parseFloat(leg.notional || 0));
    const hlUsd = hlPos ? hlPos.notionalUsd : 0;
    const omniUpnl = omniLive?.upnl;
    const hlUpnl = hlPos?.upnl;
    const netUpnl = (omniUpnl != null || hlUpnl != null)
      ? (Number(omniUpnl) || 0) + (Number(hlUpnl) || 0)
      : null;
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
    const needsHlAction = !hlPos;
    const hedged = hlPos && !driftWarn && !sizeWarn;
    const deltaValCls = driftWarn ? 'var-hedge-metric-val--risk' : 'var-hedge-metric-val--neutral';
    const sizeValCls = !hlPos ? 'var-hedge-metric-val--neutral' : (sizeWarn ? 'var-hedge-metric-val--wait' : 'var-hedge-metric-val--neutral');
    varUpdateHedgeSteps(leg, hlPos, driftWarn, sizeWarn);

    sum.innerHTML = `
      <p class="var-hedge-split-title" data-i18n="var.hedgeResultTitle">${varT('var.hedgeResultTitle')}</p>
      <div class="var-hedge-bridge">
        <div class="var-hedge-leg var-hedge-leg--omni">
          <div class="var-hedge-leg-label">Variational Omni</div>
          <div class="var-hedge-leg-val">${varSidePill(leg.side)} ${varFmtUsd(targetUsd)}</div>
          <div class="var-hedge-leg-sub"><strong>${leg.ticker}</strong>${omniLive?.qty ? ' · ' + varT('var.hedgeSz') + ' ' + varFmtQty(omniLive.qty) : ''}</div>
          <div class="var-hedge-leg-sub">${omniLive?.mark > 0 ? varT('var.hedgeMark') + ' ' + varFmtPx(omniLive.mark) + (omniLive.markLive ? ' · LIVE' : '') : varT('var.hedgeMarkMissing')}${omniLive?.entry ? ' · ' + varT('var.hedgeEntry') + ' ' + varFmtPx(omniLive.entry) : ''}</div>
          <div class="var-hedge-leg-pnl" style="${varPnlStyle(omniUpnl)}">${omniUpnl != null ? varT('var.hedgeUpnl') + ' ' + varFmtSignedUsd(omniUpnl) : (omniLive?.needsEntry ? varT('var.hedgeNeedsEntry') : '—')}</div>
        </div>
        <div class="var-hedge-bridge-mid">↔<span>delta</span></div>
        <div class="var-hedge-leg var-hedge-leg--hl${hlPos ? '' : ' var-hedge-leg--empty'}">
          <div class="var-hedge-leg-label">${hlPos?.dex === 'XYZ' ? 'Trade XYZ' : 'Hyperliquid'}</div>
          <div class="var-hedge-leg-val">${hlPos ? varSidePill(hlSideActual) + ' ' + varFmtUsd(hlUsd) : varT('var.hlMissing')}</div>
          <div class="var-hedge-leg-sub">${hlPos ? varEsc(hlPos.coin) + (hlPos.qty ? ' · ' + varT('var.hedgeSz') + ' ' + varFmtQty(hlPos.qty) : '') : varHlCoinShort(leg.ticker)}</div>
          ${hlPos ? `<div class="var-hedge-leg-sub">${varT('var.hedgeMark')} ${varFmtPx(hlPos.mark)}${hlPos.entry ? ' · ' + varT('var.hedgeEntry') + ' ' + varFmtPx(hlPos.entry) : ''}${hlPos.markLive ? ' · LIVE' : ''}</div>
          <div class="var-hedge-leg-pnl" style="${varPnlStyle(hlUpnl)}">${hlUpnl != null ? varT('var.hedgeUpnl') + ' ' + varFmtSignedUsd(hlUpnl) : '—'}</div>` : ''}
        </div>
      </div>
      ${needsHlAction ? `
      <div class="var-hedge-action-card var-hedge-action-card--pending mb-3">
        <div class="var-hedge-action-title">${varT('var.actionTitle')}</div>
        <p style="font-size:.82rem;color:var(--text);margin:0 0 8px;line-height:1.5">${varT('var.actionBody')
          .replace('{hlSide}', hlSideLbl)
          .replace('{hlTicker}', varHlCoinShort(leg.ticker))}</p>
        <p style="font-size:.78rem;color:var(--warning-brand);margin:0">${varT('var.hlMissingHint')}</p>
        ${varOpenOrderTipHtml(leg.ticker)}
      </div>` : (hedged ? `<p class="var-hedge-ok-line">${varT('var.hedgeOk')}</p>` : `
      <div class="var-hedge-action-card mb-3">
        <div class="var-hedge-action-title">${varT('var.actionTitle')}</div>
        ${sizeWarn ? `<p style="font-size:.78rem;color:var(--warning-brand);margin:0">${varT('var.sizeGapWarn').replace('{pct}', sizeGap.toFixed(0))}</p>` : ''}
        ${driftWarn ? `<p style="font-size:.78rem;color:var(--danger);margin:8px 0 0">${varT('var.driftWarn')}</p>` : ''}
      </div>`)}
      <div class="var-hedge-hero">
        <div class="var-hedge-hero-label">${varT('var.hedgeNetPnl')}</div>
        <div class="var-hedge-hero-val" style="${varPnlStyle(netUpnl)}">${netUpnl != null ? varFmtSignedUsd(netUpnl) : '—'}</div>
        <div class="var-hedge-hero-sub">${varT('var.hedgeNetPnlSub')} · ${varT('var.hedgeLiveTick')}</div>
      </div>
      <div class="var-hedge-hero" style="margin-top:10px;padding:14px 16px">
        <div class="var-hedge-hero-label">${varT('var.cardFundingEarn')}</div>
        <div class="var-hedge-hero-val" style="font-size:1.25rem;${fundCls}">${fundNet != null ? varFmtFundingDaily(fundNet, true) : '—'}</div>
        <div class="var-hedge-hero-sub">${fundUsdDay != null ? varT('var.fundingUsdDay').replace('{usd}', varFmtUsd(fundUsdDay)).replace('{size}', varFmtUsd(fundBaseUsd)) : ''}${fundUsdMonth != null ? ' · ' + varT('var.fundingUsdMonth').replace('{usd}', varFmtUsd(fundUsdMonth)) : ''}</div>
      </div>
      <div class="var-hedge-metrics">
        <div class="var-hedge-metric">
          <div class="var-hedge-metric-label">${varT('var.cardNetDelta')}</div>
          <div class="var-hedge-metric-val ${deltaValCls}">${delta ? varFmtUsd(delta.net) : '—'}</div>
          ${delta ? varDriftBar(delta.driftPct) : ''}
          <div style="font-size:.68rem;color:var(--muted);margin-top:4px">${delta ? varT('var.earnDeltaShort') : ''}</div>
        </div>
        <div class="var-hedge-metric">
          <div class="var-hedge-metric-label">${varT('var.sizeMatch')}</div>
          <div class="var-hedge-metric-val ${sizeValCls}">${hlPos ? (100 - sizeGap).toFixed(0) + '%' : '—'}</div>
          <div style="font-size:.68rem;color:var(--muted);margin-top:4px">${hlPos ? varFmtUsd(hlUsd) + ' / ' + varFmtUsd(targetUsd) : varT('var.hlMissing')}</div>
        </div>
      </div>
      <div class="card2 p3" style="border-radius:12px">
        <div style="font-size:.75rem;font-weight:600;margin-bottom:4px">${varT('var.earnTitle')}</div>
        <p style="font-size:.76rem;color:var(--muted);margin:0 0 10px;line-height:1.45">${varT('var.earnExplain')}</p>
        <div class="var-hedge-earn-grid">
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

  function varEpochStartUtc(ts) {
    const x = new Date(ts);
    const day = x.getUTCDay();
    const diff = (day + 3) % 7; // days since Thursday
    x.setUTCDate(x.getUTCDate() - diff);
    x.setUTCHours(0, 0, 0, 0);
    return +x;
  }

  function varDashPeriodLoad() {
    try {
      const p = localStorage.getItem(HS_VAR_DASH_PERIOD_KEY) || 'this_epoch';
      return ['today', 'this_epoch', 'last_epoch', 'month', 'year', 'all'].includes(p) ? p : 'this_epoch';
    } catch {
      return 'this_epoch';
    }
  }

  function varDashPeriodSave(p) {
    try { localStorage.setItem(HS_VAR_DASH_PERIOD_KEY, p); } catch (_) {}
  }

  function varParseTs(raw) {
    if (raw == null || raw === '') return NaN;
    if (typeof raw === 'number') return isFinite(raw) ? raw : NaN;
    if (typeof raw === 'string') {
      const n = Number(raw);
      // Numeric epoch ms/sec stored as string
      if (isFinite(n) && /^\d+(\.\d+)?$/.test(raw.trim())) {
        return n < 1e12 ? n * 1000 : n;
      }
      const parsed = Date.parse(raw);
      return isFinite(parsed) ? parsed : NaN;
    }
    if (raw instanceof Date) return +raw;
    return NaN;
  }

  function varDashRange(period, trades, nowTs) {
    const now = nowTs || Date.now();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const epochStart = varEpochStartUtc(now);
    const epochEnd = epochStart + 7 * 864e5;
    let minTs = now;
    for (const t of trades || []) {
      const ts = varParseTs(t.created_at != null ? t.created_at : t.ts);
      if (isFinite(ts) && ts < minTs) minTs = ts;
    }
    if (period === 'today') return { start: +dayStart, end: now };
    if (period === 'this_epoch') return { start: epochStart, end: Math.min(now, epochEnd - 1), exclusiveEnd: epochEnd };
    if (period === 'last_epoch') return { start: epochStart - 7 * 864e5, end: epochStart - 1, exclusiveEnd: epochStart };
    if (period === 'month') {
      const m = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1));
      return { start: +m, end: now };
    }
    if (period === 'year') {
      const y = new Date(Date.UTC(dayStart.getUTCFullYear(), 0, 1));
      return { start: +y, end: now };
    }
    return { start: isFinite(minTs) ? minTs : now - 864e5, end: now };
  }

  function varOiUsd(posQ, lastPx) {
    let n = 0;
    for (const k of Object.keys(posQ)) n += Math.abs(posQ[k]) * (lastPx[k] || 0);
    return n;
  }

  function varTradePx(t) {
    const v = parseFloat(
      t?.price ?? t?.fill_price ?? t?.avg_price ?? t?.mark_price ?? t?.execution_price ?? NaN
    );
    return isFinite(v) && v > 0 ? v : 0;
  }

  function varTradeQty(t) {
    const v = parseFloat(
      t?.qty ?? t?.quantity ?? t?.size ?? t?.fill_qty ?? t?.amount ?? NaN
    );
    return isFinite(v) && v > 0 ? v : 0;
  }

  function varBuildDashAnalytics(bundle, period, opts) {
    const light = !!(opts && opts.light);
    const rawTrades = bundle?.trades || [];
    const tradesAll = [];
    for (let i = 0; i < rawTrades.length; i++) {
      const t = rawTrades[i];
      if (t.status && t.status !== 'confirmed') continue;
      const underlying = String(t.underlying || t.instrument?.underlying || '').toUpperCase();
      const ts = varParseTs(t.created_at != null ? t.created_at : t.ts);
      const px = varTradePx(t);
      const qty = varTradeQty(t);
      if (!(isFinite(ts) && underlying && px > 0 && qty > 0)) continue;
      tradesAll.push({
        underlying,
        ts,
        px,
        qty,
        sign: String(t.side || '').toLowerCase() === 'buy' ? 1 : -1,
      });
    }
    tradesAll.sort((a, b) => a.ts - b.ts);

    const transfersAll = [];
    const pushTransfer = (t, forcedType) => {
      const ts = varParseTs(t.created_at != null ? t.created_at : t.ts);
      if (!isFinite(ts)) return;
      transfersAll.push({
        underlying: String(t.underlying || t.reference_instrument?.underlying || t.asset || '').toUpperCase(),
        ts,
        qty: parseFloat(t.qty || 0),
        type: forcedType || String(t.transfer_type || '').toLowerCase(),
      });
    };
    (bundle?.funding || []).forEach(t => pushTransfer(t, 'funding'));
    (bundle?.realizedPnl || []).forEach(t => pushTransfer(t, 'realized_pnl'));
    (bundle?.transfers || []).forEach(t => pushTransfer(t));

    const range = varDashRange(period, tradesAll, Date.now());
    const start = range.start;
    const exclusiveEnd = range.exclusiveEnd != null ? range.exclusiveEnd : (range.end + 1);
    const displayEnd = range.end;
    // For "all", always include every parsed trade (avoid empty window if minTs glitched).
    const inWindow = period === 'all'
      ? () => true
      : (ts) => ts >= start && ts < exclusiveEnd;

    const winTrades = [];
    let volume = 0;
    let largest = 0;
    const pairMap = {};
    for (let i = 0; i < tradesAll.length; i++) {
      const t = tradesAll[i];
      if (!inWindow(t.ts)) continue;
      winTrades.push(t);
      const notional = Math.abs(t.px * t.qty);
      volume += notional;
      if (notional > largest) largest = notional;
      if (!pairMap[t.underlying]) pairMap[t.underlying] = { market: t.underlying, volume: 0, trades: 0, pnl: 0 };
      pairMap[t.underlying].volume += notional;
      pairMap[t.underlying].trades++;
    }

    let realizedPnl = 0;
    let wins = 0;
    let pnlN = 0;
    let funding = 0;
    for (const t of transfersAll) {
      if (!inWindow(t.ts)) continue;
      if (t.type === 'realized_pnl') {
        realizedPnl += t.qty;
        if (t.qty !== 0) { pnlN++; if (t.qty > 0) wins++; }
        const u = t.underlying;
        if (u) {
          if (!pairMap[u]) pairMap[u] = { market: u, volume: 0, trades: 0, pnl: 0 };
          pairMap[u].pnl += t.qty;
        }
      } else if (t.type === 'funding') {
        funding += t.qty;
      }
    }

    const allTs = tradesAll.map(t => t.ts);
    const globalFrom = allTs.length ? Math.min(...allTs) : start;
    const globalTo = allTs.length ? Math.max(...allTs) : displayEnd;
    const winRate = pnlN ? (wins / pnlN) * 100 : null;
    const avgTrade = winTrades.length ? volume / winTrades.length : 0;

    // Live / hero: volume + PnL only — skip O(hours×trades) chart rebuild (freezes large exports).
    if (light) {
      return {
        period, start, end: displayEnd,
        tradeCount: winTrades.length,
        volume, largest, realizedPnl, funding,
        winRate, avgOi: 0, peakOi: 0, heldPct: 0,
        avgTrade, volHours: [], oiHours: [],
        pairs: Object.values(pairMap).sort((a, b) => b.volume - a.volume),
        openPositions: [],
        globalFrom, globalTo, totalTrades: tradesAll.length,
      };
    }

    // Hourly volume chart — single pass (avoid O(hours×trades))
    const hourMs = 3600e3;
    const chartStart = Math.floor(start / hourMs) * hourMs;
    const chartEnd = Math.min(exclusiveEnd, displayEnd + hourMs);
    const volByHour = new Map();
    for (let i = 0; i < winTrades.length; i++) {
      const t = winTrades[i];
      const h = Math.floor(t.ts / hourMs) * hourMs;
      if (h < chartStart || h >= chartEnd) continue;
      volByHour.set(h, (volByHour.get(h) || 0) + Math.abs(t.px * t.qty));
    }
    const volHours = [];
    for (let h = chartStart; h < chartEnd; h += hourMs) {
      volHours.push({ t: h, v: volByHour.get(h) || 0 });
    }

    // OI reconstruction — process all trades up to chartEnd
    const posQ = {};
    const lastPx = {};
    let ti = 0;
    const oiHours = [];
    let peakOi = 0;
    let sumAvg = 0;
    let hourCount = 0;
    let heldHours = 0;

    while (ti < tradesAll.length && tradesAll[ti].ts < chartStart) {
      const t = tradesAll[ti++];
      lastPx[t.underlying] = t.px;
      posQ[t.underlying] = (posQ[t.underlying] || 0) + t.sign * t.qty;
      if (Math.abs(posQ[t.underlying]) < 1e-10) delete posQ[t.underlying];
    }

    for (let h = chartStart; h < chartEnd; h += hourMs) {
      const hend = h + hourMs;
      let oi = varOiUsd(posQ, lastPx);
      let peakH = oi;
      let area = 0;
      let cursor = h;
      while (ti < tradesAll.length && tradesAll[ti].ts < hend) {
        const t = tradesAll[ti++];
        const seg = Math.max(0, t.ts - cursor);
        area += oi * seg;
        lastPx[t.underlying] = t.px;
        posQ[t.underlying] = (posQ[t.underlying] || 0) + t.sign * t.qty;
        if (Math.abs(posQ[t.underlying]) < 1e-10) delete posQ[t.underlying];
        oi = varOiUsd(posQ, lastPx);
        if (oi > peakH) peakH = oi;
        cursor = t.ts;
      }
      area += oi * Math.max(0, hend - cursor);
      const avgH = area / hourMs;
      oiHours.push({ t: h, avg: avgH, peak: peakH });
      if (h >= start && h < exclusiveEnd && h <= displayEnd) {
        sumAvg += avgH;
        hourCount++;
        if (avgH > 1) heldHours++;
        if (peakH > peakOi) peakOi = peakH;
      }
    }

    // Continue applying remaining trades for open positions "now"
    while (ti < tradesAll.length) {
      const t = tradesAll[ti++];
      lastPx[t.underlying] = t.px;
      posQ[t.underlying] = (posQ[t.underlying] || 0) + t.sign * t.qty;
      if (Math.abs(posQ[t.underlying]) < 1e-10) delete posQ[t.underlying];
    }

    const avgOi = hourCount ? sumAvg / hourCount : 0;
    const heldPct = hourCount ? (heldHours / hourCount) * 100 : 0;
    const pairs = Object.values(pairMap).sort((a, b) => b.volume - a.volume);
    const openPositions = Object.keys(posQ)
      .map(u => ({
        market: u,
        qty: posQ[u],
        side: posQ[u] > 0 ? 'long' : 'short',
        notional: Math.abs(posQ[u]) * (lastPx[u] || 0),
        px: lastPx[u] || 0,
      }))
      .filter(p => p.notional > 1)
      .sort((a, b) => b.notional - a.notional);

    return {
      period, start, end: displayEnd,
      tradeCount: winTrades.length,
      volume, largest, realizedPnl, funding,
      winRate, avgOi, peakOi, heldPct,
      avgTrade, volHours, oiHours, pairs, openPositions,
      globalFrom, globalTo, totalTrades: tradesAll.length,
    };
  }

  function varFmtSignedUsdExact(n) {
    const v = Number(n);
    if (!isFinite(v)) return '—';
    if (v === 0) return '$0';
    const abs = Math.abs(v);
    const num = abs.toLocaleString('en-US', {
      maximumFractionDigits: abs >= 100 ? 0 : 2,
      minimumFractionDigits: 0,
    });
    return `${v > 0 ? '+' : '-'}$${num}`;
  }

  function varFmtSignedUsd(n) {
    const v = Number(n);
    if (!isFinite(v)) return '—';
    if (v === 0) return '$0';
    // Timber-style: keep full dollars under $10k (e.g. -$1,022 not -$1.0K).
    const abs = Math.abs(v);
    if (abs < 1e4) return varFmtSignedUsdExact(v);
    return (v > 0 ? '+' : '-') + varFmtCompactUsd(abs);
  }

  function varRelativeAgo(ts) {
    if (!ts) return '—';
    const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (sec < 60) return sec + 's';
    const min = Math.round(sec / 60);
    if (min < 60) return min + (varLoc().startsWith('fr') ? ' min' : 'm');
    const h = Math.round(min / 60);
    if (h < 48) return h + 'h';
    const d = Math.round(h / 24);
    return d + (varLoc().startsWith('fr') ? ' j' : 'd');
  }

  function varChartPrep(canvas) {
    if (!canvas) return null;
    const parent = canvas.parentElement;
    const cssW = Math.max(280, parent?.clientWidth || canvas.clientWidth || 600);
    const cssH = 200;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = { l: 52, r: 14, t: 14, b: 34 };
    return { ctx, W: cssW, H: cssH, pad, plotW: cssW - pad.l - pad.r, plotH: cssH - pad.t - pad.b };
  }

  function varChartTimeLabel(ts, showDate) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0') + ':00';
    if (!showDate) return hh;
    return d.toLocaleDateString(varLoc(), { day: 'numeric', month: 'short' }) + '\n' + hh;
  }

  function varDrawChartYGrid(ctx, pad, W, plotH, maxV) {
    ctx.strokeStyle = 'rgba(155,170,185,0.14)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = pad.t + (plotH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(W - pad.r, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(155,170,185,0.7)';
      ctx.font = '10px Inter,sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(varFmtCompactUsd(maxV * (1 - i / 3)), pad.l - 6, y);
    }
  }

  function varDrawChartXLabels(ctx, hours, pad, W, H, plotW) {
    if (!hours?.length) return;
    const span = (hours[hours.length - 1].t || 0) - (hours[0].t || 0);
    const showDate = span > 30 * 3600e3;
    const ticks = Math.min(6, hours.length);
    ctx.fillStyle = 'rgba(155,170,185,0.75)';
    ctx.font = '10px Inter,sans-serif';
    ctx.textBaseline = 'top';
    for (let k = 0; k < ticks; k++) {
      const i = ticks === 1 ? 0 : Math.round((k * (hours.length - 1)) / (ticks - 1));
      const x = pad.l + ((i + 0.5) / hours.length) * plotW;
      const label = varChartTimeLabel(hours[i].t, showDate);
      const parts = label.split('\n');
      ctx.textAlign = k === 0 ? 'left' : k === ticks - 1 ? 'right' : 'center';
      const drawX = k === 0 ? pad.l : k === ticks - 1 ? W - pad.r : x;
      parts.forEach((line, li) => ctx.fillText(line, drawX, H - pad.b + 6 + li * 11));
    }
  }

  function varEnsureChartTip(canvas) {
    const parent = canvas.parentElement;
    if (!parent) return null;
    let tip = parent.querySelector('.var-chart-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'var-chart-tip';
      parent.appendChild(tip);
    }
    return tip;
  }

  function varBindChartHover(canvas) {
    if (!canvas || canvas.dataset.varHoverBound) return;
    canvas.dataset.varHoverBound = '1';
    const tip = varEnsureChartTip(canvas);
    const hide = () => {
      if (tip) tip.style.display = 'none';
      const st = canvas._varChart;
      if (st?.hoverIdx != null) {
        st.hoverIdx = null;
        if (st.redraw) st.redraw();
      }
    };
    canvas.addEventListener('mouseleave', hide);
    canvas.addEventListener('mousemove', (e) => {
      const st = canvas._varChart;
      if (!st?.hours?.length || !tip) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { pad, plotW, W, H } = st;
      if (x < pad.l || x > W - pad.r || y < pad.t || y > pad.t + st.plotH) {
        hide();
        return;
      }
      const n = st.hours.length;
      const idx = Math.max(0, Math.min(n - 1, Math.floor(((x - pad.l) / plotW) * n)));
      if (st.hoverIdx !== idx) {
        st.hoverIdx = idx;
        if (st.redraw) st.redraw();
      }
      const h = st.hours[idx];
      const when = new Date(h.t).toLocaleString(varLoc(), {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
      let body = '';
      if (st.kind === 'vol') {
        body = `<strong>${when}</strong><div>${varT('var.dashVol')}: <b>${varFmtCompactUsd(h.v)}</b></div>`;
      } else {
        body = `<strong>${when}</strong>
          <div>${varT('var.dashOiAvg')}: <b>${varFmtCompactUsd(h.avg)}</b></div>
          <div>${varT('var.dashOiPeak')}: <b>${varFmtCompactUsd(h.peak)}</b></div>`;
        if (st.avgLine > 0) {
          body += `<div class="muted">${varT('var.dashOiWindowAvg')}: ${varFmtCompactUsd(st.avgLine)}</div>`;
        }
      }
      tip.innerHTML = body;
      tip.style.display = 'block';
      const tipW = tip.offsetWidth || 160;
      const tipH = tip.offsetHeight || 60;
      let left = e.clientX - rect.left + 12;
      let top = e.clientY - rect.top - tipH - 8;
      if (left + tipW > rect.width - 8) left = e.clientX - rect.left - tipW - 12;
      if (top < 8) top = e.clientY - rect.top + 14;
      tip.style.left = Math.max(8, left) + 'px';
      tip.style.top = Math.max(8, top) + 'px';
    });
  }

  function varDrawHoverLine(ctx, st) {
    if (st.hoverIdx == null || !st.hours?.length) return;
    const x = st.pad.l + ((st.hoverIdx + 0.5) / st.hours.length) * st.plotW;
    ctx.strokeStyle = 'rgba(244,247,251,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, st.pad.t);
    ctx.lineTo(x, st.pad.t + st.plotH);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function varDrawVolChart(canvas, hours, accent) {
    if (!canvas) return;
    const prep = varChartPrep(canvas);
    if (!prep || !hours?.length) {
      if (prep) {
        prep.ctx.clearRect(0, 0, prep.W, prep.H);
        prep.ctx.fillStyle = 'rgba(155,170,185,0.6)';
        prep.ctx.font = '12px Inter,sans-serif';
        prep.ctx.textAlign = 'center';
        prep.ctx.fillText(varT('var.noData'), prep.W / 2, prep.H / 2);
      }
      return;
    }
    const { ctx, W, H, pad, plotW, plotH } = prep;
    const maxV = Math.max(...hours.map(h => h.v), 1);
    const n = hours.length;
    const gap = n > 80 ? 0.5 : 1;
    const bw = Math.max(1, plotW / n - gap);

    const redraw = () => {
      ctx.clearRect(0, 0, W, H);
      varDrawChartYGrid(ctx, pad, W, plotH, maxV);
      hours.forEach((h, i) => {
        const x = pad.l + (i / n) * plotW;
        const bh = (h.v / maxV) * plotH;
        const active = canvas._varChart?.hoverIdx === i;
        ctx.fillStyle = accent || '#4c9af8';
        ctx.globalAlpha = h.v > 0 ? (active ? 1 : 0.85) : (active ? 0.35 : 0.12);
        ctx.fillRect(x, pad.t + plotH - bh, bw, Math.max(bh, h.v > 0 ? 1.5 : 0));
        ctx.globalAlpha = 1;
      });
      varDrawChartXLabels(ctx, hours, pad, W, H, plotW);
      varDrawHoverLine(ctx, canvas._varChart || {});
    };

    canvas._varChart = {
      kind: 'vol', hours, pad, plotW, plotH, W, H, hoverIdx: null, redraw, avgLine: 0,
    };
    redraw();
    varBindChartHover(canvas);
  }

  function varDrawOiChart(canvas, hours, avgLine, accent) {
    if (!canvas) return;
    const prep = varChartPrep(canvas);
    if (!prep || !hours?.length) {
      if (prep) {
        prep.ctx.clearRect(0, 0, prep.W, prep.H);
        prep.ctx.fillStyle = 'rgba(155,170,185,0.6)';
        prep.ctx.font = '12px Inter,sans-serif';
        prep.ctx.textAlign = 'center';
        prep.ctx.fillText(varT('var.noData'), prep.W / 2, prep.H / 2);
      }
      return;
    }
    const { ctx, W, H, pad, plotW, plotH } = prep;
    const maxV = Math.max(...hours.map(h => h.peak), avgLine || 0, 1);
    const n = hours.length;
    const yOf = (v) => pad.t + plotH - (v / maxV) * plotH;
    const xOf = (i) => pad.l + ((i + 0.5) / n) * plotW;

    const redraw = () => {
      ctx.clearRect(0, 0, W, H);
      varDrawChartYGrid(ctx, pad, W, plotH, maxV);

      ctx.beginPath();
      hours.forEach((h, i) => {
        const x = xOf(i);
        const y = yOf(h.peak);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      for (let i = hours.length - 1; i >= 0; i--) ctx.lineTo(xOf(i), yOf(hours[i].avg));
      ctx.closePath();
      ctx.fillStyle = 'rgba(76,154,248,0.18)';
      ctx.fill();

      ctx.beginPath();
      hours.forEach((h, i) => {
        const x = xOf(i); const y = yOf(h.avg);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = accent || '#4c9af8';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (avgLine > 0) {
        const y = yOf(avgLine);
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(244,247,251,0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(W - pad.r, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      varDrawChartXLabels(ctx, hours, pad, W, H, plotW);
      varDrawHoverLine(ctx, canvas._varChart || {});

      const hi = canvas._varChart?.hoverIdx;
      if (hi != null && hours[hi]) {
        ctx.fillStyle = accent || '#4c9af8';
        ctx.beginPath();
        ctx.arc(xOf(hi), yOf(hours[hi].avg), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    canvas._varChart = {
      kind: 'oi', hours, pad, plotW, plotH, W, H, hoverIdx: null, redraw, avgLine: avgLine || 0,
    };
    redraw();
    varBindChartHover(canvas);
  }

  function renderVarDash() {
    const wrap = document.getElementById('varDash');
    if (!wrap) return;
    const bundle = varCsvLoadForView();
    const points = varPointsLoad();
    const hasData = !!(bundle && (bundle.trades?.length || bundle.funding?.length || bundle.realizedPnl?.length));
    if (!hasData) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    const period = varDashPeriodLoad();
    document.querySelectorAll('#varDashPeriods .var-dash-period').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.period === period);
    });

    const dash = varBuildDashAnalyticsCached(bundle, period);
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const setHtml = (id, v) => { const e = document.getElementById(id); if (e) e.innerHTML = v; };

    const from = new Date(dash.globalFrom).toLocaleDateString(varLoc(), { day: 'numeric', month: 'short', year: 'numeric' });
    const to = new Date(dash.globalTo).toLocaleDateString(varLoc(), { day: 'numeric', month: 'short', year: 'numeric' });
    const ago = varRelativeAgo(points?.importedAt);
    set('varDashMeta', varT('var.dashMeta')
      .replace('{trades}', String(dash.totalTrades))
      .replace('{from}', from)
      .replace('{to}', to)
      .replace('{ago}', ago));

    set('varDashVol', varFmtCompactUsd(dash.volume));
    set('varDashVolSub', varT('var.dashVolSub').replace('{n}', String(dash.tradeCount)));
    const pnlEl = document.getElementById('varDashPnl');
    if (pnlEl) {
      pnlEl.textContent = varFmtSignedUsd(dash.realizedPnl);
      pnlEl.classList.toggle('pos', dash.realizedPnl > 0);
      pnlEl.classList.toggle('neg', dash.realizedPnl < 0);
    }
    set('varDashPnlSub', dash.winRate != null ? varT('var.dashWinRate').replace('{pct}', dash.winRate.toFixed(1)) : '');
    set('varDashAvgOi', varFmtCompactUsd(dash.avgOi));
    set('varDashAvgOiSub', varT('var.dashHeldPct').replace('{pct}', dash.heldPct.toFixed(1)));
    set('varDashPeakOi', varFmtCompactUsd(dash.peakOi));
    set('varDashPeakOiSub', varT('var.dashPeakSub'));
    set('varDashAvgTrade', varFmtCompactUsd(dash.avgTrade));
    set('varDashAvgTradeSub', varT('var.dashLargest').replace('{usd}', varFmtCompactUsd(dash.largest)));
    const fundEl = document.getElementById('varDashFunding');
    if (fundEl) {
      fundEl.textContent = varFmtSignedUsd(dash.funding);
      fundEl.classList.toggle('pos', dash.funding > 0);
      fundEl.classList.toggle('neg', dash.funding < 0);
    }
    set('varDashFundingSub', varT('var.dashNoFees'));
    set('varDashVolChartSub', varT('var.dashVolChartSub').replace('{usd}', varFmtCompactUsd(dash.volume)));
    set('varDashPairsSub', varT('var.dashPairsSub').replace('{n}', String(dash.pairs.length)));

    varDrawVolChart(document.getElementById('varDashVolCanvas'), dash.volHours, '#6ee7ff');
    varDrawOiChart(document.getElementById('varDashOiCanvas'), dash.oiHours, dash.avgOi, '#4c9af8');
    if (!window._varDashResizeBound) {
      window._varDashResizeBound = true;
      let t = null;
      window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (_varSub === 'dashboard') renderVarDash();
        }, 150);
      });
    }

    const pairsEl = document.getElementById('varDashPairsTable');
    if (pairsEl) {
      if (!dash.pairs.length) {
        pairsEl.innerHTML = `<div class="var-pos-empty">${varT('var.noData')}</div>`;
      } else {
        const maxVol = Math.max(...dash.pairs.map(p => p.volume), 1);
        const body = dash.pairs.map(p => {
          const pct = (p.volume / Math.max(dash.volume, 1)) * 100;
          const bar = Math.max(2, Math.round((p.volume / maxVol) * 100));
          const pnlCls = p.pnl > 0 ? 'color:var(--success)' : p.pnl < 0 ? 'color:var(--danger)' : '';
          return `<tr>
            <td class="font-medium">${p.market} <span style="color:var(--muted);font-size:.72rem">${p.trades}</span></td>
            <td><div class="var-pair-share"><div class="var-pair-bar"><span style="width:${bar}%"></span></div></div></td>
            <td class="text-right mono">${pct.toFixed(1)}%</td>
            <td class="text-right mono">${varFmtCompactUsd(p.volume)}</td>
            <td class="text-right mono" style="${pnlCls}">${varFmtSignedUsd(p.pnl)}</td>
          </tr>`;
        }).join('');
        pairsEl.innerHTML = `<table class="hs-trades-table"><thead><tr>
          <th>${varT('var.dashColMarket')}</th>
          <th>${varT('var.dashColShare')}</th>
          <th class="text-right">${varT('var.dashColPct')}</th>
          <th class="text-right">${varT('var.dashColVol')}</th>
          <th class="text-right">${varT('var.dashColPnl')}</th>
        </tr></thead><tbody>${body}</tbody></table>`;
      }
    }

    const posEl = document.getElementById('varDashPositions');
    const posSub = document.querySelector('[data-i18n="var.dashPositionsSub"]');
    const liveWrap = varPositionsLoad();
    const omniBook = varGetOmniBookPositions();
    const displayPositions = (omniBook.positions || []).map(varEnrichOmniLive).filter(Boolean);
    if (posSub) {
      if (omniBook.source === 'live') {
        const when = liveWrap?.pulled_at ? new Date(liveWrap.pulled_at).toLocaleString(varLoc()) : '';
        posSub.textContent = varT('var.dashPositionsLiveSub').replace('{when}', when || '—');
      } else if (omniBook.source === 'fills') {
        posSub.textContent = varT('var.dashPositionsSub');
      } else {
        posSub.textContent = varT('var.dashPositionsSub');
      }
    }
    if (posEl) {
      if (!displayPositions.length) {
        const hint = liveWrap?.error ? ` ${liveWrap.error}` : '';
        posEl.innerHTML = `<div class="var-pos-empty">${varT('var.dashPosEmpty')}${hint ? `<div style="margin-top:6px;font-size:.72rem;opacity:.85">${hint}</div>` : ''}</div>`;
      } else {
        const pairMap = varPairsByMarket(dash);
        const body = displayPositions.map(p => {
          const mkt = String(p.market || '').toUpperCase();
          const pair = pairMap[mkt] || null;
          const vol = pair ? pair.volume : 0;
          const rpnl = pair ? pair.pnl : 0;
          const upnl = varComputePosUpnl(p);
          const mark = (Number(p.mark) > 0) ? Number(p.mark) : (varOmniLiveMark(p.market) || 0);
          const upnlCls = upnl > 0 ? 'color:var(--success)' : upnl < 0 ? 'color:var(--danger)' : '';
          const rpnlCls = rpnl > 0 ? 'color:var(--success)' : rpnl < 0 ? 'color:var(--danger)' : '';
          const tag = p.live
            ? ' <span style="color:var(--var-accent,#4c9af8);font-size:.65rem">LIVE</span>'
            : (p.fromFills ? ' <span style="color:var(--muted);font-size:.65rem">FILLS</span>' : '');
          return `<tr>
            <td class="font-medium">
              <span class="var-epoch-mkt-asset" style="gap:6px">
                ${varAssetLogoHtml(p.market)}
                <span>${varEsc(p.market)}${tag}</span>
              </span>
            </td>
            <td>${varSidePill(p.side)}</td>
            <td class="text-right mono">${varFmtPosQty(p.qty)}</td>
            <td class="text-right mono">${varFmtCompactUsd(p.notional)}</td>
            <td class="text-right mono">${varFmtPosPx(p.entry)}</td>
            <td class="text-right mono">${varFmtPosPx(mark)}</td>
            <td class="text-right mono">${vol > 0 ? varFmtCompactUsd(vol) : '—'}</td>
            <td class="text-right mono" style="${rpnlCls}">${pair ? varFmtSignedUsd(rpnl) : '—'}</td>
            <td class="text-right mono" style="${upnlCls}">${upnl == null ? '—' : varFmtSignedUsd(upnl)}</td>
          </tr>`;
        }).join('');
        posEl.innerHTML = `<table class="hs-trades-table"><thead><tr>
          <th>${varT('var.dashColMarket')}</th>
          <th>${varT('var.dashColSide')}</th>
          <th class="text-right">${varT('var.dashColQty')}</th>
          <th class="text-right">${varT('var.dashColSize')}</th>
          <th class="text-right">${varT('var.dashColEntry')}</th>
          <th class="text-right">${varT('var.dashColMark')}</th>
          <th class="text-right">${varT('var.dashColVol')}</th>
          <th class="text-right">${varT('var.dashColPnl')}</th>
          <th class="text-right">${varT('var.dashColUpnl')}</th>
        </tr></thead><tbody>${body}</tbody></table>`;
      }
    }
  }

  function varSetDashPeriod(period) {
    varDashPeriodSave(period);
    renderVarDash();
  }

  function varRenderJsonMeta(points) {
    const el = document.getElementById('varJsonMeta');
    if (!el) return;
    if (!points?.sourceFile && !points?.points_summary) {
      el.textContent = varT('var.jsonNotImported');
      return;
    }
    const sum = points.points_summary || {};
    const when = points.exported_at
      ? new Date(points.exported_at).toLocaleString(varLoc())
      : (points.importedAt ? new Date(points.importedAt).toLocaleString(varLoc()) : '—');
    el.innerHTML = varT('var.jsonMeta')
      .replace('{file}', `<strong>${points.sourceFile || 'export.json'}</strong>`)
      .replace('{points}', varFmtPoints(sum.total_points))
      .replace('{rank}', sum.rank != null ? String(sum.rank) : '—')
      .replace('{when}', when);
  }

  function varRenderPointsKpis(points) {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const sum = points?.points_summary;
    const self = points?.competition && !Array.isArray(points.competition)
      ? points.competition.self
      : null;
    if (!sum) {
      set('varActPoints', '—');
      set('varActRank', '—');
      set('varActSelfPts', '—');
      set('varActRefPts', '—');
      const sub = document.getElementById('varActPointsSub');
      if (sub) sub.textContent = '';
      const rsub = document.getElementById('varActRankSub');
      if (rsub) rsub.textContent = '';
    } else {
      set('varActPoints', varFmtPoints(sum.total_points));
      set('varActRank', sum.rank != null ? '#' + Number(sum.rank).toLocaleString(varLoc()) : '—');
      set('varActSelfPts', varFmtPoints(sum.self_points));
      set('varActRefPts', varFmtPoints(sum.referral_points));
      const hist = points.points_history || [];
      const sub = document.getElementById('varActPointsSub');
      if (sub) sub.textContent = hist.length ? `${hist.length} epochs` : '';
    }
    if (self) {
      const place = self.place != null ? self.place : self.rank;
      set('varCompPlace', place != null ? '#' + Number(place).toLocaleString(varLoc()) : '—');
      const scoreEl = document.getElementById('varCompScore');
      const score = parseFloat(self.score);
      if (scoreEl) {
        scoreEl.textContent = varFmtCompScore(score);
        scoreEl.classList.toggle('is-pos', isFinite(score) && score > 0);
        scoreEl.classList.toggle('is-neg', isFinite(score) && score < 0);
      }
      const placeSub = document.getElementById('varCompPlaceSub');
      if (placeSub) placeSub.textContent = self.name || '';
      const scoreSub = document.getElementById('varCompScoreSub');
      if (scoreSub) {
        scoreSub.textContent = self.volume != null
          ? varT('var.compVolShort').replace('{n}', varFmtCompactUsd(parseFloat(self.volume)))
          : '';
      }
    } else {
      set('varCompPlace', '—');
      set('varCompScore', '—');
      const scoreEl = document.getElementById('varCompScore');
      if (scoreEl) {
        scoreEl.classList.remove('is-pos', 'is-neg');
      }
      const placeSub = document.getElementById('varCompPlaceSub');
      if (placeSub) placeSub.textContent = '';
      const scoreSub = document.getElementById('varCompScoreSub');
      if (scoreSub) scoreSub.textContent = '';
    }
    try { varRenderFarmScore(points); } catch (_) {}
  }

  /** Farm overview score strip (self / rank / ref / competition). */
  function varRenderFarmScore(points) {
    if (!document.getElementById('varFarmScore')) return;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const pts = points || varPointsLoad();
    const sum = pts?.points_summary;
    const self = pts?.competition && !Array.isArray(pts.competition)
      ? pts.competition.self
      : null;
    if (!sum) {
      set('varFarmSelfPts', '—');
      set('varFarmRank', '—');
      set('varFarmRefPts', '—');
      set('varFarmCompPlace', '—');
      set('varFarmSelfPtsSub', '');
      set('varFarmRankSub', '');
      set('varFarmCompPlaceSub', '');
    } else {
      set('varFarmSelfPts', varFmtPoints(sum.self_points));
      set('varFarmRank', sum.rank != null ? '#' + Number(sum.rank).toLocaleString(varLoc()) : '—');
      set('varFarmRefPts', varFmtPoints(sum.referral_points));
      const hist = pts.points_history || [];
      set('varFarmSelfPtsSub', hist.length
        ? varT('var.farmEpochsCount').replace('{n}', String(hist.length))
        : '');
      set('varFarmRankSub', sum.total_points != null
        ? varT('var.farmTotalPts').replace('{n}', varFmtPoints(sum.total_points))
        : '');
    }
    if (self) {
      const place = self.place != null ? self.place : self.rank;
      set('varFarmCompPlace', place != null ? '#' + Number(place).toLocaleString(varLoc()) : '—');
      const score = parseFloat(self.score);
      set('varFarmCompPlaceSub', isFinite(score)
        ? varT('var.kpiCompSub').replace('{score}', varFmtCompScore(score))
        : (self.name || ''));
    } else {
      set('varFarmCompPlace', '—');
      set('varFarmCompPlaceSub', '');
    }
  }

  /** Compact recent epochs on Farm overview. */
  function varRenderFarmEpochMini() {
    const el = document.getElementById('varFarmEpochMini');
    const panel = document.getElementById('varFarmEpochsPanel');
    if (!el) return;
    const points = varPointsLoad();
    const bundle = varCsvLoadForView();
    const hasPts = !!(points?.points_summary || (points?.points_history && points.points_history.length));
    const hasTrades = !!(bundle?.trades && bundle.trades.length);
    if (!hasPts && !hasTrades) {
      el.innerHTML = `<div class="var-pos-empty">${varEsc(varT('var.farmEpochsEmpty'))}</div>`;
      if (panel) panel.style.display = '';
      return;
    }
    let rows = [];
    try { rows = varBuildEpochRows(points, bundle).slice(0, 5); } catch (_) { rows = []; }
    if (!rows.length) {
      el.innerHTML = `<div class="var-pos-empty">${varEsc(varT('var.farmEpochsEmpty'))}</div>`;
      return;
    }
    el.innerHTML = `<div class="var-farm-epoch-mini">${rows.map((r) => {
      const label = varEpochRangeLabel(r.start, r.end);
      let badge = '';
      if (r.inProgress) badge = varT('var.epochInProgress');
      else if (r.finalising) {
        const left = r.finalisingUntil != null ? varFmtCountdown(r.finalisingUntil - Date.now()) : '';
        badge = left
          ? varT('var.epochFinalising').replace('{time}', left)
          : varT('var.epochInProgress');
      } else if (r.estimated) badge = '~';
      const stats = varEpochWindowSummary(bundle, r.start, r.end);
      const vol = stats.volume > 0 ? varFmtCompactUsd(stats.volume) : '—';
      const ptsCls = r.self > 0 ? '' : 'muted';
      return `<div class="var-farm-epoch-row">
        <div>
          <strong>${varEsc(label)}</strong>
          ${badge ? `<div class="muted">${varEsc(badge)}</div>` : ''}
        </div>
        <div class="text-right mono ${ptsCls}">
          <strong>${varFmtPoints(r.self)}</strong>
          <div class="muted">${varEsc(varT('var.epochSelf'))}</div>
        </div>
        <div class="text-right mono">
          ${vol}
          <div class="muted">${varEsc(varT('var.epochVolume'))}</div>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  function varRenderFarmOverview() {
    try { varRenderFarmScore(varPointsLoad()); } catch (_) {}
    try { varRenderFarmEpochMini(); } catch (_) {}
  }

  function varEpochDateShort(ts) {
    if (!isFinite(ts)) return '—';
    return new Date(ts).toLocaleDateString(varLoc(), { day: 'numeric', month: 'short' });
  }

  function varEpochRangeLabel(start, endExclusive) {
    return `${varEpochDateShort(start)} ${varT('var.epochTo')} ${varEpochDateShort(endExclusive)}`;
  }

  function varEpochWindowAnalytics(bundle, start, exclusiveEnd) {
    const tradesAll = [...(bundle?.trades || [])]
      .filter(t => !t.status || t.status === 'confirmed')
      .map(t => ({
        ...t,
        underlying: String(t.underlying || t.instrument?.underlying || '').toUpperCase(),
        ts: Date.parse(t.created_at || 0),
        px: parseFloat(t.price || t.mark_price || 0),
        qty: parseFloat(t.qty || 0),
        sign: String(t.side || '').toLowerCase() === 'buy' ? 1 : -1,
      }))
      .filter(t => isFinite(t.ts) && t.underlying && isFinite(t.px) && isFinite(t.qty) && t.px > 0)
      .sort((a, b) => a.ts - b.ts);

    const transfersAll = [];
    const pushTransfer = (t, forcedType) => {
      const ts = Date.parse(t.created_at || 0);
      if (!isFinite(ts)) return;
      transfersAll.push({
        ...t,
        underlying: String(t.underlying || t.reference_instrument?.underlying || t.asset || '').toUpperCase(),
        ts,
        qty: parseFloat(t.qty || 0),
        type: forcedType || String(t.transfer_type || '').toLowerCase(),
      });
    };
    (bundle?.funding || []).forEach(t => pushTransfer(t, 'funding'));
    (bundle?.realizedPnl || []).forEach(t => pushTransfer(t, 'realized_pnl'));
    (bundle?.transfers || []).forEach(t => pushTransfer(t));

    const displayEnd = Math.min(Date.now(), exclusiveEnd - 1);
    const inWindow = (ts) => ts >= start && ts < exclusiveEnd;
    const winTrades = tradesAll.filter(t => inWindow(t.ts));

    let volume = 0;
    const pairMap = {};
    for (const t of winTrades) {
      const notional = Math.abs(t.px * t.qty);
      volume += notional;
      if (!pairMap[t.underlying]) pairMap[t.underlying] = { market: t.underlying, volume: 0, trades: 0, pnl: 0 };
      pairMap[t.underlying].volume += notional;
      pairMap[t.underlying].trades++;
    }

    let realizedPnl = 0;
    let wins = 0;
    let pnlN = 0;
    let funding = 0;
    for (const t of transfersAll) {
      if (!inWindow(t.ts)) continue;
      if (t.type === 'realized_pnl') {
        realizedPnl += t.qty;
        if (t.qty !== 0) { pnlN++; if (t.qty > 0) wins++; }
        const u = t.underlying;
        if (u) {
          if (!pairMap[u]) pairMap[u] = { market: u, volume: 0, trades: 0, pnl: 0 };
          pairMap[u].pnl += t.qty;
        }
      } else if (t.type === 'funding') {
        funding += t.qty;
      }
    }

    const hourMs = 3600e3;
    const chartStart = Math.floor(start / hourMs) * hourMs;
    const winEnd = Math.min(exclusiveEnd, displayEnd + 1);
    const posQ = {};
    const lastPx = {};
    let ti = 0;
    let peakOi = 0;
    let areaMs = 0;
    let coveredMs = 0;
    let heldMs = 0;

    // Replay fills before the window so OI carries in (TimberJ openInterestSeries).
    while (ti < tradesAll.length && tradesAll[ti].ts < start) {
      const t = tradesAll[ti++];
      lastPx[t.underlying] = t.px;
      posQ[t.underlying] = (posQ[t.underlying] || 0) + t.sign * t.qty;
      if (Math.abs(posQ[t.underlying]) < 1e-10) delete posQ[t.underlying];
    }

    const samples = [{ ts: start, oi: varOiUsd(posQ, lastPx) }];
    while (ti < tradesAll.length && tradesAll[ti].ts < winEnd) {
      const t = tradesAll[ti++];
      lastPx[t.underlying] = t.px;
      posQ[t.underlying] = (posQ[t.underlying] || 0) + t.sign * t.qty;
      if (Math.abs(posQ[t.underlying]) < 1e-10) delete posQ[t.underlying];
      samples.push({ ts: t.ts, oi: varOiUsd(posQ, lastPx) });
    }
    samples.push({ ts: winEnd, oi: samples[samples.length - 1].oi });

    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      const dt = Math.max(0, b.ts - a.ts);
      if (!(dt > 0)) continue;
      const oi = a.oi;
      areaMs += oi * dt;
      coveredMs += dt;
      if (oi > 0) heldMs += dt;
      if (oi > peakOi) peakOi = oi;
    }

    // Also track hourly peaks inside the window for display stability.
    let hourPeak = 0;
    let cursorOi = samples[0].oi;
    let si = 0;
    for (let h = chartStart; h < winEnd; h += hourMs) {
      const hend = Math.min(h + hourMs, winEnd);
      let peakH = cursorOi;
      while (si < samples.length && samples[si].ts < hend) {
        cursorOi = samples[si].oi;
        if (cursorOi > peakH) peakH = cursorOi;
        si++;
      }
      if (h >= start && peakH > hourPeak) hourPeak = peakH;
    }
    if (hourPeak > peakOi) peakOi = hourPeak;

    const avgOi = coveredMs > 0 ? areaMs / coveredMs : 0;
    const heldPct = coveredMs > 0 ? (heldMs / coveredMs) * 100 : 0;
    const pairs = Object.values(pairMap).sort((a, b) => b.volume - a.volume || Math.abs(b.pnl) - Math.abs(a.pnl));

    return {
      volume,
      trades: winTrades.length,
      realizedPnl,
      funding,
      winRate: pnlN ? (wins / pnlN) * 100 : null,
      avgOi,
      peakOi,
      heldPct,
      pairs,
    };
  }

  /** Omni usually publishes points ~24h after the Thursday epoch closes (TimberJ "finalising"). */
  const VAR_EPOCH_POINTS_PUBLISH_MS = 24 * 3600 * 1000;
  const VAR_EPOCH_RECENT_RATE_N = 4;

  function varFmtCountdown(ms) {
    if (!(ms > 0) || !isFinite(ms)) return '';
    const totalMin = Math.max(0, Math.floor(ms / 60000));
    const d = Math.floor(totalMin / (60 * 24));
    const h = Math.floor((totalMin % (60 * 24)) / 60);
    const m = totalMin % 60;
    if (d > 0) return `${d}d ${h}h`;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }

  /**
   * TimberJ "recent rate": arithmetic mean of self pts / $1M volume
   * over the last N published earning epochs before `beforeStart`.
   */
  function varEpochRecentRate(points, bundle, beforeStart, lastN) {
    const n = lastN != null ? lastN : VAR_EPOCH_RECENT_RATE_N;
    const hist = [...(points?.points_history || [])]
      .map((h) => {
        const start = Date.parse(h.start_window || 0);
        const end = Date.parse(h.end_window || 0);
        const self = parseFloat(h.self_points || h.total_points || 0);
        if (!isFinite(start) || !isFinite(end) || !(self > 0)) return null;
        if (isFinite(beforeStart) && !(start < beforeStart)) return null;
        return { start, end: end > start ? end : start + 7 * 864e5, self, row: h };
      })
      .filter(Boolean)
      .sort((a, b) => b.start - a.start);

    const rates = [];
    for (const h of hist) {
      let vol = varEpochWindowSummary(bundle, h.start, h.end).volume;
      // Prefer CSV volume; fall back to Omni-reported volume on the history row when present.
      if (!(vol > 0)) {
        const reported = parseFloat(
          h.row.volume || h.row.total_volume || h.row.trading_volume || h.row.volume_usd || 0
        );
        if (reported > 0) vol = reported;
      }
      if (!(vol > 0)) continue;
      rates.push((h.self / vol) * 1e6);
      if (rates.length >= n) break;
    }
    if (!rates.length) return null;
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  }

  /** Lifetime self pts / lifetime CSV volume — used when no per-epoch rates exist yet. */
  function varEpochLifetimeRate(points, bundle) {
    const self = parseFloat(
      points?.points_summary?.self_points
      ?? points?.points_summary?.total_points
      ?? NaN
    );
    if (!(self > 0)) return null;
    let vol = 0;
    for (const t of bundle?.trades || []) {
      if (t.status && t.status !== 'confirmed') continue;
      const px = parseFloat(t.price || t.mark_price || 0);
      const qty = parseFloat(t.qty || 0);
      const notional = Math.abs(px * qty);
      if (notional > 0) vol += notional;
    }
    if (!(vol > 0)) return null;
    return (self / vol) * 1e6;
  }

  function varEpochRememberRate(rate) {
    if (!(rate > 0) || !isFinite(rate)) return;
    try { localStorage.setItem('hs-var-epoch-rate', String(rate)); } catch (_) {}
  }

  function varEpochStoredRate() {
    try {
      const v = parseFloat(localStorage.getItem('hs-var-epoch-rate') || '');
      return v > 0 && isFinite(v) ? v : null;
    } catch (_) {
      return null;
    }
  }

  /** Community heuristic when no personal calibration exists yet (pts / $1M raw). */
  const VAR_EPOCH_COMMUNITY_RATE = 14;

  function varEpochHeuristicRate(bundle, start, exclusiveEnd) {
    try {
      const trades = varLabPrepareTrades(bundle);
      const m = varLabWindowMetrics(trades, start, exclusiveEnd);
      if (!(m.volume > 0)) return VAR_EPOCH_COMMUNITY_RATE;
      // Boost with RWA share — Omni weights RWA higher (rough community fit).
      const rwa = Math.max(0, Math.min(1, m.rwaShare || 0));
      return VAR_EPOCH_COMMUNITY_RATE * (1 + 3.5 * rwa);
    } catch (_) {
      return VAR_EPOCH_COMMUNITY_RATE;
    }
  }

  /** TimberJ-style estimate: volume × recent pts/$1M (not the Lab RWA pool model). */
  function varEpochEstimateSelf(points, bundle, start, exclusiveEnd, rateOpt) {
    try {
      const stats = varEpochWindowSummary(bundle, start, exclusiveEnd);
      const volume = stats.volume || 0;
      if (!(volume > 0)) return { points: 0, rate: null, metrics: stats, method: 'timber' };
      let rate = rateOpt != null && rateOpt > 0
        ? rateOpt
        : varEpochRecentRate(points, bundle, start, VAR_EPOCH_RECENT_RATE_N);
      let method = 'timber';
      if (!(rate > 0)) {
        // Fallback: Lab rwa-9 when we can calibrate a pool from overlapping epochs.
        try {
          const trades = varLabPrepareTrades(bundle);
          const model = varLabModelById('rwa-9');
          const m = varLabWindowMetrics(trades, start, exclusiveEnd);
          const poolRows = varLabPoolHistory(model, points, trades).filter((r) => r.start < start);
          const recent = poolRows.slice(-12);
          const median = varLabMedianPool(recent.length ? recent : poolRows);
          if (median > 0) {
            const exposure = varLabExposure(model, m);
            const est = median * exposure;
            const labRate = volume > 0 ? (est / volume) * 1e6 : null;
            if (labRate > 0) varEpochRememberRate(labRate);
            return {
              points: est,
              rate: labRate,
              metrics: stats,
              method: 'lab',
            };
          }
        } catch (_) {}
        const life = varEpochLifetimeRate(points, bundle);
        const stored = varEpochStoredRate();
        if (life > 0) { rate = life; method = 'lifetime'; }
        else if (stored > 0) { rate = stored; method = 'stored'; }
        else { rate = varEpochHeuristicRate(bundle, start, exclusiveEnd); method = 'community'; }
      }
      if (!(rate > 0)) return { points: 0, rate: null, metrics: stats, method: 'none' };
      varEpochRememberRate(rate);
      const est = (volume * rate) / 1e6;
      return { points: est, rate, metrics: stats, method };
    } catch (_) {
      return { points: 0, rate: null, metrics: null, method: 'none' };
    }
  }

  function varEpochOfficialNear(rows, start) {
    return rows.find((r) => Math.abs(r.start - start) < 12 * 3600 * 1000) || null;
  }

  function varBuildEpochRows(points, bundle) {
    const now = Date.now();
    const rows = [...(points?.points_history || [])]
      .map(h => {
        const start = Date.parse(h.start_window || 0);
        const end = Date.parse(h.end_window || 0);
        const self = parseFloat(h.self_points || 0);
        const referral = parseFloat(h.referral_points || 0);
        const total = parseFloat(h.total_points || 0);
        if (!isFinite(start) || !isFinite(end)) return null;
        // Keep zero-point history rows — they may still be finalising (TimberJ shows ~estimate).
        return {
          id: `h:${start}`,
          start,
          end: end > start ? end : start + 7 * 864e5,
          self: isFinite(self) ? self : 0,
          referral: isFinite(referral) ? referral : 0,
          total: isFinite(total) ? total : 0,
          estimated: false,
          inProgress: now >= start && now < end,
        };
      })
      .filter(Boolean);

    const epochStart = varEpochStartUtc(now);
    const weekMs = 7 * 864e5;
    // One recent-rate lookup reused across the 16-week fill loop (same published history).
    const rateByBefore = new Map();
    const rateFor = (beforeStart) => {
      if (rateByBefore.has(beforeStart)) return rateByBefore.get(beforeStart);
      const r = varEpochRecentRate(points, bundle, beforeStart, VAR_EPOCH_RECENT_RATE_N);
      rateByBefore.set(beforeStart, r);
      return r;
    };

    // Ensure every recent Thursday week with volume appears (current + finalising + gaps).
    for (let i = 0; i < 16; i++) {
      const start = epochStart - i * weekMs;
      const end = start + weekMs;
      const inProgress = now >= start && now < end;
      const finalisingUntil = end + VAR_EPOCH_POINTS_PUBLISH_MS;
      const finalising = !inProgress && now >= end && now < finalisingUntil;
      const existing = varEpochOfficialNear(rows, start);
      const hasOfficialPts = !!(existing && (existing.total > 0 || existing.self > 0));

      // Prefer Omni-published points whenever they exist.
      if (hasOfficialPts) {
        existing.inProgress = inProgress;
        existing.finalising = false;
        continue;
      }

      const stats = varEpochWindowSummary(bundle, start, end);
      // Skip estimate math when the week clearly has no volume (still keep finalising/live shells).
      if (!(stats.volume > 0) && !(stats.trades > 0) && !inProgress && !finalising && !existing) {
        continue;
      }
      const est = varEpochEstimateSelf(points, bundle, start, end, rateFor(start));
      const worthShow = inProgress || finalising
        || stats.trades > 0 || stats.volume > 0 || est.points > 0;

      if (!worthShow) continue;

      if (existing) {
        // Zero official points (or still finalising): show Timber-style estimate.
        if (!(existing.total > 0 || existing.self > 0) || finalising) {
          existing.estimated = true;
          existing.finalising = finalising;
          existing.finalisingUntil = finalisingUntil;
          existing.inProgress = inProgress;
          if (est.points > 0) {
            existing.self = est.points;
            existing.total = est.points + (existing.referral || 0);
            existing.estPoints = est.points;
            existing.estRate = est.rate;
          }
        }
        continue;
      }

      rows.push({
        id: `est:${start}`,
        start,
        end,
        self: est.points,
        referral: 0,
        total: est.points,
        estimated: true,
        inProgress,
        finalising,
        finalisingUntil,
        estRate: est.rate,
        estPoints: est.points,
      });
    }

    // Enrich in-progress official rows with secondary estimate when useful.
    for (const r of rows) {
      if (!r.inProgress || r.estimated) continue;
      const est = varEpochEstimateSelf(points, bundle, r.start, r.end, rateFor(r.start));
      if (est.points > 0) {
        r.estPoints = est.points;
        r.estRate = est.rate;
      }
    }

    return rows
      .filter((r) => r.estimated || r.inProgress || r.finalising || r.total > 0 || r.self > 0)
      .sort((a, b) => b.start - a.start)
      .slice(0, 24);
  }

  function varAssetLogoLetterBg(sym) {
    let h = 0;
    const s = String(sym || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hues = [210, 165, 25, 280, 340, 45, 195];
    return `hsl(${hues[h % hues.length]} 42% 34%)`;
  }

  const VAR_ASSET_LOGO_CRYPTO = new Set([
    'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'UNI', 'AAVE',
    'ARB', 'OP', 'SUI', 'APT', 'NEAR', 'ATOM', 'LTC', 'BCH', 'FIL', 'INJ', 'TIA', 'SEI',
    'PEPE', 'WIF', 'BONK', 'JUP', 'PYTH', 'WLD', 'TON', 'TRX', 'HYPE', 'kPEPE', 'kBONK',
  ]);

  // Prefer Lighter token art (same CDN TimberJ uses for Omni RWA/stocks).
  const VAR_ASSET_LOGO_LIGHTER_ALIAS = {
    XAU: 'xau', XAG: 'xag', GOLD: 'xau', SILVER: 'xag',
    XCU: 'xcu', COPPER: 'xcu',
    NATGAS: 'natgas', WHEAT: 'wheat',
    GOOGL: 'googl', GOOG: 'googl',
    BRK: 'brk', 'BRK.B': 'brk', 'BRK-B': 'brk',
    SPCX: 'spacex', SKHX: 'skhynix', HYUNDAI: 'hyundai',
    BRENTOIL: 'wti', CL: 'wti', WTI: 'wti',
  };

  function varLighterLogoUrl(sym) {
    const s = String(sym || '').trim().toUpperCase();
    if (!s) return '';
    const slug = VAR_ASSET_LOGO_LIGHTER_ALIAS[s] || s.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!slug) return '';
    return `https://assets.lighter.xyz/fe/token/${encodeURIComponent(slug)}.png`;
  }

  function varAssetLogoUrls(sym) {
    const s = String(sym || '').trim().toUpperCase();
    if (!s) return [];
    const out = [];
    const push = (u) => { if (u && !out.includes(u)) out.push(u); };
    const isCrypto = VAR_ASSET_LOGO_CRYPTO.has(s) || /^k[A-Z]/.test(s);

    if (isCrypto) {
      push(`https://app.hyperliquid.xyz/coins/${encodeURIComponent(s)}.svg`);
      push(varLighterLogoUrl(s));
    } else {
      // Stocks / RWA / commodities — Lighter first (TimberJ-style).
      push(varLighterLogoUrl(s));
      push(`https://app.hyperliquid.xyz/coins/${encodeURIComponent('xyz:' + s)}.svg`);
      push(`https://app.hyperliquid.xyz/coins/${encodeURIComponent(s)}.svg`);
      push(`https://images.financialmodelingprep.com/symbol/${encodeURIComponent(s)}.png`);
      push(`https://financialmodelingprep.com/image-stock/${encodeURIComponent(s)}.png`);
      push(`https://companiesmarketcap.com/img/company-logos/64/${encodeURIComponent(s)}.png`);
    }
    return out;
  }

  function varAssetLogoHtml(sym) {
    const s = String(sym || '').trim().toUpperCase() || '?';
    const urls = varAssetLogoUrls(s);
    const letters = s.length <= 2 ? s : s.slice(0, 2);
    const bg = varAssetLogoLetterBg(s);
    const primary = urls[0] || '';
    const rest = urls.slice(1).join('|');
    return `<span class="var-epoch-mkt-logo${primary ? '' : ' is-fallback'}" data-fallbacks="${varEsc(rest)}">
      ${primary ? `<img src="${varEsc(primary)}" alt="" width="22" height="22" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="varAssetLogoFallback(this)">` : ''}
      <span class="var-epoch-mkt-fb" style="background:${bg}">${varEsc(letters)}</span>
    </span>`;
  }

  function varAssetLogoFallback(img) {
    const wrap = img && img.closest ? img.closest('.var-epoch-mkt-logo') : null;
    if (!wrap) return;
    const list = String(wrap.dataset.fallbacks || '').split('|').filter(Boolean);
    if (list.length) {
      wrap.dataset.fallbacks = list.slice(1).join('|');
      img.src = list[0];
      return;
    }
    wrap.classList.add('is-fallback');
    img.remove();
  }

  function varEpochMarketsHtml(rowId, pairs, marketsOpen) {
    if (!pairs.length) {
      return `<div class="var-epoch-markets-empty">${varEsc(varT('var.epochNoMarkets'))}</div>`;
    }
    const maxVol = Math.max(...pairs.map(p => p.volume), 1e-9);
    const limit = marketsOpen ? pairs.length : Math.min(6, pairs.length);
    const shown = pairs.slice(0, limit);
    const rows = shown.map(p => {
      const pct = Math.max(2, Math.round((p.volume / maxVol) * 100));
      const pnlCls = p.pnl > 0 ? 'is-pos' : (p.pnl < 0 ? 'is-neg' : '');
      return `<div class="var-epoch-mkt">
        <span class="var-epoch-mkt-asset">
          ${varAssetLogoHtml(p.market)}
          <span class="var-epoch-mkt-name mono">${varEsc(p.market)}</span>
        </span>
        <div class="var-epoch-mkt-bar"><span style="width:${pct}%"></span></div>
        <span class="var-epoch-mkt-pnl mono ${pnlCls}">${varFmtSignedUsdExact(p.pnl)}</span>
      </div>`;
    }).join('');
    let more = '';
    if (pairs.length > 6) {
      more = `<button type="button" class="var-epoch-markets-toggle" data-epoch-markets="${varEsc(rowId)}">${
        marketsOpen ? varT('var.epochShowFewer') : varT('var.epochShowMore').replace('{n}', String(pairs.length - 6))
      }</button>`;
    }
    return rows + more;
  }

  function varEpochDetailHtml(row, stats, marketsOpen) {
    const wr = stats.winRate != null
      ? varT('var.epochWinRate').replace('{pct}', stats.winRate.toFixed(1))
      : varT('var.epochWinRate').replace('{pct}', '—');
    const fundCls = stats.funding > 0 ? 'is-pos' : (stats.funding < 0 ? 'is-neg' : '');
    return `<div class="var-epoch-detail">
      <div class="var-epoch-detail-col var-epoch-oi-card">
        <div class="var-epoch-detail-h">${varEsc(varT('var.epochOiTitle'))}</div>
        <div class="var-epoch-oi-grid">
          <div><span class="lbl">${varEsc(varT('var.epochOiAvg'))}</span><strong class="mono">${varFmtCompactUsd(stats.avgOi)}</strong></div>
          <div><span class="lbl">${varEsc(varT('var.epochOiPeak'))}</span><strong class="mono">${varFmtCompactUsd(stats.peakOi)}</strong></div>
          <div><span class="lbl">${varEsc(varT('var.epochOiHeld'))}</span><strong class="mono">${Math.round(stats.heldPct)}%</strong></div>
        </div>
        <div class="var-epoch-oi-extra">
          <div>${varEsc(wr)}</div>
          <div>${varEsc(varT('var.epochFunding'))}: <span class="mono ${fundCls}">${varFmtSignedUsdExact(stats.funding)}</span></div>
        </div>
      </div>
      <div class="var-epoch-detail-col var-epoch-markets-card">
        <div class="var-epoch-detail-h">${varEsc(varT('var.epochMarketsTitle'))}</div>
        <div class="var-epoch-markets">${varEpochMarketsHtml(row.id, stats.pairs, marketsOpen)}</div>
      </div>
    </div>`;
  }

  function varBindEpochTableUi() {
    if (_varEpochUiBound) return;
    _varEpochUiBound = true;
    const wrap = document.getElementById('varEpochTable');
    if (!wrap) return;
    wrap.addEventListener('click', (e) => {
      const mktBtn = e.target.closest('[data-epoch-markets]');
      if (mktBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = mktBtn.getAttribute('data-epoch-markets');
        if (_varEpochMarketsOpen.has(id)) _varEpochMarketsOpen.delete(id);
        else _varEpochMarketsOpen.add(id);
        try { varRenderEpochTable(varPointsLoad()); } catch (_) {}
        return;
      }
      const head = e.target.closest('[data-epoch-toggle]');
      if (!head) return;
      e.preventDefault();
      const id = head.getAttribute('data-epoch-toggle');
      if (_varEpochExpanded.has(id)) _varEpochExpanded.delete(id);
      else _varEpochExpanded.add(id);
      try { varRenderEpochTable(varPointsLoad()); } catch (_) {}
    });
  }

  let _varEpochSumCache = null;

  function varEpochSumCacheKey(bundle) {
    const trades = bundle?.trades || [];
    const last = trades.length ? trades[trades.length - 1] : null;
    return [
      trades.length,
      last?.created_at || '',
      bundle?.realizedPnl?.length || 0,
      bundle?.transfers?.length || 0,
    ].join(':');
  }

  function varEpochWindowSummary(bundle, start, exclusiveEnd) {
    const ck = varEpochSumCacheKey(bundle);
    if (!_varEpochSumCache || _varEpochSumCache.key !== ck) {
      _varEpochSumCache = { key: ck, map: new Map() };
    }
    const mapKey = `${start}:${exclusiveEnd}`;
    if (_varEpochSumCache.map.has(mapKey)) return _varEpochSumCache.map.get(mapKey);

    let volume = 0;
    let tradeCount = 0;
    for (const t of bundle?.trades || []) {
      if (t.status && t.status !== 'confirmed') continue;
      const ts = Date.parse(t.created_at || 0);
      if (!(ts >= start && ts < exclusiveEnd)) continue;
      const px = parseFloat(t.price || t.mark_price || 0);
      const qty = parseFloat(t.qty || 0);
      const notional = Math.abs(px * qty);
      if (!(notional > 0)) continue;
      volume += notional;
      tradeCount++;
    }
    let realizedPnl = 0;
    const pushPnl = (rows) => {
      for (const t of rows || []) {
        const ts = Date.parse(t.created_at || 0);
        if (!(ts >= start && ts < exclusiveEnd)) continue;
        const tt = String(t.transfer_type || '').toLowerCase();
        if (tt && tt !== 'realized_pnl') continue;
        realizedPnl += parseFloat(t.qty || 0) || 0;
      }
    };
    if (bundle?.realizedPnl?.length) pushPnl(bundle.realizedPnl);
    else pushPnl(bundle?.transfers);
    const out = {
      volume,
      trades: tradeCount,
      realizedPnl,
      funding: 0,
      winRate: null,
      avgOi: 0,
      peakOi: 0,
      heldPct: 0,
      pairs: [],
    };
    _varEpochSumCache.map.set(mapKey, out);
    return out;
  }

  function varRenderEpochTable(points) {
    const wrap = document.getElementById('varEpochTable');
    const heading = document.getElementById('varEpochHeading');
    const empty = document.getElementById('varEpochEmpty');
    if (!wrap || !heading) return;

    const bundle = varCsvLoadForView() || { trades: [], funding: [], realizedPnl: [], transfers: [] };
    const rows = varBuildEpochRows(points, bundle);
    varBindEpochTableUi();

    if (!rows.length) {
      wrap.style.display = 'none';
      heading.style.display = 'none';
      wrap.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    heading.style.display = '';
    wrap.style.display = '';

    // Keep rows collapsed on first paint — expanding runs O(hours×trades) OI analytics.
    if (!_varEpochDidInitExpand) _varEpochDidInitExpand = true;

    const cache = new Map();
    const statsFor = (row, full) => {
      const key = row.id + (full ? ':full' : ':sum');
      if (cache.has(key)) return cache.get(key);
      const s = full
        ? varEpochWindowAnalytics(bundle, row.start, row.end)
        : varEpochWindowSummary(bundle, row.start, row.end);
      cache.set(key, s);
      return s;
    };

    const body = rows.map(row => {
      const open = _varEpochExpanded.has(row.id);
      const stats = statsFor(row, open);
      const pts = row.estimated ? row.self : row.total;
      const ptsLabel = row.estimated
        ? `~${varFmtPoints(pts)}`
        : varFmtPoints(pts);
      // Show the rate used for ~estimates; published weeks keep the realized rate.
      const rate = row.estimated && row.estRate != null && isFinite(row.estRate)
        ? row.estRate
        : (!row.estimated && stats.volume > 0 && pts > 0
          ? (pts / stats.volume) * 1e6
          : (stats.volume > 0 && pts > 0 ? (pts / stats.volume) * 1e6 : null));
      const rateLabel = varFmtPtsRate(rate, !!row.estimated);
      let badge = '';
      if (row.inProgress) {
        badge = `<span class="var-epoch-badge">${varEsc(varT('var.epochInProgress'))}</span>`;
      } else if (row.finalising) {
        const left = Math.max(0, (row.finalisingUntil || 0) - Date.now());
        const time = varFmtCountdown(left) || '—';
        badge = `<span class="var-epoch-badge is-finalising">${varEsc(varT('var.epochFinalising').replace('{time}', time))}</span>`;
      }
      const netCls = stats.realizedPnl > 0 ? 'is-pos' : (stats.realizedPnl < 0 ? 'is-neg' : '');
      const tradesLbl = varT('var.epochTrades').replace('{n}', String(stats.trades));
      return `<div class="var-epoch-row${open ? ' is-open' : ''}${row.inProgress ? ' is-live' : ''}${row.finalising ? ' is-finalising' : ''}">
        <button type="button" class="var-epoch-summary" data-epoch-toggle="${varEsc(row.id)}" aria-expanded="${open ? 'true' : 'false'}">
          <div class="var-epoch-col-epoch">
            <div class="var-epoch-range">
              <span class="mono">${varEsc(varEpochRangeLabel(row.start, row.end))}</span>
              ${badge}
            </div>
            <div class="var-epoch-sub">${varEsc(tradesLbl)}</div>
          </div>
          <div class="var-epoch-col">
            <div class="var-epoch-col-lbl">${varEsc(varT('var.epochPoints'))}</div>
            <div class="var-epoch-col-val mono">${ptsLabel}</div>
          </div>
          <div class="var-epoch-col">
            <div class="var-epoch-col-lbl">${varEsc(varT('var.epochVolume'))}</div>
            <div class="var-epoch-col-val mono">${stats.volume > 0 ? varFmtCompactUsd(stats.volume) : '—'}</div>
          </div>
          <div class="var-epoch-col">
            <div class="var-epoch-col-lbl">${varEsc(varT('var.epochNet'))}</div>
            <div class="var-epoch-col-val mono ${netCls}">${varFmtSignedUsdExact(stats.realizedPnl)}</div>
          </div>
          <div class="var-epoch-col var-epoch-col-rate">
            <div class="var-epoch-col-lbl">${varEsc(varT('var.epochPtsPer'))}</div>
            <div class="var-epoch-col-val mono">${rateLabel}</div>
          </div>
          <span class="var-epoch-chev" aria-hidden="true"></span>
        </button>
        ${open ? varEpochDetailHtml(row, stats, _varEpochMarketsOpen.has(row.id)) : ''}
      </div>`;
    }).join('');

    wrap.innerHTML = `<div class="var-epoch-list">
      <div class="var-epoch-head">
        <span>${varEsc(varT('var.epochWeek'))}</span>
        <span class="text-right">${varEsc(varT('var.epochPoints'))}</span>
        <span class="text-right">${varEsc(varT('var.epochVolume'))}</span>
        <span class="text-right">${varEsc(varT('var.epochNet'))}</span>
        <span class="text-right var-epoch-col-rate">${varEsc(varT('var.epochPtsPer'))}</span>
        <span></span>
      </div>
      ${body}
    </div>`;

    // Refresh countdown while a week is still finalising.
    if (rows.some((r) => r.finalising)) {
      clearTimeout(window.__hsVarEpochFinalTimer);
      window.__hsVarEpochFinalTimer = setTimeout(() => {
        try {
          if (_varSub === 'points' || _varSub === 'lab') varRenderEpochTable(varPointsLoad());
        } catch (_) {}
      }, 60000);
    }
  }

  function varCompPlaceOf(row) {
    if (!row) return null;
    if (row.place != null) return Number(row.place);
    if (row.rank != null) return Number(row.rank);
    if (row.ranking != null) return Number(row.ranking);
    return null;
  }

  const VAR_COMP_QUALIFYING_VOLUME = 250000;
  const VAR_COMPETITION = {
    number: 5,
    start: Date.UTC(2026, 6, 17),
    end: Date.UTC(2026, 6, 31),
  };
  const VAR_COMPETITION_DAYS = Math.max(1, Math.round((VAR_COMPETITION.end - VAR_COMPETITION.start) / 864e5));
  const VAR_COMP_VOLUME_TIERS = [
    { label: '250k–500k', min: 25e4, max: 5e5 },
    { label: '500k–1M', min: 5e5, max: 1e6 },
    { label: '1M–5M', min: 1e6, max: 5e6 },
    { label: '5M–10M', min: 5e6, max: 1e7 },
    { label: '10M+', min: 1e7, max: Infinity },
  ];

  function varCompDayOf(ts) {
    const t = ts != null ? Number(ts) : Date.now();
    if (!isFinite(t) || t < VAR_COMPETITION.start || t > VAR_COMPETITION.end) return null;
    return Math.floor((t - VAR_COMPETITION.start) / 864e5) + 1;
  }

  function varCompAgeLabel(iso) {
    const ts = iso ? Date.parse(iso) : NaN;
    if (!isFinite(ts)) return '';
    try {
      const when = new Date(ts).toLocaleString(varLoc(), {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
      return varT('var.compPulled').replace('{when}', when);
    } catch (_) {
      return '';
    }
  }

  function varCompQuantile(sorted, q) {
    if (!sorted.length) return 0;
    const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
    return sorted[i];
  }

  function varCompMedian(sorted) {
    if (!sorted.length) return 0;
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function varCompNormalizeEntries(raw) {
    const list = Array.isArray(raw)
      ? raw.slice()
      : (Array.isArray(raw?.entries) ? raw.entries.slice() : []);
    return list.map(row => ({
      ...row,
      volume: parseFloat(row.volume),
      pnl: parseFloat(row.pnl),
      score: parseFloat(row.score),
      place: varCompPlaceOf(row),
    })).filter(row => isFinite(row.volume) && row.volume >= VAR_COMP_QUALIFYING_VOLUME);
  }

  function varCompFieldStats(entries) {
    if (!entries.length) return null;
    const vols = entries.map(e => e.volume).sort((a, b) => a - b);
    const totalVolume = vols.reduce((a, b) => a + b, 0);
    const totalPnl = entries.reduce((a, e) => a + (isFinite(e.pnl) ? e.pnl : 0), 0);
    const green = entries.filter(e => e.pnl > 0).length;
    const top10 = [...entries].sort((a, b) => (a.place ?? 1e9) - (b.place ?? 1e9)).slice(0, 10);
    const top10Vol = top10.reduce((a, e) => a + e.volume, 0);
    const top10Pnl = top10.reduce((a, e) => a + (isFinite(e.pnl) ? e.pnl : 0), 0);
    const tiers = VAR_COMP_VOLUME_TIERS.map(t => {
      const rows = entries.filter(e => e.volume >= t.min && e.volume < t.max);
      const volume = rows.reduce((a, e) => a + e.volume, 0);
      return {
        ...t,
        wallets: rows.length,
        share: entries.length ? rows.length / entries.length : 0,
        volume,
        volumeShare: totalVolume > 0 ? volume / totalVolume : 0,
      };
    });
    return {
      wallets: entries.length,
      totalVolume,
      totalPnl,
      medianVolume: varCompMedian(vols),
      p25Volume: varCompQuantile(vols, 0.25),
      p75Volume: varCompQuantile(vols, 0.75),
      green,
      greenShare: entries.length ? green / entries.length : 0,
      top10VolumeShare: totalVolume > 0 ? top10Vol / totalVolume : 0,
      top10Pnl,
      tiers,
    };
  }

  function varCompStanding(entries, self) {
    if (!self || !entries.length) return null;
    const vol = parseFloat(self.volume);
    const pnl = parseFloat(self.pnl);
    const place = varCompPlaceOf(self);
    const field = entries.length;
    const pctLess = (getter, value) => {
      if (!isFinite(value)) return null;
      return entries.filter(e => getter(e) < value).length / field;
    };
    const rankAbove = (getter, value) => {
      if (!isFinite(value)) return null;
      return entries.filter(e => getter(e) > value).length + 1;
    };
    const targetPlace = place != null ? Math.max(1, place - 10) : null;
    const targetRow = targetPlace != null
      ? entries.find(e => e.place === targetPlace)
      : null;
    let climbPnl = null;
    if (targetRow && isFinite(vol) && vol > 0) {
      // Score ≈ PnL × √volume  →  PnL ≈ score / √volume
      climbPnl = targetRow.score / Math.sqrt(vol);
    }
    return {
      place,
      field,
      scorePercentile: place != null && field > 0 ? Math.max(0, (field - place) / field) : null,
      volumePercentile: pctLess(e => e.volume, vol),
      pnlPercentile: pctLess(e => e.pnl, pnl),
      volumeRank: rankAbove(e => e.volume, vol),
      pnlRank: rankAbove(e => e.pnl, pnl),
      volume: vol,
      pnl,
      score: parseFloat(self.score),
      name: self.name || '',
      address: self.address || '',
      climbTarget: targetPlace,
      climbPnl,
    };
  }

  function varFmtFracPct(frac, digits) {
    if (frac == null || !isFinite(frac)) return '—';
    return varFmtPct(frac * 100, digits != null ? digits : 1);
  }

  function varRenderCompDayMeta(points, field) {
    const host = document.getElementById('varCompDayMeta');
    const desc = document.getElementById('varCompHeroDesc');
    if (desc && field?.wallets) {
      desc.textContent = varT('var.compHeroCount').replace('{n}', field.wallets.toLocaleString(varLoc()));
    }
    if (!host) return;
    const pulled = points?.competition && !Array.isArray(points.competition)
      ? points.competition.pulled_at
      : null;
    const day = varCompDayOf(Date.now());
    const endDate = new Date(VAR_COMPETITION.end).toLocaleDateString(varLoc(), {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
    const pills = [];
    if (day != null) {
      pills.push(`<span class="var-comp-meta-pill">${varT('var.compDay')
        .replace('{d}', String(day))
        .replace('{total}', String(VAR_COMPETITION_DAYS))}</span>`);
    }
    pills.push(`<span class="var-comp-meta-pill">${varT('var.compEnds').replace('{date}', endDate)}</span>`);
    const age = varCompAgeLabel(pulled);
    if (age) pills.push(`<span class="var-comp-meta-pill">${varEsc(age)}</span>`);
    host.innerHTML = pills.join('');
  }

  function varRenderCompWallet(standing, selfRow) {
    const host = document.getElementById('varCompWalletBlock');
    if (!host) return;
    if (!standing || !selfRow) {
      host.innerHTML = '';
      return;
    }
    const short = (w) => {
      const s = String(w || '');
      return s.length > 10 ? s.slice(0, 6) + '…' + s.slice(-4) : (s || '');
    };
    const name = varEsc(standing.name || short(standing.address) || '—');
    const addr = standing.address ? `<span class="var-comp-wallet-addr mono">${varEsc(short(standing.address))}</span>` : '';
    const place = standing.place != null
      ? varT('var.compWalletPlace').replace('{n}', standing.place.toLocaleString(varLoc()))
      : '—';
    host.innerHTML = `
      <div class="var-comp-wallet">
        <div class="var-comp-wallet-kicker">${varT('var.compWalletKicker')}</div>
        <div class="var-comp-wallet-main">
          <div class="var-comp-wallet-name">${name}${addr}</div>
          <div class="var-comp-wallet-place">${place}</div>
        </div>
        <div class="var-comp-wallet-stats">
          <span>${varT('var.compVolume')} <strong>${isFinite(standing.volume) ? varFmtCompactUsd(standing.volume) : '—'}</strong></span>
          <span>${varT('var.compPnl')} <strong>${isFinite(standing.pnl) ? varFmtSignedUsd(standing.pnl) : '—'}</strong></span>
          <span>${varT('var.compScore')} <strong>${varFmtPoints(standing.score)}</strong></span>
        </div>
      </div>`;
  }

  function varRenderCompStanding(standing) {
    const host = document.getElementById('varCompStandingBlock');
    if (!host) return;
    if (!standing) {
      host.innerHTML = '';
      return;
    }
    const bar = (pct) => {
      const w = pct != null && isFinite(pct) ? Math.max(2, Math.min(100, Math.round(pct * 100))) : 0;
      return `<div class="var-comp-stand-bar" aria-hidden="true"><span style="width:${w}%"></span></div>`;
    };
    const card = (labelKey, pct, sub, accent) => `
      <div class="kpi${accent ? ' kpi-accent' : ''}">
        <div class="kpi-label">${varT(labelKey)}</div>
        <div class="kpi-val">${varFmtFracPct(pct, 1)}</div>
        ${bar(pct)}
        <div class="kpi-sub">${sub || ''}</div>
      </div>`;
    const scoreSub = standing.place != null
      ? varT('var.compOfficialPlace').replace('{n}', standing.place.toLocaleString(varLoc()))
      : '';
    const pnlSub = varT('var.compPnlRank')
      .replace('{pnl}', isFinite(standing.pnl) ? varFmtSignedUsd(standing.pnl) : '—')
      .replace('{n}', standing.pnlRank != null ? standing.pnlRank.toLocaleString(varLoc()) : '—');
    const volSub = varT('var.compVolRank')
      .replace('{vol}', isFinite(standing.volume) ? varFmtCompactUsd(standing.volume) : '—')
      .replace('{n}', standing.volumeRank != null ? standing.volumeRank.toLocaleString(varLoc()) : '—');
    host.innerHTML = `
      <div class="var-comp-stand-head">
        <h3>${varT('var.compWhereStand')}</h3>
        <span>${varT('var.compWhereStandSub')}</span>
      </div>
      <div class="var-comp-stand-grid">
        ${card('var.compScorePct', standing.scorePercentile, scoreSub, true)}
        ${card('var.compPnlPct', standing.pnlPercentile, pnlSub, false)}
        ${card('var.compVolPct', standing.volumePercentile, volSub, false)}
      </div>`;
  }

  function varRenderCompScoreHint(standing) {
    const host = document.getElementById('varCompScoreHint');
    if (!host) return;
    if (!standing) {
      host.innerHTML = '';
      return;
    }
    let climb = '';
    if (standing.climbTarget != null && standing.climbPnl != null && isFinite(standing.climbPnl)
      && standing.place != null && standing.climbTarget < standing.place) {
      climb = `<div style="margin-top:6px">${varT('var.compScoreClimb')
        .replace('{target}', standing.climbTarget.toLocaleString(varLoc()))
        .replace('{pnl}', varFmtSignedUsd(standing.climbPnl))}</div>`;
    }
    host.innerHTML = `<div class="var-comp-score-hint">
      <div><code>Score = PnL × √volume</code> — ${varT('var.compScoreFormula')}</div>
      ${climb}
    </div>`;
  }

  function varRenderCompField(stats) {
    const host = document.getElementById('varCompFieldBlock');
    if (!host) return;
    if (!stats) {
      host.innerHTML = '';
      return;
    }
    const medianSub = stats.p25Volume != null
      ? varT('var.compFieldMedianP25')
        .replace('{med}', varFmtCompactUsd(stats.medianVolume))
        .replace('{p25}', varFmtCompactUsd(stats.p25Volume))
      : varT('var.compFieldMedian').replace('{n}', varFmtCompactUsd(stats.medianVolume));
    const cells = [
      {
        lbl: varT('var.compFieldWallets'),
        val: stats.wallets.toLocaleString(varLoc()),
        sub: varT('var.compFieldAbove'),
      },
      {
        lbl: varT('var.compFieldVol'),
        val: varFmtCompactUsd(stats.totalVolume),
        sub: medianSub,
      },
      {
        lbl: varT('var.compInProfit'),
        val: varFmtFracPct(stats.greenShare, 1),
        sub: varT('var.compInProfitSub')
          .replace('{n}', String(stats.green))
          .replace('{total}', String(stats.wallets)),
      },
      {
        lbl: varT('var.compFieldPnl'),
        val: varFmtSignedUsd(stats.totalPnl),
        sub: '',
      },
      {
        lbl: varT('var.compTop10Share'),
        val: varFmtFracPct(stats.top10VolumeShare, 1),
        sub: varT('var.compTop10ShareSub'),
      },
      {
        lbl: varT('var.compTop10Pnl'),
        val: varFmtSignedUsd(stats.top10Pnl),
        sub: '',
      },
    ];
    host.innerHTML = `
      <div class="var-comp-field-head">
        <h3>${varT('var.compFieldTitle')}</h3>
        <span>${varT('var.compFieldSub')}</span>
      </div>
      <div class="var-comp-field-grid">
        ${cells.map((c, i) => `<div class="kpi${i === 0 ? ' kpi-accent' : ''}"><div class="kpi-label">${c.lbl}</div><div class="kpi-val">${c.val}</div><div class="kpi-sub">${c.sub || ''}</div></div>`).join('')}
      </div>`;
  }

  function varRenderCompBands(stats) {
    const host = document.getElementById('varCompBandsBlock');
    if (!host) return;
    if (!stats?.tiers?.length) {
      host.innerHTML = '';
      return;
    }
    const maxShare = Math.max(...stats.tiers.map(t => t.share), 1e-9);
    const rows = stats.tiers.map(t => {
      const w = Math.max(2, Math.round((t.share / maxShare) * 100));
      return `<div class="var-comp-band-row">
        <div class="var-comp-band-label">${varEsc(t.label)}</div>
        <div class="var-comp-band-track"><span style="width:${w}%"></span></div>
        <div class="var-comp-band-n mono">${t.wallets.toLocaleString(varLoc())}</div>
        <div class="var-comp-band-vol mono">${varFmtCompactUsd(t.volume)}</div>
      </div>`;
    }).join('');
    host.innerHTML = `
      <div class="var-comp-bands-head">
        <h3>${varT('var.compBandsTitle')}</h3>
        <span>${varT('var.compBandsSub')}</span>
      </div>
      <div class="var-comp-bands">
        <div class="var-comp-band-row" style="border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:2px;opacity:.7">
          <div></div><div></div>
          <div class="var-comp-band-n" style="font-size:.65rem;text-transform:uppercase;letter-spacing:.05em">${varT('var.compBandWallets')}</div>
          <div class="var-comp-band-vol" style="font-size:.65rem;text-transform:uppercase;letter-spacing:.05em">${varT('var.compBandVol')}</div>
        </div>
        ${rows}
      </div>`;
  }

  function varRenderCompetition(points) {
    const body = document.getElementById('varCompetitionBody');
    const meta = document.getElementById('varCompetitionMeta');
    const selfBody = document.getElementById('varCompSelfBody');
    if (!body) return;
    const c = points?.competition;
    const selfRow = c && !Array.isArray(c) ? c.self : null;
    const entries = varCompNormalizeEntries(c);
    entries.sort((a, b) => {
      const pa = a.place;
      const pb = b.place;
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pa - pb;
    });

    const short = (w) => {
      const s = String(w || '');
      return s.length > 10 ? s.slice(0, 6) + '…' + s.slice(-4) : (s || '—');
    };
    const fmtSigned = (n) => {
      const v = parseFloat(n);
      if (!isFinite(v)) return '—';
      return varFmtCompactUsd(v);
    };

    const standing = varCompStanding(entries, selfRow);
    const field = varCompFieldStats(entries);
    varRenderCompDayMeta(points, field);
    varRenderCompWallet(standing, selfRow);
    varRenderCompStanding(standing);
    varRenderCompScoreHint(standing);
    varRenderCompField(field);
    varRenderCompBands(field);

    if (selfBody) {
      if (!selfRow) {
        selfBody.innerHTML = `<span style="color:var(--muted)">${varT('var.competitionEmpty')}</span>`;
      } else {
        const place = varCompPlaceOf(selfRow);
        const ahead = standing?.scorePercentile != null
          ? `<div class="row"><span>${varT('var.compScorePct')}</span><strong class="mono">${varT('var.compAheadOf').replace('{pct}', varFmtFracPct(standing.scorePercentile, 1))}</strong></div>`
          : '';
        selfBody.innerHTML = `
          <div class="row"><span>${varT('var.compName')}</span><strong>${varEsc(selfRow.name || short(selfRow.address))}</strong></div>
          <div class="row"><span>${varT('var.compPlace')}</span><strong class="mono">#${place != null ? place.toLocaleString(varLoc()) : '—'}</strong></div>
          <div class="row"><span>${varT('var.compScore')}</span><strong class="mono">${varFmtPoints(selfRow.score)}</strong></div>
          <div class="row"><span>${varT('var.compVolume')}</span><strong class="mono">${fmtSigned(selfRow.volume)}</strong></div>
          <div class="row"><span>${varT('var.compPnl')}</span><strong class="mono">${fmtSigned(selfRow.pnl)}</strong></div>
          ${ahead}`;
      }
    }

    if (!selfRow && !entries.length) {
      body.innerHTML = `<div style="padding:18px;color:var(--muted)">${varT('var.competitionEmpty')}</div>`;
      if (meta) meta.textContent = '';
      return;
    }

    const selfAddr = selfRow && selfRow.address ? String(selfRow.address).toLowerCase() : '';
    const selfName = selfRow && selfRow.name ? String(selfRow.name).toLowerCase() : '';
    const isSelf = (row) => {
      if (!row) return false;
      if (row.is_self) return true;
      if (selfAddr && row.address && String(row.address).toLowerCase() === selfAddr) return true;
      if (selfName && row.name && String(row.name).toLowerCase() === selfName) return true;
      return false;
    };

    const limit = 100;
    const rows = entries.slice(0, limit);
    if (selfRow && !rows.some(isSelf)) {
      rows.push({
        ...selfRow,
        volume: parseFloat(selfRow.volume),
        pnl: parseFloat(selfRow.pnl),
        score: parseFloat(selfRow.score),
        place: varCompPlaceOf(selfRow),
      });
    }

    const trs = rows.map(row => {
      const place = row.place != null ? row.place : varCompPlaceOf(row);
      const name = row.name || short(row.address);
      const me = isSelf(row);
      return `<tr class="${me ? 'is-self' : ''}">
        <td class="mono" style="color:var(--muted)">#${place != null ? place.toLocaleString(varLoc()) : '—'}</td>
        <td><strong>${varEsc(name)}</strong>${me ? ` <span style="font-size:.68rem;color:var(--var-accent,#4c9af8)">${varT('var.competitionSelf')}</span>` : ''}</td>
        <td class="text-right mono">${varFmtPoints(row.score)}</td>
        <td class="text-right mono">${fmtSigned(row.volume)}</td>
        <td class="text-right mono">${fmtSigned(row.pnl)}</td>
      </tr>`;
    }).join('');

    body.innerHTML = `<table class="hs-trades-table"><thead><tr>
      <th>${varT('var.compPlace')}</th>
      <th>${varT('var.compName')}</th>
      <th class="text-right">${varT('var.compScore')}</th>
      <th class="text-right">${varT('var.compVolume')}</th>
      <th class="text-right">${varT('var.compPnl')}</th>
    </tr></thead><tbody>${trs}</tbody></table>`;

    if (meta) {
      meta.textContent = varT('var.competitionMore')
        .replace('{n}', String(rows.length))
        .replace('{total}', String(Math.max(entries.length, rows.length)));
    }
  }

  const VAR_POINTS_MODELS = [
    {
      id: 'rwa-9',
      weights: { crypto: 1, equity: 9.2, commodity: 9.2, etf: 9.2, other: 9.2 },
      alpha: 0.81,
      basis: 'volume',
      provenance: 'Best fit over within-epoch pairs (leave-one-out ~0.07 log rms vs ~0.27 for volume alone).',
    },
    {
      id: 'rwa-5',
      weights: { crypto: 1, equity: 5, commodity: 5, etf: 5, other: 5 },
      alpha: 0.835,
      basis: 'volume',
      provenance: 'Other end of the fitted ridge — data cannot cleanly separate from RWA 9x.',
    },
    {
      id: 'rwa-2',
      weights: { crypto: 1, equity: 2, commodity: 2, etf: 2, other: 2 },
      alpha: 1,
      basis: 'volume',
      provenance: 'Best linear fit when curvature is forced to 1 — more intuitive, usually worse.',
    },
    {
      id: 'volume',
      weights: { crypto: 1, equity: 1, commodity: 1, etf: 1, other: 1 },
      alpha: 1,
      basis: 'volume',
      provenance: 'Baseline: every dollar counts the same.',
    },
    {
      id: 'oi',
      weights: { crypto: 1, equity: 1, commodity: 1, etf: 1, other: 1 },
      alpha: 1,
      basis: 'oi',
      provenance: 'Size held over time (avg OI × 7 days). Listed so you can see it fail.',
    },
  ];

  function varLabModelById(id) {
    return VAR_POINTS_MODELS.find(m => m.id === id) || VAR_POINTS_MODELS[0];
  }

  const VAR_LAB_CRYPTO = new Set([
    'BTC', 'ETH', 'SOL', 'HYPE', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'UNI',
    'AAVE', 'ARB', 'OP', 'SUI', 'APT', 'NEAR', 'ATOM', 'LTC', 'BCH', 'ETC', 'FIL', 'INJ',
    'TIA', 'SEI', 'PEPE', 'WIF', 'BONK', 'JUP', 'PYTH', 'WLD', 'ONDO', 'ENA', 'PENDLE',
    'MKR', 'CRV', 'LDO', 'STX', 'IMX', 'RENDER', 'FET', 'TAO', 'EIGEN', 'TRX', 'TON',
  ]);
  const VAR_LAB_COMMODITY = new Set([
    'XAU', 'XAG', 'GOLD', 'SILVER', 'CL', 'WTI', 'BRENT', 'OIL', 'COPPER', 'XCU', 'HG',
    'NATGAS', 'NG', 'WHEAT', 'CORN', 'SOY',
  ]);
  const VAR_LAB_ETF = new Set([
    'EWY', 'SPCX', 'SPY', 'QQQ', 'IWM', 'DIA', 'EEM', 'EFA', 'TLT', 'GLD', 'SLV', 'USO',
    'HYG', 'LQD', 'XLF', 'XLE', 'XLK', 'ARKK',
  ]);

  function varLabAssetClass(t) {
    const k = String(t.instrument?.kind || t.kind || '').toLowerCase();
    if (k === 'equity' || k === 'stock' || k === 'stocks') return 'equity';
    if (k === 'commodity' || k === 'commodities') return 'commodity';
    if (k === 'etf' || k === 'index' || k === 'indices') return 'etf';
    if (k === 'other') return 'other';
    if (k === 'crypto') return 'crypto';
    const it = String(t.instrument?.instrument_type || t.instrument_type || '').toLowerCase();
    if (it.includes('rwa')) return 'other';
    if (it.includes('equity') || it.includes('stock')) return 'equity';
    if (it.includes('commodity')) return 'commodity';
    if (it.includes('etf') || it.includes('index')) return 'etf';
    // Omni CSV often omits kind — classify by underlying (TimberJ-compatible).
    const u = String(t.underlying || t.instrument?.underlying || '').toUpperCase().replace(/^XYZ:/, '');
    if (!u) return 'crypto';
    if (VAR_LAB_CRYPTO.has(u)) return 'crypto';
    if (VAR_LAB_COMMODITY.has(u)) return 'commodity';
    if (VAR_LAB_ETF.has(u)) return 'etf';
    // Typical equity ticker: 1–5 letters (NVDA, MU, AAPL, DRAM…).
    if (/^[A-Z]{1,5}$/.test(u)) return 'equity';
    return 'crypto';
  }

  function varLabExposure(model, input) {
    if (model.basis === 'oi') {
      return Math.pow(Math.max(0, input.oiDays || 0), model.alpha);
    }
    let weighted = 0;
    const by = input.byClass || {};
    for (const [cls, vol] of Object.entries(by)) {
      weighted += (model.weights[cls] != null ? model.weights[cls] : 1) * vol;
    }
    return Math.pow(Math.max(0, weighted), model.alpha);
  }

  function varLabWindowMetrics(trades, startMs, endMs) {
    const byClass = { crypto: 0, equity: 0, commodity: 0, etf: 0, other: 0 };
    let volume = 0;
    const winTrades = [];
    for (const t of trades) {
      if (t.ts < startMs || t.ts >= endMs) continue;
      const notional = Math.abs(t.px * t.qty);
      if (!(notional > 0)) continue;
      volume += notional;
      byClass[varLabAssetClass(t)] += notional;
      winTrades.push(t);
    }
    // Avg OI over the window (hourly absolute notional)
    const hourMs = 3600e3;
    const chartStart = Math.floor(startMs / hourMs) * hourMs;
    const chartEnd = Math.min(endMs, Date.now() + hourMs);
    const posQ = {};
    const lastPx = {};
    let ti = 0;
    while (ti < trades.length && trades[ti].ts < chartStart) {
      const t = trades[ti++];
      lastPx[t.underlying] = t.px;
      posQ[t.underlying] = (posQ[t.underlying] || 0) + t.sign * t.qty;
      if (Math.abs(posQ[t.underlying]) < 1e-10) delete posQ[t.underlying];
    }
    let sumOi = 0;
    let hours = 0;
    for (let h = chartStart; h < chartEnd; h += hourMs) {
      const hend = h + hourMs;
      while (ti < trades.length && trades[ti].ts < hend) {
        const t = trades[ti++];
        lastPx[t.underlying] = t.px;
        posQ[t.underlying] = (posQ[t.underlying] || 0) + t.sign * t.qty;
        if (Math.abs(posQ[t.underlying]) < 1e-10) delete posQ[t.underlying];
      }
      let oi = 0;
      for (const u of Object.keys(posQ)) {
        const px = lastPx[u] || 0;
        oi += Math.abs(posQ[u] * px);
      }
      sumOi += oi;
      hours++;
    }
    const avgOi = hours > 0 ? sumOi / hours : 0;
    const rwaVol = byClass.equity + byClass.commodity + byClass.etf + byClass.other;
    return {
      volume,
      byClass,
      avgOi,
      oiDays: 7 * avgOi,
      rwaShare: volume > 0 ? rwaVol / volume : 0,
    };
  }

  function varLabPrepareTrades(bundle) {
    return [...(bundle?.trades || [])]
      .filter(t => !t.status || t.status === 'confirmed')
      .map(t => ({
        ...t,
        underlying: String(t.underlying || t.instrument?.underlying || '').toUpperCase(),
        ts: Date.parse(t.created_at || 0),
        px: parseFloat(t.price || t.mark_price || 0),
        qty: parseFloat(t.qty || 0),
        sign: String(t.side || '').toLowerCase() === 'buy' ? 1 : -1,
      }))
      .filter(t => isFinite(t.ts) && t.underlying && isFinite(t.px) && isFinite(t.qty) && t.px > 0)
      .sort((a, b) => a.ts - b.ts);
  }

  function varLabPoolHistory(model, points, trades) {
    const hist = [...(points?.points_history || [])]
      .map(h => ({
        start: Date.parse(h.start_window || 0),
        end: Date.parse(h.end_window || 0),
        self: parseFloat(h.self_points || h.total_points || 0),
        label: h.start_window && h.end_window
          ? `${new Date(h.start_window).toLocaleDateString(varLoc())} → ${new Date(h.end_window).toLocaleDateString(varLoc())}`
          : '—',
      }))
      .filter(h => isFinite(h.start) && isFinite(h.end) && h.self > 0)
      .sort((a, b) => a.start - b.start);

    const rows = [];
    for (const h of hist) {
      const m = varLabWindowMetrics(trades, h.start, h.end);
      if (!(m.volume > 0)) continue;
      const exposure = varLabExposure(model, m);
      if (!(exposure > 0)) continue;
      rows.push({
        label: h.label,
        start: h.start,
        selfPoints: h.self,
        volume: m.volume,
        rwaShare: m.rwaShare,
        avgOi: m.avgOi,
        pool: h.self / exposure,
        rate: h.self / m.volume * 1e6,
      });
    }
    return rows;
  }

  function varLabMedianPool(rows) {
    if (!rows.length) return 0;
    const pools = rows.map(r => r.pool).sort((a, b) => a - b);
    return varCompMedian(pools);
  }

  /** Timberj: week pool / median of recent pools -> e.g. 1.11x (green >1.15, red <0.85). */
  function varFmtPoolIndex(ratio) {
    if (ratio == null || !isFinite(ratio)) return '—';
    return ratio.toFixed(2) + 'x';
  }

  function varLabPoolRatioClass(ratio) {
    if (!(ratio > 0) || !isFinite(ratio)) return '';
    if (ratio > 1.15) return 'is-pos';
    if (ratio < 0.85) return 'is-neg';
    return '';
  }

  function varLabSetModel(id) {
    _varLabModel = id;
    renderVarPointsLab();
  }

  let _varLabRenderTimer = 0;
  function varLabScheduleRender() {
    clearTimeout(_varLabRenderTimer);
    _varLabRenderTimer = setTimeout(() => {
      try { renderVarPointsLab(); } catch (_) {}
    }, 80);
  }
  try { window.varLabScheduleRender = varLabScheduleRender; } catch (_) {}

  function renderVarPointsLab() {
    const points = varPointsLoad();
    const bundle = varCsvLoadForView();
    const trades = varLabPrepareTrades(bundle);
    const model = varLabModelById(_varLabModel);

    const modelsHost = document.getElementById('varLabModels');
    if (modelsHost) {
      modelsHost.innerHTML = VAR_POINTS_MODELS.map(m =>
        `<button type="button" class="var-lab-model${m.id === model.id ? ' is-on' : ''}" data-lab-model="${m.id}" onclick="varLabSetModel('${m.id}')">${varT('var.labModel.' + m.id)}</button>`
      ).join('');
    }
    const claim = document.getElementById('varLabClaim');
    if (claim) claim.textContent = varT('var.labClaim.' + model.id);
    const prov = document.getElementById('varLabProvenance');
    if (prov) prov.textContent = model.provenance;

    const history = varLabPoolHistory(model, points, trades);
    const anchor = history.slice(-4);
    const medianPool = varLabMedianPool(anchor.length ? anchor : history);

    // Defaults from last earning week / all-time mix
    const last = history.length ? history[history.length - 1] : null;
    const volEl = document.getElementById('varLabVol');
    const rwaEl = document.getElementById('varLabRwa');
    if (volEl && !volEl.dataset.seeded && last) {
      volEl.value = String(Math.max(50, Math.min(20000, Math.round(last.volume / 1000))));
      volEl.dataset.seeded = '1';
    }
    if (rwaEl && !rwaEl.dataset.seeded && last) {
      rwaEl.value = String(Math.round((last.rwaShare || 0) * 100));
      rwaEl.dataset.seeded = '1';
    }

    const volK = volEl ? parseFloat(volEl.value) : 700;
    const rwaPct = rwaEl ? parseFloat(rwaEl.value) : 40;
    const volume = (isFinite(volK) ? volK : 700) * 1000;
    const rwaShare = (isFinite(rwaPct) ? rwaPct : 40) / 100;
    const avgOi = last?.avgOi > 0 ? last.avgOi : 250000;

    const volLabel = document.getElementById('varLabVolLabel');
    if (volLabel) volLabel.textContent = varFmtCompactUsd(volume);
    const rwaLabel = document.getElementById('varLabRwaLabel');
    if (rwaLabel) rwaLabel.textContent = varFmtPct(rwaShare * 100, 0);

    const rwaVol = volume * rwaShare;
    const cryptoVol = volume - rwaVol;
    const input = {
      volume,
      byClass: { crypto: cryptoVol, equity: rwaVol, commodity: 0, etf: 0, other: 0 },
      oiDays: 7 * avgOi,
    };
    const exposure = varLabExposure(model, input);
    let estPts = medianPool > 0 ? medianPool * exposure : 0;
    let usedHeuristic = false;
    if (!(estPts > 0) && volume > 0) {
      // No overlapping epoch calibration yet — fall back to community pts/$1M × volume mix.
      const rate = VAR_EPOCH_COMMUNITY_RATE * (1 + 3.5 * rwaShare);
      estPts = (volume * rate) / 1e6;
      usedHeuristic = true;
    }
    const effVol = model.basis === 'oi' ? exposure : Math.pow(exposure, 1 / Math.max(model.alpha, 1e-9));

    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('varLabEstPts', estPts > 0 ? varFmtPoints(estPts) : '—');
    set('varLabEstPtsSub', medianPool > 0
      ? varT('var.labEstPtsSub')
      : (usedHeuristic ? varT('var.labEstHeuristic') || 'Community rate (no calibrated pool yet)' : varT('var.labPoolEmpty')));
    set('varLabEffVol', model.basis === 'oi' ? varFmtCompactUsd(avgOi) + ' OI' : varFmtCompactUsd(effVol));
    // Card shows the pricing baseline (median = 1.00×). Week rows are vs this median.
    set('varLabPool', medianPool > 0 ? varFmtPoolIndex(1) : (usedHeuristic ? '~1.00x' : '—'));
    set('varLabPoolSub', medianPool > 0
      ? varT('var.labPoolSub').replace('{n}', String((anchor.length || history.length) || 0))
      : (usedHeuristic ? 'heuristic' : ''));
    set('varLabRate', volume > 0 && estPts > 0 ? varFmtPoints(estPts / volume * 1e6) : '—');

    const table = document.getElementById('varLabPoolTable');
    if (table) {
      if (!history.length) {
        table.innerHTML = `<div style="color:var(--muted);font-size:.82rem">${varT('var.labPoolEmpty')}</div>`;
      } else {
        const body = history.slice().reverse().slice(0, 16).map(r => {
          const ratio = medianPool > 0 ? r.pool / medianPool : 1;
          const cls = varLabPoolRatioClass(ratio);
          return `<tr>
          <td class="mono" style="color:var(--muted)">${varEsc(r.label)}</td>
          <td class="text-right mono">${varFmtPoints(r.selfPoints)}</td>
          <td class="text-right mono">${varFmtCompactUsd(r.volume)}</td>
          <td class="text-right mono">${varFmtPct(r.rwaShare * 100, 0)}</td>
          <td class="text-right mono${cls ? ' ' + cls : ''}" style="font-weight:600">${varFmtPoolIndex(ratio)}</td>
        </tr>`;
        }).join('');
        table.innerHTML = `<table class="hs-trades-table"><thead><tr>
          <th>${varT('var.labColWeek')}</th>
          <th class="text-right">${varT('var.labColPts')}</th>
          <th class="text-right">${varT('var.labColVol')}</th>
          <th class="text-right">${varT('var.labColRwa')}</th>
          <th class="text-right">${varT('var.labColPool')}</th>
        </tr></thead><tbody>${body}</tbody></table>
        <p class="var-lab-pool-hint">${varEsc(varT('var.labPoolHint'))}</p>`;
      }
    }
  }

  function varPointsHasData(raw) {
    return !!(raw && (
      raw.points_summary
      || (Array.isArray(raw.points_history) && raw.points_history.length)
      || raw.competition
    ));
  }

  function varMergePointsPreferRich(prev, next) {
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

  function varRequestExtPoints() {
    try {
      window.postMessage({ source: 'hs-page', type: 'HS_OMNI_EXT_GET_POINTS' }, '*');
    } catch (_) {}
  }

  function varApplyExtPoints(points) {
    if (!varPointsHasData(points)) return false;
    const cur = varPointsLoad();
    const merged = varMergePointsPreferRich(cur, points);
    if (!merged) return false;
    // Skip no-op writes when nothing richer arrived.
    const curN = (cur?.points_history || []).length;
    const nextN = (merged.points_history || []).length;
    const curTot = parseFloat(cur?.points_summary?.total_points || 0) || 0;
    const nextTot = parseFloat(merged?.points_summary?.total_points || 0) || 0;
    if (cur && nextN <= curN && nextTot <= curTot && merged.competition === cur.competition) {
      return false;
    }
    varPointsSave(merged);
    return true;
  }

  function renderVarPoints() {
    const view = (_varPointsView === 'lab' || _varPointsView === 'airdrop' || _varPointsView === 'competition' || _varPointsView === 'points')
      ? _varPointsView
      : 'points';
    _varPointsView = view;
    document.querySelectorAll('#page-variational .var-points-inner-tab').forEach(t => {
      t.classList.toggle('is-on', t.dataset.ptsview === view);
    });
    document.querySelectorAll('#page-variational .var-points-view').forEach(p => {
      const on = p.dataset.ptsviewPanel === view;
      p.classList.toggle('is-on', on);
      p.style.display = on ? 'block' : 'none';
    });
    // Ask the extension for points if the page slot is empty / thin.
    try {
      const cur = varPointsLoad();
      if (!varPointsHasData(cur) || !(cur.points_history && cur.points_history.length)) {
        varRequestExtPoints();
      }
    } catch (_) {}
    const points = varPointsLoad();
    varRenderJsonMeta(points);
    // Heavy CSV scans (epoch estimates / Lab OI) only on the tabs that need them —
    // Competition used to freeze the tab by also rebuilding every epoch + Lab pool.
    if (view === 'points') {
      varRenderPointsKpis(points);
      const empty = document.getElementById('varPointsEmpty');
      if (empty) {
        const has = !!(points?.points_summary || (points?.points_history && points.points_history.length) || points?.competition);
        empty.style.display = has ? 'none' : '';
      }
      // Defer epoch rebuild so Points chrome paints before CSV scans.
      setTimeout(() => { try { varRenderEpochTable(points); } catch (_) {} }, 0);
      return;
    }
    if (view === 'competition') {
      varRenderPointsKpis(points);
      setTimeout(() => { try { varRenderCompetition(points); } catch (_) {} }, 0);
      return;
    }
    if (view === 'lab') {
      setTimeout(() => { try { renderVarPointsLab(); } catch (_) {} }, 0);
      return;
    }
    if (view === 'airdrop') {
      renderVarAirdrop();
    }
  }

  function renderVarActivity() {
    varBindJsonDrop();
    varUpdateOmniExtUi();
    // Omni Live dashboard: paint extension/onboard chrome first; rebuild slots + KPIs next tick.
    if (varIsLiveDashTab()) {
      setTimeout(() => {
        if (!varIsLiveDashTab()) return;
        try { varRenderOmniSlotsUi(); } catch (_) {}
        try { varRenderLiveDashboard(); } catch (_) {}
      }, 0);
      return;
    }
    try { varRenderOmniSlotsUi(); } catch (_) {}
    const bundle = varCsvLoadForView();
    const points = varPointsLoad();
    try { varRenderLiveDashboard(); } catch (_) {}
    varRenderCsvImportStatus(bundle);
    varRenderJsonMeta(points);
    try { renderVarUserHeroKpis(); } catch (_) {}

    const agg = bundle ? aggregateVarCsv(bundle) : null;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const hasRows = !!(bundle && (bundle.trades?.length || bundle.funding?.length || bundle.realizedPnl?.length || bundle.transfers?.length));
    const hasPoints = !!(points?.points_summary || points?.points_history?.length);

    if (!agg || !hasRows) {
      set('varActVol', '—'); set('varActTrades', '—'); set('varActFunding', '—');
      set('varActPnl', '—'); set('varActFees', '—');
      const tbl = document.getElementById('varActivityTable');
      if (tbl) {
        tbl.innerHTML = hasPoints
          ? `<div class="text-center text-sm py-8" style="color:var(--muted)">${varT('var.noData')}</div>`
          : `<div class="text-center text-sm py-10" style="color:var(--muted)">${varT('var.csvEmpty')}</div>`;
      }
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

  function varReadJsonFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!varIsOmniExport(data)) {
            reject(new Error('unknown'));
            return;
          }
          varApplyOmniExport(data, file.name);
          resolve(data);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function varImportJsonFiles(input) {
    const files = [...(input?.files || [])];
    if (!files.length) return;
    let ok = 0;
    let bad = 0;
    let skipped = 0;
    const multi = files.length > 1;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (multi) {
        const slotId = varAccountsPickSlotForNewImport();
        if (!slotId) {
          skipped = files.length - i;
          break;
        }
      }
      try {
        await varReadJsonFile(file);
        ok++;
      } catch (_) {
        bad++;
      }
    }
    if (multi && ok > 0) {
      try { varSetCsvScope('all'); } catch (_) {}
    }
    if (typeof toast === 'function') {
      if (ok && multi) {
        toast(varT('var.jsonImportedMulti').replace('{n}', String(ok)));
      } else if (ok) {
        toast(varT('var.jsonImported'));
      }
      if (skipped) {
        toast(varT('var.slotMax').replace('{n}', String(VAR_OMNI_MAX_SLOTS)), true);
      } else if (bad && !ok) {
        toast(varT('var.jsonUnknown'), true);
      }
    }
    renderVarActivity();
    const ptsEl = document.getElementById('varAirPoints');
    const pts = varPointsLoad()?.points_summary?.total_points;
    if (ptsEl && pts != null && !ptsEl.dataset.manual) {
      ptsEl.value = String(parseFloat(pts));
    }
    if (input) input.value = '';
  }

  async function varImportMixedFiles(input) {
    const files = [...(input?.files || [])];
    if (!files.length) return;
    const jsons = files.filter(f => /\.json$/i.test(f.name) || f.type.includes('json'));
    const csvs = files.filter(f => !jsons.includes(f));
    if (jsons.length) {
      const fake = { files: jsons };
      await varImportJsonFiles(fake);
    }
    if (csvs.length) {
      const fake = { files: csvs, value: '' };
      varImportCsvFiles(fake);
    }
    if (input) input.value = '';
  }

  let _varCollectorRunSrc = '';

  function varLoadCollectorRunSrc() {
    if (_varCollectorRunSrc) return Promise.resolve(_varCollectorRunSrc);
    return fetch(new URL('js/variational-omni-collector-run.js', location.href).href, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('run src'); return r.text(); })
      .then((t) => { _varCollectorRunSrc = t; return t; })
      .catch(() => '');
  }

  function varCollectorHref() {
    let logo = 'https://hypersheets.xyz/img/hypersheets-logo.png';
    try { logo = new URL('img/hypersheets-logo.png', location.href).href; } catch (_) {}
    let appUrl = 'https://hypersheets.xyz/omni/#var-omni-import';
    try {
      const u = new URL(location.href);
      u.hash = 'var-omni-import';
      appUrl = u.toString();
    } catch (_) {}
    const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    // Local/http preview cannot load scripts into HTTPS Omni (mixed content).
    if ((location.protocol === 'http:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') && _varCollectorRunSrc) {
      const b64 = btoa(unescape(encodeURIComponent(_varCollectorRunSrc)));
      return 'javascript:void(function(){if(!location.hostname.endsWith("variational.io")){alert("Wrong tab — open Omni (omni.variational.io), stay on that tab, then click this bookmark.");return;}window.__HS_OMNI_COLLECTOR__={appUrl:"' + esc(appUrl) + '",logo:"' + esc(logo) + '"};var s=document.createElement("script");s.textContent=decodeURIComponent(escape(atob("' + b64 + '")));document.documentElement.appendChild(s);})();';
    }

    let src = typeof window.HS_VAR_COLLECTOR_SRC === 'string' ? window.HS_VAR_COLLECTOR_SRC.trim() : '';
    if (!src) return '#';
    let scriptUrl = 'https://hypersheets.xyz/js/variational-omni-collector-run.js';
    try {
      const candidate = new URL('js/variational-omni-collector-run.js', location.href);
      if (candidate.protocol === 'https:') scriptUrl = candidate.href;
    } catch (_) {}
    src = src.split('__HS_BRAND_LOGO__').join(esc(logo));
    src = src.split('__HS_APP_URL__').join(esc(appUrl));
    src = src.split('__HS_SCRIPT_URL__').join(esc(scriptUrl));
    return src.startsWith('javascript:') ? src : ('javascript:' + src);
  }

  function varPageIsBusyLoading() {
    try {
      if (window._loadDataRunning) return true;
      if (window._glpLoading) return true;
      if (document.body && document.body.classList.contains('hs-launch-overlay-on')) return true;
      if (document.body && document.body.classList.contains('hs-welcome-loading')) return true;
    } catch (_) {}
    return false;
  }

  function varFlushPendingOmniImportUi() {
    const fn = window.__hsVarPendingOmniImportUi;
    if (typeof fn !== 'function') return;
    window.__hsVarPendingOmniImportUi = null;
    setTimeout(() => {
      try { fn(); } catch (_) {}
    }, 0);
  }
  window.__hsFlushPendingOmniImportUi = varFlushPendingOmniImportUi;

  function varShowImportedOmniUi() {
    // Exit welcome shell so Variational pages are visible without requiring a HL wallet load.
    try {
      if (typeof markDashboardLaunched === 'function') markDashboardLaunched();
      if (typeof syncWelcomeShell === 'function') syncWelcomeShell();
    } catch (_) {}
    try {
      if (location.hash !== '#var-omni-live') {
        history.replaceState(null, '', '#var-omni-live');
      }
    } catch (_) {}
    try {
      if (typeof switchPage === 'function') {
        const tab = document.querySelector('.nav-tab[data-tab="variational"]');
        switchPage('variational', tab || undefined);
      }
    } catch (_) {}
    try { varSetSub('dashboard', null); } catch (_) {}
    try { renderVarActivity(); } catch (_) {}
    try {
      if (varIsLiveDashTab()) varRenderLiveDashboard();
    } catch (_) {}
  }

  function varImportOmniPayload(payload, fileName) {
    if (!varIsOmniExport(payload)) return false;
    varApplyOmniExport(payload, fileName || 'variational-export-live.json');
    // Always pin the Live hash immediately (even if heavy UI is deferred).
    try {
      if (typeof markDashboardLaunched === 'function') markDashboardLaunched();
      if (typeof syncWelcomeShell === 'function') syncWelcomeShell();
      if (location.hash !== '#var-omni-live') {
        history.replaceState(null, '', '#var-omni-live');
      }
    } catch (_) {}
    // Never run heavy Variational renders while Hypersheets is still on the HL launch overlay.
    if (varPageIsBusyLoading()) {
      window.__hsVarPendingOmniImportUi = varShowImportedOmniUi;
    } else {
      varShowImportedOmniUi();
    }
    return true;
  }

  let _varLastImportToastAt = 0;
  let _varLastImportFp = '';

  function varImportFingerprint(payload) {
    try {
      const c = payload && payload.competition;
      const s = payload && payload.points_summary;
      const n = Array.isArray(payload && payload.trades) ? payload.trades.length : 0;
      return [
        payload && payload.pulled_at,
        c && c.pulled_at,
        c && c.self && c.self.place,
        s && s.total_points,
        n,
      ].join('|');
    } catch (_) {
      return String(Date.now());
    }
  }

  function varToastAutoImported() {
    const now = Date.now();
    if (now - _varLastImportToastAt < 2500) return;
    _varLastImportToastAt = now;
    if (typeof toast === 'function') toast(varT('var.collectorAutoImported'));
  }

  function varHandleOmniExportMessage(ev) {
    let host = '';
    try { host = new URL(ev.origin).hostname; } catch (_) { return; }
    if (!/(^|\.)variational\.io$/i.test(host)) return;
    const msg = ev.data;
    if (!msg || msg.type !== 'hs-var-omni-export') return;
    const fp = varImportFingerprint(msg.payload);
    if (fp && fp === _varLastImportFp && Date.now() - _varLastImportToastAt < 15000) {
      try { ev.source?.postMessage({ type: 'hs-var-omni-export-ack', ok: true }, ev.origin); } catch (_) {}
      return;
    }
    const ok = varImportOmniPayload(msg.payload, 'variational-export-live.json');
    try {
      ev.source?.postMessage({ type: 'hs-var-omni-export-ack', ok }, ev.origin);
    } catch (_) {}
    if (ok) {
      _varLastImportFp = fp;
      varToastAutoImported();
      try { window.focus(); } catch (_) {}
      try {
        if (location.hash === '#var-omni-import' || location.hash === '#var-points') {
          history.replaceState(null, '', location.pathname + location.search);
        }
      } catch (_) {}
      try {
        const pts = varPointsLoad();
        if (pts && (pts.points_summary || pts.competition)) {
          // Keep Omni Live after sync/import — do not bounce to #var-dashboard.
          const tab = document.querySelector('#page-variational .var-sub-tab[data-varsub="dashboard"]');
          varSetSub('dashboard', tab || null);
        }
      } catch (_) {}
    } else if (typeof toast === 'function') {
      toast(varT('var.collectorAutoImportFail'), true);
    }
  }

  function varInitOmniExportReceiver() {
    if (window.__hsVarOmniExportBound) return;
    window.__hsVarOmniExportBound = 1;
    window.addEventListener('message', varHandleOmniExportMessage);
  }

  let _varOmniExtInstalled = false;
  let _varOmniExtCgu = false;
  let _varOmniExtSyncing = false;
  let _varLiveVolPeriod = 'this_epoch';
  let _varOmniExtPongTimer = 0;
  let _varDashAnalyticsMemo = null;
  let _varDashAnalyticsMemoKey = '';
  let _varDashAnalyticsMemoTs = 0;

  function varLiveVolPeriodLoad() {
    try {
      const p = localStorage.getItem('hs-var-live-vol-period') || 'this_epoch';
      return ['today', 'this_epoch', 'all'].includes(p) ? p : 'this_epoch';
    } catch {
      return 'this_epoch';
    }
  }

  function varSetLiveVolPeriod(period) {
    if (!['today', 'this_epoch', 'all'].includes(period)) return;
    _varLiveVolPeriod = period;
    try { localStorage.setItem('hs-var-live-vol-period', period); } catch (_) {}
    varRenderLiveDashboard();
  }

  function varBuildDashAnalyticsCached(bundle, period, opts) {
    const light = !!(opts && opts.light);
    const tradesN = bundle?.trades?.length || 0;
    const key = (light ? 'L:' : 'F:') + String(period) + ':' + tradesN + ':' + (bundle?.trades?.[tradesN - 1]?.created_at || '') + ':' + (bundle?.realizedPnl?.length || 0);
    if (_varDashAnalyticsMemo && _varDashAnalyticsMemoKey === key && Date.now() - _varDashAnalyticsMemoTs < 2500) {
      return _varDashAnalyticsMemo;
    }
    const dash = varBuildDashAnalytics(bundle, period, opts);
    _varDashAnalyticsMemo = dash;
    _varDashAnalyticsMemoKey = key;
    _varDashAnalyticsMemoTs = Date.now();
    return dash;
  }

  function varComputePosUpnl(p) {
    if (!p) return null;
    if (p.upnl != null && isFinite(p.upnl)) return p.upnl;
    const entry = Number(p.entry) || 0;
    let mark = Number(p.mark) || 0;
    if (!(mark > 0) && p.market) {
      try { mark = Number(varOmniLiveMark(p.market)) || 0; } catch (_) { mark = 0; }
    }
    const qty = Number(p.qty) || 0;
    if (!(entry > 0 && mark > 0 && qty > 0)) return null;
    const signed = String(p.side || '').toLowerCase() === 'short' ? -1 : 1;
    return signed * (mark - entry) * qty;
  }

  function varFmtPosQty(qty) {
    const n = Number(qty);
    if (!isFinite(n) || n === 0) return '—';
    const abs = Math.abs(n);
    if (abs >= 1000) return abs.toLocaleString(varLoc(), { maximumFractionDigits: 2 });
    if (abs >= 1) return abs.toLocaleString(varLoc(), { maximumFractionDigits: 4 });
    return abs.toLocaleString(varLoc(), { maximumFractionDigits: 6 });
  }

  function varFmtPosPx(px) {
    const n = Number(px);
    if (!isFinite(n) || n <= 0) return '—';
    if (n >= 1000) return varFmtCompactUsd(n).replace(/^\$/, '');
    if (n >= 1) return n.toLocaleString(varLoc(), { maximumFractionDigits: 4 });
    return n.toLocaleString(varLoc(), { maximumFractionDigits: 6 });
  }

  function varPairsByMarket(dash) {
    const map = Object.create(null);
    for (const p of (dash?.pairs || [])) {
      const k = String(p.market || '').toUpperCase();
      if (k) map[k] = p;
    }
    return map;
  }

  function varRenderLiveDashboard() {
    const volEl = document.getElementById('varLiveVolValue');
    const posEl = document.getElementById('varLivePositions');
    const mktsEl = document.getElementById('varLiveMarkets');
    if (!volEl && !posEl && !mktsEl) return;

    const period = _varLiveVolPeriod || varLiveVolPeriodLoad();
    _varLiveVolPeriod = period;
    document.querySelectorAll('#varLiveVolPeriods .var-dash-period').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.livePeriod === period);
    });

    const bundle = varCsvLoadForView();
    const hasTrades = !!(bundle && bundle.trades && bundle.trades.length);
    const dash = hasTrades ? varBuildDashAnalyticsCached(bundle, period, { light: true }) : null;
    const pairMap = varPairsByMarket(dash);

    const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const setSigned = (id, n) => {
      const e = document.getElementById(id);
      if (!e) return;
      const v = Number(n);
      e.textContent = isFinite(v) ? varFmtSignedUsd(v) : '—';
      e.classList.toggle('is-pos', isFinite(v) && v > 0);
      e.classList.toggle('is-neg', isFinite(v) && v < 0);
    };

    if (volEl) {
      if (!dash) {
        volEl.textContent = '—';
        setTxt('varLiveVolMeta', varT('var.kpiVolSubEmpty'));
        setTxt('varLivePnlValue', '—');
        setTxt('varLivePnlMeta', '');
        setTxt('varLiveFundingValue', '—');
        setTxt('varLiveTradesValue', '—');
        setTxt('varLiveTradesMeta', '');
      } else {
        volEl.textContent = varFmtCompactUsd(dash.volume);
        setTxt('varLiveVolMeta', varT('var.liveVolMeta').replace('{n}', String(dash.tradeCount || 0)));
        setSigned('varLivePnlValue', dash.realizedPnl);
        setTxt('varLivePnlMeta', dash.winRate != null
          ? varT('var.livePnlMeta').replace('{pct}', dash.winRate.toFixed(1))
          : '');
        setSigned('varLiveFundingValue', dash.funding);
        setTxt('varLiveTradesValue', String(dash.tradeCount || 0));
        setTxt('varLiveTradesMeta', dash.avgTrade > 0
          ? varT('var.dashLargest').replace('{usd}', varFmtCompactUsd(dash.largest || dash.avgTrade))
          : '');
      }
    }

    const books = varGetTradeBooks();
    const rows = (books.omni || []).slice().sort((a, b) => (b.notional || 0) - (a.notional || 0));
    // Kick public Omni marks if any leg is missing mark (Live used to skip this → Mark/uPnL = —).
    if (rows.some((o) => !(o.mark > 0)) && !window.__hsVarLiveMarkKick) {
      window.__hsVarLiveMarkKick = 1;
      varRefreshOmniMarksOnly().then((ok) => {
        window.__hsVarLiveMarkKick = 0;
        if (ok && varIsLiveDashTab()) {
          try { varRenderLiveDashboard(); } catch (_) {}
        }
      }).catch(() => { window.__hsVarLiveMarkKick = 0; });
    }
    const { pairs } = varHedgeLivePairs(books);
    const hasWallet = typeof wallets !== 'undefined' && Array.isArray(wallets) && wallets.length > 0;
    const tradeN = (books.trade || []).length;

    let openNotional = 0;
    let openUpnl = 0;
    let upnlN = 0;
    let hedgeNet = 0;
    let hedgeN = 0;
    for (const p of rows) {
      openNotional += Number(p.notional) || 0;
      const u = varComputePosUpnl(p);
      if (u != null && isFinite(u)) { openUpnl += u; upnlN++; }
    }
    for (const x of pairs) {
      if (!x.hedge) continue;
      hedgeN++;
      const ou = varComputePosUpnl(x.omni);
      hedgeNet += (ou != null && isFinite(ou) ? ou : 0) + (Number(x.hedge.upnl) || 0);
    }
    setTxt('varLiveOpenSizeValue', rows.length ? varFmtCompactUsd(openNotional) : '—');
    setTxt('varLiveOpenSizeMeta', rows.length
      ? varT('var.livePosCount').replace('{n}', String(rows.length)).replace('{usd}', varFmtCompactUsd(openNotional))
      : '');
    if (hedgeN) setSigned('varLiveUpnlValue', hedgeNet);
    else if (upnlN) setSigned('varLiveUpnlValue', openUpnl);
    else setTxt('varLiveUpnlValue', '—');
    setTxt('varLiveUpnlMeta', hedgeN
      ? varT('var.livePosHedgeCount').replace('{n}', String(hedgeN)).replace('{pnl}', varFmtSignedUsd(hedgeNet))
      : varT('var.liveUpnlSub'));

    const posSub = document.getElementById('varLivePosSub');
    if (posSub) {
      if (hedgeN) {
        posSub.textContent = varT('var.livePosHedgeCount')
          .replace('{n}', String(hedgeN))
          .replace('{pnl}', varFmtSignedUsd(hedgeNet));
      } else if (rows.length) {
        posSub.textContent = varT('var.livePosCount')
          .replace('{n}', String(rows.length))
          .replace('{usd}', varFmtCompactUsd(openNotional));
      } else {
        posSub.textContent = varT('var.livePosSub');
      }
    }

    if (posEl) {
      if (!rows.length) {
        posEl.innerHTML = `<div class="var-pos-empty">${varEsc(varT('var.livePosEmpty'))}</div>`;
      } else {
        const venuePill = (kind) => {
          if (kind === 'XYZ') return `<span class="var-live-venue is-xyz">XYZ</span>`;
          if (kind === 'HL') return `<span class="var-live-venue is-hl">HL</span>`;
          return `<span class="var-live-venue is-omni">Omni</span>`;
        };
        const colHead = `<div class="var-live-hedge-grid var-live-hedge-cols" aria-hidden="true">
          <div class="c-venue">${varEsc(varT('var.liveColVenue'))}</div>
          <div class="c-side">${varEsc(varT('var.liveColSide'))}</div>
          <div class="c-qty">${varEsc(varT('var.liveColQty'))}</div>
          <div class="c-size">${varEsc(varT('var.liveColSize'))}</div>
          <div class="c-entry">${varEsc(varT('var.liveColEntry'))}</div>
          <div class="c-mark">${varEsc(varT('var.liveColMark'))}</div>
          <div class="c-upnl">${varEsc(varT('var.liveColUpnl'))}</div>
        </div>`;
        const legRow = (opts) => {
          const upnlCls = opts.upnl > 0 ? 'is-pos' : opts.upnl < 0 ? 'is-neg' : '';
          return `<div class="var-live-hedge-grid var-live-hedge-row ${opts.rowCls || ''}">
            <div class="c-venue">${venuePill(opts.venue)}</div>
            <div class="c-side">${varSidePill(opts.side)}</div>
            <div class="c-qty mono">${varFmtPosQty(opts.qty)}</div>
            <div class="c-size mono">${varFmtCompactUsd(opts.size)}</div>
            <div class="c-entry mono">${varFmtPosPx(opts.entry)}</div>
            <div class="c-mark mono">${varFmtPosPx(opts.mark)}</div>
            <div class="c-upnl mono ${upnlCls}">${opts.upnl == null ? '—' : varFmtSignedUsd(opts.upnl)}</div>
          </div>`;
        };

        const bits = [];
        if (!hasWallet) {
          bits.push(`<div class="var-live-hedge-hint">${varEsc(varT('var.liveHedgeMissingWallet'))}
            <div style="margin-top:8px"><button type="button" class="btn btn-ghost text-xs" style="padding:4px 10px" onclick="typeof varRefreshHlLeg==='function'&&varRefreshHlLeg()">${varEsc(varT('var.refreshHl'))}</button></div>
          </div>`);
        } else if (!tradeN && pairs.every(x => !x.hedge)) {
          bits.push(`<div class="var-live-hedge-hint">${varEsc(varT('var.liveHedgeNoMatch'))}
            <div style="margin-top:8px"><button type="button" class="btn btn-ghost text-xs" style="padding:4px 10px" onclick="typeof varRefreshHlLeg==='function'&&varRefreshHlLeg()">${varEsc(varT('var.refreshHl'))}</button></div>
          </div>`);
        }

        bits.push('<div class="var-live-hedge">');
        for (const x of pairs) {
          const o = x.omni;
          const h = x.hedge;
          const ou = varComputePosUpnl(o);
          const omniMark = (Number(o.mark) > 0)
            ? Number(o.mark)
            : (varOmniLiveMark(o.market) || 0);
          // Recompute uPnL with live mark when enrich left it null (fills have upnl:null).
          const ouLive = (ou != null && isFinite(ou))
            ? ou
            : varComputePosUpnl({ ...o, mark: omniMark, upnl: null });
          const hu = h ? h.upnl : null;
          const hasAny = (ouLive != null && isFinite(ouLive)) || (hu != null && isFinite(hu));
          const net = (ouLive != null && isFinite(ouLive) ? ouLive : 0)
            + (hu != null && isFinite(hu) ? hu : 0);
          const netCls = hasAny ? (net > 0 ? 'is-pos' : net < 0 ? 'is-neg' : '') : '';
          const mkt = String(o.market || '').toUpperCase();
          const pairStats = pairMap[mkt] || null;
          const metaBits = [];
          if (pairStats && pairStats.volume > 0) {
            metaBits.push(varT('var.liveHedgeVol')
              .replace('{vol}', varFmtCompactUsd(pairStats.volume))
              .replace('{pnl}', varFmtSignedUsd(pairStats.pnl || 0)));
          }
          const acct = o.accountLabel
            ? `<span class="acct">${varEsc(o.accountLabel)}</span>`
            : '';

          bits.push(`<article class="var-live-hedge-card">
            <header class="var-live-hedge-card-hd">
              <div>
                <div class="var-live-hedge-card-title">
                  ${varAssetLogoHtml(o.market)}
                  <span>${varEsc(o.market)}</span>
                  ${acct}
                </div>
                ${metaBits.length ? `<div class="var-live-hedge-card-meta">${varEsc(metaBits.join(' · '))}</div>` : ''}
              </div>
              <div class="var-live-hedge-card-net">
                <span class="lbl">${varEsc(varT('var.liveHedgeNet'))}</span>
                <span class="val mono ${netCls}">${hasAny ? varFmtSignedUsd(net) : '—'}</span>
              </div>
            </header>
            ${colHead}
            ${legRow({
              venue: 'Omni',
              side: o.side,
              qty: o.qty,
              size: (Number(o.qty) > 0 && omniMark > 0) ? Number(o.qty) * omniMark : o.notional,
              entry: o.entry,
              mark: omniMark,
              upnl: ouLive,
              rowCls: 'is-omni',
            })}
            ${h
              ? legRow({
                  venue: h.dex === 'XYZ' ? 'XYZ' : 'HL',
                  side: h.side,
                  qty: h.qty,
                  size: h.notionalUsd,
                  entry: h.entry,
                  mark: h.mark,
                  upnl: hu,
                  rowCls: 'is-trade',
                })
              : `<div class="var-live-hedge-row is-missing">${varEsc(varT('var.liveHedgeNoMatch'))}</div>`}
          </article>`);
        }
        bits.push('</div>');
        posEl.innerHTML = bits.join('');
      }
    }

    const mktsSub = document.getElementById('varLiveMarketsSub');
    const marketPairs = (dash?.pairs || []).filter((p) => (Number(p.volume) || 0) > 0 || (Number(p.trades) || 0) > 0);
    if (mktsSub) {
      mktsSub.textContent = marketPairs.length
        ? varT('var.liveMarketsCount').replace('{n}', String(marketPairs.length))
        : varT('var.liveMarketsSub');
    }
    if (mktsEl) {
      if (!marketPairs.length) {
        mktsEl.innerHTML = `<div class="var-pos-empty">${varEsc(varT(hasTrades ? 'var.liveMarketsEmpty' : 'var.kpiVolSubEmpty'))}</div>`;
      } else {
        const maxVol = Math.max(...marketPairs.map(p => p.volume), 1);
        const totalVol = Math.max(dash?.volume || 0, 1);
        const openSet = new Set(rows.map(p => String(p.market || '').toUpperCase()));
        const body = marketPairs.map(p => {
          const pct = (p.volume / totalVol) * 100;
          const bar = Math.max(2, Math.round((p.volume / maxVol) * 100));
          const pnlCls = p.pnl > 0 ? 'is-pos' : p.pnl < 0 ? 'is-neg' : '';
          const open = openSet.has(String(p.market || '').toUpperCase());
          return `<tr>
            <td class="font-medium">
              <span class="var-epoch-mkt-asset" style="gap:6px">
                ${varAssetLogoHtml(p.market)}
                <span>${varEsc(p.market)}</span>
              </span>
              ${open ? ' <span style="color:var(--var-accent,#4c9af8);font-size:.65rem">OPEN</span>' : ''}
              <span style="color:var(--muted);font-size:.72rem;margin-left:6px">${p.trades}</span>
            </td>
            <td><div class="var-pair-share"><div class="var-pair-bar"><span style="width:${bar}%"></span></div></div></td>
            <td class="text-right mono">${pct.toFixed(1)}%</td>
            <td class="text-right mono">${varFmtCompactUsd(p.volume)}</td>
            <td class="text-right mono ${pnlCls}">${varFmtSignedUsd(p.pnl)}</td>
          </tr>`;
        }).join('');
        mktsEl.innerHTML = `<table class="hs-trades-table"><thead><tr>
          <th>${varT('var.dashColMarket')}</th>
          <th>${varT('var.dashColShare')}</th>
          <th class="text-right">${varT('var.dashColPct')}</th>
          <th class="text-right">${varT('var.dashColVol')}</th>
          <th class="text-right">${varT('var.dashColPnl')}</th>
        </tr></thead><tbody>${body}</tbody></table>`;
      }
    }

    try { varRenderFarmOverview(); } catch (_) {}
  }

  function varInitOmniExtBridge() {
    if (window.__hsVarOmniExtBridge) return;
    window.__hsVarOmniExtBridge = 1;
    window.addEventListener('message', (ev) => {
      if (ev.source !== window) return;
      const data = ev.data;
      if (!data || data.source !== 'hs-omni-ext') return;
      if (data.type === 'HS_OMNI_EXT_PONG') {
        const nextInstalled = !!data.installed;
        const nextCgu = !!data.cguCompliant;
        const changed = nextInstalled !== _varOmniExtInstalled || nextCgu !== _varOmniExtCgu;
        _varOmniExtInstalled = nextInstalled;
        _varOmniExtCgu = nextCgu;
        // Debounce: extension announces multiple PONGs (announce + ping reply).
        clearTimeout(_varOmniExtPongTimer);
        _varOmniExtPongTimer = setTimeout(() => {
          varUpdateOmniExtUi();
          if (changed && varIsLiveDashTab() && _varOmniExtInstalled) {
            try { varRenderLiveDashboard(); } catch (_) {}
          }
        }, 60);
        return;
      }
      if (data.type === 'HS_OMNI_ACCOUNTS_APPLIED') {
        varAccountsInvalidateMemo();
        _varOmniBookMemo = null;
        _varOmniBookMemoTs = 0;
        _varDashAnalyticsMemo = null;
        _varEpochSumCache = null;
        try { varAccountsScheduleActivityRefresh(); } catch (_) {}
        try {
          if (varIsPointsTab(_varSub)) renderVarPoints();
        } catch (_) {}
        return;
      }
      if (data.type === 'HS_OMNI_POINTS_STATE') {
        try {
          if (data.ok && data.points && varApplyExtPoints(data.points)) {
            if (varIsPointsTab(_varSub)) renderVarPoints();
          }
        } catch (_) {}
        return;
      }
      if (data.type === 'HS_OMNI_PAGE_IMPORT' && data.payload) {
        const fp = varImportFingerprint(data.payload);
        if (fp && fp === _varLastImportFp && Date.now() - _varLastImportToastAt < 15000) return;
        const ok = varImportOmniPayload(data.payload, data.fileName || 'variational-export-ext.json');
        if (ok) {
          _varLastImportFp = fp;
          _varDashAnalyticsMemo = null;
          varToastAutoImported();
        } else if (typeof toast === 'function') {
          toast(varT('var.collectorAutoImportFail'), true);
        }
        return;
      }
      if (data.type === 'HS_OMNI_EXT_RESULT') {
        _varOmniExtSyncing = false;
        varUpdateOmniExtUi();
        // Session auto-sync removed (Variational ToS). Ignore payloads; surface CGU message.
        if (typeof toast === 'function') {
          toast((data.error && String(data.error)) || varT('var.extCguBlocked'), true);
        }
        varFocusOmniImport();
      }
    });
    try { window.postMessage({ type: 'HS_OMNI_EXT_PING' }, '*'); } catch (_) {}
    setTimeout(() => { try { window.postMessage({ type: 'HS_OMNI_EXT_PING' }, '*'); } catch (_) {} }, 800);
  }

  function varUpdateOmniExtUi() {
    const syncBtn = document.getElementById('varOmniSyncBtn');
    const posBtn = document.getElementById('varOmniPosBtn');
    const posBtnGuide = document.getElementById('varOmniPosBtnGuide');
    const install = document.getElementById('varOmniExtInstall');
    const status = document.getElementById('varOmniSyncStatus');
    const statusGuide = document.getElementById('varOmniSyncStatusGuide');
    const onboard = document.getElementById('varActivityOnboard');
    const ready = document.getElementById('varLiveReady');
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.classList.remove('is-syncing');
    }
    if (posBtn) posBtn.disabled = false;
    if (posBtnGuide) posBtnGuide.disabled = false;
    // Legacy install panel (removed from Activity guide) — keep hidden if present.
    if (install) install.style.display = 'none';

    const statusText = _varOmniExtInstalled
      ? varT(_varOmniExtCgu ? 'var.extReadyCgu' : 'var.extReady')
      : varT('var.extCguHint');
    if (status) status.textContent = statusText;
    if (statusGuide) statusGuide.textContent = statusText;

    // Guide CTA on Dashboard when extension is missing AND no CSV/JSON yet; otherwise show Live dashboard.
    const onLive = varIsLiveDashTab();
    const hasImport = varHasAnyOmniCsv();
    const dashCta = document.getElementById('varDashExtCta');
    if (dashCta) {
      dashCta.style.display = onLive && !_varOmniExtInstalled && !hasImport ? '' : 'none';
    }
    if (onboard) {
      onboard.style.display = _varSub === 'extension' ? '' : 'none';
    }
    if (ready) {
      const showReady = onLive && (_varOmniExtInstalled || hasImport);
      ready.hidden = !showReady;
      ready.style.display = showReady ? 'flex' : 'none';
    }
  }

  function varFocusOmniImport() {
    try { varSetSub('dashboard', null); } catch (_) {}
    varUpdateOmniExtUi();
    const hasImport = varHasAnyOmniCsv();
    const target = (_varOmniExtInstalled || hasImport)
      ? (document.getElementById('varLiveReady') || document.getElementById('varSecLive'))
      : (document.getElementById('varActivityOnboard') || document.getElementById('varSecLive'));
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (!_varOmniExtInstalled && !hasImport) {
      const dl = document.querySelector('#varActivityOnboard a[download], #varActivityOnboard a.btn-ac');
      if (dl) {
        dl.classList.add('is-focus');
        setTimeout(() => dl.classList.remove('is-focus'), 1600);
      }
    }
  }

  function varSyncOmni() {
    if (typeof toast === 'function') toast(varT('var.extCguBlocked'), true);
    varFocusOmniImport();
  }

  async function varRefreshOmniFromLocal() {
    if (_varOmniExtSyncing) return;
    _varOmniExtSyncing = true;
    const status = document.getElementById('varOmniSyncStatus');
    if (status) status.textContent = varT('var.extPositionsSyncing');
    try {
      await Promise.all([
        varRefreshOmniMarksOnly().catch(() => false),
        fetchHlFundingMap(true).catch(() => null),
        varRefreshHlPositionsLight().catch(() => false),
      ]);
      _varOmniBookMemo = null;
      _varOmniBookMemoTs = 0;
      const book = varGetOmniBookPositions();
      const n = (book?.positions || []).length;
      if (_varSub === 'hedge' || varHedgePanelVisible()) renderVarHedge(true);
      else renderVarActivity();
      if (typeof toast === 'function') {
        toast(n
          ? varT('var.extPositionsSynced').replace('{n}', String(n))
          : varT('var.hedgeBooksStale'));
      }
    } catch (_) {
      if (typeof toast === 'function') toast(varT('var.extSyncFail'), true);
    } finally {
      _varOmniExtSyncing = false;
      varUpdateOmniExtUi();
    }
  }

  function varSyncOmniPositions() {
    return varRefreshOmniFromLocal();
  }

  function varCollectorSeedUrl() {
    try {
      return new URL('omni-bookmark.html', location.href).href;
    } catch (_) {
      return 'https://hypersheets.xyz/omni-bookmark.html';
    }
  }

  function varInitCollectorUi() {
    const a = document.getElementById('varCollectorBookmark');
    if (!a) return;
    const seed = varCollectorSeedUrl();
    a.setAttribute('href', seed);
    a.setAttribute('draggable', 'true');
    a.removeAttribute('target');
    varLoadCollectorRunSrc().catch(() => {});
    if (a.dataset.varCollectorBound) return;
    a.dataset.varCollectorBound = '1';
    a.addEventListener('dragstart', (e) => {
      const live = varCollectorSeedUrl();
      a.setAttribute('href', live);
      try {
        e.dataTransfer.setData('text/uri-list', live);
        e.dataTransfer.setData('text/plain', live);
        e.dataTransfer.setData('text/html', '<a href="' + live.replace(/"/g, '&quot;') + '">Hypersheets Omni</a>');
        e.dataTransfer.effectAllowed = 'copyLink';
      } catch (_) {}
    });
  }

  async function varCopyCollectorCode() {
    await varLoadCollectorRunSrc();
    const href = varCollectorHref();
    try {
      await navigator.clipboard.writeText(href);
      if (typeof toast === 'function') toast(varT('var.collectorCopied'));
    } catch (_) {
      if (typeof toast === 'function') toast(varT('var.collectorCopyFail'), true);
      try { window.prompt(varT('var.collectorCopyPrompt'), href); } catch (__) {}
    }
  }

  function varDownloadCollectorBookmark() {
    const seed = varCollectorSeedUrl();
    const icon =
      (typeof HS_BRAND_ICON_URL === 'string' && HS_BRAND_ICON_URL) ||
      (typeof window.HS_BRAND_ICON_URL === 'string' && window.HS_BRAND_ICON_URL) ||
      '';
    const escAttr = (v) => String(v)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- Import in Chrome: ⋮ → Bookmarks → Import bookmarks and settings → Bookmarks HTML file -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Hypersheets Omni</TITLE>
<H1>Hypersheets Omni</H1>
<DL><p>
    <DT><A HREF="${escAttr(seed)}" ADD_DATE="${Math.floor(Date.now() / 1000)}" ICON="${escAttr(icon)}">Hypersheets Omni</A>
</DL><p>
`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hypersheets-omni-bookmark.html';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    if (typeof toast === 'function') toast(varT('var.collectorBookmarkDownloaded'));
  }

  function varBindJsonDrop() {
    varInitOmniExportReceiver();
    varInitOmniExtBridge();
    varInitCollectorUi();
    varUpdateOmniExtUi();
    const drop = document.getElementById('varJsonDrop');
    if (!drop || drop.dataset.bound) return;
    drop.dataset.bound = '1';
    const openPicker = () => document.getElementById('varJsonFileInput')?.click();
    drop.addEventListener('click', (e) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      const fromSlots = path.some((n) => n && n.id === 'varOmniSlots')
        || e.target.closest('#varOmniSlots')
        || e.target.closest('.var-omni-slot');
      if (fromSlots) return;
      if (
        e.target.closest('label')
        || e.target.closest('input')
        || e.target.closest('a')
        || e.target.closest('button')
      ) return;
      openPicker();
    });
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
    });
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('is-drag');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
    drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      drop.classList.remove('is-drag');
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      const fake = { files };
      const hasJson = files.some(f => /\.json$/i.test(f.name) || f.type.includes('json'));
      if (hasJson) await varImportJsonFiles(fake);
      else varImportCsvFiles(fake);
    });
  }

  function varImportCsvFiles(input, forcedKind) {
    const files = [...(input?.files || [])];
    if (!files.length) return;
    const jsonFiles = files.filter(f => /\.json$/i.test(f.name) || (f.type || '').includes('json'));
    const csvFiles = files.filter(f => !jsonFiles.includes(f));

    const finishCsv = (bundle, hadError, importedKinds) => {
      varCsvSave(bundle);
      if (typeof toast === 'function') {
        if (hadError && !importedKinds.size) toast(varT('var.csvUnknown'), true);
        else if (importedKinds.size === 1) {
          const k = [...importedKinds][0];
          toast(varT('var.csvImportedKind').replace('{kind}', varT(VAR_CSV_KIND_I18N[k] || k)));
        } else if (importedKinds.size > 1) toast(varT('var.csvImported'));
        else if (hadError) toast(varT('var.csvUnknown'), true);
      }
      renderVarActivity();
      if (input) input.value = '';
    };

    const runCsv = () => {
      if (!csvFiles.length) {
        if (input) input.value = '';
        return;
      }
      let bundle = varCsvLoad() || varCsvEmptyBundle();
      let pending = csvFiles.length;
      let hadError = false;
      const importedKinds = new Set();
      const onDone = () => {
        pending--;
        if (pending > 0) return;
        finishCsv(bundle, hadError, importedKinds);
      };
      for (const file of csvFiles) {
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
    };

    if (jsonFiles.length) {
      Promise.allSettled(jsonFiles.map(f => varReadJsonFile(f)))
        .then((results) => {
          const ok = results.filter(r => r.status === 'fulfilled').length;
          const bad = results.length - ok;
          if (typeof toast === 'function') {
            if (ok) toast(varT('var.jsonImported'));
            else if (bad) toast(varT('var.jsonUnknown'), true);
          }
          const ptsEl = document.getElementById('varAirPoints');
          const pts = varPointsLoad()?.points_summary?.total_points;
          if (ptsEl && pts != null && !ptsEl.dataset.manual) ptsEl.value = String(parseFloat(pts));
          renderVarActivity();
          runCsv();
        });
      return;
    }
    runCsv();
  }

  function varClearCsvKind(kind) {
    const bundle = varCsvLoad() || varCsvEmptyBundle();
    if (!VAR_CSV_KINDS.includes(kind)) return;
    bundle[kind] = [];
    if (bundle.files) delete bundle.files[kind];
    const empty = !VAR_CSV_KINDS.some(k => (bundle[k] || []).length);
    if (empty) {
      const acc = varAccountsLoad();
      const id = varAccountsActiveId();
      if (acc.slots[id]) {
        acc.slots[id].csv = null;
        varAccountsSave(acc);
      }
    } else {
      varCsvSave(bundle);
    }
    if (typeof toast === 'function') {
      toast(varT('var.csvClearedKind').replace('{kind}', varT(VAR_CSV_KIND_I18N[kind] || kind)));
    }
    renderVarActivity();
  }

  function varClearOmniSlot(id) {
    const acc = varAccountsLoad();
    if (!varOmniSlotIds(acc).includes(id)) return;
    const idx = varOmniSlotIds(acc).indexOf(id);
    acc.slots[id] = {
      id,
      label: acc.slots[id]?.label || varOmniLabelForIndex(idx),
      csv: null,
      points: null,
      importedAt: null,
    };
    varAccountsSave(acc);
    if (typeof toast === 'function') toast(varT('var.slotCleared').replace('{label}', acc.slots[id].label));
    varAccountsScheduleActivityRefresh();
  }

  function varClearCsv() {
    const prev = varAccountsLoad();
    const ids = varOmniSlotIds(prev);
    const empty = varAccountsEmpty();
    empty.slotOrder = ids.slice();
    empty.slots = {};
    ids.forEach((id, i) => {
      empty.slots[id] = varOmniMakeSlot(id, prev.slots[id]?.label || varOmniLabelForIndex(i));
    });
    empty.activeImportSlot = ids.includes(prev.activeImportSlot) ? prev.activeImportSlot : ids[0];
    varAccountsSave(empty);
    varPositionsClear();
    if (typeof toast === 'function') toast(varT('var.csvCleared'));
    renderVarActivity();
    if (varHedgePanelVisible()) renderVarHedge(true);
  }

  function varBindOmniSlotsUi() {
    const host = document.getElementById('varOmniSlots');
    if (!host) return;
    if (host._hsOmniSlotsOnClick) {
      host.removeEventListener('click', host._hsOmniSlotsOnClick);
    }
    host._hsOmniSlotsOnClick = function (e) {
      const scopeBtn = e.target.closest('[data-omni-scope]');
      if (scopeBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (scopeBtn.disabled) return;
        varSetCsvScope(scopeBtn.getAttribute('data-omni-scope') || 'all');
        return;
      }
      const pickBtn = e.target.closest('[data-omni-pick]');
      if (pickBtn) {
        e.preventDefault();
        e.stopPropagation();
        const pid = pickBtn.getAttribute('data-omni-pick');
        varCsvScopeSave('active');
        varAccountsSetActiveImport(pid);
        return;
      }
      const addBtn = e.target.closest('[data-omni-add]');
      if (addBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (addBtn.disabled) return;
        varAccountsAddSlot();
        return;
      }
      const removeBtn = e.target.closest('[data-omni-remove]');
      if (removeBtn) {
        e.preventDefault();
        e.stopPropagation();
        const rid = removeBtn.getAttribute('data-omni-remove')
          || (removeBtn.closest('.var-omni-slot') && removeBtn.closest('.var-omni-slot').getAttribute('data-slot'))
          || '';
        varAccountsRemoveSlot(rid);
        return;
      }
      const clearBtn = e.target.closest('[data-omni-clear]');
      if (clearBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (clearBtn.disabled) return;
        varClearOmniSlot(clearBtn.getAttribute('data-omni-clear'));
        return;
      }
      const slot = e.target.closest('.var-omni-slot');
      if (slot && slot.getAttribute('data-slot')) {
        e.preventDefault();
        e.stopPropagation();
        varCsvScopeSave('active');
        varAccountsSetActiveImport(slot.getAttribute('data-slot'));
      }
    };
    host.addEventListener('click', host._hsOmniSlotsOnClick);
  }

  function varRenderOmniSlotsUi() {
    const host = document.getElementById('varOmniSlots');
    if (!host) return;
    varBindOmniSlotsUi();
    const acc = varAccountsLoad();
    const ids = varOmniSlotIds(acc);
    const active = varAccountsActiveId();
    const canRemove = ids.length > VAR_OMNI_MIN_SLOTS;
    const canAdd = ids.length < VAR_OMNI_MAX_SLOTS;
    const scope = varCsvScopeLoad();
    const filled = ids.filter((id) => (acc.slots[id]?.csv?.trades || []).length > 0).length;

    const chips = `<div class="var-omni-scope-chips" role="group" aria-label="CSV scope">
      <button type="button" class="wallet-chip${scope === 'all' ? ' active' : ''}" data-omni-scope="all"${filled < 2 ? ' disabled' : ''}>${varT('var.csvScopeAll') || 'Tous'}</button>
      ${ids.map((id, i) => {
        const s = acc.slots[id];
        const nTrades = (s.csv?.trades || []).length;
        const label = s.label || varOmniLabelForIndex(i);
        const on = scope === 'active' && id === active;
        return `<button type="button" class="wallet-chip${on ? ' active' : ''}" data-omni-pick="${id}" title="${nTrades} trades">${varEsc(label)}${nTrades ? ` · ${nTrades}` : ''}</button>`;
      }).join('')}
    </div>`;

    const slotsHtml = ids.map((id, i) => {
      const s = acc.slots[id];
      const nTrades = (s.csv?.trades || []).length;
      const ready = nTrades > 0;
      const checked = id === active ? 'checked' : '';
      const status = ready
        ? varT('var.slotReady').replace('{n}', String(nTrades))
        : varT('var.slotEmpty');
      const label = s.label || varOmniLabelForIndex(i);
      const removeBtn = canRemove
        ? `<button type="button" class="btn btn-ghost text-xs" data-omni-remove="${id}" title="${varEsc(varT('var.slotRemove'))}">✕</button>`
        : '';
      return `<div class="var-omni-slot${id === active ? ' is-active' : ''}" data-slot="${id}">
        <div class="var-omni-slot-top">
          <input type="radio" name="varOmniImportSlot" value="${id}" ${checked} tabindex="-1" />
          <div class="var-omni-slot-copy">
            <strong>${varEsc(label)}</strong>
            <span>${status}</span>
          </div>
        </div>
        <div class="var-omni-slot-actions">
          <button type="button" class="btn btn-ghost text-xs" data-omni-clear="${id}" ${ready ? '' : 'disabled'}>${varT('var.slotClear')}</button>
          ${removeBtn}
        </div>
      </div>`;
    }).join('');
    const actions = `<div class="var-omni-slots-foot">
      <button type="button" class="btn btn-ghost text-xs" style="padding:6px 10px" data-omni-add="1" ${canAdd ? '' : 'disabled'}>${varT('var.slotAdd')}</button>
      <span style="font-size:.68rem;color:var(--muted)">${varT('var.slotAddHint').replace('{max}', String(VAR_OMNI_MAX_SLOTS))}</span>
    </div>`;
    host.innerHTML = chips + slotsHtml + actions;
  }

  function varAirdropCompute(points, fdvM, sharePct, totalPtsM) {
    const fdv = fdvM * 1e6;
    const pool = fdv * (sharePct / 100);
    const totalPts = totalPtsM * 1e6;
    const valuePerPoint = totalPts > 0 ? pool / totalPts : 0;
    const payout = points > 0 ? points * valuePerPoint : 0;
    const yourShare = totalPts > 0 && points > 0 ? points / totalPts : 0;
    return { fdv, pool, totalPts, valuePerPoint, payout, yourShare };
  }

  function varAirdropReadInputs() {
    const fdvEl = document.getElementById('varAirFdv');
    const shareEl = document.getElementById('varAirShare');
    const totalEl = document.getElementById('varAirTotalPts');
    const ptsEl = document.getElementById('varAirPoints');
    const fdvM = parseFloat(fdvEl?.value || VAR_AIRDROP_DEFAULTS.fdvM);
    const sharePct = parseFloat(shareEl?.value || VAR_AIRDROP_DEFAULTS.sharePct);
    const totalPtsM = parseFloat(totalEl?.value || VAR_AIRDROP_DEFAULTS.totalPtsM);
    let points = parseFloat(ptsEl?.value || '');
    if (!isFinite(points)) {
      const imported = parseFloat(varPointsLoad()?.points_summary?.total_points || '');
      points = isFinite(imported) ? imported : 0;
      if (ptsEl && isFinite(imported) && (ptsEl.value === '' || ptsEl.value == null)) {
        ptsEl.value = String(imported);
      }
    }
    return { fdvM, sharePct, totalPtsM, points };
  }

  function varAirdropReset() {
    const a = { ...VAR_AIRDROP_DEFAULTS };
    varAirdropSaveAssumptions(a);
    const fdvEl = document.getElementById('varAirFdv');
    const shareEl = document.getElementById('varAirShare');
    const totalEl = document.getElementById('varAirTotalPts');
    if (fdvEl) fdvEl.value = String(a.fdvM);
    if (shareEl) shareEl.value = String(a.sharePct);
    if (totalEl) totalEl.value = String(a.totalPtsM);
    const ptsEl = document.getElementById('varAirPoints');
    const imported = parseFloat(varPointsLoad()?.points_summary?.total_points || '');
    if (ptsEl) {
      delete ptsEl.dataset.manual;
      ptsEl.value = isFinite(imported) ? String(imported) : '';
    }
    renderVarAirdrop();
  }

  function varAirdropDrawShareCard(metrics, inputs) {
    const canvas = document.getElementById('varAirShareCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0b0d14');
    g.addColorStop(1, '#12182a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(76,154,248,0.12)';
    ctx.beginPath();
    ctx.arc(W - 80, 80, 140, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#97FCE4';
    ctx.font = '700 22px Inter,Segoe UI,sans-serif';
    ctx.fillText('Hypersheets', 48, 56);
    ctx.fillStyle = '#4c9af8';
    ctx.font = '600 14px Inter,Segoe UI,sans-serif';
    ctx.fillText('Variational · Airdrop scenario', 48, 82);

    ctx.fillStyle = 'rgba(155,170,185,0.9)';
    ctx.font = '600 13px Inter,sans-serif';
    ctx.fillText('YOUR PAYOUT', 48, 150);
    ctx.fillStyle = '#f4f7fb';
    ctx.font = '700 54px Inter,sans-serif';
    const payoutTxt = inputs.points > 0 ? varFmtCompactUsd(metrics.payout) : '—';
    ctx.fillText(payoutTxt, 48, 210);

    const rows = [
      ['Points', varFmtPoints(inputs.points)],
      ['Value / pt', inputs.points > 0 ? varFmtCompactUsd(metrics.valuePerPoint) : '—'],
      ['FDV', varFmtCompactUsd(metrics.fdv)],
      ['Supply R1', inputs.sharePct.toFixed(1) + '%'],
      ['Pts at TGE', varFmtPtsMillions(inputs.totalPtsM)],
      ['Pool', varFmtCompactUsd(metrics.pool)],
    ];
    let y = 270;
    rows.forEach(([k, v], i) => {
      const x = 48 + (i % 3) * 250;
      if (i % 3 === 0 && i) y += 78;
      ctx.fillStyle = 'rgba(155,170,185,0.75)';
      ctx.font = '600 12px Inter,sans-serif';
      ctx.fillText(k.toUpperCase(), x, y);
      ctx.fillStyle = '#f4f7fb';
      ctx.font = '700 24px Inter,sans-serif';
      ctx.fillText(v, x, y + 30);
    });

    ctx.fillStyle = 'rgba(155,170,185,0.55)';
    ctx.font = '500 12px Inter,sans-serif';
    ctx.fillText('Community estimates only · not affiliated with Variational Protocol', 48, H - 36);
    ctx.fillStyle = '#97FCE4';
    ctx.font = '700 13px Inter,sans-serif';
    ctx.fillText('hypersheets.xyz', W - 48 - ctx.measureText('hypersheets.xyz').width, H - 36);
  }

  function renderVarAirdrop() {
    const saved = varAirdropLoadAssumptions();
    const fdvEl = document.getElementById('varAirFdv');
    const shareEl = document.getElementById('varAirShare');
    const totalEl = document.getElementById('varAirTotalPts');
    const ptsEl = document.getElementById('varAirPoints');
    if (fdvEl && !fdvEl.dataset.init) {
      fdvEl.value = String(saved.fdvM);
      fdvEl.dataset.init = '1';
    }
    if (shareEl && !shareEl.dataset.init) {
      shareEl.value = String(saved.sharePct);
      shareEl.dataset.init = '1';
    }
    if (totalEl && !totalEl.dataset.init) {
      totalEl.value = String(saved.totalPtsM);
      totalEl.dataset.init = '1';
    }
    if (ptsEl && !ptsEl.dataset.init) {
      const imported = parseFloat(varPointsLoad()?.points_summary?.total_points || '');
      if (isFinite(imported)) ptsEl.value = String(imported);
      ptsEl.dataset.init = '1';
      ptsEl.addEventListener('input', () => { ptsEl.dataset.manual = '1'; });
    }

    const inputs = varAirdropReadInputs();
    varAirdropSaveAssumptions({ fdvM: inputs.fdvM, sharePct: inputs.sharePct, totalPtsM: inputs.totalPtsM });
    const metrics = varAirdropCompute(inputs.points, inputs.fdvM, inputs.sharePct, inputs.totalPtsM);

    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('varAirFdvLabel', varFmtCompactUsd(metrics.fdv));
    set('varAirShareLabel', inputs.sharePct.toFixed(1) + '%');
    set('varAirTotalPtsLabel', varFmtPtsMillions(inputs.totalPtsM));
    set('varAirPointsLabel', inputs.points > 0 ? varFmtPoints(inputs.points) : '—');
    set('varAirValPerPt', varFmtCompactUsd(metrics.valuePerPoint));
    set('varAirValPerPtSub', varT('var.airdropValPerSub')
      .replace('{pool}', varFmtCompactUsd(metrics.pool))
      .replace('{total}', varFmtPtsMillions(inputs.totalPtsM)));
    set('varAirPayout', inputs.points > 0 ? varFmtCompactUsd(metrics.payout) : '—');
    set('varAirPayoutSub', inputs.points > 0 ? '' : varT('var.airdropEnterPoints'));
    set('varAirYourShare', inputs.points > 0 ? ((metrics.yourShare * 100).toFixed(4) + '%') : '—');
    set('varAirPool', varFmtCompactUsd(metrics.pool));

    const costEl = document.getElementById('varAirCostRows');
    if (costEl) {
      costEl.innerHTML = VAR_AIRDROP_COST_TARGETS.map(usd => {
        const ptsNeeded = metrics.valuePerPoint > 0 ? usd / metrics.valuePerPoint : null;
        return `<div class="var-airdrop-cost-row"><span>${varFmtCompactUsd(usd)}</span><strong class="mono">${ptsNeeded != null ? varT('var.airdropCostPts').replace('{n}', varFmtPoints(ptsNeeded)) : '—'}</strong></div>`;
      }).join('');
    }

    const gridEl = document.getElementById('varAirScenarioTable');
    if (gridEl) {
      const rows = VAR_AIRDROP_FDV_SCENARIOS_M.map(fdvM => {
        const m = varAirdropCompute(inputs.points, fdvM, inputs.sharePct, inputs.totalPtsM);
        const hi = Math.abs(fdvM - inputs.fdvM) < 0.01;
        return `<tr style="${hi ? 'background:rgba(76,154,248,.08)' : ''}">
          <td class="mono">${varFmtCompactUsd(m.fdv)}</td>
          <td class="mono text-right">${varFmtCompactUsd(m.pool)}</td>
          <td class="mono text-right">${varFmtCompactUsd(m.valuePerPoint)}</td>
          <td class="mono text-right"><strong>${inputs.points > 0 ? varFmtCompactUsd(m.payout) : '—'}</strong></td>
        </tr>`;
      }).join('');
      gridEl.innerHTML = `<table class="hs-trades-table"><thead><tr>
        <th>${varT('var.airdropColFdv')}</th>
        <th class="text-right">${varT('var.airdropColPool')}</th>
        <th class="text-right">${varT('var.airdropColPt')}</th>
        <th class="text-right">${varT('var.airdropColYou')}</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    }

    varAirdropDrawShareCard(metrics, inputs);
  }

  function varAirdropDownloadPng() {
    const canvas = document.getElementById('varAirShareCanvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'hypersheets-variational-airdrop.png';
    a.click();
  }

  async function varAirdropCopyImage() {
    const canvas = document.getElementById('varAirShareCanvas');
    if (!canvas) return;
    try {
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      if (!blob || !navigator.clipboard?.write) throw new Error('no clipboard');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      if (typeof toast === 'function') toast(varT('var.airdropCopied'));
    } catch (_) {
      if (typeof toast === 'function') toast(varT('var.airdropCopyFail'), true);
    }
  }

  function varAirdropShareX() {
    const inputs = varAirdropReadInputs();
    const metrics = varAirdropCompute(inputs.points, inputs.fdvM, inputs.sharePct, inputs.totalPtsM);
    const text = varT('var.airdropTweet')
      .replace('{points}', varFmtPoints(inputs.points))
      .replace('{payout}', inputs.points > 0 ? varFmtCompactUsd(metrics.payout) : '—')
      .replace('{fdv}', varFmtCompactUsd(metrics.fdv))
      .replace('{share}', inputs.sharePct.toFixed(1))
      .replace('{total}', varFmtPtsMillions(inputs.totalPtsM));
    const url = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text + ' https://hypersheets.xyz/omni');
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  let _varInitInFlight = null;

  async function initVarPage(force) {
    try {
      const stuck = document.getElementById('shareToast');
      if (stuck) {
        stuck.classList.remove('show');
        stuck.style.visibility = 'hidden';
        stuck.style.opacity = '0';
      }
    } catch (_) {}
    try {
      const h = String(location.hash || '');
      const hashTab = ({
        '#var-dashboard': 'dashboard',
        '#var-history': 'dashboard',
        '#var-overview': 'dashboard',
        '#var-points': 'points',
        '#var-competition': 'competition',
        '#var-airdrop': 'airdrop',
        '#var-lab': 'lab',
        '#var-omni-live': 'dashboard',
        '#var-omni-import': 'dashboard',
        '#var-suivi': 'suivi',
        '#var-classement': 'classement',
        '#classement': 'classement',
        '#var-extension': 'extension',
        '#var-radar': 'radar',
      })[h];
      if (hashTab) {
        _varSub = hashTab;
        if (hashTab === 'airdrop' || hashTab === 'lab' || hashTab === 'competition' || hashTab === 'points') {
          _varPointsView = hashTab;
        }
        // Avoid re-entering switchPage → initVarPage while already opening Variational.
        const already = document.body?.dataset?.page === 'variational'
          || document.getElementById('page-variational')?.classList.contains('active');
        if (!already && typeof switchPage === 'function') switchPage('variational');
      }
    } catch (_) {}

    // Paint the active subview immediately — do not wait on Omni/HL network.
    varBindLegForm();
    varInitLegTickerPicker();
    varBindJsonDrop();
    const bootSub = varNormalizeSub(_varSub || 'dashboard');
    varSetSub(bootSub, null);

    if (_varInitInFlight && !force) return _varInitInFlight;
    _varInitInFlight = (async () => {
      try {
        const [stats] = await Promise.all([
          fetchVarStats(!!force).catch(() => null),
          fetchHlFundingMap().catch(() => null),
        ]);
        if (stats) {
          varIndexOmniListings(stats.listings || []);
          varPopulateLegTickers(_varListingsCache);
        }
      } catch (_) {}
      if (force) _varStatsCache = null;
      // Soft refresh once metadata is warm (radar/listings only need it).
      if (_varSub === 'radar') {
        try { renderVarRadar(); } catch (_) {}
      }
    })().finally(() => { _varInitInFlight = null; });
    return _varInitInFlight;
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

  window.varOnRadarParamsChange = varOnRadarParamsChange;
  window.varRefreshHlLeg = varRefreshHlLeg;
  window.varApplyRecommendSide = varApplyRecommendSide;
  window.varRadarOpenHedge = varRadarOpenHedge;
  window.varHedgeUseLiveOmni = varHedgeUseLiveOmni;
  window.varSetSub = varSetSub;
  window.varCloseMoreMenu = varCloseMoreMenu;
  window.renderVarRadar = renderVarRadar;
  window.renderVarHedge = renderVarHedge;
  window.renderVarActivity = renderVarActivity;
  window.renderVarPoints = renderVarPoints;
  window.varSetPointsView = varSetPointsView;
  window.renderVarPointsLab = renderVarPointsLab;
  window.varLabSetModel = varLabSetModel;
  window.varAssetLogoFallback = varAssetLogoFallback;
  window.renderVarAirdrop = renderVarAirdrop;
  window.varSaveLegFromForm = varSaveLegFromForm;
  window.varLegClear = function () { varLegClear(); renderVarHedge(); if (typeof toast === 'function') toast(varT('var.legCleared')); };
  window.varImportCsvFiles = varImportCsvFiles;
  window.varImportJsonFiles = varImportJsonFiles;
  window.varImportMixedFiles = varImportMixedFiles;
  window.varCopyCollectorCode = varCopyCollectorCode;
  window.varDownloadCollectorBookmark = varDownloadCollectorBookmark;
  window.varSyncOmni = varSyncOmni;
  window.varSyncOmniPositions = varSyncOmniPositions;
  window.varRefreshOmniFromLocal = varRefreshOmniFromLocal;
  window.varFocusOmniImport = varFocusOmniImport;
  window.varAccountsSetActiveImport = varAccountsSetActiveImport;
  window.varAccountsAddSlot = varAccountsAddSlot;
  window.varAccountsRemoveSlot = varAccountsRemoveSlot;
  window.varClearOmniSlot = varClearOmniSlot;
  window.varClearCsv = varClearCsv;
  window.varClearCsvKind = varClearCsvKind;
  window.varSetCsvScope = varSetCsvScope;
  window.varRenderOmniSlotsUi = varRenderOmniSlotsUi;
  window.varSetDashPeriod = varSetDashPeriod;
  window.varSetLiveVolPeriod = varSetLiveVolPeriod;
  window.renderVarDash = renderVarDash;
  window.renderVarUserHeroKpis = renderVarUserHeroKpis;
  window.varScrollToDashSection = varScrollToDashSection;
  window.varAirdropReset = varAirdropReset;
  window.varAirdropDownloadPng = varAirdropDownloadPng;
  window.varAirdropCopyImage = varAirdropCopyImage;
  window.varAirdropShareX = varAirdropShareX;
  window.initVarPage = initVarPage;

  varInitOmniExportReceiver();
  varInitOmniExtBridge();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && varHedgePanelVisible()) {
      varHedgeLiveTick();
    }
  });
})();
