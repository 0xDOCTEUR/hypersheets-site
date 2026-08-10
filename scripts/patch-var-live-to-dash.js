const fs = require('fs');
const p = require('path').join(__dirname, '..', 'js', 'variational-omni.js');
let s = fs.readFileSync(p, 'utf8');

const reps = [
  ["_varSub === 'live'", 'varIsLiveDashTab()'],
  ["_varSub !== 'live'", '!varIsLiveDashTab()'],
  ["varSetSub('live',", "varSetSub('dashboard',"],
];
let n = 0;
for (const [a, b] of reps) {
  const c = s.split(a).length - 1;
  if (c) {
    s = s.split(a).join(b);
    n += c;
    console.log('replaced', c, a);
  }
}

const oldHash = `        '#var-omni-live': 'live',
        '#var-omni-import': 'live',
        '#var-radar': 'radar',`;
const newHash = `        '#var-omni-live': 'dashboard',
        '#var-omni-import': 'dashboard',
        '#var-suivi': 'suivi',
        '#var-classement': 'classement',
        '#classement': 'classement',
        '#var-extension': 'extension',
        '#var-radar': 'radar',`;
if (s.includes(oldHash)) s = s.replace(oldHash, newHash);
else console.warn('hash block not found');

s = s.replace("varNormalizeSub(_varSub || 'live')", "varNormalizeSub(_varSub || 'dashboard')");

fs.writeFileSync(p, s);
console.log('done total', n);
