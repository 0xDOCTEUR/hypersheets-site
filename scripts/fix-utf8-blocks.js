const fs = require('fs');
const clean = fs.readFileSync(require('path').join(__dirname, '../index-signals-tabs-preview.html'), 'utf8');
let out = fs.readFileSync(require('path').join(__dirname, '../index.html'), 'utf8');

function swapBlock(src, ref, start, endInclusive) {
  const a = ref.indexOf(start);
  const b = ref.indexOf(endInclusive, a);
  if (a < 0 || b < 0) return { src, ok: false };
  const chunk = ref.slice(a, b + endInclusive.length);
  const sa = src.indexOf(start);
  const sb = src.indexOf(endInclusive, sa);
  if (sa < 0 || sb < 0) return { src, ok: false };
  return { src: src.slice(0, sa) + chunk + src.slice(sb + endInclusive.length), ok: true };
}

let r;
r = swapBlock(
  out,
  clean,
  "    volume: { fr: 'Activité des échanges",
  "    oi: { fr: 'Positions ouvertes sur le marché dérivé.', en: 'Open positions in the derivatives market.' },"
);
out = r.src;
console.log('volume block', r.ok);

r = swapBlock(
  out,
  clean,
  '  const interp = {',
  '    funding_warn:    isFr ? " Attention: funding très élevé, risque de long squeeze."\n                          : " Warning: very high funding rate, long squeeze risk.",'
);
out = r.src;
console.log('interp block', r.ok);

r = swapBlock(
  out,
  clean,
  "  setText('lastUpdate','Mode démo",
  "  document.getElementById('appShell').insertBefore(banner, document.getElementById('navTabs'))"
);
out = r.src;
console.log('demo banner', r.ok);

const fixes = [
  ["'demo.loaded': 'Donn?es d?mo charg?es'", "'demo.loaded': 'Données démo chargées'"],
  ["'demo.noRemove': 'Le wallet d?mo ne peut pas ?tre retir? en mode d?mo'", "'demo.noRemove': 'Le wallet démo ne peut pas être retiré en mode démo'"],
  ["'demo.noAdd': 'Mode d?mo : ouvre sans ?demo=1 pour ajouter ton wallet'", "'demo.noAdd': 'Mode démo : ouvre sans ?demo=1 pour ajouter ton wallet'"],
  ["'demo.banner': 'Mode d?mo ? donn?es fictives pour tes vid?os. Tes vrais wallets sont masqu?s. Quitter : ?demo=0'", "'demo.banner': 'Mode démo — données fictives pour tes vidéos. Tes vrais wallets sont masqués. Quitter : ?demo=0'"],
  ["'demo.banner': 'Demo mode ? fictional data for recordings. Your real wallets are hidden. Exit with ?demo=0'", "'demo.banner': 'Demo mode — fictional data for recordings. Your real wallets are hidden. Exit with ?demo=0'"],
  ["march? HIP-3 Trade XYZ", 'marché HIP-3 Trade XYZ'],
  ["?'Aucun signal trouv? ? donn?es insuffisantes.'", "?'Aucun signal trouvé — données insuffisantes.'"],
  ["+label+' ? donn?es insuffisantes.'", "+label+' — données insuffisantes.'"],
  ["?'Aucune donn?e de march? disponible pour cet actif.'", "?'Aucune donnée de marché disponible pour cet actif.'"],
  ['Ce march? HIP-3 est peut-?tre illiquide, r?cemment list?, ou non encore actif', 'Ce marché HIP-3 est peut-être illiquide, récemment listé, ou non encore actif'],
  ["isFr?'Donn?es de march?':'Market data'} ?", "isFr?'Données de marché':'Market data'} —"],
];
for (const [a, b] of fixes) out = out.split(a).join(b);

fs.writeFileSync(require('path').join(__dirname, '../index.html'), out, 'utf8');
const bad = (out.match(/Rafra\?chir|march\?|Activit\?|donn\?e|p\?riode|d\?mo/g) || []).length;
console.log('remaining bad', bad);
console.log('ternary broken', (out.match(/function' —/g) || []).length);
