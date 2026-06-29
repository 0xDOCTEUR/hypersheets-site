/**
 * Rebuild index.html: clean UTF-8 base (git a9fdc9f) + Omni snippets.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const scripts = __dirname;

function gitFile(rev, file) {
  return execSync(`git cat-file -p ${rev}:${file}`, { cwd: root, maxBuffer: 60 * 1024 * 1024 }).toString('utf8');
}

function insertAfter(src, anchor, chunk) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('anchor missing: ' + anchor.slice(0, 100));
  return src.slice(0, i + anchor.length) + chunk + src.slice(i + anchor.length);
}

let html = gitFile('a9fdc9f', 'index.html');
const omniCss = fs.readFileSync(path.join(scripts, 'omni-css.snippet.css'), 'utf8');
const omniNav = fs.readFileSync(path.join(scripts, 'omni-nav.snippet.html'), 'utf8');
const omniPage = fs.readFileSync(path.join(scripts, 'omni-page.snippet.html'), 'utf8');

html = insertAfter(html, 'showLeaderboardImport: false,', "\n  variationalProxyUrl: '',");

html = insertAfter(
  html,
  '[data-theme="light"] #sidebar .nav-tab[data-tab="tradexyz"].active {\n      color: #d97706 !important;\n      background: rgba(217, 119, 6, .1);\n      border-color: rgba(217, 119, 6, .25);\n    }\n',
  '\n    ' + omniCss.split('\n').join('\n    ')
);

const navAnchor = '<span class="nav-tab-label" data-i18n="tab.tradexyz">Trade XYZ</span>\n    </span>\n\n    <span class="nav-tab" data-tab="hyperunit"';
html = html.replace(navAnchor, '<span class="nav-tab-label" data-i18n="tab.tradexyz">Trade XYZ</span>\n    </span>\n\n' + omniNav + '    <span class="nav-tab" data-tab="hyperunit"');

const navTabsPos = html.indexOf('id="navTabs"');
const navAnchor2 = html.indexOf(
  '<span class="nav-tab-label" data-i18n="tab.tradexyz">Trade XYZ</span>\n    </span>\n\n    <span class="nav-tab" data-tab="hyperunit"',
  navTabsPos
);
if (navAnchor2 > navTabsPos) {
  html = html.slice(0, navAnchor2) + html.slice(navAnchor2).replace(
    '<span class="nav-tab-label" data-i18n="tab.tradexyz">Trade XYZ</span>\n    </span>\n\n    <span class="nav-tab" data-tab="hyperunit"',
    '<span class="nav-tab-label" data-i18n="tab.tradexyz">Trade XYZ</span>\n    </span>\n\n' + omniNav + '    <span class="nav-tab" data-tab="hyperunit"'
  );
}

html = insertAfter(html, '<!-- PAGE : HYPERUNIT', omniPage);

const VAR_I18N_EN = {
  'tab.variational': 'Omni',
  loading: 'Loading…',
  'var.kpiVol': 'Omni volume',
  'var.kpiTvl': 'TVL',
  'var.kpiOi': 'Open interest',
  'var.kpiMkts': 'Markets',
  'var.hint': 'Public Omni stats + manual hedge leg vs Hyperliquid · import portfolio CSV from',
  'var.subRadar': 'Market radar',
  'var.subHedge': 'Delta-neutral',
  'var.subActivity': 'Activity',
  'var.sortLabel': 'Sort',
  'var.sortFunding': 'Funding rate',
  'var.sortSpread': 'Spread (bps)',
  'var.sortVolume': '24h volume',
  'var.sortCompare': 'Omni vs HL funding',
  'var.updated': 'Updated',
  'var.hedgeTitle': 'Manual Omni leg (farming / delta-neutral)',
  'var.hedgeDesc': 'Enter your Variational position; Hyperliquid leg is read from connected wallet positions.',
  'var.legTicker': 'Ticker',
  'var.legSide': 'Side',
  'var.legNotional': 'Notional (USD)',
  'var.legEntry': 'Entry price (opt.)',
  'var.sideShort': 'Short',
  'var.sideLong': 'Long',
  'var.saveLeg': 'Save leg',
  'var.clearLeg': 'Clear',
  'var.activityTitle': 'Portfolio activity (CSV)',
  'var.csvHint': 'Import trades + transfers exports from Omni (stored locally in your browser).',
  'var.importCsv': 'Import CSV',
  'var.clearCsv': 'Clear data',
  'var.actVol': 'Trade volume',
  'var.actTrades': 'Trades',
  'var.actFunding': 'Funding',
  'var.actPnl': 'Realized PnL',
  'var.actFees': 'Fees',
  'var.lossRefund': 'Loss refund 24h',
  'var.apiError': 'Omni API error',
  'var.noData': 'No data',
  'var.noCompare': 'No comparable markets (min $50k vol + HL listing)',
  'var.hedgeEmpty': 'Save an Omni leg to compare with your Hyperliquid position.',
  'var.driftWarn': 'Delta drift &gt; 5% — rebalance or resize legs.',
  'var.hedgeHint': 'Target: opposite side on HL with similar notional for funding farming.',
  'var.legInvalid': 'Invalid leg — ticker and notional required.',
  'var.legSaved': 'Omni leg saved',
  'var.legCleared': 'Omni leg cleared',
  'var.csvEmpty': 'Import Omni portfolio CSV (trades + transfers) for an activity overview.',
  'var.csvImported': 'CSV imported',
  'var.csvCleared': 'CSV data cleared',
};

const VAR_I18N_FR = {
  'tab.variational': 'Omni',
  loading: 'Chargement…',
  'var.kpiVol': 'Volume Omni',
  'var.kpiTvl': 'TVL',
  'var.kpiOi': 'Open interest',
  'var.kpiMkts': 'Marchés',
  'var.hint': 'Stats publiques Omni + jambe manuelle vs Hyperliquid · import CSV portfolio depuis',
  'var.subRadar': 'Radar marché',
  'var.subHedge': 'Delta-neutral',
  'var.subActivity': 'Activité',
  'var.sortLabel': 'Tri',
  'var.sortFunding': 'Funding',
  'var.sortSpread': 'Spread (bps)',
  'var.sortVolume': 'Volume 24h',
  'var.sortCompare': 'Funding Omni vs HL',
  'var.updated': 'Màj',
  'var.hedgeTitle': 'Jambe Omni manuelle (farming / delta-neutral)',
  'var.hedgeDesc': 'Saisis ta position Variational ; la jambe HL est lue depuis les positions du wallet connecté.',
  'var.legTicker': 'Ticker',
  'var.legSide': 'Sens',
  'var.legNotional': 'Notionnel (USD)',
  'var.legEntry': "Prix d'entrée (opt.)",
  'var.sideShort': 'Short',
  'var.sideLong': 'Long',
  'var.saveLeg': 'Enregistrer',
  'var.clearLeg': 'Effacer',
  'var.activityTitle': 'Activité portfolio (CSV)',
  'var.csvHint': 'Importe les exports trades + transfers Omni (stockés localement dans le navigateur).',
  'var.importCsv': 'Importer CSV',
  'var.clearCsv': 'Effacer les données',
  'var.actVol': 'Volume trades',
  'var.actTrades': 'Trades',
  'var.actFunding': 'Funding',
  'var.actPnl': 'PnL réalisé',
  'var.actFees': 'Frais',
  'var.lossRefund': 'Remboursement pertes 24h',
  'var.apiError': 'Erreur API Omni',
  'var.noData': 'Aucune donnée',
  'var.noCompare': 'Pas de marchés comparables (vol min. 50 k$ + listing HL)',
  'var.hedgeEmpty': 'Enregistre une jambe Omni pour la comparer à ta position Hyperliquid.',
  'var.driftWarn': 'Dérive delta &gt; 5 % — rééquilibre ou ajuste les jambes.',
  'var.hedgeHint': 'Objectif : sens opposé sur HL avec un notionnel similaire pour le farming de funding.',
  'var.legInvalid': 'Jambe invalide — ticker et notionnel requis.',
  'var.legSaved': 'Jambe Omni enregistrée',
  'var.legCleared': 'Jambe Omni effacée',
  'var.csvEmpty': "Importe le CSV portfolio Omni (trades + transfers) pour une vue d'ensemble.",
  'var.csvImported': 'CSV importé',
  'var.csvCleared': 'Données CSV effacées',
};

function injectI18nKeys(src, lang, afterKey, keys) {
  const lines = Object.entries(keys).map(([k, v]) => {
    const esc = v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `    '${k}': '${esc}',`;
  }).join('\n');
  const anchor = `'${afterKey}':`;
  const re = new RegExp(`(\\b${lang}:\\s*\\{[\\s\\S]*?${anchor.replace(/\./g, '\\.')}[^\\n]+\\n)`);
  return src.replace(re, `$1${lines}\n`);
}

html = injectI18nKeys(html, 'en', 'tab.hyperunit', VAR_I18N_EN);
html = injectI18nKeys(html, 'fr', 'tab.hyperunit', VAR_I18N_FR);

html = insertAfter(html, "if (pageName === 'hyperliquid') theme = 'theme-hl'\n", "  else if (pageName === 'variational') theme = 'theme-hl'\n");

html = insertAfter(
  html,
  "} else if (name === 'leaderboard') {\n      filterRow.style.display = 'flex';\n      filterPills?.classList.add('hs-filter-pills-hidden');\n    } else {",
  "\n    } else if (name === 'variational') {\n      filterRow.style.display = 'flex';\n      filterPills?.classList.add('hs-filter-pills-hidden');"
);

html = insertAfter(html, "if (name === 'wallet') renderWalletPage();\n", "  if (name === 'variational' && typeof initVarPage === 'function') initVarPage(false);\n");

html = insertAfter(
  html,
  'async function loadDataFromConnect() {\n',
  "  if (currentPage === 'variational' && typeof initVarPage === 'function') {\n    await initVarPage(true);\n    return;\n  }\n"
);

if (!html.includes('variational-omni.js')) {
  html = html.replace('</body>', '<script src="js/variational-omni.js"></script>\n</body>');
}

const outPath = path.join(root, 'index.html');
fs.writeFileSync(outPath, html, 'utf8');

const bad = (html.match(/Rafra\?chir|march\?|Activit\?|P\?riode|d\?mo/g) || []).length;
console.log('Rebuilt OK — corruption:', bad, '| Rafraîchir:', html.includes('Rafraîchir'));
console.log('variational:', html.includes('page-variational'), '| demo:', html.includes('isDemoWallet'));
