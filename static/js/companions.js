// The companions on this site. The engine is the companions repo itself (vendor/companions, pinned as a git
// submodule and copied to /companions/ by build.py); this file is the host that runs it on a web page, the job
// preview/main.js does for the companions' own preview, plus the "customize us!" menu.
//
// TEMPORARY COPY: running actions (settle, run, runGroup), the frame loop, the director, picking companions up
// and drawPortrait/paintSwatch follow preview/main.js and preview/panel.js of companions 8c14563. They belong in
// the companions repo as one shared host (engine/host.js) used by the preview, this site and AresOS; when that
// exists, this file keeps only the page-specific parts (the bubble and the menu). Until then, keep them in step.
//
// The page marks what companions can stand on: every `.window` element (its top edge; each needs an id), text in
// a `[role=document]` inside one (they sit at the end of a line), and the floor (the bottom of [data-companions]).
// Choices are kept only in this browser (localStorage), and only after the visitor changes something.

import { env, clamp, rand, pick, weighted, Cancelled, frame, startRun } from '/companions/engine/core.js';
import { skinEffects, skinsFor, lookFor, SKINS } from '/companions/engine/skins.js';
import { cast, makeCompanion, morph, drawCompanion, spotPoint, spotScale, scaleOf, applyRest, resetPose, snapShape, setShape, SIZES } from '/companions/engine/companion.js';
import { pace, gatherings } from '/companions/engine/activity.js';
import { initWorld, visibleOn, surfaceBelow, FLOOR, castleLeft } from '/companions/engine/world.js';
import { drawStage, drawStageFront, clearProps } from '/companions/engine/stage.js';
import * as fx from '/companions/engine/particles.js';
import { travelTo, arrive, fallDown, baseOf } from '/companions/engine/travel.js';
import * as acts from '/companions/engine/acts.js';
import * as together from '/companions/engine/together.js';
import { loadDesigns } from '/companions/engine/designs.js';
import { can, attackStyle } from '/companions/engine/catalog.js';
import { applySettings, settingsOf } from '/companions/engine/settings.js';
import { OUTFITS } from '/companions/engine/outfits.js';
import { drawText, textWidth } from '/companions/engine/pixelfont.js';

const scene = document.querySelector('[data-companions]');
const config = JSON.parse(document.getElementById('companions-config')?.textContent || '{}');
const T = config.menu || {};
const GROUP_ORDER = ['Originals', 'Apps', 'Mascots', 'Minecraft'];
const KEY_ON = 'companions.onScreen', KEY_SEEN = 'companions.menuSeen', keyOf = id => `companion.${id}`;
const phone = () => matchMedia('(max-width: 600px)').matches;

// localStorage can be off (private windows, blocked site data): then nothing is remembered.
const store = {
  get(k, d = null) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* not remembered */ } },
  clear() {
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('companion')) localStorage.removeItem(k); } catch { /* nothing to clear */ }
  },
};

const all = {};                    // id -> companion, once its design is loaded
let index = [];                    // every companion id, in the repo's order
let canvas;

// ---------- the companions themselves ----------
function loadSettings(id) {
  try { return JSON.parse(store.get(keyOf(id), '{}')) || {}; } catch { return {}; }
}

// The companions for these ids, loading the designs not loaded yet.
async function ensure(ids) {
  const missing = ids.filter(id => !all[id] && index.includes(id));
  if (missing.length) {
    const designs = await loadDesigns(missing);
    for (const [id, design] of Object.entries(designs)) {
      const me = makeCompanion(design, env.S);
      applySettings(me, loadSettings(id));
      all[id] = me;
    }
  }
  return ids.map(id => all[id]).filter(Boolean);
}

const state = {
  alive: () => true,
  chatOpen: () => false,
  idleFor: () => performance.now() - lastInput,
  wakeUp: me => {
    if (me.wakeRequest) { me.wakeRequest = false; return true; }
    const now = performance.now();
    if (now - lastKey < 500) return true;
    return moves.filter(m => now - m.t < 2000).reduce((sum, m) => sum + m.d, 0) > 600;
  },
};
let lastInput = performance.now(), lastKey = 0, pointer = null;
const moves = [];

// ---------- running actions (as preview/main.js) ----------
function settle(me, snap) {
  if (snap && me.moving && me.dest && spotPoint(me, me.dest)) arrive(me, me.dest);
  me.moving = false; me.dest = null; me.held = false; me.sleeping = false; me.dancing = false;
  clearProps(me); me.chair = me.bed = me.speaker = me.stand = null;
  if ('restoreHead' in me) { me.outfit = { ...me.outfit, head: me.restoreHead }; delete me.restoreHead; }
  if (me.anchor && !spotPoint(me, me.anchor)) me.anchor = null;
  if (snap && !me.anchor && !me.atHome) {
    const below = surfaceBelow(me.x, me.y - 1), g = below.g, s = env.S;
    arrive(me, { ledge: below.ledge, dx: clamp(me.x, g.x1 + 9 * s, Math.max(g.x1 + 9 * s, g.x2 - 9 * s)) - g.x1, rest: 'stand' });
  }
  resetPose(me);
  if (me.anchor) applyRest(me, me.anchor); else setShape(me, 'normal');
  snapShape(me);
  Object.assign(me, { jump: 0, bob: 0, chute: 0, sink: 0, think: false, typing: false, alpha: me.atHome ? 0 : 1 });
  me.pose.stride = 0;
}

const STOP_WAIT = 250;
const stopped = me => Promise.race([me.running, new Promise(r => setTimeout(r, STOP_WAIT))]);

function run(me, action, { snap = true } = {}) {
  const g = startRun(me), before = stopped(me);
  me.idle = false;
  me.running = (async () => {
    await before;
    if (g.n !== me.gen) return;
    settle(me, snap);
    try { await action(g); await acts.aliveLoop(g, state); }
    catch (e) { if (!(e instanceof Cancelled)) console.error(e); }
  })();
}

function runGroup(members, script) {
  const gs = members.map(me => startRun(me)), before = Promise.all(members.map(stopped));
  for (const me of members) me.idle = false;
  const group = (async () => {
    await before;
    if (gs.some((g, i) => g.n !== members[i].gen)) {
      gs.forEach((g, i) => { if (members[i].gen === g.n) run(members[i], async () => {}); });
      return;
    }
    for (const me of members) settle(me, true);
    try { await script(gs); }
    catch (e) { if (!(e instanceof Cancelled)) console.error(e); }
    gs.forEach((g, i) => { if (members[i].gen === g.n) run(members[i], async () => {}); });
  })();
  for (const me of members) me.running = group;
}
const runPair = (A, B, script) => runGroup([A, B], ([gA, gB]) => script(gA, gB));
const free = me => cast.includes(me) && me.idle && !me.sleeping && !me.held && !me.atHome && !me.dancing;

const joinParty = (me, P) => run(me, g => together.danceAlong(g, P));
function startParty(host) {
  run(host, async g => {
    await acts.comeOut(g);
    await together.party(g, P => {
      for (const me of cast) {
        if (me === host || !can(me, 'party.join')) continue;
        if (me.sleeping) me.wakeRequest = true;
        else if (free(me)) joinParty(me, P);
      }
    });
  });
}

acts.hooks.helpNeeded = (mite, victim) => {
  const helpers = cast.filter(me => me !== victim && free(me) && attackStyle(me.design) !== 'flee' && can(me, 'endermite'));
  if (!helpers.length) return false;
  const helper = helpers.reduce((a, b) => (Math.hypot(a.x - mite.x, a.y - mite.y) < Math.hypot(b.x - mite.x, b.y - mite.y) ? a : b));
  run(helper, g => acts.helpFight(g, mite));
  return true;
};
acts.hooks.makeRoom = (players, reach = 22 * env.S) => {
  for (const me of cast) {
    if (players.includes(me) || me.held || me.sleeping) continue;
    if (players.some(p => Math.abs(p.x - me.x) < reach && Math.abs(p.y - me.y) < 10 * env.S)) run(me, g => acts.goNear(g));
  }
};
acts.hooks.playWith = (me, others, script) => {
  if (!others.length || !others.every(free)) return false;
  runGroup([me, ...others], script);
  return true;
};

// ---------- on the page or not ----------
function setOnScreen(me, on, { save = true } = {}) {
  if (on === cast.includes(me)) return;
  if (!on) {
    me.gen++;
    clearProps(me); me.babies.length = 0;
    fx.puff(me.x, me.y - 4 * me.s, me.s);
    cast.splice(cast.indexOf(me), 1);
  } else {
    cast.push(me);
    const spot = acts.chooseSpot(me) || acts.chooseSpot(me, { only: 'floor' })
      || { ledge: FLOOR, dx: rand(20 * env.S, Math.max(21 * env.S, castleLeft() - 20 * env.S)), rest: 'stand' };
    me.anchor = null; me.atHome = false;
    arrive(me, spot); snapShape(me);
    fx.puff(me.x, me.y - 4 * me.s, me.s);
    run(me, async g => { await acts.happyHop(g, 1); });
  }
  if (save) store.set(KEY_ON, JSON.stringify(cast.map(c => c.design.id)));
}

function startingIds() {
  try {
    const saved = JSON.parse(store.get(KEY_ON, 'null'));
    if (Array.isArray(saved)) return saved.filter(id => typeof id === 'string');
  } catch { /* start with the defaults */ }
  const d = config.defaults || {};
  return (phone() ? d.phone : d.desktop) || ['clawd'];
}

// ---------- the frame loop (as preview/main.js) ----------
function follow(me, now) {
  if (!me.anchor || me.moving || me.held || me.atHome) return;
  const pt = spotPoint(me, me.anchor);
  if (!pt) {
    me.anchor = null;
    run(me, g => fallDown(g), { snap: false });
    return;
  }
  me.x = pt.x; me.y = pt.y;
  if (now > (me.nextVis || 0)) {
    me.nextVis = now + 700;
    const off = pt.y < 6 * me.s || pt.y > env.H + 2 || pt.x < 0 || pt.x > env.W;
    if (off || !visibleOn(baseOf(me.anchor), pt.x, pt.y, me.s)) me.lost = true;
  }
}

function gaze(me) {
  me.gaze = null;
  if (!pointer || !me.idle || me.sleeping || me.moving) return;
  const dx = pointer.x - me.x, dy = pointer.y - (me.y - 3 * me.s);
  if (Math.hypot(dx, dy) > 200) return;
  me.gaze = Math.abs(dx) > Math.abs(dy) * 0.8 ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}

function blink(me, now) {
  if (now > (me.nextBlink || 0) + 130) { me.pose.blink = false; me.nextBlink = now + rand(2200, 5200); }
  else if (now > (me.nextBlink || 0)) me.pose.blink = true;
}

function loop(now) {
  for (const me of cast) {
    blink(me, now); morph(me, now); follow(me, now); gaze(me);
    acts.updateBabies(me, now);
    skinEffects(me, now);
  }
  director(now);
  env.ctx.clearRect(0, 0, env.W, env.H);
  drawStage(now);
  for (const me of cast) for (const b of me.babies) drawCompanion(b.c, now);
  for (const me of cast) drawCompanion(me, now);
  drawStageFront(now);
  fx.draw(now);
  bubble.tick(now);
  frame(loop);
}

const playIn = (lo, hi) => performance.now() + rand(lo, hi) * gatherings().wait;
let nextPlay = null;
function director(now) {
  const P = together.partyOn();
  if (P) { for (const me of cast) if (me !== P.host && free(me) && can(me, 'party.join')) joinParty(me, P); return; }
  nextPlay ??= playIn(40000, 70000);
  if (now < nextPlay) return;
  nextPlay = playIn(70000, 120000);
  const games = [], hosts = cast.filter(me => free(me) && can(me, 'party.host'));
  if (hosts.length) games.push({ w: 0.8, go: () => startParty(pick(hosts)) });
  const pairs = cast.flatMap(a => (free(a) && !a.babies.length && can(a, 'basketball.throw')
    ? cast.filter(b => b !== a && free(b) && !b.babies.length && can(b, 'basketball.catch')).map(b => [a, b]) : []));
  if (pairs.length) games.push({ w: 1, go: () => { const [a, b] = pick(pairs); runPair(a, b, together.basketball); } });
  weighted(games, game => game.w)?.go();
}

// ---------- input: they notice you, and can be picked up ----------
const toScene = e => { const b = scene.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };

function hit(pt) {
  for (const me of [...cast].reverse()) {
    const b = me.bbox, pad = 4;
    if (b && me.alpha >= 0.5 && !me.atHome && pt.x >= b.l - pad && pt.x <= b.r + pad && pt.y >= b.t - pad && pt.y <= b.b + pad) return me;
  }
  return null;
}

function listen() {
  document.addEventListener('pointermove', e => {
    const now = performance.now(), p = toScene(e);
    if (pointer) moves.push({ t: now, d: Math.hypot(p.x - pointer.x, p.y - pointer.y) });
    while (moves.length && now - moves[0].t > 2000) moves.shift();
    lastInput = now; pointer = p;
  }, { passive: true });
  document.addEventListener('keydown', () => { lastInput = lastKey = performance.now(); }, { capture: true });
  for (const type of ['wheel', 'pointerdown', 'scroll']) document.addEventListener(type, () => { lastInput = performance.now(); }, { passive: true, capture: true });

  // A companion standing on a button is picked up, not the button: the click after it is swallowed.
  let swallow = 0;
  document.addEventListener('click', e => {
    if (performance.now() < swallow) { e.preventDefault(); e.stopPropagation(); swallow = 0; }
  }, true);
  // On a touch screen, touching a companion holds it instead of scrolling the page.
  scene.addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (t && !e.target.closest?.('.companion-say') && hit(toScene(t))) e.preventDefault();
  }, { passive: false });

  scene.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest?.('.companion-say')) return;
    const pt = toScene(e), me = hit(pt);
    if (!me) return;
    e.preventDefault(); e.stopPropagation();
    swallow = performance.now() + 1500;
    const ptr = { x: pt.x, y: pt.y, down: true };
    let dragging = false;
    scene.setPointerCapture(e.pointerId);
    const move = ev => {
      const q = toScene(ev);
      ptr.x = q.x; ptr.y = q.y;
      if (!dragging && Math.hypot(q.x - pt.x, q.y - pt.y) > 5) { dragging = true; run(me, g => acts.dragged(g, ptr), { snap: false }); }
    };
    const up = () => {
      ptr.down = false;
      scene.removeEventListener('pointermove', move); scene.removeEventListener('pointerup', up); scene.removeEventListener('pointercancel', up);
      if (dragging) return;
      if (me.sleeping) me.wakeRequest = true;
      else run(me, g => acts.clicked(g));
    };
    scene.addEventListener('pointermove', move); scene.addEventListener('pointerup', up); scene.addEventListener('pointercancel', up);
  }, { capture: true });

  for (const opener of document.querySelectorAll('[data-companions-menu]')) opener.addEventListener('click', () => openMenu());
}

// ---------- the canvas follows the page's size ----------
function resize() {
  const S = phone() ? 3 : 4;
  if (S !== env.S) {
    env.S = S;
    for (const me of cast) me.s = me.anchor ? spotScale(me, me.anchor) : scaleOf(me);
  }
  const r = scene.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  env.W = r.width; env.H = r.height;
  canvas.width = Math.round(env.W * dpr); canvas.height = Math.round(env.H * dpr);
  canvas.style.width = env.W + 'px'; canvas.style.height = env.H + 'px';
  env.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  env.ctx.imageSmoothingEnabled = false;
}

// ---------- "Customize us!" ----------
// A speech bubble over one companion's head, as an HTML button (clickable, focusable, read out) drawn in the
// engine's own pixel font and bubble colors. It shows a few seconds after the page opens, then now and then.
const bubble = (() => {
  const INK = '#1E1E24', EDGE = '#3A3A44', FILL = '#FFFFE1', PAD = 3, TAIL = 3;
  let button = null, me = null, until = 0, next = performance.now() + 2600, w = 0, h = 0;

  function make() {
    button = Object.assign(document.createElement('button'), { type: 'button', className: 'companion-say', hidden: true });
    button.setAttribute('aria-label', T.say || 'Customize us!');
    const c = document.createElement('canvas');
    button.append(c);
    button.addEventListener('click', () => openMenu());
    scene.append(button);
    draw(c);
  }

  function draw(c) {
    const text = (T.say || 'Customize us!').toUpperCase(), u = 2, dpr = window.devicePixelRatio || 1;
    const bw = textWidth(text) + 2 * PAD, bh = 5 + 2 * PAD;
    w = bw * u; h = (bh + TAIL) * u;
    c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
    const rect = (x, y, cw, ch, color) => { ctx.fillStyle = color; ctx.fillRect(x * u, y * u, cw * u, ch * u); };
    rect(1, 0, bw - 2, 1, EDGE); rect(1, bh - 1, bw - 2, 1, EDGE); rect(0, 1, 1, bh - 2, EDGE); rect(bw - 1, 1, 1, bh - 2, EDGE);
    rect(1, 1, bw - 2, bh - 2, FILL);
    const mid = Math.floor(bw / 2) - 1;             // the tail, pointing down at the speaker
    for (let k = 0; k < TAIL; k++) { const n = 4 - k; rect(mid, bh - 1 + k, n, 1, FILL); rect(mid, bh - 1 + k, 1, 1, EDGE); rect(mid + n - 1, bh - 1 + k, 1, 1, EDGE); }
    rect(mid, bh - 1 + TAIL, 1, 1, EDGE);
    drawText(ctx, text, PAD * u, PAD * u, u, INK);
  }

  // Where the bubble would be over this companion's head, in the scene's coordinates.
  function placeFor(c) {
    const b = c.bbox;
    if (!b) return null;
    const l = clamp((b.l + b.r) / 2 - w / 2, 4, Math.max(4, env.W - w - 4)), t = Math.max(4, b.t - h - 4);
    return { l, t, r: l + w, b: t + h };
  }
  // The bubble covers nothing of the page: no heading, text or tile.
  function clear(place) {
    const s = scene.getBoundingClientRect();
    return ![...scene.querySelectorAll('h1, h2, p, .tile')].some(el => {
      const q = el.getBoundingClientRect(), l = q.left - s.left, t = q.top - s.top;
      return place.l < l + q.width && place.r > l && place.t < t + q.height && place.b > t;
    });
  }
  // Someone free, not sitting on a line of text, whose bubble would cover nothing.
  function speaker() {
    const ok = c => c && free(c) && c.anchor?.ledge?.kind !== 'text' && placeFor(c) && clear(placeFor(c));
    return (config.defaults?.speakers || []).map(id => all[id]).find(ok) || cast.find(ok) || null;
  }

  function show(now) {
    me = speaker();
    if (!me) { next = now + 4000; return; }
    until = now + 8000;
    button.hidden = false;
    run(me, g => acts.wave(g));
    next = now + (store.get(KEY_SEEN) ? rand(240000, 360000) : rand(70000, 110000));
  }

  function hide() { until = 0; me = null; if (button) button.hidden = true; }

  function tick(now) {
    if (!button) return;
    if (until && (now > until || !cast.includes(me) || me.sleeping || me.atHome)) hide();
    if (!until && now > next && !document.querySelector('dialog.cm[open]')) show(now);
    if (!until || !me) return;
    const place = placeFor(me);
    if (!place) return;
    button.style.left = place.l + 'px';
    button.style.top = place.t + 'px';
  }

  return { make, hide, tick };
})();

// ---------- the menu ----------
const label = {
  skin: (design, key) => T.skins?.[key] || design.skins?.[key]?.label || SKINS[key]?.label || key,
  outfit: (slot, key) => T.outfits?.[key] || OUTFITS[slot]?.[key] || key,
  size: key => T.sizes?.[key] || SIZES[key] || key,
  group: g => T.groups?.[g] || g,
};

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(c => c !== null && c !== undefined && c !== false));
  return node;
}

// A companion drawn still into a canvas, as big as fits, standing on its bottom edge (preview/panel.js).
function drawPortrait(c, me) {
  const d = me.design, art = d.body.art;
  const W = (art?.[0].length ?? 12) + 6, H = (art?.length ?? 5) + (d.body.legs?.length ?? 1) + 6;
  const s = Math.max(1, Math.floor(Math.min(c.width / W, c.height / H)));
  const p = makeCompanion(d, s);
  Object.assign(p, { look: me.look, outfit: { ...me.outfit }, x: c.width / 2, y: c.height - 2 * s });
  const ctx = c.getContext('2d'), keep = env.ctx;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = false;
  env.ctx = ctx;
  try { drawCompanion(p, performance.now()); } finally { env.ctx = keep; }
}
const portrait = (me, size) => { const c = el('canvas', { width: size, height: size }); drawPortrait(c, me); return c; };

// A round swatch for a skin: its color, a pie of the companion's own colors, or a picture for a moving skin (panel.js).
function paintSwatch(node, look) {
  if (look.fx) { node.classList.add(look.fx); return node; }
  if (look.skinColor) { node.style.background = look.skinColor; return node; }
  const top = look.shares.slice(0, 4), total = top.reduce((sum, [, share]) => sum + share, 0);
  let at = 0;
  node.style.background = top.length === 1 ? top[0][0]
    : `conic-gradient(${top.map(([color, share]) => `${color} ${at}deg ${(at += (share / total) * 360)}deg`).join(', ')})`;
  return node;
}

let menu = null, chosen = null, everyoneLoaded = null;

function change(me, edit) {
  const s = settingsOf(me);
  edit(s);
  applySettings(me, s);
  store.set(keyOf(me.design.id), JSON.stringify(settingsOf(me)));
  renderMenu();
}

function buildMenu() {
  const dialog = el('dialog', { className: 'cm' });
  dialog.setAttribute('aria-labelledby', 'cm-title');
  const close = el('button', { type: 'button', className: 'cm-x', textContent: '✕' });
  close.setAttribute('aria-label', T.close || 'Close');
  close.addEventListener('click', () => dialog.close());
  const reset = el('button', { type: 'button', className: 'btn', textContent: T.reset || 'Start over' });
  reset.addEventListener('click', startOver);
  const remove = el('button', { type: 'button', className: 'btn cm-remove', textContent: T.remove || 'Remove' });
  remove.addEventListener('click', () => { if (chosen) { setOnScreen(chosen, false); chosen = cast[0] || null; renderMenu(); } });
  const repo = config.repo ? el('a', { href: config.repo, rel: 'noopener', target: '_blank', textContent: T.repo || 'GitHub' }) : null;
  const parts = {
    here: el('div', { className: 'cm-here' }),
    empty: el('p', { className: 'cm-empty', textContent: T.none || '' }),
    looksTitle: el('h3', { className: 'eyebrow' }),
    looks: el('div', {}),
    looksSection: null,
    groups: el('div', {}, el('p', { className: 'cm-empty', textContent: T.loading || '' })),
    remove,
  };
  parts.looksSection = el('section', { className: 'cm-section' }, parts.looksTitle, parts.looks, remove);
  dialog.append(
    el('div', { className: 'cm-head' }, el('h2', { id: 'cm-title', textContent: T.title || 'Companions' }), close),
    el('div', { className: 'cm-body' },
      el('p', { className: 'cm-intro', textContent: T.intro || '' }),
      el('section', { className: 'cm-section' }, el('h3', { className: 'eyebrow', textContent: T.here || '' }), parts.here, parts.empty),
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
  if (!menu) return;
  const { parts } = menu;
  if (chosen && !cast.includes(chosen)) chosen = null;
  chosen ??= cast[0] || null;

  parts.here.replaceChildren(...cast.map(me => {
    const b = el('button', { type: 'button', className: 'cm-chip' }, portrait(me, 52), me.design.name);
    b.setAttribute('aria-pressed', String(me === chosen));
    b.addEventListener('click', () => { chosen = me; renderMenu(); });
    return b;
  }));
  parts.empty.hidden = cast.length > 0;
  parts.looksSection.hidden = !chosen;

  if (chosen) {
    const me = chosen, d = me.design;
    parts.looksTitle.textContent = `${T.looks || 'Looks'} · ${d.name}`;
    const option = (text, on, pickIt) => {
      const b = el('button', { type: 'button', className: 'cm-opt', textContent: text });
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', pickIt);
      return b;
    };
    const rows = [];
    const swatches = skinsFor(d).map(key => {
      const b = paintSwatch(el('button', { type: 'button', className: 'cm-swatch', title: label.skin(d, key) }), lookFor(d, key));
      b.setAttribute('aria-label', label.skin(d, key));
      b.setAttribute('aria-pressed', String(me.look.key === key));
      b.addEventListener('click', () => change(me, s => { s.skin = key; }));
      return b;
    });
    rows.push(el('div', { className: 'cm-row' }, el('span', { textContent: T.skin || 'Skin' }), el('div', { className: 'cm-opts' }, ...swatches)));
    const current = settingsOf(me);
    for (const slot of ['head', 'body']) {
      if (!(d.outfits || []).includes(slot)) continue;
      const opts = Object.keys(OUTFITS[slot]).map(key => option(label.outfit(slot, key), current.outfit[slot] === key,
        () => change(me, s => { s.outfit = { ...s.outfit, [slot]: key }; })));
      rows.push(el('div', { className: 'cm-row' }, el('span', { textContent: T[slot] || slot }), el('div', { className: 'cm-opts' }, ...opts)));
    }
    const sizes = Object.keys(SIZES).map(Number).sort((a, b) => a - b).map(key => option(label.size(key), (me.size || 0) === key,
      () => change(me, s => { s.size = key; })));
    rows.push(el('div', { className: 'cm-row' }, el('span', { textContent: T.size || 'Size' }), el('div', { className: 'cm-opts' }, ...sizes)));
    parts.looks.replaceChildren(...rows);
  }

  if (everyoneLoaded === true) {
    const companions = index.map(id => all[id]).filter(Boolean);
    const groups = [...new Set(companions.map(me => me.design.group || 'Others'))]
      .sort((a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99));
    parts.groups.replaceChildren(...groups.map(group => el('div', { className: 'cm-group' },
      el('h4', { textContent: label.group(group) }),
      el('div', { className: 'cm-grid' }, ...companions.filter(me => (me.design.group || 'Others') === group).map(me => {
        const on = cast.includes(me);
        const tile = el('button', { type: 'button', className: 'cm-tile', title: me.design.about || '' }, portrait(me, 104), me.design.name);
        tile.setAttribute('aria-pressed', String(on));
        tile.addEventListener('click', () => {
          setOnScreen(me, !cast.includes(me));
          if (cast.includes(me)) chosen = me;
          renderMenu();
        });
        return tile;
      })))));
  } else if (everyoneLoaded === false) {
    parts.groups.replaceChildren(el('p', { className: 'cm-empty', textContent: T.failed || '' }));
  }
}

function openMenu() {
  bubble.hide();
  store.set(KEY_SEEN, '1');
  menu ??= buildMenu();
  if (!menu.dialog.open) menu.dialog.showModal();
  renderMenu();
  if (everyoneLoaded === null) {
    everyoneLoaded = 'loading';
    ensure(index).then(() => { everyoneLoaded = true; }, e => { console.error(e); everyoneLoaded = false; }).then(renderMenu);
  }
}

function startOver() {
  store.clear();
  for (const me of [...cast]) setOnScreen(me, false, { save: false });
  for (const me of Object.values(all)) applySettings(me, {});
  const d = config.defaults || {};
  ensure((phone() ? d.phone : d.desktop) || ['clawd']).then(list => {
    for (const me of list) setOnScreen(me, true, { save: false });
    chosen = null;
    renderMenu();
  });
}

// ---------- start ----------
// Surfaces higher up the page are stacked above the ones below (inline z-index, which the engine reads as window
// order): world.js counts a spot as hidden when a window stacked above overlaps it, so a companion never stands where
// it would cover what is above it (the tiles stacked close together on a phone). The canvas stays above them all.
function stackSurfaces() {
  const surfaces = [...scene.querySelectorAll('.window')];
  surfaces.forEach((el, i) => { el.style.zIndex = String(surfaces.length - i); });
}

async function start() {
  canvas = Object.assign(document.createElement('canvas'), { className: 'companions-stage' });
  canvas.setAttribute('aria-hidden', 'true');
  scene.append(canvas);
  env.ctx = canvas.getContext('2d');
  stackSurfaces();
  initWorld(scene);
  resize();
  new ResizeObserver(resize).observe(scene);
  addEventListener('resize', resize);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { pace.activity = 'background'; pace.gatherings = 'never'; }

  const res = await fetch('/companions/companions/index.json');
  if (!res.ok) throw new Error(`index.json: ${res.status}`);
  index = await res.json();
  const first = await ensure(startingIds());
  listen();
  bubble.make();
  frame(loop);
  first.forEach((me, i) => setTimeout(() => setOnScreen(me, true, { save: false }), 300 + i * 450));
}

if (scene) start().catch(e => console.error('companions:', e));
