const fs = require('fs');
const path = require('path');
const clean = fs.readFileSync(path.join(__dirname, '../index-signals-tabs-preview.html'), 'utf8');
let out = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

const start = '  const interp = {';
const end = '  if (oi !== null) {';

function extract(src) {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a);
  if (a < 0 || b < 0) return null;
  return src.slice(a, b);
}

const chunk = extract(clean);
const oa = out.indexOf(start);
const ob = out.indexOf(end, oa);
if (!chunk || oa < 0 || ob < 0) {
  console.error('failed', { hasChunk: !!chunk, oa, ob });
  process.exit(1);
}
out = out.slice(0, oa) + chunk + out.slice(ob);
fs.writeFileSync(path.join(__dirname, '../index.html'), out, 'utf8');
console.log('interp replaced ok');
