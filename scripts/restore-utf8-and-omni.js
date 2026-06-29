/**
 * Restore index.html from clean UTF-8 base (a9fdc9f) + re-apply Omni integration.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cleanPath = path.join(root, '..', '_clean-base.html');
const currentPath = path.join(root, 'index.html');
const outPath = currentPath;

let base = fs.readFileSync(cleanPath, 'utf8');
const cur = fs.readFileSync(currentPath, 'utf8');

function extractBetween(src, startMark, endMark) {
  const a = src.indexOf(startMark);
  if (a < 0) throw new Error('start not found: ' + startMark.slice(0, 40));
  const b = src.indexOf(endMark, a + startMark.length);
  if (b < 0) throw new Error('end not found after: ' + startMark.slice(0, 40));
  return src.slice(a, b);
}

function insertAfter(src, anchor, chunk) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('anchor not found: ' + anchor.slice(0, 60));
  const at = i + anchor.length;
  return src.slice(0, at) + chunk + src.slice(at);
}

// 1) HS_CONFIG — add variationalProxyUrl
base = insertAfter(
  base,
  'showLeaderboardImport: false,',
  '\n  variationalProxyUrl: \'\','
);

// 2) CSS theme for Omni
const varCss = extractBetween(
  cur,
  '[data-theme="light"] #sidebar .nav-tab[data-tab="variational"].active {',
  'body[data-page="variational"] { --accent: #4c9af8; --accent-soft: rgba(76, 154, 248, .12); }\n'
) + 'body[data-page="variational"] { --accent: #4c9af8; --accent-soft: rgba(76, 154, 248, .12); }\n\n';
base = insertAfter(
  base,
  '[data-theme="light"] #sidebar .nav-tab[data-tab="tradexyz"].active {\n      color: #d97706 !important;\n      background: rgba(217, 119, 6, .1);\n      border-color: rgba(217, 119, 6, .25);\n    }\n',
  '\n    ' + varCss.replace(/\n/g, '\n    ').trimEnd() + '\n'
);

// 3) Sidebar nav
const sidebarNav = extractBetween(
  cur,
  '<span class="nav-tab" data-tab="variational"',
  '<span class="nav-tab-label" data-i18n="tab.variational">Omni</span>\n    </span>\n'
) + '<span class="nav-tab-label" data-i18n="tab.variational">Omni</span>\n    </span>\n';
base = insertAfter(
  base,
  '<span class="nav-tab-label" data-i18n="tab.tradexyz">Trade XYZ</span>\n    </span>\n\n',
  '\n    ' + sidebarNav
);

// 4) Horizontal nav — find second tradexyz block
const nav2Anchor = 'id="navTabs"';
const nav2Pos = base.indexOf(nav2Anchor);
const tradexyz2 = base.indexOf('<span class="nav-tab-label" data-i18n="tab.tradexyz">Trade XYZ</span>\n    </span>', nav2Pos);
const horizNav = extractBetween(
  cur,
  '<span class="nav-tab" data-tab="variational"',
  '<span class="nav-tab-label" data-i18n="tab.variational">Omni</span>\n    </span>\n'
);
// second occurrence in current for horizontal nav
const curNav2 = cur.indexOf('id="navTabs"');
const horizChunk = cur.slice(
  cur.indexOf('<span class="nav-tab" data-tab="variational"', cur.indexOf('id="navTabs"', curNav2)),
  cur.indexOf('<span class="nav-tab-label" data-i18n="tab.variational">Omni</span>', curNav2) +
    '<span class="nav-tab-label" data-i18n="tab.variational">Omni</span>\n    </span>\n'.length
);
base = base.slice(0, tradexyz2 + '<span class="nav-tab-label" data-i18n="tab.tradexyz">Trade XYZ</span>\n    </span>\n\n'.length)
  + horizChunk + '\n'
  + base.slice(tradexyz2 + '<span class="nav-tab-label" data-i18n="tab.tradexyz">Trade XYZ</span>\n    </span>\n\n'.length);

// 5) Page HTML
const pageHtml = extractBetween(
  cur,
  '<!-- PAGE : VARIATIONAL OMNI',
  '<!-- PAGE : HYPERUNIT'
);
base = insertAfter(base, '<!-- PAGE : HYPERUNIT', pageHtml);

// 6) I18n — merge var.* keys from current into base
function extractI18nBlock(src, lang) {
  const re = new RegExp(`\\b${lang}:\\s*\\{`);
  const m = re.exec(src);
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i++];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  const body = src.slice(m.index + m[0].length, i - 1);
  const entries = {};
  const lineRe = /^\s*'([^']+)':\s*(['"`])((?:\\.|(?!\2).)*)\2\s*,?\s*$/gm;
  let lm;
  while ((lm = lineRe.exec(body)) !== null) {
    entries[lm[1]] = lm[3].replace(/\\'/g, "'").replace(/\\n/g, '\n');
  }
  return { start: m.index, end: i, entries };
}

function replaceI18nBlock(src, lang, entries, orderKeys) {
  const re = new RegExp(`\\b${lang}:\\s*\\{`);
  const m = re.exec(src);
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i++];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  const keys = orderKeys || Object.keys(entries);
  const lines = keys.map((k) => {
    const esc = String(entries[k]).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `    '${k}': '${esc}',`;
  });
  const block = `  ${lang}: {\n${lines.join('\n')}\n  }`;
  return src.slice(0, m.index) + block + src.slice(i);
}

const baseEn = extractI18nBlock(base, 'en');
const baseFr = extractI18nBlock(base, 'fr');
const curEn = extractI18nBlock(cur, 'en');
const curFr = extractI18nBlock(cur, 'fr');

function mergeOmniKeys(target, source) {
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (k.startsWith('var.') || k === 'tab.variational' || k === 'loading') out[k] = v;
  }
  return out;
}

const mergedEn = mergeOmniKeys(baseEn.entries, curEn.entries);
const mergedFr = mergeOmniKeys(baseFr.entries, curFr.entries);
const enOrder = [...Object.keys(baseEn.entries)];
for (const k of Object.keys(mergedEn)) if (!enOrder.includes(k)) enOrder.push(k);
const frOrder = [...Object.keys(baseFr.entries)];
for (const k of Object.keys(mergedFr)) if (!frOrder.includes(k)) frOrder.push(k);

// Insert tab.variational after tab.hyperunit in order
function insertAfterKey(order, after, keys) {
  const extra = keys.filter((k) => !order.includes(k));
  if (!extra.length) return order;
  const idx = order.indexOf(after);
  if (idx < 0) return [...order, ...extra];
  return [...order.slice(0, idx + 1), ...extra.filter((k) => k.startsWith('var.') || k === 'tab.variational' || k === 'loading'), ...order.slice(idx + 1).filter((k) => !extra.includes(k))];
}
// Simpler: append new keys near tab.hyperunit
function orderWithOmni(order, merged) {
  const out = [...order];
  for (const k of Object.keys(merged)) {
    if (!out.includes(k)) {
      const hi = out.indexOf('tab.hyperunit');
      out.splice(hi >= 0 ? hi + 1 : out.length, 0, k);
    }
  }
  return out;
}

base = replaceI18nBlock(base, 'en', mergedEn, orderWithOmni(enOrder, mergedEn));
base = replaceI18nBlock(base, 'fr', mergedFr, orderWithOmni(frOrder, mergedFr));

// 7) applySupportTopBannerTheme
base = insertAfter(
  base,
  "if (pageName === 'hyperliquid') theme = 'theme-hl'\n",
  "  else if (pageName === 'variational') theme = 'theme-hl'\n"
);

// 8) switchPage variational filter + init
base = insertAfter(
  base,
  "} else if (name === 'leaderboard') {\n      filterRow.style.display = 'flex';\n      filterPills?.classList.add('hs-filter-pills-hidden');\n    } else {",
  "\n    } else if (name === 'variational') {\n      filterRow.style.display = 'flex';\n      filterPills?.classList.add('hs-filter-pills-hidden');"
);
base = insertAfter(
  base,
  "if (name === 'wallet') renderWalletPage();\n",
  "  if (name === 'variational' && typeof initVarPage === 'function') initVarPage(false);\n"
);

// 9) loadDataFromConnect
base = insertAfter(
  base,
  'async function loadDataFromConnect() {\n',
  "  if (currentPage === 'variational' && typeof initVarPage === 'function') {\n    await initVarPage(true);\n    return;\n  }\n"
);

// 10) Script tag
if (!base.includes('variational-omni.js')) {
  base = insertAfter(base, '</body>', '\n<script src="js/variational-omni.js"></script>\n');
}

fs.writeFileSync(outPath, base, 'utf8');

const bad = (base.match(/Rafra\?chir|march\?|Activit\?|donn\?e|p\?riode|d\?mo|Wallet d\?mo/g) || []).length;
console.log('Restored index.html — corruption patterns:', bad);
console.log('Has variational page:', base.includes('page-variational'));
console.log('btn.load FR:', [...base.matchAll(/'btn\.load': '([^']+)'/g)].pop()?.[1]);
