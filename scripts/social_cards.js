#!/usr/bin/env node
/* Render social share cards (1200 x 630) in the site's design: one for the home
   page and one per post, into assets/social/. Run after adding or renaming a post:

       node scripts/social_cards.js

   Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium). */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'assets', 'social');
fs.mkdirSync(out, { recursive: true });

function frontMatter(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = /^---\n([\s\S]*?)\n---/.exec(src);
  const fm = {};
  if (m) for (const line of m[1].split('\n')) { const k = line.match(/^(\w+):\s*(.*)$/); if (k) fm[k[1]] = k[2].replace(/^"|"$/g, ''); }
  return fm;
}
function slugOf(file) { return path.basename(file, '.md').replace(/^\d{4}-\d{2}-\d{2}-/, ''); }

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const page = (title, kicker, small) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..700&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:1200px;height:630px;background:#0b1220;color:#e9edf4;font-family:"Bricolage Grotesque",sans-serif;overflow:hidden}
  .card{position:relative;width:1200px;height:630px;padding:72px 80px 150px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between}
  .kicker{font-size:26px;color:#aab4c6;margin:0}
  .title{font-size:${small ? 60 : 72}px;font-weight:500;line-height:1.08;letter-spacing:-0.025em;margin:0;max-width:980px;text-wrap:balance}
  .foot{display:flex;justify-content:space-between;align-items:flex-end;font-size:26px;color:#aab4c6}
  .foot b{color:#e9edf4;font-weight:600}
  svg{position:absolute;left:0;right:0;bottom:0;width:1200px;height:120px}
</style></head><body><div class="card">
<p class="kicker">${esc(kicker)}</p>
<h1 class="title">${esc(title)}</h1>
<div class="foot"><span><b>Pascal Rodriguez</b> · CTO &amp; Partner, Visium</span><span>sliceofcode.net</span></div>
<svg viewBox="0 70 1200 120" preserveAspectRatio="none" fill="none" stroke-linecap="round">
  <path d="M-20 150c80 0 120-50 200-50s120 70 200 70 120-90 200-90 120 60 200 60 120-40 200-40 120 30 240 30" stroke="#e9edf4" stroke-opacity=".16" stroke-width="2"/>
  <path d="M-20 175c80 0 120-30 200-30s120 50 200 50 120-70 200-70 120 40 200 40 120-30 200-30 120 20 240 20" stroke="#e9edf4" stroke-opacity=".10" stroke-width="2"/>
  <path d="M-20 160c80 0 120 40 200 40s120-110 200-110 120 120 200 120 120-70 200-70 120 50 200 50 120-20 240-20" stroke="#ffb648" stroke-width="5"/>
</svg></div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const render = async (name, html) => {
    await p.setContent(html, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(out, name + '.png'), type: 'png' });
    console.log('wrote assets/social/' + name + '.png');
  };
  await render('home', page('Building trusted AI for industries that cannot afford a wrong answer.', 'Lausanne, Switzerland', false));
  for (const f of fs.readdirSync(path.join(root, '_posts')).filter(f => f.endsWith('.md'))) {
    const fm = frontMatter(path.join(root, '_posts', f));
    const date = new Date(f.slice(0, 10)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    await render(slugOf(f), page(fm.title || slugOf(f), 'Writing · ' + date, (fm.title || '').length > 48));
  }
  await browser.close();
})();
