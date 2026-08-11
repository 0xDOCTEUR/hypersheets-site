(function () {
  "use strict";

  var ORDER_KEY = "hsWidgetPairOrder";
  var PAGE_KEY = "hsWidgetPage";
  var COLLAPSE_KEY = "hsWidgetLegCollapse";
  var VOL_KEY = "hsWidgetVolumePrefs";
  var LANG_KEY = "hsWidgetLang";
  var ALERT_KEY = "hsWidgetPnlAlert";
  var MAX_LEGS = 10;

  var summary = document.getElementById("summary");
  var volSection = document.getElementById("volSection");
  var volSourceEl = document.getElementById("volSource");
  var volSlotEl = document.getElementById("volSlot");
  var volPeriodEl = document.getElementById("volPeriod");
  var volValueEl = document.getElementById("volValue");
  var volMetaEl = document.getElementById("volMeta");
  var alertCard = document.getElementById("alertCard");
  var alertFoldEl = document.getElementById("alertFold");
  var alertEnabledEl = document.getElementById("alertEnabled");
  var alertScopeEl = document.getElementById("alertScope");
  var alertDirectionEl = document.getElementById("alertDirection");
  var alertThresholdEl = document.getElementById("alertThreshold");
  var alertSoundEl = document.getElementById("alertSound");
  var alertHlMissingEl = document.getElementById("alertHlMissing");
  var alertPositionsEl = document.getElementById("alertPositions");
  var alertReminderSectionEl = document.getElementById("alertReminderSection");
  var alertReminderFoldEl = document.getElementById("alertReminderFold");
  var alertRemindersEl = document.getElementById("alertReminders");
  var alertAddReminderEl = document.getElementById("alertAddReminder");
  var alertRedundancyEnabledEl = document.getElementById("alertRedundancyEnabled");
  var alertRedundancyEveryEl = document.getElementById("alertRedundancyEvery");
  var alertRedundancyMinusEl = document.getElementById("alertRedundancyMinus");
  var alertRedundancyPlusEl = document.getElementById("alertRedundancyPlus");
  var alertRedundancyTitleInputEl = document.getElementById("alertRedundancyTitleInput");
  var posScroll = document.getElementById("posScroll");
  var foot = document.getElementById("foot");
  var walletsList = document.getElementById("walletsList");
  var walletInput = document.getElementById("walletInput");
  var activePositionRename = document.getElementById("activePositionRename");
  var activeRenameRow = document.getElementById("activeRenameRow");
  var walletHint = document.getElementById("walletHint");
  var legsList = document.getElementById("legsList");
  var collectBtn = document.getElementById("collectOmni");
  var collectLabel = document.getElementById("collectLabel");
  var collectStatus = document.getElementById("collectStatus");
  var collectProgress = document.getElementById("collectProgress");
  var dropZone = document.getElementById("dropZone");
  var dropFile = document.getElementById("dropFile");
  var dropHint = document.getElementById("dropHint");
  var toastEl = document.getElementById("toast");
  var syncHsBtn = document.getElementById("syncHs");
  var syncHsStatus = document.getElementById("syncHsStatus");

  var pairOrder = [];
  var collapsedLegs = {};
  var lastSnap = null;
  var accountsState = null;
  var collectBusy = false;
  var toastTimer = null;
  var currentLang = "fr";
  var volSource = "omni";
  var volPeriod = "epoch";
  var volSlotBySource = { omni: "all", hl: "all", xyz: "all" };
  var volReqId = 0;
  var volLegs = [];
  var alertPrefs = {
    enabled: false,
    scope: "total",
    direction: "above",
    threshold: 100,
    sound: "beep",
    hlMissing: false,
    collapsed: true,
    positions: {},
    reminders: [],
    remindersCollapsed: true,
    redundancy: { enabled: false, everyHours: 1, title: "" },
  };

  function getVolSlot() {
    return volSlotBySource[volSource] || "all";
  }

  function setVolSlot(id) {
    volSlotBySource[volSource] = id || "all";
  }

  var VOL_PERIODS_OMNI = [
    { id: "epoch", label: "Epoch" },
    { id: "1d", label: "1D" },
    { id: "7d", label: "7D" },
    { id: "mtd", label: "MTD" },
    { id: "ytd", label: "YTD" },
    { id: "all", label: "All" },
  ];
  var VOL_PERIODS_HL = [
    { id: "1d", label: "1D" },
    { id: "7d", label: "7D" },
    { id: "30d", label: "30D" },
    { id: "ytd", label: "YTD" },
    { id: "all", label: "All" },
  ];

  var I18N = {
    fr: {
      popoutTitle: "Fenetre libre",
      tabPositions: "Positions",
      tabCollect: "Collecte",
      volumeTitle: "Volume",
      stepWalletTitle: "Wallet Hyperliquid",
      stepWalletHelp: "Adresse EVM pour charger les hedges HL / XYZ.",
      addWallet: "Ajouter",
      stepCollectTitle: "Collecter Omni",
      collectStep1Before: "Connecte-toi à ton wallet Omni sur",
      collectStep1After: ".",
      collectStep2: "",
      collectStep3: "",
      collectStep4: "",
      omniAddrLabel: "Omni",
      marketsOpenLabel: "Ouvert",
      collectDupWarn: "Attention: meme wallet Omni deja sur « {label} »",
      collectedInto: "dans « {label} »",
      positionNameLabel: "Nom de la position (optionnel)",
      positionNamePlaceholder: "Ex. Farm A, Hedge BTC…",
      collectOmni: "Collecter Omni",
      collectFileNamePrompt: "Nom du fichier JSON (vide = auto: suffixe wallet / trades / points)",
      collectFileNameCancel: "Collecte annulee",
      dropTitle: "Deposer JSON / CSV (par compte)",
      dropHintDefault: "ajoute des CSV a la biblio · menu deroulant pour lier a chaque position",
      stepSyncTitle: "Envoyer vers Hypersheets",
      stepSyncHelp: "Pousse tes trades + points + positions vers le Dashboard Omni sur Hypersheets (garde l’onglet Hypersheets ouvert).",
      syncButton: "Synchroniser",
      legsTitle: "Positions",
      addLeg: "+ Position",
      refreshHlTitle: "Rafraichir HL",
      footCollect: "1 wallet · 2 collect",
      footPositions: "Positions · HL + delta-neutre",
      footUpdated: "MAJ",
      footPairs: "paires",
      long: "Long",
      short: "Short",
      omniLeg: "Jambe Omni",
      omniCsvLeg: "Jambe / CSV Omni",
      walletXyz: "Wallet XYZ",
      walletHl: "Wallet HL",
      walletWord: "Wallet",
      trades: "trades",
      fills: "fills",
      loading: "Chargement…",
      volumeError: "Erreur volume",
      volHintCollectOmni: "Collecte Omni d'abord",
      volHintAddWallet: "Ajoute un wallet HL",
      partial: "partiel",
      extensionInactive: "Extension inactive",
      all: "All",
      noHedge: "pas de hedge",
      conflict: "Meme hedge lie a plusieurs jambes",
      emptyStepsTitle: "3 etapes",
      emptyStepsBody: "1. Collecte -> ajoute un wallet HL<br/>2. Collecter Omni (sync Hypersheets auto)",
      pnlTotal: "PNL TOTAL",
      open: "Ouvrir",
      collapse: "Replier",
      rename: "Renommer",
      clearLeg: "Vider la jambe",
      removeLeg: "Supprimer la jambe",
      clear: "Vider",
      removeShort: "Suppr.",
      emptyLeg: "Jambe vide — importe Omni dans Collecte",
      noPosition: "Aucune position.<br/>Ouvre <strong>Collecte</strong> pour ajouter un wallet.",
      hlBookTitle: "Ouvertes HL / Trade XYZ",
      hlBookSub: "Choisis le hedge dans le menu de chaque jambe Omni",
      hlPaired: "lié",
      hlFree: "libre",
      hlBookEmpty: "Aucune position HL / XYZ — ajoute un wallet et rafraîchis",
      hlUnpairedHint: "{n} libre(s) à appairer",
      targetArrow: "→ ",
      toActiveLeg: "vers « {label} »",
      walletsCount: "{count} wallet(s)",
      chooseHlWallet: "Choisir wallet HL",
      chooseCsv: "Choisir CSV Omni",
      joinCsv: "Ajouter CSV",
      csvJoined: "CSV ajoutes",
      csvNone: "Aucun CSV — ajoute un fichier",
      csvSources: "Fichiers CSV",
      csvMergeOk: "CSV ajoute a la bibliotheque",
      csvLinked: "CSV lie",
      replaceCsv: "Remplacer",
      csvCount: "{n} CSV",
      active: "actif",
      target: "cible",
      empty: "vide",
      targetBtn: "Cible",
      csv: "CSV",
      remove: "Supprimer",
      positionPlaceholder: "Position",
      invalidAddress: "Adresse invalide",
      walletAdded: "Wallet ajoute · positions chargees",
      confirmRemoveOmniLeg: "Supprimer cette jambe Omni ?",
      confirmClearOmniLeg: "Vider cette jambe Omni (donnees + paires) ?",
      collectPartialWarn: "Collecte OK (transfers Omni indisponibles)",
      collecting: "Collecte…",
      readingOmni: "Lecture session Omni…",
      failure: "Echec",
      collectFailed: "Collecte echouee",
      newLeg: "nouvelle jambe",
      collectedOk: "Collecte OK",
      collectedDone: "Collecte ✓",
      importProgress: "Import…",
      unrecognizedFile: "Fichier non reconnu",
      ok: "OK",
      syncSending: "Envoi vers Hypersheets…",
      syncFailed: "Echec sync Hypersheets",
      synced: "Donnees poussees vers Hypersheets",
      epochs: "epochs",
      tabsCount: "onglet(s) HS",
      auto: "Auto",
      none: "Aucun",
      clickTargetLeg: "Cliquer pour cibler cette jambe",
      removeWallet: "Retirer",
      allTime: "All",
      alertTitle: "Alerte PnL",
      alertEnabled: "Active",
      alertScope: "Portee",
      alertScopeTotal: "PnL total",
      alertScopePosition: "PnL position",
      alertDirection: "Condition",
      alertDirectionAbove: "Au-dessus de",
      alertDirectionBelow: "En-dessous de",
      alertThreshold: "Seuil USD",
      alertSound: "Son",
      alertSoundNone: "Aucun",
      alertSoundBeep: "Beep",
      alertSoundDouble: "Double beep",
      alertSoundPing: "Ping",
      alertHlMissing: "Alerte si une position HL disparait",
      alertMonitorTitle: "Surveillance",
      alertPositionsTitle: "Alertes par position",
      alertPositionsEmpty: "Ajoute ou collecte une position pour definir une alerte dediee.",
      alertReminderSectionTitle: "Rappels",
      alertRemindersTitle: "Rappels quotidiens",
      alertRedundancyTitle: "Redondance rappel",
      alertRedundancyInterval: "Intervalle",
      alertRemindersEmpty: "Aucun rappel configure.",
      alertReminderAdd: "+ Rappel",
      alertReminderTime: "Heure",
      alertReminderHour: "Heure",
      alertReminderMinute: "Minute",
      alertReminderTitle: "Titre",
      alertReminderPosition: "Position optionnelle",
      alertReminderRemove: "Supprimer",
      alertTestSound: "Tester",
      alertReminderActive: "Rappel actif",
      alertNote: "Notification bureau unique quand le seuil est franchi. L'alerte se rearme quand le PnL repasse de l'autre cote.",
      alertSaved: "Alerte PnL mise a jour",
    },
    en: {
      popoutTitle: "Free window",
      tabPositions: "Positions",
      tabCollect: "Collect",
      volumeTitle: "Volume",
      stepWalletTitle: "Hyperliquid wallet",
      stepWalletHelp: "EVM address used to load HL / XYZ hedges.",
      addWallet: "Add",
      stepCollectTitle: "Collect Omni",
      collectStep1Before: "Connect to your Omni wallet on",
      collectStep1After: ".",
      collectStep2: "",
      collectStep3: "",
      collectStep4: "",
      omniAddrLabel: "Omni",
      marketsOpenLabel: "Open",
      collectDupWarn: "Warning: same Omni wallet already on \"{label}\"",
      collectedInto: "into \"{label}\"",
      positionNameLabel: "Position name (optional)",
      positionNamePlaceholder: "e.g. Farm A, BTC hedge…",
      collectOmni: "Collect Omni",
      collectFileNamePrompt: "JSON file name (blank = auto: wallet suffix / trades / points)",
      collectFileNameCancel: "Collection cancelled",
      dropTitle: "Drop JSON / CSV (per account)",
      dropHintDefault: "add CSVs to the library · dropdown to link one per position",
      stepSyncTitle: "Send to Hypersheets",
      stepSyncHelp: "Push your trades + points + positions to the Omni Dashboard on Hypersheets (keep the Hypersheets tab open).",
      syncButton: "Sync",
      legsTitle: "Positions",
      addLeg: "+ Position",
      refreshHlTitle: "Refresh HL",
      footCollect: "1 wallet · 2 collect",
      footPositions: "Positions · HL + delta-neutral",
      footUpdated: "Upd",
      footPairs: "pairs",
      long: "Long",
      short: "Short",
      omniLeg: "Omni leg",
      omniCsvLeg: "Omni leg / CSV",
      walletXyz: "XYZ wallet",
      walletHl: "HL wallet",
      walletWord: "Wallet",
      trades: "trades",
      fills: "fills",
      loading: "Loading…",
      volumeError: "Volume error",
      volHintCollectOmni: "Collect Omni first",
      volHintAddWallet: "Add an HL wallet",
      partial: "partial",
      extensionInactive: "Extension inactive",
      all: "All",
      noHedge: "no hedge",
      conflict: "Same hedge linked to multiple legs",
      emptyStepsTitle: "3 steps",
      emptyStepsBody: "1. Collect -> add an HL wallet<br/>2. Collect Omni (Hypersheets sync is automatic)",
      pnlTotal: "TOTAL PNL",
      open: "Open",
      collapse: "Collapse",
      rename: "Rename",
      clearLeg: "Clear leg",
      removeLeg: "Remove leg",
      clear: "Clear",
      removeShort: "Remove",
      emptyLeg: "Empty leg — import Omni in Collect",
      noPosition: "No position.<br/>Open <strong>Collect</strong> to add a wallet.",
      hlBookTitle: "Open HL / Trade XYZ",
      hlBookSub: "Pick the hedge in each Omni leg dropdown",
      hlPaired: "linked",
      hlFree: "free",
      hlBookEmpty: "No HL / XYZ position — add a wallet and refresh",
      hlUnpairedHint: "{n} free to pair",
      targetArrow: "→ ",
      toActiveLeg: "to \"{label}\"",
      walletsCount: "{count} wallet(s)",
      chooseHlWallet: "Choose HL wallet",
      chooseCsv: "Choose Omni CSV",
      joinCsv: "Add CSV",
      csvJoined: "CSVs added",
      csvNone: "No CSV — add a file",
      csvSources: "CSV files",
      csvMergeOk: "CSV added to library",
      csvLinked: "CSV linked",
      replaceCsv: "Replace",
      csvCount: "{n} CSV",
      active: "active",
      target: "target",
      empty: "empty",
      targetBtn: "Target",
      csv: "CSV",
      remove: "Remove",
      positionPlaceholder: "Position",
      invalidAddress: "Invalid address",
      walletAdded: "Wallet added · positions loaded",
      confirmRemoveOmniLeg: "Remove this Omni leg?",
      confirmClearOmniLeg: "Clear this Omni leg (data + pairings)?",
      collectPartialWarn: "Collected OK (Omni transfers unavailable)",
      collecting: "Collecting…",
      readingOmni: "Reading Omni session…",
      failure: "Failed",
      collectFailed: "Collection failed",
      newLeg: "new leg",
      collectedOk: "Collection OK",
      collectedDone: "Collected ✓",
      importProgress: "Import…",
      unrecognizedFile: "Unrecognized file",
      ok: "OK",
      syncSending: "Pushing to Hypersheets…",
      syncFailed: "Hypersheets sync failed",
      synced: "Data pushed to Hypersheets",
      epochs: "epochs",
      tabsCount: "HS tab(s)",
      auto: "Auto",
      none: "None",
      clickTargetLeg: "Click to target this leg",
      removeWallet: "Remove",
      allTime: "All",
      alertTitle: "PnL alert",
      alertEnabled: "Enabled",
      alertScope: "Scope",
      alertScopeTotal: "Total PnL",
      alertScopePosition: "Position PnL",
      alertDirection: "Condition",
      alertDirectionAbove: "Above",
      alertDirectionBelow: "Below",
      alertThreshold: "USD threshold",
      alertSound: "Sound",
      alertSoundNone: "None",
      alertSoundBeep: "Beep",
      alertSoundDouble: "Double beep",
      alertSoundPing: "Ping",
      alertHlMissing: "Alert when an HL position disappears",
      alertMonitorTitle: "Monitoring",
      alertPositionsTitle: "Per-position alerts",
      alertPositionsEmpty: "Add or collect a position to configure a dedicated alert.",
      alertReminderSectionTitle: "Reminders",
      alertRemindersTitle: "Daily reminders",
      alertRedundancyTitle: "Reminder redundancy",
      alertRedundancyInterval: "Interval",
      alertRemindersEmpty: "No reminder configured yet.",
      alertReminderAdd: "+ Reminder",
      alertReminderTime: "Time",
      alertReminderHour: "Hour",
      alertReminderMinute: "Minute",
      alertReminderTitle: "Title",
      alertReminderPosition: "Optional position",
      alertReminderRemove: "Remove",
      alertTestSound: "Test",
      alertReminderActive: "Reminder active",
      alertNote: "One desktop notification when the threshold is crossed. The alert rearms once PnL moves back across the line.",
      alertSaved: "PnL alert updated",
    },
  };

  function t(key, vars) {
    var dict = I18N[currentLang] || I18N.fr;
    var str = dict[key] != null ? dict[key] : (I18N.fr[key] != null ? I18N.fr[key] : key);
    if (!vars) return str;
    return String(str).replace(/\{(\w+)\}/g, function (_, name) {
      return vars[name] != null ? String(vars[name]) : "";
    });
  }

  function applyStaticI18n() {
    document.documentElement.lang = currentLang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-title");
      if (key) el.title = t(key);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (key) el.placeholder = t(key);
    });
    if (walletInput) walletInput.placeholder = "0x…";
  }

  function desiredPositionLabel() {
    var raw = activePositionRename ? activePositionRename.value.trim() : "";
    return raw ? raw.slice(0, 32) : "";
  }

  function setLang(next) {
    currentLang = next === "en" ? "en" : "fr";
    applyStaticI18n();
    document.querySelectorAll("#langSwitch button[data-lang]").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-lang") === currentLang);
    });
    renderVolSource();
    renderVolPeriodPills();
    renderAlertPrefs();
    if (lastSnap) renderPositions(lastSnap);
    if (accountsState) renderCollecte(accountsState);
    else updateHints();
    try { chrome.storage.local.set({ [LANG_KEY]: currentLang }); } catch (_) {}
  }

  function fmtUsd(n, signed) {
    var v = Number(n);
    if (!isFinite(v)) return "—";
    var sign = v > 0 && signed ? "+" : v < 0 ? "-" : "";
    var a = Math.abs(v);
    var s;
    if (a >= 1e6) s = "$" + (a / 1e6).toFixed(2) + "M";
    else if (a >= 1e3) s = "$" + (a / 1e3).toFixed(1) + "K";
    else s = "$" + a.toFixed(2);
    return sign + s;
  }

  function fmtQty(n) {
    var v = Number(n);
    if (!isFinite(v)) return "—";
    if (Math.abs(v) >= 1000) return (Math.round(v * 10) / 10).toString();
    if (Math.abs(v) >= 100) return v.toFixed(1);
    if (Math.abs(v) >= 1) return v.toFixed(2).replace(/\.00$/, "");
    return v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  }

  function fmtLev(n) {
    var v = Number(n);
    if (!(v > 0)) return "";
    return (Math.round(v * 10) / 10).toString().replace(/\.0$/, "") + "x";
  }

  function fmtAge(ts) {
    var n = Number(ts);
    if (!(n > 0)) return "";
    var sec = Math.max(0, Math.floor((Date.now() - n) / 1000));
    var d = Math.floor(sec / 86400);
    var h = Math.floor((sec % 86400) / 3600);
    var m = Math.floor((sec % 3600) / 60);
    if (d > 0) return d + "d " + h + "h";
    if (h > 0) return h + "h " + m + "m";
    return m + "m";
  }

  function hedgeMatchBadge(p) {
    var omni = Math.abs(Number(p.omniNotional) || 0);
    var hl = Math.abs(Number(p.hlNotional) || 0);
    if (!(omni > 0) || !(hl > 0)) return "";
    var delta = Math.abs(Number(p.deltaNotional != null ? p.deltaNotional : p.deltaUsd) || 0);
    var ref = Math.max(omni, hl, 1);
    var match = Math.max(0, Math.min(100, 100 - (delta / ref) * 100));
    var tone = match >= 92 ? "ok" : match >= 75 ? "warn" : "bad";
    return '<div class="match-pill ' + tone + '">Match ' + Math.round(match) + '%</div>';
  }

  function pnlClass(n) {
    if (!(n > 0) && !(n < 0)) return "muted";
    return n > 0 ? "pos" : "neg";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* Avoid Chromium NotFoundError when innerHTML runs during select blur/change. */
  function safeSetInnerHTML(el, html) {
    if (!el) return;
    var apply = function () {
      try {
        while (el.firstChild) el.removeChild(el.firstChild);
        if (html) el.insertAdjacentHTML("beforeend", html);
      } catch (_) {
        setTimeout(function () {
          try {
            while (el.firstChild) el.removeChild(el.firstChild);
            if (html) el.insertAdjacentHTML("beforeend", html);
          } catch (_) {}
        }, 0);
      }
    };
    var active = document.activeElement;
    if (
      active &&
      el.contains(active) &&
      (active.tagName === "SELECT" ||
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "BUTTON")
    ) {
      setTimeout(apply, 0);
      return;
    }
    apply();
  }

  function focusInside(el) {
    var active = document.activeElement;
    return !!(el && active && el.contains(active));
  }

  function editingFocusBlocksPositions() {
    var active = document.activeElement;
    if (!active) return false;
    var tag = active.tagName;
    if (tag !== "SELECT" && tag !== "INPUT" && tag !== "TEXTAREA") return false;
    return focusInside(posScroll) || focusInside(alertCard) || focusInside(alertReminderSectionEl);
  }

  function shortAddr(w) {
    if (!w || w.length < 10) return w || "";
    return w.slice(0, 6) + "…" + w.slice(-4);
  }

  function sidePill(side) {
    var short = side === "short";
    return '<span class="pill ' + (short ? "s" : "l") + '">' + (short ? t("short") : t("long")) + "</span>";
  }

  function volPeriodsFor(src) {
    return src === "omni" ? VOL_PERIODS_OMNI : VOL_PERIODS_HL;
  }

  function normalizeVolPeriod(src, period) {
    var list = volPeriodsFor(src);
    var ids = list.map(function (p) { return p.id; });
    if (ids.indexOf(period) >= 0) return period;
    return list[0].id;
  }

  function persistVolPrefs() {
    try {
      chrome.storage.local.set({
        [VOL_KEY]: {
          source: volSource,
          period: volPeriod,
          slotBySource: volSlotBySource,
        },
      });
    } catch (_) {}
  }

  function normalizeAlertPrefs(raw) {
    var next = raw && typeof raw === "object" ? raw : {};
    var threshold = Number(next.threshold);
    if (!isFinite(threshold) || threshold < 0) threshold = 100;
    var positions = {};
    if (next.positions && typeof next.positions === "object") {
      Object.keys(next.positions).forEach(function (id) {
        var rule = next.positions[id] && typeof next.positions[id] === "object" ? next.positions[id] : {};
        var posThreshold = Number(rule.threshold);
        if (!isFinite(posThreshold) || posThreshold < 0) posThreshold = 100;
        positions[id] = {
          enabled: !!rule.enabled,
          direction: rule.direction === "below" ? "below" : "above",
          threshold: Math.round(posThreshold * 100) / 100,
        };
      });
    }
    var reminders = Array.isArray(next.reminders) ? next.reminders.map(function (item, index) {
      var sound = item && (item.sound === "none" || item.sound === "double" || item.sound === "ping") ? item.sound : "beep";
      return {
        id: item && item.id ? String(item.id) : "r" + index,
        enabled: !(item && item.enabled === false),
        time: item && /^\d{2}:\d{2}$/.test(String(item.time || "")) ? String(item.time) : "09:00",
        title: item && item.title ? String(item.title).slice(0, 48) : "",
        sound: sound,
        positionId: item && item.positionId ? String(item.positionId) : "",
      };
    }) : [];
    var everyHours = Number(next.redundancy && next.redundancy.everyHours);
    if (!isFinite(everyHours) || everyHours < 1) everyHours = 1;
    if (everyHours > 24) everyHours = 24;
    return {
      enabled: !!next.enabled,
      scope: next.scope === "position" ? "position" : "total",
      direction: next.direction === "below" ? "below" : "above",
      threshold: Math.round(threshold * 100) / 100,
      sound: next.sound === "none" || next.sound === "double" || next.sound === "ping" ? next.sound : "beep",
      hlMissing: !!next.hlMissing,
      collapsed: next.collapsed !== false,
      positions: positions,
      reminders: reminders,
      remindersCollapsed: next.remindersCollapsed !== false,
      redundancy: {
        enabled: !!(next.redundancy && next.redundancy.enabled),
        everyHours: Math.round(everyHours),
        title: next.redundancy && next.redundancy.title ? String(next.redundancy.title).slice(0, 48) : "",
      },
    };
  }

  function newReminderId() {
    return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function positionNetById() {
    var map = {};
    var pairs = lastSnap && Array.isArray(lastSnap.pairs) ? lastSnap.pairs : [];
    pairs.forEach(function (p) {
      var id = p.accountId || "a";
      map[id] = (map[id] || 0) + (Number(p.omniUpnl) || 0) + (Number(p.hlUpnl) || 0);
    });
    return map;
  }

  function getAlertPositionEntries() {
    var acc = accountsState && accountsState.accounts;
    var netMap = positionNetById();
    var order = acc && Array.isArray(acc.slotOrder) ? acc.slotOrder.slice() : Object.keys(netMap);
    return order.map(function (id) {
      var slot = acc && acc.slots && acc.slots[id] ? acc.slots[id] : {};
      var label = slot.label || id.toUpperCase();
      var rule = alertPrefs.positions && alertPrefs.positions[id] ? alertPrefs.positions[id] : { enabled: false, direction: "above", threshold: 100 };
      return {
        id: id,
        label: label,
        net: netMap[id] || 0,
        rule: rule,
      };
    });
  }

  function updateAlertPositionNets() {
    if (!alertPositionsEl) return;
    getAlertPositionEntries().forEach(function (item) {
      var row = alertPositionsEl.querySelector('[data-alert-pos="' + item.id.replace(/"/g, "") + '"]');
      if (!row) return;
      var netEl = row.querySelector(".alert-pos-net");
      if (!netEl) return;
      netEl.className = "alert-pos-net " + pnlClass(item.net);
      netEl.textContent = fmtUsd(item.net, true);
    });
  }

  function renderAlertPositionList(force) {
    if (!alertPositionsEl) return;
    var items = getAlertPositionEntries();
    if (!force && focusInside(alertPositionsEl) && alertPositionsEl.children.length) {
      updateAlertPositionNets();
      return;
    }
    if (!items.length) {
      safeSetInnerHTML(alertPositionsEl, '<div class="alert-empty">' + esc(t("alertPositionsEmpty")) + "</div>");
      return;
    }
    safeSetInnerHTML(
      alertPositionsEl,
      items.map(function (item) {
        return (
          '<div class="alert-pos-item" data-alert-pos="' + esc(item.id) + '">' +
            '<div class="alert-pos-top">' +
              '<div class="alert-pos-name">' + esc(item.label) + "</div>" +
              '<div class="alert-pos-net ' + pnlClass(item.net) + '">' + esc(fmtUsd(item.net, true)) + "</div>" +
            "</div>" +
            '<div class="alert-pos-grid">' +
              '<label class="alert-toggle">' +
                '<input type="checkbox" data-alert-pos-enabled="' + esc(item.id) + '"' + (item.rule.enabled ? " checked" : "") + " />" +
                '<span>' + esc(t("alertEnabled")) + "</span>" +
              "</label>" +
              '<div class="alert-field">' +
                '<label data-i18n="alertDirection">' + esc(t("alertDirection")) + "</label>" +
                '<select data-alert-pos-direction="' + esc(item.id) + '">' +
                  '<option value="above"' + (item.rule.direction === "above" ? " selected" : "") + ">" + esc(t("alertDirectionAbove")) + "</option>" +
                  '<option value="below"' + (item.rule.direction === "below" ? " selected" : "") + ">" + esc(t("alertDirectionBelow")) + "</option>" +
                "</select>" +
              "</div>" +
              '<div class="alert-field" style="grid-column:1/-1">' +
                '<label>' + esc(t("alertThreshold")) + "</label>" +
                '<input type="number" step="0.01" inputmode="decimal" data-alert-pos-threshold="' + esc(item.id) + '" value="' + esc(String(item.rule.threshold)) + '" />' +
              "</div>" +
            "</div>" +
          "</div>"
        );
      }).join("")
    );
  }

  function alertPositionOptionsHtml(selectedId) {
    var items = getAlertPositionEntries();
    var html = '<option value="">' + esc(t("none")) + "</option>";
    items.forEach(function (item) {
      html += '<option value="' + esc(item.id) + '"' + (item.id === selectedId ? " selected" : "") + ">" + esc(item.label) + "</option>";
    });
    return html;
  }

  function renderReminderList(force) {
    if (!alertRemindersEl) return;
    if (!force && focusInside(alertRemindersEl) && alertRemindersEl.children.length) return;
    var reminders = Array.isArray(alertPrefs.reminders) ? alertPrefs.reminders : [];
    if (!reminders.length) {
      safeSetInnerHTML(alertRemindersEl, '<div class="alert-empty">' + esc(t("alertRemindersEmpty")) + "</div>");
      return;
    }
    safeSetInnerHTML(alertRemindersEl, reminders.map(function (item) {
      var parts = String(item.time || "09:00").split(":");
      var hh = parts[0] || "09";
      var mm = parts[1] || "00";
      return (
        '<div class="alert-rem-item" data-reminder-id="' + esc(item.id) + '">' +
          '<div class="alert-rem-grid">' +
            '<label class="alert-toggle">' +
              '<input type="checkbox" data-reminder-enabled="' + esc(item.id) + '"' + (item.enabled ? " checked" : "") + " />" +
              '<span>' + esc(t("alertEnabled")) + "</span>" +
            "</label>" +
            '<div class="alert-field">' +
              '<label>' + esc(t("alertReminderTime")) + "</label>" +
              '<div class="row-in">' +
                '<select data-reminder-hour="' + esc(item.id) + '">' + timeHourOptionsHtml(hh) + "</select>" +
                '<select data-reminder-minute="' + esc(item.id) + '">' + timeMinuteOptionsHtml(mm) + "</select>" +
              "</div>" +
            "</div>" +
            '<div class="alert-field" style="grid-column:1/-1">' +
              '<label>' + esc(t("alertReminderTitle")) + "</label>" +
              '<input type="text" maxlength="48" data-reminder-title="' + esc(item.id) + '" value="' + esc(item.title) + '" placeholder="Open / Close" />' +
            "</div>" +
            '<div class="alert-field">' +
              '<label>' + esc(t("alertSound")) + "</label>" +
              '<div class="row-in">' +
                '<select data-reminder-sound="' + esc(item.id) + '">' +
                  '<option value="none"' + (item.sound === "none" ? " selected" : "") + ">" + esc(t("alertSoundNone")) + "</option>" +
                  '<option value="beep"' + (item.sound === "beep" ? " selected" : "") + ">" + esc(t("alertSoundBeep")) + "</option>" +
                  '<option value="double"' + (item.sound === "double" ? " selected" : "") + ">" + esc(t("alertSoundDouble")) + "</option>" +
                  '<option value="ping"' + (item.sound === "ping" ? " selected" : "") + ">" + esc(t("alertSoundPing")) + "</option>" +
                "</select>" +
                '<button type="button" class="btn" data-reminder-test="' + esc(item.id) + '">' + esc(t("alertTestSound")) + "</button>" +
              "</div>" +
            "</div>" +
            '<div class="alert-field">' +
              '<label>' + esc(t("alertReminderPosition")) + "</label>" +
              '<select data-reminder-position="' + esc(item.id) + '">' + alertPositionOptionsHtml(item.positionId) + "</select>" +
            "</div>" +
          "</div>" +
          '<div class="alert-rem-actions">' +
            '<button type="button" class="alert-rem-remove" data-reminder-remove="' + esc(item.id) + '">' + esc(t("alertReminderRemove")) + "</button>" +
          "</div>" +
        "</div>"
      );
    }).join(""));
  }

  function timeHourOptionsHtml(selected) {
    var out = "";
    for (var i = 0; i < 24; i += 1) {
      var v = String(i).padStart(2, "0");
      out += '<option value="' + v + '"' + (v === selected ? " selected" : "") + ">" + v + "</option>";
    }
    return out;
  }

  function timeMinuteOptionsHtml(selected) {
    var out = "";
    for (var i = 0; i < 60; i += 1) {
      var v = String(i).padStart(2, "0");
      out += '<option value="' + v + '"' + (v === selected ? " selected" : "") + ">" + v + "</option>";
    }
    return out;
  }

  function renderAlertPrefs(opts) {
    opts = opts || {};
    var rebuildLists = opts.rebuildLists !== false;
    if (alertEnabledEl) alertEnabledEl.checked = !!alertPrefs.enabled;
    if (alertScopeEl) alertScopeEl.value = alertPrefs.scope;
    if (alertDirectionEl) alertDirectionEl.value = alertPrefs.direction;
    if (alertThresholdEl) alertThresholdEl.value = String(alertPrefs.threshold);
    if (alertSoundEl) alertSoundEl.value = alertPrefs.sound;
    if (alertHlMissingEl) alertHlMissingEl.checked = !!alertPrefs.hlMissing;
    if (alertRedundancyEnabledEl) alertRedundancyEnabledEl.checked = !!(alertPrefs.redundancy && alertPrefs.redundancy.enabled);
    if (alertRedundancyEveryEl) alertRedundancyEveryEl.value = String((alertPrefs.redundancy && alertPrefs.redundancy.everyHours) || 1) + "H";
    if (alertRedundancyTitleInputEl) alertRedundancyTitleInputEl.value = alertPrefs.redundancy && alertPrefs.redundancy.title ? alertPrefs.redundancy.title : "";
    if (alertCard) alertCard.classList.toggle("is-off", !alertPrefs.enabled);
    if (alertCard) alertCard.classList.toggle("is-collapsed", !!alertPrefs.collapsed);
    if (alertFoldEl) alertFoldEl.textContent = alertPrefs.collapsed ? "▸" : "▾";
    if (alertReminderSectionEl) alertReminderSectionEl.classList.toggle("is-collapsed", !!alertPrefs.remindersCollapsed);
    if (alertReminderFoldEl) alertReminderFoldEl.textContent = alertPrefs.remindersCollapsed ? "▸" : "▾";
    if (rebuildLists) {
      renderAlertPositionList(!!opts.forceLists);
      renderReminderList(!!opts.forceLists);
    }
  }

  function persistAlertPrefs(opts, renderOpts) {
    alertPrefs = normalizeAlertPrefs(opts || alertPrefs);
    renderAlertPrefs(Object.assign({ rebuildLists: false }, renderOpts || {}));
    try {
      chrome.storage.local.set({ [ALERT_KEY]: alertPrefs }, function () {
        void chrome.runtime.lastError;
        // Defer refresh so native select blur can finish before any DOM rebuild.
        setTimeout(function () {
          try {
            chrome.runtime.sendMessage({ type: "HS_WIDGET_REFRESH", marksOnly: true }, function () {
              void chrome.runtime.lastError;
            });
          } catch (_) {}
        }, 40);
      });
    } catch (_) {}
  }

  function snapshotAlertPrefs(overrides) {
    return Object.assign({}, alertPrefs, {
      enabled: alertEnabledEl ? !!alertEnabledEl.checked : alertPrefs.enabled,
      scope: alertScopeEl ? alertScopeEl.value : alertPrefs.scope,
      direction: alertDirectionEl ? alertDirectionEl.value : alertPrefs.direction,
      threshold: alertThresholdEl ? alertThresholdEl.value : alertPrefs.threshold,
      sound: alertSoundEl ? alertSoundEl.value : alertPrefs.sound,
      hlMissing: alertHlMissingEl ? !!alertHlMissingEl.checked : alertPrefs.hlMissing,
      collapsed: alertPrefs.collapsed,
      positions: alertPrefs.positions || {},
      reminders: Array.isArray(alertPrefs.reminders) ? alertPrefs.reminders : [],
      remindersCollapsed: alertPrefs.remindersCollapsed !== false,
      redundancy: alertPrefs.redundancy || { enabled: false, everyHours: 1, title: "" },
    }, overrides || {});
  }

  function renderVolSource() {
    if (!volSourceEl) return;
    volSourceEl.querySelectorAll("button[data-src]").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-src") === volSource);
    });
    renderVolSlotSelect();
  }

  function renderVolSlotSelect() {
    if (!volSlotEl) return;
    var show = volLegs.length > 1;
    volSlotEl.classList.toggle("is-on", show);
    volSlotEl.setAttribute(
      "aria-label",
      volSource === "omni" ? t("omniLeg") : volSource === "xyz" ? t("walletXyz") : t("walletHl")
    );
    volSlotEl.title =
      volSource === "omni" ? t("omniCsvLeg") : t("walletWord") + " " + (volSource === "xyz" ? "XYZ" : "HL");
    if (!show) {
      volSlotEl.innerHTML = "";
      return;
    }
    var cur = getVolSlot();
    var ids = volLegs.map(function (l) { return l.id; });
    if (ids.indexOf(cur) < 0) {
      cur = ids.indexOf("all") >= 0 ? "all" : ids[0];
      setVolSlot(cur);
    }
    volSlotEl.innerHTML = volLegs
      .map(function (l) {
        var extra = "";
        if (l.id !== "all" && l.trades != null) extra = " · " + l.trades + " " + t("trades");
        return (
          '<option value="' +
          esc(l.id) +
          '"' +
          (l.id === cur ? " selected" : "") +
          ">" +
          esc(l.label) +
          extra +
          "</option>"
        );
      })
      .join("");
  }

  function renderVolPeriodPills() {
    if (!volPeriodEl) return;
    var list = volPeriodsFor(volSource);
    volPeriod = normalizeVolPeriod(volSource, volPeriod);
    volPeriodEl.innerHTML = list
      .map(function (p) {
        return (
          '<button type="button" data-period="' +
          esc(p.id) +
          '"' +
          (p.id === volPeriod ? ' class="is-on"' : "") +
          ">" +
          esc(p.label) +
          "</button>"
        );
      })
      .join("");
  }

  function setVolLoading() {
    if (volValueEl) volValueEl.textContent = "…";
    if (volMetaEl) volMetaEl.textContent = t("loading");
  }

  function applyVolReport(res) {
    if (!volValueEl || !volMetaEl) return;
    if (res && Array.isArray(res.legs)) {
      var prevFp = volLegs
        .map(function (l) { return l.id + ":" + (l.trades || 0) + ":" + (l.label || ""); })
        .join("|");
      var nextFp = res.legs
        .map(function (l) { return l.id + ":" + (l.trades || 0) + ":" + (l.label || ""); })
        .join("|");
      volLegs = res.legs;
      if (res.slotId) setVolSlot(String(res.slotId));
      if (prevFp !== nextFp) renderVolSlotSelect();
    }
    if (!res || !res.ok) {
      volValueEl.textContent = "—";
      volMetaEl.innerHTML = '<span class="hint">' + esc((res && res.error) || t("volumeError")) + "</span>";
      return;
    }
    if ((res.hintKey || res.hint) && !(res.volume > 0) && !(res.count > 0)) {
      volValueEl.textContent = "—";
      var hintText = res.hintKey ? t(res.hintKey) : res.hint;
      volMetaEl.innerHTML = '<span class="hint">' + esc(hintText) + "</span>";
      return;
    }
    volValueEl.textContent = fmtUsd(res.volume || 0, false);
    var unit = res.unit === "fills" ? t("fills") : t("trades");
    var bits = [(res.count || 0) + " " + unit];
    if (res.window && res.window.label) bits.push(res.window.label);
    if (res.incomplete) bits.push(t("partial"));
    volMetaEl.textContent = bits.join(" · ");
  }

  function loadVolume(opts) {
    if (!volSection || volSection.hidden) return;
    var silent = !!(opts && opts.silent);
    var req = ++volReqId;
    // Silent refresh keeps the previous $ / meta visible (avoids 3–4s blink on HS sync).
    if (!silent) setVolLoading();
    try {
      chrome.runtime.sendMessage(
        {
          type: "HS_WIDGET_VOLUME",
          source: volSource,
          period: volPeriod,
          slotId: getVolSlot(),
        },
        function (res) {
          void chrome.runtime.lastError;
          if (req !== volReqId) return;
          applyVolReport(res);
        }
      );
    } catch (_) {
      if (req !== volReqId) return;
      applyVolReport({ ok: false, error: t("extensionInactive") });
    }
  }

  function showVolumeSection(show) {
    if (!volSection) return;
    var wasHidden = volSection.hidden;
    volSection.hidden = !show;
    if (show) {
      renderVolSource();
      renderVolPeriodPills();
      if (wasHidden) loadVolume();
    }
  }

  function pairKeyOf(p) {
    return String(p.accountId || "a") + "::" + String(p.market || "").toUpperCase();
  }

  function sortPairs(pairs) {
    var list = Array.isArray(pairs) ? pairs.slice() : [];
    if (!pairOrder.length) return list;
    var rank = {};
    pairOrder.forEach(function (k, i) { rank[k] = i; });
    list.sort(function (a, b) {
      var ra = rank.hasOwnProperty(pairKeyOf(a)) ? rank[pairKeyOf(a)] : 1e9;
      var rb = rank.hasOwnProperty(pairKeyOf(b)) ? rank[pairKeyOf(b)] : 1e9;
      if (ra !== rb) return ra - rb;
      return Math.abs(b.omniNotional || 0) - Math.abs(a.omniNotional || 0);
    });
    return list;
  }

  function walletsOf(state) {
    var s = state || accountsState;
    if (!s) return [];
    var out = [];
    var seen = {};
    (Array.isArray(s.wallets) ? s.wallets : []).concat(
      (function () {
        var acc = s.accounts;
        if (!acc || !acc.slots) return [];
        return (acc.slotOrder || []).map(function (id) {
          return (acc.slots[id] && acc.slots[id].hlWallet) || "";
        });
      })()
    ).forEach(function (w) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(w)) return;
      var k = w.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(w);
    });
    return out;
  }

  function activeSlotId() {
    var acc = accountsState && accountsState.accounts;
    if (!acc) return "";
    return acc.activeImportSlot || (acc.slotOrder && acc.slotOrder[0]) || "";
  }

  function activeLegLabel() {
    var acc = accountsState && accountsState.accounts;
    if (!acc) return t("positionPlaceholder");
    var id = activeSlotId();
    var slot = id && acc.slots && acc.slots[id];
    return (slot && slot.label) || t("positionPlaceholder");
  }

  function syncActiveRenameInput() {
    if (!activePositionRename || collectBusy) return;
    if (document.activeElement === activePositionRename) return;
    var id = activeSlotId();
    activePositionRename.disabled = !id;
    // Never suggest wallet suffixes (C6, 0F…) here — chips are labeled from JSON automatically.
    // Keep whatever the user typed; only clear when empty/untouched.
    if (!activePositionRename.dataset.userEdited) {
      activePositionRename.value = "";
    }
  }

  function commitActiveRename() {
    // Collect-page name is optional metadata for the next collect only.
    // Do not rename the active slot from this field (avoids overwriting auto wallet chips).
    if (!activePositionRename) return;
    if (activePositionRename.value.trim()) {
      activePositionRename.dataset.userEdited = "1";
    } else {
      delete activePositionRename.dataset.userEdited;
    }
  }

  function toast(msg, kind) {
    if (!toastEl) return;
    toastEl.hidden = false;
    toastEl.textContent = msg;
    toastEl.className = "toast" + (kind === "err" ? " err" : kind === "ok" ? " ok" : "");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.hidden = true;
    }, 3200);
  }

  function setPage(name) {
    if (name === "points") name = "positions";
    document.querySelectorAll(".page").forEach(function (el) {
      el.classList.toggle("is-on", el.getAttribute("data-page") === name);
    });
    document.querySelectorAll(".tab").forEach(function (el) {
      el.classList.toggle("is-on", el.getAttribute("data-page") === name);
    });
    try { chrome.storage.local.set({ [PAGE_KEY]: name }); } catch (_) {}
    if (foot) {
      foot.textContent = name === "collecte"
        ? t("footCollect")
        : t("footPositions");
    }
  }

  /* —— Positions render —— */
  function hlRow(h) {
    var dex = h.dex || "HL";
    var vc = String(dex).toUpperCase() === "XYZ" ? "xyz" : "hl";
    return (
      '<div class="row">' +
        '<div class="main">' +
          '<span class="venue ' + vc + '">' + esc(dex) + "</span>" +
          sidePill(h.side) +
          '<span class="asset">' + esc(h.market || "—") + "</span>" +
          (h.wallet ? '<span class="muted" style="font-size:10px">' + esc(shortAddr(h.wallet)) + "</span>" : "") +
        "</div>" +
        '<div class="right">' +
          '<div class="u ' + pnlClass(h.upnl) + '">' + esc(fmtUsd(h.upnl, true)) + "</div>" +
          '<div class="n">' + esc(fmtUsd(h.notionalUsd, false)) + "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function pairHlSelect(p, hlChoices) {
    var cur = "auto";
    if (!p.pairAuto) {
      if (p.pairOverride === "__none__") cur = "__none__";
      else if (p.pairOverride) cur = String(p.pairOverride);
      else if (p.hlKey) cur = String(p.hlKey);
      else cur = "auto";
    }
    var opts =
      '<option value="auto"' + (cur === "auto" ? " selected" : "") + ">" + esc(t("auto")) + "</option>" +
      '<option value="__none__"' + (cur === "__none__" ? " selected" : "") + ">" + esc(t("none")) + "</option>";
    var seen = {};
    (hlChoices || []).forEach(function (h) {
      var key = h.key || [String(h.wallet || "").toLowerCase(), String(h.dex || "HL").toUpperCase(), String(h.market || "").toUpperCase()].join("|");
      if (!key || seen[key]) return;
      seen[key] = true;
      var label =
        (h.dex || "HL") +
        " " +
        (h.market || "?") +
        " · " +
        shortAddr(h.wallet) +
        " · " +
        (h.side || "?") +
        (h.paired && key !== cur ? " (lié)" : "");
      var sel = !p.pairAuto && String(cur) === String(key) ? " selected" : "";
      opts += '<option value="' + esc(key) + '"' + sel + ">" + esc(label) + "</option>";
    });
    return (
      '<select class="pair-hl" data-act="pair-hl" data-slot="' + esc(p.accountId || "a") +
      '" data-market="' + esc(p.market) + '">' + opts + "</select>"
    );
  }

  function pairRow(p, hlOpen) {
    var net = (Number(p.omniUpnl) || 0) + (Number(p.hlUpnl) || 0);
    var hasHl = !!p.paired && p.hlSide;
    var dex = p.hlDex || "HL";
    var vc = String(dex).toUpperCase() === "XYZ" ? "xyz" : "hl";
    var hlAsset = p.hlMarket || p.market || "—";
    // All free hedges + this row's current hedge (any wallet)
    var choices = (hlOpen || []).filter(function (h) {
      if (!h.paired) return true;
      return p.hlKey && h.key === p.hlKey;
    });
    var conflict = !!p.hlConflict;
    var omniMeta = [
      "Q " + fmtQty(p.omniQty),
      "S " + fmtUsd(p.omniNotional || 0, false),
    ].join(" · ");
    var omniAge = fmtAge(p.omniOpenedAt);
    if (omniAge) omniMeta += " · T " + omniAge;
    var hlBits = [];
    if (hasHl) {
      hlBits.push("Q " + fmtQty(p.hlQty));
      hlBits.push("S " + fmtUsd(p.hlNotional || 0, false));
      var lev = fmtLev(p.hlLeverage);
      if (lev) hlBits.push(lev);
    }
    return (
      '<div class="pair">' +
        '<div class="pair-main">' +
          '<div class="pair-side">' +
            '<div class="leg-line">' +
              '<span class="venue omni">Omni</span>' +
              sidePill(p.omniSide) +
              '<span class="asset">' + esc(p.market) + "</span>" +
              '<span class="' + pnlClass(p.omniUpnl) + '">' + esc(fmtUsd(p.omniUpnl, true)) + "</span>" +
            "</div>" +
            '<div class="leg-meta">' + esc(omniMeta) + "</div>" +
          "</div>" +
          '<div class="pair-side">' +
            (hasHl
              ? '<div class="leg-line">' +
                  '<span class="venue ' + vc + '">' + esc(dex) + "</span>" +
                  sidePill(p.hlSide) +
                  '<span class="asset">' + esc(hlAsset) + "</span>" +
                  '<span class="' + pnlClass(p.hlUpnl) + '">' + esc(fmtUsd(p.hlUpnl, true)) + "</span>" +
                "</div>" +
                '<div class="leg-meta">' + esc(hlBits.join(" · ")) + "</div>"
              : '<div class="leg-line"><span class="muted">' + esc(t("noHedge")) + "</span></div>") +
          "</div>" +
        "</div>" +
        '<div class="net"><div class="u ' + pnlClass(net) + '">' +
          esc(fmtUsd(net, true)) + "</div>" +
          (hasHl ? hedgeMatchBadge(p) : "") +
        "</div>" +
        (conflict
          ? '<div class="warn" style="grid-column:1/-1">⚠ ' + esc(t("conflict")) + "</div>"
          : "") +
        '<div class="pair-link">' +
          pairHlSelect(p, choices) +
        "</div>" +
      "</div>"
    );
  }

  function hlBookRow(h) {
    var dex = h.dex || "HL";
    var vc = String(dex).toUpperCase() === "XYZ" ? "xyz" : "hl";
    var lev = fmtLev(h.leverage);
    var meta = [
      "Q " + fmtQty(h.qty),
      "S " + fmtUsd(h.notionalUsd, false),
    ];
    if (lev) meta.push(lev);
    if (h.wallet) meta.push(shortAddr(h.wallet));
    var badge = h.paired
      ? '<span class="hl-badge is-linked">' + esc(t("hlPaired")) + "</span>"
      : '<span class="hl-badge is-free">' + esc(t("hlFree")) + "</span>";
    return (
      '<div class="row hl-book-row' + (h.paired ? " is-linked" : " is-free") + '">' +
        '<div class="main">' +
          '<span class="venue ' + vc + '">' + esc(dex) + "</span>" +
          sidePill(h.side) +
          '<span class="asset">' + esc(h.market || "—") + "</span>" +
          badge +
        "</div>" +
        '<div class="right">' +
          '<div class="u ' + pnlClass(h.upnl) + '">' + esc(fmtUsd(h.upnl, true)) + "</div>" +
          '<div class="n">' + esc(meta.join(" · ")) + "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function renderHlBook(snap) {
    var list = Array.isArray(snap.hlOpen) ? snap.hlOpen : [];
    if (!list.length && Array.isArray(snap.unpairedHl)) list = snap.unpairedHl;
    var freeN = list.filter(function (h) { return !h.paired; }).length;
    var head =
      '<div class="hl-book-hd">' +
        '<div class="hl-book-title">' + esc(t("hlBookTitle")) + "</div>" +
        '<div class="hl-book-sub">' +
          esc(t("hlBookSub")) +
          (freeN ? " · " + esc(t("hlUnpairedHint").replace("{n}", String(freeN))) : "") +
        "</div>" +
      "</div>";
    if (!list.length) {
      return (
        '<div class="group hl-book">' +
          head +
          '<div class="group-body"><div class="group-empty">' + esc(t("hlBookEmpty")) + "</div></div>" +
        "</div>"
      );
    }
    return (
      '<div class="group hl-book">' +
        head +
        '<div class="group-body">' + list.map(hlBookRow).join("") + "</div>" +
      "</div>"
    );
  }

  function renderPositions(snap, opts) {
    lastSnap = snap;
    if (!summary || !posScroll) return;

    if (!snap || !snap.ok) {
      safeSetInnerHTML(summary, "");
      showVolumeSection(false);
      safeSetInnerHTML(
        posScroll,
        '<div class="empty">' +
          "<strong>" + esc(t("emptyStepsTitle")) + "</strong><br/><br/>" +
          t("emptyStepsBody") +
        "</div>"
      );
      return;
    }

    var pairs = sortPairs(snap.pairs || []);
    var hlByWallet = snap.hlByWallet || {};
    var hlOpen = Array.isArray(snap.hlOpen) ? snap.hlOpen : [];

    var hedgedPairs = pairs.filter(function (p) { return !!p.paired && !!p.hlSide; });
    var hedgedUpnl = hedgedPairs.reduce(function (sum, p) {
      return sum + (Number(p.omniUpnl) || 0) + (Number(p.hlUpnl) || 0);
    }, 0);

    safeSetInnerHTML(
      summary,
      '<div class="kpi kpi-main"><div class="l">' + esc(t("pnlTotal")) + '</div><div class="v ' + pnlClass(hedgedUpnl) + '">' +
      esc(fmtUsd(hedgedUpnl, true)) + "</div></div>"
    );

    showVolumeSection(true);

    var known = {};
    pairOrder.forEach(function (k) { known[k] = true; });
    pairs.forEach(function (p) {
      var k = pairKeyOf(p);
      if (!known[k]) { pairOrder.push(k); known[k] = true; }
    });

    var html = "";
    var acc = accountsState && accountsState.accounts;
    var order = acc && Array.isArray(acc.slotOrder) ? acc.slotOrder.slice() : [];

    var byAcc = {};
    pairs.forEach(function (p) {
      var id = p.accountId || "a";
      if (!byAcc[id]) byAcc[id] = [];
      byAcc[id].push(p);
    });

    if (!order.length && pairs.length) order = Object.keys(byAcc);

    if (order.length || pairs.length) {
      var wallets = walletsOf(accountsState);
      var lib = csvLibraryOf(accountsState);
      order.forEach(function (id) {
        var slot = (acc && acc.slots && acc.slots[id]) || {};
        var label = slot.label || (byAcc[id] && byAcc[id][0] && byAcc[id][0].accountLabel) || "";
        var items = (byAcc[id] || []).filter(function (p) {
          return !!p.paired && !!p.hlSide;
        });
        // Hide legs / Omni rows with no HL link — only hedged pairs belong in Positions.
        if (!items.length) return;
        var groupNet = items.reduce(function (sum, p) {
          return sum + (Number(p.omniUpnl) || 0) + (Number(p.hlUpnl) || 0);
        }, 0);
        var closed = !!collapsedLegs[id];
        var idLine = [];
        if (slot.omniAddress) idLine.push(t("omniAddrLabel") + " " + shortAddr(slot.omniAddress));
        if (slot.marketsHint) idLine.push(slot.marketsHint);
        else if (items.length) {
          idLine.push(items.map(function (p) { return p.market; }).slice(0, 4).join(" · "));
        }
        var csvN = Array.isArray(slot.csvIds) ? slot.csvIds.length : 0;
        if (csvN) idLine.push(t("csvLinked"));
        var wallet = slot.hlWallet || "";
        var walletOpts = '<option value="">' + esc(t("chooseHlWallet")) + "</option>" + wallets.map(function (w) {
          var sel = wallet && w.toLowerCase() === wallet.toLowerCase() ? " selected" : "";
          return '<option value="' + esc(w) + '"' + sel + ">" + esc(shortAddr(w)) + "</option>";
        }).join("");
        html +=
          '<div class="group' + (closed ? " is-closed" : "") + '" data-slot="' + esc(id) + '">' +
            '<div class="group-hd">' +
              '<button type="button" class="tog" data-act="toggle-leg" data-slot="' + esc(id) + '" title="' +
                (closed ? t("open") : t("collapse")) + '">' + (closed ? "▸" : "▾") + "</button>" +
              '<div class="group-title">' +
                '<input data-act="rename-pos" data-slot="' + esc(id) + '" value="' + esc(label) + '" placeholder="' + esc(t("positionPlaceholder")) + '" maxlength="32" title="' + esc(t("rename")) + '" />' +
                (idLine.length ? '<div class="group-sub">' + esc(idLine.join(" · ")) + "</div>" : "") +
              "</div>" +
              '<span class="pnl ' + pnlClass(groupNet) + '">' + esc(fmtUsd(groupNet, true)) + "</span>" +
              '<span class="tag">' + items.length + "</span>" +
              '<button type="button" class="del" data-act="remove-leg" data-slot="' + esc(id) +
              '" title="' + esc(order.length <= 1 ? t("clearLeg") : t("removeLeg")) + '">' +
              esc(order.length <= 1 ? t("clear") : t("removeShort")) + "</button>" +
            "</div>" +
            '<div class="group-binds">' +
              '<div class="row-in"><select data-act="pick-wallet-pos" data-slot="' + esc(id) + '">' + walletOpts + "</select></div>" +
              slotCsvSelectHtml(id, slot, lib) +
              '<div class="acts">' +
                '<button type="button" class="btn btn-ac" data-act="join-csv" data-slot="' + esc(id) + '">' + esc(t("joinCsv")) + "</button>" +
              "</div>" +
            "</div>" +
            '<div class="group-body">' +
              items.map(function (p) { return pairRow(p, hlOpen); }).join("") +
            "</div>" +
          "</div>";
      });
    }

    // Always surface HL / XYZ book when a wallet is loaded (pairing source of truth)
    if (hlOpen.length || (snap.hlCount > 0) || (snap.portfolio && (snap.portfolio.hlAccounts || []).length)) {
      html += renderHlBook(snap);
    }

    if (!html) {
      html = '<div class="empty">' + t("noPosition") + "</div>";
    }

    // Avoid full DOM wipe while editing a field or closing a native <select>.
    // Buttons (toggle / Suppr.) must NOT block — otherwise delete/collapse never redraw.
    if (!(opts && opts.force) && editingFocusBlocksPositions()) {
      updateAlertPositionNets();
      return;
    }

    safeSetInnerHTML(posScroll, html);
    renderAlertPositionList();

    var when = snap.updatedAt
      ? new Date(snap.updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : "—";
    if (foot && document.getElementById("pagePositions").classList.contains("is-on")) {
      var freeN = (snap.unpairedHl || []).length;
      foot.textContent =
        t("footUpdated") + " " + when +
        (hedgedPairs.length ? " · " + hedgedPairs.length + " " + t("footPairs") : "") +
        (hlOpen.length ? " · " + hlOpen.length + " HL/XYZ" : "") +
        (freeN ? " · " + freeN + " " + t("hlFree") : "");
    }
  }

  var pendingPositionsSnap = null;
  var positionsRenderTimer = null;
  function scheduleRenderPositions(snap) {
    pendingPositionsSnap = snap;
    if (positionsRenderTimer) return;
    positionsRenderTimer = setTimeout(function tick() {
      var active = document.activeElement;
      var busy =
        active &&
        (active.tagName === "SELECT" ||
          active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA");
      if (busy) {
        positionsRenderTimer = setTimeout(tick, 80);
        return;
      }
      positionsRenderTimer = null;
      var next = pendingPositionsSnap;
      pendingPositionsSnap = null;
      renderPositions(next);
    }, 0);
  }

  /* —— Collecte UI —— */
  function updateHints() {
    var label = activeLegLabel();
    syncActiveRenameInput();
    if (activeRenameRow) activeRenameRow.hidden = true;
    if (collectStatus && !collectBusy) {
      collectStatus.textContent = "";
      collectStatus.className = "status";
    }
    if (dropHint) dropHint.textContent = t("toActiveLeg", { label: label });
  }

  function csvLibraryOf(state) {
    return (state && Array.isArray(state.csvLibrary)) ? state.csvLibrary : [];
  }

  function csvEntryTitle(e) {
    if (!e) return "?";
    if (e.label) return e.label;
    if (e.omniAddress) return shortAddr(e.omniAddress) + (e.tradeCount ? " · " + e.tradeCount : "");
    return (e.tradeCount || 0) + " trades";
  }

  function slotCsvSelectHtml(slotId, slot, library) {
    var lib = library || [];
    var cur = (slot && Array.isArray(slot.csvIds) && slot.csvIds[0]) ? String(slot.csvIds[0]) : "";
    var opts = '<option value="">' + esc(t("chooseCsv")) + "</option>";
    if (!lib.length) {
      opts += '<option value="" disabled>' + esc(t("csvNone")) + "</option>";
    } else {
      opts += lib.map(function (e) {
        var sel = cur && cur === e.id ? " selected" : "";
        var title = csvEntryTitle(e);
        if (e.tradeCount) title += " · " + e.tradeCount + "t";
        return '<option value="' + esc(e.id) + '"' + sel + ">" + esc(title) + "</option>";
      }).join("");
    }
    return (
      '<div class="row-in">' +
        '<select data-act="pick-csv" data-slot="' + esc(slotId) + '" title="' + esc(t("chooseCsv")) + '">' +
          opts +
        "</select>" +
      "</div>"
    );
  }

  function applySlotCsvId(slotId, csvId, cb) {
    send(
      "HS_WIDGET_SET_SLOT_CSVS",
      { slotId: slotId, csvIds: csvId ? [csvId] : [] },
      function (res) {
        chrome.runtime.sendMessage({ type: "HS_WIDGET_REFRESH" }, function () {
          void chrome.runtime.lastError;
          chrome.storage.local.get(["hsWidgetSnapshot"], function (st) {
            renderPositions((st && st.hsWidgetSnapshot) || lastSnap, { force: true });
          });
          if (typeof cb === "function") cb(res);
        });
      }
    );
  }

  function renderCollecte(state) {
    accountsState = state && state.ok ? state : accountsState;
    if (!accountsState) return;

    var wallets = walletsOf(accountsState);
    if (walletsList) {
      walletsList.innerHTML = wallets.map(function (w) {
        return (
          '<div class="chip">' +
            '<span class="addr" title="' + esc(w) + '">' + esc(shortAddr(w)) + "</span>" +
            '<button type="button" class="x" data-act="rm-wallet" data-wallet="' + esc(w) + '" title="' + esc(t("removeWallet")) + '">✕</button>' +
          "</div>"
        );
      }).join("");
    }
    if (walletHint && !walletHint.classList.contains("err")) {
      walletHint.textContent = wallets.length ? t("walletsCount", { count: wallets.length }) : "";
      walletHint.className = "status";
    }

    var acc = accountsState.accounts;
    if (!legsList || !acc) return;
    var order = acc.slotOrder || [];
    var active = acc.activeImportSlot;
    var addLeg = document.getElementById("addLeg");
    if (addLeg) addLeg.disabled = order.length >= MAX_LEGS;

    legsList.innerHTML = order.map(function (id) {
      var slot = acc.slots[id] || {};
      var trades = slot.csv && slot.csv.trades ? slot.csv.trades.length : 0;
      var wallet = slot.hlWallet || "";
      var omniAddr = slot.omniAddress || "";
      var markets = slot.marketsHint || "";
      var lib = csvLibraryOf(accountsState);
      var csvId = Array.isArray(slot.csvIds) && slot.csvIds[0] ? slot.csvIds[0] : "";
      var opts = '<option value="">' + esc(t("chooseHlWallet")) + "</option>" + wallets.map(function (w) {
        var sel = wallet && w.toLowerCase() === wallet.toLowerCase() ? " selected" : "";
        return '<option value="' + esc(w) + '"' + sel + ">" + esc(shortAddr(w)) + "</option>";
      }).join("");
      var idBits = [];
      if (omniAddr) idBits.push(t("omniAddrLabel") + " " + shortAddr(omniAddr));
      if (markets) idBits.push(t("marketsOpenLabel") + " " + markets);
      if (trades) idBits.push(trades + " " + t("trades"));
      else idBits.push(t("empty"));
      if (csvId) idBits.push(t("csvLinked"));
      if (wallet) idBits.push("HL " + shortAddr(wallet));

      return (
        '<div class="leg' + (id === active ? " is-on" : "") + '" data-slot="' + esc(id) + '" data-act="activate-leg" title="' + esc(t("clickTargetLeg")) + '">' +
          '<div class="hd">' +
            '<input data-act="rename" data-slot="' + esc(id) + '" value="' + esc(slot.label || "") + '" placeholder="' + esc(t("positionPlaceholder")) + '" maxlength="32" />' +
            (id === active ? '<span class="badge">' + esc(t("active")) + "</span>" : '<span class="badge" style="opacity:.45">' + esc(t("target")) + "</span>") +
          "</div>" +
          (idBits.length
            ? '<div class="leg-id">' + esc(idBits.join(" · ")) + "</div>"
            : "") +
          '<div class="row-in"><select data-act="pick-wallet" data-slot="' + esc(id) + '">' + opts + "</select></div>" +
          slotCsvSelectHtml(id, slot, lib) +
          '<div class="acts">' +
            (id === active ? "" : '<button type="button" class="btn btn-ac" data-act="activate" data-slot="' + esc(id) + '">' + esc(t("targetBtn")) + "</button>") +
            '<button type="button" class="btn btn-ac" data-act="join-csv" data-slot="' + esc(id) + '">' + esc(t("joinCsv")) + "</button>" +
            '<button type="button" class="btn" data-act="clear" data-slot="' + esc(id) + '">' + esc(t("clear")) + "</button>" +
            '<button type="button" class="btn" data-act="remove" data-slot="' + esc(id) + '" style="border-color:rgba(248,113,113,.3);color:#fca5a5">' + esc(t("remove")) + "</button>" +
          "</div>" +
        "</div>"
      );
    }).join("");

    updateHints();
    renderAlertPositionList();
  }

  function send(type, payload, cb) {
    try {
      chrome.runtime.sendMessage(Object.assign({ type: type }, payload || {}), function (res) {
        void chrome.runtime.lastError;
        if (res && res.ok) renderCollecte(res);
        if (typeof cb === "function") cb(res);
      });
    } catch (_) {}
  }

  function loadState() {
    send("HS_WIDGET_GET_STATE");
  }

  /* —— Tabs —— */
  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      setPage(tab.getAttribute("data-page"));
    });
  });

  /* —— Wallets —— */
  function addWallet() {
    var w = walletInput ? walletInput.value.trim() : "";
    if (!w) return;
    send("HS_WIDGET_ADD_WALLET", { wallet: w }, function (res) {
      if (!res || !res.ok) {
        if (walletHint) {
          walletHint.textContent = (res && res.error) || t("invalidAddress");
          walletHint.className = "status err";
        }
        return;
      }
      if (walletInput) walletInput.value = "";
      if (walletHint) {
        walletHint.textContent = t("walletAdded");
        walletHint.className = "status ok";
      }
    });
  }

  var addWalletBtn = document.getElementById("addWallet");
  if (addWalletBtn) addWalletBtn.addEventListener("click", function (e) { e.preventDefault(); addWallet(); });
  if (walletInput) {
    walletInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); addWallet(); }
    });
  }
  if (walletsList) {
    walletsList.addEventListener("click", function (e) {
      var btn = e.target.closest('[data-act="rm-wallet"]');
      if (!btn) return;
      send("HS_WIDGET_REMOVE_WALLET", { wallet: btn.getAttribute("data-wallet") });
    });
  }
  var refreshHl = document.getElementById("refreshHl");
  if (refreshHl) {
    refreshHl.addEventListener("click", function (e) {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: "HS_WIDGET_REFRESH" }, function () {
        void chrome.runtime.lastError;
        loadState();
      });
    });
  }

  /* —— Legs —— */
  var addLeg = document.getElementById("addLeg");
  if (addLeg) {
    addLeg.addEventListener("click", function (e) {
      e.preventDefault();
      send("HS_WIDGET_ADD_SLOT");
    });
  }
  if (legsList) {
    legsList.addEventListener("click", function (e) {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
      var btn = e.target.closest("button[data-act]");
      if (btn) {
        var act = btn.getAttribute("data-act");
        var id = btn.getAttribute("data-slot");
        if (act === "activate") send("HS_WIDGET_SET_ACTIVE_SLOT", { slotId: id });
        if (act === "join-csv") {
          send("HS_WIDGET_SET_ACTIVE_SLOT", { slotId: id }, function () {
            if (dropFile) {
              dropFile.dataset.forceSlot = id;
              delete dropFile.dataset.forceReplace;
              dropFile.dataset.forceMerge = "1";
              dropFile.click();
            }
          });
        }
        if (act === "import-csv") {
          send("HS_WIDGET_SET_ACTIVE_SLOT", { slotId: id }, function () {
            if (dropFile) {
              dropFile.dataset.forceSlot = id;
              dropFile.dataset.forceReplace = "1";
              delete dropFile.dataset.forceMerge;
              dropFile.click();
            }
          });
        }
        if (act === "clear") send("HS_WIDGET_CLEAR_SLOT", { slotId: id });
        if (act === "remove") {
          if (!window.confirm(t("confirmRemoveOmniLeg"))) return;
          send("HS_WIDGET_REMOVE_SLOT", { slotId: id }, function () {
            chrome.runtime.sendMessage({ type: "HS_WIDGET_REFRESH" }, function () {
              void chrome.runtime.lastError;
            });
          });
        }
        return;
      }
      var leg = e.target.closest(".leg[data-slot]");
      if (leg) {
        var sid = leg.getAttribute("data-slot");
        if (sid) send("HS_WIDGET_SET_ACTIVE_SLOT", { slotId: sid });
      }
    });
    legsList.addEventListener("change", function (e) {
      var el = e.target;
      var act = el.getAttribute("data-act");
      var id = el.getAttribute("data-slot");
      if (act === "rename") send("HS_WIDGET_RENAME_SLOT", { slotId: id, label: el.value.trim() });
      if (act === "pick-wallet") send("HS_WIDGET_SET_SLOT_WALLET", { slotId: id, wallet: el.value.trim() });
      if (act === "pick-csv") {
        applySlotCsvId(id, el.value.trim());
      }
    });
  }

  // Positions page: rename / toggle / delete / manual pair
  if (posScroll) {
    posScroll.addEventListener("change", function (e) {
      var el = e.target;
      if (!el) return;
      var act = el.getAttribute("data-act");
      if (act === "rename-pos") {
        var id = el.getAttribute("data-slot");
        var label = el.value.trim();
        if (!id || !label) return;
        send("HS_WIDGET_RENAME_SLOT", { slotId: id, label: label }, function () {
          chrome.runtime.sendMessage({ type: "HS_WIDGET_REFRESH" }, function () {
            void chrome.runtime.lastError;
          });
        });
        return;
      }
      if (act === "pair-hl") {
        var slot = el.getAttribute("data-slot");
        var market = el.getAttribute("data-market");
        var val = el.value;
        send(
          "HS_WIDGET_SET_PAIR_OVERRIDE",
          {
            accountId: slot,
            market: market,
            hlMarket: val === "auto" ? "auto" : val,
          },
          function () {
            chrome.runtime.sendMessage({ type: "HS_WIDGET_REFRESH" }, function () {
              void chrome.runtime.lastError;
            });
          }
        );
        return;
      }
      if (act === "pick-wallet-pos") {
        var sid = el.getAttribute("data-slot");
        send("HS_WIDGET_SET_SLOT_WALLET", { slotId: sid, wallet: el.value.trim() }, function () {
          chrome.runtime.sendMessage({ type: "HS_WIDGET_REFRESH" }, function () {
            void chrome.runtime.lastError;
          });
        });
        return;
      }
      if (act === "pick-csv") {
        applySlotCsvId(el.getAttribute("data-slot"), el.value.trim());
        return;
      }
    });

    posScroll.addEventListener("click", function (e) {
      var join = e.target.closest('[data-act="join-csv"]');
      if (join) {
        var jid = join.getAttribute("data-slot");
        send("HS_WIDGET_SET_ACTIVE_SLOT", { slotId: jid }, function () {
          if (dropFile) {
            dropFile.dataset.forceSlot = jid;
            delete dropFile.dataset.forceReplace;
            dropFile.dataset.forceMerge = "1";
            setPage("collecte");
            setTimeout(function () { dropFile.click(); }, 80);
          }
        });
        return;
      }
      var tog = e.target.closest('[data-act="toggle-leg"]');
      if (tog) {
        e.preventDefault();
        e.stopPropagation();
        var sid = tog.getAttribute("data-slot");
        if (!sid) return;
        collapsedLegs[sid] = !collapsedLegs[sid];
        try { chrome.storage.local.set({ [COLLAPSE_KEY]: collapsedLegs }); } catch (_) {}
        // Apply collapse in-place. Full renderPositions() is skipped while focus is
        // inside #posScroll (blur-safe for <select>), so the chevron click never redraws.
        var group = tog.closest(".group");
        if (group) {
          var closed = !!collapsedLegs[sid];
          group.classList.toggle("is-closed", closed);
          tog.textContent = closed ? "▸" : "▾";
          tog.title = closed ? t("open") : t("collapse");
        } else if (lastSnap) {
          renderPositions(lastSnap, { force: true });
        }
        return;
      }
      var del = e.target.closest('[data-act="remove-leg"]');
      if (del) {
        e.preventDefault();
        e.stopPropagation();
        var id = del.getAttribute("data-slot");
        if (!id) return;
        var onlyOne = accountsState && accountsState.accounts &&
          (accountsState.accounts.slotOrder || []).length <= 1;
        var msg = onlyOne
          ? t("confirmClearOmniLeg")
          : t("confirmRemoveOmniLeg");
        if (!window.confirm(msg)) return;

        // Optimistic UI — don't wait for storage/render (focus used to block redraw).
        var group = del.closest(".group");
        if (group) {
          if (onlyOne) {
            var body = group.querySelector(".group-body");
            if (body) body.innerHTML = '<div class="group-empty">' + esc(t("emptyLeg")) + "</div>";
            var tag = group.querySelector(".tag");
            if (tag) tag.textContent = "0";
            var pnl = group.querySelector(".group-hd .pnl");
            if (pnl) {
              pnl.textContent = "$0.00";
              pnl.className = "pnl";
            }
          } else {
            group.remove();
          }
        }
        try { document.activeElement && document.activeElement.blur(); } catch (_) {}

        send("HS_WIDGET_REMOVE_SLOT", { slotId: id }, function (res) {
          delete collapsedLegs[id];
          try { chrome.storage.local.set({ [COLLAPSE_KEY]: collapsedLegs }); } catch (_) {}
          if (res && res.ok && res.accounts) {
            accountsState = res;
            try { renderCollecte(res); } catch (_) {}
          }
          chrome.runtime.sendMessage({ type: "HS_WIDGET_REFRESH" }, function () {
            void chrome.runtime.lastError;
            chrome.storage.local.get(["hsWidgetSnapshot"], function (st) {
              renderPositions((st && st.hsWidgetSnapshot) || lastSnap, { force: true });
            });
          });
        });
      }
    });
  }

  /* —— Collect Omni —— */
  function setCollectUi(state, text, status) {
    if (collectBtn) collectBtn.disabled = !!state.busy;
    if (collectLabel && text != null) collectLabel.textContent = text;
    if (collectProgress) collectProgress.hidden = !state.busy;
    if (activeRenameRow) activeRenameRow.hidden = true;
    if (collectStatus) {
      collectStatus.textContent = status || "";
      collectStatus.className = "status" + (state.ok ? " ok" : state.err ? " err" : "");
    }
  }

  if (collectBtn) {
    // Prevent blur→commitActiveRename on the active leg before Collect runs.
    // The rename field names the *new* collecte, not the currently open position.
    collectBtn.addEventListener("mousedown", function (e) {
      e.preventDefault();
    });
    collectBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (collectBusy) return;
      var newLegLabel = desiredPositionLabel();
      // Always auto-name the PC download (wallet / trades / points). No prompt.
      var fileName = "";
      collectBusy = true;
      var collectWatchdog = setTimeout(function () {
        if (!collectBusy) return;
        collectBusy = false;
        setCollectUi({ err: true }, t("collectOmni"), t("collectFailed") + " (timeout)");
        toast(t("collectFailed") + " · timeout", "err");
      }, 180000);
      setCollectUi({ busy: true }, t("collecting"), t("readingOmni"));
      chrome.runtime.sendMessage({ type: "HS_OMNI_COLLECT_RUN", label: newLegLabel, fileName: fileName }, function (res) {
        clearTimeout(collectWatchdog);
        collectBusy = false;
        var err = chrome.runtime.lastError;
        if (err || !res || !res.ok) {
          setCollectUi({ err: true }, t("collectOmni"), (err && err.message) || (res && res.error) || t("failure"));
          toast((err && err.message) || (res && res.error) || t("collectFailed"), "err");
          return;
        }
        var c = res.counts || {};
        var warns = res.warnings || [];
        var msg =
          (res.newLeg ? t("newLeg") + " · " : "") +
          (res.slotLabel ? t("collectedInto").replace("{label}", res.slotLabel) + " · " : "") +
          (res.omniAddress ? t("omniAddrLabel") + " " + shortAddr(res.omniAddress) + " · " : "") +
          (res.marketsHint ? t("marketsOpenLabel") + " " + res.marketsHint + " · " : "") +
          (c.trades != null ? c.trades + " " + t("trades") : t("ok")) +
          (c.points != null ? " · " + c.points + " " + t("epochs") : "");
        if (res.duplicateLabel) {
          msg += " · " + t("collectDupWarn").replace("{label}", res.duplicateLabel);
        }
        if (warns.length) msg += " · " + t("collectPartialWarn");
        if (res.fileName) msg += " · ↓ " + res.fileName;
        if (res.downloadOk === false) msg += " · DOWNLOAD FAIL";
        setCollectUi({ ok: true, err: !!res.duplicateLabel || res.downloadOk === false }, t("collectedDone"), msg);
        toast(
          (res.downloadOk === false ? "DOWNLOAD FAIL · " : "") +
          (warns.length || res.duplicateLabel ? t("collectPartialWarn") : t("collectedOk")) +
          " · " + msg,
          (warns.length || res.duplicateLabel || res.downloadOk === false) ? "err" : "ok"
        );
        if (activePositionRename) {
          activePositionRename.value = "";
          delete activePositionRename.dataset.userEdited;
        }
        loadState();
        setPage("positions");
        setTimeout(function () {
          setCollectUi({}, t("collectOmni"), null);
          updateHints();
        }, 5000);
      });
    });
  }

  if (activePositionRename) {
    activePositionRename.addEventListener("input", function () {
      if (activePositionRename.value.trim()) activePositionRename.dataset.userEdited = "1";
      else delete activePositionRename.dataset.userEdited;
    });
    activePositionRename.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        activePositionRename.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        activePositionRename.value = "";
        delete activePositionRename.dataset.userEdited;
        activePositionRename.blur();
      }
    });
    activePositionRename.addEventListener("blur", commitActiveRename);
  }

  try {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg || msg.type !== "HS_OMNI_COLLECT_PROGRESS" || !collectBusy) return;
      setCollectUi({ busy: true }, t("collecting"), (msg.label || "…") + (msg.count != null ? " · " + msg.count : ""));
    });
  } catch (_) {}

  /* —— Drop import —— */
  function parseCsvText(text) {
    var rows = [];
    var i = 0;
    var s = String(text || "").replace(/^\uFEFF/, "");
    while (i < s.length) {
      var row = [];
      while (i < s.length) {
        if (s[i] === '"') {
          i++;
          var cell = "";
          while (i < s.length) {
            if (s[i] === '"') {
              if (s[i + 1] === '"') { cell += '"'; i += 2; }
              else { i++; break; }
            } else cell += s[i++];
          }
          row.push(cell);
          if (s[i] === ",") i++;
          else if (s[i] === "\r") { i++; if (s[i] === "\n") i++; break; }
          else if (s[i] === "\n" || i >= s.length) { if (s[i] === "\n") i++; break; }
        } else {
          var c2 = "";
          while (i < s.length && s[i] !== "," && s[i] !== "\n" && s[i] !== "\r") c2 += s[i++];
          row.push(c2);
          if (s[i] === ",") i++;
          else if (s[i] === "\r") { i++; if (s[i] === "\n") i++; break; }
          else if (s[i] === "\n" || i >= s.length) { if (s[i] === "\n") i++; break; }
        }
      }
      if (row.some(function (c) { return String(c).trim() !== ""; })) rows.push(row);
    }
    return rows;
  }

  function csvToObjects(matrix) {
    if (!matrix || !matrix.length) return [];
    var headers = matrix[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var out = [];
    for (var r = 1; r < matrix.length; r++) {
      var o = {};
      headers.forEach(function (h, ci) {
        o[h] = matrix[r][ci] != null ? String(matrix[r][ci]).trim() : "";
      });
      out.push(o);
    }
    return out;
  }

  function detectCsvKind(objs, fileName) {
    if (!objs || !objs.length) return null;
    var first = objs[0];
    var name = String(fileName || "").toLowerCase();
    if (first.price != null && first.qty != null && (first.side || first.trade_type)) return "trades";
    if (first.transfer_type) {
      var tt = String(first.transfer_type).toLowerCase();
      if (tt.indexOf("funding") >= 0) return "funding";
      if (tt.indexOf("realized") >= 0 || tt.indexOf("pnl") >= 0) return "realizedPnl";
      return "transfers";
    }
    if (/trade/i.test(name)) return "trades";
    if (/fund/i.test(name)) return "funding";
    if (/pnl|realized/i.test(name)) return "realizedPnl";
    if (/transfer/i.test(name)) return "transfers";
    return null;
  }

  function isOmniExport(obj) {
    if (!obj || typeof obj !== "object") return false;
    var fmt = String(obj.format || "").toLowerCase();
    if (fmt === "variational-dashboard-export" || fmt === "variational-points-export") return true;
    if (obj.points_summary && (Array.isArray(obj.trades) || Array.isArray(obj.points_history))) return true;
    if (Array.isArray(obj.trades) && obj.exported_at) return true;
    return false;
  }

  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(reader.error || new Error("read")); };
      reader.readAsText(file);
    });
  }

  async function importFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    if (dropHint) dropHint.textContent = t("importProgress");
    var bundle = { trades: [], funding: [], realizedPnl: [], transfers: [], files: {} };
    var jsonPayload = null;
    var imported = 0;

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      try {
        var text = await readFileText(file);
        if (/\.json$/i.test(file.name) || (file.type || "").indexOf("json") >= 0) {
          var data = JSON.parse(text);
          if (!isOmniExport(data)) continue;
          jsonPayload = data;
          var trades = (data.trades || []).map(function (t) {
            return Object.assign({}, t, {
              underlying: t.underlying || (t.instrument && t.instrument.underlying) || "",
            });
          });
          bundle.trades = bundle.trades.concat(trades);
          bundle.transfers = bundle.transfers.concat(data.transfers || []);
          imported++;
        } else {
          var objs = csvToObjects(parseCsvText(text));
          var kind = detectCsvKind(objs, file.name);
          if (!kind) continue;
          bundle[kind] = (bundle[kind] || []).concat(objs);
          bundle.files[kind] = { name: file.name, at: Date.now(), rows: bundle[kind].length };
          imported++;
        }
      } catch (_) {}
    }

    if (!imported) {
      if (dropHint) dropHint.textContent = t("unrecognizedFile");
      return;
    }

    var forceSlot = (dropFile && dropFile.dataset.forceSlot) || "";
    var doReplace = !!(dropFile && dropFile.dataset.forceReplace === "1");
    var fileLabel = files.length === 1 ? files[0].name : files.length + " files";

    chrome.runtime.sendMessage(
      {
        type: "HS_WIDGET_IMPORT_LOCAL",
        legacyCsv: bundle,
        payload: jsonPayload,
        label: desiredPositionLabel() || fileLabel,
        fileName: fileLabel,
        broadcast: !!jsonPayload,
        origin: "extension-drop",
        autoNewLeg: false,
        slotId: forceSlot,
        replace: doReplace,
        forceNew: true,
      },
      function (res) {
        void chrome.runtime.lastError;
        if (dropFile) {
          delete dropFile.dataset.forceSlot;
          delete dropFile.dataset.forceReplace;
          delete dropFile.dataset.forceMerge;
        }
        if (!res || !res.ok) {
          if (dropHint) dropHint.textContent = (res && res.error) || t("failure");
          return;
        }
        if (dropHint) {
          dropHint.textContent =
            t("csvMergeOk") +
            (res.slotLabel ? " → " + res.slotLabel : "") +
            " · " + (res.tradeCount || 0) + " " + t("trades") +
            (res.libraryCount ? " · " + t("csvCount").replace("{n}", String(res.libraryCount)) : "");
        }
        loadState();
        setPage("positions");
        setTimeout(updateHints, 4000);
      }
    );
  }

  if (dropZone && dropFile) {
    ["dragenter", "dragover"].forEach(function (ev) {
      dropZone.addEventListener(ev, function (e) {
        e.preventDefault();
        dropZone.classList.add("is-drag");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dropZone.addEventListener(ev, function (e) {
        e.preventDefault();
        dropZone.classList.remove("is-drag");
      });
    });
    dropZone.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files) importFiles(e.dataTransfer.files);
    });
    dropFile.addEventListener("change", function () {
      importFiles(dropFile.files);
      dropFile.value = "";
    });
  }

  /* —— Sync Hypersheets —— */
  if (syncHsBtn) {
    syncHsBtn.addEventListener("click", function (e) {
      e.preventDefault();
      syncHsBtn.disabled = true;
      if (syncHsStatus) {
        syncHsStatus.textContent = t("syncSending");
        syncHsStatus.className = "status";
      }
      chrome.runtime.sendMessage({ type: "HS_WIDGET_SYNC_HYPERSHEETS" }, function (res) {
        syncHsBtn.disabled = false;
        var err = chrome.runtime.lastError;
        if (err || !res || !res.ok) {
          var msg = (err && err.message) || (res && res.error) || t("syncFailed");
          if (syncHsStatus) {
            syncHsStatus.textContent = msg;
            syncHsStatus.className = "status err";
          }
          toast(msg, "err");
          return;
        }
        var c = res.counts || {};
        var okMsg =
          (res.hsTabs != null ? res.hsTabs + " " + t("tabsCount") : t("ok")) +
          (c.trades != null ? " · " + c.trades + " " + t("trades") : "") +
          (c.points != null ? " · " + c.points + " " + t("epochs") : "");
        if (syncHsStatus) {
          syncHsStatus.textContent = okMsg;
          syncHsStatus.className = "status ok";
        }
        toast(t("synced"), "ok");
      });
    });
  }

  /* —— Volume —— */
  if (volSourceEl) {
    volSourceEl.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest("button[data-src]");
      if (!btn) return;
      var src = btn.getAttribute("data-src");
      if (!src || src === volSource) return;
      volSource = src;
      volLegs = [];
      volPeriod = normalizeVolPeriod(volSource, volPeriod);
      persistVolPrefs();
      renderVolSource();
      renderVolPeriodPills();
      loadVolume();
    });
  }
  if (volSlotEl) {
    volSlotEl.addEventListener("change", function () {
      var next = volSlotEl.value || "all";
      if (next === getVolSlot()) return;
      setVolSlot(next);
      persistVolPrefs();
      loadVolume();
    });
  }
  if (volPeriodEl) {
    volPeriodEl.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest("button[data-period]");
      if (!btn) return;
      var p = btn.getAttribute("data-period");
      if (!p || p === volPeriod) return;
      volPeriod = p;
      persistVolPrefs();
      renderVolPeriodPills();
      loadVolume();
    });
  }

  function bindAlertPrefs() {
    if (alertFoldEl) {
      alertFoldEl.addEventListener("click", function () {
        persistAlertPrefs(snapshotAlertPrefs({ collapsed: !alertPrefs.collapsed }));
      });
    }
    if (alertReminderFoldEl) {
      alertReminderFoldEl.addEventListener("click", function () {
        persistAlertPrefs(snapshotAlertPrefs({ remindersCollapsed: !alertPrefs.remindersCollapsed }));
      });
    }
    if (alertEnabledEl) {
      alertEnabledEl.addEventListener("change", function () {
        persistAlertPrefs(snapshotAlertPrefs());
        toast(t("alertSaved"), "ok");
      });
    }
    if (alertScopeEl) {
      alertScopeEl.addEventListener("change", function () {
        persistAlertPrefs(snapshotAlertPrefs());
      });
    }
    if (alertDirectionEl) {
      alertDirectionEl.addEventListener("change", function () {
        persistAlertPrefs(snapshotAlertPrefs());
      });
    }
    if (alertThresholdEl) {
      var commit = function () {
        persistAlertPrefs(snapshotAlertPrefs());
      };
      alertThresholdEl.addEventListener("change", commit);
      alertThresholdEl.addEventListener("blur", commit);
      alertThresholdEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") commit();
      });
    }
    if (alertSoundEl) {
      alertSoundEl.addEventListener("change", function () {
        persistAlertPrefs(snapshotAlertPrefs());
      });
    }
    if (alertHlMissingEl) {
      alertHlMissingEl.addEventListener("change", function () {
        persistAlertPrefs(snapshotAlertPrefs());
      });
    }
    if (alertRedundancyEnabledEl) {
      alertRedundancyEnabledEl.addEventListener("change", function () {
        persistAlertPrefs(snapshotAlertPrefs({
          redundancy: {
            enabled: !!alertRedundancyEnabledEl.checked,
            everyHours: alertPrefs.redundancy && alertPrefs.redundancy.everyHours ? alertPrefs.redundancy.everyHours : 1,
            title: alertRedundancyTitleInputEl ? alertRedundancyTitleInputEl.value.slice(0, 48) : "",
          },
        }));
      });
    }
    if (alertRedundancyMinusEl) {
      alertRedundancyMinusEl.addEventListener("click", function () {
        var nextHours = Math.max(1, ((alertPrefs.redundancy && alertPrefs.redundancy.everyHours) || 1) - 1);
        persistAlertPrefs(snapshotAlertPrefs({
          redundancy: {
            enabled: alertRedundancyEnabledEl ? !!alertRedundancyEnabledEl.checked : false,
            everyHours: nextHours,
            title: alertRedundancyTitleInputEl ? alertRedundancyTitleInputEl.value.slice(0, 48) : "",
          },
        }));
      });
    }
    if (alertRedundancyPlusEl) {
      alertRedundancyPlusEl.addEventListener("click", function () {
        var nextHours = Math.min(24, ((alertPrefs.redundancy && alertPrefs.redundancy.everyHours) || 1) + 1);
        persistAlertPrefs(snapshotAlertPrefs({
          redundancy: {
            enabled: alertRedundancyEnabledEl ? !!alertRedundancyEnabledEl.checked : false,
            everyHours: nextHours,
            title: alertRedundancyTitleInputEl ? alertRedundancyTitleInputEl.value.slice(0, 48) : "",
          },
        }));
      });
    }
    if (alertRedundancyTitleInputEl) {
      var commitRedundancyTitle = function () {
        persistAlertPrefs(snapshotAlertPrefs({
          redundancy: {
            enabled: alertRedundancyEnabledEl ? !!alertRedundancyEnabledEl.checked : false,
            everyHours: alertPrefs.redundancy && alertPrefs.redundancy.everyHours ? alertPrefs.redundancy.everyHours : 1,
            title: alertRedundancyTitleInputEl.value.slice(0, 48),
          },
        }));
      };
      alertRedundancyTitleInputEl.addEventListener("change", commitRedundancyTitle);
      alertRedundancyTitleInputEl.addEventListener("blur", commitRedundancyTitle);
    }
    if (alertPositionsEl) {
      alertPositionsEl.addEventListener("change", function (e) {
        var enabledEl = e.target && e.target.closest("[data-alert-pos-enabled]");
        var dirEl = e.target && e.target.closest("[data-alert-pos-direction]");
        var thrEl = e.target && e.target.closest("[data-alert-pos-threshold]");
        var next = normalizeAlertPrefs(alertPrefs);
        next.positions = Object.assign({}, next.positions || {});
        var id = enabledEl ? enabledEl.getAttribute("data-alert-pos-enabled")
          : dirEl ? dirEl.getAttribute("data-alert-pos-direction")
          : thrEl ? thrEl.getAttribute("data-alert-pos-threshold")
          : "";
        if (!id) return;
        var cur = next.positions[id] || { enabled: false, direction: "above", threshold: 100 };
        next.positions[id] = {
          enabled: enabledEl ? !!enabledEl.checked : !!cur.enabled,
          direction: dirEl ? dirEl.value : cur.direction,
          threshold: thrEl ? thrEl.value : cur.threshold,
        };
        persistAlertPrefs(next);
      });
      alertPositionsEl.addEventListener("keydown", function (e) {
        var thrEl = e.target && e.target.closest("[data-alert-pos-threshold]");
        if (thrEl && e.key === "Enter") thrEl.blur();
      });
    }
    if (alertAddReminderEl) {
      alertAddReminderEl.addEventListener("click", function () {
        var next = snapshotAlertPrefs();
        next.reminders = (next.reminders || []).slice();
        next.reminders.push({
          id: newReminderId(),
          enabled: true,
          time: "09:00",
          title: "",
          sound: next.sound || "beep",
          positionId: "",
        });
        persistAlertPrefs(next, { rebuildLists: true, forceLists: true });
        toast(t("alertReminderActive"), "ok");
      });
    }
    if (alertRemindersEl) {
      alertRemindersEl.addEventListener("click", function (e) {
        var testBtn = e.target && e.target.closest("[data-reminder-test]");
        if (testBtn) {
          var testId = testBtn.getAttribute("data-reminder-test");
          var row = testBtn.closest("[data-reminder-id]");
          var sound = row && row.querySelector('[data-reminder-sound="' + testId + '"]')
            ? row.querySelector('[data-reminder-sound="' + testId + '"]').value
            : "beep";
          chrome.runtime.sendMessage({ type: "HS_WIDGET_PREVIEW_SOUND", sound: sound }, function () {
            void chrome.runtime.lastError;
          });
          return;
        }
        var removeBtn = e.target && e.target.closest("[data-reminder-remove]");
        if (!removeBtn) return;
        var id = removeBtn.getAttribute("data-reminder-remove");
        var next = snapshotAlertPrefs();
        next.reminders = (next.reminders || []).filter(function (item) { return item.id !== id; });
        persistAlertPrefs(next, { rebuildLists: true, forceLists: true });
      });
      alertRemindersEl.addEventListener("change", function (e) {
        var row = e.target && e.target.closest("[data-reminder-id]");
        if (!row) return;
        var id = row.getAttribute("data-reminder-id");
        var next = snapshotAlertPrefs();
        next.reminders = (next.reminders || []).map(function (item) {
          if (item.id !== id) return item;
          var hour = row.querySelector('[data-reminder-hour="' + id + '"]');
          var minute = row.querySelector('[data-reminder-minute="' + id + '"]');
          return {
            id: item.id,
            enabled: !!row.querySelector('[data-reminder-enabled="' + id + '"]')?.checked,
            time: ((hour ? hour.value : "09") || "09") + ":" + ((minute ? minute.value : "00") || "00"),
            title: (row.querySelector('[data-reminder-title="' + id + '"]')?.value || "").slice(0, 48),
            sound: row.querySelector('[data-reminder-sound="' + id + '"]')?.value || "beep",
            positionId: row.querySelector('[data-reminder-position="' + id + '"]')?.value || "",
          };
        });
        persistAlertPrefs(next);
        var saved = (next.reminders || []).filter(function (item) { return item.id === id; })[0];
        if (saved && saved.enabled) toast(t("alertReminderActive"), "ok");
      });
    }
  }
  bindAlertPrefs();

  document.getElementById("langSwitch")?.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest("button[data-lang]");
    if (!btn) return;
    setLang(btn.getAttribute("data-lang"));
  });

  /* —— Popout —— */
  var popOut = document.getElementById("popOut");
  if (popOut) {
    popOut.addEventListener("click", function (e) {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: "HS_WIDGET_DETACH" }, function () {
        void chrome.runtime.lastError;
      });
    });
  }

  /* —— Boot —— */
  try {
    chrome.storage.local.get([ORDER_KEY, PAGE_KEY, COLLAPSE_KEY, VOL_KEY, LANG_KEY, ALERT_KEY, "hsWidgetSnapshot"], function (st) {
      if (Array.isArray(st && st[ORDER_KEY])) pairOrder = st[ORDER_KEY].slice();
      if (st && st[COLLAPSE_KEY] && typeof st[COLLAPSE_KEY] === "object") {
        collapsedLegs = st[COLLAPSE_KEY];
      }
      currentLang = st && st[LANG_KEY] === "en" ? "en" : "fr";
      applyStaticI18n();
      document.querySelectorAll("#langSwitch button[data-lang]").forEach(function (btn) {
        btn.classList.toggle("is-on", btn.getAttribute("data-lang") === currentLang);
      });
      var prefs = st && st[VOL_KEY];
      if (prefs && typeof prefs === "object") {
        if (prefs.source === "omni" || prefs.source === "hl" || prefs.source === "xyz") {
          volSource = prefs.source;
        }
        if (prefs.period) volPeriod = normalizeVolPeriod(volSource, String(prefs.period));
        if (prefs.slotBySource && typeof prefs.slotBySource === "object") {
          ["omni", "hl", "xyz"].forEach(function (k) {
            if (prefs.slotBySource[k]) volSlotBySource[k] = String(prefs.slotBySource[k]);
          });
        } else if (prefs.slotId) {
          // migrate old single-slot prefs
          volSlotBySource.omni = String(prefs.slotId);
        }
      }
      alertPrefs = normalizeAlertPrefs(st && st[ALERT_KEY]);
      alertPrefs.collapsed = true;
      alertPrefs.remindersCollapsed = true;
      renderAlertPrefs();
      renderPositions((st && st.hsWidgetSnapshot) || null);
      var page = st && st[PAGE_KEY];
      if (page === "collecte") setPage("collecte");
      else setPage("positions");
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local") return;
      if (changes.hsWidgetSnapshot) {
        scheduleRenderPositions(changes.hsWidgetSnapshot.newValue || null);
      }
      if (changes.hsWidgetSync) {
        loadState();
        if (volSection && !volSection.hidden) loadVolume({ silent: true });
      }
      if (changes[ALERT_KEY]) {
        alertPrefs = normalizeAlertPrefs(changes[ALERT_KEY].newValue);
        // Lists already updated by persistAlertPrefs; avoid rebuild during select blur.
        renderAlertPrefs({ rebuildLists: false });
      }
      if (changes[ORDER_KEY] && Array.isArray(changes[ORDER_KEY].newValue)) {
        pairOrder = changes[ORDER_KEY].newValue.slice();
        if (lastSnap) scheduleRenderPositions(lastSnap);
      }
    });
  } catch (_) {}

  loadState();
  try {
    var man = chrome.runtime.getManifest();
    if (foot && man && man.version) {
      foot.textContent = (foot.textContent || "") + " · ext v" + man.version;
    }
  } catch (_) {}
  try {
    chrome.runtime.sendMessage({ type: "HS_WIDGET_REFRESH" }, function () {
      void chrome.runtime.lastError;
    });
  } catch (_) {}

  // Live mid refresh while the panel is open (~12s, same cadence as Hypersheets).
  // Chrome alarms cannot fire more often than ~1 min; this keeps marks tight.
  var MARKS_POLL_MS = 12000;
  setInterval(function () {
    try {
      chrome.runtime.sendMessage({ type: "HS_WIDGET_REFRESH", marksOnly: true }, function () {
        void chrome.runtime.lastError;
      });
    } catch (_) {}
  }, MARKS_POLL_MS);
})();
