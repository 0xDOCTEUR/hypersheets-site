(function () {
  "use strict";

  function beepPattern(freqs, durationMs, gapMs) {
    var Ctx = self.AudioContext || self.webkitAudioContext;
    if (!Ctx) return;
    var ctx = new Ctx();
    try { ctx.resume(); } catch (_) {}
    var now = ctx.currentTime;
    freqs.forEach(function (freq, index) {
      var start = now + index * ((durationMs + gapMs) / 1000);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.24, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + durationMs / 1000 + 0.02);
    });
    setTimeout(function () {
      ctx.close().catch(function () {});
    }, freqs.length * (durationMs + gapMs) + 120);
  }

  function playSound(kind) {
    if (kind === "none") return;
    if (kind === "double") return beepPattern([880, 880], 140, 80);
    if (kind === "ping") return beepPattern([1046], 220, 40);
    return beepPattern([740], 180, 40);
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || msg.type !== "HS_WIDGET_PLAY_SOUND") return;
    try { playSound(msg.sound || "beep"); } catch (_) {}
  });
})();
