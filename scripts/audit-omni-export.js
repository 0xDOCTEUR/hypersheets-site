#!/usr/bin/env node
/**
 * Audit a Variational / Hypersheets Omni export for per-epoch volume + PnL completeness.
 *
 * Usage:
 *   node scripts/audit-omni-export.js path/to/omni-XX_….json
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/audit-omni-export.js <export.json>');
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(file), 'utf8');
const j = JSON.parse(raw);

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function epochStartUtc(ts) {
  const x = new Date(ts);
  const day = x.getUTCDay();
  const diff = (day + 3) % 7;
  x.setUTCDate(x.getUTCDate() - diff);
  x.setUTCHours(0, 0, 0, 0);
  return +x;
}

function inWin(d, s, e) {
  const t = new Date(d).getTime();
  return t >= s && t < e;
}

const trades = Array.isArray(j.trades) ? j.trades : [];
const transfers = Array.isArray(j.transfers) ? j.transfers : [];
const hist = Array.isArray(j.points_history) ? j.points_history : [];
const warnings = Array.isArray(j.warnings) ? j.warnings : [];
const completeness = j.completeness || null;

const cash = { realized_pnl: 0, funding: 0, fee: 0, other: 0 };
for (const t of transfers) {
  const tt = String(t.transfer_type || '').toLowerCase();
  if (tt === 'realized_pnl' || tt === 'funding' || tt === 'fee') cash[tt] += 1;
  else cash.other += 1;
}

const tradeTs = trades.map((t) => Date.parse(t.created_at)).filter(isFinite).sort((a, b) => a - b);
const xferTs = transfers.map((t) => Date.parse(t.created_at)).filter(isFinite).sort((a, b) => a - b);

const hitTradeCap = trades.length >= 8000 || (warnings.some((w) => /trades_truncated/i.test(w)));
const hitXferCap = transfers.length >= 12000 || (warnings.some((w) => /transfers_truncated/i.test(w)));
const xferFailed = warnings.some((w) => /^transfers:/i.test(w));

console.log('=== Omni export audit ===');
console.log('file:', path.basename(file));
console.log('wallet:', j.wallet_suffix || j.omni_address || '—');
console.log('exported_at:', j.exported_at || '—');
console.log('');
console.log('counts:');
console.log('  trades     ', trades.length, hitTradeCap ? '⚠ near/at CAP (8000) — older volume incomplete' : 'ok');
console.log('  transfers  ', transfers.length, hitXferCap ? '⚠ near/at CAP (12000) — older PnL incomplete' : (xferFailed ? '⚠ FAILED' : 'ok'));
console.log('  cash rows  ', `rpnl=${cash.realized_pnl} funding=${cash.funding} fee=${cash.fee} other=${cash.other}`);
console.log('  points hist', hist.length);
if (warnings.length) console.log('  warnings   ', warnings.join(' | '));
if (completeness) {
  console.log('  completeness.precise_epoch_volume:', completeness.precise_epoch_volume);
  console.log('  completeness.precise_epoch_pnl   :', completeness.precise_epoch_pnl);
  console.log('  truncations:', JSON.stringify(completeness.truncations || {}));
}
console.log('');
console.log('span:');
if (tradeTs.length) {
  console.log('  trades   ', new Date(tradeTs[0]).toISOString(), '→', new Date(tradeTs[tradeTs.length - 1]).toISOString());
}
if (xferTs.length) {
  console.log('  transfers', new Date(xferTs[0]).toISOString(), '→', new Date(xferTs[xferTs.length - 1]).toISOString());
}

const now = Date.now();
const liveStart = epochStartUtc(now);
const weeks = [];
for (let i = 0; i < 8; i++) {
  const start = liveStart - i * 7 * 864e5;
  const end = start + 7 * 864e5;
  weeks.push({ start, end, label: new Date(start).toISOString().slice(0, 10) });
}

// Also include published weekly windows
for (const p of hist) {
  const s = Date.parse(p.start_window);
  const e = Date.parse(p.end_window);
  if (!(s > 0 && e > s)) continue;
  const days = (e - s) / 864e5;
  if (days < 6.5 || days > 7.5) continue;
  const key = new Date(s).toISOString().slice(0, 10);
  if (!weeks.some((w) => w.label === key)) weeks.push({ start: s, end: e, label: key });
}
weeks.sort((a, b) => b.start - a.start);

console.log('');
console.log('per-epoch (confirmed trades + cash transfers):');
console.log(
  'epoch'.padEnd(12),
  'vol$'.padStart(12),
  'trades'.padStart(8),
  'pnl$'.padStart(10),
  'rpnl'.padStart(6),
  'fund'.padStart(6),
  'fee'.padStart(5),
  'notes'
);

const oldestTrade = tradeTs[0] || null;
const oldestXfer = xferTs[0] || null;

for (const w of weeks.slice(0, 8)) {
  let vol = 0;
  let nTr = 0;
  let rpnl = 0;
  let fund = 0;
  let fee = 0;
  let nRp = 0;
  let nFu = 0;
  let nFe = 0;
  for (const t of trades) {
    if (t.status !== 'confirmed' || !inWin(t.created_at, w.start, w.end)) continue;
    vol += Math.abs(num(t.price) * num(t.qty));
    nTr += 1;
  }
  for (const t of transfers) {
    if (t.status !== 'confirmed' || !inWin(t.created_at, w.start, w.end)) continue;
    const tt = String(t.transfer_type || '').toLowerCase();
    const q = num(t.qty);
    if (tt === 'realized_pnl') { rpnl += q; nRp += 1; }
    else if (tt === 'funding') { fund += q; nFu += 1; }
    else if (tt === 'fee') { fee += q; nFe += 1; }
  }
  const pnl = rpnl + fund + fee;
  const notes = [];
  if (hitTradeCap && oldestTrade != null && w.start < oldestTrade) notes.push('vol-gap');
  if ((hitXferCap || xferFailed) && oldestXfer != null && w.start < oldestXfer) notes.push('pnl-gap');
  if (nTr > 0 && nRp + nFu + nFe === 0) notes.push('vol-ok/no-cash');
  if (nTr === 0 && nRp + nFu + nFe === 0) notes.push('empty');
  if (!notes.length && (nTr > 0 || nRp + nFu + nFe > 0)) notes.push('ok');

  console.log(
    w.label.padEnd(12),
    Math.round(vol).toLocaleString('en-US').padStart(12),
    String(nTr).padStart(8),
    Math.round(pnl).toLocaleString('en-US').padStart(10),
    String(nRp).padStart(6),
    String(nFu).padStart(6),
    String(nFe).padStart(5),
    notes.join(',')
  );
}

console.log('');
const canPrecise =
  !hitTradeCap &&
  !hitXferCap &&
  !xferFailed &&
  cash.realized_pnl + cash.funding + cash.fee > 0 &&
  trades.length > 0;

if (canPrecise) {
  console.log('VERDICT: YES — export looks complete enough for precise per-epoch volume + PnL (within collected span).');
} else {
  console.log('VERDICT: PARTIAL — recent epochs may be precise; older ones risk incomplete volume and/or PnL.');
  if (hitTradeCap) console.log('  · trades hit collect cap/timeout → oldest weeks miss volume');
  if (hitXferCap) console.log('  · transfers hit collect cap/timeout → oldest weeks miss PnL');
  if (xferFailed) console.log('  · transfers scrape failed → PnL unreliable');
  if (cash.realized_pnl + cash.funding + cash.fee === 0) console.log('  · no cash transfer rows (realized_pnl/funding/fee)');
}
