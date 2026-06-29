/**
 * Fix UTF-8 corruption in index.html using clean index-signals-tabs-preview.html
 * as reference for i18n + HS_CONFIG, keeping Omni keys from current file.
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
  return { start: m.index, end: i, entries };
}

function replaceI18nBlock(src, lang, entries, orderKeys) {
  const re = new RegExp(`\\b${lang}:\\s*\\{`);
  const m = re.exec(src);
  if (!m) throw new Error(`Missing ${lang} in target`);
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

function orderKeys(cleanOrder, merged) {
  const order = [...Object.keys(cleanOrder)];
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

// HS_CONFIG from clean + variationalProxyUrl
const cfgRe = /const HS_CONFIG = \{[\s\S]*?\n\}/;
const cleanCfg = clean.match(cfgRe)[0];
const proxy = (out.match(/variationalProxyUrl:\s*'[^']*',/) || ["variationalProxyUrl: '',"])[0];
const newCfg = cleanCfg.replace(
  /showLeaderboardImport: false,/,
  `showLeaderboardImport: false,\n  ${proxy}`
);
out = out.replace(cfgRe, newCfg);

// Meta description / og tags from clean (first 30 lines area)
function replaceMeta(src, cleanSrc, name) {
  const re = new RegExp(`<meta[^>]+name="${name}"[^>]*>`, 'i');
  const from = cleanSrc.match(re);
  if (from) src = src.replace(re, from[0]);
  return src;
}
function replaceMetaProp(src, cleanSrc, prop) {
  const re = new RegExp(`<meta[^>]+property="${prop}"[^>]*>`, 'i');
  const from = cleanSrc.match(re);
  if (from) src = src.replace(re, from[0]);
  return src;
}
out = replaceMeta(out, clean, 'description');
out = replaceMetaProp(out, clean, 'og:description');
out = replaceMeta(out, clean, 'twitter:description');

// CONFIG comment line
out = out.replace(
  /\/\/ [^\n]*CONFIG[^\n]*/,
  clean.match(/\/\/ [^\n]*CONFIG[^\n]*/)[0]
);

// Fix hardcoded scanner tab labels (no data-i18n on role=tab buttons)
const scannerFixes = [
  [/Scanner march\?/g, 'Scanner marché'],
  [/Scanner le march\?/g, 'Scanner le marché'],
  [/Scan march\?/g, 'Scan marché'],
  [/wallet connect\?/g, 'wallet connecté'],
  [/Chargement\?/g, 'Chargement…'],
  [/Masqu\?/g, 'Masqué'],
  [/P\?riode/g, 'Période'],
  [/p\?riode/g, 'période'],
  [/d\?mo/g, 'démo'],
  [/D\?mo/g, 'Démo'],
  [/donn\?es/g, 'données'],
  [/donn\?e/g, 'donnée'],
  [/march\?s/g, 'marchés'],
  [/march\?/g, 'marché'],
  [/Activit\?/g, 'Activité'],
  [/activit\?/g, 'activité'],
  [/Rafra\?chir/g, 'Rafraîchir'],
  [/Rafra\?chissement/g, 'Rafraîchissement'],
  [/r\?unis/g, 'réunis'],
  [/unifi\?/g, 'unifié'],
  [/d\?ploy/g, 'déploy'],
  [/d\?j\?/g, 'déjà'],
  [/r\?alis\?/g, 'réalisé'],
  [/entr\?e/g, 'entrée'],
  [/stock\?s/g, 'stockés'],
  [/enregistr\?e/g, 'enregistrée'],
  [/effac\?e/g, 'effacée'],
  [/import\?/g, 'importé'],
  [/compar\?/g, 'comparer'],
  [/oppos\?/g, 'opposé'],
  [/D\?rive/g, 'Dérive'],
  [/r\?\?quilibre/g, 'rééquilibre'],
  [/cr\?\?s/g, 'créés'],
  [/cr\?\?/g, 'créé'],
  [/r\?duction/g, 'réduction'],
  [/r\?compens/g, 'récompens'],
  [/d\?p\?ts/g, 'dépôts'],
  [/d\?riv/g, 'dériv'],
  [/assist\?/g, 'assisté'],
  [/prolong\?/g, 'prolongé'],
  [/l\?inscription/g, "l'inscription"],
  [/l\?/g, "l'"],
  [/parrain\?s/g, 'parrainés'],
  [/affich\?s/g, 'affichés'],
  [/masqu\?/g, 'masqué'],
  [/bloqu\?/g, 'bloqué'],
  [/vid\?os/g, 'vidéos'],
  [/s\?mantiques/g, 'sémantiques'],
  [/r\?f\?rence/g, 'référence'],
  [/uni\?\s*:/g, 'unié :'],
  [/chargement unifi\?/g, 'chargement unifié'],
  [/non backtest\?s/g, 'non backtestés'],
  [/\?chantillon/g, 'échantillon'],
  [/d\?pendent/g, 'dépendent'],
  [/s\?lection/g, 'sélection'],
  [/g\?n\?r/g, 'génér'],
  [/pr\?t/g, 'prêt'],
  [/acc\?s/g, 'accès'],
  [/liquidit\?/g, 'liquidité'],
  [/R\?compens/g, 'Récompens'],
  [/M\?j/g, 'Màj'],
  [/ \? /g, ' — '],
  [/ \?$/gm, ''],
];

for (const [re, rep] of scannerFixes) {
  out = out.replace(re, rep);
}

// Don't break URL query params like ?demo=1 or ?ref=
out = out.replace(/avec ''demo=1/g, 'avec ?demo=1');
out = out.replace(/sans ''demo=1/g, 'sans ?demo=1');
out = out.replace(/avec ''demo=0/g, 'avec ?demo=0');
out = out.replace(/''demo=/g, '?demo=');
out = out.replace(/''ref=/g, '?ref=');

fs.writeFileSync(currentPath, out, 'utf8');

const bad = (out.match(/Rafra\?chir|march\?|Activit\?|donn\?e|p\?riode|d\?mo/g) || []).length;
const good = (out.match(/Rafraîchir|marché|Activité/g) || []).length;
console.log('Fixed index.html — bad patterns:', bad, '| good samples:', good);
console.log('btn.load FR:', [...out.matchAll(/'btn\.load': '([^']+)'/g)].pop()?.[1]);
console.log('variational:', out.includes('page-variational'));
