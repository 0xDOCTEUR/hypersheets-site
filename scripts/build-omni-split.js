/**
 * Split Variational Omni into /omni/ and clean the main dashboard.
 * Run from repo root: node scripts/build-omni-split.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const OMNI_DIR = path.join(ROOT, 'omni');
const OMNI_INDEX = path.join(OMNI_DIR, 'index.html');

let html = fs.readFileSync(INDEX, 'utf8');

const VAR_START = '  <!-- ═══════════════════════════════════════════════════════════════ -->\n  <!-- PAGE : VARIATIONAL';
const VAR_END = '  </section>\n\n  <!-- ═══════════════════════════════════════════════════════════════ -->\n  <!-- PAGE : HYPERUNIT';

const varStartIdx = html.indexOf(VAR_START);
const varEndMarker = html.indexOf('  <!-- PAGE : HYPERUNIT');
if (varStartIdx < 0 || varEndMarker < 0) {
  throw new Error('Could not locate Variational / HyperUnit page markers');
}
const varSectionEnd = html.lastIndexOf('</section>', varEndMarker);
if (varSectionEnd < varStartIdx) throw new Error('Variational section end not found');
const afterVarSection = html.indexOf('\n', varSectionEnd) + 1;

const varSection = html.slice(varStartIdx, afterVarSection);
console.log('Variational section bytes:', varSection.length);

// —— Build omni/index.html from current index ——
let omni = html;

function rewriteAssetPaths(s) {
  return s
    .replace(/(src|href)=(")(?!https?:|data:|\/\/|#|mailto:|javascript:)(\.\.\/)?(js\/|img\/|extension\/|leaderboard\.json|omni-bookmark\.html)/g,
      '$1=$2../$4')
    .replace(/url\((['"]?)(?!https?:|data:|\/\/)(\.\.\/)?(img\/)/g, 'url($1../$3');
}

omni = rewriteAssetPaths(omni);

const omniBoot = `
<script>
window.__HS_OMNI_PAGE__ = true;
document.documentElement.classList.add('hs-omni-standalone');
</script>
<style>
  html.hs-omni-standalone body .page:not(#page-variational) { display: none !important; }
  html.hs-omni-standalone body #page-variational.page { display: block !important; }
  html.hs-omni-standalone #filterRow { display: none !important; }
  html.hs-omni-standalone .nav-tab[data-tab]:not([data-tab="variational"]) { opacity: .85; }
</style>
`;

if (omni.includes('<body')) {
  omni = omni.replace(/<body([^>]*)>/, '<body$1>\n' + omniBoot);
} else {
  throw new Error('No <body> in index');
}

const omniRouter = `
<script>
(function () {
  if (!window.__HS_OMNI_PAGE__) return;
  function goHome(page) {
    var q = page ? ('?page=' + encodeURIComponent(page)) : '';
    location.href = '../' + q + (page ? '' : '');
  }
  document.addEventListener('click', function (e) {
    var tab = e.target.closest && e.target.closest('.nav-tab[data-tab], .mob-nav-btn[data-mob]');
    if (!tab) return;
    var name = tab.getAttribute('data-tab') || tab.getAttribute('data-mob');
    if (!name || name === 'variational') return;
    e.preventDefault();
    e.stopPropagation();
    goHome(name === 'analyse' ? 'signals' : name);
  }, true);
  function bootOmni() {
    document.body.classList.remove('hs-welcome-mode');
    document.body.dataset.page = 'variational';
    document.querySelectorAll('.page').forEach(function (p) {
      p.classList.toggle('active', p.id === 'page-variational');
    });
    document.querySelectorAll('.nav-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === 'variational');
    });
    if (typeof initVarPage === 'function') {
      try { initVarPage(false); } catch (err) { console.warn(err); }
    } else if (typeof switchPage === 'function') {
      var el = document.querySelector('.nav-tab[data-tab="variational"]');
      switchPage('variational', el);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(bootOmni, 0); });
  } else {
    setTimeout(bootOmni, 0);
  }
})();
</script>
`;

omni = omni.replace('</body>', omniRouter + '\n</body>');

// Brand / home links on omni page → root
omni = omni.replace(
  /(<a[^>]*class="[^"]*brand[^"]*"[^>]*href=")([^"]*)(")/i,
  '$1../$3'
);

fs.mkdirSync(OMNI_DIR, { recursive: true });
fs.writeFileSync(OMNI_INDEX, omni);
console.log('Wrote', OMNI_INDEX);

// —— Patch main index.html ——
let main = html;

// Remove Variational page section
main = main.slice(0, varStartIdx) + main.slice(afterVarSection);

const sidebarNav = `    <a class="nav-tab" data-tab="variational" href="/omni/" title="Hypersheets Omni">
      <img src="img/variational-logo.png" alt="" width="15" height="15" style="width:15px;height:15px;border-radius:4px;object-fit:cover;flex-shrink:0" decoding="async" />
      <span class="nav-tab-label-wrap">
        <span class="nav-tab-label" data-i18n="tab.variational">Variational</span>
        <span class="nav-beta-badge" data-i18n="tab.variationalBeta" data-i18n-title="tab.variationalBetaHint" title="Beta — indicative data only, not guaranteed.">beta</span>
      </span>
    </a>`;

const topNav = `<a class="nav-tab" data-tab="variational" href="/omni/" style="gap:7px" title="Hypersheets Omni"><img src="img/variational-logo.png" alt="" width="18" height="18" style="width:18px;height:18px;border-radius:4px;object-fit:cover;flex-shrink:0" decoding="async"><span data-i18n="tab.variational">Variational</span><span class="nav-beta-badge" data-i18n="tab.variationalBeta" data-i18n-title="tab.variationalBetaHint" title="Beta — indicative data only, not guaranteed.">beta</span></a>`;

const sidebarRe = /    <span class="nav-tab" data-tab="variational" onclick="if\(typeof switchPage==='function'\)switchPage\('variational',this\)">[\s\S]*?<\/span>\n\n    <div class="sidebar-divider"><\/div>/;
if (!sidebarRe.test(main)) throw new Error('Sidebar variational nav not found');
main = main.replace(sidebarRe, sidebarNav + '\n\n    <div class="sidebar-divider"></div>');

const topRe = /<span class="nav-tab" data-tab="variational" onclick="if\(typeof switchPage==='function'\)switchPage\('variational',this\)"[^>]*>[\s\S]*?<\/span>/;
if (!topRe.test(main)) throw new Error('Top variational nav not found');
main = main.replace(topRe, topNav);

const welcomeRe = /      <!-- Variational -->\n      <div class="welcome-card hs-neon-tile">\n        <div class="welcome-card-icon" style="padding:0;overflow:hidden;background:none;border:none">\n          <img src="img\/variational-logo\.png"[^/]*\/>\n        <\/div>\n        <div class="welcome-card-title" data-i18n="tab\.variational">Variational<\/div>\n        <div class="welcome-card-desc" data-i18n="welcome\.card\.var">[^<]*<\/div>\n      <\/div>/;
if (!welcomeRe.test(main)) {
  console.warn('Welcome variational card pattern not matched — trying loose replace');
  main = main.replace(
    /<!-- Variational -->\s*<div class="welcome-card hs-neon-tile">/,
    '<!-- Variational -->\n      <a class="welcome-card hs-neon-tile" href="/omni/" style="text-decoration:none;color:inherit">'
  );
  // close the next welcome-card after var desc — fragile; do explicit
} else {
  main = main.replace(welcomeRe, (m) =>
    m.replace('<div class="welcome-card hs-neon-tile">', '<a class="welcome-card hs-neon-tile" href="/omni/" style="text-decoration:none;color:inherit">')
      .replace(/<\/div>\s*$/, '</a>')
  );
}

// Fix welcome card closing if we used loose replace
if (main.includes('href="/omni/" style="text-decoration:none;color:inherit">') &&
    !main.match(/href="\/omni\/"[^>]*>[\s\S]*?welcome\.card\.var[\s\S]*?<\/a>/)) {
  main = main.replace(
    /(href="\/omni\/" style="text-decoration:none;color:inherit">[\s\S]*?data-i18n="welcome\.card\.var">[^<]*<\/div>)\s*<\/div>/,
    '$1\n      </a>'
  );
}

// Remove variational scripts from main
main = main.replace(/\n<script src="js\/variational-omni-collector\.js"><\/script>\n<script src="js\/variational-omni\.js\?v=[^"]+"><\/script>/, '\n');

// Legacy #var-* → /omni/
const redirectSnippet = `
<script>
(function hsRedirectVarHashToOmni() {
  try {
    var h = String(location.hash || '');
    var q = new URLSearchParams(location.search || '');
    var page = String(q.get('page') || '').toLowerCase();
    if (page === 'variational' || page === 'omni') {
      location.replace('/omni/' + (h.startsWith('#var-') ? h : ''));
      return;
    }
    if (!h.startsWith('#var-')) return;
    location.replace('/omni/' + h);
  } catch (_) {}
})();
</script>
`;
main = main.replace(/<body([^>]*)>/, '<body$1>\n' + redirectSnippet);

// Soft-guard switchPage if page-variational missing
main = main.replace(
  "document.getElementById('page-' + name).classList.add('active');",
  "const _hsPageEl = document.getElementById('page-' + name);\n  if (!_hsPageEl) {\n    if (name === 'variational') { location.href = '/omni/' + (String(location.hash||'').startsWith('#var-') ? location.hash : ''); return; }\n    return;\n  }\n  _hsPageEl.classList.add('active');"
);

fs.writeFileSync(INDEX, main);
console.log('Patched main index.html');

// —— .htaccess ——
const htaccessPath = path.join(ROOT, '.htaccess');
let ht = fs.readFileSync(htaccessPath, 'utf8');
if (!/RewriteRule \^omni\$/.test(ht)) {
  const next = ht.replace(
    /RewriteEngine On\r?\n(\s*)RewriteCond %\{HTTPS\}/,
    'RewriteEngine On\r\n$1RewriteRule ^omni$ /omni/ [R=301,L]\r\n$1RewriteCond %{HTTPS}'
  );
  if (next === ht) {
    console.warn('.htaccess omni rule not inserted — edit manually');
  } else {
    fs.writeFileSync(htaccessPath, next);
    console.log('Updated .htaccess');
  }
}

// —— Share URLs in variational-omni.js ——
const varJsPath = path.join(ROOT, 'js', 'variational-omni.js');
let varJs = fs.readFileSync(varJsPath, 'utf8');
const before = varJs;
varJs = varJs.replace(/https:\/\/hypersheets\.xyz\/#var-omni-import/g, 'https://hypersheets.xyz/omni/#var-omni-import');
varJs = varJs.replace(
  /https:\/\/twitter\.com\/intent\/tweet\?text=' \+ encodeURIComponent\(text \+ ' https:\/\/hypersheets\.xyz'\)/g,
  "https://twitter.com/intent/tweet?text=' + encodeURIComponent(text + ' https://hypersheets.xyz/omni')"
);
if (varJs !== before) {
  fs.writeFileSync(varJsPath, varJs);
  console.log('Updated variational-omni.js share URLs');
}

console.log('Done.');
