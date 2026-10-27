// The companions on the home page. They are the Companions website embed (vendor/companions/web, built by build.py
// into /companions/companions.min.js, whose tag comes just before this file): it draws them, finds their places on
// the page, lets visitors pick them up and keeps their choices in this browser. This file only uses its API,
// window.Companions (vendor/companions/web/README.md): it starts them with the site's defaults (content/site.json)
// and adds the site's own parts, the "Customize us!" bubble and the translated menu. No engine code here.

const config = JSON.parse(document.getElementById('companions-config')?.textContent || '{}');
const T = config.menu || {};
const defaults = config.defaults || {};
const C = window.Companions;
const KEY_SEEN = 'companions.menuSeen';      // the menu was opened once: the bubble asks less often
const MOTIONS = ['moving', 'still', 'hidden'];

// localStorage can be off (private windows, blocked site data): then nothing is remembered.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* not remembered */ } },
};
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// Until 2026-10 this site ran its own copy of the engine, which kept each companion's looks under companion.<id>.
// The embed reads the same settings from companions.companion.<id> (who is on the page, companions.onScreen, kept its
// key), so they move over once, before the embed starts.
function carryOver() {
  try {
    for (const key of Object.keys(localStorage)) {
      const id = /^companion\.(.+)$/.exec(key)?.[1];
      if (!id) continue;
      if (localStorage.getItem(`companions.companion.${id}`) === null) localStorage.setItem(`companions.companion.${id}`, localStorage.getItem(key));
      localStorage.removeItem(key);
    }
  } catch { /* site data blocked: nothing was kept */ }
}

let running = false;     // between the embed's start and destroy (reset() does both)
let failed = false;      // the embed is missing or could not start
let moving = false;      // the visitor's Motion choice is Moving (reduced motion starts Still)

// ---------- "Customize us!" ----------
// A speech bubble over one companion's head, as an HTML button (clickable, focusable, read out), drawn by the embed in
// the companions' pixel font. It shows a few seconds after the page opens, then now and then, only while they move.
// It never covers a line of text, a tile or the header's and footer's controls: it hides when it would.
const bubble = (() => {
  const BOXES = '.tile, .brand, .looks, .lang, .foot a, .foot button';   // covered anywhere in their box
  const HOP = 16;              // its pose changes a little while it waves: a new bubble needs this much more room above
  let button = null, size = null, regions = [], speaker = null, until = 0, next = null;

  function make() {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'companion-say';
    button.hidden = button.inert = true;
    button.setAttribute('aria-label', T.say || 'Customize us!');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    button.append(canvas);
    button.addEventListener('click', () => openMenu());
    document.body.append(button);
    size = C.drawBubble(canvas, T.say || 'Customize us!');
  }

  // Over a companion's head (its region has 4 px around it), the tail pointing down at it, inside the window. A new
  // speaker needs room above it (null without); one already speaking keeps it at the top edge while it hops.
  function placeFor(r, { fits = true } = {}) {
    const width = document.documentElement.clientWidth;
    const l = Math.max(4, Math.min(r.x + r.width / 2 - size.width / 2, width - size.width - 4)), t = r.y + 4 - size.height;
    if (fits && t < 4) return null;
    return { l, t: Math.max(4, t), r: l + size.width, b: Math.max(4, t) + size.height };
  }
  // The page's text line by line (a heading's or paragraph's box is often much wider than its words), and the boxes.
  function obstacles() {
    const rects = [...document.querySelectorAll(BOXES)].map(el => el.getBoundingClientRect());
    const main = document.querySelector('main'), range = document.createRange();
    if (!main) return rects;
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      range.selectNodeContents(node);
      rects.push(...range.getClientRects());
    }
    return rects;
  }
  const covers = (place, above = 0) => obstacles().some(q =>
    q.width > 0 && place.l < q.right && place.r > q.left && place.t - above < q.bottom && place.b > q.top);
  const placeOf = (id, options) => { const r = regions.find(x => x.id === id); return r ? placeFor(r, options) : null; };
  function put(place) { button.style.left = place.l + 'px'; button.style.top = place.t + 'px'; }

  // The site's speakers first, then anyone on the page: the first free one whose bubble covers nothing waves.
  function show(now) {
    for (const id of new Set([...(defaults.speakers || []), ...regions.map(r => r.id)])) {
      const place = placeOf(id);
      if (!place || place.t - HOP < 4 || covers(place, HOP) || !C.wave(id)) continue;
      speaker = id; until = now + 8000;
      put(place);
      button.hidden = button.inert = false;
      next = now + (store.get(KEY_SEEN) ? rand(240000, 360000) : rand(70000, 110000));
      return;
    }
    next = now + 4000;
  }

  function hide() {
    speaker = null;
    if (button) button.hidden = button.inert = true;
  }

  function tick(now) {
    next ??= now + 2600;
    if (speaker) {
      const place = placeOf(speaker, { fits: false });
      if (now > until || !moving || !place || covers(place)) hide(); else put(place);
    } else if (moving && now > next && !menu?.dialog.open) show(now);
  }

  return {
    start() { if (!button) make(); next = null; hide(); },
    hide, tick,
    setRegions(list) { regions = list; },
  };
})();

// ---------- the menu ----------
const label = {
  skin: skin => T.skins?.[skin.key] || skin.label,
  outfit: outfit => T.outfits?.[outfit.key] || outfit.label,
  size: size => T.sizes?.[size.step] || size.label,
  group: group => T.groups?.[group] || group,
};

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(c => c !== null && c !== undefined && c !== false));
  return node;
}

// A button that keeps keyboard focus when the menu is drawn again: `key` names it across renders.
function button(key, className, onClick, ...children) {
  const b = el('button', { type: 'button', className }, ...children);
  b.dataset.key = key;
  b.addEventListener('click', onClick);
  return b;
}
const pressed = (node, on) => { node.setAttribute('aria-pressed', String(on)); return node; };

// Drawn at twice its CSS size (site.css), still, in its current looks.
function portrait(id, size) {
  const c = el('canvas', { width: size, height: size });
  C.drawPortrait(c, id);
  return c;
}

let menu = null, chosen = null;

function buildMenu() {
  const dialog = el('dialog', { className: 'cm' });
  dialog.setAttribute('aria-labelledby', 'cm-title');
  const close = el('button', { type: 'button', className: 'cm-x', textContent: '✕' });
  close.setAttribute('aria-label', T.close || 'Close');
  close.addEventListener('click', () => dialog.close());
  const reset = el('button', { type: 'button', className: 'btn', textContent: T.reset || 'Start over' });
  reset.addEventListener('click', startOver);
  const remove = el('button', { type: 'button', className: 'btn cm-remove', textContent: T.remove || 'Remove' });
  remove.addEventListener('click', () => { if (running && chosen) C.setOnScreen(chosen, false); });
  const repo = config.repo ? el('a', { href: config.repo, rel: 'noopener', target: '_blank', textContent: T.repo || 'GitHub' }) : null;
  const parts = {
    here: el('div', { className: 'cm-here' }),
    empty: el('p', { className: 'cm-empty', textContent: T.none || '' }),
    motion: el('div', { className: 'cm-row' }),
    looksTitle: el('h3', { className: 'eyebrow' }),
    looks: el('div', {}),
    looksSection: null,
    groups: el('div', {}),
  };
  parts.looksSection = el('section', { className: 'cm-section' }, parts.looksTitle, parts.looks, remove);
  dialog.append(
    el('div', { className: 'cm-head' }, el('h2', { id: 'cm-title', textContent: T.title || 'Companions' }), close),
    el('div', { className: 'cm-body' },
      el('p', { className: 'cm-intro', textContent: T.intro || '' }),
      el('section', { className: 'cm-section' }, el('h3', { className: 'eyebrow', textContent: T.here || '' }), parts.here, parts.empty, parts.motion),
      parts.looksSection,
      el('section', { className: 'cm-section' }, el('h3', { className: 'eyebrow', textContent: T.add || '' }), parts.groups),
      el('div', { className: 'cm-foot' }, el('p', {}, T.footer || '', repo ? ' ' : '', repo), reset)),
  );
  // A click on the dimmed page beside the sheet closes it.
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  return { dialog, parts };
}

function renderMenu() {
  if (!menu?.dialog.open) return;
  const { parts } = menu;
  const focused = menu.dialog.contains(document.activeElement) ? document.activeElement.dataset?.key : null;

  if (!running) {             // still starting, or it could not
    parts.here.replaceChildren();
    parts.empty.hidden = parts.motion.hidden = parts.looksSection.hidden = true;
    parts.groups.replaceChildren(el('p', { className: 'cm-empty', textContent: (failed ? T.failed : T.loading) || '' }));
    return;
  }
  const designs = C.designs(), nameOf = id => designs.find(d => d.id === id)?.name || id;
  const { companions: here, motion } = C.getOptions();
  if (!here.includes(chosen)) chosen = here[0] ?? null;

  parts.here.replaceChildren(...here.map(id => pressed(
    button(`here:${id}`, 'cm-chip', () => { chosen = id; renderMenu(); }, portrait(id, 52), nameOf(id)), id === chosen)));
  parts.empty.hidden = here.length > 0;

  const motions = MOTIONS.map(m => pressed(button(`motion:${m}`, 'cm-opt', () => C.setOptions({ motion: m }), T.motion?.[m] || m), m === motion));
  parts.motion.hidden = false;
  parts.motion.replaceChildren(el('span', { textContent: T.motion?.label || 'Motion' }), el('div', { className: 'cm-opts' }, ...motions),
    el('p', { className: 'cm-hint', textContent: T.motion?.hints?.[motion] || '' }));

  parts.looksSection.hidden = !chosen;
  if (chosen) {
    const id = chosen, current = C.getCompanion(id);
    parts.looksTitle.textContent = `${T.looks || 'Looks'} · ${nameOf(id)}`;
    const row = (title, ...options) => el('div', { className: 'cm-row' }, el('span', { textContent: title }), el('div', { className: 'cm-opts' }, ...options));
    const option = (key, text, on, pick) => pressed(button(key, 'cm-opt', pick, text), on);
    const rows = [row(T.skin || 'Skin', ...C.skins(id).map(skin => {
      const b = pressed(button(`skin:${skin.key}`, 'cm-swatch', () => C.setCompanion(id, { skin: skin.key })), current.skin === skin.key);
      b.title = label.skin(skin);
      b.setAttribute('aria-label', label.skin(skin));
      b.style.background = skin.swatch;
      return b;
    }))];
    for (const [slot, outfits] of Object.entries(C.outfits(id))) {
      rows.push(row(T[slot] || slot, ...outfits.map(o => option(`${slot}:${o.key}`, label.outfit(o), current.outfit[slot] === o.key,
        () => C.setCompanion(id, { outfit: { ...current.outfit, [slot]: o.key } })))));
    }
    rows.push(row(T.size || 'Size', ...C.sizes().map(s => option(`size:${s.step}`, label.size(s), (current.size || 0) === s.step,
      () => C.setCompanion(id, { size: s.step })))));
    parts.looks.replaceChildren(...rows);
  }

  parts.groups.replaceChildren(...C.groups().map(group => el('div', { className: 'cm-group' },
    el('h4', { textContent: label.group(group) }),
    el('div', { className: 'cm-grid' }, ...designs.filter(d => d.group === group).map(d => {
      const tile = pressed(button(`add:${d.id}`, 'cm-tile', () => {
        if (!d.onScreen) chosen = d.id;
        C.setOnScreen(d.id, !d.onScreen);
      }, portrait(d.id, 104), d.name), d.onScreen);
      tile.title = d.about;
      return tile;
    })))));

  if (focused) menu.dialog.querySelector(`[data-key="${CSS.escape(focused)}"]`)?.focus();
}

function openMenu() {
  bubble.hide();
  store.set(KEY_SEEN, '1');
  menu ??= buildMenu();
  if (!menu.dialog.open) menu.dialog.showModal();
  renderMenu();
}

// Forgets every choice (the embed's and the menu's) and starts again with the site's defaults. The button stays
// enabled (disabling it would drop the keyboard's focus); a second press while it runs does nothing.
let resetting = false;
async function startOver() {
  if (!running || resetting) return;
  resetting = true;
  chosen = null;
  try { await C.reset(); } catch (e) { failed = true; console.error('companions:', e); }
  resetting = false;
  renderMenu();
}

// ---------- start ----------
for (const opener of document.querySelectorAll('[data-companions-menu]')) opener.addEventListener('click', () => openMenu());

if (!C) {
  failed = true;
  console.error('companions: the companions script did not load.');
} else {
  C.on('start', () => {
    running = true; failed = false;
    moving = C.getOptions().motion === 'moving';
    bubble.start();
    renderMenu();
  });
  C.on('destroy', () => { running = false; bubble.hide(); });
  C.on('change', change => {
    if (change.type === 'options') moving = C.getOptions().motion === 'moving';
    renderMenu();
  });
  C.on('hitRegions', list => bubble.setRegions(list));
  C.on('frame', now => bubble.tick(now));
  carryOver();
  C.start({ companions: defaults.desktop, phone: { companions: defaults.phone } }).catch(e => {
    failed = true;
    console.error('companions:', e);
    renderMenu();
  });
}
