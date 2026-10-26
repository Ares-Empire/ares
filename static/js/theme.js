// The site's look: light, dark or red (red and gold). A visitor's choice is kept in this browser (the privacy
// policy says so); without one, the system's light or dark setting decides and is followed when it changes.
// Loaded in <head> without defer, so the page is drawn in the right look from the start.
(() => {
  const KEY = 'look', LOOKS = ['light', 'dark', 'red'];
  const BG = { light: '#ecedf2', dark: '#050507', red: '#16040a' };      // the browser's bar follows the look
  const root = document.documentElement, system = matchMedia('(prefers-color-scheme: dark)');
  let chosen = null;                                                    // this page's choice, if storage is off

  const saved = () => {
    try { const v = localStorage.getItem(KEY); return LOOKS.includes(v) ? v : null; } catch { return null; }
  };
  const apply = () => {
    const look = chosen || saved() || (system.matches ? 'dark' : 'light');
    root.dataset.theme = look;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) { m.removeAttribute('media'); m.content = BG[look]; }
    for (const b of document.querySelectorAll('[data-look]')) b.setAttribute('aria-pressed', String(b.dataset.look === look));
  };

  apply();
  system.addEventListener('change', apply);
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
