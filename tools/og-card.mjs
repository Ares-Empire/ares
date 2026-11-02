// The link preview picture: what LinkedIn, WhatsApp, iMessage, Slack and others show with a link to the site (the
// layout's og:image), one per language, 1200×630, from tools/og/card.html: the name (the owner file, as on the legal
// pages) on two lines, the two short lines under it (strings.<lang>.json meta.cardLine1 and cardLine2) and the domain,
// in the site's dark look. Writes static/img/og/card.<lang>.png; run it again when the name or the lines change.
// It stops when the name or the lines grow wider than the middle square, which small square previews show.
// Needs the local build served, for the font (python3 tools/serve.py):
//   node tools/og-card.mjs [base]          base defaults to http://127.0.0.1:8790
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const base = process.argv[2] || 'http://127.0.0.1:8790';
const LANGS = ['en', 'de'];
const SQUARE = 630, MARGIN = 24;          // the middle square of the picture, and room kept inside it
const read = rel => readFileSync(new URL(rel, ROOT), 'utf8');
const esc = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const spans = parts => parts.map(part => `<span>${esc(part)}</span>`).join('');

const site = JSON.parse(read('content/site.json'));
const ownerFile = (process.env.ARES_OWNER_FILE || '~/.config/ares-empire/owner.json').replace(/^~(?=\/)/, homedir());
const owner = JSON.parse(readFileSync(ownerFile, 'utf8'));
// The name on two lines: the last word under the rest.
const cut = owner.name.trim().lastIndexOf(' ');
const nameLines = cut > 0 ? [owner.name.slice(0, cut), owner.name.slice(cut + 1)] : [owner.name.trim()];
const template = read('tools/og/card.html');
const out = new URL('static/img/og/', ROOT);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
let failed = false;
for (const lang of LANGS) {
  const meta = JSON.parse(read(`content/strings.${lang}.json`)).meta;
  const html = template
    .replaceAll('{{lang}}', lang)
    .replaceAll('{{nameLines}}', spans(nameLines))
    .replaceAll('{{lines}}', spans([meta.cardLine1, meta.cardLine2]))
    .replaceAll('{{domain}}', esc(site.domain));
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  // The card is served from the site's own address, so the font loads as on the site.
  await page.route(`${base}/__card`, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(`${base}/__card`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 20000 });
  // Every line of the name and of the short lines must fit inside the middle square.
  const widest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.card span')].map(span => {
    const range = document.createRange();
    range.selectNodeContents(span);
    return range.getBoundingClientRect().width;
  })));
  if (widest > SQUARE - 2 * MARGIN) {
    errors.push(`a line is ${Math.round(widest)} px wide, more than the middle square allows (${SQUARE - 2 * MARGIN} px)`);
  }
  if (errors.length) {
    console.error(`card.${lang}: ${errors.join(' | ')}`);
    failed = true;
  }
  await page.screenshot({ path: fileURLToPath(new URL(`card.${lang}.png`, out)) });
  console.log(`wrote static/img/og/card.${lang}.png (widest line ${Math.round(widest)} px)`);
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
