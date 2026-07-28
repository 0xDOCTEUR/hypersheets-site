/**
 * In-page FAB / overlay removed — side panel + detached window only.
 * This script only strips leftover DOM from older extension builds.
 */
(function () {
  const ROOT_ID = 'hs-dn-widget-root';

  function strip() {
    try {
      document.getElementById(ROOT_ID)?.remove();
      document.querySelectorAll('[data-hs-widget="1"]').forEach((el) => el.remove());
    } catch (_) {}
  }

  strip();
  try {
    const mo = new MutationObserver(strip);
    const root = document.documentElement || document.body;
    if (root) mo.observe(root, { childList: true, subtree: true });
    [0, 400, 1500, 4000].forEach((ms) => setTimeout(strip, ms));
    setTimeout(() => {
      try { mo.disconnect(); } catch (_) {}
      strip();
    }, 12000);
  } catch (_) {}
})();
