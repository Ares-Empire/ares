// Screenshots of the site, desktop and phone, in each look (light, dark, red): node tools/shoot.mjs <outdir> [base] [pages...]
// base defaults to the local build (python3 tools/serve.py, which sends the server's CSP); for the live site pass
// https://patrikbreeck.com and set SITE_AUTH=user:password while it is behind the password.
import { chromium } from 'playwright';

const out = process.argv[2] || '.';
const base = process.argv[3] || 'http://127.0.0.1:8790';
const pages = process.argv.slice(4).length ? process.argv.slice(4) : ['/en/', '/de/', '/en/apps/', '/de/impressum/'];
const views = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];
const looks = (process.env.LOOKS || 'light,dark,red').split(',');

const browser = await chromium.launch();
for (const v of views) {
  for (const look of looks) {
    const auth = process.env.SITE_AUTH?.split(':');
    const ctx = await browser.newContext({ ...v, colorScheme: look === 'light' ? 'light' : 'dark', ...(auth ? { httpCredentials: { username: auth[0], password: auth.slice(1).join(':') } } : {}) });
    await ctx.addInitScript(l => localStorage.setItem('look', l), look);   // as if the visitor picked it
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', r => errors.push(`failed: ${r.url()}`));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()}: ${r.url()}`); });
    for (const p of pages) {
      await page.goto(base + p, { waitUntil: 'networkidle' });
      await page.waitForTimeout(Number(process.env.WAIT) || (p.match(/^\/(en|de)\/$/) ? 5000 : 600));
      const file = `${out}/${v.name}-${look}${p.replace(/\//g, '_')}.png`;
      await page.screenshot({ path: file, fullPage: true });
    }
    if (errors.length) console.log(`${v.name}/${look}:\n  ` + [...new Set(errors)].join('\n  '));
    await ctx.close();
  }
}
await browser.close();
console.log('done');
