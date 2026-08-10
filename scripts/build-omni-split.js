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
try {
  document.body.classList.remove('hs-welcome-mode');
  document.body.classList.add('hs-omni-only');
  document.body.dataset.page = 'variational';
  sessionStorage.setItem('hs-dash-session-launched', '1');
  localStorage.setItem('hs-dashboard-unlocked', '1');
} catch (_) {}
</script>
<style>
  html.hs-omni-standalone #welcomeScreen,
  html.hs-omni-standalone #sidebar,
  html.hs-omni-standalone #mobileNav,
  html.hs-omni-standalone #navTabs,
  html.hs-omni-standalone #navTabsSig,
  html.hs-omni-standalone #walletsRow,
  html.hs-omni-standalone #filterRow,
  html.hs-omni-standalone #sigWatchBanner,
  html.hs-omni-standalone #supportTopBanner,
  html.hs-omni-standalone #referralBanner,
  html.hs-omni-standalone #hsFooterBar,
  html.hs-omni-standalone #errorBox,
  html.hs-omni-standalone .page:not(#page-variational),
  html.hs-omni-standalone #mainContent > header,
  html.hs-omni-standalone .page-data-credit,
  html.hs-omni-standalone a[href*="0xDOCTEUR"][style*="position:fixed"] {
    display: none !important;
  }
  html.hs-omni-standalone body.hs-welcome-mode #welcomeScreen { display: none !important; }
  html.hs-omni-standalone body.hs-welcome-mode .page { display: none !important; }
  html.hs-omni-standalone body #page-variational.page,
  html.hs-omni-standalone body.hs-welcome-mode #page-variational.page {
    display: block !important;
  }
  html.hs-omni-standalone #appShell { display: block !important; min-height: 100vh; }
  html.hs-omni-standalone #mainContent {
    margin-left: 0 !important; width: 100% !important; max-width: 100% !important; padding-top: 0 !important;
  }
  html.hs-omni-standalone #hsOmniTopbar {
    display: flex !important; align-items: center; gap: 16px; padding: 14px 20px;
    border-bottom: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.25);
    position: sticky; top: 0; z-index: 40;
  }
  html.hs-omni-standalone #hsOmniTopbar .hs-omni-back {
    color: inherit; text-decoration: none; opacity: .72; font-size: 13px; white-space: nowrap;
  }
  html.hs-omni-standalone #hsOmniTopbar .hs-omni-back:hover { opacity: 1; }
  html.hs-omni-standalone #hsOmniTopbar .hs-omni-brand {
    display: inline-flex; align-items: center; gap: 12px; min-width: 0;
  }
  html.hs-omni-standalone #hsOmniTopbar .hs-omni-brand-logo {
    width: 44px; height: 44px; border-radius: 12px; object-fit: cover; object-position: center top;
    flex-shrink: 0; display: block; background: #fff; border: 0; outline: none; box-shadow: none;
  }
  html.hs-omni-standalone #hsOmniTopbar .hs-omni-wordmark {
    font-family: 'Raleway', system-ui, sans-serif;
    font-size: clamp(1.15rem, 2.2vw, 1.55rem);
    font-weight: 400; letter-spacing: 0; line-height: 1; white-space: nowrap; color: #fff;
  }
  html.hs-omni-standalone #hsOmniTopbar .hs-omni-wordmark .hs-brand-hyper { font-style: normal; font-weight: 600; color: #fff; }
  html.hs-omni-standalone #hsOmniTopbar .hs-omni-wordmark .hs-brand-sheets { font-style: italic; font-weight: 500; color: #fff; }
  html.hs-omni-standalone #hsOmniTopbar .hs-omni-wordmark .hs-brand-omni {
    font-style: normal; font-weight: 600; color: #4c9af8; margin-left: 0.28em;
  }
  html.hs-omni-standalone #hsOmniTopbar .nav-beta-badge { margin-left: 2px; }
  html.hs-omni-standalone #page-variational > .section-h { display: none !important; }
</style>
`;

if (omni.includes('<body')) {
  omni = omni.replace(/<body([^>]*)class="([^"]*)"/, function (m, attrs, cls) {
    var cleaned = cls.split(/\s+/).filter(Boolean).filter(function (c) { return c !== 'hs-welcome-mode'; }).concat(['hs-omni-only']).filter(function (c, i, a) { return a.indexOf(c) === i; }).join(' ');
    return '<body' + attrs + 'class="' + cleaned + '"';
  });
  omni = omni.replace(/data-page="[^"]*"/, 'data-page="variational"');
  omni = omni.replace(/<body([^>]*)>/, '<body$1>\n' + omniBoot);
} else {
  throw new Error('No <body> in index');
}

const omniRouter = `
<script>
(function () {
  if (!window.__HS_OMNI_PAGE__) return;
  function ensureTopbar() {
    if (document.getElementById('hsOmniTopbar')) return;
    var bar = document.createElement('div');
    bar.id = 'hsOmniTopbar';
    bar.innerHTML = '<a class="hs-omni-back" href="/">← Hypersheets</a>'
      + '<span class="hs-omni-brand">'
      + '<img class="hs-omni-brand-logo" src="../img/hypersheets-omni-mascot.png" alt="" width="44" height="44" decoding="async">'
      + '<span class="hs-brand-wordmark hs-omni-wordmark" aria-label="Hypersheets Omni">'
      + '<span class="hs-brand-hyper">Hyper</span><span class="hs-brand-sheets">sheets</span><span class="hs-brand-omni">Omni</span>'
      + '</span>'
      + '<span class="nav-beta-badge">beta</span>'
      + '</span>';
    var main = document.getElementById('mainContent') || document.getElementById('appShell') || document.body;
    main.insertBefore(bar, main.firstChild);
  }
  function goHome(page) {
    var q = page ? ('?page=' + encodeURIComponent(page)) : '';
    location.href = '../' + q;
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
    document.body.classList.add('hs-omni-only');
    document.body.dataset.page = 'variational';
    try {
      sessionStorage.setItem('hs-dash-session-launched', '1');
      localStorage.setItem('hs-dashboard-unlocked', '1');
    } catch (_) {}
    var welcome = document.getElementById('welcomeScreen');
    if (welcome) welcome.style.display = 'none';
    ensureTopbar();
    var kill=["welcomeScreen","sidebar","mobileNav","navTabs","navTabsSig","walletsRow","filterRow","sigWatchBanner","supportTopBanner","referralBanner","hsFooterBar"];
    kill.forEach(function(id){ var n=document.getElementById(id); if(n) n.remove(); });
    document.querySelectorAll(".page").forEach(function(pg){ if(pg.id!=="page-variational") pg.remove(); });
    var hdr=document.querySelector("#mainContent > header"); if(hdr) hdr.remove();
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
  window.addEventListener('load', function () { setTimeout(bootOmni, 50); });
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
