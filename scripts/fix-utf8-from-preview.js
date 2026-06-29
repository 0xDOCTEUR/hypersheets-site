/**
 * Fix UTF-8 corruption via i18n + HS_CONFIG only (never touch JS ternaries).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cleanPath = path.join(root, 'index-signals-tabs-preview.html');
const currentPath = path.join(root, 'index.html');

let out = fs.readFileSync(currentPath, 'utf8');
const clean = fs.readFileSync(cleanPath, 'utf8');

function extractI18nBlock(src, lang) {
  const re = new RegExp(`\\b${lang}:\\s*\\{`);
  const m = re.exec(src);
  if (!m) throw new Error(`Missing ${lang} block`);
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
  return { entries };
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
  return src.slice(0, m.index) + `  ${lang}: {\n${lines.join('\n')}\n  }` + src.slice(i);
}

const cleanEn = extractI18nBlock(clean, 'en');
const cleanFr = extractI18nBlock(clean, 'fr');
const curEn = extractI18nBlock(out, 'en');
const curFr = extractI18nBlock(out, 'fr');

function mergeOmni(cleanE, curE) {
  const merged = { ...cleanE };
  for (const [k, v] of Object.entries(curE)) {
    if (!(k in cleanE) || k.startsWith('var.') || k === 'tab.variational' || k === 'loading') {
      merged[k] = v;
    }
  }
  return merged;
}

const mergedEn = mergeOmni(cleanEn.entries, curEn.entries);
const mergedFr = mergeOmni(cleanFr.entries, curFr.entries);

function orderKeys(cleanKeys, merged) {
  const order = [...Object.keys(cleanKeys)];
  for (const k of Object.keys(merged)) {
    if (!order.includes(k)) {
      const hi = order.indexOf('tab.hyperunit');
      order.splice(hi >= 0 ? hi + 1 : order.length, 0, k);
    }
  }
  return order;
}

out = replaceI18nBlock(out, 'en', mergedEn, orderKeys(cleanEn.entries, mergedEn));
out = replaceI18nBlock(out, 'fr', mergedFr, orderKeys(cleanFr.entries, mergedFr));

const cfgRe = /const HS_CONFIG = \{[\s\S]*?\n\}/;
const cleanCfg = clean.match(cfgRe)[0];
const proxy = (out.match(/variationalProxyUrl:\s*'[^']*',/) || ["variationalProxyUrl: '',"])[0];
const newCfg = cleanCfg.replace(/showLeaderboardImport: false,/, `showLeaderboardImport: false,\n  ${proxy}`);
out = out.replace(cfgRe, newCfg);

function swapMeta(src, ref, attr, val) {
  const re = new RegExp(`<meta[^>]+${attr}="${val}"[^>]*>`, 'i');
  const m = ref.match(re);
  return m ? src.replace(re, m[0]) : src;
}
out = swapMeta(out, clean, 'name', 'description');
out = swapMeta(out, clean, 'property', 'og:description');
out = swapMeta(out, clean, 'name', 'twitter:description');

function copyBlock(src, ref, start, end) {
  const a = ref.indexOf(start);
  const b = ref.indexOf(end, a + start.length);
  if (a < 0 || b < 0) return src;
  const chunk = ref.slice(a, b + end.length);
  const sa = src.indexOf(start);
  const sb = src.indexOf(end, sa + start.length);
  if (sa < 0 || sb < 0) return src;
  return src.slice(0, sa) + chunk + src.slice(sb + end.length);
}

out = copyBlock(out, clean, "    volume: { fr: 'Activité", "    oi: { fr: 'Positions ouvertes sur le marché dérivé.', en: 'Open positions in the derivatives market.' },\n");
out = copyBlock(out, clean, '  const interp = {', "    funding_warn:    isFr ? \" Attention: funding très élevé, risque de long squeeze.\"\n                          : \" Warning: very high funding rate, long squeeze risk.\",\n  }");
out = copyBlock(out, clean, "  setText('lastUpdate','Mode démo", "  document.getElementById('appShell').insertBefore(banner, document.getElementById('navTabs'))\n");
out = out.replace(
  /showError\('Mode d\?mo : le bandeau tippers est actif\. Pour les donn\?es wallet, entre une vraie adresse Hyperliquid\.'\);/,
  "showError('Mode démo : le bandeau tippers est actif. Pour les données wallet, entre une vraie adresse Hyperliquid.');"
);

// Demo i18n keys (added after preview snapshot)
const demoFr = {
  'demo.loaded': 'Données démo chargées',
  'demo.noRemove': 'Le wallet démo ne peut pas être retiré en mode démo',
  'demo.noAdd': 'Mode démo : ouvre sans ?demo=1 pour ajouter ton wallet',
  'demo.listHint': 'Données fictives pour enregistrement / démo publique',
  'demo.banner': 'Mode démo — données fictives pour tes vidéos. Tes vrais wallets sont masqués. Quitter : ?demo=0',
};
const demoEn = {
  'demo.banner': 'Demo mode — fictional data for recordings. Your real wallets are hidden. Exit with ?demo=0',
};
for (const [k, v] of Object.entries(demoFr)) {
  out = out.replace(new RegExp(`'${k}': '[^']*',`), `'${k}': '${v.replace(/'/g, "\\'")}',`);
}
for (const [k, v] of Object.entries(demoEn)) {
  const re = new RegExp(`('${k}': ')([^']*)(',)`, 'm');
  const first = out.search(re);
  if (first >= 0) out = out.replace(re, `$1${v.replace(/'/g, "\\'")}$3`);
}

out = out.replace(
  /return HS_CONFIG\?\.demoWalletLabel \|\| \(currentLang === 'fr' \? 'Wallet d\?mo' : 'Demo wallet'\);/,
  "return HS_CONFIG?.demoWalletLabel || (currentLang === 'fr' ? 'Wallet démo' : 'Demo wallet');"
);
out = out.replace(
  /function setXyzPageLoading\(\) \{ \/\* chargement unifi\? : barre header \+ bouton Rafra\?chir \*\/ \}/,
  'function setXyzPageLoading() { /* chargement unifié : barre header + bouton Rafraîchir */ }'
);

// Hardcoded HTML labels without data-i18n (safe literal replacements only)
out = out.replace(
  /<button[^>]*id="sigTabBtnScanner"[^>]*>Scanner march\?<\/button>/,
  (m) => m.replace('Scanner march?', 'Scanner marché')
);
out = out.replace(
  /<span data-i18n="sig\.scannerTitle">Scanner march\?<\/span>/,
  '<span data-i18n="sig.scannerTitle">Scanner marché</span>'
);

fs.writeFileSync(currentPath, out, 'utf8');

const bad = (out.match(/Rafra\?chir|march\?|Activit\?|donn\?e|p\?riode|d\?mo/g) || []).length;
const brokenTernary = (out.match(/function' —/g) || []).length;
console.log('bad fr patterns:', bad, '| broken ternaries:', brokenTernary);
console.log('btn.load FR:', [...out.matchAll(/'btn\.load': '([^']+)'/g)].pop()?.[1]);
