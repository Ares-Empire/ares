// The site's look: dark (the default for every first visit, Patrik 2026-10-26), light, or red (red and gold). A
// visitor's choice is kept in this browser (the privacy policy says so). Loaded in <head> without defer, so the page
// is drawn in the right look from the start.
(() => {
  const KEY = 'look', LOOKS = ['light', 'dark', 'red'], DEFAULT = 'dark';
  const BG = { light: '#ecedf2', dark: '#050507', red: '#16040a' };      // the browser's bar follows the look
  const root = document.documentElement;
  let chosen = null;                                                    // this page's choice, if storage is off

  const saved = () => {
    try { const v = localStorage.getItem(KEY); return LOOKS.includes(v) ? v : null; } catch { return null; }
  };
  const apply = () => {
    const look = chosen || saved() || DEFAULT;
    root.dataset.theme = look;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = BG[look];
    for (const b of document.querySelectorAll('[data-look]')) b.setAttribute('aria-pressed', String(b.dataset.look === look));
  };

  apply();
  // Scripts run: site.css lays out what they enhance (the apps page's tabs, static/js/apps.js) from the first frame
  // instead of jumping once they have run. Without scripts, html has no "js" and the page shows everything plainly.
  root.classList.add('js');
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    for (const b of document.querySelectorAll('[data-look]')) {
      b.addEventListener('click', () => {
        chosen = b.dataset.look;
        try { localStorage.setItem(KEY, chosen); } catch { /* not remembered; this page keeps it */ }
        apply();
      });
    }
  });
})();
