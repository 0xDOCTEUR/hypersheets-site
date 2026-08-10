/**
 * Patch index.html for page-scoped Hyperliquid / XYZ / Unit data loading.
 */
const fs = require('fs');
const path = require('path');
const INDEX = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(INDEX, 'utf8');

const HELPERS = `
/** Which API scopes each page needs (wallet trading data). */
function pageDataScopes(page) {
  const p = page || currentPage || (document.body && document.body.dataset.page) || 'dashboard';
  if (p === 'signals' || p === 'analyse' || p === 'marketradar' || p === 'leaderboard') {
    return { meta: false, hl: false, xyz: false, unit: false, funding: false, portfolio: false };
  }
  if (p === 'wallet') {
    return { meta: true, hl: false, xyz: false, unit: false, funding: false, portfolio: true };
  }
  if (p === 'hyperliquid') {
    return { meta: true, hl: true, xyz: false, unit: false, funding: true, portfolio: true };
  }
  if (p === 'tradexyz') {
    return { meta: true, hl: false, xyz: true, unit: false, funding: false, portfolio: true };
  }
  if (p === 'hyperunit') {
    return { meta: true, hl: false, xyz: false, unit: true, funding: false, portfolio: true };
  }
  // dashboard + farming: full picture for KPIs / goals
  return { meta: true, hl: true, xyz: true, unit: true, funding: true, portfolio: true };
}

function dataPeriodKey() {
  return currentPeriod === 'all' ? 'all' : String(currentPeriod);
}

function invalidatePeriodSensitiveScopes() {
  _dataScopeState.hl = false;
  _dataScopeState.xyz = false;
  _dataScopeState.unit = false;
  _dataScopeState.funding = false;
  _dataScopeState.periodKey = null;
}

function resolveLoadScopes(opts) {
  const want = opts.scopes
    ? { meta: false, hl: false, xyz: false, unit: false, funding: false, portfolio: false, ...opts.scopes }
    : pageDataScopes(opts.page || currentPage);
  const periodChanged = _dataScopeState.periodKey != null && _dataScopeState.periodKey !== dataPeriodKey();
  if (periodChanged) invalidatePeriodSensitiveScopes();
  const need = {};
  for (const k of ['meta', 'hl', 'xyz', 'unit', 'funding', 'portfolio']) {
    if (!want[k]) { need[k] = false; continue; }
    if (opts.force) { need[k] = true; continue; }
    need[k] = !_dataScopeState[k];
  }
  // Funding only useful with HL history
  if (need.funding && !want.hl && !need.hl && !_dataScopeState.hl) need.funding = false;
  return { want, need, any: Object.values(need).some(Boolean) };
}

async function ensurePageData(page) {
  if (isDemoWalletMode()) return;
  if (!wallets.length) return;
  const resolved = resolveLoadScopes({ page });
  if (!resolved.any) return;
  await loadData({ page, scopes: resolved.need, merge: true });
}

`;

if (!html.includes('function pageDataScopes(')) {
  const anchor = "let currentPage = 'dashboard';\nlet currentUnitSub = 'bridge';";
  if (!html.includes(anchor)) throw new Error('currentPage anchor missing');
  html = html.replace(
    anchor,
    `let currentPage = 'dashboard';
let currentUnitSub = 'bridge';
let _dataScopeState = { periodKey: null, meta: false, hl: false, xyz: false, unit: false, funding: false, portfolio: false };
` + HELPERS
  );
  console.log('helpers inserted');
} else {
  console.log('helpers already present');
}

// Patch loadData start: resolve scopes early and bail if none
const LOAD_START = `async function loadData(opts = {}) {
  if (isDemoWalletMode()) {
    activateDemoWalletSession();
    await loadDemoWalletData();
    return;
  }
  if (!wallets.length) {
    openWalletsModal();
    return;
  }
  if (_loadDataRunning) {
    _loadDataPending = true;
    return;
  }
  _loadDataRunning = true;`;

const LOAD_START_NEW = `async function loadData(opts = {}) {
  if (isDemoWalletMode()) {
    activateDemoWalletSession();
    await loadDemoWalletData();
    return;
  }
  if (!wallets.length) {
    openWalletsModal();
    return;
  }
  const _scopePlan = resolveLoadScopes(opts);
  if (!_scopePlan.any) {
    if (typeof renderAll === 'function') renderAll();
    return;
  }
  const _need = _scopePlan.need;
  const _merge = !!opts.merge;
  if (_loadDataRunning) {
    _loadDataPending = true;
    return;
  }
  _loadDataRunning = true;`;

if (!html.includes('const _scopePlan = resolveLoadScopes')) {
  if (!html.includes(LOAD_START)) throw new Error('loadData start missing');
  html = html.replace(LOAD_START, LOAD_START_NEW);
  console.log('loadData start patched');
}

// Patch metadata fetch to be conditional
const META_BLOCK = `    glpSetProgress(8);
    // Metadata commune chargée 1 fois
    const [spotBundleRes, outcomeMetaRes, midsRes, xyzMetaRes] = await Promise.allSettled([
      hlPost({ type: 'spotMetaAndAssetCtxs' }),
      hlPost({ type: 'outcomeMeta' }),
      hlPost({ type: 'allMids' }),
      hlPost({ type: 'meta', dex: 'xyz' }),
    ]);`;

const META_BLOCK_NEW = `    glpSetProgress(8);
    // Metadata only when needed for this page scope
    let spotBundleRes, outcomeMetaRes, midsRes, xyzMetaRes;
    if (_need.meta || !_dataScopeState.meta) {
      [spotBundleRes, outcomeMetaRes, midsRes, xyzMetaRes] = await Promise.allSettled([
        hlPost({ type: 'spotMetaAndAssetCtxs' }),
        hlPost({ type: 'outcomeMeta' }),
        hlPost({ type: 'allMids' }),
        (_need.xyz || _need.unit || pageDataScopes(currentPage).xyz || pageDataScopes(currentPage).hl)
          ? hlPost({ type: 'meta', dex: 'xyz' })
          : Promise.resolve(null),
      ]);
    } else {
      spotBundleRes = { status: 'rejected' };
      outcomeMetaRes = { status: 'rejected' };
      midsRes = { status: 'rejected' };
      xyzMetaRes = { status: 'rejected' };
    }`;

if (!html.includes('Metadata only when needed')) {
  // Only replace the first occurrence inside loadData (not demo)
  const idx = html.indexOf('async function loadData(opts = {})');
  const demoIdx = html.indexOf('async function loadDemoWalletData');
  const sliceStart = idx;
  const sliceEnd = html.indexOf('async function ', idx + 10); // rough - better find unique after loadData
  // Use first META_BLOCK after loadData function
  const metaAt = html.indexOf(META_BLOCK, idx);
  if (metaAt < 0 || (demoIdx > 0 && metaAt > demoIdx && metaAt < idx)) {
    // find after loadData only
  }
  if (metaAt < 0) throw new Error('META_BLOCK not found');
  // Ensure we're in loadData not demo - demo has same block earlier
  const metaInLoad = html.indexOf(META_BLOCK, idx);
  if (metaInLoad < 0) throw new Error('META in loadData not found');
  html = html.slice(0, metaInLoad) + META_BLOCK_NEW + html.slice(metaInLoad + META_BLOCK.length);
  console.log('meta block patched');
}

// Patch reset of arrays - only clear scopes being refreshed
const RESET = `    // Reset ALL data — prevents accumulation on reload
    allFills = [];
    xyzFills = [];
    bridgeOps = [];
    fundingEvents = [];
    allPositions = [];
    accountValues = {};
    walletPortfolio = {};
    _walletCgAttempted = new Set();
    fillsByWallet = {};`;

const RESET_NEW = `    // Reset only scopes being refreshed (keep other pages' data)
    if (!_merge || _need.hl) allFills = [];
    if (!_merge || _need.xyz) xyzFills = [];
    if (!_merge || _need.unit) bridgeOps = [];
    if (!_merge || _need.funding) fundingEvents = [];
    if (!_merge || _need.portfolio) {
      allPositions = [];
      accountValues = {};
      walletPortfolio = {};
      _walletCgAttempted = new Set();
    }
    if (!_merge || _need.hl || _need.xyz || _need.unit || _need.funding || _need.portfolio) {
      if (!_merge) fillsByWallet = {};
      else {
        for (const w of wallets) {
          if (!fillsByWallet[w]) fillsByWallet[w] = { hl: [], xyz: [], bridge: [], funding: [], positions: [] };
          if (_need.hl) fillsByWallet[w].hl = [];
          if (_need.xyz) fillsByWallet[w].xyz = [];
          if (_need.unit) fillsByWallet[w].bridge = [];
          if (_need.funding) fillsByWallet[w].funding = [];
          if (_need.portfolio) fillsByWallet[w].positions = [];
        }
      }
    }`;

if (!html.includes('Reset only scopes being refreshed')) {
  const idx = html.indexOf('async function loadData(opts = {})');
  const resetAt = html.indexOf(RESET, idx);
  if (resetAt < 0) throw new Error('RESET block not found in loadData');
  html = html.slice(0, resetAt) + RESET_NEW + html.slice(resetAt + RESET.length);
  console.log('reset block patched');
}

// Patch per-wallet fetches
const WALLET_FETCH = `        const [twapW, fundingRes, bridgeRes, posRes, spotRes, posXyzRes] = await Promise.allSettled([
          fetchTwapSliceFills(w, startTime, tag, i),
          fetchAllFunding(w, startTime, maxPages, tag, i),
          fetch(\`\${UNIT_API}/\${w}\`).then(r => r.ok ? r.json() : null).catch(() => null),
          hlPost({ type: 'clearinghouseState', user: w }, { label: \`clearinghouseState \${truncAddr(w)}\` }),
          hlPost({ type: 'spotClearinghouseState', user: w }, { label: \`spotClearinghouseState \${truncAddr(w)}\` }),
          hlPost({ type: 'clearinghouseState', user: w, dex: 'xyz' }, { label: \`clearinghouseState xyz \${truncAddr(w)}\` }),
        ]);
        let hlW, xyzW;
        try {
          const hlR = await fetchAllFills(w, startTime, null, maxPages, tag, i);
          hlW = { status: 'fulfilled', value: hlR };
          if (hlR.incomplete) fillFetchIncomplete = true;
        } catch (e) {
          hlW = { status: 'rejected', reason: e };
          fillFetchIncomplete = true;
        }
        try {
          const xyzR = await fetchAllFills(w, startTime, 'xyz', maxPages, tag, i);
          xyzW = { status: 'fulfilled', value: xyzR };
          if (xyzR.incomplete) fillFetchIncomplete = true;
        } catch (e) {
          xyzW = { status: 'rejected', reason: e };
          fillFetchIncomplete = true;
        }`;

const WALLET_FETCH_NEW = `        const [twapW, fundingRes, bridgeRes, posRes, spotRes, posXyzRes] = await Promise.allSettled([
          _need.hl ? fetchTwapSliceFills(w, startTime, tag, i) : Promise.resolve([]),
          _need.funding ? fetchAllFunding(w, startTime, maxPages, tag, i) : Promise.resolve([]),
          _need.unit ? fetch(\`\${UNIT_API}/\${w}\`).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
          _need.portfolio ? hlPost({ type: 'clearinghouseState', user: w }, { label: \`clearinghouseState \${truncAddr(w)}\` }) : Promise.resolve(null),
          _need.portfolio || _need.unit ? hlPost({ type: 'spotClearinghouseState', user: w }, { label: \`spotClearinghouseState \${truncAddr(w)}\` }) : Promise.resolve(null),
          _need.portfolio && (_need.xyz || pageDataScopes(currentPage).xyz || pageDataScopes(currentPage).hl === false && currentPage === 'tradexyz' || _need.xyz)
            ? hlPost({ type: 'clearinghouseState', user: w, dex: 'xyz' }, { label: \`clearinghouseState xyz \${truncAddr(w)}\` })
            : (_need.portfolio ? hlPost({ type: 'clearinghouseState', user: w, dex: 'xyz' }, { label: \`clearinghouseState xyz \${truncAddr(w)}\` }) : Promise.resolve(null)),
        ]);
        let hlW = { status: 'fulfilled', value: { fills: [], incomplete: false } };
        let xyzW = { status: 'fulfilled', value: { fills: [], incomplete: false } };
        if (_need.hl) {
          try {
            const hlR = await fetchAllFills(w, startTime, null, maxPages, tag, i);
            hlW = { status: 'fulfilled', value: hlR };
            if (hlR.incomplete) fillFetchIncomplete = true;
          } catch (e) {
            hlW = { status: 'rejected', reason: e };
            fillFetchIncomplete = true;
          }
        }
        if (_need.xyz) {
          try {
            const xyzR = await fetchAllFills(w, startTime, 'xyz', maxPages, tag, i);
            xyzW = { status: 'fulfilled', value: xyzR };
            if (xyzR.incomplete) fillFetchIncomplete = true;
          } catch (e) {
            xyzW = { status: 'rejected', reason: e };
            fillFetchIncomplete = true;
          }
        }`;

if (!html.includes('_need.hl ? fetchTwapSliceFills')) {
  const idx = html.indexOf('async function loadData(opts = {})');
  const at = html.indexOf('const [twapW, fundingRes, bridgeRes, posRes, spotRes, posXyzRes] = await Promise.allSettled([', idx);
  if (at < 0) throw new Error('wallet fetch not found');
  // Find end of xyzW catch block after this
  const endMarker = 'walletBundles.push({ w, hlW, xyzW, twapW, fundingRes, bridgeRes, posRes, spotRes, posXyzRes });';
  const endAt = html.indexOf(endMarker, at);
  if (endAt < 0) throw new Error('walletBundles.push not found');
  const oldBlock = html.slice(at, endAt);
  if (!oldBlock.includes('fetchAllFills(w, startTime, \'xyz\'')) throw new Error('unexpected wallet fetch block');
  html = html.slice(0, at) + WALLET_FETCH_NEW + '\n        ' + html.slice(endAt);
  console.log('wallet fetch patched');
}

// Mark scopes loaded before renderAll
const MARK = `    dataIsAllTime = isAll;

    if (!allFills.length && !xyzFills.length && !bridgeOps.length) {`;

const MARK_NEW = `    dataIsAllTime = isAll;
    if (_need.meta || !_dataScopeState.meta) _dataScopeState.meta = true;
    if (_need.hl) _dataScopeState.hl = true;
    if (_need.xyz) _dataScopeState.xyz = true;
    if (_need.unit) _dataScopeState.unit = true;
    if (_need.funding) _dataScopeState.funding = true;
    if (_need.portfolio) _dataScopeState.portfolio = true;
    _dataScopeState.periodKey = dataPeriodKey();
    console.log('[loadData] scopes', Object.keys(_need).filter(k => _need[k]).join(',') || '(none)');

    if (!allFills.length && !xyzFills.length && !bridgeOps.length) {`;

if (!html.includes("_dataScopeState.periodKey = dataPeriodKey()")) {
  const idx = html.indexOf('async function loadData(opts = {})');
  const at = html.indexOf(MARK, idx);
  if (at < 0) throw new Error('dataIsAllTime mark not found');
  html = html.slice(0, at) + MARK_NEW + html.slice(at + MARK.length);
  console.log('scope marks patched');
}

// Soften empty activity when portfolio-only
const EMPTY = `    if (!allFills.length && !xyzFills.length && !bridgeOps.length) {
      _pendingDashboardReveal = false;
      hsLaunchHide();
      // Portefeuille HL peut être non vide même sans fills — toujours peindre la page wallet.
      if (typeof isWalletPageActive === 'function' && isWalletPageActive() && typeof renderWalletPage === 'function') {
        renderWalletPage();
      } else {
        showError(t('noActivity'));
        toast(t('noActivity'), true);
      }
      return;
    }`;

const EMPTY_NEW = `    if (!allFills.length && !xyzFills.length && !bridgeOps.length) {
      const wasReveal = _pendingDashboardReveal;
      _pendingDashboardReveal = false;
      hsLaunchHide();
      if (typeof renderWalletPage === 'function') renderWalletPage();
      if (typeof renderAll === 'function') renderAll();
      // Portfolio-only / deferred sections: not an error
      if (_need.portfolio && !_need.hl && !_need.xyz && !_need.unit) {
        if (wasReveal) await launchDashboardReveal();
        return;
      }
      if (typeof isWalletPageActive === 'function' && isWalletPageActive()) {
        if (wasReveal) await launchDashboardReveal();
        return;
      }
      // Still missing trading history for a page that asked for it
      if (_need.hl || _need.xyz || _need.unit) {
        showError(t('noActivity'));
        toast(t('noActivity'), true);
      }
      if (wasReveal) await launchDashboardReveal();
      return;
    }`;

if (!html.includes('Portfolio-only / deferred sections')) {
  const idx = html.indexOf('async function loadData(opts = {})');
  const at = html.indexOf('if (!allFills.length && !xyzFills.length && !bridgeOps.length) {', idx);
  if (at < 0) throw new Error('empty check not found');
  // replace using EMPTY if exact match else softer
  if (html.includes(EMPTY)) {
    html = html.replace(EMPTY, EMPTY_NEW);
  } else {
    throw new Error('EMPTY block exact match failed');
  }
  console.log('empty activity patched');
}

// switchPage: ensure data for page
const SP = `  if (name === 'wallet') renderWalletPage();
  if (name === 'variational' && typeof initVarPage === 'function') initVarPage(false);`;

const SP_NEW = `  if (name === 'wallet') renderWalletPage();
  if (name === 'variational' && typeof initVarPage === 'function') initVarPage(false);
  if (wallets.length && typeof ensurePageData === 'function') {
    ensurePageData(name).catch(err => console.warn('[ensurePageData]', err));
  }`;

if (!html.includes('ensurePageData(name)')) {
  if (!html.includes(SP)) throw new Error('switchPage wallet hook missing');
  html = html.replace(SP, SP_NEW);
  console.log('switchPage patched');
}

// selectPeriod: invalidate scopes
const PERIOD = `  currentPeriod = mode;
  if (!wallets.length) return;
  // Mode "All" déjà chargé → refilter local (évite refetch lourd 100 pages)
  if (mode === 'all' && dataIsAllTime) {
    renderAll();
    return;
  }
  // 1J/7J/30J ou première fois sur "All" → auto-refresh
  loadData();
}`;

const PERIOD_NEW = `  currentPeriod = mode;
  if (!wallets.length) return;
  // Mode "All" déjà chargé → refilter local (évite refetch lourd 100 pages)
  if (mode === 'all' && dataIsAllTime) {
    renderAll();
    return;
  }
  if (typeof invalidatePeriodSensitiveScopes === 'function') invalidatePeriodSensitiveScopes();
  // Refetch only scopes for the active page
  loadData({ page: currentPage, force: true });
}`;

if (!html.includes('invalidatePeriodSensitiveScopes === \'function\') invalidatePeriodSensitiveScopes()')) {
  if (!html.includes(PERIOD)) throw new Error('selectPeriod block missing');
  html = html.replace(PERIOD, PERIOD_NEW);
  console.log('selectPeriod patched');
}

// Fix botched xyz clearinghouse condition - simplify portfolio always fetches both HL and XYZ states when portfolio needed
const BAD_XYZ = `_need.portfolio && (_need.xyz || pageDataScopes(currentPage).xyz || pageDataScopes(currentPage).hl === false && currentPage === 'tradexyz' || _need.xyz)
            ? hlPost({ type: 'clearinghouseState', user: w, dex: 'xyz' }, { label: \`clearinghouseState xyz \${truncAddr(w)}\` })
            : (_need.portfolio ? hlPost({ type: 'clearinghouseState', user: w, dex: 'xyz' }, { label: \`clearinghouseState xyz \${truncAddr(w)}\` }) : Promise.resolve(null)),`;

const GOOD_XYZ = `_need.portfolio
            ? hlPost({ type: 'clearinghouseState', user: w, dex: 'xyz' }, { label: \`clearinghouseState xyz \${truncAddr(w)}\` })
            : Promise.resolve(null),`;

if (html.includes(BAD_XYZ)) {
  html = html.replace(BAD_XYZ, GOOD_XYZ);
  console.log('xyz clearinghouse condition simplified');
} else if (html.includes('_need.portfolio\n            ? hlPost({ type: \'clearinghouseState\', user: w, dex: \'xyz\'')) {
  console.log('xyz clearinghouse already simple');
} else {
  // try normalize
  console.warn('could not simplify xyz condition - check manually');
}

fs.writeFileSync(INDEX, html);
console.log('Wrote', INDEX);
console.log('has pageDataScopes', html.includes('function pageDataScopes'));
console.log('has _need.hl ? fetch', html.includes('_need.hl ? fetchTwapSliceFills'));
console.log('has ensurePageData(name)', html.includes('ensurePageData(name)'));
