/**
 * Hypersheets — Omni collector bookmarklet loader (short).
 * Placeholders replaced at runtime by variational-omni.js:
 *   __HS_BRAND_LOGO__  — brand icon URL
 *   __HS_APP_URL__     — Hypersheets URL that receives the export
 *   __HS_SCRIPT_URL__  — URL of variational-omni-collector-run.js
 * Must be clicked on omni.variational.io while logged in.
 */
window.HS_VAR_COLLECTOR_SRC =
  "javascript:void(function(){" +
  "if(!location.hostname.endsWith('variational.io')){" +
  "alert('Wrong tab — open Omni (omni.variational.io), stay on that tab, then click this bookmark.');" +
  "return;" +
  "}" +
  "window.__HS_OMNI_COLLECTOR__={appUrl:\"__HS_APP_URL__\",logo:\"__HS_BRAND_LOGO__\"};" +
  "var s=document.createElement('script');" +
  "s.src=\"__HS_SCRIPT_URL__\";" +
  "s.async=true;" +
  "s.onerror=function(){alert('Hypersheets: could not load the collector script. Use HTTPS Hypersheets or copy the code from the setup page.');};" +
  "document.documentElement.appendChild(s);" +
  "})();";
