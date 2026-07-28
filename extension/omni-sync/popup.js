const LANG_KEY = 'hsWidgetLang';
const POPUP_I18N = {
  fr: {
    popupLead: "Clique l’icone pour ouvrir le panel Positions / Collecte.",
    openWindow: "Ouvrir la fenetre",
    refOmni: "Referral Omni",
    refHl: "Referral Hyperliquid",
    popupHint: "Recharge l’extension apres mise a jour pour voir Omni Live.",
    openHypersheets: "Ouvrir Hypersheets",
  },
  en: {
    popupLead: "Click the icon to open the Positions / Collect panel.",
    openWindow: "Open window",
    refOmni: "Omni referral",
    refHl: "Hyperliquid referral",
    popupHint: "Reload the extension after updating to see Omni Live.",
    openHypersheets: "Open Hypersheets",
  },
};

function applyLang(lang) {
  const dict = POPUP_I18N[lang] || POPUP_I18N.fr;
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] != null) el.textContent = dict[key];
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (dict[key] != null) el.title = dict[key];
  });
  document.querySelectorAll('#langSwitch button[data-lang]').forEach((btn) => {
    btn.classList.toggle('is-on', btn.getAttribute('data-lang') === lang);
  });
}

try {
  chrome.storage.local.get([LANG_KEY], (res) => {
    applyLang(res && res[LANG_KEY] === 'en' ? 'en' : 'fr');
  });
} catch (_) {
  applyLang('fr');
}

document.getElementById('langSwitch')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-lang]');
  if (!btn) return;
  const lang = btn.getAttribute('data-lang') === 'en' ? 'en' : 'fr';
  applyLang(lang);
  try {
    chrome.storage.local.set({ [LANG_KEY]: lang });
  } catch (_) {}
});

document.getElementById('openWin')?.addEventListener('click', () => {
  try {
    chrome.runtime.sendMessage({ type: 'HS_WIDGET_SHOW' }, () => void chrome.runtime.lastError);
  } catch (_) {}
});
