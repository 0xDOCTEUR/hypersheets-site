const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const imgDir = path.join(root, 'img');
fs.mkdirSync(imgDir, { recursive: true });

const tabs = [
  { tab: 'hyperliquid', file: 'hyperliquid-logo.png' },
  { tab: 'tradexyz', file: 'tradexyz-logo.png' },
  { tab: 'hyperunit', file: 'hyperunit-logo.png' },
];

for (const { tab, file } of tabs) {
  const re = new RegExp(`data-tab="${tab}"[\\s\\S]*?<img src="(data:image/[^"]+)"`);
  const m = html.match(re);
  if (!m) throw new Error(`Logo not found for ${tab}`);
  const b64 = m[1].replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(path.join(imgDir, file), Buffer.from(b64, 'base64'));
  console.log('Wrote', file);
}
