// A calm line of light drifting behind every page, in the look's colours (--flow-a, --flow-b, --flow-c and
// --flow-alpha in site.css, read again when the look changes). It steers toward a goal moving along a slow path that
// never quite repeats: it turns at most 20° a second and never goes slower or faster than a set range, so it draws
// clean arcs and never stops, jerks or spins. It does not react to the pointer (Patrik, 2026-10-26: calm and clean).
//
// A page can keep it beside its content: an element marked data-flow-column (the apps' cards) makes it travel down
// one side and up the other, crossing above and below the window, with a longer trail, whenever there is room beside
// that element. Off with prefers-reduced-motion.
//
// How it is drawn (2026-10-31, smoother and cleaner): soft round lights are stamped along the trail onto a second,
// unseen canvas, where they overlap into one smooth band whose colour and strength follow the trail without steps or
// edges. The line is one stroke through the whole trail, coloured by that band; the band itself, fainter, is the glow
// behind it. The tip follows the moving head every frame, at up to 60 frames a second.

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
if (!reduce.matches) start();

function start() {
  const canvas = Object.assign(document.createElement('canvas'), { className: 'flow' });
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;
  const column = document.querySelector('[data-flow-column]');

  const STEP = 3;             // px between two points of the trail
  const FPS = 60;             // smooth on every screen; a 120 Hz screen draws every other frame
  const MAX_TURN = 0.35;      // radians a second (20°): the sharpest it ever turns
  const TURN_GAIN = 0.8;      // how readily it turns toward its goal (per second, up to MAX_TURN)
  const WIDTH = 2.4;          // the line itself
  const GLOW = 14;            // px: how far the soft light reaches from the line
  const GLOW_ALPHA = 0.3;     // the glow's strength, against the line's
  const SHADES = 48;          // colours from tail to head; neighbouring lights overlap, so they blend without steps
  // Speed range in px a second, a little slower on small screens (38 at most, on a laptop and larger).
  const maxSpeed = () => Math.max(20, Math.min(38, 0.026 * Math.hypot(W, H)));

  // The band the lights add up to: drawn at one pixel per CSS pixel, which is plenty for something this soft.
  const band = document.createElement('canvas');
  const bandCtx = band.getContext('2d');

  // The window, and the room beside the column (null when there is none, or no column).
  let W = 0, H = 0, beside = null;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);     // sharp on 3x iPhones too
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    band.width = W; band.height = H;
    beside = null;
    if (column) {
      const r = column.getBoundingClientRect(), gutter = Math.min(r.left, W - r.right);
      if (gutter >= 90) beside = { left: r.left, right: r.right, gutter };
    }
  }
  const trailMax = () => (beside ? 560 : 300);    // about 1700 px beside a column, 900 px otherwise

  // The look's colours: three stops from the tail to the head, and how strong the line is.
  let stops = [[255, 255, 255], [255, 255, 255], [255, 255, 255]], strength = 0.4;
  const rgb = value => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(value).trim());
    const n = m ? parseInt(m[1], 16) : 0xffffff;
    return [n >> 16, (n >> 8) & 255, n & 255];
  };
  function colorAt(f) {       // f: 0 at the tail, 1 at the head
    const x = f * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), k = x - i;
    return stops[i].map((c, j) => Math.round(c + (stops[i + 1][j] - c) * k));
  }

  // One soft light per shade, side by side on one sheet. Its strength falls off from the middle like a bell.
  const BELL = [[0, 1], [0.2, 0.8], [0.4, 0.45], [0.6, 0.18], [0.8, 0.05], [1, 0]];
  const SIZE = GLOW * 2;
  const sheet = Object.assign(document.createElement('canvas'), { width: SIZE * SHADES, height: SIZE });
  function paintSheet() {
    const s = sheet.getContext('2d');
    s.clearRect(0, 0, sheet.width, sheet.height);
    for (let i = 0; i < SHADES; i++) {
      const [r, g, b] = colorAt(i / (SHADES - 1)), cx = i * SIZE + GLOW;
      const light = s.createRadialGradient(cx, GLOW, 0, cx, GLOW, GLOW);
      for (const [at, a] of BELL) light.addColorStop(at, `rgba(${r},${g},${b},${a})`);
      s.fillStyle = light;
      s.fillRect(i * SIZE, 0, SIZE, SIZE);
    }
  }
  // How many lights' worth overlap in the middle of the band (the bell's area over the spacing). A light's own
  // strength a gives the band about 1 - e^(-a·OVERLAP) in the middle, so -ln(1 - want) / OVERLAP gives the band `want`.
  let area = 0;
  for (let i = 1; i < BELL.length; i++) area += (BELL[i][0] - BELL[i - 1][0]) * (BELL[i][1] + BELL[i - 1][1]) / 2;
  const OVERLAP = (2 * GLOW * area) / STEP;

  function readColors() {
    const cs = getComputedStyle(root);
    stops = ['--flow-a', '--flow-b', '--flow-c'].map(name => rgb(cs.getPropertyValue(name)));
    strength = parseFloat(cs.getPropertyValue('--flow-alpha')) || 0.4;
    paintSheet();
  }

  // Where the head is heading.
  const seed = Math.random() * 1000;
  // Anywhere in the window: sums of slow sine waves at unrelated speeds, so the path never quite repeats.
  function wander(t) {
    const x = 0.5 + 0.30 * Math.sin(0.071 * t + seed) + 0.14 * Math.sin(0.043 * t + seed * 1.7 + 1.3);
    const y = 0.5 + 0.28 * Math.sin(0.057 * t + seed * 0.6 + 2.1) + 0.13 * Math.sin(0.031 * t + seed * 2.3);
    return [x * W, y * H];
  }
  // Around the column: a loop that keeps to the room on either side (the cosine flattened, so it stays out there
  // most of the time) and crosses over beyond the top and bottom of the window. About two minutes per loop.
  function around(t) {
    const { left, right, gutter } = beside, a = 0.05 * t + seed, c = Math.cos(a);
    const x = (left + right) / 2 + ((right - left) / 2 + gutter * 0.5) * Math.sign(c) * Math.abs(c) ** 0.4
      + gutter * 0.16 * Math.sin(0.043 * t + seed);
    const y = H * 0.5 + H * 0.66 * Math.sin(a) + H * 0.04 * Math.sin(0.031 * t + seed);
    return [x, y];
  }
  const goal = t => (beside ? around(t) : wander(t));

  resize();
  readColors();
  addEventListener('resize', resize);
  new MutationObserver(readColors).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  // The head keeps a heading and a speed. Each step it turns toward the goal (never more than MAX_TURN) and eases its
  // speed toward one that suits the distance, kept within the range: no stops, no jumps, no sharp turns.
  let t = 0, head = goal(0), speed = maxSpeed() * 0.5;
  let heading = (([gx, gy]) => Math.atan2(gy - head[1], gx - head[0]))(goal(1));
  const trail = [head.slice()];
  function advance(dt) {
    t += dt;
    const [gx, gy] = goal(t), dx = gx - head[0], dy = gy - head[1], d = Math.hypot(dx, dy);
    let diff = Math.atan2(dy, dx) - heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    heading += Math.max(-MAX_TURN, Math.min(MAX_TURN, diff * TURN_GAIN)) * dt;
    const top = maxSpeed(), target = Math.max(top * 0.37, Math.min(top, d * 0.5));
    speed += (target - speed) * (1 - Math.exp(-dt * 0.5));
    head = [head[0] + Math.cos(heading) * speed * dt, head[1] + Math.sin(heading) * speed * dt];
    const tip = trail[trail.length - 1];
    if (Math.hypot(head[0] - tip[0], head[1] - tip[1]) >= STEP) {
      trail.push(head.slice());
      while (trail.length > trailMax()) trail.shift();
    }
  }
  // Start as if it had been drifting for a while, so the whole line is there from the first frame (it fades in).
  for (let i = 0; i < 90 * FPS; i++) advance(1 / FPS);

  // One light on the band at (x, y): f from 0 at the tail to 1 at the head picks its colour and strength; weight
  // scales it (the light that moves with the head, between the last point and the head).
  function stamp(x, y, f, fadeIn, weight = 1) {
    const want = strength * fadeIn * f ** 1.5;
    if (want < 0.002 || weight <= 0) return;
    bandCtx.globalAlpha = Math.min(1, (-Math.log(1 - Math.min(0.95, want)) / OVERLAP) * weight);
    const shade = Math.round(f * (SHADES - 1));
    bandCtx.drawImage(sheet, shade * SIZE, 0, SIZE, SIZE, x - GLOW, y - GLOW, SIZE, SIZE);
  }

  // Only the box around the trail is drawn each frame (and the box of the frame before cleared), not the whole window.
  let drawn = null;
  function boxAround(n) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const [x, y] = trail[i];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const pad = 2 * GLOW + 2;   // the lights around the trail and just beyond the head, the head's own light
    const left = Math.max(0, Math.floor(Math.min(x0, head[0]) - pad));
    const top = Math.max(0, Math.floor(Math.min(y0, head[1]) - pad));
    const right = Math.min(W, Math.ceil(Math.max(x1, head[0]) + pad));
    const bottom = Math.min(H, Math.ceil(Math.max(y1, head[1]) + pad));
    return [left, top, Math.max(0, right - left), Math.max(0, bottom - top)];
  }

  function draw(now) {
    const n = trail.length;
    if (n < 2) return;
    const fadeIn = Math.min(1, (now - born) / 2500);
    const [hx, hy] = head, [lx, ly] = trail[n - 1];
    const box = boxAround(n), [bx, by, bw, bh] = box;
    for (const [x, y, w, h] of drawn ? [drawn, box] : [[0, 0, W, H]]) {
      bandCtx.clearRect(x, y, w, h);
      ctx.clearRect(x, y, w, h);
    }
    drawn = box;
    if (!bw || !bh) return;

    // The band: a light on every point of the trail, one at the moving head (weighted by how far it is past the last
    // point, so the band grows smoothly instead of jumping a point at a time) and a few just beyond it, so the line is
    // as strong at its tip as behind it.
    for (let i = 0; i < n; i++) stamp(trail[i][0], trail[i][1], i / (n - 1), fadeIn);
    stamp(hx, hy, 1, fadeIn, Math.hypot(hx - lx, hy - ly) / STEP);
    const ux = Math.cos(heading), uy = Math.sin(heading);
    for (let k = 1; k * STEP < GLOW; k++) stamp(hx + ux * STEP * k, hy + uy * STEP * k, 1, fadeIn);
    bandCtx.globalAlpha = 1;

    // The line: one stroke through the trail to the head, then coloured by the band (it keeps the band's colour and
    // strength where the stroke is), then the band behind it as the glow. The clip keeps the compositing to the box.
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = WIDTH;
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(trail[0][0], trail[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(trail[i][0], trail[i][1]);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(band, bx, by, bw, bh, bx, by, bw, bh);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.globalAlpha = GLOW_ALPHA;
    ctx.drawImage(band, bx, by, bw, bh, bx, by, bw, bh);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // A soft light at the head.
    const [r, g, b] = colorAt(1);
    const light = ctx.createRadialGradient(hx, hy, 0, hx, hy, 15);
    light.addColorStop(0, `rgba(${r},${g},${b},${(strength * 0.9 * fadeIn).toFixed(3)})`);
    light.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = light;
    ctx.fillRect(hx - 15, hy - 15, 30, 30);
    ctx.restore();
  }

  let last = performance.now(), lastDraw = 0, running = true;
  const born = last;
  reduce.addEventListener('change', () => { if (reduce.matches) { running = false; canvas.remove(); } });
  function frame(now) {
    if (!running) return;
    advance(Math.min(0.05, (now - last) / 1000));      // after a hidden tab it simply carries on
    last = now;
    // A little slack, so a 60 Hz screen never skips a frame for being a fraction of a millisecond early.
    if (now - lastDraw >= 1000 / FPS - 4) { draw(now); lastDraw = now; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
