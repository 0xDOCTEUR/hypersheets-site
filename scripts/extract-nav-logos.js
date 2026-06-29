const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const imgDir = path.join(root, 'img');
fs.mkdirSync(imgDir, { recursive: true });

const sidebarStart = html.indexOf('<div id="sidebar">');
const sidebarEnd = html.indexOf('</div>', html.indexOf('id="navTabs"', sidebarStart));
const sidebar = html.slice(sidebarStart, sidebarEnd > sidebarStart ? sidebarEnd : sidebarStart + 50000);

const tabs = [
  { tab: 'hyperliquid', file: 'hyperliquid-logo.png' },
  { tab: 'tradexyz', file: 'tradexyz-logo.png' },
  { tab: 'hyperunit', file: 'hyperunit-logo.png' },
];

for (const { tab, file } of tabs) {
  const re = new RegExp(
    `<span class="nav-tab" data-tab="${tab}" onclick="if\\(typeof switchPage[\\s\\S]*?<img src="(data:image/[^"]+)"`
  );
  const m = sidebar.match(re);
  if (!m) throw new Error(`Sidebar logo not found for ${tab}`);
  const b64 = m[1].replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  fs.writeFileSync(path.join(imgDir, file), buf);
  const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
  console.log(`Wrote ${file} (${buf.length} bytes, md5:${hash})`);
}
