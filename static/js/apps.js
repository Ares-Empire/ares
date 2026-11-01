// The apps page (build.py page_apps): the row of small app cards becomes WAI-ARIA tabs, and the chosen app's details
// show below it, one app at a time (the others stay in the page, hidden; site.css stacks them in one place, so the
// page below never jumps when the chosen app changes).
//
// The address names the chosen app: /en/apps/#empire opens with Ares Empire chosen, without scrolling (the details'
// ids are app-<id>). A click or an arrow key replaces the address (history.replaceState), so Back leaves the page
// instead of stepping through apps, and the language switch in the header keeps the chosen app.
// Keys, as the WAI-ARIA tabs pattern has them: Tab into the row lands on the chosen card, Left and Right (and Home,
// End) choose the next one, Tab again goes into its details.
// Without this script the row stays hidden and every app's details show, one below another (html.js, theme.js).

const row = document.querySelector('.app-tabs');
const tabs = row ? [...row.querySelectorAll('.app-tab[data-app]')] : [];
if (tabs.length) setUp();

function setUp() {
  const panelOf = tab => document.getElementById(`app-${tab.dataset.app}`);
  const fromAddress = () => tabs.find(tab => `#${tab.dataset.app}` === location.hash);   // ids are plain ASCII
  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const lang = document.querySelector('.top .lang');
  const langBase = lang ? lang.getAttribute('href').split('#')[0] : null;

  row.setAttribute('role', 'tablist');
  for (const tab of tabs) {
    const panel = panelOf(tab);
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;          // reachable with Tab even when it has no link of its own (the showcase apps)
    tab.addEventListener('click', () => choose(tab, { address: true }));
  }

  // Where the row scrolls sideways (a phone, a narrow window): bring the card fully into view, inside the row only
  // (scrollIntoView would scroll the page too).
  function reveal(tab, behavior) {
    if (row.scrollWidth <= row.clientWidth + 1) return;
    const box = row.getBoundingClientRect(), r = tab.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(row).paddingLeft) || 0;
    if (r.left < box.left + pad) row.scrollBy({ left: r.left - box.left - pad, behavior });
    else if (r.right > box.right - pad) row.scrollBy({ left: r.right - box.right + pad, behavior });
  }

  // address: also write it into the address bar (and the language switch); not when it came from there.
  function choose(tab, { address = false, focus = false, behavior = smooth() } = {}) {
    for (const t of tabs) {
      const on = t === tab;
      t.classList.toggle('is-current', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panelOf(t).classList.toggle('is-current', on);
    }
    if (focus) tab.focus({ preventScroll: true });
    reveal(tab, behavior);
    const hash = `#${tab.dataset.app}`;
    if (address && location.hash !== hash) history.replaceState(history.state, '', hash);
    if (lang && (address || fromAddress())) lang.setAttribute('href', langBase + hash);
  }

  row.addEventListener('keydown', e => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    const next = { ArrowRight: tabs[(i + 1) % tabs.length], ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length],
      Home: tabs[0], End: tabs[tabs.length - 1] }[e.key];
    if (!next) return;           // Enter and Space press the card (a button) and choose it by its click
    e.preventDefault();
    choose(next, { address: true, focus: true });
  });

  // Someone edits the address, or a link on the page points to #<app>.
  addEventListener('hashchange', () => { const tab = fromAddress(); if (tab) choose(tab); });

  choose(fromAddress() || tabs.find(t => t.classList.contains('is-current')) || tabs[0], { behavior: 'auto' });
}

// "Request access" leads to the app's own contact page (aresium.de, www.ares-empire.de), "Try the demo" to its demo;
// both would open in the look remembered there. The links pass this page's look for the visit (?look=light or dark;
// red and gold counts as dark), so they open in the look the visitor came from (appearance.js on those sites; the
// Empire's demo has one look and ignores it; Patrik, 2026-11-01).
const passLook = () => {
  const look = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  for (const link of document.querySelectorAll('a[data-pass-look]')) {
    const url = new URL(link.href);
    url.searchParams.set('look', look);
    link.href = url.href;
  }
};
passLook();
new MutationObserver(passLook).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
