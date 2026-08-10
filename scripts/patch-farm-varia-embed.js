/**
 * Prepare omni/farm-varia.html for Hypersheets embed:
 * - embed chrome (hide brand / page-nav)
 * - hide seed "wallets de référence" from Classement board (keep in samples)
 */
const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'omni', 'farm-varia.html');
let h = fs.readFileSync(p, 'utf8');

const boot = `<!-- hs-fv-embed -->
<script>
(function(){
  try {
    var q = new URLSearchParams(location.search||'');
    if (q.get('embed') === '1' || window.parent !== window) {
      document.documentElement.classList.add('hs-fv-embed');
    }
  } catch (e) {
    document.documentElement.classList.add('hs-fv-embed');
  }
})();
</script>
<style>
  html.hs-fv-embed header,
  html.hs-fv-embed .page-nav,
  html.hs-fv-embed .brand-lockup { display: none !important; }
  html.hs-fv-embed body { background: transparent !important; }
  html.hs-fv-embed .wrap { max-width: none; padding: 8px 4px 24px; }
  html.hs-fv-embed .setup { margin-top: 0; }
</style>
`;

if (!h.includes('hs-fv-embed')) {
  h = h.replace('<head>', '<head>\n' + boot);
}

const old = `const board = [...byRank.values()].sort((a, b) => a.rank - b.rank);

  const samples = [
    ...RB_TIERS.map(t => ({ pts: rbProject(t.base, weeks), rank: t.rank })),
    ...board.map(r => ({ pts: r.pts, rank: r.rank }))
  ];`;

const neu = `const allBoard = [...byRank.values()].sort((a, b) => a.rank - b.rank);
  // Hypersheets: ne pas afficher les wallets de référence (seeds / calages communauté)
  const board = allBoard.filter(r => r.source !== 'seed');

  const samples = [
    ...RB_TIERS.map(t => ({ pts: rbProject(t.base, weeks), rank: t.rank })),
    ...allBoard.map(r => ({ pts: r.pts, rank: r.rank }))
  ];`;

if (!h.includes('allBoard.filter')) {
  if (!h.includes(old)) {
    console.error('rbCollectRows block not found');
    process.exit(1);
  }
  h = h.replace(old, neu);
}

fs.writeFileSync(p, h);
console.log('OK', p, h.length);
