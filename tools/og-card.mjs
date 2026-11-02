// The link preview picture: what LinkedIn, WhatsApp, iMessage, Slack and others show with a link to the site (the
// layout's og:image), one per language, 1200×630, from tools/og/card.html: the name (the owner file, as on the legal
// pages), the home page's short line (strings.<lang>.json home.short) and the domain, in the site's dark look, with
// Bit on the name. Writes static/img/og/card.<lang>.png; run it again when the name or the line changes.
// Needs the local build served, for the font and the companions' file (python3 tools/serve.py):
//   node tools/og-card.mjs [base]          base defaults to http://127.0.0.1:8790
//   BIT=no node tools/og-card.mjs          without Bit
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const base = process.argv[2] || 'http://127.0.0.1:8790';
const LANGS = ['en', 'de'];
const read = rel => readFileSync(new URL(rel, ROOT), 'utf8');
const esc = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const site = JSON.parse(read('content/site.json'));
const ownerFile = (process.env.ARES_OWNER_FILE || '~/.config/ares-empire/owner.json').replace(/^~(?=\/)/, homedir());
const owner = JSON.parse(readFileSync(ownerFile, 'utf8'));
const template = read('tools/og/card.html');
const out = new URL('static/img/og/', ROOT);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
let failed = false;
for (const lang of LANGS) {
  const strings = JSON.parse(read(`content/strings.${lang}.json`));
  const html = template
    .replaceAll('{{lang}}', lang)
    .replaceAll('{{name}}', esc(owner.name))
    .replaceAll('{{line}}', esc(strings.home.short))
    .replaceAll('{{domain}}', esc(site.domain))
    .replaceAll('{{bit}}', process.env.BIT === 'no' ? 'no' : 'yes');
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  // The card is served from the site's own address, so the font and the companions' files load as on the site.
  await page.route(`${base}/__card`, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(`${base}/__card`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 20000 });
  const ready = await page.evaluate(() => document.body.dataset.ready);
  if (ready !== 'yes' || errors.length) {
    console.error(`card.${lang}: ${ready}; ${errors.join(' | ')}`);
    failed = true;
  }
  const file = fileURLToPath(new URL(`card.${lang}.png`, out));
  await page.screenshot({ path: file });
  console.log(`wrote static/img/og/card.${lang}.png`);
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
